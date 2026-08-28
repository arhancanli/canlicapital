// =============================================================================
// entry-scene.js
// -----------------------------------------------------------------------------
// "The record, assembling." A scroll-driven WebGL field of every trial identity
// this project has ever recorded, drawn from the published distribution.
//
// WHAT IT IS MADE OF. Each point is one real hypothesis identity: its x position
// is the annualised Sharpe ratio it actually recorded, its depth is its rank
// among all of them, its band is its research family. The shape a reader sees --
// a dense wall at zero with thin tails -- IS the finding. Most attempts are
// worth nothing, and the site says so in prose elsewhere; here you are looking
// at it. Nothing is placed for composition.
//
// WHY NOT A SHADER SURFACE. The previous scene was an abstract morphing manifold,
// retired in August. An abstract blob is what every generated site has, and it
// says nothing about the work. This says one true thing that only this project
// can say.
//
// WHY RAW WEBGL. three.js is 518 KB for a point cloud and a camera. This is the
// whole renderer, and it is smaller than the data it draws.
//
// HONESTY. If the distribution cannot be fetched, the scene does not render.
// There is no placeholder geometry and no invented point: an empty field is the
// correct output when there is nothing to show.
// =============================================================================

const VERT = `
attribute vec3 position;
attribute float family;
attribute float rank;
uniform mat4 projection;
uniform mat4 view;
uniform float time;
uniform float reveal;
varying float vFamily;
varying float vDepth;
varying float vAlive;
void main() {
  // Points arrive in rank order, so a rising reveal draws the record in the
  // order it was actually recorded rather than all at once.
  float alive = clamp((reveal - rank) * 6.0, 0.0, 1.0);
  vAlive = alive;
  vec3 p = position;
  // A slow, tiny drift. Enough that the field reads as live rather than printed;
  // small enough that no point ever leaves the position its Sharpe put it in.
  p.y += sin(time * 0.35 + rank * 22.0) * 0.012;
  p.z += cos(time * 0.28 + family * 3.1) * 0.010;
  vec4 viewPos = view * vec4(p, 1.0);
  vDepth = -viewPos.z;
  gl_Position = projection * viewPos;
  gl_PointSize = (46.0 / max(vDepth, 0.35)) * (0.4 + 0.6 * alive);
  vFamily = family;
}`;

const FRAG = `
precision mediump float;
varying float vFamily;
varying float vDepth;
varying float vAlive;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float soft = smoothstep(0.25, 0.02, r);
  // Cyan through to a warm accent, by family. Low saturation: this is an
  // instrument, not a light show.
  vec3 cold = vec3(0.42, 0.78, 0.92);
  vec3 warm = vec3(0.95, 0.72, 0.38);
  vec3 tint = mix(cold, warm, clamp(vFamily, 0.0, 1.0));
  float fade = clamp(2.6 / (1.0 + vDepth * 0.42), 0.18, 1.0);
  gl_FragColor = vec4(tint, soft * fade * vAlive);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader failed to compile");
  }
  return shader;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

// A camera that only ever dollies and yaws. No roll: a tilted horizon reads as
// styling, and the horizontal axis here is a real quantity a reader is meant to
// be able to judge against the zero line.
function view(distance, yaw, height) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, -height, -distance, 1,
  ]);
}

export function createEntryScene(canvas, distribution, { reducedMotion = false } = {}) {
  const ranked = distribution?.ranked;
  if (!Array.isArray(ranked) || ranked.length === 0) return null;
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  const families = [...new Set(ranked.map((r) => r.research_family_key))].sort();
  const values = ranked.map((r) => r.annualized_sharpe);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;

  // A HISTOGRAM, IN SPACE.
  //
  // The first version put family on y and global rank on z. Because the array is
  // sorted by Sharpe and families cluster, rank correlated with x and the field
  // collapsed into diagonal streaks -- a picture of the sort order, not of the
  // distribution.
  //
  // Points are now stacked into Sharpe buckets: x is the ratio, y is the point's
  // height within its own bucket, z is a deterministic offset for depth. What a
  // reader sees is the true shape of every attempt this project has recorded --
  // a wall at zero and two thin tails. The tallest column IS the finding.
  const BUCKETS = 44;
  const reach = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
  // Symmetric buckets about zero, so the bucket boundary falls ON zero rather
  // than wherever the min happened to land.
  const bucketOf = (value) =>
    Math.min(BUCKETS - 1, Math.max(0, Math.floor(((value / reach) * 0.5 + 0.5) * BUCKETS)));
  const heights = new Array(BUCKETS).fill(0);
  const stacked = ranked.map((trial) => {
    const bucket = bucketOf(trial.annualized_sharpe);
    return { trial, bucket, height: heights[bucket]++ };
  });
  const tallest = Math.max(...heights, 1);

  const positions = new Float32Array(ranked.length * 3);
  const familyAttr = new Float32Array(ranked.length);
  const rankAttr = new Float32Array(ranked.length);
  stacked.forEach(({ trial, bucket, height }, index) => {
    const familyIndex = families.indexOf(trial.research_family_key);
    // Depth from the family, not from the sort order, so the third axis carries
    // information instead of restating the first one.
    const depth = ((familyIndex / Math.max(families.length - 1, 1)) - 0.5) * 1.9;
    // Wide enough that the tails run past the frame edges. This is a field the
    // reader is inside, not an object on a pedestal, and the part of it that is
    // on screen should feel like part of something larger.
    positions[index * 3] = (((bucket + 0.5) / BUCKETS) - 0.5) * 7.2;
    // Stacked upward from a common floor, so the field sits on a ground plane
    // instead of floating, and column height reads as count.
    positions[index * 3 + 1] = (height / tallest) * 2.15 - 0.55;
    positions[index * 3 + 2] = depth;
    familyAttr[index] = familyIndex / Math.max(families.length - 1, 1);
    // Reveal order follows the record: rank among all trials, so the field fills
    // from the worst result to the best.
    rankAttr[index] = trial.rank_ascending / ranked.length;
  });

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const bind = (data, name, size) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };
  bind(positions, "position", 3);
  bind(familyAttr, "family", 1);
  bind(rankAttr, "rank", 1);

  const uProjection = gl.getUniformLocation(program, "projection");
  const uView = gl.getUniformLocation(program, "view");
  const uTime = gl.getUniformLocation(program, "time");
  const uReveal = gl.getUniformLocation(program, "reveal");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let scroll = 0;
  let reveal = reducedMotion ? 1 : 0;
  let running = false;
  let frame = 0;
  let startedAt = null;

  function resize() {
    // Cap the device pixel ratio. A point cloud on a 3x display is fill-rate
    // bound for no visible gain, and this runs behind text.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(now) {
    resize();
    const seconds = startedAt === null ? 0 : (now - startedAt) / 1000;
    if (startedAt === null) startedAt = now;
    if (!reducedMotion) reveal = Math.min(1, reveal + 0.012);

    // Scroll dollies the camera INTO the field and yaws it a few degrees, so the
    // wall of failures at zero resolves from a line into a volume as you enter.
    // Start FRAMED: the whole distribution is legible before the reader moves.
    // Scroll then dollies into it, so entering the system is something they do
    // rather than the state they arrive in.
    const distance = 4.15 - scroll * 2.95;
    const yaw = scroll * 0.62;
    // Camera slightly BELOW the field at rest, which lifts it into the empty band
    // at the top of the hero instead of hiding it behind the console.
    const height = -0.22 + scroll * 0.42;
    const aspect = canvas.width / Math.max(canvas.height, 1);
    gl.uniformMatrix4fv(uProjection, false, perspective(0.9, aspect, 0.1, 40));
    gl.uniformMatrix4fv(uView, false, view(distance, yaw, height));
    gl.uniform1f(uTime, seconds);
    gl.uniform1f(uReveal, reveal);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, ranked.length);
    if (running) frame = requestAnimationFrame(draw);
  }

  return {
    pointCount: ranked.length,
    setScroll(value) { scroll = Math.max(0, Math.min(1, value)); },
    renderOnce() { reveal = 1; draw(performance.now()); },
    start() { if (running) return; running = true; frame = requestAnimationFrame(draw); },
    stop() { running = false; cancelAnimationFrame(frame); },
  };
}
