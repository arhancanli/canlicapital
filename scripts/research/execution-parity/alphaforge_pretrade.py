"""Record AlphaForge's PreTradeChecker verdicts as parity fixtures for js/pretrade-core.js.

5,000 random batches (1 to 6 orders over 3 symbols, random books, caps and reduce-only flags) go
through AlphaForge's checker; each order's accepted flag and reason codes (the text before ':'),
or the systemic-breach halt, are written with the AlphaForge commit to
mcp-execution/test/fixtures/alphaforge-pretrade.json.gz.

    PYTHONPATH=/Users/arhancanli/alphaforge/src <alphaforge venv python> alphaforge_pretrade.py <commit> <out>
"""
import gzip
import io
import json
import random
import sys
from types import SimpleNamespace

from alphaforge.core.errors import CostModelMisuse, RiskLimitError
from alphaforge.core.types import MarketType, Side
from alphaforge.costs.model import TransactionCostModel
from alphaforge.risk.limits import RiskLimits
from alphaforge.risk.pretrade import PreTradeChecker


def write_fixture(path, obj):
    """Compact JSON, gzipped with a zero timestamp, so a rerun at the same commit writes the same bytes."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
        gz.write(json.dumps(obj, separators=(",", ":")).encode())
    open(path, "wb").write(buf.getvalue())


commit, out = sys.argv[1], sys.argv[2]
rng = random.Random(20260929)
SYMS = ["AAA", "BBB", "CCC"]
cases = []
for _ in range(5000):
    limits = RiskLimits(max_position_frac=rng.uniform(0.05, 0.5), max_gross=rng.uniform(0.5, 2.0), max_net=0.0, max_order_adv_frac=rng.uniform(0.001, 0.05), price_collar_frac=rng.uniform(0.005, 0.1))
    limits = RiskLimits(max_position_frac=min(limits.max_position_frac, limits.max_gross), max_gross=limits.max_gross, max_net=rng.uniform(0, limits.max_gross), max_order_adv_frac=limits.max_order_adv_frac, price_collar_frac=limits.price_collar_frac)
    equity = rng.uniform(1e4, 1e7)
    closes = {s: 10 ** rng.uniform(0, 3) for s in SYMS}
    adv = {s: equity * rng.uniform(0.5, 500) for s in SYMS}
    sigma = {s: rng.uniform(0.005, 0.06) for s in SYMS}
    positions = {s: rng.choice([0.0, rng.uniform(-0.4, 0.4) * equity / closes[s]]) for s in SYMS}
    orders = []
    for _ in range(rng.randint(1, 6)):
        s = rng.choice(SYMS)
        side = rng.choice([Side.BUY, Side.SELL])
        qty = rng.uniform(0.001, 0.3) * equity / closes[s]
        moved = rng.random() < 0.3
        decision = closes[s] * (1 + rng.uniform(-0.12, 0.12)) if moved else closes[s]
        orders.append(SimpleNamespace(instrument_id=s, side=side, qty=qty, reduce_only=rng.random() < 0.25, decision_price=decision, decision_ts=0))
    checker = PreTradeChecker(limits, TransactionCostModel())
    instruments = {s: SimpleNamespace(market_type=MarketType.SPOT, instrument_id=s) for s in SYMS}
    case = {
        "limits": {"max_position_frac": limits.max_position_frac, "max_gross": limits.max_gross, "max_net": limits.max_net, "max_adv_frac": limits.max_order_adv_frac, "price_collar_frac": limits.price_collar_frac},
        "equity": equity, "positions": positions, "closes": closes, "adv": adv, "sigma": sigma,
        "orders": [{"symbol": o.instrument_id, "side": o.side.value, "qty": o.qty, "reduce_only": o.reduce_only, "decision_price": o.decision_price} for o in orders],
    }
    try:
        report = checker.check(orders, equity=equity, positions=positions, closes=closes, adv_quote=adv, sigma_daily=sigma, instruments=instruments)
        case["systemic"] = False
        case["verdicts"] = [{"accepted": v.accepted, "reasons": sorted({r.split(":")[0] for r in v.reasons})} for v in report.verdicts]
    except RiskLimitError as e:
        case["systemic"] = True
        case["verdicts"] = None
        case["error"] = str(e).split(":")[0]
    except CostModelMisuse as e:
        # An AlphaForge defect, kept visible: a reduce-only order is exempt from the ADV cap, then
        # the cost annotation refuses it above 5% of ADV and the whole check raises, so de-risking
        # a large position crashes the checker. The port reports no impact estimate instead.
        case["systemic"] = False
        case["verdicts"] = None
        case["error"] = "cost_model_misuse"
    cases.append(case)
write_fixture(out, {"schema": "canli.execution-parity.alphaforge-pretrade.v1", "alphaforge_commit": commit, "seed": 20260929, "cases": cases})
print(len(cases), "cases;", sum(c["systemic"] for c in cases), "systemic;", sum(c.get("error") == "cost_model_misuse" for c in cases), "cost-model crashes;", sum(1 for c in cases if c["verdicts"] for v in c["verdicts"] if not v["accepted"]), "rejected orders")
