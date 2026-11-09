// Loaded with --import by the stream test: a WebSocket that plays Coinbase's ticker, a price every 150 ms for each
// pair subscribed, so nothing leaves the machine.
let n = 0;
globalThis.WebSocket = class {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.timer = null;
    setTimeout(() => this.emit("open", {}), 10);
  }
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  emit(name, event) { for (const fn of this.listeners[name] ?? []) fn(event); }
  send(text) {
    const m = JSON.parse(text);
    if (m.type !== "subscribe" || !this.url.includes("coinbase")) return;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      for (const p of m.product_ids) { n += 1; this.emit("message", { data: JSON.stringify({ type: "ticker", product_id: p, price: String(70000 + n), time: new Date().toISOString() }) }); }
    }, 150);
  }
  close() { clearInterval(this.timer); this.emit("close", {}); }
};
