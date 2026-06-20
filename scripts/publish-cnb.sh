#!/usr/bin/env bash
# Publish the built update packages to CNB Release and generate latest.json
# (pointing at CNB public download links), pushed back to CNB main.
# Deps: curl jq git; env: CNB_TOKEN (CNB access token, repo-code:rw)
# Usage: CNB_TOKEN=xxx scripts/publish-cnb.sh <tag> <artifacts-dir>
set -euo pipefail

TAG="${1:?usage: publish-cnb.sh <tag> <artifacts-dir>}"
DIR="${2:?missing artifacts dir}"
: "${CNB_TOKEN:?need env CNB_TOKEN}"

REPO="weixiao.space/claude-copilot"
API="https://api.cnb.cool/$REPO"
DL="https://cnb.cool/$REPO/-/releases/download/$TAG"
VERSION="${TAG#v}"
AUTH=(-H "Authorization: Bearer $CNB_TOKEN" -H "Accept: application/json")

mac_targz=$(cd "$DIR" && ls | grep -E '\.app\.tar\.gz$' | head -1)
win_exe=$(cd "$DIR" && ls | grep -E -- '-setup\.exe$' | head -1)
[[ -n "$mac_targz" && -n "$win_exe" ]] || { echo "missing mac .app.tar.gz or win -setup.exe artifact" >&2; exit 1; }

echo "→ create CNB Release $TAG"
rid=$(curl -fsS -X POST "$API/-/releases" "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "$(jq -n --arg t "$TAG" '{tag_name:$t,target_commitish:"main",name:$t,body:$t,draft:false,make_latest:"true"}')" \
  | jq -r '.id')
[[ -n "$rid" && "$rid" != "null" ]] || { echo "failed to create release (tag already exists?)" >&2; exit 1; }

upload() {  # request upload url → PUT → verify
  local file="$1" name="$2" sz resp up vr
  sz=$(wc -c < "$file" | tr -d ' ')
  echo "→ upload $name ($sz B)"
  resp=$(curl -fsS -X POST "$API/-/releases/$rid/asset-upload-url" "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "$(jq -n --arg n "$name" --argjson s "$sz" '{asset_name:$n,size:$s,overwrite:true}')")
  up=$(echo "$resp" | jq -r '.upload_url'); vr=$(echo "$resp" | jq -r '.verify_url')
  curl -fsS -X PUT -T "$file" "$up" -o /dev/null
  curl -fsS -X POST "$vr" "${AUTH[@]}" -o /dev/null
}

upload "$DIR/$mac_targz" "$mac_targz"
upload "$DIR/$win_exe" "$win_exe"
mac_dmg=$(cd "$DIR" && ls | grep -E '\.dmg$' | head -1 || true)
[[ -n "$mac_dmg" ]] && upload "$DIR/$mac_dmg" "$mac_dmg"

echo "→ generate latest.json (CNB direct links)"
jq -n \
  --arg version "$VERSION" --arg notes "$TAG" --arg pub "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --rawfile msig "$DIR/$mac_targz.sig" --arg murl "$DL/$mac_targz" \
  --rawfile wsig "$DIR/$win_exe.sig" --arg wurl "$DL/$win_exe" \
  '{version:$version, notes:$notes, pub_date:$pub, platforms:{
     "darwin-aarch64":{signature:($msig|rtrimstr("\n")),url:$murl},
     "windows-x86_64":{signature:($wsig|rtrimstr("\n")),url:$wurl}}}' > /tmp/latest.json
cat /tmp/latest.json

echo "→ push latest.json to CNB main"
tmp=$(mktemp -d)
# Clone `main` explicitly — the repo's default branch may be something else,
# and we must commit the manifest onto main (where the updater endpoint reads).
git clone --depth 1 --branch main "https://cnb:${CNB_TOKEN}@cnb.cool/$REPO.git" "$tmp/repo"
mkdir -p "$tmp/repo/.updater"; cp /tmp/latest.json "$tmp/repo/.updater/latest.json"
git -C "$tmp/repo" config user.name "release-bot"
git -C "$tmp/repo" config user.email "release-bot@users.noreply.cnb.cool"
git -C "$tmp/repo" add .updater/latest.json
if git -C "$tmp/repo" diff --cached --quiet; then echo "manifest unchanged"; else
  git -C "$tmp/repo" commit -m "chore(updater): release $TAG"
  git -C "$tmp/repo" push origin HEAD:main
fi
echo "✓ published: $DL/{$mac_targz,$win_exe}"
