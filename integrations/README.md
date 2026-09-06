# Canli Capital validation API integrations

Three small, dependency-optional scripts that pipe a backtest's return series into the
Canli Capital deflated-Sharpe validator (`POST /api/v1/validate/deflated-sharpe`) and
print the verdict together with its limits. Everything here is Python 3.10+, stdlib
only for the HTTP part, and each host tool (vectorbt, backtrader, freqtrade) is
imported lazily so a module imports cleanly even when that tool is not installed.

The shared client lives in `canli_validate/`. Base URL comes from `CANLI_API_BASE`
(default `https://canlicapital.com`); the API key comes from `CANLI_KEY` if set, or is
issued once and printed so it can be exported and reused.

## vectorbt

`vectorbt/validate_portfolio.py` takes a vectorbt `Portfolio`, extracts
`portfolio.returns()`, infers `periods_per_year` from the index's bar spacing when not
given, and posts the series with a trial count to the deflated-Sharpe endpoint. It
never imports vectorbt at module load time, only inside the functions that need it, so
the file imports fine even before `pip install vectorbt` has been run.

Install and run:

```bash
pip install vectorbt
export CANLI_KEY=ck_live_...   # or omit this and one is issued and printed for you
python integrations/vectorbt/validate_portfolio.py
```

To validate your own portfolio instead of the synthetic demo:

```python
import vectorbt as vbt
from integrations.vectorbt.validate_portfolio import validate
from integrations.canli_validate import print_envelope

portfolio = vbt.Portfolio.from_holding(price, freq="1D")
envelope = validate(portfolio, trials=30, periods_per_year=365)
print_envelope(envelope)
```

## backtrader

`backtrader/canli_analyzer.py` defines `CanliValidation`, a `bt.Analyzer` subclass that
collects the strategy's equity value bar by bar in `next()`, converts it to simple
returns in `stop()`, and posts the series with a trial count to the deflated-Sharpe
endpoint once the backtest finishes. When backtrader is not installed, importing this
file still succeeds; only instantiating `CanliValidation` then raises a clear
`ImportError` naming the install command.

Install and run:

```bash
pip install backtrader
export CANLI_KEY=ck_live_...   # or omit this and one is issued and printed for you
```

```python
import backtrader as bt
from integrations.backtrader.canli_analyzer import CanliValidation

cerebro = bt.Cerebro()
cerebro.addstrategy(MyStrategy)
cerebro.addanalyzer(CanliValidation, trials=30, periods_per_year=252)
results = cerebro.run()
envelope = results[0].analyzers.canlivalidation.rets
```

## freqtrade

`freqtrade/validate_backtest.py` is a CLI that reads a freqtrade backtest export
(`strategy -> <name> -> trades`, each trade carrying a `profit_ratio` and a
`close_date`), sums each closed trade's profit onto its close date, fills any day with
no closed trade as zero, and posts that approximated daily series with a trial count
before the strategy moves to dry-run. It never imports freqtrade itself, since it only
reads freqtrade's own exported JSON. The script always prints, in its own words, that
summing per-trade profit is not a true daily mark-to-market equity curve, so the
approximation is never hidden behind a number.

Install and run:

```bash
export CANLI_KEY=ck_live_...   # or omit this and one is issued and printed for you
python integrations/freqtrade/validate_backtest.py path/to/backtest-result.json --trials 20
```

## Boundary language

Every response this service returns carries the same limits, copied here verbatim
from `api/_lib/limits.js` so nobody has to trust a summary of them:

- This verdict is about the series exactly as submitted. The service never saw the
  data source, its costs, survivorship, or any lookahead in how the series was built.
- A deflated Sharpe or overfitting probability above or below any threshold is not
  admission to anything and is not a forecast.
- The receipt is content-hashed and reproducible from the open-source core it names.
  It is not signed.
- Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day,
  1048576 bytes per request, 20000 observations per series, 200 variants per matrix.

None of this is investment advice. `print_envelope()` in `canli_validate/__init__.py`
always prints these sentences together with the verdict, so a number never appears
without the limits that bound what it means.

## Tests

```bash
python3 -m unittest discover -s integrations/tests
```

Every test runs against a local `http.server` stub (`integrations/tests/stub_server.py`)
that mimics `POST /api/v1/keys` and `POST /api/v1/validate/deflated-sharpe`. No test
makes a real network call or uses a real API key.
