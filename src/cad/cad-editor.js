// OfficeLink SL — 3D CAD Editor (Three.js + OpenCascade.js B-Rep)
// Onshape-level 3D modeling editor with primitives, transforms, boolean ops, export
// Dual-mode: OCCT B-Rep (precise) + Three.js mesh (fallback)

// Three.js loaded from CDN via dynamic import with retry logic
// Uses string concat to prevent Vite from analyzing these imports
import { escapeHtml as _esc } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import * as OCCT from './occt-engine.js';
import { t } from '../ui/i18n.js';
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
  try {
    THREE = await _i('/build/three.module.js');
    ({ OrbitControls } = await _i('/examples/jsm/controls/OrbitControls.js'));
    ({ TransformControls } = await _i('/examples/jsm/controls/TransformControls.js'));
    ({ STLExporter } = await _i('/examples/jsm/exporters/STLExporter.js'));
    ({ OBJExporter } = await _i('/examples/jsm/exporters/OBJExporter.js'));
    ({ GLTFExporter } = await _i('/examples/jsm/exporters/GLTFExporter.js'));
    ({ STLLoader } = await _i('/examples/jsm/loaders/STLLoader.js'));
    ({ OBJLoader } = await _i('/examples/jsm/loaders/OBJLoader.js'));
    ({ GLTFLoader } = await _i('/examples/jsm/loaders/GLTFLoader.js'));
  } catch (err) {
    // Show user-facing error when CDN is permanently down (retries exhausted)
    const container = document.getElementById('view-cad');
    if (container) {
      const viewport = container.querySelector('.cad-viewport');
      const target = viewport || container;
      const errorDiv = document.createElement('div');
      errorDiv.className = 'cad-cdn-error';
      errorDiv.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg-primary,#1a1a2e);z-index:100;';
      errorDiv.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary,#aaa);">
        <div style="font-size:2rem;margin-bottom:1rem;">&#9888;</div>
        <div style="font-size:1.1rem;font-weight:600;margin-bottom:0.5rem;color:var(--text-primary,#fff);">3D Engine Unavailable</div>
        <div>Failed to load Three.js from CDN after multiple retries.</div>
        <div style="margin-top:0.5rem;font-size:0.85rem;opacity:0.7;">${_esc(err.message)}</div>
        <div style="margin-top:1rem;font-size:0.85rem;">Check your internet connection and reload the page.</div>
      </div>`;
      target.style.position = 'relative';
      target.appendChild(errorDiv);
    }
    throw err;
  }
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
let animFrameId = null;
let themeObserver = null;
let resizeObserver = null;
let keydownHandler = null;

/* ===================== Measurement Unit System ===================== */
let measureUnit = 'mm'; // mm | cm | in
const UNIT_FACTORS = { mm: 1, cm: 0.1, in: 0.03937 };
const UNIT_LABELS = { mm: 'mm', cm: 'cm', in: 'in' };

/* ===================== Advanced Snap State ===================== */
let snapMidpointEnabled = true;
let snapCenterEnabled = true;
let snapIntersectionEnabled = true;
let lastSnapInfo = null; // { type, point, screenX, screenY }

/* ===================== Background State ===================== */
let bgMode = 'solid'; // solid | gradient | envmap
let bgColor1 = 0x1a1a2e;
let bgColor2 = 0x0a0a1a;

/* ===================== OCCT B-Rep State ===================== */
let occtEnabled = false; // true when OCCT WASM loaded
let occtShapes = new Map(); // mesh.uuid → TopoDS_Shape (B-Rep data alongside Three.js mesh)

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
  bindSketchEvents();
  bindOCCTButtons(container);
  initViewCube();
  initBoxSelect();
  bindClippingControls();
  bindMeasureUnitEvents();
  bindBackgroundEvents();
  animate();
  handleResize();

  isInitialized = true;
  updateStatusBar('Ready');
  updateSceneTree();
  updateFeatureTree();

  // Observe theme changes and update 3D scene colors synchronously
  updateCadThemeColors();
  themeObserver = new MutationObserver(() => {
    updateCadThemeColors();
    // Render immediately to prevent color flash on theme change
    if (renderer && scene && camera) renderer.render(scene, camera);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Start loading OCCT B-Rep engine (non-blocking)
  initOCCTEngine();
}

/* ===================== Cleanup / Destroy ===================== */
/**
 * Destroy the CAD editor — removes all event listeners, disposes Three.js
 * resources, clears animation frame, and resets state. Call on tab close/switch.
 */
export function destroyCadEditor() {
  if (!isInitialized) return;

  // 1. Cancel animation frame
  if (animFrameId != null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // 2. Disconnect observers
  if (themeObserver) { themeObserver.disconnect(); themeObserver = null; }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }

  // 3. Remove document-level keyboard listener
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }

  // 4. Dispose transform controls
  if (transformControls) {
    transformControls.detach();
    transformControls.dispose();
    if (scene) scene.remove(transformControls);
    transformControls = null;
  }

  // 5. Dispose orbit controls
  if (orbitControls) { orbitControls.dispose(); orbitControls = null; }

  // 6. Dispose all scene objects (geometry + materials + textures)
  sceneObjects.forEach((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  sceneObjects = [];

  // 7. Dispose grid, axes, and remaining scene children (including textures)
  if (scene) {
    // Dispose background texture if present
    if (scene.background && scene.background.isTexture) {
      scene.background.dispose();
    }
    scene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => {
          // Dispose textures referenced by the material
          if (m.map) m.map.dispose();
          if (m.normalMap) m.normalMap.dispose();
          if (m.roughnessMap) m.roughnessMap.dispose();
          if (m.metalnessMap) m.metalnessMap.dispose();
          if (m.envMap) m.envMap.dispose();
          m.dispose();
        });
      }
    });
    scene.clear();
    scene = null;
  }

  // 8. Dispose renderer and remove canvas
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }

  // 9. Dispose OCCT shape references (free WASM memory)
  occtShapes.forEach((shape) => {
    try { if (shape && typeof shape.delete === 'function') shape.delete(); } catch { /* already freed */ }
  });
  occtShapes.clear();
  occtEnabled = false;

  // 10. Dispose view cube resources
  if (viewCubeRenderer) {
    viewCubeRenderer.dispose();
    if (viewCubeRenderer.domElement && viewCubeRenderer.domElement.parentNode) {
      viewCubeRenderer.domElement.parentNode.removeChild(viewCubeRenderer.domElement);
    }
    viewCubeRenderer = null;
  }
  if (viewCubeScene) {
    viewCubeScene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    viewCubeScene = null;
  }
  viewCubeCamera = null;

  // 11. Clean up measure lines, clipping helper, sketch grid
  clearMeasureLines();
  if (clippingHelper) {
    if (clippingHelper.geometry) clippingHelper.geometry.dispose();
    if (clippingHelper.material) clippingHelper.material.dispose();
    clippingHelper = null;
  }
  clippingPlane = null;
  sectionActive = false;
  hideSketchGrid();

  // 12. Dispose geometries stored in undo/redo states
  undoStack.forEach((state) => {
    if (state.objects) state.objects.forEach((o) => { if (o.geometry) o.geometry.dispose(); });
  });
  redoStack.forEach((state) => {
    if (state.objects) state.objects.forEach((o) => { if (o.geometry) o.geometry.dispose(); });
  });

  // 13. Clean up box select div
  if (boxSelectDiv) {
    if (boxSelectDiv.parentNode) boxSelectDiv.parentNode.removeChild(boxSelectDiv);
    boxSelectDiv = null;
  }

  // 14. Reset remaining state
  selectedObject = null;
  multiSelection = [];
  gridHelper = null;
  axesHelper = null;
  camera = null;
  lights = {};
  undoStack = [];
  redoStack = [];
  objectCounter = 0;
  featureTree = [];
  featureCounter = 0;
  allSketches = [];
  sketchCounter = 0;
  clipboardData = null;
  measurementMode = false;
  measurePoints = [];
  viewportEl = null;
  canvasEl = null;
  isInitialized = false;
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

  // Only apply default theme background when in solid mode without custom override
  if (bgMode === 'solid') {
    if (isLight) {
      bgColor1 = 0xe5e5ea;
      scene.background = new THREE.Color(0xe5e5ea);
    } else {
      bgColor1 = 0x1a1a2e;
      scene.background = new THREE.Color(0x1a1a2e);
    }
    // Update color input to reflect theme change
    const c1Input = document.getElementById('cad-bg-color1');
    if (c1Input) c1Input.value = '#' + new THREE.Color(bgColor1).getHexString();
  } else {
    applyBackground();
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
  animFrameId = requestAnimationFrame(animate);
  orbitControls.update();
  renderer.render(scene, camera);
  renderViewCube();
  updateCoordinateDisplay();
}

/* ===================== Resize Handling ===================== */
function handleResize() {
  resizeObserver = new ResizeObserver(() => {
    if (!viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
  });
  resizeObserver.observe(viewportEl);
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
  updateFeatureTree();
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

  // Dispose OCCT B-Rep shape (free WASM memory)
  const occtShape = occtShapes.get(selectedObject.uuid);
  if (occtShape) {
    try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
    occtShapes.delete(selectedObject.uuid);
  }

  // Dispose geometry and material (including textures)
  if (selectedObject.geometry) selectedObject.geometry.dispose();
  if (selectedObject.material) {
    const mats = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];
    mats.forEach((m) => {
      if (m.map) m.map.dispose();
      if (m.normalMap) m.normalMap.dispose();
      if (m.roughnessMap) m.roughnessMap.dispose();
      if (m.metalnessMap) m.metalnessMap.dispose();
      if (m.envMap) m.envMap.dispose();
      m.dispose();
    });
  }

  multiSelection = multiSelection.filter((o) => o !== selectedObject);
  selectedObject = null;
  clearPropertiesPanel();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Deleted ${name}`);
}

/* ===================== Duplicate Object ===================== */
function duplicateSelected() {
  if (!selectedObject) return;
  const clone = selectedObject.clone();
  // Handle both single and array materials
  if (Array.isArray(selectedObject.material)) {
    clone.material = selectedObject.material.map((m) => m.clone());
  } else {
    clone.material = selectedObject.material.clone();
  }
  objectCounter++;
  clone.name = `${selectedObject.userData.type || 'Object'}_${objectCounter}`;
  clone.position.x += 2;
  clone.userData = { ...selectedObject.userData };

  // If source has B-Rep data, deep-copy the OCCT shape for the clone
  const srcShape = occtShapes.get(selectedObject.uuid);
  if (srcShape && OCCT.isOCCTReady()) {
    try {
      const oc = OCCT.getOC();
      // Deep-copy the OCCT shape for the clone
      const copier = new oc.BRepBuilderAPI_Copy_2(srcShape, true, false);
      const clonedShape = copier.Shape();
      copier.delete();
      occtShapes.set(clone.uuid, clonedShape);
    } catch {
      // If copy fails, mark clone as non-BRep
      clone.userData.isBRep = false;
    }
  }

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
    objects: sceneObjects.map((o) => {
      // Handle both single and array materials
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      return {
        uuid: o.uuid,
        name: o.name,
        type: o.userData.type,
        position: o.position.clone(),
        rotation: o.rotation.clone(),
        scale: o.scale.clone(),
        color: mat ? mat.color.getHex() : 0xcccccc,
        metalness: mat ? mat.metalness : 0,
        roughness: mat ? mat.roughness : 0.5,
        visible: o.visible,
        geometry: o.geometry.clone(),
      };
    }),
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
  transformControls.detach();
  sceneObjects.forEach((o) => {
    scene.remove(o);
    // Clean up OCCT shape references (undo loses B-Rep precision)
    const occtShape = occtShapes.get(o.uuid);
    if (occtShape) {
      try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
      occtShapes.delete(o.uuid);
    }
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.normalMap) m.normalMap.dispose();
        if (m.roughnessMap) m.roughnessMap.dispose();
        if (m.metalnessMap) m.metalnessMap.dispose();
        if (m.envMap) m.envMap.dispose();
        m.dispose();
      });
    }
  });
  sceneObjects = [];
  selectedObject = null;
  multiSelection = [];

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
    objects: sceneObjects.map((o) => {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      return {
        uuid: o.uuid,
        name: o.name,
        type: o.userData.type,
        position: o.position.clone(),
        rotation: o.rotation.clone(),
        scale: o.scale.clone(),
        color: mat ? mat.color.getHex() : 0xcccccc,
        metalness: mat ? mat.metalness : 0,
        roughness: mat ? mat.roughness : 0.5,
        visible: o.visible,
        geometry: o.geometry.clone(),
      };
    }),
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
    objects: sceneObjects.map((o) => {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      return {
        uuid: o.uuid,
        name: o.name,
        type: o.userData.type,
        position: o.position.clone(),
        rotation: o.rotation.clone(),
        scale: o.scale.clone(),
        color: mat ? mat.color.getHex() : 0xcccccc,
        metalness: mat ? mat.metalness : 0,
        roughness: mat ? mat.roughness : 0.5,
        visible: o.visible,
        geometry: o.geometry.clone(),
      };
    }),
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

  // Use multi-selection or find closest non-selected object
  let second = null;
  if (multiSelection.length >= 2) {
    second = multiSelection.find((o) => o !== selectedObject) || null;
  }
  if (!second) {
    const otherObjects = sceneObjects.filter((o) => o !== selectedObject);
    if (otherObjects.length === 0) return;
    if (otherObjects.length === 1) {
      second = otherObjects[0];
    } else {
      let minDist = Infinity;
      for (const o of otherObjects) {
        const d = selectedObject.position.distanceTo(o.position);
        if (d < minDist) { minDist = d; second = o; }
      }
    }
  }
  if (!second) return;

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

      // Dispose intermediate cloned geometries
      geoA.dispose();
      geoB.dispose();
      // Remove originals and dispose their resources
      scene.remove(objA);
      scene.remove(objB);
      sceneObjects = sceneObjects.filter((o) => o !== objA && o !== objB);
      // Dispose cloned geometries (geoA/geoB are separate clones, but originals still need cleanup)
      if (objA.geometry) objA.geometry.dispose();
      if (objA.material) objA.material.dispose();
      if (objB.geometry) objB.geometry.dispose();
      if (objB.material) objB.material.dispose();

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

    // Hide the subtraction object and dispose its resources
    scene.remove(objB);
    sceneObjects = sceneObjects.filter((o) => o !== objB);
    if (objB.geometry) objB.geometry.dispose();
    if (objB.material) objB.material.dispose();
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
    if (objB.geometry) objB.geometry.dispose();
    if (objB.material) objB.material.dispose();
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

/* ===================== SKETCH MODE ===================== */
let sketchMode = false;
let sketchPlane = null; // { normal: Vector3, origin: Vector3, name: 'XY'|'XZ'|'YZ' }
let sketchEntities = []; // { type, points, radius?, sides?, id }
let sketchCounter = 0;
let sketchTool = 'line'; // line | circle | rect | arc | polygon | dimension
let sketchGridSnap = true;
let sketchPointSnap = true;
let sketchGridSize = 0.5;
let sketchDrawing = false;
let sketchTempPoints = [];
let sketchDimensions = []; // { entityId, value, position }
let sketchConstraints = []; // { type: 'horizontal'|'vertical'|'coincident'|'dimension', entityIds, value }
let allSketches = []; // saved sketch profiles: { id, name, plane, entities, dimensions, constraints }
let featureTree = []; // { type: 'sketch'|'extrude'|'revolve'|'boolean'|'primitive', name, id, meshUuid, sketchId?, suppressed }
let featureCounter = 0;
let polygonSides = 6;
let extrudePreviewMesh = null;
let revolvePreviewMesh = null;

/** Enter sketch mode */
function enterSketchMode(planeName) {
  if (sketchMode) return;
  sketchMode = true;
  sketchEntities = [];
  sketchDimensions = [];
  sketchConstraints = [];
  sketchTempPoints = [];
  sketchDrawing = false;
  sketchTool = 'line';
  sketchCounter++;

  // Define sketch plane
  const planes = {
    XY: { normal: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0) },
    XZ: { normal: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) },
    YZ: { normal: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(0, 0, 1) },
  };
  const p = planes[planeName] || planes.XY;
  sketchPlane = { normal: p.normal.clone(), up: p.up.clone(), right: p.right.clone(), origin: new THREE.Vector3(0, 0, 0), name: planeName };

  // Orient camera perpendicular to sketch plane
  const dist = 15;
  const endPos = sketchPlane.normal.clone().multiplyScalar(dist);
  animateCamera(camera.position.clone(), endPos, sketchPlane.origin, 400);
  orbitControls.target.copy(sketchPlane.origin);

  // Show sketch toolbar, hide 3D toolbar groups
  const sketchTb = document.getElementById('cad-sketch-toolbar');
  if (sketchTb) sketchTb.style.display = 'flex';
  // Dim other toolbar groups
  document.querySelectorAll('.cad-toolbar > .cad-toolbar-group:not(.cad-sketch-toolbar):not(#cad-sketch-group)').forEach((g) => {
    g.style.opacity = '0.3';
    g.style.pointerEvents = 'none';
  });

  // Show sketch grid on the plane
  showSketchGrid();

  // Setup sketch overlay canvas
  setupSketchOverlay();

  updateStatusBar(`Sketch Mode — ${planeName} plane | L=Line C=Circle R=Rect A=Arc P=Polygon D=Dim | Esc=Finish`);
  updateFeatureTree();
}

/** Exit sketch mode */
function exitSketchMode() {
  if (!sketchMode) return;
  sketchMode = false;

  // Save sketch as profile
  if (sketchEntities.length > 0) {
    const sketchId = `sketch_${sketchCounter}`;
    allSketches.push({
      id: sketchId,
      name: `Sketch ${sketchCounter}`,
      plane: { ...sketchPlane, normal: sketchPlane.normal.clone(), up: sketchPlane.up.clone(), right: sketchPlane.right.clone(), origin: sketchPlane.origin.clone() },
      entities: JSON.parse(JSON.stringify(sketchEntities)),
      dimensions: JSON.parse(JSON.stringify(sketchDimensions)),
      constraints: JSON.parse(JSON.stringify(sketchConstraints)),
    });
    // Add to feature tree
    featureCounter++;
    featureTree.push({ type: 'sketch', name: `Sketch ${sketchCounter}`, id: `feat_${featureCounter}`, sketchId, suppressed: false });
    updateStatusBar(`Sketch ${sketchCounter} saved (${sketchEntities.length} entities)`);
  }

  // Hide sketch toolbar, restore 3D toolbar
  const sketchTb = document.getElementById('cad-sketch-toolbar');
  if (sketchTb) sketchTb.style.display = 'none';
  document.querySelectorAll('.cad-toolbar > .cad-toolbar-group:not(.cad-sketch-toolbar):not(#cad-sketch-group)').forEach((g) => {
    g.style.opacity = '1';
    g.style.pointerEvents = 'auto';
  });

  // Remove sketch grid
  hideSketchGrid();

  // Clear overlay
  const overlay = document.getElementById('cad-sketch-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  sketchDrawing = false;
  sketchTempPoints = [];
  updateFeatureTree();
  updateSceneTree();
}

/** Show sketch plane grid */
let sketchGridMesh = null;
function showSketchGrid() {
  if (sketchGridMesh) { scene.remove(sketchGridMesh); sketchGridMesh.geometry.dispose(); sketchGridMesh.material.dispose(); }
  const size = 20;
  const gridGeo = new THREE.PlaneGeometry(size, size);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x3366cc, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  sketchGridMesh = new THREE.Mesh(gridGeo, gridMat);
  sketchGridMesh.userData.isHelper = true;

  // Orient to sketch plane
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sketchPlane.normal);
  sketchGridMesh.quaternion.copy(q);
  sketchGridMesh.position.copy(sketchPlane.origin);
  scene.add(sketchGridMesh);
}

function hideSketchGrid() {
  if (sketchGridMesh) {
    scene.remove(sketchGridMesh);
    sketchGridMesh.geometry.dispose();
    sketchGridMesh.material.dispose();
    sketchGridMesh = null;
  }
}

/** Setup the 2D sketch overlay canvas */
function setupSketchOverlay() {
  const overlay = document.getElementById('cad-sketch-overlay');
  if (!overlay) return;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.display = 'block';

  // Remove old listeners by replacing the element
  const newOverlay = overlay.cloneNode(false);
  overlay.parentNode.replaceChild(newOverlay, overlay);
  newOverlay.id = 'cad-sketch-overlay';
  newOverlay.className = 'cad-sketch-overlay';
  newOverlay.width = rect.width;
  newOverlay.height = rect.height;
  newOverlay.style.width = rect.width + 'px';
  newOverlay.style.height = rect.height + 'px';
  newOverlay.style.display = 'block';

  newOverlay.addEventListener('mousedown', (e) => handleSketchMouseDown(e));
  newOverlay.addEventListener('mousemove', (e) => handleSketchMouseMove(e));
  newOverlay.addEventListener('mouseup', (e) => handleSketchMouseUp(e));
  newOverlay.addEventListener('dblclick', (e) => handleSketchDblClick(e));
}

/** Convert screen coords to sketch plane 2D coords */
function screenToSketchCoords(clientX, clientY) {
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  const plane3 = new THREE.Plane();
  plane3.setFromNormalAndCoplanarPoint(sketchPlane.normal, sketchPlane.origin);
  const intersection = new THREE.Vector3();
  const hit = rc.ray.intersectPlane(plane3, intersection);
  if (!hit) return { x: 0, y: 0 };

  // Project onto sketch 2D coords using right and up vectors
  const local = intersection.clone().sub(sketchPlane.origin);
  let x = local.dot(sketchPlane.right);
  let y = local.dot(sketchPlane.up);

  // Snap to grid
  if (sketchGridSnap) {
    x = Math.round(x / sketchGridSize) * sketchGridSize;
    y = Math.round(y / sketchGridSize) * sketchGridSize;
  }

  // Snap to existing endpoints
  if (sketchPointSnap) {
    const snapDist = 0.3;
    for (const ent of sketchEntities) {
      if (!ent.points) continue;
      for (const pt of ent.points) {
        if (Math.abs(pt.x - x) < snapDist && Math.abs(pt.y - y) < snapDist) {
          x = pt.x;
          y = pt.y;
          break;
        }
      }
    }
  }

  return { x, y };
}

/** Convert sketch 2D coords back to screen pixel coords */
function sketchToScreen(sx, sy) {
  const p3d = sketchPlane.origin.clone()
    .add(sketchPlane.right.clone().multiplyScalar(sx))
    .add(sketchPlane.up.clone().multiplyScalar(sy));
  const projected = p3d.project(camera);
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

let sketchEntityIdCounter = 0;

function handleSketchMouseDown(e) {
  if (!sketchMode) return;
  if (e.button !== 0) return;
  const pos = screenToSketchCoords(e.clientX, e.clientY);

  if (sketchTool === 'dimension') {
    // Click on existing entity to add dimension
    handleDimensionClick(pos);
    return;
  }

  if (sketchTool === 'line') {
    if (!sketchDrawing || sketchTempPoints.length === 0) {
      // Start a new line chain — set first point
      sketchTempPoints = [pos];
      sketchDrawing = true;
    }
    // If already in chain mode, mouseDown is ignored (mouseUp will add the endpoint)
  } else if (sketchTool === 'circle') {
    sketchTempPoints = [pos];
    sketchDrawing = true;
  } else if (sketchTool === 'rect') {
    sketchTempPoints = [pos];
    sketchDrawing = true;
  } else if (sketchTool === 'arc') {
    if (!sketchDrawing) {
      sketchTempPoints = [pos];
      sketchDrawing = true;
    }
    // Subsequent points are collected on mouseUp
  } else if (sketchTool === 'polygon') {
    sketchTempPoints = [pos];
    sketchDrawing = true;
  }
}

function handleSketchMouseMove(e) {
  if (!sketchMode) return;
  const pos = screenToSketchCoords(e.clientX, e.clientY);
  renderSketchOverlay(pos);
}

function handleSketchMouseUp(e) {
  if (!sketchMode || !sketchDrawing) return;
  if (e.button !== 0) return;
  const pos = screenToSketchCoords(e.clientX, e.clientY);

  if (sketchTool === 'line') {
    // Push the mouseUp position as the line endpoint
    sketchTempPoints.push(pos);
    if (sketchTempPoints.length >= 2) {
      // Commit line segment from the previous point to this point
      const p1 = sketchTempPoints[sketchTempPoints.length - 2];
      const p2 = sketchTempPoints[sketchTempPoints.length - 1];
      if (Math.abs(p1.x - p2.x) > 0.01 || Math.abs(p1.y - p2.y) > 0.01) {
        sketchEntityIdCounter++;
        sketchEntities.push({ type: 'line', points: [p1, p2], id: sketchEntityIdCounter });
        applyAutoConstraints(sketchEntities[sketchEntities.length - 1]);
      }
      // Keep last point as start of next line for chain drawing
      // Remove all points except the last one (chain start)
      sketchTempPoints = [sketchTempPoints[sketchTempPoints.length - 1]];
    }
  } else if (sketchTool === 'arc') {
    // Arc needs 3 points: start, midpoint, end
    sketchTempPoints.push(pos);
    if (sketchTempPoints.length >= 3) {
      sketchEntityIdCounter++;
      sketchEntities.push({
        type: 'arc',
        points: [sketchTempPoints[0], sketchTempPoints[1], sketchTempPoints[2]],
        id: sketchEntityIdCounter,
      });
      sketchTempPoints = [];
      sketchDrawing = false;
    }
  } else if (sketchTool === 'circle') {
    const center = sketchTempPoints[0];
    const radius = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
    if (radius > 0.05) {
      sketchEntityIdCounter++;
      sketchEntities.push({ type: 'circle', points: [center], radius, id: sketchEntityIdCounter });
    }
    sketchTempPoints = [];
    sketchDrawing = false;
  } else if (sketchTool === 'rect') {
    const corner1 = sketchTempPoints[0];
    if (Math.abs(pos.x - corner1.x) > 0.05 && Math.abs(pos.y - corner1.y) > 0.05) {
      sketchEntityIdCounter++;
      // Rectangle = 4 lines
      const c2 = { x: pos.x, y: corner1.y };
      const c3 = pos;
      const c4 = { x: corner1.x, y: pos.y };
      sketchEntities.push({ type: 'line', points: [corner1, c2], id: ++sketchEntityIdCounter });
      sketchEntities.push({ type: 'line', points: [c2, c3], id: ++sketchEntityIdCounter });
      sketchEntities.push({ type: 'line', points: [c3, c4], id: ++sketchEntityIdCounter });
      sketchEntities.push({ type: 'line', points: [c4, corner1], id: ++sketchEntityIdCounter });
    }
    sketchTempPoints = [];
    sketchDrawing = false;
  } else if (sketchTool === 'polygon') {
    const center = sketchTempPoints[0];
    const radius = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
    if (radius > 0.05) {
      const sides = polygonSides;
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
      }
      for (let i = 0; i < sides; i++) {
        sketchEntityIdCounter++;
        sketchEntities.push({ type: 'line', points: [pts[i], pts[(i + 1) % sides]], id: sketchEntityIdCounter });
      }
    }
    sketchTempPoints = [];
    sketchDrawing = false;
  }

  renderSketchOverlay(pos);
}

function handleSketchDblClick(_e) {
  // Double-click finishes line chain
  if (sketchTool === 'line' && sketchDrawing) {
    sketchTempPoints = [];
    sketchDrawing = false;
  }
}

function handleArcClick(pos) {
  if (sketchTempPoints.length === 3) {
    sketchEntityIdCounter++;
    sketchEntities.push({ type: 'arc', points: [sketchTempPoints[0], sketchTempPoints[1], sketchTempPoints[2]], id: sketchEntityIdCounter });
    sketchTempPoints = [];
    sketchDrawing = false;
  }
}

function handleDimensionClick(pos) {
  // Find nearest entity
  let nearest = null;
  let minDist = Infinity;
  for (const ent of sketchEntities) {
    if (ent.type === 'line') {
      const mid = { x: (ent.points[0].x + ent.points[1].x) / 2, y: (ent.points[0].y + ent.points[1].y) / 2 };
      const d = Math.sqrt((pos.x - mid.x) ** 2 + (pos.y - mid.y) ** 2);
      if (d < minDist) { minDist = d; nearest = ent; }
    } else if (ent.type === 'circle') {
      const d = Math.sqrt((pos.x - ent.points[0].x) ** 2 + (pos.y - ent.points[0].y) ** 2);
      if (d < minDist) { minDist = d; nearest = ent; }
    }
  }
  if (nearest && minDist < 3) {
    let value;
    if (nearest.type === 'line') {
      const dx = nearest.points[1].x - nearest.points[0].x;
      const dy = nearest.points[1].y - nearest.points[0].y;
      value = Math.sqrt(dx * dx + dy * dy);
    } else if (nearest.type === 'circle') {
      value = nearest.radius;
    }
    const newValue = prompt(`Enter dimension value (current: ${value.toFixed(3)}):`);
    if (newValue !== null && !isNaN(parseFloat(newValue))) {
      const nv = parseFloat(newValue);
      if (nearest.type === 'line') {
        // Scale line to match dimension
        const dx = nearest.points[1].x - nearest.points[0].x;
        const dy = nearest.points[1].y - nearest.points[0].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const scale = nv / len;
          nearest.points[1].x = nearest.points[0].x + dx * scale;
          nearest.points[1].y = nearest.points[0].y + dy * scale;
        }
      } else if (nearest.type === 'circle') {
        nearest.radius = nv;
      }
      sketchEntityIdCounter++;
      sketchDimensions.push({ entityId: nearest.id, value: nv, id: sketchEntityIdCounter });
      sketchConstraints.push({ type: 'dimension', entityIds: [nearest.id], value: nv });
    }
    renderSketchOverlay(pos);
  }
}

/** Apply auto horizontal/vertical constraints */
function applyAutoConstraints(entity) {
  if (entity.type !== 'line') return;
  const dx = Math.abs(entity.points[1].x - entity.points[0].x);
  const dy = Math.abs(entity.points[1].y - entity.points[0].y);
  const tolerance = 0.15;
  if (dy < tolerance && dx > tolerance) {
    entity.points[1].y = entity.points[0].y;
    sketchConstraints.push({ type: 'horizontal', entityIds: [entity.id] });
  } else if (dx < tolerance && dy > tolerance) {
    entity.points[1].x = entity.points[0].x;
    sketchConstraints.push({ type: 'vertical', entityIds: [entity.id] });
  }
  // Coincident snap
  for (const other of sketchEntities) {
    if (other.id === entity.id || !other.points) continue;
    for (const pt of other.points) {
      for (const mypt of entity.points) {
        if (Math.abs(pt.x - mypt.x) < 0.2 && Math.abs(pt.y - mypt.y) < 0.2) {
          mypt.x = pt.x;
          mypt.y = pt.y;
          sketchConstraints.push({ type: 'coincident', entityIds: [entity.id, other.id] });
        }
      }
    }
  }
}

/** Render all sketch entities on the overlay canvas */
function renderSketchOverlay(cursorPos) {
  const overlay = document.getElementById('cad-sketch-overlay');
  if (!overlay) return;
  const ctx = overlay.getContext('2d');
  const w = overlay.width;
  const h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  // Draw grid lines on overlay
  ctx.strokeStyle = 'rgba(51, 102, 204, 0.15)';
  ctx.lineWidth = 0.5;
  const gridRange = 20;
  for (let i = -gridRange; i <= gridRange; i++) {
    const pStart = sketchToScreen(i * sketchGridSize, -gridRange * sketchGridSize);
    const pEnd = sketchToScreen(i * sketchGridSize, gridRange * sketchGridSize);
    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.stroke();
    const pStart2 = sketchToScreen(-gridRange * sketchGridSize, i * sketchGridSize);
    const pEnd2 = sketchToScreen(gridRange * sketchGridSize, i * sketchGridSize);
    ctx.beginPath();
    ctx.moveTo(pStart2.x, pStart2.y);
    ctx.lineTo(pEnd2.x, pEnd2.y);
    ctx.stroke();
  }

  // Draw entities
  for (const ent of sketchEntities) {
    drawSketchEntity(ctx, ent, false);
  }

  // Draw dimensions
  ctx.font = 'bold 12px monospace';
  for (const dim of sketchDimensions) {
    const ent = sketchEntities.find((e) => e.id === dim.entityId);
    if (!ent) continue;
    ctx.fillStyle = '#ff00ff';
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    if (ent.type === 'line') {
      const mid = { x: (ent.points[0].x + ent.points[1].x) / 2, y: (ent.points[0].y + ent.points[1].y) / 2 };
      const scr = sketchToScreen(mid.x, mid.y);
      ctx.fillText(dim.value.toFixed(2), scr.x + 5, scr.y - 8);
      // Dimension arrows
      const s1 = sketchToScreen(ent.points[0].x, ent.points[0].y);
      const s2 = sketchToScreen(ent.points[1].x, ent.points[1].y);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y - 12);
      ctx.lineTo(s2.x, s2.y - 12);
      ctx.stroke();
    } else if (ent.type === 'circle') {
      const scr = sketchToScreen(ent.points[0].x, ent.points[0].y);
      ctx.fillText(`R${dim.value.toFixed(2)}`, scr.x + 5, scr.y - 5);
    }
  }

  // Draw constraint icons
  for (const con of sketchConstraints) {
    if (con.type === 'horizontal' || con.type === 'vertical') {
      const ent = sketchEntities.find((e) => e.id === con.entityIds[0]);
      if (!ent || !ent.points) continue;
      const mid = { x: (ent.points[0].x + ent.points[1].x) / 2, y: (ent.points[0].y + ent.points[1].y) / 2 };
      const scr = sketchToScreen(mid.x, mid.y);
      ctx.fillStyle = '#ff00ff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(con.type === 'horizontal' ? 'H' : 'V', scr.x - 4, scr.y + 16);
    }
  }

  // Draw temp preview
  if (sketchDrawing && cursorPos) {
    ctx.setLineDash([4, 4]);
    if (sketchTool === 'line' && sketchTempPoints.length > 0) {
      const last = sketchTempPoints[sketchTempPoints.length - 1];
      const s1 = sketchToScreen(last.x, last.y);
      const s2 = sketchToScreen(cursorPos.x, cursorPos.y);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    } else if (sketchTool === 'circle' && sketchTempPoints.length === 1) {
      const center = sketchTempPoints[0];
      const radius = Math.sqrt((cursorPos.x - center.x) ** 2 + (cursorPos.y - center.y) ** 2);
      const scr = sketchToScreen(center.x, center.y);
      const edgeScr = sketchToScreen(center.x + radius, center.y);
      const pixelR = Math.sqrt((edgeScr.x - scr.x) ** 2 + (edgeScr.y - scr.y) ** 2);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, pixelR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sketchTool === 'rect' && sketchTempPoints.length === 1) {
      const c1 = sketchTempPoints[0];
      const s1 = sketchToScreen(c1.x, c1.y);
      const s2 = sketchToScreen(cursorPos.x, c1.y);
      const s3 = sketchToScreen(cursorPos.x, cursorPos.y);
      const s4 = sketchToScreen(c1.x, cursorPos.y);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();
      ctx.stroke();
    } else if (sketchTool === 'polygon' && sketchTempPoints.length === 1) {
      const center = sketchTempPoints[0];
      const radius = Math.sqrt((cursorPos.x - center.x) ** 2 + (cursorPos.y - center.y) ** 2);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= polygonSides; i++) {
        const angle = (i / polygonSides) * Math.PI * 2 - Math.PI / 2;
        const px = center.x + Math.cos(angle) * radius;
        const py = center.y + Math.sin(angle) * radius;
        const scr = sketchToScreen(px, py);
        if (i === 0) ctx.moveTo(scr.x, scr.y);
        else ctx.lineTo(scr.x, scr.y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Draw cursor coordinates
  if (cursorPos) {
    ctx.fillStyle = '#ccd6f6';
    ctx.font = '11px monospace';
    const viewport = document.querySelector('.cad-viewport');
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      ctx.fillText(`(${cursorPos.x.toFixed(2)}, ${cursorPos.y.toFixed(2)})`, w - 140, h - 10);
    }
  }
}

function drawSketchEntity(ctx, ent, isPreview) {
  ctx.strokeStyle = isPreview ? '#4488ff88' : '#4488ff';
  ctx.lineWidth = isPreview ? 1 : 2;
  ctx.setLineDash(isPreview ? [4, 4] : []);

  if (ent.type === 'line') {
    const s1 = sketchToScreen(ent.points[0].x, ent.points[0].y);
    const s2 = sketchToScreen(ent.points[1].x, ent.points[1].y);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
    // Draw endpoints
    ctx.fillStyle = '#66aaff';
    for (const p of ent.points) {
      const scr = sketchToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ent.type === 'circle') {
    const center = ent.points[0];
    const scr = sketchToScreen(center.x, center.y);
    const edgeScr = sketchToScreen(center.x + ent.radius, center.y);
    const pixelR = Math.sqrt((edgeScr.x - scr.x) ** 2 + (edgeScr.y - scr.y) ** 2);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, pixelR, 0, Math.PI * 2);
    ctx.stroke();
    // Center point
    ctx.fillStyle = '#66aaff';
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.type === 'arc' && ent.points.length === 3) {
    // 3-point arc
    const s1 = sketchToScreen(ent.points[0].x, ent.points[0].y);
    const s2 = sketchToScreen(ent.points[1].x, ent.points[1].y);
    const s3 = sketchToScreen(ent.points[2].x, ent.points[2].y);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.quadraticCurveTo(s2.x, s2.y, s3.x, s3.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Show sketch plane selection dialog */
function showPlaneDialog() {
  const dialog = document.getElementById('cad-sketch-plane-dialog');
  if (dialog) dialog.style.display = 'flex';
}

function hidePlaneDialog() {
  const dialog = document.getElementById('cad-sketch-plane-dialog');
  if (dialog) dialog.style.display = 'none';
}

/** Build a THREE.Shape from sketch entities (closed profile) */
function buildShapeFromSketch(sketch) {
  const entities = sketch.entities;
  // Collect all line segments
  const lines = entities.filter((e) => e.type === 'line');
  if (lines.length === 0) {
    // Check for circle
    const circle = entities.find((e) => e.type === 'circle');
    if (circle) {
      const shape = new THREE.Shape();
      const c = circle.points[0];
      const r = circle.radius;
      shape.absarc(c.x, c.y, r, 0, Math.PI * 2, false);
      return shape;
    }
    return null;
  }

  // Try to chain line segments into a closed path
  const shape = new THREE.Shape();
  const used = new Set();
  const tolerance = 0.25;

  // Start with first line
  let current = lines[0];
  used.add(current.id);
  shape.moveTo(current.points[0].x, current.points[0].y);
  shape.lineTo(current.points[1].x, current.points[1].y);
  let endPoint = current.points[1];

  for (let iter = 0; iter < lines.length * 2; iter++) {
    let found = false;
    for (const line of lines) {
      if (used.has(line.id)) continue;
      // Check if either endpoint matches current end
      if (Math.abs(line.points[0].x - endPoint.x) < tolerance && Math.abs(line.points[0].y - endPoint.y) < tolerance) {
        shape.lineTo(line.points[1].x, line.points[1].y);
        endPoint = line.points[1];
        used.add(line.id);
        found = true;
        break;
      }
      if (Math.abs(line.points[1].x - endPoint.x) < tolerance && Math.abs(line.points[1].y - endPoint.y) < tolerance) {
        shape.lineTo(line.points[0].x, line.points[0].y);
        endPoint = line.points[0];
        used.add(line.id);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  shape.closePath();
  return shape;
}

/* ===================== EXTRUDE FROM SKETCH ===================== */
function showExtrudeDialog() {
  if (allSketches.length === 0) {
    updateStatusBar('No sketches available. Create a sketch first (Shift+S)');
    return;
  }
  const dialog = document.getElementById('cad-extrude-dialog');
  if (!dialog) return;

  // Populate profile dropdown
  const profileSelect = document.getElementById('cad-extrude-profile');
  if (profileSelect) {
    profileSelect.innerHTML = allSketches.map((s) => `<option value="${s.id}">${_esc(s.name)} (${s.entities.length} entities)</option>`).join('');
  }

  dialog.style.display = 'flex';
  // Show preview
  updateExtrudePreview();
}

function hideExtrudeDialog() {
  const dialog = document.getElementById('cad-extrude-dialog');
  if (dialog) dialog.style.display = 'none';
  removeExtrudePreview();
}

function updateExtrudePreview() {
  removeExtrudePreview();
  const profileSelect = document.getElementById('cad-extrude-profile');
  const distInput = document.getElementById('cad-extrude-dist');
  const symCheck = document.getElementById('cad-extrude-symmetric');
  if (!profileSelect || !distInput) return;

  const sketch = allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) return;

  const shape = buildShapeFromSketch(sketch);
  if (!shape) return;

  const dist = parseFloat(distInput.value) || 5;
  const symmetric = symCheck ? symCheck.checked : false;
  const bevelCheck = document.getElementById('cad-extrude-bevel');
  const bevel = bevelCheck ? bevelCheck.checked : false;

  const settings = {
    depth: symmetric ? dist : dist,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.1 : 0,
    bevelSize: bevel ? 0.1 : 0,
    bevelSegments: bevel ? 2 : 0,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, settings);
  const material = new THREE.MeshStandardMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  extrudePreviewMesh = new THREE.Mesh(geometry, material);
  extrudePreviewMesh.userData.isHelper = true;

  // Orient to sketch plane
  const q = new THREE.Quaternion();
  const planeInfo = sketch.plane;
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planeInfo.normal);
  extrudePreviewMesh.quaternion.copy(q);
  extrudePreviewMesh.position.copy(planeInfo.origin);
  if (symmetric) {
    extrudePreviewMesh.position.add(planeInfo.normal.clone().multiplyScalar(-dist / 2));
  }

  scene.add(extrudePreviewMesh);
}

function removeExtrudePreview() {
  if (extrudePreviewMesh) {
    scene.remove(extrudePreviewMesh);
    extrudePreviewMesh.geometry.dispose();
    extrudePreviewMesh.material.dispose();
    extrudePreviewMesh = null;
  }
}

function executeExtrude() {
  const profileSelect = document.getElementById('cad-extrude-profile');
  const distInput = document.getElementById('cad-extrude-dist');
  const symCheck = document.getElementById('cad-extrude-symmetric');
  const bevelCheck = document.getElementById('cad-extrude-bevel');
  if (!profileSelect || !distInput) return;

  const sketch = allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) { updateStatusBar('No sketch selected'); return; }

  const shape = buildShapeFromSketch(sketch);
  if (!shape) { updateStatusBar('Cannot create shape from sketch'); return; }

  const dist = parseFloat(distInput.value) || 5;
  const symmetric = symCheck ? symCheck.checked : false;
  const bevel = bevelCheck ? bevelCheck.checked : false;

  const settings = {
    depth: dist,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.1 : 0,
    bevelSize: bevel ? 0.1 : 0,
    bevelSegments: bevel ? 2 : 0,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, settings);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  objectCounter++;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Extrude_${objectCounter}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'extrude';
  mesh.userData.isCADObject = true;
  mesh.userData.sketchId = sketch.id;

  // Orient to sketch plane
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sketch.plane.normal);
  mesh.quaternion.copy(q);
  mesh.position.copy(sketch.plane.origin);
  if (symmetric) {
    mesh.position.add(sketch.plane.normal.clone().multiplyScalar(-dist / 2));
  }

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  // Add to feature tree
  featureCounter++;
  featureTree.push({
    type: 'extrude', name: `Extrude ${objectCounter} (${sketch.name})`,
    id: `feat_${featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideExtrudeDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name} from ${sketch.name}`);
}

/* ===================== REVOLVE FROM SKETCH ===================== */
function showRevolveDialog() {
  if (allSketches.length === 0) {
    updateStatusBar('No sketches available. Create a sketch first (Shift+S)');
    return;
  }
  const dialog = document.getElementById('cad-revolve-dialog');
  if (!dialog) return;

  const profileSelect = document.getElementById('cad-revolve-profile');
  if (profileSelect) {
    profileSelect.innerHTML = allSketches.map((s) => `<option value="${s.id}">${_esc(s.name)} (${s.entities.length} entities)</option>`).join('');
  }

  dialog.style.display = 'flex';
  updateRevolvePreview();
}

function hideRevolveDialog() {
  const dialog = document.getElementById('cad-revolve-dialog');
  if (dialog) dialog.style.display = 'none';
  removeRevolvePreview();
}

function updateRevolvePreview() {
  removeRevolvePreview();
  const profileSelect = document.getElementById('cad-revolve-profile');
  const angleInput = document.getElementById('cad-revolve-angle');
  if (!profileSelect || !angleInput) return;

  const sketch = allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) return;

  // Build 2D profile points for lathe
  const pts = buildLathePoints(sketch);
  if (!pts || pts.length < 2) return;

  const angle = THREE.MathUtils.degToRad(parseFloat(angleInput.value) || 360);
  const geometry = new THREE.LatheGeometry(pts, 32, 0, angle);
  const material = new THREE.MeshStandardMaterial({ color: 0x44ff88, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  revolvePreviewMesh = new THREE.Mesh(geometry, material);
  revolvePreviewMesh.userData.isHelper = true;
  revolvePreviewMesh.position.copy(sketch.plane.origin);
  scene.add(revolvePreviewMesh);
}

function removeRevolvePreview() {
  if (revolvePreviewMesh) {
    scene.remove(revolvePreviewMesh);
    revolvePreviewMesh.geometry.dispose();
    revolvePreviewMesh.material.dispose();
    revolvePreviewMesh = null;
  }
}

function buildLathePoints(sketch) {
  // Extract unique points from sketch entities and build a 2D profile
  const entities = sketch.entities;
  const lines = entities.filter((e) => e.type === 'line');
  if (lines.length === 0) {
    const circle = entities.find((e) => e.type === 'circle');
    if (circle) {
      // Approximate circle with points for lathe
      const pts = [];
      const c = circle.points[0];
      const r = circle.radius;
      for (let i = 0; i <= 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.abs(c.x + Math.cos(angle) * r), c.y + Math.sin(angle) * r));
      }
      return pts;
    }
    return null;
  }

  // Chain points from lines
  const pts = [new THREE.Vector2(Math.abs(lines[0].points[0].x), lines[0].points[0].y)];
  const used = new Set();
  used.add(lines[0].id);
  let endPoint = lines[0].points[0];

  // First, add the second point of the first line
  pts.push(new THREE.Vector2(Math.abs(lines[0].points[1].x), lines[0].points[1].y));
  endPoint = lines[0].points[1];

  for (let iter = 0; iter < lines.length * 2; iter++) {
    let found = false;
    for (const line of lines) {
      if (used.has(line.id)) continue;
      if (Math.abs(line.points[0].x - endPoint.x) < 0.25 && Math.abs(line.points[0].y - endPoint.y) < 0.25) {
        pts.push(new THREE.Vector2(Math.abs(line.points[1].x), line.points[1].y));
        endPoint = line.points[1];
        used.add(line.id);
        found = true;
        break;
      }
      if (Math.abs(line.points[1].x - endPoint.x) < 0.25 && Math.abs(line.points[1].y - endPoint.y) < 0.25) {
        pts.push(new THREE.Vector2(Math.abs(line.points[0].x), line.points[0].y));
        endPoint = line.points[0];
        used.add(line.id);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return pts.length >= 2 ? pts : null;
}

function executeRevolve() {
  const profileSelect = document.getElementById('cad-revolve-profile');
  const angleInput = document.getElementById('cad-revolve-angle');
  const axisSelect = document.getElementById('cad-revolve-axis');
  if (!profileSelect || !angleInput) return;

  const sketch = allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) { updateStatusBar('No sketch selected'); return; }

  const pts = buildLathePoints(sketch);
  if (!pts || pts.length < 2) { updateStatusBar('Cannot build profile for revolve'); return; }

  const angle = THREE.MathUtils.degToRad(parseFloat(angleInput.value) || 360);
  const geometry = new THREE.LatheGeometry(pts, 32, 0, angle);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
  objectCounter++;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Revolve_${objectCounter}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'revolve';
  mesh.userData.isCADObject = true;
  mesh.userData.sketchId = sketch.id;
  mesh.position.copy(sketch.plane.origin);

  // Apply axis rotation if not Y
  const axisVal = axisSelect ? axisSelect.value : 'y';
  if (axisVal === 'x') {
    mesh.rotation.z = Math.PI / 2;
  } else if (axisVal === 'z') {
    mesh.rotation.x = Math.PI / 2;
  }

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  featureCounter++;
  featureTree.push({
    type: 'revolve', name: `Revolve ${objectCounter} (${sketch.name})`,
    id: `feat_${featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideRevolveDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name} from ${sketch.name}`);
}

/* ===================== FEATURE TREE ===================== */
function updateFeatureTree() {
  const tree = document.getElementById('cad-feature-tree');
  if (!tree) return;
  tree.innerHTML = '';

  // Add primitives that were added outside of sketch workflow to feature tree if not already there
  for (const obj of sceneObjects) {
    if (!featureTree.find((f) => f.meshUuid === obj.uuid)) {
      featureCounter++;
      featureTree.push({
        type: 'primitive', name: obj.name, id: `feat_${featureCounter}`,
        meshUuid: obj.uuid, suppressed: false,
      });
    }
  }

  // Remove features whose mesh no longer exists (except sketches)
  featureTree = featureTree.filter((f) => {
    if (f.type === 'sketch') return true;
    if (!f.meshUuid) return true;
    return sceneObjects.some((o) => o.uuid === f.meshUuid);
  });

  const featureIcons = { sketch: '✏', extrude: '⬆', revolve: '🔄', boolean: '⊕', primitive: '🔲' };

  featureTree.forEach((feat, idx) => {
    const item = document.createElement('div');
    item.className = 'cad-tree-item cad-feature-item' + (feat.suppressed ? ' suppressed' : '');
    item.dataset.featureId = feat.id;
    item.innerHTML = `
      <span class="tree-icon">${featureIcons[feat.type] || '🔲'}</span>
      <span class="tree-name" title="${_esc(feat.name)}">${_esc(feat.name)}</span>
      <span class="tree-feat-actions">
        ${feat.type !== 'sketch' ? `<button class="cad-feat-btn" data-action="suppress" title="${feat.suppressed ? 'Unsuppress' : 'Suppress'}">${feat.suppressed ? '👁' : '🚫'}</button>` : ''}
        <button class="cad-feat-btn" data-action="delete" title="Delete">✕</button>
      </span>
    `;

    // Click to select corresponding mesh
    item.addEventListener('click', (e) => {
      if (e.target.closest('.cad-feat-btn')) return;
      if (feat.meshUuid) {
        const mesh = sceneObjects.find((o) => o.uuid === feat.meshUuid);
        if (mesh) selectObject(mesh);
      }
    });

    // Action buttons
    item.querySelectorAll('.cad-feat-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'suppress') {
          feat.suppressed = !feat.suppressed;
          const mesh = sceneObjects.find((o) => o.uuid === feat.meshUuid);
          if (mesh) mesh.visible = !feat.suppressed;
          updateFeatureTree();
        } else if (action === 'delete') {
          if (feat.meshUuid) {
            const mesh = sceneObjects.find((o) => o.uuid === feat.meshUuid);
            if (mesh) {
              if (mesh === selectedObject) { transformControls.detach(); selectedObject = null; }
              scene.remove(mesh);
              sceneObjects = sceneObjects.filter((o) => o !== mesh);
              // Dispose OCCT B-Rep shape (free WASM memory)
              const occtShape = occtShapes.get(mesh.uuid);
              if (occtShape) {
                try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
                occtShapes.delete(mesh.uuid);
              }
              if (mesh.geometry) mesh.geometry.dispose();
              if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
                else mesh.material.dispose();
              }
            }
          }
          if (feat.type === 'sketch') {
            allSketches = allSketches.filter((s) => s.id !== feat.sketchId);
          }
          featureTree.splice(idx, 1);
          updateFeatureTree();
          updateSceneTree();
        }
      });
    });

    // Context menu for right-click
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Simple context: show suppress/delete options (already have buttons)
    });

    tree.appendChild(item);
  });
}

/* ===================== Legacy Extrude / Revolve (quick-add without sketch) ===================== */
function extrudeShape() {
  objectCounter++;
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
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name}`);
}

function revolveShape() {
  objectCounter++;
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
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name}`);
}

/* ===================== Export ===================== */
/** Dispose all children in an export scene (free cloned geometries/materials) */
function disposeExportScene(exportScene) {
  exportScene.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function exportSTL() {
  if (sceneObjects.length === 0) { updateStatusBar('No objects to export'); return; }
  const exporter = new STLExporter();
  const exportScene = new THREE.Scene();
  sceneObjects.forEach((o) => {
    if (o.visible) exportScene.add(o.clone());
  });
  const result = exporter.parse(exportScene, { binary: true });
  downloadBlob(new Blob([result], { type: 'application/octet-stream' }), 'model.stl');
  disposeExportScene(exportScene);
  updateStatusBar('Exported STL');
}

function exportOBJ() {
  if (sceneObjects.length === 0) { updateStatusBar('No objects to export'); return; }
  const exporter = new OBJExporter();
  const exportScene = new THREE.Scene();
  sceneObjects.forEach((o) => {
    if (o.visible) exportScene.add(o.clone());
  });
  const result = exporter.parse(exportScene);
  downloadBlob(new Blob([result], { type: 'text/plain' }), 'model.obj');
  disposeExportScene(exportScene);
  updateStatusBar('Exported OBJ');
}

function exportGLTF() {
  if (sceneObjects.length === 0) { updateStatusBar('No objects to export'); return; }
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
      disposeExportScene(exportScene);
      updateStatusBar('Exported GLTF');
    },
    (error) => {
      disposeExportScene(exportScene);
      updateStatusBar(`Export error: ${error.message}`);
    },
    {}
  );
}

// downloadBlob imported from ../utils/download.js

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

  // Update dimensions (bounding box size)
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  setInput('cad-dim-w', size.x.toFixed(3));
  setInput('cad-dim-h', size.y.toFixed(3));
  setInput('cad-dim-d', size.z.toFixed(3));

  // Show measurement
  updateMeasurement(obj);
}

function clearPropertiesPanel() {
  ['cad-pos-x','cad-pos-y','cad-pos-z','cad-rot-x','cad-rot-y','cad-rot-z','cad-scl-x','cad-scl-y','cad-scl-z'].forEach((id) => setInput(id, ''));
  ['cad-dim-w','cad-dim-h','cad-dim-d'].forEach((id) => setInput(id, ''));
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
  let html = `Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;

  // Show B-Rep measurements if available
  const occtShape = occtShapes.get(obj.uuid);
  if (occtShape && occtEnabled) {
    const area = OCCT.getSurfaceArea(occtShape);
    const volume = OCCT.getVolume(occtShape);
    if (area >= 0) html += `<br>Area: ${area.toFixed(4)}`;
    if (volume > 0) html += ` | Vol: ${volume.toFixed(4)}`;
    html += `<br>Faces: ${OCCT.getFaceCount(occtShape)} | Edges: ${OCCT.getEdgeCount(occtShape)}`;
  }

  measDiv.innerHTML = html;
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
  if (countEl) countEl.textContent = `${t('cad.objects')}: ${sceneObjects.length}`;
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

  // Boolean operations (OCCT-enhanced with fallback)
  const unionBtn = document.getElementById('cad-bool-union');
  const subBtn = document.getElementById('cad-bool-subtract');
  const interBtn = document.getElementById('cad-bool-intersect');
  if (unionBtn) unionBtn.addEventListener('click', () => booleanOperationOCCT('union'));
  if (subBtn) subBtn.addEventListener('click', () => booleanOperationOCCT('subtract'));
  if (interBtn) interBtn.addEventListener('click', () => booleanOperationOCCT('intersect'));

  // Extrude / Revolve — use OCCT-enhanced dialog if sketches exist, else legacy
  const extBtn = document.getElementById('cad-extrude');
  const revBtn = document.getElementById('cad-revolve');
  if (extBtn) extBtn.addEventListener('click', () => { allSketches.length > 0 ? showExtrudeDialog() : extrudeShape(); });
  if (revBtn) revBtn.addEventListener('click', () => { allSketches.length > 0 ? showRevolveDialog() : revolveShape(); });


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
    btn.addEventListener('click', () => {
      // Use OCCT for supported primitives when available
      const type = btn.dataset.prim;
      if (occtEnabled && ['box', 'sphere', 'cylinder', 'cone', 'torus'].includes(type)) {
        createPrimitiveOCCT(type);
      } else {
        createPrimitive(type);
      }
    });
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

  // Mousemove: show snap indicator during measurement mode
  viewport.addEventListener('mousemove', (e) => {
    if (!measurementMode || !snapEnabled) { hideSnapIndicator(); return; }
    const rect = viewport.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, camera);
    const hits = rc.intersectObjects(sceneObjects.filter((o) => o.visible), true);
    let hitPoint;
    if (hits.length > 0) {
      hitPoint = hits[0].point.clone();
    } else {
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pt = new THREE.Vector3();
      if (rc.ray.intersectPlane(groundPlane, pt)) hitPoint = pt;
    }
    if (hitPoint) {
      const snap = computeAdvancedSnap(hitPoint);
      if (snap) {
        showSnapIndicator(snap, viewport);
      } else {
        hideSnapIndicator();
      }
    } else {
      hideSnapIndicator();
    }
  });
}

function bindKeyboardShortcuts() {
  keydownHandler = (e) => {
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

    // --- Shift combos (Sketch workflow) ---
    if (key === 's' && e.shiftKey && !mod) { e.preventDefault(); showPlaneDialog(); return; }
    if (key === 'e' && e.shiftKey && !mod) { e.preventDefault(); showExtrudeDialog(); return; }
    if (key === 'r' && e.shiftKey && !mod) { e.preventDefault(); showRevolveDialog(); return; }

    // --- Sketch mode keys ---
    if (sketchMode) {
      if (key === 'l') { setSketchTool('line'); return; }
      if (key === 'c') { setSketchTool('circle'); return; }
      if (key === 'r' && !e.shiftKey) { setSketchTool('rect'); return; }
      if (key === 'a') { setSketchTool('arc'); return; }
      if (key === 'p') { setSketchTool('polygon'); return; }
      if (key === 'd') { setSketchTool('dimension'); return; }
      if (key === 'g') { sketchGridSnap = !sketchGridSnap; updateSketchSnapButtons(); updateStatusBar(sketchGridSnap ? 'Grid Snap ON' : 'Grid Snap OFF'); return; }
      if (key === 'escape') { e.preventDefault(); exitSketchMode(); return; }
      return; // Don't process other keys in sketch mode
    }

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
    if (key === 's' && !mod && !e.shiftKey) { e.preventDefault(); toggleRadialMenu(e); return; }

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
  };
  document.addEventListener('keydown', keydownHandler);
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

/* ===================== Measurement Tool (Enhanced with Units) ===================== */
let measurementMode = false;
let measurePoints = [];
let measureLines = [];

/** Convert raw distance to current unit */
const toMeasureUnit = (dist) => dist * (UNIT_FACTORS[measureUnit] || 1);
const formatMeasure = (dist) => `${toMeasureUnit(dist).toFixed(3)} ${UNIT_LABELS[measureUnit]}`;

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
    hideMeasureFloat();
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

  // Raycast against all visible objects AND the grid plane (for clicking empty space)
  const hits = rc.intersectObjects(sceneObjects.filter((o) => o.visible), true);
  let hitPoint;
  if (hits.length > 0) {
    hitPoint = hits[0].point.clone();
  } else {
    // Intersect with ground plane (Y=0) as fallback
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (rc.ray.intersectPlane(groundPlane, pt)) {
      hitPoint = pt;
    } else {
      return;
    }
  }

  // Apply snap if enabled
  const snapped = computeAdvancedSnap(hitPoint);
  if (snapped) hitPoint = snapped.point;

  measurePoints.push(hitPoint.clone());

  if (measurePoints.length === 1) {
    updateStatusBar('Measure: Click second point');
    // Add sphere at first point
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, depthTest: false })
    );
    dot.position.copy(hitPoint);
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

    // Show floating label at midpoint
    showMeasureFloat(p1, p2, distance);

    // Draw distance label on 2D overlay
    drawMeasurementLabel(p1, p2, distance);

    const displayDist = formatMeasure(distance);
    updateStatusBar(`Distance: ${displayDist}`);

    // Update measurement panel with unit-converted value
    const measDiv = document.getElementById('cad-measurement');
    if (measDiv) {
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const dz = Math.abs(p2.z - p1.z);
      measDiv.innerHTML = `<b>P2P: ${displayDist}</b><br>` +
        `<span style="color:#ff6b6b">dX: ${formatMeasure(dx)}</span> ` +
        `<span style="color:#51cf66">dY: ${formatMeasure(dy)}</span> ` +
        `<span style="color:#339af0">dZ: ${formatMeasure(dz)}</span>`;
    }

    measurePoints = [];
  }
}

/** Show floating distance label near the measurement line */
const showMeasureFloat = (p1, p2, distance) => {
  const floatEl = document.getElementById('cad-measure-float');
  if (!floatEl) return;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const mid = p1.clone().add(p2).multiplyScalar(0.5).project(camera);
  const sx = (mid.x * 0.5 + 0.5) * rect.width;
  const sy = (-mid.y * 0.5 + 0.5) * rect.height;
  floatEl.textContent = formatMeasure(distance);
  floatEl.style.left = (sx + 12) + 'px';
  floatEl.style.top = (sy - 20) + 'px';
  floatEl.style.display = 'block';
};

const hideMeasureFloat = () => {
  const floatEl = document.getElementById('cad-measure-float');
  if (floatEl) floatEl.style.display = 'none';
};

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
  const text = formatMeasure(distance);
  ctx.strokeText(text, sx + 8, sy - 8);
  ctx.fillText(text, sx + 8, sy - 8);
}

/** Bind measurement unit selector */
function bindMeasureUnitEvents() {
  const unitSel = document.getElementById('cad-measure-unit');
  if (unitSel) unitSel.addEventListener('change', () => {
    measureUnit = unitSel.value;
    updateStatusBar(`Unit: ${UNIT_LABELS[measureUnit]}`);
  });
}

function clearMeasureLines() {
  measureLines.forEach((obj) => {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  measureLines = [];
  hideMeasureFloat();
  const overlay = document.getElementById('cad-measure-overlay');
  if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); }
}

/* ===================== Advanced Snap System ===================== */

/**
 * Compute advanced snap for a 3D point.
 * Checks: grid points, edge midpoints, circle/arc centers, intersection points.
 * @param {THREE.Vector3} point - the raw 3D point
 * @returns {{ type: string, point: THREE.Vector3 }|null}
 */
const computeAdvancedSnap = (point) => {
  if (!snapEnabled || !point) return null;
  const threshold = snapGrid * 1.5; // snap capture radius in world units
  let best = null;
  let bestDist = threshold;

  // 1. Grid snap
  const gx = Math.round(point.x / snapGrid) * snapGrid;
  const gz = Math.round(point.z / snapGrid) * snapGrid;
  const gridPt = new THREE.Vector3(gx, point.y, gz);
  const gDist = point.distanceTo(gridPt);
  if (gDist < bestDist) {
    best = { type: 'grid', point: gridPt };
    bestDist = gDist;
  }

  // 2. Edge midpoints
  if (snapMidpointEnabled) {
    for (const obj of sceneObjects) {
      if (!obj.visible || !obj.geometry) continue;
      const edges = getEdgeMidpoints(obj);
      for (const mid of edges) {
        const d = point.distanceTo(mid);
        if (d < bestDist) {
          best = { type: 'midpoint', point: mid };
          bestDist = d;
        }
      }
    }
  }

  // 3. Circle/arc center snap
  if (snapCenterEnabled) {
    for (const obj of sceneObjects) {
      if (!obj.visible) continue;
      const center = getObjectCenter(obj);
      if (center) {
        const d = point.distanceTo(center);
        if (d < bestDist) {
          best = { type: 'center', point: center };
          bestDist = d;
        }
      }
    }
  }

  // 4. Intersection snap (bounding box corners of objects)
  if (snapIntersectionEnabled) {
    for (const obj of sceneObjects) {
      if (!obj.visible) continue;
      const box = new THREE.Box3().setFromObject(obj);
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];
      for (const c of corners) {
        const d = point.distanceTo(c);
        if (d < bestDist) {
          best = { type: 'intersection', point: c };
          bestDist = d;
        }
      }
    }
  }

  lastSnapInfo = best;
  return best;
};

/** Extract edge midpoints from object geometry (bounding box edge midpoints) */
const getEdgeMidpoints = (obj) => {
  const box = new THREE.Box3().setFromObject(obj);
  const min = box.min;
  const max = box.max;
  const midX = (min.x + max.x) / 2;
  const midY = (min.y + max.y) / 2;
  const midZ = (min.z + max.z) / 2;
  return [
    // Bottom face edge midpoints
    new THREE.Vector3(midX, min.y, min.z),
    new THREE.Vector3(midX, min.y, max.z),
    new THREE.Vector3(min.x, min.y, midZ),
    new THREE.Vector3(max.x, min.y, midZ),
    // Top face edge midpoints
    new THREE.Vector3(midX, max.y, min.z),
    new THREE.Vector3(midX, max.y, max.z),
    new THREE.Vector3(min.x, max.y, midZ),
    new THREE.Vector3(max.x, max.y, midZ),
    // Vertical edge midpoints
    new THREE.Vector3(min.x, midY, min.z),
    new THREE.Vector3(max.x, midY, min.z),
    new THREE.Vector3(min.x, midY, max.z),
    new THREE.Vector3(max.x, midY, max.z),
  ];
};

/** Get center point for circle/sphere/cylinder/torus objects */
const getObjectCenter = (obj) => {
  if (!obj.userData || !obj.userData.type) return null;
  const type = obj.userData.type;
  if (['sphere', 'cylinder', 'cone', 'torus'].includes(type)) {
    return obj.position.clone();
  }
  // For any object, return the bounding box center
  const box = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return center;
};

/** Show snap indicator at a screen position */
const showSnapIndicator = (snapInfo, viewport) => {
  const indicator = document.getElementById('cad-snap-indicator');
  if (!indicator || !snapInfo) { hideSnapIndicator(); return; }

  const rect = viewport.getBoundingClientRect();
  const projected = snapInfo.point.clone().project(camera);
  const sx = (projected.x * 0.5 + 0.5) * rect.width;
  const sy = (-projected.y * 0.5 + 0.5) * rect.height;

  const dot = indicator.querySelector('.cad-snap-dot');
  const label = indicator.querySelector('.cad-snap-label');
  if (dot) {
    dot.className = 'cad-snap-dot';
    dot.classList.add(`snap-${snapInfo.type}`);
  }
  if (label) {
    const labels = { grid: 'Grid', midpoint: 'Midpoint', center: 'Center', intersection: 'Vertex' };
    label.textContent = labels[snapInfo.type] || '';
  }
  indicator.style.left = sx + 'px';
  indicator.style.top = sy + 'px';
  indicator.style.display = 'flex';
};

const hideSnapIndicator = () => {
  const indicator = document.getElementById('cad-snap-indicator');
  if (indicator) indicator.style.display = 'none';
};

/* ===================== Scene Background Options ===================== */

/** Apply background mode to the 3D scene */
const applyBackground = () => {
  if (!scene || !THREE) return;

  if (bgMode === 'solid') {
    scene.background = new THREE.Color(bgColor1);
  } else if (bgMode === 'gradient') {
    // Create gradient texture using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const c1 = new THREE.Color(bgColor1);
    const c2 = new THREE.Color(bgColor2);
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${c1.getHexString()}`);
    grad.addColorStop(1, `#${c2.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  } else if (bgMode === 'envmap') {
    // Sky gradient environment map: light blue top, white horizon, grey bottom
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const c1 = new THREE.Color(bgColor1);
    const c2 = new THREE.Color(bgColor2);
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
    scene.background = tex;
  }
};

/** Bind background mode and color inputs */
const bindBackgroundEvents = () => {
  const modeSel = document.getElementById('cad-bg-mode');
  const color1Input = document.getElementById('cad-bg-color1');
  const color2Input = document.getElementById('cad-bg-color2');
  const color2Row = document.getElementById('cad-bg-color2-row');

  if (modeSel) modeSel.addEventListener('change', () => {
    bgMode = modeSel.value;
    if (color2Row) color2Row.style.display = bgMode === 'solid' ? 'none' : 'flex';
    applyBackground();
  });
  if (color1Input) color1Input.addEventListener('input', () => {
    bgColor1 = parseInt(color1Input.value.replace('#', ''), 16);
    applyBackground();
  });
  if (color2Input) color2Input.addEventListener('input', () => {
    bgColor2 = parseInt(color2Input.value.replace('#', ''), 16);
    applyBackground();
  });

  // Initialize: hide color2 row for solid mode
  if (color2Row) color2Row.style.display = 'none';
};

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

  // Update helper — orient PlaneGeometry (default normal +Z) to match clipping axis
  if (clippingHelper) {
    clippingHelper.position.set(a === 'x' ? p : 0, a === 'y' ? p : 0, a === 'z' ? p : 0);
    if (a === 'x') { clippingHelper.rotation.set(0, Math.PI / 2, 0); }       // face +X
    else if (a === 'y') { clippingHelper.rotation.set(Math.PI / 2, 0, 0); }  // face +Y (horizontal)
    else { clippingHelper.rotation.set(0, 0, 0); }                           // face +Z (default)
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
    // Dispose OCCT B-Rep shape
    const occtShape = occtShapes.get(obj.uuid);
    if (occtShape) {
      try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
      occtShapes.delete(obj.uuid);
    }
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  });
  sceneObjects = [];
  selectedObject = null;
  objectCounter = 0;
  multiSelection = [];

  // Reset feature tree and sketches
  featureTree = [];
  featureCounter = 0;
  allSketches = [];
  sketchCounter = 0;

  clearPropertiesPanel();
  updateSceneTree();
  updateFeatureTree();
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
    case 'bool-union': booleanOperationOCCT('union'); break;
    case 'bool-subtract': booleanOperationOCCT('subtract'); break;
    case 'bool-intersect': booleanOperationOCCT('intersect'); break;
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

/** Set active sketch tool */
function setSketchTool(tool) {
  sketchTool = tool;
  sketchTempPoints = [];
  sketchDrawing = false;
  document.querySelectorAll('.cad-sketch-tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  updateStatusBar(`Sketch tool: ${tool}`);

  // If polygon, ask for sides
  if (tool === 'polygon') {
    const dialog = document.getElementById('cad-polygon-sides-dialog');
    if (dialog) dialog.style.display = 'flex';
  }
}

function updateSketchSnapButtons() {
  const gridBtn = document.getElementById('cad-sketch-snap-grid');
  const ptBtn = document.getElementById('cad-sketch-snap-point');
  if (gridBtn) gridBtn.classList.toggle('active', sketchGridSnap);
  if (ptBtn) ptBtn.classList.toggle('active', sketchPointSnap);
}

function bindSketchEvents() {
  // Sketch start button
  const sketchStartBtn = document.getElementById('cad-sketch-start');
  if (sketchStartBtn) sketchStartBtn.addEventListener('click', () => showPlaneDialog());

  // Plane dialog buttons
  document.querySelectorAll('.cad-plane-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      hidePlaneDialog();
      enterSketchMode(btn.dataset.plane);
    });
  });
  const planeCancel = document.getElementById('cad-sketch-plane-cancel');
  if (planeCancel) planeCancel.addEventListener('click', () => hidePlaneDialog());

  // Sketch tool buttons
  document.querySelectorAll('.cad-sketch-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSketchTool(btn.dataset.tool));
  });

  // Finish sketch button
  const finishBtn = document.getElementById('cad-sketch-finish');
  if (finishBtn) finishBtn.addEventListener('click', () => exitSketchMode());

  // Sketch snap toggles
  const snapGridBtn = document.getElementById('cad-sketch-snap-grid');
  if (snapGridBtn) snapGridBtn.addEventListener('click', () => {
    sketchGridSnap = !sketchGridSnap;
    updateSketchSnapButtons();
  });
  const snapPtBtn = document.getElementById('cad-sketch-snap-point');
  if (snapPtBtn) snapPtBtn.addEventListener('click', () => {
    sketchPointSnap = !sketchPointSnap;
    updateSketchSnapButtons();
  });

  // H/V constraint button
  const hvBtn = document.getElementById('cad-sketch-constraint-hv');
  if (hvBtn) hvBtn.addEventListener('click', () => {
    hvBtn.classList.toggle('active');
    updateStatusBar(hvBtn.classList.contains('active') ? 'H/V constraint: Auto-apply' : 'H/V constraint: Off');
  });

  // Extrude dialog — use OCCT-enhanced version when available
  const extOk = document.getElementById('cad-extrude-ok');
  const extCancel = document.getElementById('cad-extrude-cancel');
  if (extOk) extOk.addEventListener('click', () => executeExtrudeOCCT());
  if (extCancel) extCancel.addEventListener('click', () => hideExtrudeDialog());

  // Extrude slider sync
  const extSlider = document.getElementById('cad-extrude-dist-slider');
  const extInput = document.getElementById('cad-extrude-dist');
  if (extSlider && extInput) {
    extSlider.addEventListener('input', () => { extInput.value = extSlider.value; updateExtrudePreview(); });
    extInput.addEventListener('input', () => { extSlider.value = extInput.value; updateExtrudePreview(); });
  }
  const extProfile = document.getElementById('cad-extrude-profile');
  if (extProfile) extProfile.addEventListener('change', () => updateExtrudePreview());
  const extSym = document.getElementById('cad-extrude-symmetric');
  if (extSym) extSym.addEventListener('change', () => updateExtrudePreview());
  const extBevel = document.getElementById('cad-extrude-bevel');
  if (extBevel) extBevel.addEventListener('change', () => updateExtrudePreview());

  // Revolve dialog — use OCCT-enhanced version when available
  const revOk = document.getElementById('cad-revolve-ok');
  const revCancel = document.getElementById('cad-revolve-cancel');
  if (revOk) revOk.addEventListener('click', () => executeRevolveOCCT());
  if (revCancel) revCancel.addEventListener('click', () => hideRevolveDialog());

  // Revolve slider sync
  const revSlider = document.getElementById('cad-revolve-angle-slider');
  const revInput = document.getElementById('cad-revolve-angle');
  if (revSlider && revInput) {
    revSlider.addEventListener('input', () => { revInput.value = revSlider.value; updateRevolvePreview(); });
    revInput.addEventListener('input', () => { revSlider.value = revInput.value; updateRevolvePreview(); });
  }
  const revProfile = document.getElementById('cad-revolve-profile');
  if (revProfile) revProfile.addEventListener('change', () => updateRevolvePreview());

  // Polygon sides dialog
  const polySidesOk = document.getElementById('cad-polygon-sides-ok');
  if (polySidesOk) polySidesOk.addEventListener('click', () => {
    const sidesInput = document.getElementById('cad-polygon-sides');
    if (sidesInput) polygonSides = parseInt(sidesInput.value) || 6;
    const dialog = document.getElementById('cad-polygon-sides-dialog');
    if (dialog) dialog.style.display = 'none';
  });
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

/* ===================== OCCT B-Rep Engine Integration ===================== */

/** Initialize OCCT engine (non-blocking, lazy load) */
async function initOCCTEngine() {
  const progressBar = document.getElementById('cad-occt-progress');
  const progressFill = document.getElementById('cad-occt-progress-fill');
  const progressText = document.getElementById('cad-occt-progress-text');
  const statusIndicator = document.getElementById('cad-brep-status');

  // Show progress bar
  if (progressBar) progressBar.style.display = 'flex';
  if (statusIndicator) {
    statusIndicator.textContent = t('cad.loadingBrep');
    statusIndicator.className = 'cad-brep-status loading';
  }

  const success = await OCCT.loadOCCT((pct, msg) => {
    if (progressFill && pct >= 0) {
      progressFill.style.width = pct + '%';
    }
    if (progressText) {
      progressText.textContent = msg;
    }
  });

  // Hide progress bar
  if (progressBar) {
    setTimeout(() => { progressBar.style.display = 'none'; }, 1000);
  }

  if (success) {
    occtEnabled = true;
    if (statusIndicator) {
      statusIndicator.textContent = t('cad.brepActive');
      statusIndicator.className = 'cad-brep-status active';
    }
    // Enable OCCT-only buttons
    document.querySelectorAll('.cad-occt-only').forEach((btn) => {
      btn.disabled = false;
      btn.title = btn.dataset.occtTitle || btn.title;
    });
    updateStatusBar('OpenCascade B-Rep engine loaded');
  } else {
    occtEnabled = false;
    if (statusIndicator) {
      statusIndicator.textContent = t('cad.meshFallback');
      statusIndicator.className = 'cad-brep-status fallback';
    }
    updateStatusBar('B-Rep engine unavailable — using mesh mode');
  }
}

/** Convert OCCT tessellation data to Three.js mesh */
function occtShapeToMesh(topoShape, color) {
  if (!topoShape || !THREE) return null;
  const data = OCCT.tessellate(topoShape, 0.1);
  if (!data) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  if (data.indices.length > 0) {
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  }
  geometry.computeBoundingBox();

  const material = new THREE.MeshStandardMaterial({
    color: color || getRandomPastelColor(),
    metalness: 0.1,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Store edge data for wireframe overlay
  if (data.edges.length > 0) {
    mesh.userData.occtEdges = data.edges;
  }

  return mesh;
}

/** Create a primitive using OCCT if available, else fallback to Three.js */
function createPrimitiveOCCT(type) {
  if (!occtEnabled) {
    createPrimitive(type);
    return;
  }

  let shape = null;
  let name = '';
  objectCounter++;

  switch (type) {
    case 'box':
      shape = OCCT.createBox(2, 2, 2);
      name = `Box_${objectCounter}`;
      break;
    case 'sphere':
      shape = OCCT.createSphere(1);
      name = `Sphere_${objectCounter}`;
      break;
    case 'cylinder':
      shape = OCCT.createCylinder(1, 2);
      name = `Cylinder_${objectCounter}`;
      break;
    case 'cone':
      shape = OCCT.createCone(1, 0, 2);
      name = `Cone_${objectCounter}`;
      break;
    case 'torus':
      shape = OCCT.createTorus(1, 0.4);
      name = `Torus_${objectCounter}`;
      break;
    default:
      // No OCCT primitive for this type, fallback
      createPrimitive(type);
      return;
  }

  if (!shape) {
    // OCCT failed, fallback
    objectCounter--;
    createPrimitive(type);
    return;
  }

  const mesh = occtShapeToMesh(shape);
  if (!mesh) {
    objectCounter--;
    createPrimitive(type);
    return;
  }

  mesh.name = name;
  mesh.position.y = type === 'plane' ? 0.01 : 1;
  mesh.userData.type = type;
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  // Store the B-Rep shape for precise operations later
  occtShapes.set(mesh.uuid, shape);

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${name} (B-Rep)`);
}

/** Perform boolean using OCCT if both shapes have B-Rep data */
function booleanOperationOCCT(op) {
  if (sceneObjects.length < 2) {
    updateStatusBar('Need at least 2 objects for boolean operation');
    return;
  }
  if (!selectedObject) {
    updateStatusBar('Select the target object first');
    return;
  }

  // Use multi-selection if 2 objects are selected, otherwise find closest non-selected object
  let second = null;
  if (multiSelection.length >= 2) {
    // Use the first multi-selected object that isn't the primary selection
    second = multiSelection.find((o) => o !== selectedObject) || null;
  }
  if (!second) {
    // Fallback: use the nearest non-selected object (by distance)
    const otherObjects = sceneObjects.filter((o) => o !== selectedObject);
    if (otherObjects.length === 0) return;
    if (otherObjects.length === 1) {
      second = otherObjects[0];
    } else {
      // Pick the closest object to the selected one
      let minDist = Infinity;
      for (const o of otherObjects) {
        const d = selectedObject.position.distanceTo(o.position);
        if (d < minDist) { minDist = d; second = o; }
      }
    }
  }
  if (!second) return;

  // Check if both have B-Rep data
  const shapeA = occtShapes.get(selectedObject.uuid);
  const shapeB = occtShapes.get(second.uuid);

  if (!occtEnabled || !shapeA || !shapeB) {
    // Fallback to mesh boolean
    booleanOperation(op);
    return;
  }

  pushUndo('boolean');

  let resultShape = null;
  try {
    if (op === 'union') resultShape = OCCT.booleanUnion(shapeA, shapeB);
    else if (op === 'subtract') resultShape = OCCT.booleanSubtract(shapeA, shapeB);
    else if (op === 'intersect') resultShape = OCCT.booleanIntersect(shapeA, shapeB);
  } catch (e) {
    updateStatusBar(`B-Rep boolean ${op} failed, using mesh fallback`);
    booleanOperation(op);
    return;
  }

  if (!resultShape) {
    updateStatusBar(`B-Rep boolean ${op} failed, using mesh fallback`);
    booleanOperation(op);
    return;
  }

  const mesh = occtShapeToMesh(resultShape, selectedObject.material ? selectedObject.material.color.clone() : undefined);
  if (!mesh) {
    booleanOperation(op);
    return;
  }

  objectCounter++;
  const capOp = op.charAt(0).toUpperCase() + op.slice(1);
  mesh.name = `${capOp}_${objectCounter}`;
  mesh.userData.type = op;
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  // Remove originals — free OCCT WASM memory for input shapes
  OCCT.deleteShape(shapeA);
  OCCT.deleteShape(shapeB);
  occtShapes.delete(selectedObject.uuid);
  occtShapes.delete(second.uuid);
  if (selectedObject.geometry) selectedObject.geometry.dispose();
  if (selectedObject.material) selectedObject.material.dispose();
  if (second.geometry) second.geometry.dispose();
  if (second.material) second.material.dispose();
  scene.remove(selectedObject);
  scene.remove(second);
  sceneObjects = sceneObjects.filter((o) => o !== selectedObject && o !== second);

  // Store result B-Rep
  occtShapes.set(mesh.uuid, resultShape);

  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Boolean ${op} completed (B-Rep)`);
}

/* ===================== Fillet / Chamfer / Shell Operations ===================== */

function showFilletDialog() {
  if (!occtEnabled) { updateStatusBar('Fillet requires B-Rep engine (not loaded)'); return; }
  if (!selectedObject || !occtShapes.has(selectedObject.uuid)) {
    updateStatusBar('Select a B-Rep object to fillet');
    return;
  }
  const dialog = document.getElementById('cad-fillet-dialog');
  if (dialog) {
    const edgeCount = OCCT.getEdgeCount(occtShapes.get(selectedObject.uuid));
    const infoEl = dialog.querySelector('.cad-fillet-info');
    if (infoEl) infoEl.textContent = `${edgeCount} ${t('cad.edgesAvailable')}`;
    dialog.style.display = 'flex';
  }
}

function executeFilletFromDialog() {
  const radiusInput = document.getElementById('cad-fillet-radius');
  const radius = parseFloat(radiusInput?.value) || 0.2;
  const shape = occtShapes.get(selectedObject?.uuid);
  if (!shape) return;

  pushUndo('fillet');
  const result = OCCT.filletEdges(shape, radius, []);
  if (!result) {
    updateStatusBar('Fillet failed — try a smaller radius');
    return;
  }

  const mesh = occtShapeToMesh(result, selectedObject.material?.color?.clone());
  if (!mesh) return;

  objectCounter++;
  mesh.name = `Fillet_${objectCounter}`;
  mesh.position.copy(selectedObject.position);
  mesh.rotation.copy(selectedObject.rotation);
  mesh.scale.copy(selectedObject.scale);
  mesh.userData.type = 'fillet';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  // Replace old — free OCCT WASM memory for input shape
  OCCT.deleteShape(shape);
  occtShapes.delete(selectedObject.uuid);
  if (selectedObject.geometry) selectedObject.geometry.dispose();
  if (selectedObject.material) selectedObject.material.dispose();
  scene.remove(selectedObject);
  sceneObjects = sceneObjects.filter((o) => o !== selectedObject);

  occtShapes.set(mesh.uuid, result);
  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();

  const dialog = document.getElementById('cad-fillet-dialog');
  if (dialog) dialog.style.display = 'none';
  updateStatusBar(`Applied fillet (R=${radius})`);
}

function showChamferDialog() {
  if (!occtEnabled) { updateStatusBar('Chamfer requires B-Rep engine (not loaded)'); return; }
  if (!selectedObject || !occtShapes.has(selectedObject.uuid)) {
    updateStatusBar('Select a B-Rep object to chamfer');
    return;
  }
  const dialog = document.getElementById('cad-chamfer-dialog');
  if (dialog) {
    const edgeCount = OCCT.getEdgeCount(occtShapes.get(selectedObject.uuid));
    const infoEl = dialog.querySelector('.cad-chamfer-info');
    if (infoEl) infoEl.textContent = `${edgeCount} ${t('cad.edgesAvailable')}`;
    dialog.style.display = 'flex';
  }
}

function executeChamferFromDialog() {
  const distInput = document.getElementById('cad-chamfer-dist');
  const distance = parseFloat(distInput?.value) || 0.2;
  const shape = occtShapes.get(selectedObject?.uuid);
  if (!shape) return;

  pushUndo('chamfer');
  const result = OCCT.chamferEdges(shape, distance, []);
  if (!result) {
    updateStatusBar('Chamfer failed — try a smaller distance');
    return;
  }

  const mesh = occtShapeToMesh(result, selectedObject.material?.color?.clone());
  if (!mesh) return;

  objectCounter++;
  mesh.name = `Chamfer_${objectCounter}`;
  mesh.position.copy(selectedObject.position);
  mesh.rotation.copy(selectedObject.rotation);
  mesh.scale.copy(selectedObject.scale);
  mesh.userData.type = 'chamfer';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  OCCT.deleteShape(shape);
  occtShapes.delete(selectedObject.uuid);
  if (selectedObject.geometry) selectedObject.geometry.dispose();
  if (selectedObject.material) selectedObject.material.dispose();
  scene.remove(selectedObject);
  sceneObjects = sceneObjects.filter((o) => o !== selectedObject);

  occtShapes.set(mesh.uuid, result);
  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();

  const dialog = document.getElementById('cad-chamfer-dialog');
  if (dialog) dialog.style.display = 'none';
  updateStatusBar(`Applied chamfer (D=${distance})`);
}

function showShellDialog() {
  if (!occtEnabled) { updateStatusBar('Shell requires B-Rep engine (not loaded)'); return; }
  if (!selectedObject || !occtShapes.has(selectedObject.uuid)) {
    updateStatusBar('Select a B-Rep object to shell');
    return;
  }
  const dialog = document.getElementById('cad-shell-dialog');
  if (dialog) {
    const faceCount = OCCT.getFaceCount(occtShapes.get(selectedObject.uuid));
    const infoEl = dialog.querySelector('.cad-shell-info');
    if (infoEl) infoEl.textContent = `${faceCount} ${t('cad.facesAvailable')}`;
    dialog.style.display = 'flex';
  }
}

function executeShellFromDialog() {
  const thicknessInput = document.getElementById('cad-shell-thickness');
  const faceIdxInput = document.getElementById('cad-shell-face');
  const thickness = parseFloat(thicknessInput?.value) || 0.2;
  const faceIdx = parseInt(faceIdxInput?.value) || 0;
  const shape = occtShapes.get(selectedObject?.uuid);
  if (!shape) return;

  pushUndo('shell');
  const result = OCCT.shellShape(shape, thickness, [faceIdx]);
  if (!result) {
    updateStatusBar('Shell failed — try different parameters');
    return;
  }

  const mesh = occtShapeToMesh(result, selectedObject.material?.color?.clone());
  if (!mesh) return;

  objectCounter++;
  mesh.name = `Shell_${objectCounter}`;
  mesh.position.copy(selectedObject.position);
  mesh.rotation.copy(selectedObject.rotation);
  mesh.scale.copy(selectedObject.scale);
  mesh.userData.type = 'shell';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  OCCT.deleteShape(shape);
  occtShapes.delete(selectedObject.uuid);
  if (selectedObject.geometry) selectedObject.geometry.dispose();
  if (selectedObject.material) selectedObject.material.dispose();
  scene.remove(selectedObject);
  sceneObjects = sceneObjects.filter((o) => o !== selectedObject);

  occtShapes.set(mesh.uuid, result);
  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();

  const dialog = document.getElementById('cad-shell-dialog');
  if (dialog) dialog.style.display = 'none';
  updateStatusBar(`Applied shell (T=${thickness})`);
}

/* ===================== STEP Export / Import ===================== */

function exportSTEPFile() {
  if (!occtEnabled) { updateStatusBar('STEP export requires B-Rep engine'); return; }

  const shapes = [];
  sceneObjects.forEach((o) => {
    if (o.visible && occtShapes.has(o.uuid)) {
      shapes.push(occtShapes.get(o.uuid));
    }
  });

  if (shapes.length === 0) {
    updateStatusBar('No B-Rep objects to export. Use OCCT primitives for STEP export.');
    return;
  }

  const stepContent = OCCT.exportSTEP(shapes);
  if (stepContent) {
    downloadBlob(new Blob([stepContent], { type: 'application/step' }), 'model.step');
    updateStatusBar(`Exported ${shapes.length} shape(s) to STEP`);
  } else {
    updateStatusBar('STEP export failed');
  }
}

function importSTEPFile() {
  if (!occtEnabled) { updateStatusBar('STEP import requires B-Rep engine'); return; }
  const input = document.getElementById('cad-step-import-input');
  if (input) input.click();
}

function handleSTEPImport(file) {
  if (!occtEnabled) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const shape = OCCT.importSTEP(e.target.result);
      if (!shape) {
        updateStatusBar('Failed to read STEP file');
        return;
      }

      const mesh = occtShapeToMesh(shape);
      if (!mesh) {
        updateStatusBar('Failed to tessellate STEP geometry');
        return;
      }

      objectCounter++;
      mesh.name = `STEP_${objectCounter}_${file.name}`;
      mesh.userData.type = 'step-import';
      mesh.userData.isCADObject = true;
      mesh.userData.isBRep = true;

      // Auto-scale and center
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = maxDim > 10 ? 5 / maxDim : 1;
      if (scaleFactor !== 1) mesh.scale.multiplyScalar(scaleFactor);

      // Re-compute bounding box after scaling to get correct center
      mesh.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(mesh);
      const center = scaledBox.getCenter(new THREE.Vector3());
      mesh.position.sub(center);
      mesh.position.y = 0;

      occtShapes.set(mesh.uuid, shape);
      scene.add(mesh);
      sceneObjects.push(mesh);
      selectObject(mesh);
      pushUndo('add', mesh);
      updateSceneTree();
      updateFeatureTree();
      updateStatusBar(`Imported STEP: ${file.name} (B-Rep)`);
    } catch (err) {
      updateStatusBar(`STEP import error: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

/* ===================== OCCT-enhanced Extrude / Revolve ===================== */

function executeExtrudeOCCT() {
  if (!occtEnabled) {
    executeExtrude();
    return;
  }

  const profileSelect = document.getElementById('cad-extrude-profile');
  const distInput = document.getElementById('cad-extrude-dist');
  const symCheck = document.getElementById('cad-extrude-symmetric');
  if (!profileSelect || !distInput) return;

  const sketch = allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) { updateStatusBar('No sketch selected'); return; }

  const dist = parseFloat(distInput.value) || 5;
  const symmetric = symCheck ? symCheck.checked : false;

  // Build OCCT wire from sketch entities
  const planeData = {
    origin: { x: sketch.plane.origin.x, y: sketch.plane.origin.y, z: sketch.plane.origin.z },
    normal: { x: sketch.plane.normal.x, y: sketch.plane.normal.y, z: sketch.plane.normal.z },
    right: { x: sketch.plane.right.x, y: sketch.plane.right.y, z: sketch.plane.right.z },
    up: { x: sketch.plane.up.x, y: sketch.plane.up.y, z: sketch.plane.up.z },
  };

  const wire = OCCT.createSketchWire(sketch.entities, planeData);
  if (!wire) {
    // Fallback to Three.js extrude
    executeExtrude();
    return;
  }

  const direction = { x: sketch.plane.normal.x, y: sketch.plane.normal.y, z: sketch.plane.normal.z };
  const shape = OCCT.extrudeShape(wire, direction, dist, symmetric);
  if (!shape) {
    executeExtrude();
    return;
  }

  const mesh = occtShapeToMesh(shape);
  if (!mesh) {
    executeExtrude();
    return;
  }

  objectCounter++;
  mesh.name = `Extrude_${objectCounter}`;
  mesh.userData.type = 'extrude';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;
  mesh.userData.sketchId = sketch.id;

  occtShapes.set(mesh.uuid, shape);
  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  featureCounter++;
  featureTree.push({
    type: 'extrude', name: `Extrude ${objectCounter} (${sketch.name}) [B-Rep]`,
    id: `feat_${featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideExtrudeDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created B-Rep extrude from ${sketch.name}`);
}

function executeRevolveOCCT() {
  if (!occtEnabled) {
    executeRevolve();
    return;
  }

  const profileSelect = document.getElementById('cad-revolve-profile');
  const angleInput = document.getElementById('cad-revolve-angle');
  const axisSelect = document.getElementById('cad-revolve-axis');
  if (!profileSelect || !angleInput) return;

  const sketch = allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) { updateStatusBar('No sketch selected'); return; }

  const angleDeg = parseFloat(angleInput.value) || 360;
  const axisVal = axisSelect ? axisSelect.value : 'y';

  const planeData = {
    origin: { x: sketch.plane.origin.x, y: sketch.plane.origin.y, z: sketch.plane.origin.z },
    normal: { x: sketch.plane.normal.x, y: sketch.plane.normal.y, z: sketch.plane.normal.z },
    right: { x: sketch.plane.right.x, y: sketch.plane.right.y, z: sketch.plane.right.z },
    up: { x: sketch.plane.up.x, y: sketch.plane.up.y, z: sketch.plane.up.z },
  };

  const wire = OCCT.createSketchWire(sketch.entities, planeData);
  if (!wire) {
    executeRevolve();
    return;
  }

  const axisDirs = {
    x: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } },
    y: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 1, z: 0 } },
    z: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } },
  };

  const shape = OCCT.revolveShape(wire, axisDirs[axisVal] || axisDirs.y, angleDeg);
  if (!shape) {
    executeRevolve();
    return;
  }

  const mesh = occtShapeToMesh(shape);
  if (!mesh) {
    executeRevolve();
    return;
  }

  objectCounter++;
  mesh.name = `Revolve_${objectCounter}`;
  mesh.userData.type = 'revolve';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;
  mesh.userData.sketchId = sketch.id;

  occtShapes.set(mesh.uuid, shape);
  scene.add(mesh);
  sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  featureCounter++;
  featureTree.push({
    type: 'revolve', name: `Revolve ${objectCounter} (${sketch.name}) [B-Rep]`,
    id: `feat_${featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideRevolveDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created B-Rep revolve from ${sketch.name}`);
}

/* ===================== Bind OCCT UI Buttons ===================== */

function bindOCCTButtons(container) {
  // Fillet
  const filletBtn = document.getElementById('cad-fillet');
  if (filletBtn) filletBtn.addEventListener('click', () => showFilletDialog());
  const filletOk = document.getElementById('cad-fillet-ok');
  if (filletOk) filletOk.addEventListener('click', () => executeFilletFromDialog());
  const filletCancel = document.getElementById('cad-fillet-cancel');
  if (filletCancel) filletCancel.addEventListener('click', () => {
    const d = document.getElementById('cad-fillet-dialog');
    if (d) d.style.display = 'none';
  });

  // Chamfer
  const chamferBtn = document.getElementById('cad-chamfer');
  if (chamferBtn) chamferBtn.addEventListener('click', () => showChamferDialog());
  const chamferOk = document.getElementById('cad-chamfer-ok');
  if (chamferOk) chamferOk.addEventListener('click', () => executeChamferFromDialog());
  const chamferCancel = document.getElementById('cad-chamfer-cancel');
  if (chamferCancel) chamferCancel.addEventListener('click', () => {
    const d = document.getElementById('cad-chamfer-dialog');
    if (d) d.style.display = 'none';
  });

  // Shell
  const shellBtn = document.getElementById('cad-shell');
  if (shellBtn) shellBtn.addEventListener('click', () => showShellDialog());
  const shellOk = document.getElementById('cad-shell-ok');
  if (shellOk) shellOk.addEventListener('click', () => executeShellFromDialog());
  const shellCancel = document.getElementById('cad-shell-cancel');
  if (shellCancel) shellCancel.addEventListener('click', () => {
    const d = document.getElementById('cad-shell-dialog');
    if (d) d.style.display = 'none';
  });

  // STEP Export/Import
  const stepExportBtn = document.getElementById('cad-export-step');
  if (stepExportBtn) stepExportBtn.addEventListener('click', () => exportSTEPFile());
  const stepImportBtn = document.getElementById('cad-import-step');
  if (stepImportBtn) stepImportBtn.addEventListener('click', () => importSTEPFile());
  const stepImportInput = document.getElementById('cad-step-import-input');
  if (stepImportInput) stepImportInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSTEPImport(e.target.files[0]);
      e.target.value = '';
    }
  });
}

// Call after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initContextMenu());
} else {
  setTimeout(() => initContextMenu(), 0);
}
