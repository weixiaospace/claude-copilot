//! Minimal YAML-frontmatter splitting for markdown config files.

use serde_yaml::Value;

/// Split leading YAML frontmatter (`---` … `---`) from a markdown document.
/// Returns the parsed frontmatter (`Value::Null` when absent or invalid) and
/// the remaining body.
pub fn split(content: &str) -> (Value, &str) {
    let rest = match content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))
    {
        Some(rest) => rest,
        None => return (Value::Null, content),
    };

    match split_at_closing(rest) {
        Some((yaml, body)) => (
            serde_yaml::from_str::<Value>(yaml).unwrap_or(Value::Null),
            body,
        ),
        None => (Value::Null, content),
    }
}

/// Find the closing `---` line, returning (yaml-between, body-after).
fn split_at_closing(rest: &str) -> Option<(&str, &str)> {
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return Some((&rest[..offset], &rest[offset + line.len()..]));
        }
        offset += line.len();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_fields_and_body() {
        let (fm, body) = split("---\nname: foo\ndescription: bar\n---\n# Title\ntext\n");
        assert_eq!(fm.get("name").and_then(Value::as_str), Some("foo"));
        assert_eq!(fm.get("description").and_then(Value::as_str), Some("bar"));
        assert_eq!(body, "# Title\ntext\n");
    }

    #[test]
    fn no_frontmatter_returns_null_and_full_body() {
        let (fm, body) = split("# Just markdown\n");
        assert!(fm.is_null());
        assert_eq!(body, "# Just markdown\n");
    }

    #[test]
    fn unterminated_frontmatter_is_not_consumed() {
        let input = "---\nname: foo\nno closing here\n";
        let (fm, body) = split(input);
        assert!(fm.is_null());
        assert_eq!(body, input);
    }
}
