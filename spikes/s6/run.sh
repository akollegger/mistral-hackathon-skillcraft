#!/bin/sh
# S6 — end-to-end architecture walkthrough: teacher -> skill -> cold students.
# Throwaway spike; delete after verdict. Reuses the S2 torch world (server.mjs).
# Measures: full-mechanic timing, skill harvest + frontmatter validation, the
#  wo student conditions (none vs skill), and trace formats the harness will parse.
# NOTE (post-S4/S5): craft MCP registration is USER-scoped (only kind vibe has).
# Harness pattern under test: register BEFORE the batch, remove immediately AFTER,
# accept the leak window only while experiment runs are executing. No relate serve.
# Run:  sh spikes/s6/run.sh
set -u
S6_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S6_DIR/s6-raw.log"
SCRATCH="$S6_DIR/scratch"
SERVER="$S6_DIR/server.mjs"
OUT="$SCRATCH/teacher/skill-output"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
echo "S6 walkthrough — $(date -u +%FT%TZ)" | tee -a "$LOG"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
node --version | tee -a "$LOG"
vibe --version 2>&1 | tee -a "$LOG"

step "1. register craft MCP (user-scope; the only kind — see S4). Registered BEFORE batch."
vibe mcp remove skillcraft-s6 >>"$LOG" 2>&1 || true
vibe mcp add skillcraft-s6 --transport stdio --command node --arg "$SERVER" 2>&1 | tee -a "$LOG"
echo "mcp add exit=$?" | tee -a "$LOG"

step "2. TEACHER: solve the challenge, then write the skill"
mkdir -p "$SCRATCH/teacher"
start=$(date +%s)
vibe --prompt-file "$S6_DIR/teacher-prompt.md" --workdir "$SCRATCH/teacher" \
  --trust --approval-policy auto-approve --output json --output-dir "$SCRATCH/teacher" \
  --time-limit 300 --max-turns 25 >>"$LOG" 2>&1 < /dev/null
tcode=$?
echo "teacher exit=$tcode elapsed=$(( $(date +%s) - start ))s" | tee -a "$LOG"

step "3. HARVEST: locate SKILL.md, validate frontmatter, copy into fresh cold dir"
SKILLFILE=$(find "$SCRATCH/teacher" -name "SKILL.md" -not -path "*/session/*" 2>/dev/null | head -1)
echo "harvested: ${SKILLFILE:-NOT FOUND}" | tee -a "$LOG"
[ -z "$SKILLFILE" ] && { echo "ABORT: no skill written" | tee -a "$LOG"; exit 1; }
# frontmatter check: line 1 must be exactly ---
if [ "$(sed -n '1p' "$SKILLFILE")" = "---" ]; then
  echo "frontmatter: PRESENT" | tee -a "$LOG"
else
  echo "frontmatter: MISSING (would be REJECTED by harness; teacher prompt has a gap)" | tee -a "$LOG"
fi
grep -c "^name:\|^description:" "$SKILLFILE" | tee -a "$LOG"
mkdir -p "$SCRATCH/student-skill/.agents/skills/craft-torch"
cp "$SKILLFILE" "$SCRATCH/student-skill/.agents/skills/craft-torch/SKILL.md"
echo "--- skill head ---" | tee -a "$LOG"; sed -n '1,15p' "$SKILLFILE" | tee -a "$LOG"

step "4. STUDENT none-condition (cold, no skill dir)"
mkdir -p "$SCRATCH/student-none"
start=$(date +%s)
vibe --prompt-file "$S6_DIR/student-prompt-none.md" --workdir "$SCRATCH/student-none" \
  --trust --approval-policy auto-approve --output json --output-dir "$SCRATCH/student-none" \
  --time-limit 240 --max-turns 25 >>"$LOG" 2>&1 < /dev/null
echo "student-none exit=$? elapsed=$(( $(date +%s) - start ))s" | tee -a "$LOG"

step "5. STUDENT skill-condition (cold dir with harvested skill)"
start=$(date +%s)
vibe --prompt-file "$S6_DIR/student-prompt-skill.md" --workdir "$SCRATCH/student-skill" \
  --trust --approval-policy auto-approve --output json --output-dir "$SCRATCH/student-skill" \
  --time-limit 240 --max-turns 25 >>"$LOG" 2>&1 < /dev/null
echo "student-skill exit=$? elapsed=$(( $(date +%s) - start ))s" | tee -a "$LOG"

step "6. ANALYSIS (the greps the harness event-parser will automate)"
for run in teacher student-none student-skill; do
  E="$SCRATCH/$run/export.json"
  echo "--- $run ---" | tee -a "$LOG"
  [ -f "$E" ] || { echo "no export.json" | tee -a "$LOG"; continue; }
  echo "crafted torch: $(grep -o 'minecraft:torch' "$E" | head -1)" | tee -a "$LOG"
  echo "craft tool calls: $(grep -o '"toolName": "craft"' "$E" | wc -l | tr -d ' ')" | tee -a "$LOG"
  echo "place tool calls: $(grep -o '"toolName": "place"' "$E" | wc -l | tr -d ' ')" | tee -a "$LOG"
  echo "errors (isError/craftable false): $(grep -o 'is not craftable\|"error"' "$E" | wc -l | tr -d ' ')" | tee -a "$LOG"
  echo "skill.read effects: $(grep -o '"kind": "skill"' "$E" | wc -l | tr -d ' ')" | tee -a "$LOG"
  echo "file hunts on SKILL.md: $(grep -o 'read_file[^)]*SKILL.md' "$E" | wc -l | tr -d ' ')" | tee -a "$LOG"
  sed -n '1,6p' "$E" | tee -a "$LOG"   # run meta shape: sessionId, usage, cost
done

step "7. cleanup: unregister MCP immediately AFTER the batch"
vibe mcp remove skillcraft-s6 >>"$LOG" 2>&1
echo "mcp remove exit=$?" | tee -a "$LOG"
echo | tee -a "$LOG"
echo "VERDICT RULES:" | tee -a "$LOG"
echo "  PASS = teacher crafts torch AND writes SKILL.md with frontmatter;" | tee -a "$LOG"
echo "         both students run headless with clean exits; craft-tool effects parse;" | tee -a "$LOG"
echo "         skill-condition run shows skill.read effect; full pipeline time recorded." | tee -a "$LOG"
echo "  Note the phenomenon signal (toy task, n=1 each): student-skill tool calls < student-none." | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
