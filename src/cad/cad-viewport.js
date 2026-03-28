// OfficeLink SL — CAD Viewport (scene, camera, controls, view cube, background)

import CS from './cad-state.js';
import { escapeHtml } from '../utils/sanitize.js';

/* ===================== Scene Setup ===================== */
export function setupScene() {
  const THREE = CS.THREE;
  CS.scene = new THREE.Scene();
  CS.scene.background = new THREE.Color(0x1a1a2e);

  CS.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
  CS.camera.position.set(8, 6, 8);
  CS.camera.lookAt(0, 0, 0);

  CS.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  CS.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  CS.renderer.shadowMap.enabled = true;
  CS.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  CS.renderer.outputColorSpace = THREE.SRGBColorSpace;
  CS.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  CS.renderer.toneMappingExposure = 1.0;

  CS.viewportEl.appendChild(CS.renderer.domElement);
  CS.canvasEl = CS.renderer.domElement;

  const rect = CS.viewportEl.getBoundingClientRect();
  CS.renderer.setSize(rect.width, rect.height);
  CS.camera.aspect = rect.width / rect.height;
  CS.camera.updateProjectionMatrix();
}

export function setupLights() {
  const THREE = CS.THREE;
  CS.lights.ambient = new THREE.AmbientLight(0x404060, 0.6);
  CS.scene.add(CS.lights.ambient);

  CS.lights.directional = new THREE.DirectionalLight(0xffffff, 1.2);
  CS.lights.directional.position.set(10, 15, 10);
  CS.lights.directional.castShadow = true;
  CS.lights.directional.shadow.mapSize.width = 2048;
  CS.lights.directional.shadow.mapSize.height = 2048;
  CS.lights.directional.shadow.camera.near = 0.5;
  CS.lights.directional.shadow.camera.far = 50;
  CS.lights.directional.shadow.camera.left = -15;
  CS.lights.directional.shadow.camera.right = 15;
  CS.lights.directional.shadow.camera.top = 15;
  CS.lights.directional.shadow.camera.bottom = -15;
  CS.scene.add(CS.lights.directional);

  CS.lights.fill = new THREE.DirectionalLight(0x8888cc, 0.4);
  CS.lights.fill.position.set(-5, 5, -5);
  CS.scene.add(CS.lights.fill);

  CS.lights.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x362d2d, 0.3);
  CS.scene.add(CS.lights.hemisphere);
}

export function setupGrid() {
  const THREE = CS.THREE;
  CS.gridHelper = new THREE.GridHelper(40, 40, 0x333366, 0x222244);
  CS.scene.add(CS.gridHelper);

  CS.axesHelper = new THREE.AxesHelper(5);
  CS.scene.add(CS.axesHelper);

  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.userData.isGround = true;
  CS.scene.add(ground);
}

export function setupControls() {
  const THREE = CS.THREE;
  CS.orbitControls = new CS.OrbitControls(CS.camera, CS.renderer.domElement);
  CS.orbitControls.enableDamping = true;
  CS.orbitControls.dampingFactor = 0.08;
  CS.orbitControls.minDistance = 1;
  CS.orbitControls.maxDistance = 200;
  CS.orbitControls.target.set(0, 0, 0);

  CS.orbitControls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };
  CS.orbitControls.enableZoom = true;
  CS.orbitControls.zoomSpeed = 1.2;
  CS.orbitControls.panSpeed = 0.8;
}

export function setupTransformControls(updatePropertiesPanel, updateStatusBar, pushUndo) {
  const THREE = CS.THREE;
  CS.transformControls = new CS.TransformControls(CS.camera, CS.renderer.domElement);
  CS.transformControls.setMode('translate');
  CS.transformControls.setTranslationSnap(CS.snapGrid);
  CS.transformControls.setSize(0.8);
  CS.scene.add(CS.transformControls);

  CS.transformControls.addEventListener('dragging-changed', (event) => {
    CS.orbitControls.enabled = !event.value;
  });

  CS.transformControls.addEventListener('objectChange', () => {
    updatePropertiesPanel();
    updateStatusBar();
  });

  CS.transformControls.addEventListener('mouseUp', () => {
    if (CS.selectedObject) {
      pushUndo('transform');
    }
  });
}

/* ===================== Animation Loop ===================== */
export function animate() {
  CS.animFrameId = requestAnimationFrame(animate);
  CS.orbitControls.update();
  CS.renderer.render(CS.scene, CS.camera);
  renderViewCube();
  updateCoordinateDisplay();
}

/* ===================== Resize Handling ===================== */
export function handleResize() {
  CS.resizeObserver = new ResizeObserver(() => {
    if (!CS.viewportEl) return;
    const rect = CS.viewportEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    CS.camera.aspect = rect.width / rect.height;
    CS.camera.updateProjectionMatrix();
    CS.renderer.setSize(rect.width, rect.height);
  });
  CS.resizeObserver.observe(CS.viewportEl);
}

/* ===================== Theme Colors ===================== */
export function updateCadThemeColors() {
  const THREE = CS.THREE;
  if (!CS.scene || !THREE) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  if (CS.bgMode === 'solid') {
    if (isLight) {
      CS.bgColor1 = 0xe5e5ea;
      CS.scene.background = new THREE.Color(0xe5e5ea);
    } else {
      CS.bgColor1 = 0x1a1a2e;
      CS.scene.background = new THREE.Color(0x1a1a2e);
    }
    const c1Input = document.getElementById('cad-bg-color1');
    if (c1Input) c1Input.value = '#' + new THREE.Color(CS.bgColor1).getHexString();
  } else {
    applyBackground();
  }

  if (CS.gridHelper) {
    CS.scene.remove(CS.gridHelper);
    CS.gridHelper.geometry.dispose();
    if (CS.gridHelper.material.dispose) CS.gridHelper.material.dispose();
  }
  CS.gridHelper = new THREE.GridHelper(40, 40,
    isLight ? 0x999999 : 0x333366,
    isLight ? 0xcccccc : 0x222244
  );
  CS.scene.add(CS.gridHelper);
}

/* ===================== Camera Views ===================== */
export function setCameraView(view) {
  const THREE = CS.THREE;
  const def = CS.STANDARD_VIEWS[view];
  if (!def) return;
  const dist = 15;
  const target = CS.orbitControls.target.clone();
  const endPos = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]).normalize().multiplyScalar(dist).add(target);

  animateCamera(CS.camera.position.clone(), endPos, target, 400);

  document.querySelectorAll('.cad-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  updateStatusBar(`View: ${def.label}`);
}

/** Smoothly animate camera from startPos to endPos over durationMs */
export function animateCamera(startPos, endPos, lookTarget, durationMs = 400) {
  const startTime = performance.now();
  const _step = (now) => {
    const t = Math.min((now - startTime) / durationMs, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    CS.camera.position.lerpVectors(startPos, endPos, ease);
    CS.camera.lookAt(lookTarget);
    CS.orbitControls.update();
    if (t < 1) requestAnimationFrame(_step);
  };
  requestAnimationFrame(_step);
}

/* ===================== Coordinate Display ===================== */
export function updateCoordinateDisplay() {
  const coordEl = document.getElementById('cad-coords');
  if (!coordEl) return;

  if (CS.selectedObject) {
    const p = CS.selectedObject.position;
    coordEl.textContent = `X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`;
  } else {
    coordEl.textContent = 'X: 0.00  Y: 0.00  Z: 0.00';
  }
}

import { t } from '../ui/i18n.js';

export function updateStatusBar(msg) {
  const statusEl = document.getElementById('cad-status-msg');
  if (statusEl && msg) statusEl.textContent = msg;

  const countEl = document.getElementById('cad-obj-count');
  if (countEl) countEl.textContent = `${t('cad.objects')}: ${CS.sceneObjects.length}`;
}

/* ===================== Toggle Grid ===================== */
export function toggleGrid() {
  CS.gridVisible = !CS.gridVisible;
  if (CS.gridHelper) CS.gridHelper.visible = CS.gridVisible;
  if (CS.axesHelper) CS.axesHelper.visible = CS.gridVisible;
  const btn = document.getElementById('cad-grid-toggle');
  if (btn) btn.classList.toggle('active', CS.gridVisible);
  updateStatusBar(CS.gridVisible ? 'Grid ON' : 'Grid OFF');
}

/* ===================== Fit All ===================== */
export function fitAll() {
  const THREE = CS.THREE;
  if (CS.sceneObjects.length === 0) {
    CS.orbitControls.target.set(0, 0, 0);
    CS.camera.position.set(8, 6, 8);
    CS.orbitControls.update();
    updateStatusBar('Fit All (empty scene)');
    return;
  }

  const box = new THREE.Box3();
  CS.sceneObjects.forEach((o) => { if (o.visible) box.expandByObject(o); });
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = CS.camera.fov * (Math.PI / 180);
  let dist = maxDim / (2 * Math.tan(fov / 2)) * 1.8;
  dist = Math.max(dist, 3);

  const dir = CS.camera.position.clone().sub(CS.orbitControls.target).normalize();
  const endPos = center.clone().add(dir.multiplyScalar(dist));
  animateCamera(CS.camera.position.clone(), endPos, center, 400);
  CS.orbitControls.target.copy(center);
  updateStatusBar('Fit All');
}

/* ===================== Focus Selected ===================== */
export function focusSelected() {
  const THREE = CS.THREE;
  if (!CS.selectedObject) {
    CS.orbitControls.target.set(0, 0, 0);
    CS.camera.position.set(8, 6, 8);
    CS.orbitControls.update();
    return;
  }

  const box = new THREE.Box3().setFromObject(CS.selectedObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = CS.camera.fov * (Math.PI / 180);
  let dist = maxDim / (2 * Math.tan(fov / 2)) * 2;
  dist = Math.max(dist, 3);

  const dir = CS.camera.position.clone().sub(CS.orbitControls.target).normalize();
  CS.camera.position.copy(center).add(dir.multiplyScalar(dist));
  CS.orbitControls.target.copy(center);
  CS.orbitControls.update();
}

/* ===================== Normal to Face ===================== */
export function normalToFace() {
  const THREE = CS.THREE;
  if (!CS.selectedObject) { updateStatusBar('Select an object first'); return; }
  const raycaster = new THREE.Raycaster();
  const dir = CS.camera.position.clone().sub(CS.orbitControls.target).normalize();
  raycaster.set(CS.orbitControls.target, dir);
  const hits = raycaster.intersectObject(CS.selectedObject, true);
  if (hits.length > 0 && hits[0].face) {
    const normal = hits[0].face.normal.clone();
    normal.transformDirection(CS.selectedObject.matrixWorld);
    const center = hits[0].point.clone();
    const dist = CS.camera.position.distanceTo(CS.orbitControls.target);
    const endPos = center.clone().add(normal.multiplyScalar(dist));
    animateCamera(CS.camera.position.clone(), endPos, center, 400);
    CS.orbitControls.target.copy(center);
    updateStatusBar('Normal to face');
  } else {
    updateStatusBar('No face detected');
  }
}

/* ===================== View Cube ===================== */
export function initViewCube() {
  const THREE = CS.THREE;
  const container = document.getElementById('cad-view-cube');
  if (!container || CS.viewCubeRenderer) return;

  const size = 120;
  CS.viewCubeScene = new THREE.Scene();
  CS.viewCubeCamera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 10);
  CS.viewCubeCamera.position.set(2, 1.5, 2);
  CS.viewCubeCamera.lookAt(0, 0, 0);

  CS.viewCubeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  CS.viewCubeRenderer.setSize(size, size);
  CS.viewCubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(CS.viewCubeRenderer.domElement);

  const faceColors = [0x3a5fcd, 0x3a5fcd, 0x2e8b57, 0x2e8b57, 0xcd3a3a, 0xcd3a3a];
  const faceLabels = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'];
  const materials = faceColors.map((c, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 124, 124);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(faceLabels[i], 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({ map: tex });
  });

  const cubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const cube = new THREE.Mesh(cubeGeo, materials);
  cube.userData.isViewCube = true;
  CS.viewCubeScene.add(cube);

  const axLen = 1.0;
  const axGeo = new THREE.CylinderGeometry(0.03, 0.03, axLen, 6);
  const makeAxis = (color, rotAxis, angle, posOffset) => {
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(axGeo, mat);
    if (rotAxis) mesh.rotation[rotAxis] = angle;
    mesh.position.copy(posOffset);
    CS.viewCubeScene.add(mesh);
  };
  makeAxis(0xff4444, 'z', Math.PI / 2, new THREE.Vector3(axLen / 2, -0.8, -0.8));
  makeAxis(0x44ff44, null, 0, new THREE.Vector3(-0.8, axLen / 2 - 0.8, -0.8));
  makeAxis(0x4444ff, 'x', Math.PI / 2, new THREE.Vector3(-0.8, -0.8, axLen / 2));

  container.addEventListener('click', (e) => {
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, CS.viewCubeCamera);
    const hits = rc.intersectObject(cube);
    if (hits.length > 0) {
      const faceIdx = Math.floor(hits[0].faceIndex / 2);
      const viewMap = ['right', 'left', 'top', 'bottom', 'front', 'back'];
      setCameraView(viewMap[faceIdx] || 'front');
    }
  });

  container.style.cursor = 'pointer';
}

function renderViewCube() {
  if (!CS.viewCubeRenderer || !CS.viewCubeCamera) return;
  const dir = CS.camera.position.clone().sub(CS.orbitControls.target).normalize();
  CS.viewCubeCamera.position.copy(dir.multiplyScalar(3));
  CS.viewCubeCamera.lookAt(0, 0, 0);
  CS.viewCubeRenderer.render(CS.viewCubeScene, CS.viewCubeCamera);
}

/* ===================== Box Select ===================== */
export function initBoxSelect(selectObject) {
  const THREE = CS.THREE;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.cad-viewport-overlay') || e.target.closest('.cad-viewport-info') || e.target.closest('.cad-view-cube')) return;
    if (CS.transformControls.dragging) return;

    const rect = viewport.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, CS.camera);
    const hits = rc.intersectObjects(CS.sceneObjects.filter((o) => o.visible), true);
    if (hits.length > 0) return;

    CS.boxSelectStart = { x: e.clientX, y: e.clientY };
    CS.boxSelectActive = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (!CS.boxSelectStart) return;
    const dx = e.clientX - CS.boxSelectStart.x;
    const dy = e.clientY - CS.boxSelectStart.y;
    if (!CS.boxSelectActive && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      CS.boxSelectActive = true;
      if (!CS.boxSelectDiv) {
        CS.boxSelectDiv = document.createElement('div');
        CS.boxSelectDiv.className = 'cad-box-select';
        document.body.appendChild(CS.boxSelectDiv);
      }
      CS.boxSelectDiv.style.display = 'block';
    }
    if (CS.boxSelectActive && CS.boxSelectDiv) {
      const left = Math.min(e.clientX, CS.boxSelectStart.x);
      const top = Math.min(e.clientY, CS.boxSelectStart.y);
      const w = Math.abs(dx);
      const h = Math.abs(dy);
      CS.boxSelectDiv.style.left = left + 'px';
      CS.boxSelectDiv.style.top = top + 'px';
      CS.boxSelectDiv.style.width = w + 'px';
      CS.boxSelectDiv.style.height = h + 'px';
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (CS.boxSelectActive && CS.boxSelectStart) {
      const rect = viewport.getBoundingClientRect();
      const x1 = Math.min(e.clientX, CS.boxSelectStart.x);
      const y1 = Math.min(e.clientY, CS.boxSelectStart.y);
      const x2 = Math.max(e.clientX, CS.boxSelectStart.x);
      const y2 = Math.max(e.clientY, CS.boxSelectStart.y);

      CS.multiSelection = [];
      CS.sceneObjects.forEach((obj) => {
        if (!obj.visible) return;
        const pos = obj.position.clone().project(CS.camera);
        const sx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
        if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
          CS.multiSelection.push(obj);
          if (obj.material) {
            obj.material._originalEmissive = obj.material._originalEmissive ?? obj.material.emissive.getHex();
            obj.material.emissive.setHex(0x111122);
          }
        }
      });
      if (CS.multiSelection.length > 0) {
        selectObject(CS.multiSelection[0]);
        updateStatusBar(`Box selected ${CS.multiSelection.length} objects`);
      }
    }
    CS.boxSelectStart = null;
    CS.boxSelectActive = false;
    if (CS.boxSelectDiv) CS.boxSelectDiv.style.display = 'none';
  });
}

/* ===================== Scene Background Options ===================== */
export const applyBackground = () => {
  const THREE = CS.THREE;
  if (!CS.scene || !THREE) return;

  if (CS.bgMode === 'solid') {
    CS.scene.background = new THREE.Color(CS.bgColor1);
  } else if (CS.bgMode === 'gradient') {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const c1 = new THREE.Color(CS.bgColor1);
    const c2 = new THREE.Color(CS.bgColor2);
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${c1.getHexString()}`);
    grad.addColorStop(1, `#${c2.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    CS.scene.background = tex;
  } else if (CS.bgMode === 'envmap') {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const c1 = new THREE.Color(CS.bgColor1);
    const c2 = new THREE.Color(CS.bgColor2);
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, `#${c1.getHexString()}`);
    grad.addColorStop(0.4, '#87ceeb');
    grad.addColorStop(0.5, '#e0e8f0');
    grad.addColorStop(0.6, '#c0c8d0');
    grad.addColorStop(1, `#${c2.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    CS.scene.background = tex;
  }
};

export const bindBackgroundEvents = () => {
  const modeSel = document.getElementById('cad-bg-mode');
  const color1Input = document.getElementById('cad-bg-color1');
  const color2Input = document.getElementById('cad-bg-color2');
  const color2Row = document.getElementById('cad-bg-color2-row');

  if (modeSel) modeSel.addEventListener('change', () => {
    CS.bgMode = modeSel.value;
    if (color2Row) color2Row.style.display = CS.bgMode === 'solid' ? 'none' : 'flex';
    applyBackground();
  });
  if (color1Input) color1Input.addEventListener('input', () => {
    CS.bgColor1 = parseInt(color1Input.value.replace('#', ''), 16);
    applyBackground();
  });
  if (color2Input) color2Input.addEventListener('input', () => {
    CS.bgColor2 = parseInt(color2Input.value.replace('#', ''), 16);
    applyBackground();
  });

  if (color2Row) color2Row.style.display = 'none';
};
