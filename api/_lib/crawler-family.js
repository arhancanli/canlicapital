// Which kind of client asked for a page, from its User-Agent, in a few broad families. The company pages are
// crawled far more than they are read, and what that crawling costs depends on who does it, so the handler logs
// a small sample of these families (never the full User-Agent, never an address).
const FAMILIES = [
  ["google", /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google/i],
  ["bing", /bingbot|BingPreview|msnbot/i],
  ["apple", /Applebot/i],
  ["duckduckgo", /DuckDuckBot|DuckAssistBot/i],
  ["yandex", /YandexBot|YandexMobileBot/i],
  ["baidu", /Baiduspider/i],
  ["openai", /GPTBot|OAI-SearchBot|ChatGPT-User/i],
  ["anthropic", /ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai/i],
  ["perplexity", /PerplexityBot|Perplexity-User/i],
  ["commoncrawl", /CCBot/i],
  ["amazon", /Amazonbot/i],
  ["bytedance", /Bytespider|TikTokSpider/i],
  ["meta", /meta-externalagent|meta-externalfetcher|facebookexternalhit|FacebookBot/i],
  ["seo-tool", /AhrefsBot|SemrushBot|MJ12bot|DotBot|BLEXBot|PetalBot|DataForSeoBot|Barkrowler|SeekportBot|serpstatbot|SiteAuditBot|Screaming Frog/i],
  ["other-bot", /bot|crawl|spider|slurp|fetch|scan|python-requests|curl\/|wget|Go-http-client|axios|node-fetch|undici|HeadlessChrome/i],
];
export function crawlerFamily(userAgent) {
  if (typeof userAgent !== "string" || !userAgent.trim()) return "none";
  for (const [family, pattern] of FAMILIES) if (pattern.test(userAgent)) return family;
  return /Mozilla\//.test(userAgent) ? "browser" : "other";
}
