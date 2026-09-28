"""Record AlphaForge's sizing behaviour as parity fixtures for js/sizing-core.js.

Three recordings, each from a fixed seed, written with the AlphaForge commit to
mcp-execution/test/fixtures/alphaforge-sizing.json.gz:

- discretize: 3,000 single-asset cases through ``weights_to_orders`` (lot grid, the 1.05 min-notional
  buffer, reduce-only orders never skipped, flips split into a close and an open, the no-trade band);
- ladder: the live ``DrawdownLadder`` driven over 300 random equity paths of 200 updates, recording
  each update's state before, drawdown and state after (so a stateless step can be checked against
  the stateful class);
- vol_target: 1,000 single-asset cases through the ``vol_target`` overlay.

    PYTHONPATH=/Users/arhancanli/alphaforge/src <alphaforge venv python> alphaforge_sizing.py <commit> <out>
"""
import gzip
import io
import json
import random
import sys
from types import SimpleNamespace

import numpy as np

from alphaforge.portfolio.discretize import weights_to_orders
from alphaforge.portfolio.overlay import vol_target
from alphaforge.risk.monitors import DDState, DrawdownLadder


def write_fixture(path, obj):
    """Compact JSON, gzipped with a zero timestamp, so a rerun at the same commit writes the same bytes."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
        gz.write(json.dumps(obj, separators=(",", ":")).encode())
    open(path, "wb").write(buf.getvalue())


commit, out = sys.argv[1], sys.argv[2]
rng = random.Random(20260930)
STATE = {DDState.NORMAL: "normal", DDState.HALF_GROSS: "half", DDState.FLAT_HALTED: "flat"}

discretize = []
for _ in range(3000):
    close = 10 ** rng.uniform(-1, 4)
    lot = rng.choice([1.0, 0.1, 0.01, 0.001, 0.00001, 100.0])
    min_qty = rng.choice([0.0, lot, 5 * lot])
    min_notional = rng.choice([0.0, 1.0, 5.0, 10.0, 100.0])
    equity = 10 ** rng.uniform(3, 7)
    qty_current = rng.choice([0.0, 0.0, rng.uniform(-1, 1) * 0.5 * equity / close])
    if rng.random() < 0.3:
        qty_current = round(qty_current / lot) * lot
    target = rng.choice([0.0, rng.uniform(-1, 1) * 0.6, rng.uniform(-1, 1) * 0.002])
    band = rng.choice([0.0, 0.0, 0.001, 0.01])
    ledger = SimpleNamespace(cash=equity - qty_current * close, positions=lambda q=qty_current: ({"X": SimpleNamespace(qty=q)} if q != 0.0 else {}))
    inst = SimpleNamespace(lot_size=lot, min_qty=min_qty, min_notional=min_notional)
    case = {"close": close, "lot_size": lot, "min_qty": min_qty, "min_notional": min_notional, "equity": equity,
            "qty_current": qty_current, "target_weight": target, "no_trade_band": band}
    try:
        orders = weights_to_orders({"X": target}, ledger, {"X": close}, {"X": inst}, no_trade_band=band)
        case["orders"] = [{"side": o.side.value, "qty": o.qty, "reduce_only": o.reduce_only} for o in orders]
    except ValueError as e:
        # An AlphaForge defect, kept visible: with no minimum quantity or notional, a flip whose
        # opening leg floors to zero lots still builds that leg, and a zero-quantity order raises.
        assert "qty must be finite and > 0" in str(e), e
        case["orders"] = None
        case["error"] = "zero_qty_order"
    discretize.append(case)

ladder = []
for _ in range(300):
    half = rng.uniform(0.02, 0.2)
    flat = rng.uniform(half + 0.01, 0.4)
    cooldown = rng.choice([10 ** 9, rng.randint(3, 30)])
    lad = DrawdownLadder(dd_half_frac=half, dd_flat_frac=flat, flat_cooldown_bars=cooldown)
    equity = 1.0
    steps = []
    for _ in range(200):
        before = STATE[lad.state]
        equity *= 1.0 + rng.gauss(0.0005, 0.02)
        after = STATE[lad.update(equity)]
        steps.append([before, lad.drawdown, after, lad.gross_multiplier()])
    ladder.append({"half_at": half, "flat_at": flat, "cooldown": cooldown, "steps": steps})

vol = []
for _ in range(1000):
    w = rng.choice([1.0, -1.0, rng.uniform(-2, 2)])
    sigma = rng.uniform(0.05, 1.5)
    realized = rng.choice([0.0, rng.uniform(0.0, 1.5)])
    target = rng.uniform(0.02, 0.4)
    s_max = rng.choice([1.5, 1e9, rng.uniform(0.5, 3)])
    gross_max = rng.choice([1.0, 1e9, rng.uniform(0.2, 2)])
    w_final, s = vol_target(np.array([w]), np.array([[sigma * sigma]]), realized, target=target, s_max=s_max, gross_max=gross_max)
    vol.append({"w": w, "sigma_ann": sigma, "realized_vol_ann": realized, "target": target, "s_max": s_max, "gross_max": gross_max, "w_final": float(w_final[0]), "s": s})

write_fixture(out, {"schema": "canli.execution-parity.alphaforge-sizing.v1", "alphaforge_commit": commit, "seed": 20260930,
                    "discretize": discretize, "ladder": ladder, "vol_target": vol})
print(len(discretize), "discretize cases,", sum(len(c["orders"] or []) for c in discretize), "orders,", sum(1 for c in discretize for o in (c["orders"] or []) if o["reduce_only"]), "reduce-only,", sum(c.get("error") == "zero_qty_order" for c in discretize), "zero-qty crashes;",
      len(ladder), "ladder paths,", sum(1 for p in ladder for s in p["steps"] if s[0] != s[2]), "transitions;", len(vol), "vol-target cases")
