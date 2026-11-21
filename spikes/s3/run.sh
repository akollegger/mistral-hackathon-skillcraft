#!/bin/sh
# S3 — Relate from TypeScript/Node probe. Throwaway spike; delete after verdict.
# PRIMARY PATH: @relate/relate first-party npm client, in-process (no server).
# FALLBACK PATH (probed cheaply): HTTP Query API v2 / Bolt via `relate serve`.
# Run:  sh spikes/s3/run.sh
set -u
S3_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S3_DIR/s3-raw.log"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
cd "$S3_DIR" || exit 1
echo "S3 probe — $(date -u +%FT%TZ)" | tee -a "$LOG"

step "1. relate CLI present? (informational — the spike itself is pure Node)"
command -v relate >/dev/null 2>&1 && relate --version 2>&1 | tee -a "$LOG" \
  || echo "relate CLI not installed (optional for this spike)" | tee -a "$LOG"

step "2. install first-party Node client (local to this throwaway dir)"
node --version | tee -a "$LOG"
npm install --no-fund --no-audit 2>&1 | tail -3 | tee -a "$LOG"

step "3. in-process probe: lineage shape + 4 judge-facing eval queries"
node probe.mjs 2>&1 | tee -a "$LOG"
code=$?
echo "probe exit=$code" | tee -a "$LOG"

step "4. fallback surface: capture `relate serve --help` (no live probe — S4 covers MCP path)"
relate serve --help 2>&1 | head -25 | tee -a "$LOG" || true

step "5. persist check: reopen the store and count nodes"
node -e '
const { Database } = require("@relate/relate");
const db = Database.open("./scratch/lineage");
const r = db.connect().query("MATCH (n) RETURN count(n) AS nodes");
console.log("nodes after reopen:", JSON.stringify(r.rows));
' 2>&1 | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
