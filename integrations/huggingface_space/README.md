---
title: Canli luck check
emoji: 🎲
colorFrom: blue
colorTo: gray
sdk: gradio
app_file: app.py
pinned: false
license: mit
---

# Canli luck check

Upload a backtest's daily returns and say how many variants you tried. This shows the probability that the Sharpe beats the best that luck gives across that many tries, with the limits of that figure.

To put it on Hugging Face, make a new Gradio Space and copy in this folder's files and `integrations/canli_validate/` beside `app.py`. It calls the free validator at canlicapital.com. Add a `CANLI_KEY` secret to the Space to reuse one key; without one, the app asks for a new key each run and is limited to five a day.

A result is about the series as uploaded. The validator never saw the data source, the costs, survivorship or lookahead in how the series was built.
