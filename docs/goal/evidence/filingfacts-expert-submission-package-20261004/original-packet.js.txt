// The same immutable packet content is hashed in the browser and the offline review tools.
import { canonicalJson } from "../scripts/canonical-json.mjs";

const ITEM_FIELDS = ["id", "template", "company", "question", "answer", "filings"];

export function packetContent(packet) {
  const items = [...packet.labels]
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((label) => Object.fromEntries(ITEM_FIELDS.filter((key) => label[key] !== undefined).map((key) => [key, label[key]])));
  return canonicalJson({ schema: packet.schema, items });
}
