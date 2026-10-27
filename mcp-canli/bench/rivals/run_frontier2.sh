#!/bin/zsh
# The second frontier set (committed with its answers before this run), every arm, one run each.
cd ${0:A:h}
export BUDGET_TOKENS=12000000 BUDGET_FILE=${0:A:h}/deepseek-budget-f2.txt OUT=./results-deepseek.jsonl SET=frontier2
node run.mjs deepseek-flash 1 canli-dev,canli-0.6.0,edgartools,yahoo,openbb
echo "F2_DONE tokens=$(cat $BUDGET_FILE) $(date -u +%FT%TZ)"
