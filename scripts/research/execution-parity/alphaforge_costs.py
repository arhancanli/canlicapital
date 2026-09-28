"""Record AlphaForge's own cost-model outputs as parity fixtures for js/exec-cost-core.js.

Runs AlphaForge's TransactionCostModel, FeeSchedule and the PaperBroker book walk on 1,000
randomized inputs from a fixed seed and writes their outputs, with the AlphaForge commit, to
mcp-execution/test/fixtures/alphaforge-costs.json.gz. The JavaScript port is then checked against
these numbers (0 differences above 1e-12), so it is faithful to the engine it came from.

    PYTHONPATH=/Users/arhancanli/alphaforge/src <alphaforge venv python> alphaforge_costs.py <commit> <out>
"""
import gzip
import io
import json
import random
import sys
from types import SimpleNamespace

from alphaforge.core.types import Liquidity, MarketType, Side
from alphaforge.costs.fees import FeeSchedule
from alphaforge.costs.model import MAX_ADV_PARTICIPATION, TransactionCostModel
from alphaforge.execution.paper import walk_book


def write_fixture(path, obj):
    """Compact JSON, gzipped with a zero timestamp, so a rerun at the same commit writes the same bytes."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
        gz.write(json.dumps(obj, separators=(",", ":")).encode())
    open(path, "wb").write(buf.getvalue())


commit, out = sys.argv[1], sys.argv[2]
rng = random.Random(20260928)
cases = {"impact": [], "fee_quote": [], "oneway": [], "fill_price": [], "walk": []}

for _ in range(1000):
    adv = 10 ** rng.uniform(4, 10)
    notional = adv * rng.uniform(1e-5, MAX_ADV_PARTICIPATION)
    sigma = rng.uniform(0.002, 0.08)
    coef = rng.choice([0.5, 1.0, 1.5, rng.uniform(0.1, 2.0)])
    model = TransactionCostModel(impact_coef=coef)
    cases["impact"].append({"notional": notional, "adv": adv, "sigma_daily": sigma, "coef": coef, "impact_frac": model.impact_frac(notional, adv, sigma)})

    maker, taker = rng.uniform(0, 20), rng.uniform(0, 20)
    fees = FeeSchedule(maker_bps=maker, taker_bps=taker)
    qty, price = rng.uniform(-1e5, 1e5), 10 ** rng.uniform(-2, 5)
    liq = rng.choice([Liquidity.MAKER, Liquidity.TAKER])
    cases["fee_quote"].append({"qty": qty, "price": price, "bps": fees.bps(liq), "fee_quote": fees.fee_quote(qty, price, liq)})

    hs = rng.uniform(0, 30)
    lat = rng.uniform(0, 10)
    eq = FeeSchedule(maker_bps=taker, taker_bps=taker)
    m2 = TransactionCostModel(equity_fees=eq, impact_coef=coef, default_half_spread_bps=hs, latency_bps=lat)
    inst = SimpleNamespace(market_type=MarketType.CASH, instrument_id="X")
    cases["oneway"].append({"fee_bps": taker, "half_spread_bps": hs, "notional": notional, "adv": adv, "sigma_daily": sigma, "coef": coef,
                            "oneway_cost_frac": m2.oneway_cost_frac(inst, notional, adv, sigma, Liquidity.TAKER)})
    side = rng.choice([Side.BUY, Side.SELL])
    ref = 10 ** rng.uniform(-1, 4)
    cases["fill_price"].append({"side": side.value, "ref_price": ref, "half_spread_bps": hs, "latency_bps": lat, "notional": notional, "adv": adv,
                                "sigma_daily": sigma, "coef": coef, "fill_price": m2.fill_price(inst, side, ref, notional, adv, sigma)})

    mid = 10 ** rng.uniform(0, 4)
    depth = rng.randint(1, 12)
    tick = mid * rng.uniform(1e-5, 1e-3)
    asks = [[mid + tick * (i + 1), rng.uniform(0.01, 50)] for i in range(depth)]
    bids = [[mid - tick * (i + 1), rng.uniform(0.01, 50)] for i in range(depth)]
    book = SimpleNamespace(side_for=lambda s, a=asks, b=bids: a if s is Side.BUY else b)
    want = rng.uniform(0.01, 1.3 * sum(q for _, q in asks))
    w = walk_book(book, side, want)
    cases["walk"].append({"side": side.value, "asks": asks, "bids": bids, "qty": want, "filled_qty": w.filled_qty, "avg_price": w.avg_price,
                          "book_exhausted": w.book_exhausted, "levels_consumed": w.levels_consumed})

write_fixture(out, {"schema": "canli.execution-parity.alphaforge-costs.v1", "alphaforge_commit": commit, "seed": 20260928,
                    "max_adv_participation": MAX_ADV_PARTICIPATION, "cases": cases})
print({k: len(v) for k, v in cases.items()})
