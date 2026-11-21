#!/bin/sh
# S1 — vibe one-shot spawn probe. Throwaway spike; delete after verdict.
# Version 4: targets installed vibe 3.1.4 (Rust CLI). Flags verified from
# cli-rust/src/cli.rs source: -p/--prompt, --prompt-file, --workdir, --trust,
# --approval-policy auto-approve, --output json, --output-dir (export.json+session/),
# --time-limit, --max-turns, --model.
# Run:  sh spikes/s1/run.sh
set -u
S1_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$S1_DIR/s1-raw.log"
SCRATCH="$S1_DIR/scratch"
: > "$LOG"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$LOG"; }
echo "S1 probe v4 (vibe 3.1.4) — $(date -u +%FT%TZ)" | tee -a "$LOG"

step "1. version"
vibe --version >>"$LOG" 2>&1; echo "exit=$?" | tee -a "$LOG"

try() { # try <label> <command...>
  label="$1"; shift
  dir="$SCRATCH/$label"
  rm -rf "$dir"; mkdir -p "$dir"
  step "candidate: $label"
  start=$(date +%s)
  ( cd "$dir" && exec "$@" >>"$LOG" 2>&1 < /dev/null ) &
  pid=$!
  wait "$pid"; code=$?
  end=$(date +%s)
  echo "exit=$code elapsed=$((end-start))s" | tee -a "$LOG"
  if [ -f "$dir/hello.md" ]; then
    echo "RESULT: hello.md created:" | tee -a "$LOG"; cat "$dir/hello.md" | tee -a "$LOG"
  else
    echo "RESULT: no hello.md" | tee -a "$LOG"
  fi
}

mkdir -p "$SCRATCH"

# Canonical 3.1.4 headless spawn: the exact form the harness will use per run.
# Budget from the CLI itself (--time-limit); watchdog unnecessary.
try "canonical" vibe --prompt-file "$S1_DIR/prompt.md" \
  --workdir "$SCRATCH/canonical" \
  --trust --approval-policy auto-approve \
  --output json --output-dir "$SCRATCH/canonical" \
  --time-limit 120 --max-turns 10

step "3. artifact survey"
echo "--- canonical run dir ---" | tee -a "$LOG"
find "$SCRATCH/canonical" -maxdepth 2 | tee -a "$LOG"
echo "--- export.json (first 60 lines) ---" | tee -a "$LOG"
sed -n '1,60p' "$SCRATCH/canonical/export.json" 2>&1 | tee -a "$LOG"
step "4. risk notes"
echo "Expected: exit=0, hello.md=created, export.json fields: version/config/usage/cost/stop_reason/outcome" | tee -a "$LOG"
echo "Log saved: $LOG" | tee -a "$LOG"
