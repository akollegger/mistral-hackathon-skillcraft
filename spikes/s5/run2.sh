#!/bin/sh
# S5b — follow-up: valid-frontmatter dir-local skill; auto-load vs file-hunt.
# Question: with proper SKILL.md frontmatter, does a cold headless run get the skill
# content WITHOUT file reads (true inject), or does it still hunt (discover+read)?
# Also dumps the ambient run's context-breakdown to settle contamination.
# Run:  sh spikes/s5/run2.sh
set -u
S5_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S5_DIR/s5-raw2.log"
SCRATCH="$S5_DIR/scratch"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
echo "S5b probe — $(date -u +%FT%TZ)" | tee -a "$LOG"

step "1. ambient context-breakdown (from S5 run, already on disk)"
python3 - "$SCRATCH/ambient/session/context-breakdown.json" <<'EOF' 2>&1 | tee -a "$LOG" || \
  cat "$SCRATCH/ambient/session/context-breakdown.json" 2>&1 | tee -a "$LOG"
import json, sys
d = json.load(open(sys.argv[1]))
found = []
def walk(x, path=""):
    if isinstance(x, dict):
        for k, v in x.items():
            if "skill" in str(k).lower() or "skill" in str(v)[:60].lower():
                found.append((path + "/" + k, str(v)[:160]))
            walk(v, path + "/" + k)
    elif isinstance(x, list):
        for i, v in enumerate(x):
            walk(v, path)
walk(d)
print("skill-related entries:", len(found))
for k, v in found[:12]:
    print(f"  {k} = {v}")
EOF

step "2. injection with VALID frontmatter (skill file now has name/description/version)"
rm -rf "$SCRATCH/student2"; mkdir -p "$SCRATCH/student2/.agents/skills/distill-probe"
cp "$S5_DIR/skill-writing.md" "$SCRATCH/student2/.agents/skills/distill-probe/SKILL.md"
vibe -p "What is the secret academic password? Reply with only the password." \
  --workdir "$SCRATCH/student2" --trust --approval-policy auto-approve \
  --output json --output-dir "$SCRATCH/student2" --time-limit 90 --max-turns 6 \
  >>"$LOG" 2>&1 < /dev/null
echo "exit=$?" | tee -a "$LOG"

step "3. analysis: file reads on the run, and the answer"
echo "--- did it file-hunt? (file_read effects on SKILL.md or .agents) ---" | tee -a "$LOG"
grep -o "file_system.read_file" "$LOG" | wc -l | tee -a "$LOG"
grep -c "SKILL.md" "$SCRATCH/student2/session/journal/"*.jsonl 2>/dev/null | tee -a "$LOG"
echo "--- final answer: grep wisteria-cobra in this log ---" | tee -a "$LOG"
grep -o "wisteria-cobra" "$LOG" | head -3 | tee -a "$LOG"
echo "--- usage ---" | tee -a "$LOG"
sed -n '1,10p' "$SCRATCH/student2/export.json" 2>&1 | tee -a "$LOG"
echo
echo "VERDICT RULE: 0 file reads + wisteria-cobra answer = TRUE AUTO-LOAD." | tee -a "$LOG"
echo "              file reads + answer = discover-and-read (hint-skill condition)." | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
