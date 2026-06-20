//! Usage aggregation over Claude Code session JSONL records. Pure logic; the
//! file IO (scanning `~/.claude/projects/<slug>/*.jsonl`) lives in the command
//! layer. Token totals are exposed as `f64` so the TS contract stays `number`.

use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Bucketing granularity for the usage timeline.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Granularity {
    Day,
    Week,
    Month,
}

/// One usage data point extracted from a session record.
#[derive(Debug, Clone)]
pub struct UsageRecord {
    pub timestamp: String,
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
}

impl UsageRecord {
    fn total(&self) -> u64 {
        self.input + self.output + self.cache_read + self.cache_creation
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct UsageBucket {
    /// Period label: `YYYY-MM-DD` (day), `YYYY-Www` (week), or `YYYY-MM` (month).
    pub period: String,
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_creation: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct ModelUsage {
    pub model: String,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct UsageResult {
    pub buckets: Vec<UsageBucket>,
    pub models: Vec<ModelUsage>,
    pub total: f64,
    pub sessions: u32,
}

/// Extract a usage record from one parsed JSONL line, or `None` if it carries no
/// token usage (e.g. summary/user records).
pub fn extract_record(value: &Value) -> Option<UsageRecord> {
    let message = value.get("message")?;
    let usage = message.get("usage")?;
    let timestamp = value.get("timestamp").and_then(Value::as_str)?.to_string();
    let model = message
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let field = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
    let record = UsageRecord {
        timestamp,
        model,
        input: field("input_tokens"),
        output: field("output_tokens"),
        cache_read: field("cache_read_input_tokens"),
        cache_creation: field("cache_creation_input_tokens"),
    };
    if record.total() == 0 {
        None
    } else {
        Some(record)
    }
}

fn bucket_key(timestamp: &str, granularity: Granularity) -> String {
    let date = timestamp.get(0..10).unwrap_or(timestamp);
    match granularity {
        Granularity::Day => date.to_string(),
        Granularity::Month => date.get(0..7).unwrap_or(date).to_string(),
        Granularity::Week => match NaiveDate::parse_from_str(date, "%Y-%m-%d") {
            Ok(d) => {
                let w = d.iso_week();
                format!("{}-W{:02}", w.year(), w.week())
            }
            Err(_) => date.to_string(),
        },
    }
}

/// Aggregate records into timeline buckets (sorted by period) and a per-model
/// breakdown (sorted by total desc). `sessions` is supplied by the caller.
pub fn aggregate(records: &[UsageRecord], granularity: Granularity, sessions: u32) -> UsageResult {
    use std::collections::BTreeMap;
    let mut buckets: BTreeMap<String, [u64; 4]> = BTreeMap::new();
    let mut models: BTreeMap<String, u64> = BTreeMap::new();

    for r in records {
        let e = buckets.entry(bucket_key(&r.timestamp, granularity)).or_default();
        e[0] += r.input;
        e[1] += r.output;
        e[2] += r.cache_read;
        e[3] += r.cache_creation;
        *models.entry(r.model.clone()).or_default() += r.total();
    }

    let bucket_vec: Vec<UsageBucket> = buckets
        .into_iter()
        .map(|(period, [i, o, cr, cc])| UsageBucket {
            period,
            input: i as f64,
            output: o as f64,
            cache_read: cr as f64,
            cache_creation: cc as f64,
            total: (i + o + cr + cc) as f64,
        })
        .collect();

    let mut model_vec: Vec<ModelUsage> = models
        .into_iter()
        .map(|(model, total)| ModelUsage {
            model,
            total: total as f64,
        })
        .collect();
    model_vec.sort_by(|a, b| b.total.partial_cmp(&a.total).unwrap_or(std::cmp::Ordering::Equal));

    let total = model_vec.iter().map(|m| m.total).sum();
    UsageResult {
        buckets: bucket_vec,
        models: model_vec,
        total,
        sessions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(ts: &str, model: &str, input: u64, output: u64) -> UsageRecord {
        UsageRecord {
            timestamp: ts.to_string(),
            model: model.to_string(),
            input,
            output,
            cache_read: 0,
            cache_creation: 0,
        }
    }

    #[test]
    fn extract_skips_records_without_usage() {
        let summary: Value = serde_json::from_str(r#"{"type":"summary","timestamp":"x"}"#).unwrap();
        assert!(extract_record(&summary).is_none());

        let msg: Value = serde_json::from_str(
            r#"{"timestamp":"2026-06-19T10:00:00Z","message":{"model":"m","usage":{"input_tokens":5,"output_tokens":7}}}"#,
        )
        .unwrap();
        let r = extract_record(&msg).unwrap();
        assert_eq!(r.input, 5);
        assert_eq!(r.output, 7);
        assert_eq!(r.model, "m");
    }

    #[test]
    fn buckets_by_day_and_month() {
        let records = vec![
            rec("2026-06-19T10:00:00Z", "a", 10, 1),
            rec("2026-06-19T12:00:00Z", "a", 20, 2),
            rec("2026-07-01T09:00:00Z", "b", 100, 0),
        ];
        let day = aggregate(&records, Granularity::Day, 3);
        assert_eq!(day.buckets.len(), 2);
        assert_eq!(day.buckets[0].period, "2026-06-19");
        assert_eq!(day.buckets[0].total, 33.0); // 10+1+20+2

        let month = aggregate(&records, Granularity::Month, 3);
        assert_eq!(month.buckets.len(), 2);
        assert_eq!(month.buckets[0].period, "2026-06");
    }

    #[test]
    fn week_bucket_uses_iso_week() {
        let records = vec![rec("2026-06-19T10:00:00Z", "a", 1, 1)];
        let wk = aggregate(&records, Granularity::Week, 1);
        assert!(wk.buckets[0].period.contains("-W"));
    }

    #[test]
    fn models_sorted_by_total_desc() {
        let records = vec![
            rec("2026-06-19T10:00:00Z", "small", 1, 1),
            rec("2026-06-19T10:00:00Z", "big", 100, 100),
        ];
        let r = aggregate(&records, Granularity::Day, 1);
        assert_eq!(r.models[0].model, "big");
        assert_eq!(r.total, 202.0);
    }
}
