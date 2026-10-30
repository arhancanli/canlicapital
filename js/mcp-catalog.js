// Filters /mcp-servers/tools as you type and opens the theme a link points at. Without JavaScript
// every theme still opens by hand.
const box = document.querySelector(".mcp-tools__filter");
const input = document.getElementById("mcp-tool-filter");
const openFor = (id) => { const target = id ? document.getElementById(id) : null; const fold = target?.closest("details"); if (fold) { fold.open = true; target.scrollIntoView(); } };
openFor(decodeURIComponent(location.hash.slice(1)));
window.addEventListener("hashchange", () => openFor(decodeURIComponent(location.hash.slice(1))));
if (box && input) {
  box.hidden = false;
  const items = [...document.querySelectorAll(".mcp-tools__list > li")];
  const folds = [...document.querySelectorAll("details.mcp-tools__group")];
  const packs = [...document.querySelectorAll(".mcp-tools__pack")];
  const count = document.getElementById("mcp-tool-count");
  const hasHit = (el) => el.querySelector(".mcp-tools__list > li:not([hidden])");
  input.addEventListener("input", () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const item of items) {
      const hit = words.every((w) => item.dataset.search.includes(w));
      item.hidden = !hit;
      if (hit) shown++;
    }
    for (const fold of folds) { fold.hidden = !hasHit(fold); fold.open = words.length > 0 && !fold.hidden; }
    for (const pack of packs) pack.hidden = !hasHit(pack);
    count.textContent = words.length ? `${shown} of ${items.length} tools` : "";
  });
}
