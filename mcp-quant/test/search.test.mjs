// find_tool must find the right tool for plain requests in one call: a wrong first answer costs the
// model a round trip. Two query sets: plain-language requests, and short keyword requests written
// after the ranking was tuned (held out). Thresholds are the measured accuracy, so any regression fails.
import assert from "node:assert/strict";
import test from "node:test";

import { findTools } from "../src/registry.mjs";

const PLAIN = [
 ["how risky is my portfolio value at risk", "value_at_risk"], ["cvar of my returns", "expected_shortfall"], ["sharpe ratio with confidence interval", "sharpe_ratio"],
 ["worst drawdown of my strategy", "max_drawdown"], ["did my backtest overfit after trying 50 variants", "deflated_sharpe_ratio"], ["price a call option", "black_scholes"],
 ["implied vol from option price", "implied_volatility"], ["american put early exercise", "american_option"], ["knock out barrier option price", "barrier_option"],
 ["heston stochastic volatility price", "heston_option"], ["bond yield to maturity", "bond_yield"], ["duration and convexity of a bond", "bond_price"],
 ["build zero curve from par yields", "bootstrap_zero_curve"], ["value an interest rate swap", "interest_rate_swap"], ["npv of cash flows", "net_present_value"],
 ["irr of an investment", "internal_rate_of_return"], ["mortgage payment schedule", "amortization_schedule"], ["discounted cash flow valuation", "dcf_valuation"],
 ["what growth does the stock price imply", "reverse_dcf"], ["bankruptcy risk score", "altman_z_score"], ["earnings manipulation check", "beneish_m_score"],
 ["minimum variance weights", "min_variance_portfolio"], ["hierarchical risk parity", "hierarchical_risk_parity"], ["black litterman views", "black_litterman"],
 ["shrink the covariance matrix", "covariance_shrinkage"], ["is this series stationary", "adf_test"], ["are these two stocks cointegrated", "cointegration_test"],
 ["cointegration of five assets rank", "johansen_cointegration"], ["half life of mean reversion", "mean_reversion_fit"], ["fit garch volatility", "garch_volatility"],
 ["detect bull and bear regimes", "markov_regime_switching"], ["did the beta change over time structural break", "chow_break_test"], ["forecast realized volatility", "har_rv_forecast"],
 ["jumps in intraday data", "realized_volatility_measures"], ["do these assets crash together", "dependence_measures"], ["bootstrap confidence interval for sharpe", "bootstrap_confidence_interval"],
 ["tail risk extreme value", "extreme_value_tail"], ["compute vix from option chain", "vix_style_index"], ["probability distribution implied by options", "risk_neutral_density"],
 ["probability of default from equity", "merton_credit_risk"], ["rsi indicator", "rsi"], ["bollinger bands", "bollinger_bands"], ["average true range for stop", "atr"],
 ["macd signal", "macd"], ["backtest golden cross", "backtest_ma_crossover"], ["backtest momentum rotation across etfs", "backtest_cross_sectional_momentum"],
 ["optimize parameters without overfitting", "strategy_sweep"], ["which of the sleeves work on my data", "sleeve_tournament"], ["list available strategies", "list_sleeves"],
 ["position size from stop loss", "position_size_from_stop"], ["kelly bet size", "kelly_fraction"], ["market impact of a large order", "market_impact_estimate"],
 ["optimal execution schedule", "almgren_chriss_schedule"], ["perpetual funding rate carry", "funding_rate_carry"], ["impermanent loss uniswap", "impermanent_loss"],
 ["check my price data for errors", "check_price_series"], ["label data for machine learning", "triple_barrier_labels"], ["cross validation without leakage", "purged_cv_splits"],
 ["annotate outliers and drawdowns in prices", "annotate_price_series"], ["fama french factor exposure", "factor_regression"],
];

const HELD_OUT = [
 ["sortino ratio downside", "sortino_ratio"], ["calmar", "calmar_ratio"], ["alpha and beta vs the s&p", "capm_regression"], ["tracking error information ratio", "information_ratio"],
 ["greeks for my options book", "option_portfolio_greeks"], ["payoff diagram iron condor", "option_strategy_payoff"], ["asian option average price", "asian_option_geometric"],
 ["sabr smile", "sabr_volatility"], ["forward rate between two dates", "forward_rate"], ["nelson siegel curve fit", "nelson_siegel_fit"], ["z spread of a corporate bond", "z_spread"],
 ["treasury bill discount yield", "treasury_bill_yields"], ["xirr with dates", "xnpv_xirr"], ["wacc cost of capital", "wacc"], ["piotroski score", "piotroski_f_score"],
 ["dividend discount model gordon growth", "dividend_discount_model"], ["efficient frontier", "efficient_frontier"], ["risk parity weights", "risk_parity_portfolio"],
 ["max sharpe tangency portfolio", "max_sharpe_portfolio"], ["trades needed to rebalance", "rebalance_trades"], ["kpss test", "kpss_test"], ["granger causality", "granger_causality"],
 ["pca of asset returns", "pca_factors"], ["rolling beta", "rolling_beta"], ["ewma volatility riskmetrics", "ewma_volatility"], ["parkinson garman klass volatility", "range_volatility"],
 ["stochastic oscillator", "stochastic"], ["ichimoku", "ichimoku_cloud"], ["vwap", "vwap"], ["donchian channel breakout backtest", "backtest_breakout"],
 ["pairs trading backtest", "backtest_pairs_trading"], ["regime map of strategies", "sleeve_regime_map"], ["walk forward selection of strategies", "sleeve_walk_forward"],
 ["implementation shortfall of my fill", "implementation_shortfall"], ["bid ask spread estimate from prices", "spread_estimators"], ["liquidation price on leverage", "liquidation_price"],
 ["fx forward points", "fx_forward"], ["triangular arbitrage", "triangular_arbitrage"], ["check option chain arbitrage", "check_option_chain"], ["trend scanning labels", "trend_scanning_labels"],
 ["weights for overlapping labels", "sample_weights"], ["cusum events", "cusum_filter_events"], ["stress test my portfolio", "stress_test"], ["brinson attribution", "brinson_attribution"],
 ["monthly returns table", "monthly_returns_table"], ["compare two sharpe ratios", "compare_sharpe_ratios"], ["is the mean return significant", "mean_return_test"],
 ["probability sharpe is real", "probabilistic_sharpe_ratio"], ["cusum parameter stability", "recursive_stability_test"], ["lookback option", "lookback_option"],
];

function score(Q) {
  let top1 = 0, top3 = 0;
  const misses = [];
  for (const [q, want] of Q) { const r = findTools(q, { limit: 3 }).map((t) => t.name); if (r[0] === want) top1++; if (r.includes(want)) top3++; else misses.push(`${q} -> ${r.join(", ")}`); }
  return { top1, top3, misses };
}

test("plain-language requests: the right tool first in at least 54 of 60, in the top three in 59", () => {
  const s = score(PLAIN);
  assert.ok(s.top1 >= 54 && s.top3 >= 59, JSON.stringify(s));
});

test("held-out keyword requests: first in at least 49 of 50, top three in all 50", () => {
  const s = score(HELD_OUT);
  assert.ok(s.top1 >= 49 && s.top3 === 50, JSON.stringify(s));
});
