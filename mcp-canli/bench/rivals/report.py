"""Summarises results*.jsonl: accuracy per arm (overall and per category), tokens, time and tool
errors per question, and a per-question table. Paired comparison against the best rival arm on
the same questions (exact sign test on questions where the two differ).
    python3 report.py > REPORT.md
"""
import glob
import json
import math
import statistics
from collections import defaultdict

rows = [json.loads(l) for f in sorted(glob.glob("results*.jsonl")) if "smoke" not in f for l in open(f) if l.strip()]
arms = list(dict.fromkeys(r["arm"] for r in rows))
tasks = list(dict.fromkeys(r["task"] for r in rows))
cats = list(dict.fromkeys(r["cat"] for r in rows))
by = defaultdict(list)
for r in rows:
    by[(r["arm"], r["task"])].append(r)

def acc(rs):
    return sum(r["correct"] for r in rs), len(rs)

print(f"Model {rows[0]['model']}; {len(tasks)} questions; runs per question per arm: {max(len(v) for v in by.values())}.\n")
print("| arm | correct | " + " | ".join(cats) + " | median input tokens | median seconds | tool errors per run |")
print("|---|---|" + "---|" * len(cats) + "---|---|---|")
for a in arms:
    rs = [r for r in rows if r["arm"] == a]
    c, n = acc(rs)
    per = []
    for cat in cats:
        cc, nn = acc([r for r in rs if r["cat"] == cat])
        per.append(f"{cc}/{nn}")
    tok = statistics.median([r.get("input", 0) or 0 for r in rs])
    sec = statistics.median([r.get("seconds", 0) or 0 for r in rs])
    err = sum(r.get("errors", 0) or 0 for r in rs) / len(rs)
    print(f"| {a} | **{c}/{n}** ({100 * c / n:.0f}%) | " + " | ".join(per) + f" | {tok:,.0f} | {sec:.1f} | {err:.2f} |")

# Paired: per question, share of runs correct; compare the canli arms with each rival.
def score(a, t):
    rs = by.get((a, t), [])
    return sum(r["correct"] for r in rs) / len(rs) if rs else None

def sign_p(w, l):
    n = w + l
    if n == 0:
        return 1.0
    k = max(w, l)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k, n + 1)) / 2 ** n)

print("\nPaired by question (a question counts for the arm with more correct runs on it; two-sided exact sign test):\n")
for ours in [a for a in arms if a.startswith("canli")]:
    for other in [a for a in arms if not a.startswith("canli")]:
        w = l = 0
        for t in tasks:
            x, y = score(ours, t), score(other, t)
            if x is None or y is None:
                continue
            w += x > y
            l += x < y
        print(f"- {ours} vs {other}: {ours} better on {w} questions, worse on {l}, p = {sign_p(w, l):.3g}")

print("\n| question | " + " | ".join(arms) + " |")
print("|---|" + "---|" * len(arms))
for t in tasks:
    cells = []
    for a in arms:
        c, n = acc(by.get((a, t), []))
        cells.append(f"{c}/{n}" if n else "-")
    print(f"| {t} | " + " | ".join(cells) + " |")
