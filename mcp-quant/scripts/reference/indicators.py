"""Reference values for the indicators toolset: TA-Lib's own C implementation, plus pandas for the
few indicators TA-Lib lacks (Donchian, Keltner from TA-Lib parts, VWAP, Ichimoku, z-score, Hull).
Regenerate with:

    uv run --python 3.12 --with TA-Lib --with numpy --with pandas python scripts/reference/indicators.py > test/fixtures/indicators.json
"""

import json
import math

import numpy as np
import pandas as pd
import talib

cases = []


def clean(a):
    return [None if (v is None or (isinstance(v, float) and math.isnan(v))) else float(v) for v in np.asarray(a, dtype=float)]


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": {**args, "tail": 0}, "expect": {k: clean(v) for k, v in expect.items()}, "tol": tol})


rng = np.random.default_rng(3)
n = 400
c = 100 * np.exp(np.cumsum(rng.normal(0.0002, 0.015, n)))
o = c * np.exp(rng.normal(0, 0.004, n))
h = np.maximum(o, c) * np.exp(np.abs(rng.normal(0, 0.006, n)))
l = np.minimum(o, c) * np.exp(-np.abs(rng.normal(0, 0.006, n)))
v = rng.integers(1000, 50000, n).astype(float)
o, h, l, c = (x.round(4) for x in (o, h, l, c))
C = {"close": c.tolist()}
HLC = {"high": h.tolist(), "low": l.tolist(), "close": c.tolist()}

add("sma", {**C, "period": 20}, {"sma": talib.SMA(c, 20)})
add("ema", {**C, "period": 20}, {"ema": talib.EMA(c, 20)})
add("wma", {**C, "period": 15}, {"wma": talib.WMA(c, 15)})
add("dema", {**C, "period": 10}, {"dema": talib.DEMA(c, 10)})
add("tema", {**C, "period": 10}, {"tema": talib.TEMA(c, 10)})
add("kama", {**C, "period": 10}, {"kama": talib.KAMA(c, 10)})
add("rsi", {**C, "period": 14}, {"rsi": talib.RSI(c, 14)})
add("rsi", {**C, "period": 5}, {"rsi": talib.RSI(c, 5)})
m, s, hist = talib.MACD(c, 12, 26, 9)
add("macd", C, {"macd": m, "signal": s, "histogram": hist})
m, s, hist = talib.MACD(c, 5, 35, 5)
add("macd", {**C, "fast": 5, "slow": 35, "signal": 5}, {"macd": m, "signal": s, "histogram": hist})
up, mid, lo = talib.BBANDS(c, 20, 2, 2)
add("bollinger_bands", C, {"upper": up, "middle": mid, "lower": lo})
k, d = talib.STOCH(h, l, c, 14, 3, 0, 3, 0)
add("stochastic", HLC, {"k": k, "d": d})
add("williams_r", HLC, {"williams_r": talib.WILLR(h, l, c, 14)})
add("cci", {**HLC, "period": 20}, {"cci": talib.CCI(h, l, c, 20)})
add("atr", HLC, {"atr": talib.ATR(h, l, c, 14), "natr": talib.NATR(h, l, c, 14)})
add("adx", HLC, {"adx": talib.ADX(h, l, c, 14), "plus_di": talib.PLUS_DI(h, l, c, 14), "minus_di": talib.MINUS_DI(h, l, c, 14)})
add("obv", {**C, "volume": v.tolist()}, {"obv": talib.OBV(c, v)})
add("money_flow_index", {**HLC, "volume": v.tolist()}, {"mfi": talib.MFI(h, l, c, v, 14)})
add("rate_of_change", {**C, "period": 10}, {"roc": talib.ROC(c, 10), "momentum": talib.MOM(c, 10)})
add("trix", {**C, "period": 15}, {"trix": talib.TRIX(c, 15)})
ad_, au_ = talib.AROON(h, l, 14)
add("aroon", {"high": h.tolist(), "low": l.tolist()}, {"aroon_up": au_, "aroon_down": ad_, "oscillator": talib.AROONOSC(h, l, 14)})
add("chande_momentum", C, {"cmo": talib.CMO(c, 14)})
add("ultimate_oscillator", HLC, {"ultimate_oscillator": talib.ULTOSC(h, l, c, 7, 14, 28)})
add("accumulation_distribution", {**HLC, "volume": v.tolist()}, {"ad_line": talib.AD(h, l, c, v), "chaikin_oscillator": talib.ADOSC(h, l, c, v, 3, 10)})
fk, fd = talib.STOCHRSI(c, 14, 14, 3, 0)
add("stochastic_rsi", C, {"k": fk, "d": fd})
add("parabolic_sar", {"high": h.tolist(), "low": l.tolist()}, {"sar": talib.SAR(h, l, 0.02, 0.2)})

hs, ls, cs = pd.Series(h), pd.Series(l), pd.Series(c)
add("donchian_channels", {"high": h.tolist(), "low": l.tolist()}, {"upper": hs.rolling(20).max(), "lower": ls.rolling(20).min()})
em = talib.EMA(c, 20)
at = talib.ATR(h, l, c, 10)
add("keltner_channels", HLC, {"upper": em + 2 * at, "middle": em, "lower": em - 2 * at})
tp = (h + l + c) / 3
add("vwap", {**HLC, "volume": v.tolist()}, {"vwap": np.cumsum(tp * v) / np.cumsum(v)})
add("vwap", {**HLC, "volume": v.tolist(), "window": 30}, {"vwap": (pd.Series(tp * v).rolling(30).sum() / pd.Series(v).rolling(30).sum())})
mid9 = (hs.rolling(9).max() + ls.rolling(9).min()) / 2
mid26 = (hs.rolling(26).max() + ls.rolling(26).min()) / 2
add("ichimoku_cloud", HLC, {"conversion": mid9, "base": mid26, "span_a": (mid9 + mid26) / 2, "span_b": (hs.rolling(52).max() + ls.rolling(52).min()) / 2})
add("rolling_zscore", C, {"zscore": (cs - cs.rolling(20).mean()) / cs.rolling(20).std()})
w1, w2 = talib.WMA(c, 10), talib.WMA(c, 20)
add("hull_moving_average", C, {"hma": talib.WMA(2 * w1 - w2, 4)})

print(json.dumps({"generated_by": "scripts/reference/indicators.py", "cases": cases}))
