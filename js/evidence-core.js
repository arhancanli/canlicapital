import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const CHAPTERS = ["Idea field", "Frozen identity", "Trial union", "Broker rails", "Signed claim"];
const CYAN = new THREE.Color(0x66d6ff);
const MINT = new THREE.Color(0x58e0b5);
const AMBER = new THREE.Color(0xf3b85d);
const DIM = new THREE.Color(0x243b49);

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - (2 * t));
};
const range = (value, start, end) => smooth((value - start) / (end - start));

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function setPoint(target, index, x, y, z) {
  const offset = index * 3;
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
}

function createNodeStates(count, killed) {
  const random = seededRandom(20260826);
  const states = Array.from({ length: 5 }, () => new Float32Array(count * 3));
  const killedSample = Math.min(count, Math.round((killed / Math.max(1, count)) * Math.min(count, 64)));
  const killedFlags = new Uint8Array(count);
  const killedRatio = clamp(killed / Math.max(1, count));

  for (let index = 0; index < count; index += 1) {
    const normalized = count === 1 ? 0 : index / (count - 1);
    const column = index % 16;
    const row = Math.floor(index / 16);
    const isKilled = (index / Math.max(1, count)) < killedRatio || index < killedSample;
    killedFlags[index] = Number(isKilled);

    setPoint(states[0], index,
      (random() - 0.5) * 10.5,
      (random() - 0.5) * 6.2,
      (random() - 0.5) * 4.2);

    setPoint(states[1], index,
      (column - 7.5) * 0.55,
      (row - Math.floor(count / 32)) * 0.55,
      Math.sin((column * 0.7) + (row * 0.4)) * 0.28);

    const unionSide = isKilled ? -1 : 1;
    setPoint(states[2], index,
      unionSide * (isKilled ? 3.9 : 2.1) + ((column % 4) * 0.21),
      (normalized - 0.5) * 6.2,
      isKilled ? -2.4 - (random() * 1.8) : -0.4 + (random() * 0.8));

    const rail = index % 4;
    setPoint(states[3], index,
      [-3.15, -1.05, 1.05, 3.15][rail] + ((random() - 0.5) * 0.22),
      (normalized - 0.5) * 6.5,
      ((Math.floor(index / 4) % 3) - 1) * 0.28);

    setPoint(states[4], index,
      ((index % 5) - 2) * 0.075,
      (normalized - 0.5) * 7,
      ((index % 7) - 3) * 0.055);
  }
  return { states, killedFlags };
}

function createLine(points, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  return { line, geometry, material };
}

export function initEvidenceCore({ section, identities, killed, sleeves, signedEntries, brokerSleeves }) {
  const canvas = section?.querySelector("#evidence-core-canvas");
  const stage = section?.querySelector(".evidence-core__stage");
  const pin = section?.querySelector(".evidence-core__pin");
  if (!section || !canvas || !stage || !pin || identities < 1 || sleeves < 1) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.setClearColor(0x06111b, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  camera.position.set(0, 0.4, 12.5);
  const root = new THREE.Group();
  root.rotation.x = -0.05;
  scene.add(root);

  const sampleCount = Math.min(identities, 144);
  const sampleKilled = Math.round(sampleCount * clamp(killed / identities));
  const { states, killedFlags } = createNodeStates(sampleCount, sampleKilled);
  const positions = new Float32Array(states[0]);
  const colors = new Float32Array(sampleCount * 3);
  const nodeGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  nodeGeometry.setAttribute("position", positionAttribute);
  nodeGeometry.setAttribute("color", colorAttribute);
  const nodeMaterial = new THREE.PointsMaterial({
    size: 0.095,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
  root.add(nodes);

  const railObjects = [-3.15, -1.05, 1.05, 3.15].map((x) => createLine([
    new THREE.Vector3(x, -3.65, 0),
    new THREE.Vector3(x, 3.65, 0),
  ], 0x66d6ff));
  railObjects.forEach(({ line }) => root.add(line));

  const spine = createLine([
    new THREE.Vector3(0, -4, 0),
    new THREE.Vector3(0, 4, 0),
  ], 0x315cff);
  root.add(spine.line);

  const pulseGeometry = new THREE.SphereGeometry(0.12, 12, 12);
  const pulses = Array.from({ length: sleeves }, (_, index) => {
    const observed = index < brokerSleeves;
    const material = new THREE.MeshBasicMaterial({
      color: observed ? MINT : AMBER,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(pulseGeometry, material);
    mesh.position.x = [-3.15, -1.05, 1.05, 3.15][index % 4];
    root.add(mesh);
    return { mesh, material, offset: index / Math.max(1, sleeves) };
  });

  const blockCount = Math.min(Math.max(1, signedEntries), 56);
  const blockGeometry = new THREE.BoxGeometry(0.48, 0.055, 0.18);
  const blockMaterial = new THREE.MeshBasicMaterial({ color: 0x66d6ff, transparent: true, opacity: 0 });
  const blocks = new THREE.InstancedMesh(blockGeometry, blockMaterial, blockCount);
  const blockMatrix = new THREE.Matrix4();
  for (let index = 0; index < blockCount; index += 1) {
    const y = -3.65 + ((index / Math.max(1, blockCount - 1)) * 7.3);
    blockMatrix.makeRotationZ((index % 2 ? 1 : -1) * 0.08);
    blockMatrix.setPosition(0, y, (index % 3) * 0.035);
    blocks.setMatrixAt(index, blockMatrix);
  }
  blocks.instanceMatrix.needsUpdate = true;
  root.add(blocks);

  const stageLabel = section.querySelector("#core-stage-label");
  const progressFill = section.querySelector("#core-progress-fill");
  const chapterNodes = Array.from(section.querySelectorAll("[data-core-chapter]"));
  const scrollState = { progress: 0 };
  let currentChapter = -1;
  let inView = false;
  let disposed = false;
  let frame = 0;

  const updateChapter = () => {
    const chapter = Math.min(4, Math.floor(scrollState.progress * 5));
    if (chapter !== currentChapter) {
      currentChapter = chapter;
      stageLabel.textContent = CHAPTERS[chapter];
      chapterNodes.forEach((node, index) => node.classList.toggle("is-active", index === chapter));
    }
    progressFill.style.transform = `scaleX(${scrollState.progress.toFixed(4)})`;
  };

  const render = (time) => {
    frame = 0;
    if (disposed || !inView || document.hidden) return;
    const progress = scrollState.progress;
    const segment = Math.min(3, Math.floor(progress * 4));
    const local = smooth((progress * 4) - segment);
    const from = states[segment];
    const to = states[segment + 1];
    const union = range(progress, 0.34, 0.58);
    const signed = range(progress, 0.76, 0.98);

    for (let index = 0; index < sampleCount; index += 1) {
      const offset = index * 3;
      positions[offset] = from[offset] + ((to[offset] - from[offset]) * local);
      positions[offset + 1] = from[offset + 1] + ((to[offset + 1] - from[offset + 1]) * local);
      positions[offset + 2] = from[offset + 2] + ((to[offset + 2] - from[offset + 2]) * local);

      const colorMix = killedFlags[index] ? union * 0.82 : signed * 0.7;
      const colorFrom = killedFlags[index] ? AMBER : CYAN;
      const colorTo = killedFlags[index] ? DIM : MINT;
      colors[offset] = colorFrom.r + ((colorTo.r - colorFrom.r) * colorMix);
      colors[offset + 1] = colorFrom.g + ((colorTo.g - colorFrom.g) * colorMix);
      colors[offset + 2] = colorFrom.b + ((colorTo.b - colorFrom.b) * colorMix);
    }
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;

    const railsVisible = range(progress, 0.5, 0.73) * (1 - (range(progress, 0.84, 1) * 0.65));
    railObjects.forEach(({ material }, index) => {
      material.opacity = railsVisible * (index < brokerSleeves ? 0.72 : 0.34);
    });
    spine.material.opacity = signed * 0.95;
    blockMaterial.opacity = signed * 0.72;
    blocks.scale.setScalar(0.78 + (signed * 0.22));

    pulses.forEach(({ mesh, material, offset }) => {
      const travel = ((time * 0.00012) + offset) % 1;
      mesh.position.y = -3.3 + (travel * 6.6);
      mesh.scale.setScalar(0.75 + (Math.sin((time * 0.004) + (offset * 9)) * 0.22));
      material.opacity = railsVisible * (0.58 + (Math.sin((time * 0.003) + offset) * 0.2));
    });

    camera.position.x = Math.sin(progress * Math.PI) * 1.25;
    camera.position.y = 0.45 + (progress * 0.75);
    camera.position.z = 12.5 - (progress * 2.1) + (signed * 1.3);
    camera.lookAt(0, 0, -0.2);
    root.rotation.y = -0.14 + (progress * 0.28);
    root.rotation.z = (0.5 - progress) * 0.025;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };

  const requestFrame = () => {
    if (!frame && !disposed && inView && !document.hidden) frame = requestAnimationFrame(render);
  };

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestFrame();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);

  const visibilityObserver = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    if (inView) requestFrame();
    else if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }, { rootMargin: "25% 0px" });
  visibilityObserver.observe(section);

  const handleVisibility = () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestFrame();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  const timeline = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: () => `+=${Math.round(window.innerHeight * 4.5)}`,
      pin,
      pinSpacing: true,
      scrub: 0.65,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: updateChapter,
    },
  });
  timeline.to(scrollState, { progress: 1, duration: 1, onUpdate: updateChapter });

  section.dataset.renderer = "webgl";
  resize();
  updateChapter();
  requestFrame();
  ScrollTrigger.refresh();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    timeline.scrollTrigger?.kill();
    timeline.kill();
    visibilityObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    if (frame) cancelAnimationFrame(frame);
    nodeGeometry.dispose();
    nodeMaterial.dispose();
    railObjects.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
    spine.geometry.dispose();
    spine.material.dispose();
    pulseGeometry.dispose();
    pulses.forEach(({ material }) => material.dispose());
    blockGeometry.dispose();
    blockMaterial.dispose();
    renderer.dispose();
  };
  window.addEventListener("pagehide", dispose, { once: true });
  return { dispose };
}
