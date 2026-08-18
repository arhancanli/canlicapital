// =============================================================================
// CANLI CAPITAL / performance_data.js  (LIVE: the real grand-backtest verdict)
// -----------------------------------------------------------------------------
// Wired from the real artifact artifacts/grand_backtest/20260616T143620Z/ on
// 2026-06-17. The result is an HONEST NULL: the standalone crypto-perps edge did
// NOT clear the validation gauntlet. We publish it in full anyway. That honesty is
// the brand. No number here is invented; every value is read from the artifact.
// ZERO em dashes anywhere.
// =============================================================================

export const STATUS = "live";

export const PROVENANCE = {
  artifact: "grand_backtest/20260616T143620Z",
  asOf: "2026-06-17",
  universe: "Crypto perpetuals",
  sampleSpan: "2022 to 2026",
};

export const GAUNTLET_PARAMS = {
  rebalance: "72 bars (3 days)",
  purge: "72 bars",
  embargo: "168 bars",
  walkForward: "rolling, expanding train",
  trials: "8",
  baseline: "blend-only, same legs",
  cadence: "The gauntlet re-runs on every engine change.",
};

export const GAUNTLET = [
  { key: "pwf", label: "Purged walk-forward", blurb: "Out-of-sample by construction, with a purge and embargo around every train and test boundary. If an edge only exists in-sample, it disappears here.", gate: "Positive, stable out-of-sample", value: "+0.04 Sharpe, unstable", passed: false },
  { key: "dsr", label: "Deflated Sharpe Ratio", blurb: "A Sharpe discounted for the number of trials behind it and the non-normal shape of real returns. Given how hard we looked, how impressed should we be.", gate: "0.95 to deploy", value: 0.21, passed: false },
  { key: "psr", label: "Probabilistic Sharpe Ratio", blurb: "The probability that the true Sharpe sits above zero, given the sample. A confidence statement, not a point estimate.", gate: "High confidence above zero", value: 0.54, passed: false },
  { key: "pbo", label: "Probability of Backtest Overfitting", blurb: "Estimated by combinatorially symmetric cross-validation. The chance the best in-sample configuration is no better than median out-of-sample. Lower is better.", gate: "Below 0.20", value: 0.88, passed: false },
  { key: "cpcv", label: "Combinatorially-purged cross-validation", blurb: "Performance estimated across many purged train and test combinations, so the headline figure is not one lucky path through history.", gate: "Consistent across folds", value: "clusters at zero", passed: false },
  { key: "baseline", label: "Must-beat-baseline gate", blurb: "Every configuration tried is counted and fed into the deflation, and the strategy must beat a simple honest baseline by a margin. Beating zero is not the bar.", gate: "Beats baseline by a margin", value: "did not beat", passed: false },
];

// Ordered so the three load-bearing statistical verdicts (Deflated Sharpe,
// Probabilistic Sharpe, PBO) lead and fill the panel's emphasized LEFT column,
// followed by the three contextual / metadata fields (the equity outcome, the
// trial count, the baseline margin) in the right column. The values are read from
// the artifact and are unchanged; only the presentation order is grouped. The
// `primary: true` flag lets the renderer set the larger mono tier on the lead three.
export const RESULTS_FIELDS = [
  { key: "deflatedSharpe", label: "Deflated Sharpe", value: "0.21", unit: "gate 0.95", primary: true },
  { key: "probabilisticSharpe", label: "Probabilistic Sharpe", value: "0.54", unit: "", primary: true },
  { key: "pbo", label: "PBO", value: "0.88", unit: "gate 0.20", primary: true },
  { key: "oosEquity", label: "Out-of-sample equity", value: "-0.7%", unit: "net, 2022 to 2026" },
  { key: "trials", label: "Trials tested", value: "8", unit: "distinct" },
  { key: "baselineBeatenBy", label: "Baseline beaten by", value: "0.00", unit: "did not beat" },
];

export const EQUITY_CURVE = [
  { t: 0.0, v: 1000000.0 },
  { t: 0.0072, v: 985831.31 },
  { t: 0.0144, v: 1022088.35 },
  { t: 0.0216, v: 1036246.07 },
  { t: 0.0288, v: 1020320.3 },
  { t: 0.036, v: 994631.22 },
  { t: 0.0432, v: 1012334.89 },
  { t: 0.0504, v: 1028759.21 },
  { t: 0.0576, v: 999578.97 },
  { t: 0.0647, v: 989626.0 },
  { t: 0.0719, v: 987595.54 },
  { t: 0.0791, v: 996578.44 },
  { t: 0.0863, v: 1009138.62 },
  { t: 0.0935, v: 1022771.97 },
  { t: 0.1007, v: 1018604.76 },
  { t: 0.1079, v: 936414.73 },
  { t: 0.1151, v: 931950.24 },
  { t: 0.1223, v: 926097.23 },
  { t: 0.1295, v: 924049.3 },
  { t: 0.1367, v: 923363.25 },
  { t: 0.1439, v: 920594.39 },
  { t: 0.1511, v: 915374.93 },
  { t: 0.1583, v: 920915.02 },
  { t: 0.1655, v: 915543.31 },
  { t: 0.1727, v: 930828.34 },
  { t: 0.1799, v: 930453.54 },
  { t: 0.1871, v: 931451.14 },
  { t: 0.1942, v: 928052.4 },
  { t: 0.2014, v: 917512.44 },
  { t: 0.2086, v: 904219.71 },
  { t: 0.2158, v: 911355.27 },
  { t: 0.223, v: 907317.98 },
  { t: 0.2302, v: 898572.89 },
  { t: 0.2374, v: 903669.83 },
  { t: 0.2446, v: 907502.52 },
  { t: 0.2518, v: 905337.57 },
  { t: 0.259, v: 917176.43 },
  { t: 0.2662, v: 912083.42 },
  { t: 0.2734, v: 916425.42 },
  { t: 0.2806, v: 945342.57 },
  { t: 0.2878, v: 946263.75 },
  { t: 0.295, v: 949572.93 },
  { t: 0.3022, v: 961069.82 },
  { t: 0.3094, v: 968782.96 },
  { t: 0.3165, v: 978285.25 },
  { t: 0.3237, v: 968208.91 },
  { t: 0.3309, v: 936829.3 },
  { t: 0.3381, v: 941915.94 },
  { t: 0.3453, v: 942037.34 },
  { t: 0.3525, v: 943678.52 },
  { t: 0.3597, v: 945511.52 },
  { t: 0.3669, v: 954676.61 },
  { t: 0.3741, v: 940746.71 },
  { t: 0.3813, v: 947945.76 },
  { t: 0.3885, v: 963074.51 },
  { t: 0.3957, v: 935873.5 },
  { t: 0.4029, v: 944183.34 },
  { t: 0.4101, v: 950222.72 },
  { t: 0.4173, v: 946589.95 },
  { t: 0.4245, v: 957250.46 },
  { t: 0.4317, v: 935576.86 },
  { t: 0.4388, v: 925731.7 },
  { t: 0.446, v: 932537.82 },
  { t: 0.4532, v: 926851.71 },
  { t: 0.4604, v: 912637.29 },
  { t: 0.4676, v: 909543.57 },
  { t: 0.4748, v: 916662.71 },
  { t: 0.482, v: 918052.07 },
  { t: 0.4892, v: 928248.09 },
  { t: 0.4964, v: 948376.95 },
  { t: 0.5036, v: 928385.62 },
  { t: 0.5108, v: 946517.86 },
  { t: 0.518, v: 952138.55 },
  { t: 0.5252, v: 936421.53 },
  { t: 0.5324, v: 918124.95 },
  { t: 0.5396, v: 917213.4 },
  { t: 0.5468, v: 920248.1 },
  { t: 0.554, v: 921944.41 },
  { t: 0.5612, v: 927602.18 },
  { t: 0.5683, v: 917431.31 },
  { t: 0.5755, v: 927449.06 },
  { t: 0.5827, v: 937566.31 },
  { t: 0.5899, v: 941535.41 },
  { t: 0.5971, v: 930972.84 },
  { t: 0.6043, v: 917242.07 },
  { t: 0.6115, v: 916966.82 },
  { t: 0.6187, v: 921157.03 },
  { t: 0.6259, v: 923275.81 },
  { t: 0.6331, v: 932234.71 },
  { t: 0.6403, v: 932258.86 },
  { t: 0.6475, v: 967766.43 },
  { t: 0.6547, v: 984492.15 },
  { t: 0.6619, v: 944573.55 },
  { t: 0.6691, v: 959176.94 },
  { t: 0.6763, v: 961873.68 },
  { t: 0.6835, v: 982813.82 },
  { t: 0.6906, v: 987142.78 },
  { t: 0.6978, v: 1013627.63 },
  { t: 0.705, v: 1021825.8 },
  { t: 0.7122, v: 1033053.92 },
  { t: 0.7194, v: 1043800.77 },
  { t: 0.7266, v: 1066740.8 },
  { t: 0.7338, v: 1058204.12 },
  { t: 0.741, v: 1058034.36 },
  { t: 0.7482, v: 1049578.19 },
  { t: 0.7554, v: 1013008.19 },
  { t: 0.7626, v: 979467.05 },
  { t: 0.7698, v: 975783.61 },
  { t: 0.777, v: 980234.22 },
  { t: 0.7842, v: 1023226.41 },
  { t: 0.7914, v: 1034694.36 },
  { t: 0.7986, v: 1032287.41 },
  { t: 0.8058, v: 1020031.65 },
  { t: 0.8129, v: 1043115.04 },
  { t: 0.8201, v: 1079024.88 },
  { t: 0.8273, v: 1076292.31 },
  { t: 0.8345, v: 1065087.73 },
  { t: 0.8417, v: 1039888.75 },
  { t: 0.8489, v: 1061384.72 },
  { t: 0.8561, v: 1112646.35 },
  { t: 0.8633, v: 1114496.57 },
  { t: 0.8705, v: 1121206.47 },
  { t: 0.8777, v: 1092889.32 },
  { t: 0.8849, v: 1097979.27 },
  { t: 0.8921, v: 1115067.81 },
  { t: 0.8993, v: 1119509.0 },
  { t: 0.9065, v: 1113278.07 },
  { t: 0.9137, v: 1069225.79 },
  { t: 0.9209, v: 1071826.95 },
  { t: 0.9281, v: 1024957.98 },
  { t: 0.9353, v: 1021730.75 },
  { t: 0.9424, v: 1025761.7 },
  { t: 0.9496, v: 1023757.94 },
  { t: 0.9568, v: 1024352.05 },
  { t: 0.964, v: 1019891.85 },
  { t: 0.9712, v: 1011863.62 },
  { t: 0.9784, v: 1018022.39 },
  { t: 0.9856, v: 1006047.64 },
  { t: 0.9928, v: 1002183.55 },
  { t: 1.0, v: 993219.39 }
];

export const CAPACITY_CURVE = [
  { capital: 100000, sr_ann: 0.401, netEdge: 0.401 },
  { capital: 1000000, sr_ann: 0.042, netEdge: 0.042 },
  { capital: 10000000, sr_ann: -0.372, netEdge: -0.372 }
];

export const RESERVED_COPY = {
  slotCaption: "[ validated result, did not clear ]",
  panelNote: "This is a real, validated result. It did not clear purged walk-forward and the deflation, and we publish it in full. The crypto-only edge is a null, and the path forward is breadth.",
  capacityNote: "Annualized Sharpe versus deployed capital. The thin edge decays as size grows and turns negative well before institutional scale.",
  verdict: "NO-DEPLOY. Tested honestly, did not clear. Published in full.",
};

export function isLive() {
  return STATUS === "live";
}
