#!/bin/sh
# S2 — tool protocol probe. Throwaway spike; delete after verdict.
# Questions:
#   1. Can a headless vibe run discover + drive our stdio MCP craft tools?
#   2. Does world state persist across tool calls within one session?
#   3. Where and how are tool calls recorded (session/journal) — the trace format
#      that contracts/event-log.ts must parse?
# Run:  sh spikes/s2/run.sh     — review s2-raw.log, fill s2-notes.md
set -u
S2_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S2_DIR/s2-raw.log"
SCRATCH="$S2_DIR/scratch"
SERVER="$S2_DIR/server.mjs"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
echo "S2 probe — $(date -u +%FT%TZ)" | tee -a "$LOG"

command -v node >/dev/null 2>&1 || { echo "node not found on PATH" | tee -a "$LOG"; exit 1; }
node --version | tee -a "$LOG"

step "0. sanity: MCP server roundtrip (initialize + tools/list) without vibe"
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"s2-sanity","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node "$SERVER" | tee -a "$LOG"

step "1. register MCP server with vibe"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
vibe mcp remove skillcraft-s2 >>"$LOG" 2>&1 || true
vibe mcp add skillcraft-s2 --transport stdio --command node --arg "$SERVER" 2>&1 | tee -a "$LOG"
echo "exit=$?" | tee -a "$LOG"

step "2. headless run driving the craft tools"
start=$(date +%s)
vibe --prompt-file "$S2_DIR/prompt.md" \
  --workdir "$SCRATCH" \
  --trust --approval-policy auto-approve \
  --output json --output-dir "$SCRATCH" \
  --time-limit 240 --max-turns 20 \
  >>"$LOG" 2>&1 < /dev/null
code=$?
end=$(date +%s)
echo "exit=$code elapsed=$((end-start))s" | tee -a "$LOG"

step "3. tool-call trace survey (session journal = events source)"
find "$SCRATCH/session" -maxdepth 2 | tee -a "$LOG"
echo "--- grep for tool calls in journal ---" | tee -a "$LOG"
grep -rl "place\|craft" "$SCRATCH/session" 2>/dev/null | tee -a "$LOG"
echo "--- first match, 40 lines of context where tool calls appear ---" | tee -a "$LOG"
matchfile=$(grep -rl '"place"\|tool_call\|tools/call' "$SCRATCH/session" 2>/dev/null | head -1)
[ -n "$matchfile" ] && sed -n '1,40p' "$matchfile" | tee -a "$LOG" || echo "(no match file)" | tee -a "$LOG"
echo "--- export.json head ---" | tee -a "$LOG"
sed -n '1,12p' "$SCRATCH/export.json" 2>&1 | tee -a "$LOG"

step "4. cleanup"
vibe mcp remove skillcraft-s2 >>"$LOG" 2>&1; echo "mcp removed, exit=$?" | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
