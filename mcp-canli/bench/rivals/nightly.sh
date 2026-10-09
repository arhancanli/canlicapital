#!/bin/zsh
# Finishes the benchmark inside OpenAI's free daily data-sharing allowance (2.5M tokens a day on
# mini models, reset 00:00 UTC): each night from 00:10 UTC it runs the queue in priority order
# until 2.0M tokens are used (BUDGET_TOKENS) or the account refuses ("no credits remaining"), then
# waits for the next night. Stops when the queue is done or after 7 nights. Detached:
#   nohup ./nightly.sh > nightly.log 2>&1 & disown        (stop: pkill -f nightly.sh)
cd "${0:A:h}"
export BUDGET_TOKENS=2000000 BUDGET_FILE="$PWD/.budget-tonight"
run() {  # set arm out; returns 0 when the job's runs are all done
  echo "JOB set=${1:-original} arm=$2 $(date -u +%FT%TZ)"
  SET="$1" OUT="./$3" node run.mjs gpt-5.4-mini 2 "$2" | grep -E "^(ARM|BUDGET_REACHED|OUT_OF_CREDIT|RUN_DONE)" ; return ${pipestatus[1]}
}
for night in 1 2 3 4 5 6 7; do
  target=$(date -u -j -f "%Y-%m-%d %H:%M:%S" "$(date -u -v+1d +%Y-%m-%d) 00:10:00" +%s)
  echo "NIGHT $night: waiting until $(date -u -r $target +%FT%TZ)"
  sleep $(( target - $(date -u +%s) ))
  echo 0 > "$BUDGET_FILE"
  stopped=0
  for job in "fresh|canli-final|fresh-canli-final.jsonl" "fresh|edgartools+yahoo|fresh-edgartools_yahoo.jsonl" \
             "|edgartools|results-edgartools.jsonl" "|edgartools+yahoo|results-edgartools_yahoo.jsonl" "|openbb|results.jsonl" \
             "fresh|edgartools|fresh-edgartools.jsonl" "fresh|yahoo|fresh-yahoo.jsonl" "fresh|openbb|fresh-openbb.jsonl"; do
    parts=("${(@s:|:)job}")
    run "${parts[1]}" "${parts[2]}" "${parts[3]}"; rc=$?
    if [[ $rc -eq 3 || $rc -eq 4 ]]; then echo "NIGHT $night stopped (rc $rc) after $(cat $BUDGET_FILE) tokens $(date -u +%FT%TZ)"; stopped=1; break; fi
    [[ $rc -ne 0 ]] && echo "JOB rc=$rc"
  done
  if [[ $stopped -eq 0 ]]; then echo "ALL_DONE $(date -u +%FT%TZ) after $(cat $BUDGET_FILE) tokens tonight"; exit 0; fi
done
echo "GAVE_UP after 7 nights $(date -u +%FT%TZ)"
