#!/bin/sh
# S5 — skill install-path + ambient-load + dir-local injection probe.
# Merged spike: (a) what `relate update`/`skill install` wrote for vibe,
# (b) do ambient skills load into bare headless runs (experiment contamination),
# (c) can a fresh run-dir carry its own skill (THE distillation mechanism)?
# Run:  sh spikes/s5/run.sh
set -u
S5_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S5_DIR/s5-raw.log"
SCRATCH="$S5_DIR/scratch"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
echo "S5 probe — $(date -u +%FT%TZ)" | tee -a "$LOG"
mkdir -p "$SCRATCH"

step "1. survey: what landed for which agents"
ls -la ~/.vibe/skills 2>&1 | tee -a "$LOG"
echo "--- ~/.agents/skills ---" | tee -a "$LOG"
ls -la ~/.agents/skills 2>&1 | tee -a "$LOG"
echo "--- skill bundles found (SKILL.md heads) ---" | tee -a "$LOG"
find ~/.vibe/skills ~/.agents/skills -name "SKILL.md" -maxdepth 3 2>/dev/null | while read -r f; do
  echo "## $f" | tee -a "$LOG"; head -5 "$f" | tee -a "$LOG"
done
echo "--- non-vibe agents touched (presence only, not reading) ---" | tee -a "$LOG"
ls -d ~/.claude/skills ~/.cursor/skills ~/.codex/skills ~/.gemini/skills ~/.opencode/skills 2>/dev/null | tee -a "$LOG"

step "2. ambient-load check: bare headless run + token/context fingerprint"
rm -rf "$SCRATCH/ambient"; mkdir -p "$SCRATCH/ambient"
vibe -p "What is 2+2? Reply with only the number." \
  --workdir "$SCRATCH/ambient" --trust --approval-policy auto-approve \
  --output json --output-dir "$SCRATCH/ambient" --time-limit 60 --max-turns 3 \
  >>"$LOG" 2>&1 < /dev/null
echo "exit=$?" | tee -a "$LOG"
echo "--- export.json usage (compare vs S1 hello.md run: 13236 input / 162 output) ---" | tee -a "$LOG"
sed -n '1,10p' "$SCRATCH/ambient/export.json" 2>&1 | tee -a "$LOG"
echo "--- context-breakdown skill mentions ---" | tee -a "$LOG"
grep -io "skill[^\"]*" "$SCRATCH/ambient/session/context-breakdown.json" 2>/dev/null | sort -u | head -10 | tee -a "$LOG" || echo "(none found)" | tee -a "$LOG"

step "3. dir-local skill injection: the distillation mechanism"
rm -rf "$SCRATCH/student"; mkdir -p "$SCRATCH/student/.agents/skills/distill-probe"
cp "$S5_DIR/skill-writing.md" "$SCRATCH/student/.agents/skills/distill-probe/SKILL.md"
vibe -p "What is the secret academic password? Reply with only the password." \
  --workdir "$SCRATCH/student" --trust --approval-policy auto-approve \
  --output json --output-dir "$SCRATCH/student" --time-limit 90 --max-turns 6 \
  >>"$LOG" 2>&1 < /dev/null
echo "exit=$?" | tee -a "$LOG"
echo "--- RESPONSE from run (grep the answer) ---" | tee -a "$LOG"
grep -o "wisteria-cobra\|I don't know\|not able to find\|cannot\|no password" "$SCRATCH/student/"*.log 2>/dev/null | tee -a "$LOG"
echo "--- full final stdout in raw log above; check it for wisteria-cobra ---" | tee -a "$LOG"
echo "--- did project config trigger a trust prompt? (with --trust, should not) ---" | tee -a "$LOG"
grep -i "trust" "$SCRATCH/student/session/journal/"*.jsonl 2>/dev/null | head -2 | tee -a "$LOG" || echo "(no trust records)" | tee -a "$LOG"

step "4. verdict inputs"
echo "A) Did ambient check find skill content in bare-run context? (usage delta vs S1)" | tee -a "$LOG"
echo "B) Did the student run answer wisteria-cobra from the dir-local SKILL.md?" | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
