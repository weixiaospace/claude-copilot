#!/usr/bin/env node
// Sync a version across package.json / tauri.conf.json / Cargo.toml / Cargo.lock.
// Usage: node scripts/sync-version.mjs <version>
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version ?? "")) {
  console.error(`Invalid version: ${version} (expected e.g. 0.2.0)`);
  process.exit(2);
}
function patch(rel, fn) {
  const path = resolve(root, rel);
  writeFileSync(path, fn(readFileSync(path, "utf8")));
  console.log(`✓ ${rel} → ${version}`);
}
const jsonVersion = (t) => t.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
patch("package.json", jsonVersion);
patch("src-tauri/tauri.conf.json", jsonVersion);
patch("src-tauri/Cargo.toml", (t) => t.replace(/^version = "[^"]*"/m, `version = "${version}"`));
// Cargo.lock lives at the workspace root (this is a Cargo workspace).
patch("Cargo.lock", (t) =>
  t.replace(/(name = "claude-copilot-desktop"\nversion = )"[^"]*"/, `$1"${version}"`),
);
