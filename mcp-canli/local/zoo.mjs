// The Null Zoo registry on this machine: every strategy red_team tried, kept across sessions, so the next session
// knows how many tries came before it on the same data and which ideas already failed. One line per trial in
// CANLI_HOME/null-zoo/trials.jsonl, each encrypted with AES-256-GCM and chained to the one before by the hash of its
// plain record, so a line removed or changed shows. The key is CANLI_ZOO_KEY (64 hex characters, for a key kept in a
// password manager or keychain) or, without it, CANLI_HOME/null-zoo/key, made on first use and readable only by its
// owner. Encryption protects the file when it is copied, synced or shared without the key; it does not protect it
// from someone who can read this account's files. Nothing here is sent anywhere, and the hosted server never loads it.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ZOO_SCHEMA = "canli.null-zoo.trial.v1";
const GENESIS = "0".repeat(64);
const sha = (s) => createHash("sha256").update(s).digest("hex");

function keyOf(dir, env) {
  const given = env.CANLI_ZOO_KEY;
  if (given !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(given)) throw new Error("CANLI_ZOO_KEY must be 64 hex characters (32 bytes).");
    return { key: Buffer.from(given, "hex"), from: "CANLI_ZOO_KEY" };
  }
  const file = join(dir, "key");
  try { writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" }); } catch (e) { if (e.code !== "EEXIST") throw e; }
  return { key: Buffer.from(readFileSync(file, "utf8").trim(), "hex"), from: file };
}

export function openZoo(home, { env = process.env } = {}) {
  const dir = join(home, "null-zoo");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { key, from } = keyOf(dir, env);
  const file = join(dir, "trials.jsonl");
  const seal = (record) => {
    const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([c.update(JSON.stringify(record), "utf8"), c.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
  };
  const open = (line, at) => {
    const box = JSON.parse(line);
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
    d.setAuthTag(Buffer.from(box.tag, "base64"));
    try { return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]).toString("utf8")); }
    catch { throw new Error(`Null Zoo line ${at} cannot be read with this key (${from}): a different key, or the line was changed.`); }
  };
  return {
    file, keyFrom: from,
    // Every record, checked against its chain; broken is the first line where the chain fails, or null.
    read() {
      let text;
      try { text = readFileSync(file, "utf8"); } catch (e) { if (e.code === "ENOENT") return { records: [], broken: null }; throw e; }
      const lines = text.split("\n").filter(Boolean);
      const records = [];
      let prev = GENESIS, broken = null;
      lines.forEach((line, i) => {
        const r = open(line, i + 1);
        const { hash, ...plain } = r;
        if (broken === null && (r.prev !== prev || sha(JSON.stringify(plain)) !== hash)) broken = i + 1;
        prev = hash;
        records.push(r);
      });
      return { records, broken };
    },
    append(rows) {
      let prev = this.read().records.at(-1)?.hash ?? GENESIS;
      const out = [];
      for (const row of rows) {
        const plain = { schema: ZOO_SCHEMA, ...row, prev };
        const record = { ...plain, hash: sha(JSON.stringify(plain)) };
        appendFileSync(file, `${seal(record)}\n`, { mode: 0o600 });
        prev = record.hash;
        out.push(record);
      }
      return out;
    },
  };
}
