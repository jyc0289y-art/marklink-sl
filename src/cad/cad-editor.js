// OfficeLink SL — CAD Editor Orchestrator
// Wires sub-modules together and exports public API: initCadEditor, destroyCadEditor

import { escapeHtml } from '../utils/sanitize.js';
import { t } from '../ui/i18n.js';
import CS from './cad-state.js';

// Sub-module imports
import {
  setupScene, setupLights, setupGrid, setupControls, setupTransformControls,
  animate, handleResize, updateCadThemeColors, setCameraView, animateCamera,
  updateStatusBar, toggleGrid, fitAll, focusSelected, normalToFace,
  initViewCube, initBoxSelect, applyBackground, bindBackgroundEvents,
} from './cad-viewport.js';

import {
  createPrimitive, createPrimitiveOCCT, getRandomPastelColor,
  selectObject, pickObject, deleteSelected, duplicateSelected,
  pushUndo, undo, redo, updateUndoRedoButtons,
  setTransformMode, toggleSnap, setShadingMode,
  booleanOperationOCCT,
  extrudeShape, revolveShape,
  showExtrudeDialog, hideExtrudeDialog, updateExtrudePreview, executeExtrude,
  showRevolveDialog, hideRevolveDialog, updateRevolvePreview, executeRevolve,
  executeExtrudeOCCT, executeRevolveOCCT,
  exportSTL, exportOBJ, exportGLTF, exportSTEPFile,
  importFile, importSTEPFile, handleSTEPImport,
  updateSceneTree, updateFeatureTree, updatePropertiesPanel, clearPropertiesPanel,
  selectAll, copySelected, pasteClipboard, clearScene,
  showContextMenu, hideContextMenu, handleContextAction, initContextMenu,
  toggleRadialMenu, hideRadialMenu,
  toggleMeasurementTool, handleMeasureClick, clearMeasureLines,
  bindMeasureUnitEvents,
  computeAdvancedSnap, showSnapIndicator, hideSnapIndicator,
  toggleSectionView, updateClippingPlane,
  initOCCTEngine, occtShapeToMesh,
  showFilletDialog, executeFilletFromDialog,
  showChamferDialog, executeChamferFromDialog,
  showShellDialog, executeShellFromDialog,
} from './cad-tools.js';

import {
  enterSketchMode, exitSketchMode, hideSketchGrid,
  showPlaneDialog, hidePlaneDialog,
  setSketchTool, updateSketchSnapButtons,
  buildShapeFromSketch, buildLathePoints,
} from './cad-sketch.js';

/* ===================== Wire late-bound callbacks ===================== */
// Breaks circular dependency: sketch <-> tools
CS._updateFeatureTree = () => updateFeatureTree();
CS._updateSceneTree = () => updateSceneTree();
CS._buildShapeFromSketch = (sketch) => buildShapeFromSketch(sketch);
CS._buildLathePoints = (sketch) => buildLathePoints(sketch);

/* ===================== CDN Import Helper ===================== */
const _i = async (p, retries = 2, timeout = 10000) => {
  let attempts = 0;
  while (attempts <= retries) {
    attempts++;
    try {
      const result = await Promise.race([
        import(/* @vite-ignore */ CS.CDN + p),
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

/* ===================== Load Three.js from CDN ===================== */
async function loadThreeJS() {
  try {
    CS.THREE = await _i('/build/three.module.js');
    ({ OrbitControls: CS.OrbitControls } = await _i('/examples/jsm/controls/OrbitControls.js'));
    ({ TransformControls: CS.TransformControls } = await _i('/examples/jsm/controls/TransformControls.js'));
    ({ STLExporter: CS.STLExporter } = await _i('/examples/jsm/exporters/STLExporter.js'));
    ({ OBJExporter: CS.OBJExporter } = await _i('/examples/jsm/exporters/OBJExporter.js'));
    ({ GLTFExporter: CS.GLTFExporter } = await _i('/examples/jsm/exporters/GLTFExporter.js'));
    ({ STLLoader: CS.STLLoader } = await _i('/examples/jsm/loaders/STLLoader.js'));
    ({ OBJLoader: CS.OBJLoader } = await _i('/examples/jsm/loaders/OBJLoader.js'));
    ({ GLTFLoader: CS.GLTFLoader } = await _i('/examples/jsm/loaders/GLTFLoader.js'));
  } catch (err) {
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
        <div style="margin-top:0.5rem;font-size:0.85rem;opacity:0.7;">${escapeHtml(err.message)}</div>
        <div style="margin-top:1rem;font-size:0.85rem;">Check your internet connection and reload the page.</div>
      </div>`;
      target.style.position = 'relative';
      target.appendChild(errorDiv);
    }
    throw err;
  }
}

/* ===================== Init ===================== */
export async function initCadEditor() {
  const container = document.getElementById('view-cad');
  if (!container || CS.isInitialized) return;

  await loadThreeJS();

  CS.viewportEl = container.querySelector('.cad-viewport');
  if (!CS.viewportEl) return;

  setupScene();
  setupLights();
  setupGrid();
  setupControls();
  setupTransformControls(updatePropertiesPanel, updateStatusBar, pushUndo);
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
  initBoxSelect(selectObject);
  bindClippingControls();
  bindMeasureUnitEvents();
  bindBackgroundEvents();
  animate();
  handleResize();

  CS.isInitialized = true;
  updateStatusBar('Ready');
  updateSceneTree();
  updateFeatureTree();

  // Observe theme changes
  updateCadThemeColors();
  CS.themeObserver = new MutationObserver(() => {
    updateCadThemeColors();
    if (CS.renderer && CS.scene && CS.camera) CS.renderer.render(CS.scene, CS.camera);
  });
  CS.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Start loading OCCT B-Rep engine (non-blocking)
  initOCCTEngine();
}

/* ===================== Destroy ===================== */
export function destroyCadEditor() {
  if (!CS.isInitialized) return;

  // 1. Cancel animation frame
  if (CS.animFrameId != null) {
    cancelAnimationFrame(CS.animFrameId);
    CS.animFrameId = null;
  }

  // 2. Disconnect observers
  if (CS.themeObserver) { CS.themeObserver.disconnect(); CS.themeObserver = null; }
  if (CS.resizeObserver) { CS.resizeObserver.disconnect(); CS.resizeObserver = null; }

  // 3. Remove document-level keyboard listener
  if (CS.keydownHandler) {
    document.removeEventListener('keydown', CS.keydownHandler);
    CS.keydownHandler = null;
  }

  // 4. Dispose transform controls
  if (CS.transformControls) {
    CS.transformControls.detach();
    CS.transformControls.dispose();
    if (CS.scene) CS.scene.remove(CS.transformControls);
    CS.transformControls = null;
  }

  // 5. Dispose orbit controls
  if (CS.orbitControls) { CS.orbitControls.dispose(); CS.orbitControls = null; }

  // 6. Dispose all scene objects
  CS.sceneObjects.forEach((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  CS.sceneObjects = [];

  // 7. Dispose grid, axes, and remaining scene children
  if (CS.scene) {
    if (CS.scene.background && CS.scene.background.isTexture) {
      CS.scene.background.dispose();
    }
    CS.scene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => {
          if (m.map) m.map.dispose();
          if (m.normalMap) m.normalMap.dispose();
          if (m.roughnessMap) m.roughnessMap.dispose();
          if (m.metalnessMap) m.metalnessMap.dispose();
          if (m.envMap) m.envMap.dispose();
          m.dispose();
        });
      }
    });
    CS.scene.clear();
    CS.scene = null;
  }

  // 8. Dispose renderer
  if (CS.renderer) {
    CS.renderer.dispose();
    if (CS.renderer.domElement && CS.renderer.domElement.parentNode) {
      CS.renderer.domElement.parentNode.removeChild(CS.renderer.domElement);
    }
    CS.renderer = null;
  }

  // 9. Dispose OCCT shape references
  CS.occtShapes.forEach((shape) => {
    try { if (shape && typeof shape.delete === 'function') shape.delete(); } catch { /* already freed */ }
  });
  CS.occtShapes.clear();
  CS.occtEnabled = false;

  // 10. Dispose view cube
  if (CS.viewCubeRenderer) {
    CS.viewCubeRenderer.dispose();
    if (CS.viewCubeRenderer.domElement && CS.viewCubeRenderer.domElement.parentNode) {
      CS.viewCubeRenderer.domElement.parentNode.removeChild(CS.viewCubeRenderer.domElement);
    }
    CS.viewCubeRenderer = null;
  }
  if (CS.viewCubeScene) {
    CS.viewCubeScene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    CS.viewCubeScene = null;
  }
  CS.viewCubeCamera = null;

  // 11. Clean up measure lines, clipping, sketch grid
  clearMeasureLines();
  if (CS.clippingHelper) {
    if (CS.clippingHelper.geometry) CS.clippingHelper.geometry.dispose();
    if (CS.clippingHelper.material) CS.clippingHelper.material.dispose();
    CS.clippingHelper = null;
  }
  CS.clippingPlane = null;
  CS.sectionActive = false;
  hideSketchGrid();

  // 12. Dispose undo/redo state geometries
  CS.undoStack.forEach((state) => {
    if (state.objects) state.objects.forEach((o) => { if (o.geometry) o.geometry.dispose(); });
  });
  CS.redoStack.forEach((state) => {
    if (state.objects) state.objects.forEach((o) => { if (o.geometry) o.geometry.dispose(); });
  });

  // 13. Clean up box select div
  if (CS.boxSelectDiv) {
    if (CS.boxSelectDiv.parentNode) CS.boxSelectDiv.parentNode.removeChild(CS.boxSelectDiv);
    CS.boxSelectDiv = null;
  }

  // 14. Reset state
  CS.selectedObject = null;
  CS.multiSelection = [];
  CS.gridHelper = null;
  CS.axesHelper = null;
  CS.camera = null;
  CS.lights = {};
  CS.undoStack = [];
  CS.redoStack = [];
  CS.objectCounter = 0;
  CS.featureTree = [];
  CS.featureCounter = 0;
  CS.allSketches = [];
  CS.sketchCounter = 0;
  CS.clipboardData = null;
  CS.measurementMode = false;
  CS.measurePoints = [];
  CS.viewportEl = null;
  CS.canvasEl = null;
  CS.isInitialized = false;
}

/* ===================== Event Binding ===================== */

function bindToolbarEvents(container) {
  container.querySelectorAll('.cad-transform-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTransformMode(btn.dataset.mode));
  });

  const undoBtn = document.getElementById('cad-undo');
  const redoBtn = document.getElementById('cad-redo');
  if (undoBtn) undoBtn.addEventListener('click', () => undo());
  if (redoBtn) redoBtn.addEventListener('click', () => redo());

  const snapBtn = document.getElementById('cad-snap');
  if (snapBtn) snapBtn.addEventListener('click', () => toggleSnap());

  const delBtn = document.getElementById('cad-delete');
  if (delBtn) delBtn.addEventListener('click', () => deleteSelected());

  const dupBtn = document.getElementById('cad-duplicate');
  if (dupBtn) dupBtn.addEventListener('click', () => duplicateSelected());

  container.querySelectorAll('.cad-shading-btn').forEach((btn) => {
    btn.addEventListener('click', () => setShadingMode(btn.dataset.shading));
  });

  container.querySelectorAll('.cad-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setCameraView(btn.dataset.view));
  });

  const unionBtn = document.getElementById('cad-bool-union');
  const subBtn = document.getElementById('cad-bool-subtract');
  const interBtn = document.getElementById('cad-bool-intersect');
  if (unionBtn) unionBtn.addEventListener('click', () => booleanOperationOCCT('union'));
  if (subBtn) subBtn.addEventListener('click', () => booleanOperationOCCT('subtract'));
  if (interBtn) interBtn.addEventListener('click', () => booleanOperationOCCT('intersect'));

  const extBtn = document.getElementById('cad-extrude');
  const revBtn = document.getElementById('cad-revolve');
  if (extBtn) extBtn.addEventListener('click', () => { CS.allSketches.length > 0 ? showExtrudeDialog() : extrudeShape(); });
  if (revBtn) revBtn.addEventListener('click', () => { CS.allSketches.length > 0 ? showRevolveDialog() : revolveShape(); });

  const focusBtn = document.getElementById('cad-focus');
  if (focusBtn) focusBtn.addEventListener('click', () => focusSelected());

  const clearBtn = document.getElementById('cad-clear-scene');
  if (clearBtn) clearBtn.addEventListener('click', () => clearScene());

  const ambIntensity = document.getElementById('cad-light-ambient');
  const dirIntensity = document.getElementById('cad-light-directional');
  if (ambIntensity) ambIntensity.addEventListener('input', () => {
    CS.lights.ambient.intensity = parseFloat(ambIntensity.value);
  });
  if (dirIntensity) dirIntensity.addEventListener('input', () => {
    CS.lights.directional.intensity = parseFloat(dirIntensity.value);
  });
}

function bindPrimitiveEvents(container) {
  container.querySelectorAll('.cad-prim-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.prim;
      if (CS.occtEnabled && ['box', 'sphere', 'cylinder', 'cone', 'torus'].includes(type)) {
        createPrimitiveOCCT(type);
      } else {
        createPrimitive(type);
      }
    });
  });
}

function bindPropertyEvents(container) {
  const THREE = CS.THREE;
  ['cad-pos-x','cad-pos-y','cad-pos-z'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!CS.selectedObject) return;
      const axis = id.split('-').pop();
      CS.selectedObject.position[axis] = parseFloat(el.value) || 0;
      pushUndo('transform');
    });
  });

  ['cad-rot-x','cad-rot-y','cad-rot-z'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!CS.selectedObject) return;
      const axis = id.split('-').pop();
      CS.selectedObject.rotation[axis] = THREE.MathUtils.degToRad(parseFloat(el.value) || 0);
      pushUndo('transform');
    });
  });

  ['cad-scl-x','cad-scl-y','cad-scl-z'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!CS.selectedObject) return;
      const axis = id.split('-').pop();
      CS.selectedObject.scale[axis] = parseFloat(el.value) || 1;
      pushUndo('transform');
    });
  });

  const colorInput = document.getElementById('cad-mat-color');
  if (colorInput) colorInput.addEventListener('input', () => {
    if (CS.selectedObject && CS.selectedObject.material) {
      CS.selectedObject.material.color.set(colorInput.value);
    }
  });

  const metalInput = document.getElementById('cad-mat-metalness');
  if (metalInput) metalInput.addEventListener('input', () => {
    if (CS.selectedObject && CS.selectedObject.material) {
      CS.selectedObject.material.metalness = parseFloat(metalInput.value);
    }
  });

  const roughInput = document.getElementById('cad-mat-roughness');
  if (roughInput) roughInput.addEventListener('input', () => {
    if (CS.selectedObject && CS.selectedObject.material) {
      CS.selectedObject.material.roughness = parseFloat(roughInput.value);
    }
  });

  const opacityInput = document.getElementById('cad-mat-opacity');
  if (opacityInput) opacityInput.addEventListener('input', () => {
    if (CS.selectedObject && CS.selectedObject.material) {
      CS.selectedObject.material.opacity = parseFloat(opacityInput.value);
      CS.selectedObject.material.transparent = parseFloat(opacityInput.value) < 1;
    }
  });

  const wireChk = document.getElementById('cad-mat-wireframe');
  if (wireChk) wireChk.addEventListener('change', () => {
    if (CS.selectedObject && CS.selectedObject.material) {
      CS.selectedObject.material.wireframe = wireChk.checked;
    }
  });

  const nameInput = document.getElementById('cad-obj-name');
  if (nameInput) nameInput.addEventListener('change', () => {
    if (CS.selectedObject) {
      CS.selectedObject.name = nameInput.value;
      updateSceneTree();
    }
  });
}

function bindViewportEvents(container) {
  const THREE = CS.THREE;
  const viewport = container.querySelector('.cad-viewport');
  if (!viewport) return;

  viewport.addEventListener('click', (e) => {
    if (e.target.closest('.cad-viewport-overlay') || e.target.closest('.cad-viewport-info') || e.target.closest('.cad-view-cube')) return;
    if (CS.transformControls.dragging) return;

    if (CS.measurementMode) { handleMeasureClick(e); return; }

    if (e.ctrlKey || e.metaKey) {
      const rect = viewport.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(mouse, CS.camera);
      const hits = rc.intersectObjects(CS.sceneObjects.filter((o) => o.visible), true);
      if (hits.length > 0) {
        let target = hits[0].object;
        while (target && !target.userData.isCADObject && target.parent) target = target.parent;
        if (target && target.userData.isCADObject) {
          const idx = CS.multiSelection.indexOf(target);
          if (idx >= 0) {
            CS.multiSelection.splice(idx, 1);
            if (target.material && target.material._originalEmissive !== undefined) {
              target.material.emissive.setHex(target.material._originalEmissive);
            }
          } else {
            CS.multiSelection.push(target);
            if (target.material) {
              target.material._originalEmissive = target.material._originalEmissive ?? target.material.emissive.getHex();
              target.material.emissive.setHex(0x111122);
            }
          }
          if (CS.multiSelection.length > 0) selectObject(CS.multiSelection[CS.multiSelection.length - 1]);
          updateStatusBar(`Multi-select: ${CS.multiSelection.length}`);
          return;
        }
      }
    }

    pickObject(e);
    CS.multiSelection = CS.selectedObject ? [CS.selectedObject] : [];
  });

  let _rightDownPos = null;
  viewport.addEventListener('mousedown', (e) => {
    if (e.button === 2) _rightDownPos = { x: e.clientX, y: e.clientY };
  });
  viewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (_rightDownPos) {
      const dx = Math.abs(e.clientX - _rightDownPos.x);
      const dy = Math.abs(e.clientY - _rightDownPos.y);
      if (dx < 5 && dy < 5) {
        showContextMenu(e.clientX, e.clientY);
      }
    }
    _rightDownPos = null;
  });

  viewport.addEventListener('dblclick', (e) => {
    if (e.target.closest('.cad-viewport-overlay')) return;
    pickObject(e);
    if (CS.selectedObject) focusSelected();
  });

  viewport.addEventListener('mousemove', (e) => {
    if (!CS.measurementMode || !CS.snapEnabled) { hideSnapIndicator(); return; }
    const rect = viewport.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, CS.camera);
    const hits = rc.intersectObjects(CS.sceneObjects.filter((o) => o.visible), true);
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
  CS.keydownHandler = (e) => {
    const cadView = document.getElementById('view-cad');
    if (!cadView || cadView.style.display === 'none' || !cadView.offsetParent) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    if (key === 'z' && mod && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((key === 'z' && mod && e.shiftKey) || (key === 'y' && mod)) { e.preventDefault(); redo(); return; }
    if (key === 'd' && mod) { e.preventDefault(); duplicateSelected(); return; }
    if (key === 'a' && mod) { e.preventDefault(); selectAll(); return; }
    if (key === 'c' && mod) { e.preventDefault(); copySelected(); return; }
    if (key === 'v' && mod) { e.preventDefault(); pasteClipboard(); return; }

    if (key === 's' && e.shiftKey && !mod) { e.preventDefault(); showPlaneDialog(); return; }
    if (key === 'e' && e.shiftKey && !mod) { e.preventDefault(); showExtrudeDialog(); return; }
    if (key === 'r' && e.shiftKey && !mod) { e.preventDefault(); showRevolveDialog(); return; }

    if (CS.sketchMode) {
      if (key === 'l') { setSketchTool('line'); return; }
      if (key === 'c') { setSketchTool('circle'); return; }
      if (key === 'r' && !e.shiftKey) { setSketchTool('rect'); return; }
      if (key === 'a') { setSketchTool('arc'); return; }
      if (key === 'p') { setSketchTool('polygon'); return; }
      if (key === 'd') { setSketchTool('dimension'); return; }
      if (key === 'g') { CS.sketchGridSnap = !CS.sketchGridSnap; updateSketchSnapButtons(); updateStatusBar(CS.sketchGridSnap ? 'Grid Snap ON' : 'Grid Snap OFF'); return; }
      if (key === 'escape') { e.preventDefault(); exitSketchMode(); return; }
      return;
    }

    if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelected(); return; }
    if (key === 'w') { setTransformMode('translate'); return; }
    if (key === 'e') { setTransformMode('rotate'); return; }
    if (key === 'r') { setTransformMode('scale'); return; }
    if (key === 'f') { fitAll(); return; }
    if (key === 'g') { toggleGrid(); return; }
    if (key === 'n') { normalToFace(); return; }
    if (key === 's' && !mod && !e.shiftKey) { e.preventDefault(); toggleRadialMenu(e); return; }
    if (key === 'm') { toggleMeasurementTool(); return; }

    if (key === 'escape') {
      selectObject(null);
      hideContextMenu();
      hideRadialMenu();
      if (CS.measurementMode) toggleMeasurementTool();
      return;
    }

    const viewKeys = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'perspective' };
    if (viewKeys[key]) { setCameraView(viewKeys[key]); return; }
    if (key === '0') { setCameraView('perspective'); return; }
  };
  document.addEventListener('keydown', CS.keydownHandler);
}

function bindImportExport(container) {
  const exportStl = document.getElementById('cad-export-stl');
  const exportObj = document.getElementById('cad-export-obj');
  const exportGltf = document.getElementById('cad-export-gltf');
  if (exportStl) exportStl.addEventListener('click', () => exportSTL());
  if (exportObj) exportObj.addEventListener('click', () => exportOBJ());
  if (exportGltf) exportGltf.addEventListener('click', () => exportGLTF());

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

function bindSketchEvents() {
  const sketchStartBtn = document.getElementById('cad-sketch-start');
  if (sketchStartBtn) sketchStartBtn.addEventListener('click', () => showPlaneDialog());

  document.querySelectorAll('.cad-plane-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      hidePlaneDialog();
      enterSketchMode(btn.dataset.plane);
    });
  });
  const planeCancel = document.getElementById('cad-sketch-plane-cancel');
  if (planeCancel) planeCancel.addEventListener('click', () => hidePlaneDialog());

  document.querySelectorAll('.cad-sketch-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSketchTool(btn.dataset.tool));
  });

  const finishBtn = document.getElementById('cad-sketch-finish');
  if (finishBtn) finishBtn.addEventListener('click', () => exitSketchMode());

  const snapGridBtn = document.getElementById('cad-sketch-snap-grid');
  if (snapGridBtn) snapGridBtn.addEventListener('click', () => {
    CS.sketchGridSnap = !CS.sketchGridSnap;
    updateSketchSnapButtons();
  });
  const snapPtBtn = document.getElementById('cad-sketch-snap-point');
  if (snapPtBtn) snapPtBtn.addEventListener('click', () => {
    CS.sketchPointSnap = !CS.sketchPointSnap;
    updateSketchSnapButtons();
  });

  const hvBtn = document.getElementById('cad-sketch-constraint-hv');
  if (hvBtn) hvBtn.addEventListener('click', () => {
    hvBtn.classList.toggle('active');
    updateStatusBar(hvBtn.classList.contains('active') ? 'H/V constraint: Auto-apply' : 'H/V constraint: Off');
  });

  const extOk = document.getElementById('cad-extrude-ok');
  const extCancel = document.getElementById('cad-extrude-cancel');
  if (extOk) extOk.addEventListener('click', () => executeExtrudeOCCT());
  if (extCancel) extCancel.addEventListener('click', () => hideExtrudeDialog());

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

  const revOk = document.getElementById('cad-revolve-ok');
  const revCancel = document.getElementById('cad-revolve-cancel');
  if (revOk) revOk.addEventListener('click', () => executeRevolveOCCT());
  if (revCancel) revCancel.addEventListener('click', () => hideRevolveDialog());

  const revSlider = document.getElementById('cad-revolve-angle-slider');
  const revInput = document.getElementById('cad-revolve-angle');
  if (revSlider && revInput) {
    revSlider.addEventListener('input', () => { revInput.value = revSlider.value; updateRevolvePreview(); });
    revInput.addEventListener('input', () => { revSlider.value = revInput.value; updateRevolvePreview(); });
  }
  const revProfile = document.getElementById('cad-revolve-profile');
  if (revProfile) revProfile.addEventListener('change', () => updateRevolvePreview());

  const polySidesOk = document.getElementById('cad-polygon-sides-ok');
  if (polySidesOk) polySidesOk.addEventListener('click', () => {
    const sidesInput = document.getElementById('cad-polygon-sides');
    if (sidesInput) CS.polygonSides = parseInt(sidesInput.value) || 6;
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

function bindOCCTButtons(container) {
  const filletBtn = document.getElementById('cad-fillet');
  if (filletBtn) filletBtn.addEventListener('click', () => showFilletDialog());
  const filletOk = document.getElementById('cad-fillet-ok');
  if (filletOk) filletOk.addEventListener('click', () => executeFilletFromDialog());
  const filletCancel = document.getElementById('cad-fillet-cancel');
  if (filletCancel) filletCancel.addEventListener('click', () => {
    const d = document.getElementById('cad-fillet-dialog');
    if (d) d.style.display = 'none';
  });

  const chamferBtn = document.getElementById('cad-chamfer');
  if (chamferBtn) chamferBtn.addEventListener('click', () => showChamferDialog());
  const chamferOk = document.getElementById('cad-chamfer-ok');
  if (chamferOk) chamferOk.addEventListener('click', () => executeChamferFromDialog());
  const chamferCancel = document.getElementById('cad-chamfer-cancel');
  if (chamferCancel) chamferCancel.addEventListener('click', () => {
    const d = document.getElementById('cad-chamfer-dialog');
    if (d) d.style.display = 'none';
  });

  const shellBtn = document.getElementById('cad-shell');
  if (shellBtn) shellBtn.addEventListener('click', () => showShellDialog());
  const shellOk = document.getElementById('cad-shell-ok');
  if (shellOk) shellOk.addEventListener('click', () => executeShellFromDialog());
  const shellCancel = document.getElementById('cad-shell-cancel');
  if (shellCancel) shellCancel.addEventListener('click', () => {
    const d = document.getElementById('cad-shell-dialog');
    if (d) d.style.display = 'none';
  });

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
