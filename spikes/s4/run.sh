#!/bin/sh
# S4 — Relate MCP into Vibe, ANALYSIS AGENTS ONLY. Throwaway spike; delete after verdict.
# ORDER MATTERS (anti-cheat, see docs/harness-protocol.md):
#   checkpoint 1 = learn `vibe mcp add` scope semantics + prove NO leak into
#                 sibling student-like dirs, BEFORE trusting any agent-side use.
#   checkpoint 2 = agent-side Cypher query roundtrip in the analysis workspace.
# All server surfaces: loopback only, --safe, --auth. Sibling dirs spawn bare.
# Run:  sh spikes/s4/run.sh
set -u
S4_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S4_DIR/s4-raw.log"
SCRATCH="$S4_DIR/scratch"
HTTP_PORT=7474
MCP_PORT=7475
AUTH="s4:s4token"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
echo "S4 probe — $(date -u +%FT%TZ)" | tee -a "$LOG"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH/analysis-store"

step "0. preflight: CLI versions; capture vibe mcp --help into a SIDE file (not inline)"
vibe --version 2>&1 | tee -a "$LOG"
relate --version 2>&1 | tee -a "$LOG"
vibe mcp --help >"$S4_DIR/vibe-mcp-help.txt" 2>&1 || true
vibe mcp add --help >"$S4_DIR/vibe-mcp-add-help.txt" 2>&1 || true
echo "help captured to vibe-mcp-help.txt / vibe-mcp-add-help.txt (grep for scope flags)" | tee -a "$LOG"
grep -i "scope\|project\|user\|local" "$S4_DIR/vibe-mcp-add-help.txt" 2>/dev/null | head -10 | tee -a "$LOG" || true

step "1. start relate serve: loopback, shared analysis store, --safe --auth"
relate serve --database "$SCRATCH/analysis-store" \
  --host 127.0.0.1 --http "$HTTP_PORT" --mcp "$MCP_PORT" --safe --auth "$AUTH" \
  >"$SCRATCH/serve-start.log" 2>&1 &
SERVE_PID=$!
echo "serve pid=$SERVE_PID" | tee -a "$LOG"
# wait for the HTTP discovery surface to answer (max ~20s)
ok=""
for i in $(seq 1 20); do
  if curl -s -u "$AUTH" "http://127.0.0.1:$HTTP_PORT/" >/dev/null 2>&1; then ok="yes"; break; fi
  sleep 1
done
echo "http discovery reachable: ${ok:-NO}" | tee -a "$LOG"
cat "$SCRATCH/serve-start.log" | tee -a "$LOG"

step "2. CHECKPOINT 1a: register relate-shared MCP inside the analysis workspace"
ANALYSIS_WS="$SCRATCH/analysis-ws"
mkdir -p "$ANALYSIS_WS"
# seat the registration inside the workspace dir; add --scope project IF such a flag exists
SCOPE_FLAG=""
grep -q -- "--scope" "$S4_DIR/vibe-mcp-add-help.txt" 2>/dev/null && SCOPE_FLAG="--scope project"
( cd "$ANALYSIS_WS" && vibe mcp add relate-shared \
    --url "http://127.0.0.1:$MCP_PORT/mcp" $SCOPE_FLAG ) >>"$LOG" 2>&1
echo "mcp add exit=$? (scope flag used: ${SCOPE_FLAG:-none found})" | tee -a "$LOG"
echo "--- where did the config land? (workspace tree, then ~/.vibe mcp files) ---" | tee -a "$LOG"
( cd "$SCRATCH" && find . -type f \( -name "*.json" -o -name "*.toml" \) -newer "$S4_DIR/run.sh" 2>/dev/null ) | tee -a "$LOG"
find "$HOME/.vibe" -maxdepth 2 -name "*.json" -newer "$S4_DIR/run.sh" 2>/dev/null | tee -a "$LOG"
echo "NOTE: if this lists anything under ~/.vibe, the add was USER-scoped -> anti-cheat violation, fix before S4 use." | tee -a "$LOG"

step "3. CHECKPOINT 1b: leak probe — bare sibling dir must NOT see relate"
STUDENT="$SCRATCH/student-like"
mkdir -p "$STUDENT"
cat >"$STUDENT/tools-prompt.md" <<'EOF'
List every tool and every skill that is available to you in this session, as a plain
markdown checklist. Do not use any tool. Do not search the filesystem. Answer only
from what you know is available on your machine (including any MCP servers).
EOF
vibe --prompt-file "$STUDENT/tools-prompt.md" --workdir "$STUDENT" --trust \
  --approval-policy auto-approve --output json --output-dir "$STUDENT" \
  --time-limit 90 --max-turns 4 >>"$LOG" 2>&1 < /dev/null
echo "student spawn exit=$?" | tee -a "$LOG"
echo "leak count (mentions of relate/cypher in student output): $(grep -c -i 'relate\|cypher' "$STUDENT/export.json" 2>/dev/null || echo 0)" | tee -a "$LOG"

step "4. CHECKPOINT 2: agent-side Cypher roundtrip from the analysis workspace"
cat >"$ANALYSIS_WS/query-prompt.md" <<'EOF'
Use the relate-shared MCP server to run this Cypher against the graph:
  CREATE (t:Task {taskId: 's4-probe', tier: 'invented'})
  RETURN t.taskId AS created
Then run: MATCH (n) RETURN count(n) AS nodes
Report both results as plain JSON.
EOF
vibe --prompt-file "$ANALYSIS_WS/query-prompt.md" --workdir "$ANALYSIS_WS" --trust \
  --approval-policy auto-approve --output json --output-dir "$ANALYSIS_WS" \
  --time-limit 120 --max-turns 10 >>"$LOG" 2>&1 < /dev/null
echo "analysis spawn exit=$?" | tee -a "$LOG"
echo "--- relate tool effects in analysis run ---" | tee -a "$LOG"
grep -o "relate[^\"]*cypher[^\"]*" "$ANALYSIS_WS/export.json" 2>/dev/null | head -5 | tee -a "$LOG" || \
  grep -io "mcp[^ ]*relate[a-z-]*" "$ANALYSIS_WS/export.json" 2>/dev/null | head -5 | tee -a "$LOG"

step "5. cleanup: remove MCP registration, stop serve, verify port closed"
( cd "$ANALYSIS_WS" && vibe mcp remove relate-shared ) >>"$LOG" 2>&1 || \
  grep -l "relate-shared" "$SCRATCH"/* -r 2>/dev/null | tee -a "$LOG"
kill "$SERVE_PID" 2>/dev/null; sleep 1
curl -s -m 2 "http://127.0.0.1:$HTTP_PORT/" >/dev/null 2>&1 && echo "WARN: port still open" | tee -a "$LOG" \
  || echo "http port closed OK" | tee -a "$LOG"
echo "--- leftover registration artifacts under SCRATCH? ---" | tee -a "$LOG"
grep -rl "relate-shared" "$SCRATCH" 2>/dev/null | grep -v "export.json\|session\|serve-start" | tee -a "$LOG"

echo | tee -a "$LOG"
echo "VERDICT RULES:" | tee -a "$LOG"
echo "  1 PASS = config lands workspace-local (no ~/.vibe touch); student-like dir shows 0 relate mentions." | tee -a "$LOG"
echo "  3 PASS = analysis agent's effects include relate toolName + correct Cypher results (s4-probe created, count>=1)." | tee -a "$LOG"
echo "  FAIL-scope = config in ~/.vibe or leak count >0: relatedb stays harness-side only, S4 usage forbidden." | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
