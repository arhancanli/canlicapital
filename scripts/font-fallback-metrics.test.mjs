// Metric-matched local fallbacks for Inter and Bricolage Grotesque: the fonts
// declared by css/home.css and css/product-shell.css. Without size-adjust and
// ascent-override tuned to the real webfont's metrics, the swap from a system
// font to the downloaded webfont measured 0.016 to 0.040 CLS on the mobile
// homepage. This checks the actual CSS on disk, not the derivation, so an
// edit that drops a property or breaks the font-stack wiring fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const REQUIRED_PROPERTIES = ["src: local(", "size-adjust:", "ascent-override:", "descent-override:", "line-gap-override:"];

for (const [file, families] of [
  ["css/home.css", ["Inter Fallback", "Bricolage Grotesque Fallback"]],
  ["css/product-shell.css", ["Inter Fallback", "Bricolage Grotesque Fallback"]],
]) {
  test(`${file} declares a metric-matched @font-face for each fallback family`, () => {
    const css = read(file);
    for (const family of families) {
      const block = [...css.matchAll(/@font-face\s*{([^}]*)}/gs)].map((m) => m[0]).find((b) => b.includes(`"${family}"`));
      assert.ok(block, `${file}: no @font-face for "${family}"`);
      for (const property of REQUIRED_PROPERTIES) {
        assert.ok(block.includes(property), `${file}: "${family}" @font-face is missing ${property}`);
      }
    }
  });

  test(`${file} wires each fallback family into its font stack, right after the real webfont`, () => {
    const css = read(file);
    assert.match(css, /"Inter",\s*"Inter Fallback"/, `${file}: Inter Fallback is not the first fallback after Inter`);
    assert.match(
      css,
      /"Bricolage Grotesque",\s*"Bricolage Grotesque Fallback"/,
      `${file}: Bricolage Grotesque Fallback is not the first fallback after Bricolage Grotesque`,
    );
  });
}
