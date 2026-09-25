// Original ALPHAC cutaway. Geometry is illustrative; the curves are not.
// Redraw on input only, with no idle animation loop or renderer dependency.
const journey = document.querySelector("[data-engine-journey]");
const canvas = journey?.querySelector(".engine-canvas");
const preference = matchMedia("(min-width: 1000px) and (prefers-reduced-motion: no-preference)");
const colors = ["#7797ff", "#f4a46b", "#c6d5ec", "#82d2c5"];
const keys = ["alphamax", "managed_futures", "alphavintage", "alphaforge"];
let model, context;
let queued = 0;
let pointer = 0;
let visible = true;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function render() {
  queued = 0;
  if (!model || !context || !preference.matches || document.hidden || !visible) return;
  const width = innerWidth;
  const height = Math.max(400, innerHeight - 78);
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const bounds = journey.getBoundingClientRect();
  const progress = clamp(-bounds.top / Math.max(1, bounds.height - height));
  const spread = 36 + 68 * Math.sin(clamp(progress * 1.65) * Math.PI / 2);
  const angle = -.32 + progress * .7 + pointer * .04;
  const tilt = .49 + progress * .15;
  const scale = Math.min(width * .00091, height * .00145);
  const center = [width * .765, height * .43];
  const project = ([x, y, z]) => {
    const rx = x * Math.cos(angle) - z * Math.sin(angle);
    // Keep the time axis horizontal: camera yaw must not invent an uptrend.
    const rz = z * Math.cos(angle);
    return [center[0] + rx * scale, center[1] + (rz * Math.sin(tilt) - y * Math.cos(tilt)) * scale];
  };
  const path = (points, stroke, fill, lineWidth = 1, close = false) => {
    context.beginPath();
    points.forEach((point, index) => {
      const [x, y] = project(point);
      if (index) context.lineTo(x, y); else context.moveTo(x, y);
    });
    if (close) context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
  };
  const glow = context.createRadialGradient(center[0], center[1], 0, center[0], center[1], width * .39);
  glow.addColorStop(0, "#29427638"); glow.addColorStop(.5, "#142b5119"); glow.addColorStop(1, "#080b1000");
  context.fillStyle = glow; context.fillRect(0, 0, width, height);
  // The enclosure is a metaphor, never a market price or execution event.
  const half = 205;
  const top = spread * 1.5 + 40;
  const bottom = -top;
  const opacity = Math.round(34 * (1 - progress * .65)).toString(16).padStart(2, "0");
  const box = [[-half, bottom, -135], [half, bottom, -135], [half, bottom, 135], [-half, bottom, 135]];
  path(box, `#b4ccff${opacity}`, "#5b83cd05", 1, true);
  path(box.map(([x, , z]) => [x, top, z]), `#b4ccff${opacity}`, "#99bbff05", 1, true);
  box.forEach(([x, y, z]) => path([[x, y, z], [x, top, z]], `#b4ccff${opacity}`));
  for (let i = 3; i >= 0; i--) {
    const layer = model[i];
    const y = (1.5 - i) * spread;
    const color = colors[i];
    const plane = [[-190, y, -120], [190, y, -120], [190, y, 120], [-190, y, 120]];
    const first = project(plane[0]);
    const last = project(plane[2]);
    const glass = context.createLinearGradient(first[0], first[1], last[0], last[1]);
    glass.addColorStop(0, `${color}26`); glass.addColorStop(.5, `${color}06`); glass.addColorStop(1, `${color}18`);
    path(plane, `${color}90`, glass, 1, true);
    for (let x = -152; x < 190; x += 38) path([[x, y, -120], [x, y, 120]], `${color}13`, null, .7);
    for (let z = -90; z <= 90; z += 30) path([[-190, y, z], [190, y, z]], `${color}13`, null, .7);
    context.setLineDash([3, 5]);
    path([[-190, y, 0], [190, y, 0]], `${color}55`, null, .8);
    context.setLineDash([]);
    path(layer.points.map(p => [p.x, y, p.z]), color, null, 2);
    const endpoint = layer.points.at(-1);
    const [ex, ey] = project([endpoint.x, y, endpoint.z]);
    context.fillStyle = color; context.beginPath(); context.arc(ex, ey, 3, 0, Math.PI * 2); context.fill();
    const [lx, ly] = project([-230, y, 0]);
    context.font = "10px 'IBM Plex Mono', monospace";
    context.textAlign = "right";
    context.fillText(layer.name.toUpperCase(), lx - 18, ly + 3);
    context.textAlign = "left";
  }
  if (progress > .12) {
    context.fillStyle = "#9baecb";
    context.font = "10px 'IBM Plex Mono', monospace";
    context.fillText("PAPER OBSERVATIONS / PERSPECTIVE VIEW", width * .58, height * .86);
    context.fillStyle = "#9baecb";
    context.fillText("TIME RUNS LEFT TO RIGHT / ZERO LINE DASHED", width * .58, height * .86 + 23);
  }
}

function schedule() {
  if (!queued && preference.matches && visible && !document.hidden) queued = requestAnimationFrame(render);
}

async function initialize() {
  if (!canvas || !preference.matches) return;
  try {
    if (!model) {
      const response = await fetch("/paper-state.json");
      if (!response.ok) throw new Error("Paper snapshot unavailable");
      const state = await response.json();
      // A suspended sleeve (state.suspended_sleeves) is out of the book and publishes no curve:
      // draw the sleeves that are live, never fail the whole view for the one that is not.
      const suspended = new Set((state.suspended_sleeves || []).map(s => s.key));
      const rows = keys.filter(key => !suspended.has(key)).map(key => state.algorithms.find(a => a.key === key));
      if (rows.some(row => !row?.live_curve || row.live_curve.length < 2 || row.live_curve.some(p => !Number.isFinite(p.equity) || p.equity <= 0 || !Number.isFinite(Date.parse(p.date))))) throw new Error("Incomplete paper curves");
      const normalized = rows.map(row => ({ name: row.name, points: row.live_curve.map(p => ({ time: Date.parse(p.date), value: p.equity / row.live_curve[0].equity - 1 })) }));
      const all = normalized.flatMap(row => row.points);
      const start = Math.min(...all.map(p => p.time));
      const end = Math.max(...all.map(p => p.time));
      const extent = Math.max(.01, ...all.map(p => Math.abs(p.value)));
      model = normalized.map(row => ({ name: row.name, points: row.points.map(p => ({ x: -190 + 380 * (p.time - start) / Math.max(1, end - start), z: -p.value / extent * 95 })) }));
    }
    context = canvas.getContext("2d");
    if (!context || !preference.matches) return;
    journey.classList.add("is-rendered");
    schedule();
  } catch {
    journey.classList.remove("is-rendered");
  }
}

if (journey) {
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) schedule(); });
  observer.observe(journey);
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  document.addEventListener("visibilitychange", schedule);
  journey.addEventListener("pointermove", event => { pointer = event.clientX / innerWidth - .5; schedule(); }, { passive: true });
  journey.addEventListener("pointerleave", () => { pointer = 0; schedule(); });
  preference.addEventListener("change", () => {
    journey.classList.remove("is-rendered");
    cancelAnimationFrame(queued); queued = 0;
    if (preference.matches) initialize();
  });
  document.fonts?.ready.then(schedule);
  initialize();
}
