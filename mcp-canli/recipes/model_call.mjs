// A POST that waits as long as the model needs. Node's fetch gives up after five minutes with no reply,
// and a local model on a small machine can take longer than that to start answering.
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export const patientFetch = (url, { method = "POST", headers = {}, body = "", timeoutMs = 30 * 60 * 1000 } = {}) => new Promise((resolve, reject) => {
  const target = new URL(url);
  const req = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, { method, headers, timeout: timeoutMs }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("error", reject);
    res.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => text, json: async () => JSON.parse(text) });
    });
  });
  req.on("timeout", () => req.destroy(new Error(`The model did not answer in ${timeoutMs / 60000} minutes.`)));
  req.on("error", reject);
  req.end(body);
});
