// Loaded with --import by the quote test: Yahoo's chart data answers with a price a cent higher at each request,
// and nothing else leaves the machine.
let n = 0;
globalThis.fetch = async (input) => {
  const url = String(input?.url ?? input);
  const m = /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)/.exec(url);
  if (!m) return new Response("offline in this test", { status: 404 });
  n += 1;
  const meta = { symbol: decodeURIComponent(m[1]), currency: "USD", regularMarketPrice: 100 + n / 100, previousClose: 100, regularMarketTime: 1791000000 + n };
  return new Response(JSON.stringify({ chart: { result: [{ meta }] } }), { status: 200, headers: { "content-type": "application/json" } });
};
