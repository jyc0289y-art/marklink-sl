// OfficeLink SL — 3D CAD Editor (Three.js)
// Onshape-level 3D modeling editor with primitives, transforms, boolean ops, export

// Three.js loaded from CDN via dynamic import with retry logic
// Uses string concat to prevent Vite from analyzing these imports
import { escapeHtml as _esc } from '../utils/sanitize.js';
let THREE, OrbitControls, TransformControls, STLExporter, OBJExporter, GLTFExporter, STLLoader, OBJLoader, GLTFLoader;

const CDN = 'https://cdn.jsdelivr.net/npm/three@0.162.0';

/** Import with retry and timeout */
const _i = async (p, retries = 2, timeout = 10000) => {
  let attempts = 0;
  while (attempts <= retries) {
    attempts++;
    try {
      const result = await Promise.race([
        import(/* @vite-ignore */ CDN + p),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Import timeout')), timeout)),
      ]);
      return result;
    } catch (err) {
      if (attempts > retries) throw err;
      console.warn(`[CAD CDN Retry] Attempt ${attempts}/${retries + 1} for ${p}`);
      await new Promise((r) => setTimeout(r, 1000 * attempts));
    }
  }
};

async function loadThreeJS() {
  THREE = await _i('/build/three.module.js');
  ({ OrbitControls } = await _i('/examples/jsm/controls/OrbitControls.js'));
  ({ TransformControls } = await _i('/examples/jsm/controls/TransformControls.js'));
  ({ STLExporter } = await _i('/examples/jsm/exporters/STLExporter.js'));
  ({ OBJExporter } = await _i('/examples/jsm/exporters/OBJExporter.js'));
  ({ GLTFExporter } = await _i('/examples/jsm/exporters/GLTFExporter.js'));
  ({ STLLoader } = await _i('/examples/jsm/loaders/STLLoader.js'));
  ({ OBJLoader } = await _i('/examples/jsm/loaders/OBJLoader.js'));
  ({ GLTFLoader } = await _i('/examples/jsm/loaders/GLTFLoader.js'));
}

/* ===================== State ===================== */
let scene, camera, renderer, orbitControls, transformControls;
let gridHelper, axesHelper;
let selectedObject = null;
let sceneObjects = []; // user-created meshes
let undoStack = [];
let redoStack = [];
let currentTransformMode = 'translate'; // translate | rotate | scale
let snapEnabled = true;
let snapGrid = 0.5;
let shadingMode = 'solid'; // solid | wireframe | material
let isInitialized = false;
let objectCounter = 0;
let lights = {};
let viewportEl, canvasEl;

/* ===================== Init ===================== */
export async function initCadEditor() {
  const container = document.getElementById('view-cad');
  if (!container || isInitialized) return;

  await loadThreeJS();

  viewportEl = container.querySelector('.cad-viewport');
  if (!viewportEl) return;

  setupScene();
  setupLights();
  setupGrid();
  setupControls();
  setupTransformControls();
  bindToolbarEvents(container);
  bindPrimitiveEvents(container);
  bindPropertyEvents(container);
  bindViewportEvents(container);
  bindKeyboardShortcuts();
  bindImportExport(container);
  bindNewToolbarButtons(container);
  initViewCube();
  initBoxSelect();
  bindClippingControls();
  animate();
  handleResize();

  isInitialized = true;
  updateStatusBar('Ready');
  updateSceneTree();

  // Observe theme changes and update 3D scene colors
  updateCadThemeColors();
  const themeObserver = new MutationObserver(() => updateCadThemeColors());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/* ===================== Scene Setup ===================== */
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
  camera.position.set(8, 6, 8);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  viewportEl.appendChild(renderer.domElement);
  canvasEl = renderer.domElement;

  const rect = viewportEl.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function setupLights() {
  // Ambient
  lights.ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(lights.ambient);

  // Directional (key light)
  lights.directional = new THREE.DirectionalLight(0xffffff, 1.2);
  lights.directional.position.set(10, 15, 10);
  lights.directional.castShadow = true;
  lights.directional.shadow.mapSize.width = 2048;
  lights.directional.shadow.mapSize.height = 2048;
  lights.directional.shadow.camera.near = 0.5;
  lights.directional.shadow.camera.far = 50;
  lights.directional.shadow.camera.left = -15;
  lights.directional.shadow.camera.right = 15;
  lights.directional.shadow.camera.top = 15;
  lights.directional.shadow.camera.bottom = -15;
  scene.add(lights.directional);

  // Fill light
  lights.fill = new THREE.DirectionalLight(0x8888cc, 0.4);
  lights.fill.position.set(-5, 5, -5);
  scene.add(lights.fill);

  // Hemisphere
  lights.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x362d2d, 0.3);
  scene.add(lights.hemisphere);
}

function setupGrid() {
  gridHelper = new THREE.GridHelper(40, 40, 0x333366, 0x222244);
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // Ground plane (shadow receiver)
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.userData.isGround = true;
  scene.add(ground);
}

/** Update 3D scene colors to match the current theme */
function updateCadThemeColors() {
  if (!scene || !THREE) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    scene.background = new THREE.Color(0xe5e5ea);
    if (gridHelper) {
      gridHelper.material.color.set(0xbbbbcc);
      if (gridHelper.material.uniforms) gridHelper.material.uniforms.diffuse?.value.set(0xbbbbcc);
      // GridHelper uses two materials for the two colors
      gridHelper.material = gridHelper.material; // force update
    }
  } else {
    scene.background = new THREE.Color(0x1a1a2e);
    if (gridHelper) {
      gridHelper.material = gridHelper.material;
    }
  }
  // Recreate grid with correct colors
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    if (gridHelper.material.dispose) gridHelper.material.dispose();
  }
  gridHelper = new THREE.GridHelper(40, 40,
    isLight ? 0x999999 : 0x333366,
    isLight ? 0xcccccc : 0x222244
  );
  scene.add(gridHelper);
}

function setupControls() {
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.minDistance = 1;
  orbitControls.maxDistance = 200;
  orbitControls.target.set(0, 0, 0);

  // Onshape-style mouse: middle=orbit, right=pan, scroll=zoom
  orbitControls.mouseButtons = {
    LEFT: null, // left click reserved for selection
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };
  orbitControls.enableZoom = true;
  orbitControls.zoomSpeed = 1.2;
  orbitControls.panSpeed = 0.8;
}

function setupTransformControls() {
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode('translate');
  transformControls.setTranslationSnap(snapGrid);
  transformControls.setSize(0.8);
  scene.add(transformControls);

  transformControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
  });

  transformControls.addEventListener('objectChange', () => {
    updatePropertiesPanel();
    updateStatusBar();
  });

  transformControls.addEventListener('mouseUp', () => {
    if (selectedObject) {
      pushUndo('transform');
    }
  });
}

/* ===================== Animation Loop ===================== */
function animate() {
  requestAnimationFrame(animate);
  orbitControls.update();
  renderer.render(scene, camera);
  renderViewCube();
  updateCoordinateDisplay();
}

/* ===================== Resize Handling ===================== */
function handleResize() {
  const ro = new ResizeObserver(() => {
    if (!viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
  });
  ro.observe(viewportEl);
}

/* ===================== Primitive Creation ===================== */
function createPrimitive(type) {
  let geometry, name;
  objectCounter++;

  switch (type) {
    case 'box':
      geometry = new THREE.BoxGeometry(2, 2, 2);
      name = `Box_${objectCounter}`;
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(1, 32, 32);
      name = `Sphere_${objectCounter}`;
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(1, 1, 2, 32);
      name = `Cylinder_${objectCounter}`;
      break;
    case 'cone':
      geometry = new THREE.ConeGeometry(1, 2, 32);
      name = `Cone_${objectCounter}`;
      break;
    case 'torus':
      geometry = new THREE.TorusGeometry(1, 0.4, 16, 48);
      name = `Torus_${objectCounter}`;
      break;
    case 'plane':
      geometry = new THREE.PlaneGeometry(4, 4);
      name = `Plane_${objectCounter}`;
      break;
    case 'torusknot':
      geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
      name = `TorusKnot_${objectCounter}`;
      break;
    case 'dodecahedron':
      geometry = new THREE.DodecahedronGeometry(1);
      name = `Dodecahedron_${objectCounter}`;
      break;
    case 'icosahedron':
      geometry = new THREE.IcosahedronGeometry(1);
      name = `Icosahedron_${objectCounter}`;
      break;
    default:
      geometry = new THREE.BoxGeometry(2, 2, 2);
      name = `Object_${objectCounter}`;
  }

  const material = new THREE.MeshStandardMaterial({
    color: getRandomPastelColor(),
    metalness: 0.1,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = type === 'plane' ? 0.01 : 1;
  mesh.userData.type = type;
  mesh.userData.isCADObject = true;

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Created ${name}`);
}

function getRandomPastelColor() {
  const hue = Math.random();
  const sat = 0.4 + Math.random() * 0.3;
  const light = 0.5 + Math.random() * 0.2;
  return new THREE.Color().setHSL(hue, sat, light);
}

/* ===================== Selection ===================== */
function selectObject(obj) {
  // Deselect previous
  if (selectedObject && selectedObject.material) {
    if (selectedObject.material._originalEmissive !== undefined) {
      selectedObject.material.emissive.setHex(selectedObject.material._originalEmissive);
    }
  }

  selectedObject = obj;

  if (obj) {
    if (obj.material) {
      obj.material._originalEmissive = obj.material.emissive.getHex();
      obj.material.emissive.setHex(0x111122);
    }
    transformControls.attach(obj);
    updatePropertiesPanel();
  } else {
    transformControls.detach();
    clearPropertiesPanel();
  }

  updateSceneTree();
}

function pickObject(event) {
  if (!viewportEl) return;
  const rect = viewportEl.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const pickables = sceneObjects.filter((o) => o.visible);
  const intersects = raycaster.intersectObjects(pickables, true);

  if (intersects.length > 0) {
    let target = intersects[0].object;
    // Walk up to find our CAD object
    while (target && !target.userData.isCADObject && target.parent) {
      target = target.parent;
    }
    if (target && target.userData.isCADObject) {
      selectObject(target);
      return;
    }
  }

  selectObject(null);
}

/* ===================== Delete Object ===================== */
function deleteSelected() {
  if (!selectedObject) return;
  pushUndo('delete', selectedObject);
  transformControls.detach();
  scene.remove(selectedObject);
  sceneObjects = sceneObjects.filter((o) => o !== selectedObject);
  const name = selectedObject.name;

  // Dispose geometry and material
  if (selectedObject.geometry) selectedObject.geometry.dispose();
  if (selectedObject.material) {
    if (Array.isArray(selectedObject.material)) {
      selectedObject.material.forEach((m) => m.dispose());
    } else {
      selectedObject.material.dispose();
    }
  }

  selectedObject = null;
  clearPropertiesPanel();
  updateSceneTree();
  updateStatusBar(`Deleted ${name}`);
}

/* ===================== Duplicate Object ===================== */
function duplicateSelected() {
  if (!selectedObject) return;
  const clone = selectedObject.clone();
  clone.material = selectedObject.material.clone();
  objectCounter++;
  clone.name = `${selectedObject.userData.type || 'Object'}_${objectCounter}`;
  clone.position.x += 2;
  clone.userData = { ...selectedObject.userData };
  scene.add(clone);
  sceneObjects.push(clone);
  selectObject(clone);
  pushUndo('add', clone);
  updateSceneTree();
  updateStatusBar(`Duplicated to ${clone.name}`);
}

/* ===================== Undo / Redo ===================== */
function pushUndo(action, obj) {
  const state = {
    action,
    objects: sceneObjects.map((o) => ({
      uuid: o.uuid,
      name: o.name,
      type: o.userData.type,
      position: o.position.clone(),
      rotation: o.rotation.clone(),
      scale: o.scale.clone(),
      color: o.material ? o.material.color.getHex() : 0xcccccc,
      metalness: o.material ? o.material.metalness : 0,
      roughness: o.material ? o.material.roughness : 0.5,
      visible: o.visible,
      geometry: o.geometry.clone(),
    })),
  };
  if (obj) {
    state.targetUuid = obj.uuid;
    state.targetName = obj.name;
  }
  undoStack.push(state);
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

function restoreState(state) {
  // Remove all current objects
  sceneObjects.forEach((o) => {
    transformControls.detach();
    scene.remove(o);
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  sceneObjects = [];
  selectedObject = null;

  // Recreate from state
  state.objects.forEach((data) => {
    const material = new THREE.MeshStandardMaterial({
      color: data.color,
      metalness: data.metalness,
      roughness: data.roughness,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(data.geometry.clone(), material);
    mesh.name = data.name;
    mesh.position.copy(data.position);
    mesh.rotation.copy(data.rotation);
    mesh.scale.copy(data.scale);
    mesh.visible = data.visible;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = data.type;
    mesh.userData.isCADObject = true;
    scene.add(mesh);
    sceneObjects.push(mesh);
  });

  clearPropertiesPanel();
  updateSceneTree();
}

function undo() {
  if (undoStack.length === 0) return;
  const current = {
    objects: sceneObjects.map((o) => ({
      uuid: o.uuid,
      name: o.name,
      type: o.userData.type,
      position: o.position.clone(),
      rotation: o.rotation.clone(),
      scale: o.scale.clone(),
      color: o.material ? o.material.color.getHex() : 0xcccccc,
      metalness: o.material ? o.material.metalness : 0,
      roughness: o.material ? o.material.roughness : 0.5,
      visible: o.visible,
      geometry: o.geometry.clone(),
    })),
  };
  redoStack.push(current);

  const prev = undoStack.pop();
  restoreState(prev);
  updateUndoRedoButtons();
  updateStatusBar('Undo');
}

function redo() {
  if (redoStack.length === 0) return;
  const current = {
    objects: sceneObjects.map((o) => ({
      uuid: o.uuid,
      name: o.name,
      type: o.userData.type,
      position: o.position.clone(),
      rotation: o.rotation.clone(),
      scale: o.scale.clone(),
      color: o.material ? o.material.color.getHex() : 0xcccccc,
      metalness: o.material ? o.material.metalness : 0,
      roughness: o.material ? o.material.roughness : 0.5,
      visible: o.visible,
      geometry: o.geometry.clone(),
    })),
  };
  undoStack.push(current);

  const next = redoStack.pop();
  restoreState(next);
  updateUndoRedoButtons();
  updateStatusBar('Redo');
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('cad-undo');
  const redoBtn = document.getElementById('cad-redo');
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

/* ===================== Transform Mode ===================== */
function setTransformMode(mode) {
  currentTransformMode = mode;
  transformControls.setMode(mode);

  // Update button states
  document.querySelectorAll('.cad-transform-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  updateStatusBar(`Mode: ${mode}`);
}

/* ===================== Snap ===================== */
function toggleSnap() {
  snapEnabled = !snapEnabled;
  if (snapEnabled) {
    transformControls.setTranslationSnap(snapGrid);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(0.25);
  } else {
    transformControls.setTranslationSnap(null);
    transformControls.setRotationSnap(null);
    transformControls.setScaleSnap(null);
  }
  const snapBtn = document.getElementById('cad-snap');
  if (snapBtn) snapBtn.classList.toggle('active', snapEnabled);
  updateStatusBar(snapEnabled ? 'Snap ON' : 'Snap OFF');
}

/* ===================== Shading Modes ===================== */
function setShadingMode(mode) {
  shadingMode = mode;
  sceneObjects.forEach((obj) => {
    if (!obj.material) return;
    switch (mode) {
      case 'wireframe':
        obj.material.wireframe = true;
        obj.material.transparent = false;
        obj.material.opacity = 1;
        break;
      case 'solid':
        obj.material.wireframe = false;
        obj.material.metalness = 0.1;
        obj.material.roughness = 0.6;
        obj.material.transparent = false;
        obj.material.opacity = 1;
        break;
      case 'material':
        obj.material.wireframe = false;
        obj.material.transparent = false;
        obj.material.opacity = 1;
        break;
    }
    obj.material.needsUpdate = true;
  });

  document.querySelectorAll('.cad-shading-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.shading === mode);
  });
}

/* ===================== Camera Views ===================== */
const STANDARD_VIEWS = {
  front:       { pos: [0, 0, 1],  label: 'Front (1)' },
  back:        { pos: [0, 0, -1], label: 'Back (2)' },
  left:        { pos: [-1, 0, 0], label: 'Left (3)' },
  right:       { pos: [1, 0, 0],  label: 'Right (4)' },
  top:         { pos: [0, 1, 0.001], label: 'Top (5)' },
  bottom:      { pos: [0, -1, 0.001], label: 'Bottom (6)' },
  perspective: { pos: [1, 0.75, 1], label: 'Iso (7)' },
};

function setCameraView(view) {
  const def = STANDARD_VIEWS[view];
  if (!def) return;
  const dist = 15;
  const target = orbitControls.target.clone();
  const endPos = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]).normalize().multiplyScalar(dist).add(target);

  // Smooth animate camera
  animateCamera(camera.position.clone(), endPos, target, 400);

  document.querySelectorAll('.cad-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  updateStatusBar(`View: ${def.label}`);
}

/** Smoothly animate camera from startPos to endPos over durationMs */
function animateCamera(startPos, endPos, lookTarget, durationMs = 400) {
  const startTime = performance.now();
  const _step = (now) => {
    const t = Math.min((now - startTime) / durationMs, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
    camera.position.lerpVectors(startPos, endPos, ease);
    camera.lookAt(lookTarget);
    orbitControls.update();
    if (t < 1) requestAnimationFrame(_step);
  };
  requestAnimationFrame(_step);
}

/* ===================== Boolean Operations (CSG-like) ===================== */
function booleanOperation(op) {
  if (sceneObjects.length < 2) {
    updateStatusBar('Need at least 2 objects for boolean operation');
    return;
  }
  if (!selectedObject) {
    updateStatusBar('Select the target object first');
    return;
  }

  // Simple approach: show a dialog to pick second object
  const otherObjects = sceneObjects.filter((o) => o !== selectedObject);
  if (otherObjects.length === 0) return;

  // For now, use the closest non-selected object
  const second = otherObjects[0];

  // CSG operations require a library — we'll use a simplified merge/subtract approach
  // using Three.js geometry manipulation
  pushUndo('boolean');

  try {
    performBooleanOp(op, selectedObject, second);
    updateStatusBar(`Boolean ${op} completed`);
  } catch (e) {
    updateStatusBar(`Boolean ${op} failed: ${e.message}`);
  }
}

function performBooleanOp(op, objA, objB) {
  // Simplified boolean: For union, merge geometries. For subtract/intersect, use clipping planes approximation.
  // Full CSG would require a dedicated library (three-bvh-csg)

  if (op === 'union') {
    // Merge geometries
    const geoA = objA.geometry.clone();
    const geoB = objB.geometry.clone();

    // Apply transforms to geometry
    geoA.applyMatrix4(objA.matrixWorld);
    geoB.applyMatrix4(objB.matrixWorld);

    const merged = mergeGeometries(geoA, geoB);
    if (merged) {
      const material = objA.material.clone();
      const mesh = new THREE.Mesh(merged, material);
      objectCounter++;
      mesh.name = `Union_${objectCounter}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.type = 'union';
      mesh.userData.isCADObject = true;

      // Remove originals
      scene.remove(objA);
      scene.remove(objB);
      sceneObjects = sceneObjects.filter((o) => o !== objA && o !== objB);

      scene.add(mesh);
      sceneObjects.push(mesh);
      selectObject(mesh);
      updateSceneTree();
    }
  } else if (op === 'subtract') {
    // Approximate subtraction using clipping planes
    const box = new THREE.Box3().setFromObject(objB);
    const planes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -box.min.x),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), box.max.x),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -box.min.y),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), box.max.y),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -box.min.z),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), box.max.z),
    ];

    objA.material.clippingPlanes = planes;
    objA.material.clipIntersection = true;
    objA.material.needsUpdate = true;
    renderer.localClippingEnabled = true;

    // Hide the subtraction object
    scene.remove(objB);
    sceneObjects = sceneObjects.filter((o) => o !== objB);
    updateSceneTree();
    updateStatusBar('Subtract applied (clipping approximation)');
  } else if (op === 'intersect') {
    // Keep only overlapping region using clipping
    const box = new THREE.Box3().setFromObject(objB);
    const planes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), box.max.x),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -box.min.x),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), box.max.y),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -box.min.y),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), box.max.z),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -box.min.z),
    ];

    objA.material.clippingPlanes = planes;
    objA.material.clipIntersection = false;
    objA.material.needsUpdate = true;
    renderer.localClippingEnabled = true;

    scene.remove(objB);
    sceneObjects = sceneObjects.filter((o) => o !== objB);
    updateSceneTree();
    updateStatusBar('Intersect applied (clipping approximation)');
  }
}

function mergeGeometries(geoA, geoB) {
  // Simple merge using BufferGeometryUtils approach
  const posA = geoA.getAttribute('position');
  const posB = geoB.getAttribute('position');
  if (!posA || !posB) return null;

  const totalVerts = posA.count + posB.count;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);

  // Copy A
  for (let i = 0; i < posA.count * 3; i++) {
    positions[i] = posA.array[i];
  }
  const normA = geoA.getAttribute('normal');
  if (normA) {
    for (let i = 0; i < normA.count * 3; i++) {
      normals[i] = normA.array[i];
    }
  }

  // Copy B
  const offset = posA.count * 3;
  for (let i = 0; i < posB.count * 3; i++) {
    positions[offset + i] = posB.array[i];
  }
  const normB = geoB.getAttribute('normal');
  if (normB) {
    for (let i = 0; i < normB.count * 3; i++) {
      normals[offset + i] = normB.array[i];
    }
  }

  // Handle indices
  const idxA = geoA.getIndex();
  const idxB = geoB.getIndex();
  let indices = null;

  if (idxA && idxB) {
    indices = new Uint32Array(idxA.count + idxB.count);
    for (let i = 0; i < idxA.count; i++) {
      indices[i] = idxA.array[i];
    }
    for (let i = 0; i < idxB.count; i++) {
      indices[idxA.count + i] = idxB.array[i] + posA.count;
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (indices) {
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  return merged;
}

/* ===================== Extrude / Revolve ===================== */
function extrudeShape() {
  objectCounter++;
  // Create a star-shaped extrusion as example
  const shape = new THREE.Shape();
  const outerR = 1, innerR = 0.5, points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const extrudeSettings = { depth: 1, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Extrude_${objectCounter}`;
  mesh.position.y = 1;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'extrude';
  mesh.userData.isCADObject = true;

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Created ${mesh.name}`);
}

function revolveShape() {
  objectCounter++;
  // Revolve a profile (vase shape)
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const r = 0.3 + Math.sin(t * Math.PI) * 0.7;
    pts.push(new THREE.Vector2(r, t * 3));
  }

  const geometry = new THREE.LatheGeometry(pts, 32);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Revolve_${objectCounter}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'revolve';
  mesh.userData.isCADObject = true;

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Created ${mesh.name}`);
}

/* ===================== Export ===================== */
function exportSTL() {
  const exporter = new STLExporter();
  const exportScene = new THREE.Scene();
  sceneObjects.forEach((o) => {
    if (o.visible) exportScene.add(o.clone());
  });
  const result = exporter.parse(exportScene, { binary: true });
  downloadBlob(new Blob([result], { type: 'application/octet-stream' }), 'model.stl');
  // Return objects back
  updateStatusBar('Exported STL');
}

function exportOBJ() {
  const exporter = new OBJExporter();
  const exportScene = new THREE.Scene();
  sceneObjects.forEach((o) => {
    if (o.visible) exportScene.add(o.clone());
  });
  const result = exporter.parse(exportScene);
  downloadBlob(new Blob([result], { type: 'text/plain' }), 'model.obj');
  updateStatusBar('Exported OBJ');
}

function exportGLTF() {
  const exporter = new GLTFExporter();
  const exportScene = new THREE.Scene();
  sceneObjects.forEach((o) => {
    if (o.visible) exportScene.add(o.clone());
  });
  exporter.parse(
    exportScene,
    (gltf) => {
      const output = JSON.stringify(gltf, null, 2);
      downloadBlob(new Blob([output], { type: 'application/json' }), 'model.gltf');
      updateStatusBar('Exported GLTF');
    },
    (error) => {
      updateStatusBar(`Export error: ${error.message}`);
    },
    {}
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ===================== Import ===================== */
function importFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      if (ext === 'stl') {
        const loader = new STLLoader();
        const geometry = loader.parse(e.target.result);
        addImportedGeometry(geometry, file.name);
      } else if (ext === 'obj') {
        const loader = new OBJLoader();
        const obj = loader.parse(e.target.result);
        addImportedGroup(obj, file.name);
      } else if (ext === 'gltf' || ext === 'glb') {
        const loader = new GLTFLoader();
        loader.parse(e.target.result, '', (gltf) => {
          addImportedGroup(gltf.scene, file.name);
        });
      }
    } catch (err) {
      updateStatusBar(`Import error: ${err.message}`);
    }
  };

  if (ext === 'stl' || ext === 'glb') {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

function addImportedGeometry(geometry, filename) {
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  objectCounter++;
  mesh.name = `Import_${objectCounter}_${filename}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'imported';
  mesh.userData.isCADObject = true;

  // Auto-scale to fit viewport
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 10) {
    const scale = 5 / maxDim;
    mesh.scale.multiplyScalar(scale);
  }

  // Center
  const center = box.getCenter(new THREE.Vector3());
  mesh.position.sub(center);
  mesh.position.y = 0;

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Imported ${filename}`);
}

function addImportedGroup(group, filename) {
  objectCounter++;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.type = 'imported';
      child.userData.isCADObject = true;
      child.name = child.name || `Import_${objectCounter}_part`;
      sceneObjects.push(child);
    }
  });

  scene.add(group);
  // Auto-scale
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 10) {
    const scale = 5 / maxDim;
    group.scale.multiplyScalar(scale);
  }

  updateSceneTree();
  updateStatusBar(`Imported ${filename}`);
}

/* ===================== Scene Tree ===================== */
function updateSceneTree() {
  const tree = document.getElementById('cad-scene-tree');
  if (!tree) return;

  tree.innerHTML = '';
  sceneObjects.forEach((obj) => {
    const item = document.createElement('div');
    item.className = 'cad-tree-item' + (obj === selectedObject ? ' selected' : '');
    item.innerHTML = `
      <span class="tree-icon">${getObjectIcon(obj.userData.type)}</span>
      <span class="tree-name" title="${_esc(obj.name)}">${_esc(obj.name)}</span>
      <span class="tree-vis">${obj.visible ? '👁' : '🚫'}</span>
    `;

    item.addEventListener('click', () => selectObject(obj));
    item.querySelector('.tree-vis').addEventListener('click', (e) => {
      e.stopPropagation();
      obj.visible = !obj.visible;
      updateSceneTree();
    });

    tree.appendChild(item);
  });
}

function getObjectIcon(type) {
  const icons = {
    box: '🟦', sphere: '🔵', cylinder: '🔷', cone: '🔺',
    torus: '⭕', plane: '⬜', torusknot: '🔗', dodecahedron: '🔶',
    icosahedron: '💎', extrude: '🔧', revolve: '🔄', union: '➕',
    imported: '📦',
  };
  return icons[type] || '🔲';
}

/* ===================== Properties Panel ===================== */
function updatePropertiesPanel() {
  if (!selectedObject) return;

  const obj = selectedObject;

  // Position
  setInput('cad-pos-x', obj.position.x.toFixed(3));
  setInput('cad-pos-y', obj.position.y.toFixed(3));
  setInput('cad-pos-z', obj.position.z.toFixed(3));

  // Rotation (degrees)
  setInput('cad-rot-x', THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1));
  setInput('cad-rot-y', THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1));
  setInput('cad-rot-z', THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1));

  // Scale
  setInput('cad-scl-x', obj.scale.x.toFixed(3));
  setInput('cad-scl-y', obj.scale.y.toFixed(3));
  setInput('cad-scl-z', obj.scale.z.toFixed(3));

  // Material
  if (obj.material) {
    const colorInput = document.getElementById('cad-mat-color');
    if (colorInput) colorInput.value = '#' + obj.material.color.getHexString();

    setInput('cad-mat-metalness', obj.material.metalness);
    setInput('cad-mat-roughness', obj.material.roughness);
    setInput('cad-mat-opacity', obj.material.opacity);

    const wireChk = document.getElementById('cad-mat-wireframe');
    if (wireChk) wireChk.checked = obj.material.wireframe;
  }

  // Object name
  const nameInput = document.getElementById('cad-obj-name');
  if (nameInput) nameInput.value = obj.name;

  // Show measurement
  updateMeasurement(obj);
}

function clearPropertiesPanel() {
  ['cad-pos-x','cad-pos-y','cad-pos-z','cad-rot-x','cad-rot-y','cad-rot-z','cad-scl-x','cad-scl-y','cad-scl-z'].forEach((id) => setInput(id, ''));
  setInput('cad-mat-metalness', 0);
  setInput('cad-mat-roughness', 0.5);
  setInput('cad-mat-opacity', 1);
  const nameInput = document.getElementById('cad-obj-name');
  if (nameInput) nameInput.value = '';
  const measDiv = document.getElementById('cad-measurement');
  if (measDiv) measDiv.textContent = '';
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function updateMeasurement(obj) {
  const measDiv = document.getElementById('cad-measurement');
  if (!measDiv || !obj) return;

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  measDiv.textContent = `Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
}

/* ===================== Coordinate Display ===================== */
function updateCoordinateDisplay() {
  const coordEl = document.getElementById('cad-coords');
  if (!coordEl) return;

  if (selectedObject) {
    const p = selectedObject.position;
    coordEl.textContent = `X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`;
  } else {
    coordEl.textContent = 'X: 0.00  Y: 0.00  Z: 0.00';
  }
}

function updateStatusBar(msg) {
  const statusEl = document.getElementById('cad-status-msg');
  if (statusEl && msg) statusEl.textContent = msg;

  const countEl = document.getElementById('cad-obj-count');
  if (countEl) countEl.textContent = `Objects: ${sceneObjects.length}`;
}

/* ===================== Event Binding ===================== */
function bindToolbarEvents(container) {
  // Transform mode buttons
  container.querySelectorAll('.cad-transform-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTransformMode(btn.dataset.mode));
  });

  // Undo/Redo
  const undoBtn = document.getElementById('cad-undo');
  const redoBtn = document.getElementById('cad-redo');
  if (undoBtn) undoBtn.addEventListener('click', () => undo());
  if (redoBtn) redoBtn.addEventListener('click', () => redo());

  // Snap toggle
  const snapBtn = document.getElementById('cad-snap');
  if (snapBtn) snapBtn.addEventListener('click', () => toggleSnap());

  // Delete
  const delBtn = document.getElementById('cad-delete');
  if (delBtn) delBtn.addEventListener('click', () => deleteSelected());

  // Duplicate
  const dupBtn = document.getElementById('cad-duplicate');
  if (dupBtn) dupBtn.addEventListener('click', () => duplicateSelected());

  // Shading mode buttons
  container.querySelectorAll('.cad-shading-btn').forEach((btn) => {
    btn.addEventListener('click', () => setShadingMode(btn.dataset.shading));
  });

  // Camera view buttons
  container.querySelectorAll('.cad-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setCameraView(btn.dataset.view));
  });

  // Boolean operations
  const unionBtn = document.getElementById('cad-bool-union');
  const subBtn = document.getElementById('cad-bool-subtract');
  const interBtn = document.getElementById('cad-bool-intersect');
  if (unionBtn) unionBtn.addEventListener('click', () => booleanOperation('union'));
  if (subBtn) subBtn.addEventListener('click', () => booleanOperation('subtract'));
  if (interBtn) interBtn.addEventListener('click', () => booleanOperation('intersect'));

  // Extrude / Revolve
  const extBtn = document.getElementById('cad-extrude');
  const revBtn = document.getElementById('cad-revolve');
  if (extBtn) extBtn.addEventListener('click', () => extrudeShape());
  if (revBtn) revBtn.addEventListener('click', () => revolveShape());

  // Focus selected
  const focusBtn = document.getElementById('cad-focus');
  if (focusBtn) focusBtn.addEventListener('click', () => focusSelected());

  // Clear scene
  const clearBtn = document.getElementById('cad-clear-scene');
  if (clearBtn) clearBtn.addEventListener('click', () => clearScene());

  // Light controls
  const ambIntensity = document.getElementById('cad-light-ambient');
  const dirIntensity = document.getElementById('cad-light-directional');
  if (ambIntensity) ambIntensity.addEventListener('input', () => {
    lights.ambient.intensity = parseFloat(ambIntensity.value);
  });
  if (dirIntensity) dirIntensity.addEventListener('input', () => {
    lights.directional.intensity = parseFloat(dirIntensity.value);
  });
}

function bindPrimitiveEvents(container) {
  container.querySelectorAll('.cad-prim-btn').forEach((btn) => {
    btn.addEventListener('click', () => createPrimitive(btn.dataset.prim));
  });
}

function bindPropertyEvents(container) {
  // Position inputs
  ['cad-pos-x','cad-pos-y','cad-pos-z'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!selectedObject) return;
      const axis = id.split('-').pop();
      selectedObject.position[axis] = parseFloat(el.value) || 0;
      pushUndo('transform');
    });
  });

  // Rotation inputs
  ['cad-rot-x','cad-rot-y','cad-rot-z'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!selectedObject) return;
      const axis = id.split('-').pop();
      selectedObject.rotation[axis] = THREE.MathUtils.degToRad(parseFloat(el.value) || 0);
      pushUndo('transform');
    });
  });

  // Scale inputs
  ['cad-scl-x','cad-scl-y','cad-scl-z'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!selectedObject) return;
      const axis = id.split('-').pop();
      selectedObject.scale[axis] = parseFloat(el.value) || 1;
      pushUndo('transform');
    });
  });

  // Material color
  const colorInput = document.getElementById('cad-mat-color');
  if (colorInput) colorInput.addEventListener('input', () => {
    if (selectedObject && selectedObject.material) {
      selectedObject.material.color.set(colorInput.value);
    }
  });

  // Material properties
  const metalInput = document.getElementById('cad-mat-metalness');
  if (metalInput) metalInput.addEventListener('input', () => {
    if (selectedObject && selectedObject.material) {
      selectedObject.material.metalness = parseFloat(metalInput.value);
    }
  });

  const roughInput = document.getElementById('cad-mat-roughness');
  if (roughInput) roughInput.addEventListener('input', () => {
    if (selectedObject && selectedObject.material) {
      selectedObject.material.roughness = parseFloat(roughInput.value);
    }
  });

  const opacityInput = document.getElementById('cad-mat-opacity');
  if (opacityInput) opacityInput.addEventListener('input', () => {
    if (selectedObject && selectedObject.material) {
      selectedObject.material.opacity = parseFloat(opacityInput.value);
      selectedObject.material.transparent = parseFloat(opacityInput.value) < 1;
    }
  });

  const wireChk = document.getElementById('cad-mat-wireframe');
  if (wireChk) wireChk.addEventListener('change', () => {
    if (selectedObject && selectedObject.material) {
      selectedObject.material.wireframe = wireChk.checked;
    }
  });

  // Object name
  const nameInput = document.getElementById('cad-obj-name');
  if (nameInput) nameInput.addEventListener('change', () => {
    if (selectedObject) {
      selectedObject.name = nameInput.value;
      updateSceneTree();
    }
  });
}

function bindViewportEvents(container) {
  const viewport = container.querySelector('.cad-viewport');
  if (!viewport) return;

  // Click to select or measure
  viewport.addEventListener('click', (e) => {
    // Ignore if we clicked on a control button or view cube
    if (e.target.closest('.cad-viewport-overlay') || e.target.closest('.cad-viewport-info') || e.target.closest('.cad-view-cube')) return;
    // Ignore if transform controls are being used
    if (transformControls.dragging) return;

    // Measurement tool takes priority
    if (measurementMode) { handleMeasureClick(e); return; }

    // Ctrl+click for multi-select
    if (e.ctrlKey || e.metaKey) {
      const rect = viewport.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(mouse, camera);
      const hits = rc.intersectObjects(sceneObjects.filter((o) => o.visible), true);
      if (hits.length > 0) {
        let target = hits[0].object;
        while (target && !target.userData.isCADObject && target.parent) target = target.parent;
        if (target && target.userData.isCADObject) {
          const idx = multiSelection.indexOf(target);
          if (idx >= 0) {
            multiSelection.splice(idx, 1);
            if (target.material && target.material._originalEmissive !== undefined) {
              target.material.emissive.setHex(target.material._originalEmissive);
            }
          } else {
            multiSelection.push(target);
            if (target.material) {
              target.material._originalEmissive = target.material._originalEmissive ?? target.material.emissive.getHex();
              target.material.emissive.setHex(0x111122);
            }
          }
          if (multiSelection.length > 0) selectObject(multiSelection[multiSelection.length - 1]);
          updateStatusBar(`Multi-select: ${multiSelection.length}`);
          return;
        }
      }
    }

    pickObject(e);
    multiSelection = selectedObject ? [selectedObject] : [];
  });

  // Context menu — track right-click drag to avoid conflict with pan
  let _rightDownPos = null;
  viewport.addEventListener('mousedown', (e) => {
    if (e.button === 2) _rightDownPos = { x: e.clientX, y: e.clientY };
  });
  viewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Only show context menu on right-click without drag (< 5px movement)
    if (_rightDownPos) {
      const dx = Math.abs(e.clientX - _rightDownPos.x);
      const dy = Math.abs(e.clientY - _rightDownPos.y);
      if (dx < 5 && dy < 5) {
        showContextMenu(e.clientX, e.clientY);
      }
    }
    _rightDownPos = null;
  });

  // Double-click to focus
  viewport.addEventListener('dblclick', (e) => {
    if (e.target.closest('.cad-viewport-overlay')) return;
    pickObject(e);
    if (selectedObject) focusSelected();
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Only respond when CAD tab is active
    const cadView = document.getElementById('view-cad');
    if (!cadView || cadView.style.display === 'none' || !cadView.offsetParent) return;

    // Don't interfere with input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    // --- Modifier combos first ---
    if (key === 'z' && mod && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((key === 'z' && mod && e.shiftKey) || (key === 'y' && mod)) { e.preventDefault(); redo(); return; }
    if (key === 'd' && mod) { e.preventDefault(); duplicateSelected(); return; }
    if (key === 'a' && mod) { e.preventDefault(); selectAll(); return; }
    if (key === 'c' && mod) { e.preventDefault(); copySelected(); return; }
    if (key === 'v' && mod) { e.preventDefault(); pasteClipboard(); return; }

    // --- Single keys ---
    if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelected(); return; }

    // Onshape-style: W=Move, E=Rotate, R=Scale
    if (key === 'w') { setTransformMode('translate'); return; }
    if (key === 'e') { setTransformMode('rotate'); return; }
    if (key === 'r') { setTransformMode('scale'); return; }

    // F = Fit all / zoom to fit (Onshape standard)
    if (key === 'f') { fitAll(); return; }

    // G = Toggle grid (Onshape convention)
    if (key === 'g') { toggleGrid(); return; }

    // N = Normal to face
    if (key === 'n') { normalToFace(); return; }

    // S = S-key radial shortcut menu (Onshape signature)
    if (key === 's' && !mod) { e.preventDefault(); toggleRadialMenu(e); return; }

    // M = Toggle measurement tool
    if (key === 'm') { toggleMeasurementTool(); return; }

    // Escape = Deselect / dismiss menus
    if (key === 'escape') {
      selectObject(null);
      hideContextMenu();
      hideRadialMenu();
      if (measurementMode) toggleMeasurementTool();
      return;
    }

    // Standard views: 1=Front, 2=Back, 3=Left, 4=Right, 5=Top, 6=Bottom, 7=Isometric
    const viewKeys = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'perspective' };
    if (viewKeys[key]) { setCameraView(viewKeys[key]); return; }
    // 0 = perspective (legacy compat)
    if (key === '0') { setCameraView('perspective'); return; }
  });
}

function bindImportExport(container) {
  // Export buttons
  const exportStl = document.getElementById('cad-export-stl');
  const exportObj = document.getElementById('cad-export-obj');
  const exportGltf = document.getElementById('cad-export-gltf');
  if (exportStl) exportStl.addEventListener('click', () => exportSTL());
  if (exportObj) exportObj.addEventListener('click', () => exportOBJ());
  if (exportGltf) exportGltf.addEventListener('click', () => exportGLTF());

  // Import
  const importBtn = document.getElementById('cad-import');
  const importInput = document.getElementById('cad-import-input');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importFile(e.target.files[0]);
        e.target.value = '';
      }
    });
  }
}

/* ===================== Fit All (Zoom to fit all objects) ===================== */
function fitAll() {
  if (sceneObjects.length === 0) {
    orbitControls.target.set(0, 0, 0);
    camera.position.set(8, 6, 8);
    orbitControls.update();
    updateStatusBar('Fit All (empty scene)');
    return;
  }

  const box = new THREE.Box3();
  sceneObjects.forEach((o) => { if (o.visible) box.expandByObject(o); });
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let dist = maxDim / (2 * Math.tan(fov / 2)) * 1.8;
  dist = Math.max(dist, 3);

  const dir = camera.position.clone().sub(orbitControls.target).normalize();
  const endPos = center.clone().add(dir.multiplyScalar(dist));
  animateCamera(camera.position.clone(), endPos, center, 400);
  orbitControls.target.copy(center);
  updateStatusBar('Fit All');
}

/* ===================== Toggle Grid ===================== */
let gridVisible = true;
function toggleGrid() {
  gridVisible = !gridVisible;
  if (gridHelper) gridHelper.visible = gridVisible;
  if (axesHelper) axesHelper.visible = gridVisible;
  const btn = document.getElementById('cad-grid-toggle');
  if (btn) btn.classList.toggle('active', gridVisible);
  updateStatusBar(gridVisible ? 'Grid ON' : 'Grid OFF');
}

/* ===================== Normal to Face ===================== */
function normalToFace() {
  if (!selectedObject) { updateStatusBar('Select an object first'); return; }
  // Orient camera to look along the face normal of the nearest face to the camera
  const raycaster = new THREE.Raycaster();
  const dir = camera.position.clone().sub(orbitControls.target).normalize();
  raycaster.set(orbitControls.target, dir);
  const hits = raycaster.intersectObject(selectedObject, true);
  if (hits.length > 0 && hits[0].face) {
    const normal = hits[0].face.normal.clone();
    normal.transformDirection(selectedObject.matrixWorld);
    const center = hits[0].point.clone();
    const dist = camera.position.distanceTo(orbitControls.target);
    const endPos = center.clone().add(normal.multiplyScalar(dist));
    animateCamera(camera.position.clone(), endPos, center, 400);
    orbitControls.target.copy(center);
    updateStatusBar('Normal to face');
  } else {
    updateStatusBar('No face detected');
  }
}

/* ===================== Select All ===================== */
let multiSelection = [];
function selectAll() {
  multiSelection = [...sceneObjects];
  if (sceneObjects.length > 0) selectObject(sceneObjects[0]);
  // Highlight all
  sceneObjects.forEach((o) => {
    if (o.material) {
      o.material._originalEmissive = o.material._originalEmissive ?? o.material.emissive.getHex();
      o.material.emissive.setHex(0x111122);
    }
  });
  updateStatusBar(`Selected all (${sceneObjects.length})`);
  updateSceneTree();
}

/* ===================== Copy / Paste ===================== */
let clipboardData = null;
function copySelected() {
  if (!selectedObject) return;
  clipboardData = {
    type: selectedObject.userData.type,
    position: selectedObject.position.clone(),
    rotation: selectedObject.rotation.clone(),
    scale: selectedObject.scale.clone(),
    color: selectedObject.material ? selectedObject.material.color.getHex() : 0xcccccc,
    metalness: selectedObject.material ? selectedObject.material.metalness : 0,
    roughness: selectedObject.material ? selectedObject.material.roughness : 0.5,
    geometry: selectedObject.geometry.clone(),
  };
  updateStatusBar(`Copied ${selectedObject.name}`);
}

function pasteClipboard() {
  if (!clipboardData) { updateStatusBar('Nothing to paste'); return; }
  const material = new THREE.MeshStandardMaterial({
    color: clipboardData.color,
    metalness: clipboardData.metalness,
    roughness: clipboardData.roughness,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(clipboardData.geometry.clone(), material);
  objectCounter++;
  mesh.name = `${clipboardData.type || 'Object'}_${objectCounter}`;
  mesh.position.copy(clipboardData.position).add(new THREE.Vector3(2, 0, 2));
  mesh.rotation.copy(clipboardData.rotation);
  mesh.scale.copy(clipboardData.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = clipboardData.type;
  mesh.userData.isCADObject = true;
  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Pasted ${mesh.name}`);
}

/* ===================== S-Key Radial Menu (Onshape signature) ===================== */
let radialMenuVisible = false;

function toggleRadialMenu(e) {
  if (radialMenuVisible) { hideRadialMenu(); return; }
  showRadialMenu(e);
}

function showRadialMenu(e) {
  const menu = document.getElementById('cad-radial-menu');
  if (!menu) return;

  const items = [
    { icon: '🟦', label: 'Box', action: () => createPrimitive('box') },
    { icon: '🔵', label: 'Sphere', action: () => createPrimitive('sphere') },
    { icon: '🔷', label: 'Cylinder', action: () => createPrimitive('cylinder') },
    { icon: '✥', label: 'Move', action: () => setTransformMode('translate') },
    { icon: '↻', label: 'Rotate', action: () => setTransformMode('rotate') },
    { icon: '⤢', label: 'Scale', action: () => setTransformMode('scale') },
    { icon: '🗑', label: 'Delete', action: () => deleteSelected() },
    { icon: '📋', label: 'Duplicate', action: () => duplicateSelected() },
  ];

  // Position near cursor or viewport center
  const viewport = document.querySelector('.cad-viewport');
  const rect = viewport ? viewport.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const cx = e && e.clientX ? e.clientX - rect.left : rect.width / 2;
  const cy = e && e.clientY ? e.clientY - rect.top : rect.height / 2;

  menu.style.left = (rect.left + cx - 100) + 'px';
  menu.style.top = (rect.top + cy - 100) + 'px';

  const radius = 80;
  let html = '<div class="radial-center">S</div>';
  items.forEach((item, i) => {
    const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius + 100 - 24;
    const y = Math.sin(angle) * radius + 100 - 24;
    html += `<button class="radial-item" data-idx="${i}" style="left:${x}px;top:${y}px" title="${_esc(item.label)}">
      <span class="radial-icon">${item.icon}</span>
      <span class="radial-label">${_esc(item.label)}</span>
    </button>`;
  });
  menu.innerHTML = html;
  menu.classList.add('visible');
  radialMenuVisible = true;

  // Bind item clicks
  menu.querySelectorAll('.radial-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (items[idx]) items[idx].action();
      hideRadialMenu();
    });
  });

  // Close on click outside (after a tick)
  const _close = (ev) => {
    if (!menu.contains(ev.target)) {
      hideRadialMenu();
      document.removeEventListener('mousedown', _close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', _close), 0);
}

function hideRadialMenu() {
  const menu = document.getElementById('cad-radial-menu');
  if (menu) menu.classList.remove('visible');
  radialMenuVisible = false;
}

/* ===================== View Cube ===================== */
let viewCubeScene, viewCubeCamera, viewCubeRenderer;

function initViewCube() {
  const container = document.getElementById('cad-view-cube');
  if (!container || viewCubeRenderer) return;

  const size = 120;
  viewCubeScene = new THREE.Scene();
  viewCubeCamera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 10);
  viewCubeCamera.position.set(2, 1.5, 2);
  viewCubeCamera.lookAt(0, 0, 0);

  viewCubeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  viewCubeRenderer.setSize(size, size);
  viewCubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(viewCubeRenderer.domElement);

  // Create cube faces with labels
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
  viewCubeScene.add(cube);

  // Axes indicator
  const axLen = 1.0;
  const axGeo = new THREE.CylinderGeometry(0.03, 0.03, axLen, 6);
  const makeAxis = (color, rotAxis, angle, posOffset) => {
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(axGeo, mat);
    if (rotAxis) mesh.rotation[rotAxis] = angle;
    mesh.position.copy(posOffset);
    viewCubeScene.add(mesh);
  };
  makeAxis(0xff4444, 'z', Math.PI / 2, new THREE.Vector3(axLen / 2, -0.8, -0.8)); // X
  makeAxis(0x44ff44, null, 0, new THREE.Vector3(-0.8, axLen / 2 - 0.8, -0.8)); // Y
  makeAxis(0x4444ff, 'x', Math.PI / 2, new THREE.Vector3(-0.8, -0.8, axLen / 2)); // Z

  // Click handler
  container.addEventListener('click', (e) => {
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, viewCubeCamera);
    const hits = rc.intersectObject(cube);
    if (hits.length > 0) {
      const faceIdx = Math.floor(hits[0].faceIndex / 2);
      const viewMap = ['right', 'left', 'top', 'bottom', 'front', 'back'];
      setCameraView(viewMap[faceIdx] || 'front');
    }
  });

  // Hover effect
  container.style.cursor = 'pointer';
}

function renderViewCube() {
  if (!viewCubeRenderer || !viewCubeCamera) return;
  // Sync view cube orientation with main camera
  const dir = camera.position.clone().sub(orbitControls.target).normalize();
  viewCubeCamera.position.copy(dir.multiplyScalar(3));
  viewCubeCamera.lookAt(0, 0, 0);
  viewCubeRenderer.render(viewCubeScene, viewCubeCamera);
}

/* ===================== Box Select ===================== */
let boxSelectActive = false;
let boxSelectStart = null;
let boxSelectDiv = null;

function initBoxSelect() {
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;

  viewport.addEventListener('mousedown', (e) => {
    // Only left click on empty space starts box select
    if (e.button !== 0) return;
    if (e.target.closest('.cad-viewport-overlay') || e.target.closest('.cad-viewport-info') || e.target.closest('.cad-view-cube')) return;
    if (transformControls.dragging) return;

    // Check if we clicked on an object — if so, skip box select
    const rect = viewport.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, camera);
    const hits = rc.intersectObjects(sceneObjects.filter((o) => o.visible), true);
    if (hits.length > 0) return; // clicked on an object, let normal select handle it

    boxSelectStart = { x: e.clientX, y: e.clientY };
    boxSelectActive = false; // becomes true only if drag distance > threshold
  });

  document.addEventListener('mousemove', (e) => {
    if (!boxSelectStart) return;
    const dx = e.clientX - boxSelectStart.x;
    const dy = e.clientY - boxSelectStart.y;
    if (!boxSelectActive && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      boxSelectActive = true;
      if (!boxSelectDiv) {
        boxSelectDiv = document.createElement('div');
        boxSelectDiv.className = 'cad-box-select';
        document.body.appendChild(boxSelectDiv);
      }
      boxSelectDiv.style.display = 'block';
    }
    if (boxSelectActive && boxSelectDiv) {
      const left = Math.min(e.clientX, boxSelectStart.x);
      const top = Math.min(e.clientY, boxSelectStart.y);
      const w = Math.abs(dx);
      const h = Math.abs(dy);
      boxSelectDiv.style.left = left + 'px';
      boxSelectDiv.style.top = top + 'px';
      boxSelectDiv.style.width = w + 'px';
      boxSelectDiv.style.height = h + 'px';
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (boxSelectActive && boxSelectStart) {
      // Find objects within box
      const rect = viewport.getBoundingClientRect();
      const x1 = Math.min(e.clientX, boxSelectStart.x);
      const y1 = Math.min(e.clientY, boxSelectStart.y);
      const x2 = Math.max(e.clientX, boxSelectStart.x);
      const y2 = Math.max(e.clientY, boxSelectStart.y);

      multiSelection = [];
      sceneObjects.forEach((obj) => {
        if (!obj.visible) return;
        const pos = obj.position.clone().project(camera);
        const sx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
        if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
          multiSelection.push(obj);
          if (obj.material) {
            obj.material._originalEmissive = obj.material._originalEmissive ?? obj.material.emissive.getHex();
            obj.material.emissive.setHex(0x111122);
          }
        }
      });
      if (multiSelection.length > 0) {
        selectObject(multiSelection[0]);
        updateStatusBar(`Box selected ${multiSelection.length} objects`);
      }
    }
    boxSelectStart = null;
    boxSelectActive = false;
    if (boxSelectDiv) boxSelectDiv.style.display = 'none';
  });
}

/* ===================== Measurement Tool ===================== */
let measurementMode = false;
let measurePoints = [];
let measureLines = [];

function toggleMeasurementTool() {
  measurementMode = !measurementMode;
  measurePoints = [];
  clearMeasureLines();
  const btn = document.getElementById('cad-measure-tool');
  if (btn) btn.classList.toggle('active', measurementMode);
  updateStatusBar(measurementMode ? 'Measure: Click first point' : 'Measure OFF');
  if (!measurementMode) {
    const overlay = document.getElementById('cad-measure-overlay');
    if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); }
  }
}

function handleMeasureClick(e) {
  if (!measurementMode) return;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  const hits = rc.intersectObjects(sceneObjects.filter((o) => o.visible), true);

  if (hits.length === 0) return;
  measurePoints.push(hits[0].point.clone());

  if (measurePoints.length === 1) {
    updateStatusBar('Measure: Click second point');
    // Add sphere at first point
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, depthTest: false })
    );
    dot.position.copy(hits[0].point);
    dot.userData.isMeasure = true;
    dot.renderOrder = 999;
    scene.add(dot);
    measureLines.push(dot);
  } else if (measurePoints.length === 2) {
    const p1 = measurePoints[0];
    const p2 = measurePoints[1];
    const distance = p1.distanceTo(p2);

    // Draw line between points
    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 2, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.userData.isMeasure = true;
    line.renderOrder = 999;
    scene.add(line);
    measureLines.push(line);

    // Add sphere at second point
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, depthTest: false })
    );
    dot.position.copy(p2);
    dot.userData.isMeasure = true;
    dot.renderOrder = 999;
    scene.add(dot);
    measureLines.push(dot);

    // Draw distance label on 2D overlay
    drawMeasurementLabel(p1, p2, distance);
    updateStatusBar(`Distance: ${distance.toFixed(4)} units`);

    // Update measurement panel
    const measDiv = document.getElementById('cad-measurement');
    if (measDiv) measDiv.textContent = `Distance: ${distance.toFixed(4)}`;

    measurePoints = [];
  }
}

function drawMeasurementLabel(p1, p2, distance) {
  const overlay = document.getElementById('cad-measure-overlay');
  if (!overlay) return;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  const ctx = overlay.getContext('2d');
  // Project midpoint to screen
  const mid = p1.clone().add(p2).multiplyScalar(0.5).project(camera);
  const sx = (mid.x * 0.5 + 0.5) * rect.width;
  const sy = (-mid.y * 0.5 + 0.5) * rect.height;

  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#ff6600';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  const text = `${distance.toFixed(3)}`;
  ctx.strokeText(text, sx + 8, sy - 8);
  ctx.fillText(text, sx + 8, sy - 8);
}

function clearMeasureLines() {
  measureLines.forEach((obj) => {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  measureLines = [];
  const overlay = document.getElementById('cad-measure-overlay');
  if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); }
}

/* ===================== Section / Clipping Plane ===================== */
let clippingPlane = null;
let clippingHelper = null;
let sectionActive = false;

function toggleSectionView() {
  sectionActive = !sectionActive;
  const controls = document.getElementById('cad-clip-controls');
  const btn = document.getElementById('cad-section-tool');

  if (sectionActive) {
    if (!clippingPlane) {
      clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    }
    renderer.localClippingEnabled = true;
    sceneObjects.forEach((o) => {
      if (o.material) {
        o.material.clippingPlanes = [clippingPlane];
        o.material.needsUpdate = true;
      }
    });
    // Show clipping helper plane
    if (!clippingHelper) {
      const planeGeo = new THREE.PlaneGeometry(40, 40);
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0xff6600, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, depthWrite: false
      });
      clippingHelper = new THREE.Mesh(planeGeo, planeMat);
      clippingHelper.userData.isHelper = true;
      scene.add(clippingHelper);
    }
    clippingHelper.visible = true;
    if (controls) controls.style.display = 'block';
    if (btn) btn.classList.add('active');
    updateStatusBar('Section View ON');
  } else {
    renderer.localClippingEnabled = false;
    sceneObjects.forEach((o) => {
      if (o.material) {
        o.material.clippingPlanes = [];
        o.material.needsUpdate = true;
      }
    });
    if (clippingHelper) clippingHelper.visible = false;
    if (controls) controls.style.display = 'none';
    if (btn) btn.classList.remove('active');
    updateStatusBar('Section View OFF');
  }
}

function updateClippingPlane() {
  if (!clippingPlane) return;
  const axis = document.getElementById('cad-clip-axis');
  const pos = document.getElementById('cad-clip-pos');
  const flip = document.getElementById('cad-clip-flip');
  if (!axis || !pos) return;

  const a = axis.value;
  const p = parseFloat(pos.value);
  const f = flip && flip.checked ? -1 : 1;

  const normals = { x: new THREE.Vector3(f, 0, 0), y: new THREE.Vector3(0, f, 0), z: new THREE.Vector3(0, 0, f) };
  clippingPlane.normal.copy(normals[a] || normals.y);
  clippingPlane.constant = -p * f;

  // Update helper
  if (clippingHelper) {
    clippingHelper.position.set(a === 'x' ? p : 0, a === 'y' ? p : 0, a === 'z' ? p : 0);
    clippingHelper.rotation.set(
      a === 'z' ? Math.PI / 2 : (a === 'y' ? 0 : 0),
      0,
      a === 'x' ? Math.PI / 2 : 0
    );
    if (a === 'x') { clippingHelper.rotation.set(0, Math.PI / 2, 0); }
    if (a === 'y') { clippingHelper.rotation.set(Math.PI / 2, 0, 0); }
    if (a === 'z') { clippingHelper.rotation.set(0, 0, 0); }
  }
}

/* ===================== Focus Selected ===================== */
function focusSelected() {
  if (!selectedObject) {
    // Focus scene center
    orbitControls.target.set(0, 0, 0);
    camera.position.set(8, 6, 8);
    orbitControls.update();
    return;
  }

  const box = new THREE.Box3().setFromObject(selectedObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let dist = maxDim / (2 * Math.tan(fov / 2)) * 2;
  dist = Math.max(dist, 3);

  const dir = camera.position.clone().sub(orbitControls.target).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist));
  orbitControls.target.copy(center);
  orbitControls.update();
}

/* ===================== Clear Scene ===================== */
function clearScene() {
  if (sceneObjects.length === 0) return;
  pushUndo('clear');

  sceneObjects.forEach((obj) => {
    transformControls.detach();
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  sceneObjects = [];
  selectedObject = null;
  objectCounter = 0;

  clearPropertiesPanel();
  updateSceneTree();
  updateStatusBar('Scene cleared');
}

/* ===================== Context Menu ===================== */
function showContextMenu(x, y) {
  const menu = document.getElementById('cad-context-menu');
  if (!menu) return;

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('visible');

  // Update menu items based on selection
  menu.querySelectorAll('[data-action]').forEach((item) => {
    const needsSelection = ['delete', 'duplicate', 'focus'].includes(item.dataset.action);
    item.style.display = needsSelection && !selectedObject ? 'none' : '';
  });

  // Close on click outside
  const close = (e) => {
    if (!menu.contains(e.target)) {
      hideContextMenu();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function hideContextMenu() {
  const menu = document.getElementById('cad-context-menu');
  if (menu) menu.classList.remove('visible');
}

function handleContextAction(action) {
  hideContextMenu();
  switch (action) {
    case 'delete': deleteSelected(); break;
    case 'duplicate': duplicateSelected(); break;
    case 'focus': focusSelected(); break;
    case 'move': setTransformMode('translate'); break;
    case 'rotate': setTransformMode('rotate'); break;
    case 'scale': setTransformMode('scale'); break;
    case 'bool-union': booleanOperation('union'); break;
    case 'bool-subtract': booleanOperation('subtract'); break;
    case 'bool-intersect': booleanOperation('intersect'); break;
    case 'set-material':
      // Scroll properties panel to material section
      document.querySelector('.cad-right-panel')?.scrollTo({ top: 9999, behavior: 'smooth' });
      break;
    case 'properties':
      if (selectedObject) normalToFace();
      break;
  }
}

/* ===================== Initialization helper — bind context menu items ===================== */
function initContextMenu() {
  const menu = document.getElementById('cad-context-menu');
  if (!menu) return;
  menu.querySelectorAll('[data-action]').forEach((item) => {
    item.addEventListener('click', () => handleContextAction(item.dataset.action));
  });
}

/* ===================== New Toolbar Buttons ===================== */
function bindNewToolbarButtons(container) {
  const measureBtn = document.getElementById('cad-measure-tool');
  if (measureBtn) measureBtn.addEventListener('click', () => toggleMeasurementTool());

  const sectionBtn = document.getElementById('cad-section-tool');
  if (sectionBtn) sectionBtn.addEventListener('click', () => toggleSectionView());

  const gridBtn = document.getElementById('cad-grid-toggle');
  if (gridBtn) gridBtn.addEventListener('click', () => toggleGrid());

  const fitBtn = document.getElementById('cad-fit-all');
  if (fitBtn) fitBtn.addEventListener('click', () => fitAll());
}

function bindClippingControls() {
  const axisEl = document.getElementById('cad-clip-axis');
  const posEl = document.getElementById('cad-clip-pos');
  const flipEl = document.getElementById('cad-clip-flip');
  const closeEl = document.getElementById('cad-clip-close');

  if (axisEl) axisEl.addEventListener('change', () => updateClippingPlane());
  if (posEl) posEl.addEventListener('input', () => updateClippingPlane());
  if (flipEl) flipEl.addEventListener('change', () => updateClippingPlane());
  if (closeEl) closeEl.addEventListener('click', () => toggleSectionView());
}

// Call after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initContextMenu());
} else {
  setTimeout(() => initContextMenu(), 0);
}
