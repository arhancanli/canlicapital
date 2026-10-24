#!/bin/zsh
# One complete pass: the remaining arms on the frontier set, then this branch's flagship (canli-dev) on both sets.
cd ${0:A:h}
export BUDGET_TOKENS=${BUDGET_TOKENS:-24000000} BUDGET_FILE=${0:A:h}/deepseek-budget.txt OUT=./results-deepseek.jsonl
while pgrep -f "run_deepseek.sh" >/dev/null; do sleep 30; done
SET=frontier node run.mjs deepseek-flash 1 edgartools,yahoo,edgartools+yahoo
for set in fresh frontier; do SET=$set node run.mjs deepseek-flash 1 canli-dev; done
echo "DS_RIVALS2_DONE tokens=$(cat $BUDGET_FILE) $(date -u +%FT%TZ)"
