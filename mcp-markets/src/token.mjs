// token_check: what an ERC-20 token's contract can do and how much of it exists, read from the chain,
// set against a supply and unlock schedule the caller gives. The checks are of the deployed code and
// its state. They name what the contract allows, not what anyone will do with it, and a clean
// reading never means safe: vesting contracts, liquidity locks and insiders' wallets are not read.
import { z } from "zod";

import { getJson, NotFound, postJson } from "./sources.mjs";

const CHAINS = Object.freeze({
  ethereum: { id: 1, rpc: "https://ethereum-rpc.publicnode.com", coingecko: "ethereum" },
  base: { id: 8453, rpc: "https://base-rpc.publicnode.com", coingecko: "base" },
  arbitrum: { id: 42161, rpc: "https://arbitrum-one-rpc.publicnode.com", coingecko: "arbitrum-one" },
  optimism: { id: 10, rpc: "https://optimism-rpc.publicnode.com", coingecko: "optimistic-ethereum" },
  polygon: { id: 137, rpc: "https://polygon-bor-rpc.publicnode.com", coingecko: "polygon-pos" },
  bsc: { id: 56, rpc: "https://bsc-rpc.publicnode.com", coingecko: "binance-smart-chain" },
});
export const tokenInput = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "a contract address: 0x and 40 hex digits").describe("The token's contract address."),
  chain: z.enum(Object.keys(CHAINS)).optional().describe("Default ethereum."),
  announced_max_supply: z.number().positive().optional().describe("The maximum supply the project states, in whole tokens."),
  schedule: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().positive().describe("Whole tokens unlocking."), note: z.string().max(120).optional() }).strict()).max(500).optional().describe("The unlock schedule the project announces, in whole tokens. The chain does not state one, so it comes from you."),
}).strict();
export const TOKEN_LIMITS_TEXT = Object.freeze([
  "A clean reading does not mean safe. Vesting contracts, liquidity locks, insiders' wallets and promises made off-chain are not read, and a rug pull needs none of the functions checked here.",
  "Functions are found by their standard selectors in the deployed bytecode: a contract can do the same thing under another name, and a selector can be present but restricted by access rules not read here.",
  "Circulating supply is CoinGecko's estimate, not a figure from the chain. The schedule is whatever was passed in.",
]);

// Standard functions by what they let someone do; each key is the first four bytes of the keccak-256
// of the signature (the test recomputes them).
export const POWERS = Object.freeze({
  mint: { says: "can create new tokens", functions: { "40c10f19": "mint(address,uint256)", a0712d68: "mint(uint256)", "449a52f8": "mintTo(address,uint256)", cc872b66: "issue(uint256)", "867904b4": "issue(address,uint256)", b921e163: "increaseSupply(uint256)", "827f32c0": "generateTokens(address,uint256)", a1448194: "safeMint(address,uint256)", "8c2a993e": "bridgeMint(address,uint256)", "18bf5077": "crosschainMint(address,uint256)" } },
  pause: { says: "can stop all transfers", functions: { "8456cb59": "pause()", "47af9957": "pauseTransfers()", "62a5af3b": "freeze()", "16c38b3c": "setPaused(bool)" } },
  blacklist: { says: "can block a wallet from moving its tokens", functions: { f9f92be4: "blacklist(address)", "0ecb93c0": "addBlackList(address)", "44337ea1": "addToBlacklist(address)", ad2bb1b3: "blockAddress(address)", "8d1fdf2f": "freeze(address)", f26c159f: "freezeAccount(address)", e724529c: "freezeAccount(address,bool)", "153b0d1e": "setBlacklist(address,bool)", "68092bd9": "setBlackList(address,bool)", f3bdc228: "destroyBlackFunds(address)" } },
  upgrade: { says: "can be replaced with different code", functions: { "3659cfe6": "upgradeTo(address)", "4f1ef286": "upgradeToAndCall(address,bytes)", "99a88ec4": "upgrade(address,address)", "9623609d": "upgradeAndCall(address,address,bytes)" } },
  set_fees: { says: "can change a fee or limit on transfers", functions: { "69fe0e2d": "setFee(uint256)", "0b78f9c0": "setFees(uint256,uint256)", "2e5bb6ff": "setTax(uint256)", "061c82d0": "setTaxFeePercent(uint256)", "8ee88c53": "setLiquidityFeePercent(uint256)", "0cc835a3": "setBuyFee(uint256)", "8b4cee08": "setSellFee(uint256)", dc1052e2: "setBuyTax(uint256)", "8cd09d50": "setSellTax(uint256)", c0324c77: "setParams(uint256,uint256)", "8f02bb5b": "setTransferFee(uint256)", d543dbeb: "setMaxTxPercent(uint256)", ec28438a: "setMaxTxAmount(uint256)" } },
});
const TRANSFER = "a9059cbb";

// The code walked opcode by opcode, so data after a PUSH is not read as code: the four-byte values
// it pushes (how a contract routes its functions), and whether it hands calls to other code.
export function scanCode(code) {
  const hex = String(code ?? "").replace(/^0x/, "").toLowerCase(), selectors = new Set();
  let delegates = false;
  for (let i = 0; i < hex.length;) {
    const op = parseInt(hex.slice(i, i + 2), 16);
    i += 2;
    if (op === 0xf4) delegates = true;
    if (op >= 0x60 && op <= 0x7f) { if (op === 0x63) selectors.add(hex.slice(i, i + 8)); i += (op - 0x5f) * 2; }
  }
  return { selectors, delegates };
}
export function powersIn(selectors) {
  const out = {}, found = {};
  for (const [k, p] of Object.entries(POWERS)) {
    const hits = Object.entries(p.functions).filter(([sel]) => selectors.has(sel)).map(([, sig]) => sig);
    out[k] = hits.length > 0;
    if (hits.length) found[k] = hits;
  }
  return { powers: out, found };
}
// Where proxies keep the code they run: EIP-1967, the older ZeppelinOS slot, and EIP-1822.
const IMPLEMENTATION_SLOTS = ["0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3", "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7"];
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const ADMIN_SLOTS = ["0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103", "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b"];
const CLONE = /^(?:0x)?363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i;

const ZERO = /^0x0*$/;
const addressOf = (word) => (word && word.length >= 42 && !ZERO.test(word) ? `0x${word.slice(-40).toLowerCase()}` : null);
// An ABI string: a dynamic string, or the old bytes32 kind a few tokens return.
export function decodeString(hex) {
  const h = (hex ?? "").replace(/^0x/, "");
  if (!h) return null;
  if (h.length >= 128) {
    const len = parseInt(h.slice(64, 128), 16);
    if (Number.isFinite(len) && len > 0 && len < 200 && h.length >= 128 + len * 2) return Buffer.from(h.slice(128, 128 + len * 2), "hex").toString("utf8").replace(/\0+$/, "");
  }
  if (h.length === 64) return Buffer.from(h, "hex").toString("utf8").replace(/\0+$/, "").trim() || null;
  return null;
}
const wholeTokens = (word, decimals) => {
  if (!word || word === "0x") return null;
  const raw = BigInt(word), scale = 10n ** BigInt(decimals);
  return Number(raw / scale) + Number(raw % scale) / Number(scale);
};

async function callOf(session, url, to, selector) {
  try { return await rpc(session, url, "eth_call", [{ to, data: `0x${selector}` }, "latest"]); } catch (err) { if (err.reverted) return null; throw err; }
}
async function rpc(session, url, method, params) {
  const r = await postJson(session, url, { jsonrpc: "2.0", id: 1, method, params }, { retries: 2 });
  if (r?.error) { const err = new Error(r.error.message ?? "the call failed"); err.reverted = true; throw err; }
  return r?.result ?? null;
}

// Set against the schedule: how much is unscheduled, and how much lands soon.
export function scheduleCheck({ total, circulating, announcedMax, schedule, today }) {
  const out = {}, flags = [];
  if (announcedMax && total !== null && total > announcedMax * 1.000001) flags.push(`The chain holds ${Math.round(total).toLocaleString("en-US")} tokens, more than the ${announcedMax.toLocaleString("en-US")} announced as the maximum.`);
  if (schedule?.length) {
    const ahead = schedule.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const sum = ahead.reduce((n, s) => n + s.amount, 0), within = (days) => ahead.filter((s) => (Date.parse(s.date) - Date.parse(today)) / 86400000 <= days).reduce((n, s) => n + s.amount, 0);
    out.scheduled_ahead = sum;
    out.next_90_days = within(90);
    out.next_365_days = within(365);
    out.next_unlock = ahead[0] ?? null;
    if (circulating) {
      out.next_90_days_share_of_circulating = within(90) / circulating;
      out.next_365_days_share_of_circulating = within(365) / circulating;
      if (total !== null && circulating <= total * 1.01) {
        const planned = circulating + sum, gap = total - planned;
        out.circulating_plus_scheduled = planned;
        out.total_minus_that = gap;
        if (Math.abs(gap) > total * 0.01) flags.push(gap > 0 ? `${Math.round(gap).toLocaleString("en-US")} tokens on the chain are neither circulating nor on the announced schedule.` : `The schedule and circulating supply come to ${Math.round(-gap).toLocaleString("en-US")} more tokens than the chain holds: the rest would have to be minted.`);
      }
      if (within(365) / circulating > 0.25) flags.push(`Unlocks in the next year come to ${Math.round(100 * within(365) / circulating)}% of the circulating supply.`);
    }
  }
  return { check: out, flags };
}

export async function tokenCheck(session, args) {
  const a = tokenInput.parse(args);
  const name = a.chain ?? "ethereum", chain = CHAINS[name], address = a.address.toLowerCase();
  const url = session.env?.[`CANLI_RPC_${name.toUpperCase()}`] || chain.rpc;
  const call = (selector) => callOf(session, url, address, selector);
  const code = await rpc(session, url, "eth_getCode", [address, "latest"]);
  if (!code || code === "0x") throw new NotFound(`There is no contract at ${address} on ${name}.`);
  const slot = (at, where = address) => rpc(session, url, "eth_getStorageAt", [where, at, "latest"]);
  const clone = CLONE.exec(code)?.[1]?.toLowerCase();
  let implementation = clone ? `0x${clone}` : null;
  for (const at of IMPLEMENTATION_SLOTS) { if (implementation) break; implementation = addressOf(await slot(at)); }
  if (!implementation) {
    const beacon = addressOf(await slot(BEACON_SLOT));
    if (beacon) implementation = addressOf(await callOf(session, url, beacon, "5c60da1b"));
  }
  const own = scanCode(code);
  if (!implementation && own.delegates && !own.selectors.has(TRANSFER)) implementation = addressOf(await callOf(session, url, address, "5c60da1b"));
  let proxyAdmin = null;
  for (const at of ADMIN_SLOTS) { if (proxyAdmin) break; proxyAdmin = addressOf(await slot(at)); }
  const logic = implementation ? scanCode(await rpc(session, url, "eth_getCode", [implementation, "latest"])) : null;
  const selectors = new Set([...own.selectors, ...(logic?.selectors ?? [])]);
  // Fail closed: if the code read never shows transfer, its routing was not read, so no power can be ruled out.
  const powersRead = selectors.has(TRANSFER);
  const { powers: seen, found } = powersIn(selectors);
  const powers = powersRead ? seen : Object.fromEntries(Object.keys(POWERS).map((k) => [k, seen[k] ? true : null]));
  if (implementation) powers.upgrade = true;
  const [nameHex, symbolHex, decimalsHex, totalHex, ownerHex, minterHex] = await Promise.all(["06fdde03", "95d89b41", "313ce567", "18160ddd", "8da5cb5b", "07546172"].map(call));
  const decimals = decimalsHex && decimalsHex !== "0x" ? Number(BigInt(decimalsHex)) : null;
  if (decimals === null || !totalHex || totalHex === "0x") throw new NotFound(`The contract at ${address} on ${name} does not answer as an ERC-20 token.`);
  const total = wholeTokens(totalHex, decimals), owner = addressOf(ownerHex), minter = addressOf(minterHex);
  const renounced = ownerHex && ownerHex !== "0x" ? ZERO.test(ownerHex) : null;
  let verified = null, verifiedNote = null;
  try { const s = await getJson(session, `https://sourcify.dev/server/v2/contract/${chain.id}/${implementation ?? address}`, { retries: 1 }); verified = Boolean(s?.match); } catch (err) { if (err instanceof NotFound) verified = false; else verifiedNote = "Sourcify could not be reached."; }
  let market = null;
  try {
    const c = await getJson(session, `https://api.coingecko.com/api/v3/coins/${chain.coingecko}/contract/${address}`, { retries: 1 });
    const m = c?.market_data;
    if (m) market = { circulating: m.circulating_supply ?? null, max: m.max_supply ?? null, fully_diluted_usd: m.fully_diluted_valuation?.usd ?? null, market_cap_usd: m.market_cap?.usd ?? null };
  } catch { /* CoinGecko's free tier throttles: the supply reading goes without it */ }
  const today = new Date(session.now()).toISOString().slice(0, 10);
  const { check, flags: planFlags } = scheduleCheck({ total, circulating: market?.circulating ?? null, announcedMax: a.announced_max_supply ?? null, schedule: a.schedule, today });
  const held = Object.entries(powers).filter(([, v]) => v === true).map(([k]) => k);
  const flags = [...planFlags];
  if (!powersRead) flags.push("Its routing could not be read from the bytecode, so its powers are unknown: nothing below rules any out.");
  if (powers.mint && renounced !== true) flags.push(`The contract ${POWERS.mint.says}${minter ? `, and ${minter} is its minter` : owner ? `, and an owner (${owner}) can likely reach it` : ""}.`);
  for (const k of ["pause", "blacklist", "set_fees"]) if (powers[k]) flags.push(`The contract ${POWERS[k].says}.`);
  if (powers.upgrade) flags.push(`The contract ${POWERS.upgrade.says}${proxyAdmin ? ` by its admin (${proxyAdmin})` : ""}, so anything read here can change.`);
  if (verified === false) flags.push("Its source code is not verified on Sourcify; only the bytecode was read.");
  const multichain = Boolean(market?.circulating && total && market.circulating > total * 1.01);
  if (multichain) flags.push(`The circulating estimate is above this contract's total, so the token also lives on other chains; supply is compared here only for this chain.`);
  if (!multichain && market?.circulating && total && market.circulating / total < 0.5) flags.push(`Only ${Math.round(100 * market.circulating / total)}% of the supply is estimated to circulate.`);
  return {
    chain: name, address,
    token: { name: decodeString(nameHex), symbol: decodeString(symbolHex), decimals },
    supply: { on_chain_total: total, ...(market ? { circulating_estimate: market.circulating, stated_max: market.max, market_cap_usd: market.market_cap_usd, fully_diluted_usd: market.fully_diluted_usd } : {}), ...(a.announced_max_supply ? { announced_max: a.announced_max_supply } : {}) },
    contract: { powers, powers_read: powersRead, functions_found: found, proxy: Boolean(implementation), implementation, proxy_admin: proxyAdmin, owner, minter, owner_renounced: renounced, source_verified: verified, ...(verifiedNote ? { source_note: verifiedNote } : {}) },
    ...(a.schedule ? { schedule_check: check } : {}),
    flags,
    plain_reading: `${decodeString(symbolHex) ?? "This token"} on ${name}: ${Math.round(total ?? 0).toLocaleString("en-US")} tokens on the chain. ${!powersRead ? "Its powers could not be read." : held.length ? `By its standard functions the contract can: ${held.map((k) => k.replace("_", " ")).join(", ")}.` : "None of the standard functions checked was found, which does not make it safe."}${flags.length ? ` ${flags.length} ${flags.length === 1 ? "point" : "points"} to read.` : ""}`,
    limits: TOKEN_LIMITS_TEXT,
  };
}
