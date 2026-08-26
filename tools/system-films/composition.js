import { gsap } from "gsap";

const filmId = new URL(window.location.href).searchParams.get("film") || "engine";
const state = await fetch("/system-films/state.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error(`system film state returned ${response.status}`);
  return response.json();
});
const film = state.films.find((candidate) => candidate.id === filmId);
if (!film) throw new Error(`unknown system film ${filmId}`);

const root = document.getElementById("film");
root.dataset.compositionId = `system-film-${film.id}`;
root.dataset.filmId = film.id;
document.getElementById("film-basis").textContent = film.basis;
document.getElementById("film-ordinal").textContent = film.ordinal;
document.getElementById("film-title").textContent = film.title;
document.getElementById("film-status").textContent = film.status;
document.getElementById("film-time").textContent = film.timestamp.replace("T", " ").replace("+00:00", " UTC");
document.getElementById("film-source").textContent = film.source.artifact_url;

const metrics = document.getElementById("film-metrics");
film.metrics.forEach((metric, index) => {
  const item = document.createElement("article");
  item.className = "film__metric";
  item.style.setProperty("--metric-fill", String(.54 + (index * .16)));
  item.innerHTML = `<span></span><strong>0</strong><b aria-hidden="true"></b>`;
  item.querySelector("span").textContent = metric.label;
  item.dataset.value = String(metric.value);
  metrics.append(item);
});

const visual = document.getElementById("film-visual");
const sleeveNames = {
  alphamax: "ALPHAMAX",
  managed_futures: "ALPHATREND",
  alphavintage: "ALPHAVINTAGE",
};

if (film.id === "engine") {
  const field = document.createElement("div");
  field.className = "engine-field";
  field.innerHTML = `${Array.from({ length: 12 }, () => '<i class="engine-node"></i>').join("")}<div class="engine-spine"></div><div class="engine-lock">IDENTITY<br>FROZEN</div>`;
  visual.append(field);
}

if (film.id === "broker") {
  const field = document.createElement("div");
  field.className = "broker-field";
  film.rails.forEach((rail) => {
    const row = document.createElement("div");
    row.className = "broker-rail";
    row.innerHTML = `<i class="broker-rail__signal"></i><strong></strong><span>ALPACA / PAPER ONLY</span><em></em>`;
    row.querySelector("strong").textContent = sleeveNames[rail.id] || rail.id.toUpperCase();
    row.querySelector("em").textContent = rail.passes ? "OBSERVED / PASS" : "CHECK OPEN";
    field.append(row);
  });
  field.insertAdjacentHTML("beforeend", '<div class="broker-sweep"></div>');
  visual.append(field);
}

if (film.id === "record") {
  const field = document.createElement("div");
  field.className = "record-field";
  field.innerHTML = `<div class="record-chain"><div class="record-progress"></div>${Array.from({ length: 9 }, () => '<i class="record-node"></i>').join("")}</div><div class="record-seal"><span>CHAIN HEAD / SHA256 PREFIX</span><code></code></div>`;
  field.querySelector("code").textContent = film.head_hash_prefix;
  visual.append(field);
}

window.__timelines = window.__timelines || {};
const timeline = gsap.timeline({ paused: true });
const counters = [];

gsap.set(root, { opacity: 0 });
gsap.set([".film__basis", ".film__ordinal", "h1", ".film__status", ".film__visual", ".film__metric", ".film__footer", ".film__clock"], { opacity: 0 });

timeline.to(root, { opacity: 1, duration: .45, ease: "power1.out" }, 0);
timeline.fromTo(".film__clock", { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: .5, ease: "power2.out" }, .2);
timeline.fromTo(".film__basis", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .55, ease: "power2.out" }, .45);
timeline.fromTo(".film__ordinal", { opacity: 0, scale: .94 }, { opacity: 1, scale: 1, duration: .8, ease: "power2.out" }, .55);
timeline.fromTo("h1", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .78, ease: "power3.out" }, .72);
timeline.fromTo(".film__status", { opacity: 0, y: 9 }, { opacity: 1, y: 0, duration: .48, ease: "power2.out" }, 1.25);
timeline.fromTo(".film__visual", { opacity: 0, x: 28, scale: .985 }, { opacity: 1, x: 0, scale: 1, duration: .82, ease: "power3.out" }, .92);
timeline.fromTo("#film-glow", { opacity: 0, scale: .88 }, { opacity: .28, scale: 1, duration: 1.1, ease: "power2.out" }, 1.1);

if (film.id === "engine") {
  timeline.fromTo(".engine-node", { opacity: 0, scale: .45, y: 9 }, { opacity: 1, scale: 1, y: 0, duration: .42, ease: "back.out(1.45)", stagger: .065 }, 1.65);
  timeline.fromTo(".engine-spine", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 1.1, ease: "power2.out" }, 2.45);
  timeline.fromTo(".engine-lock", { opacity: 0, scale: .88 }, { opacity: 1, scale: 1, duration: .68, ease: "back.out(1.3)" }, 3.15);
}

if (film.id === "broker") {
  timeline.fromTo(".broker-rail", { opacity: 0, x: 32 }, { opacity: 1, x: 0, duration: .55, ease: "power3.out", stagger: .08 }, 1.55);
  timeline.fromTo(".broker-rail__signal", { scaleY: 0 }, { scaleY: 1, duration: .5, ease: "power2.out", stagger: .08 }, 1.78);
  timeline.fromTo(".broker-sweep", { x: -220, opacity: 0 }, { x: 700, opacity: .36, duration: 1.35, ease: "none" }, 3.2);
  timeline.to(".broker-sweep", { opacity: 0, duration: .3, ease: "power1.in" }, 4.25);
}

if (film.id === "record") {
  timeline.to(".record-progress", { scaleX: 1, duration: 1.7, ease: "power2.out" }, 1.7);
  timeline.fromTo(".record-node", { opacity: 0, scale: .55 }, { opacity: 1, scale: 1, duration: .38, ease: "back.out(1.35)", stagger: .075 }, 1.75);
  timeline.fromTo(".record-seal", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .62, ease: "power3.out" }, 3.55);
}

timeline.fromTo(".film__metric", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .55, ease: "power3.out", stagger: .08 }, 4.1);
timeline.fromTo(".film__metric b", { scaleX: 0 }, { scaleX: 1, duration: .82, ease: "power2.out", stagger: .08 }, 4.28);

document.querySelectorAll(".film__metric").forEach((item, index) => {
  const target = Number(item.dataset.value);
  const counter = { value: 0 };
  counters.push(counter);
  timeline.to(counter, {
    value: target,
    duration: .9,
    ease: "power2.out",
    onUpdate: () => {
      item.querySelector("strong").textContent = Math.round(counter.value).toLocaleString("en-US");
    },
  }, 4.18 + (index * .08));
});

timeline.fromTo(".film__footer", { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .5, ease: "power1.out" }, 5.05);
const breathe = { phase: 0 };
timeline.to(breathe, {
  phase: Math.PI * 4,
  duration: 5,
  ease: "none",
  onUpdate: () => {
    const wave = Math.sin(breathe.phase);
    const glow = document.getElementById("film-glow");
    glow.style.opacity = String(.28 + (wave * .018));
    glow.style.transform = `scale(${1 + (wave * .012)})`;
  },
}, 5.15);
timeline.to(root, { opacity: 0, duration: .85, ease: "power2.inOut" }, 11.15);

window.__timelines[root.dataset.compositionId] = timeline;
window.seekSystemFilm = (seconds) => {
  timeline.time(Math.max(0, Math.min(Number(root.dataset.duration), Number(seconds))), false);
  return timeline.time();
};
await document.fonts.ready;
window.seekSystemFilm(0);
window.__SYSTEM_FILM_READY__ = true;
