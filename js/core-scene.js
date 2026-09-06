// =============================================================================
// core-scene.js
// -----------------------------------------------------------------------------
// The Evidence Core: five states a trial identity passes through, morphing as
// the reader scrolls. Replaces a three.js + GSAP implementation that cost 628 KB
// to render a graphic which, in its final state, crushed 228 points into a
// column three tenths of a unit wide and read as a scribble.
//
// TWO THINGS CHANGED BESIDES THE RENDERER.
//
// 1. The data is real. The old version derived "killed" from a point's INDEX
//    against a ratio -- the proportion was true, the per-point flag was not. The
//    union state now splits on each trial's actual first-measurement Sharpe, so
//    the left and right sides of that state are the real 46.9% and 53.1%.
//
// 2. The spine is legible. A signed chain that renders as an unreadable smear
//    communicates nothing about an append-only record. It is now a visible
//    sequence with space between its links.
// =============================================================================

const VERT = `
attribute vec3 fromPos;
attribute vec3 toPos;
attribute float flag;
attribute float seed;
uniform mat4 projection;
uniform mat4 view;
uniform float blend;
uniform float time;
varying float vFlag;
varying float vDepth;
void main() {
  vec3 p = mix(fromPos, toPos, blend);
  // A small drift so a settled state still reads as live. Amplitude is well
  // under the spacing of any state, so no point ever crosses into another's
  // position and the arrangement stays truthful.
  p.x += sin(time * 0.4 + seed * 17.0) * 0.02;
  p.y += cos(time * 0.33 + seed * 11.0) * 0.02;
  vec4 mv = view * vec4(p, 1.0);
  vDepth = -mv.z;
  vFlag = flag;
  gl_Position = projection * mv;
  gl_PointSize = clamp(64.0 / max(vDepth, 0.4), 2.0, 13.0);
}`;

const FRAG = `
precision mediump float;
varying float vFlag;
varying float vDepth;
uniform float union_;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float soft = smoothstep(0.25, 0.02, r);
  vec3 cyan = vec3(0.40, 0.84, 1.00);
  vec3 mint = vec3(0.35, 0.88, 0.71);
  vec3 amber = vec3(0.95, 0.72, 0.36);
  // Colour only separates once the union state is reached. Before that the
  // identities are indistinguishable, which is the point of the first two
  // states: nothing has been judged yet.
  vec3 base = mix(cyan, vFlag > 0.5 ? amber : mint, union_);
  float fade = clamp(2.4 / (1.0 + vDepth * 0.4), 0.2, 1.0);
  gl_FragColor = vec4(base, soft * fade * 0.92);
}`;

const compile = (gl, type, src) => {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader failed");
  }
  return sh;
};

const perspective = (fov, aspect, near, far) => {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0, 0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
};

const viewMatrix = (distance, yaw) => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -distance, 1]);
};

// Five arrangements of the same identities. Every one is a real statement about
// where a trial is in this project's process, not a shape chosen to look good.
function buildStates(trials) {
  const n = trials.length;
  const states = Array.from({ length: 5 }, () => new Float32Array(n * 3));
  const flags = new Float32Array(n);
  const seeds = new Float32Array(n);
  const put = (state, i, x, y, z) => {
    states[state][i * 3] = x;
    states[state][i * 3 + 1] = y;
    states[state][i * 3 + 2] = z;
  };

  const families = [...new Set(trials.map((t) => t.research_family_key))].sort();
  const columns = Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / columns);
  // Deterministic scatter: the same page renders the same field every time, so a
  // screenshot taken today matches one taken tomorrow.
  let hash = 20260828;
  const rand = () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 4294967296;
  };

  let above = 0;
  let below = 0;
  trials.forEach((trial, i) => {
    const sharpe = trial.annualized_sharpe;
    const scored = typeof sharpe === "number" && sharpe > 0;
    flags[i] = scored ? 0 : 1;
    seeds[i] = rand();

    // 01 Idea field: unordered, unjudged.
    put(0, i, (rand() - 0.5) * 10.5, (rand() - 0.5) * 6.0, (rand() - 0.5) * 4.0);

    // 02 Frozen identity: addressable, in a fixed order.
    const col = i % columns;
    const row = Math.floor(i / columns);
    put(1, i, (col - (columns - 1) / 2) * 0.5, ((rows - 1) / 2 - row) * 0.5, 0);

    // 03 Trial union: split by the trial's OWN first measurement. Nothing is
    // discarded; the side that failed simply moves back and dims.
    const rank = scored ? above++ : below++;
    const COLS = 7;
    put(2, i,
      (scored ? 1.75 : -1.75) + ((rank % COLS) - (COLS - 1) / 2) * 0.27,
      (Math.floor(rank / COLS) - 8) * 0.33,
      scored ? 0.4 : -1.6);

    // 04 Broker rails: four sleeves, each keeping its own execution boundary.
    const rail = families.indexOf(trial.research_family_key) % 4;
    put(3, i, [-3.0, -1.0, 1.0, 3.0][rail] + (rand() - 0.5) * 0.3,
      ((i / n) - 0.5) * 6.4, ((Math.floor(i / 4) % 3) - 1) * 0.3);

    // 05 Signed claim: an append-only spine. Wide enough that the links are
    // countable -- the old version stacked them into a 0.3-unit smear.
    const step = i / Math.max(n - 1, 1);
    put(4, i, Math.sin(step * Math.PI * 8) * 0.55, (step - 0.5) * 7.2, Math.cos(step * Math.PI * 8) * 0.55);
  });

  return { states, flags, seeds, count: n, aboveZero: above, belowZero: below };
}

export function createCoreScene(canvas, trials) {
  if (!Array.isArray(trials) || trials.length === 0) return null;
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  const built = buildStates(trials);
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffers = {};
  const bindAttribute = (name, data, size) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    buffers[name] = buffer;
  };
  bindAttribute("fromPos", built.states[0], 3);
  bindAttribute("toPos", built.states[1], 3);
  bindAttribute("flag", built.flags, 1);
  bindAttribute("seed", built.seeds, 1);

  const uniforms = {
    projection: gl.getUniformLocation(program, "projection"),
    view: gl.getUniformLocation(program, "view"),
    blend: gl.getUniformLocation(program, "blend"),
    time: gl.getUniformLocation(program, "time"),
    union_: gl.getUniformLocation(program, "union_"),
  };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let progress = 0;
  let running = false;
  let frame = 0;
  let started = null;
  let uploaded = -1;

  const upload = (segment) => {
    if (uploaded === segment) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.fromPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, built.states[segment]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.toPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, built.states[segment + 1]);
    uploaded = segment;
  };

  function draw(now) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    if (started === null) started = now;

    const scaled = progress * 4;
    const segment = Math.min(3, Math.floor(scaled));
    const local = scaled - segment;
    const eased = local * local * (3 - 2 * local);
    upload(segment);

    gl.uniformMatrix4fv(uniforms.projection, false, perspective(0.95, w / h, 0.1, 40));
    gl.uniformMatrix4fv(uniforms.view, false, viewMatrix(8.6 - progress * 1.1, (progress - 0.5) * 0.5));
    gl.uniform1f(uniforms.blend, eased);
    gl.uniform1f(uniforms.time, (now - started) / 1000);
    // Colour separates across the union transition and stays separated after it.
    gl.uniform1f(uniforms.union_, Math.min(1, Math.max(0, (progress - 0.35) / 0.2)));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, built.count);
    if (running) frame = requestAnimationFrame(draw);
  }

  return {
    count: built.count,
    aboveZero: built.aboveZero,
    belowZero: built.belowZero,
    chapterAt: (value) => Math.min(4, Math.max(0, Math.round(value * 4))),
    setProgress(value) { progress = Math.max(0, Math.min(1, value)); },
    renderOnce() { draw(performance.now()); },
    start() { if (!running) { running = true; frame = requestAnimationFrame(draw); } },
    stop() { running = false; cancelAnimationFrame(frame); },
  };
}
