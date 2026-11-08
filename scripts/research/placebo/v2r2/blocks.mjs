// Placebo study v2, round 2: the block permutation. The rows to be reordered are cut into blocks of
// `b` consecutive months and the blocks are shuffled, the same order for every series, so the order
// of months inside a block survives (short-range volatility clustering, and any short-range
// dependence). When the number of rows is not a multiple of b, the first r = n mod b rows stay where
// they are and only the m = floor(n / b) full blocks after them move. The reorderings are then the
// permutations of m equal blocks, a group, so the random-permutation argument of Hemerik and Goeman
// (2018) applies: the test is exact whenever the m blocks are exchangeable given the first r rows (for
// example when months are independent and identically distributed). js/placebo-core.js's
// block_permute keeps a shorter last block and moves it too; those reorderings are not a group, which
// is why round 2 does not use it.

/** A uniform integer in [0, k) from a uniform generator in (0, 1). */
const below = (next, k) => Math.min(k - 1, Math.floor(next() * k));

/** One block reordering of n rows: out[t] is the real row placed at t. */
export function blockOrder(n, b, next) {
  if (!Number.isInteger(b) || b < 1 || b > n) throw new RangeError(`block length must be a whole number from 1 to ${n}`);
  const m = Math.floor(n / b), r = n - m * b;
  const blocks = Int32Array.from({ length: m }, (_, k) => k);
  for (let i = m - 1; i > 0; i--) {
    const j = below(next, i + 1);
    const v = blocks[i]; blocks[i] = blocks[j]; blocks[j] = v;
  }
  const out = new Int32Array(n);
  for (let t = 0; t < r; t++) out[t] = t;
  let at = r;
  for (const k of blocks) for (let t = 0; t < b; t++) out[at++] = r + k * b + t;
  return out;
}

/** Rows 0..from-1 kept in place; rows from..n-1 block-reordered among themselves. */
export function partialBlockOrder(n, from, b, next) {
  const tail = blockOrder(n - from, b, next);
  const idx = new Int32Array(n);
  for (let t = 0; t < from; t++) idx[t] = t;
  for (let t = from; t < n; t++) idx[t] = from + tail[t - from];
  return idx;
}
