# canli-broker

Send an order file you have read to your own broker account, from your own machine, with your own keys.

**Status: not released. Tested only against stand-ins for each broker. It has never placed a real order, on paper or live, and the IBKR part was written from published examples without a real gateway. Do not trust it with real money until you have run it on paper yourself.**

```
canli-broker check orders.json --broker alpaca      # show what would happen; send nothing
canli-broker send  orders.json --broker alpaca      # paper
canli-broker send  orders.json --broker alpaca --live
canli-broker stop                                   # nothing is sent until you delete the stop file
```

## What it is

An order file (`canli.order-intent.v1`, which `draft_orders` writes) goes in. This command checks it, shows it to you, asks you to confirm, and sends it straight from your machine to your broker. Your keys stay in your environment. They go to your broker and nowhere else, and no Canli server sees your keys or your orders.

It is a command a person runs, not a tool a model can call. A model reads text from filings and web pages, and that text can carry instructions, so a model with a tool that spends money can be talked into spending it. Keeping this apart is deliberate. Do not wrap it in a tool, and do not give an agent a terminal that can run it.

## What protects you

- **Paper by default.** Paper and live use different hosts and different keys, and a key for one is refused on the other.
- **Live needs your limits file.** `~/.canli/broker-limits.json`, written by you:
  ```json
  { "live_enabled": true, "max_order_usd": 500, "max_day_usd": 1000, "allowed_symbols": ["AAPL", "MSFT"] }
  ```
  `allowed_symbols` can be `"any"`, but then you have to write that yourself. `max_day_usd` covers all brokers together on this machine, and counts an order whose outcome is unknown. Nothing in an order file can change these.
- **Live means typing a phrase** tied to that exact file, read from the terminal itself, so piped input cannot answer. `--yes` works only for paper. With no terminal, nothing is sent.
- **No short selling.** A sell must be covered by what the account holds. If that cannot be read, a live order is refused.
- **The whole file or nothing:** every check runs on every order before any goes out. A run stops at the first failure and says exactly what went out.
- **No double sends.** Each order has an id derived from the file, and a journal records each one. If a connection drops mid-order, nobody knows whether it arrived, so it is not sent again until you have looked in your account and passed `--unknown-not-placed`.
- **A stop file.** While `~/.canli/BROKER_STOP` exists, nothing is sent, even in the middle of a run.

These lower the risk of a mistake. They do not make trading safe, and a market order can fill far from the last price.

## Brokers

| Broker | Trades | Paper | Set in your environment |
|---|---|---|---|
| `alpaca` | US stocks, crypto | Alpaca's paper host | `ALPACA_PAPER_KEY_ID`, `ALPACA_PAPER_SECRET_KEY`; live: `ALPACA_LIVE_KEY_ID`, `ALPACA_LIVE_SECRET_KEY` |
| `tradier` | US stocks, whole shares | Tradier's sandbox | `TRADIER_SANDBOX_TOKEN`, `TRADIER_SANDBOX_ACCOUNT`; live: `TRADIER_TOKEN`, `TRADIER_ACCOUNT` |
| `ibkr` | Stocks | Log the gateway in to your paper account | No keys: you log in to IBKR's Client Portal gateway on this machine. `CANLI_IBKR_CA` is a file holding the gateway's certificate, and `IBKR_ACCOUNT` chooses among several accounts |
| `coinbase` | Crypto | None exists, so a paper run only previews | `COINBASE_KEY_NAME`, `COINBASE_KEY_SECRET` |
| `kraken` | Crypto | None for spot, so a paper run only asks Kraken to check each order | `KRAKEN_API_KEY`, `KRAKEN_API_SECRET` |

The IBKR gateway uses a certificate it made itself, so it is checked against a copy you save once, while the gateway is running on your machine:

```
openssl s_client -connect localhost:5000 -showcerts </dev/null 2>/dev/null | openssl x509 > ~/.canli/ibkr-gateway.pem
export CANLI_IBKR_CA=~/.canli/ibkr-gateway.pem
```

Brokers charge what they charge: spreads, commissions, data fees and taxes are between you and them.

## What this is not

It is not investment advice, and nothing here says what to buy. An order file may have been written by a model that was wrong or was misled, so read it as a draft.

The software comes under the MIT licence, as is and with no warranty. That licence does not settle every question. You are responsible for your own orders, your broker's terms, and the rules where you live, and you need to be old enough to hold the account. If you build something that sends orders for other people, or tells them what to buy, different rules can apply, so get advice from a lawyer first.
