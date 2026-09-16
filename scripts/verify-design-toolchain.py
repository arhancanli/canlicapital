"""Verify Blender -> PNG/GLB -> FFmpeg -> browser. No production requests."""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
parent = ROOT / "artifacts" / "toolchain"
parent.mkdir(parents=True, exist_ok=True)
out = Path(tempfile.mkdtemp(prefix="check-", dir=parent))

def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, text=True, **kwargs)

env = {**os.environ, "CANLI_RENDER_TEST_OUT": str(out)}
with (out / "blender.log").open("w") as log:
    run([BLENDER, "--background", "--factory-startup", "--python-exit-code", "1",
         "--python", str(ROOT / "scripts/blender-toolchain-smoke.py")],
        env=env, stdout=log, stderr=subprocess.STDOUT, timeout=240)
assert len(list(out.glob("frame-*.png"))) == 12
assert (out / "diagnostic.glb").stat().st_size > 0
ffmpeg = run(["node", "-p", "require('ffmpeg-static')"], capture_output=True).stdout.strip()
run([ffmpeg, "-v", "error", "-framerate", "12", "-i", str(out / "frame-%04d.png"),
     "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out / "diagnostic.mp4")])
run([ffmpeg, "-v", "error", "-i", str(out / "frame-0001.png"), str(out / "diagnostic.webp")])
run([ffmpeg, "-v", "error", "-i", str(out / "diagnostic.mp4"), "-f", "null", "-"])

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(os.environ.get("CANLI_PREVIEW_ORIGIN", "http://127.0.0.1:4187"), wait_until="networkidle")
    result = page.evaluate("""async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(64, 64);
      const scene = new THREE.Scene();
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial();
      scene.add(new THREE.Mesh(geometry, material));
      const camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
      camera.position.z = 3;
      renderer.render(scene, camera);
      const result = {threeRevision: THREE.REVISION, drawCalls: renderer.info.render.calls};
      geometry.dispose(); material.dispose(); renderer.dispose();
      return result;
    }""")
    assert result["drawCalls"] == 1
    assert not errors, errors
    page.set_content('<video muted playsinline></video>')
    uri = "data:video/mp4;base64," + base64.b64encode((out / "diagnostic.mp4").read_bytes()).decode()
    page.locator("video").evaluate("async (video, src) => { video.src = src; await video.play(); }", uri)
    page.wait_for_function("document.querySelector('video').currentTime > 0")
    assert page.locator("video").evaluate("v => v.videoWidth") == 256
    browser.close()
report = {"passed": True, "render": json.loads((out / "render-report.json").read_text()),
          "browser": result, "videoPlayback": True, "webpEncoded": True,
          "figmaInstalled": Path("/Applications/Figma.app").is_dir(),
          "figmaLogin": "Not verified; user sign-in required", "output": str(out)}
(out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
