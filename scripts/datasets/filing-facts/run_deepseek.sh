#!/bin/zsh
# DeepSeek runs pre-registered in TAXONOMY.md ("Pre-registration for the DeepSeek runs"), then the
# taxonomy per set and the confirmatory tests. Paths can be overridden from the environment.
#   zsh scripts/datasets/filing-facts/run_deepseek.sh
C=${0:A:h:h:h:h}
D=${DS_DIR:-~/canli-datasets/filing-facts-deepseek-20261023}
V0=${V0_ITEMS:-$C/public/datasets/filing-facts/v0/filing-facts-v0.jsonl}
V1=${V1_DIR:-~/canli-datasets/filing-facts-v1}
LG=${LARGE_DIR:-~/canli-datasets/filing-facts-large}
cd $C && echo "code $(git rev-parse HEAD) $(date -u +%FT%TZ)"
mkdir -p $D/runs-{v0,large,restatement,fresh} $D/logs
items() { case $1 in
  v0) echo "$V0 --per-template 30 --seed 20260926";;
  large) echo "$LG/filing-facts-large.jsonl --per-template 30 --seed 20261024";;
  restatement) echo "$V1/filing-facts-v1-restatement.jsonl --per-template 60 --seed 20261023";;
  fresh) echo "$V1/filing-facts-v1-fresh-core.jsonl --per-template 15 --seed 20261023";; esac; }
sources() { [ $1 = large ] && echo $LG/sources || echo $V1/sources; }
balance() { curl -s https://api.deepseek.com/user/balance -H "Authorization: Bearer $(cat ~/.config/deepseek/api-key)" |
  python3 -c "import json,sys;print(json.load(sys.stdin)['balance_infos'][0]['total_balance'])"; }
one() {  # set model arm floor-usd
  local name=${2#deepseek/}; local out=$D/runs-$1/$name-$3.json log=$D/logs/$1-$name-$3.log
  [ -s $out ] && { echo "skip existing $out"; return 0; }
  local b=$(balance)
  python3 -c "import sys;sys.exit(0 if float('$b') >= $4 else 1)" || { echo "SKIPPED $1 $2 $3: balance $b below $4"; return 0; }
  rm -f $out; local spec=($(items $1)); echo "RUN $1 $2 $3 balance=$b $(date +%H:%M)"
  node scripts/datasets/filing-facts/eval.mjs $spec[1] $out --arm $3 $spec[2,-1] --model $2 > $log 2>&1 ||
    { echo "FAILED $1 $2 $3 (see $log)"; rm -f $out; return 1; }
  echo "DONE $1 $2 $3 acc=$(python3 -c "import json;print(round(json.load(open('$out'))['summary']['accuracy'],3))") $(date +%H:%M)"
}
for s in v0 large restatement fresh; do one $s deepseek/deepseek-flash closed 0.40; done
for s in v0 large restatement fresh; do one $s deepseek/deepseek-flash mcp 1.20; done
for s in v0 large restatement fresh; do one $s deepseek/deepseek-v4-pro closed 0.40; done
echo "RUNS_DONE balance=$(balance)"
for s in v0 large restatement fresh; do
  f=($(items $s)); node scripts/datasets/filing-facts/taxonomy.mjs $f[1] $D/runs-$s $(sources $s) $D/taxonomy-$s.json > /dev/null
done
node scripts/datasets/filing-facts/confirm-deepseek.mjs $D | tee $D/confirm.txt
echo DS_DONE $(date -u +%FT%TZ)
