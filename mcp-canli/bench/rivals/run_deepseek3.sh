#!/bin/zsh
# This branch's flagship (canli-dev) on the held-out and frontier sets; its own 3M-token budget.
cd ${0:A:h}
export BUDGET_TOKENS=3000000 BUDGET_FILE=${0:A:h}/deepseek-budget-dev2.txt OUT=./results-deepseek.jsonl
for set in fresh frontier; do SET=$set node run.mjs deepseek-flash 1 canli-dev; done
echo "DS_RIVALS3_DONE tokens=$(cat $BUDGET_FILE) $(date -u +%FT%TZ)"
