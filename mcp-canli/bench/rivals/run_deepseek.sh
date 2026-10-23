#!/bin/zsh
# Held-out and frontier sets on deepseek-flash, every arm; stops when the token budget is spent.
cd ${0:A:h}
export BUDGET_TOKENS=${BUDGET_TOKENS:-16000000} BUDGET_FILE=${0:A:h}/deepseek-budget.txt OUT=./results-deepseek.jsonl
for rep in 1 2; do
  for set in fresh frontier; do SET=$set node run.mjs deepseek-flash $rep canli-0.6.0,edgartools,yahoo,edgartools+yahoo,openbb; [ $? -eq 4 -o $? -eq 3 ] && break 2; done
done
echo "DS_RIVALS_DONE tokens=$(cat $BUDGET_FILE) $(date -u +%FT%TZ)"
