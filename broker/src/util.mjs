// What every part shares: text from a file or a broker made safe to print, and refusals people can read.
import { createHash } from "node:crypto";

export class Refused extends Error {}

// Control characters and direction overrides could repaint the terminal or disguise what is printed.
export const clean = (v, max = 300) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").trim().slice(0, max);
export const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const money = (x) => (x === null || x === undefined ? "unknown" : `$${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
export const isCrypto = (symbol) => symbol.includes("/");
