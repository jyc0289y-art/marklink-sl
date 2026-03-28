// OfficeLink SL — CAD Tools (primitives, selection, boolean, undo/redo, import/export, OCCT, measurement, UI panels)

import CS from './cad-state.js';
import { escapeHtml } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import * as OCCT from './occt-engine.js';
import { updateStatusBar, animateCamera, focusSelected, normalToFace as vpNormalToFace } from './cad-viewport.js';
import { t } from '../ui/i18n.js';

// Late-bound helpers — registered by orchestrator to break circular dependency
const buildShapeFromSketch = (sketch) => CS._buildShapeFromSketch ? CS._buildShapeFromSketch(sketch) : null;
const buildLathePoints = (sketch) => CS._buildLathePoints ? CS._buildLathePoints(sketch) : null;

/* ===================== Primitive Creation ===================== */

export function getRandomPastelColor() {
  const THREE = CS.THREE;
  const hue = Math.random();
  const sat = 0.4 + Math.random() * 0.3;
  const light = 0.5 + Math.random() * 0.2;
  return new THREE.Color().setHSL(hue, sat, light);
}

export function createPrimitive(type) {
  const THREE = CS.THREE;
  let geometry, name;
  CS.objectCounter++;

  switch (type) {
    case 'box': geometry = new THREE.BoxGeometry(2, 2, 2); name = `Box_${CS.objectCounter}`; break;
    case 'sphere': geometry = new THREE.SphereGeometry(1, 32, 32); name = `Sphere_${CS.objectCounter}`; break;
    case 'cylinder': geometry = new THREE.CylinderGeometry(1, 1, 2, 32); name = `Cylinder_${CS.objectCounter}`; break;
    case 'cone': geometry = new THREE.ConeGeometry(1, 2, 32); name = `Cone_${CS.objectCounter}`; break;
    case 'torus': geometry = new THREE.TorusGeometry(1, 0.4, 16, 48); name = `Torus_${CS.objectCounter}`; break;
    case 'plane': geometry = new THREE.PlaneGeometry(4, 4); name = `Plane_${CS.objectCounter}`; break;
    case 'torusknot': geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16); name = `TorusKnot_${CS.objectCounter}`; break;
    case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(1); name = `Dodecahedron_${CS.objectCounter}`; break;
    case 'icosahedron': geometry = new THREE.IcosahedronGeometry(1); name = `Icosahedron_${CS.objectCounter}`; break;
    default: geometry = new THREE.BoxGeometry(2, 2, 2); name = `Object_${CS.objectCounter}`;
  }

  const material = new THREE.MeshStandardMaterial({
    color: getRandomPastelColor(), metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = type === 'plane' ? 0.01 : 1;
  mesh.userData.type = type;
  mesh.userData.isCADObject = true;

  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${name}`);
}

/* ===================== Selection ===================== */

export function selectObject(obj) {
  if (CS.selectedObject && CS.selectedObject.material) {
    if (CS.selectedObject.material._originalEmissive !== undefined) {
      CS.selectedObject.material.emissive.setHex(CS.selectedObject.material._originalEmissive);
    }
  }

  CS.selectedObject = obj;

  if (obj) {
    if (obj.material) {
      obj.material._originalEmissive = obj.material.emissive.getHex();
      obj.material.emissive.setHex(0x111122);
    }
    CS.transformControls.attach(obj);
    updatePropertiesPanel();
  } else {
    CS.transformControls.detach();
    clearPropertiesPanel();
  }

  updateSceneTree();
}

export function pickObject(event) {
  const THREE = CS.THREE;
  if (!CS.viewportEl) return;
  const rect = CS.viewportEl.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, CS.camera);

  const pickables = CS.sceneObjects.filter((o) => o.visible);
  const intersects = raycaster.intersectObjects(pickables, true);

  if (intersects.length > 0) {
    let target = intersects[0].object;
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

/* ===================== Delete / Duplicate ===================== */

export function deleteSelected() {
  if (!CS.selectedObject) return;
  pushUndo('delete', CS.selectedObject);
  CS.transformControls.detach();
  CS.scene.remove(CS.selectedObject);
  CS.sceneObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject);
  const name = CS.selectedObject.name;

  const occtShape = CS.occtShapes.get(CS.selectedObject.uuid);
  if (occtShape) {
    try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
    CS.occtShapes.delete(CS.selectedObject.uuid);
  }

  if (CS.selectedObject.geometry) CS.selectedObject.geometry.dispose();
  if (CS.selectedObject.material) {
    const mats = Array.isArray(CS.selectedObject.material) ? CS.selectedObject.material : [CS.selectedObject.material];
    mats.forEach((m) => {
      if (m.map) m.map.dispose();
      if (m.normalMap) m.normalMap.dispose();
      if (m.roughnessMap) m.roughnessMap.dispose();
      if (m.metalnessMap) m.metalnessMap.dispose();
      if (m.envMap) m.envMap.dispose();
      m.dispose();
    });
  }

  CS.multiSelection = CS.multiSelection.filter((o) => o !== CS.selectedObject);
  CS.selectedObject = null;
  clearPropertiesPanel();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Deleted ${name}`);
}

export function duplicateSelected() {
  if (!CS.selectedObject) return;
  const clone = CS.selectedObject.clone();
  if (Array.isArray(CS.selectedObject.material)) {
    clone.material = CS.selectedObject.material.map((m) => m.clone());
  } else {
    clone.material = CS.selectedObject.material.clone();
  }
  CS.objectCounter++;
  clone.name = `${CS.selectedObject.userData.type || 'Object'}_${CS.objectCounter}`;
  clone.position.x += 2;
  clone.userData = { ...CS.selectedObject.userData };

  const srcShape = CS.occtShapes.get(CS.selectedObject.uuid);
  if (srcShape && OCCT.isOCCTReady()) {
    try {
      const oc = OCCT.getOC();
      const copier = new oc.BRepBuilderAPI_Copy_2(srcShape, true, false);
      const clonedShape = copier.Shape();
      copier.delete();
      CS.occtShapes.set(clone.uuid, clonedShape);
    } catch {
      clone.userData.isBRep = false;
    }
  }

  CS.scene.add(clone);
  CS.sceneObjects.push(clone);
  selectObject(clone);
  pushUndo('add', clone);
  updateSceneTree();
  updateStatusBar(`Duplicated to ${clone.name}`);
}

/* ===================== Undo / Redo ===================== */

export function pushUndo(action, obj) {
  const THREE = CS.THREE;
  const state = {
    action,
    objects: CS.sceneObjects.map((o) => {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      return {
        uuid: o.uuid, name: o.name, type: o.userData.type,
        position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale.clone(),
        color: mat ? mat.color.getHex() : 0xcccccc,
        metalness: mat ? mat.metalness : 0, roughness: mat ? mat.roughness : 0.5,
        visible: o.visible, geometry: o.geometry.clone(),
      };
    }),
  };
  if (obj) { state.targetUuid = obj.uuid; state.targetName = obj.name; }
  CS.undoStack.push(state);
  if (CS.undoStack.length > 50) CS.undoStack.shift();
  CS.redoStack = [];
  updateUndoRedoButtons();
}

function restoreState(state) {
  const THREE = CS.THREE;
  CS.transformControls.detach();
  CS.sceneObjects.forEach((o) => {
    CS.scene.remove(o);
    const occtShape = CS.occtShapes.get(o.uuid);
    if (occtShape) {
      try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
      CS.occtShapes.delete(o.uuid);
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
  CS.sceneObjects = [];
  CS.selectedObject = null;
  CS.multiSelection = [];

  state.objects.forEach((data) => {
    const material = new THREE.MeshStandardMaterial({
      color: data.color, metalness: data.metalness, roughness: data.roughness, side: THREE.DoubleSide,
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
    CS.scene.add(mesh);
    CS.sceneObjects.push(mesh);
  });

  clearPropertiesPanel();
  updateSceneTree();
}

function _snapshotCurrent() {
  return {
    objects: CS.sceneObjects.map((o) => {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      return {
        uuid: o.uuid, name: o.name, type: o.userData.type,
        position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale.clone(),
        color: mat ? mat.color.getHex() : 0xcccccc,
        metalness: mat ? mat.metalness : 0, roughness: mat ? mat.roughness : 0.5,
        visible: o.visible, geometry: o.geometry.clone(),
      };
    }),
  };
}

export function undo() {
  if (CS.undoStack.length === 0) return;
  CS.redoStack.push(_snapshotCurrent());
  const prev = CS.undoStack.pop();
  restoreState(prev);
  updateUndoRedoButtons();
  updateStatusBar('Undo');
}

export function redo() {
  if (CS.redoStack.length === 0) return;
  CS.undoStack.push(_snapshotCurrent());
  const next = CS.redoStack.pop();
  restoreState(next);
  updateUndoRedoButtons();
  updateStatusBar('Redo');
}

export function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('cad-undo');
  const redoBtn = document.getElementById('cad-redo');
  if (undoBtn) undoBtn.disabled = CS.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = CS.redoStack.length === 0;
}

/* ===================== Transform Mode ===================== */

export function setTransformMode(mode) {
  CS.currentTransformMode = mode;
  CS.transformControls.setMode(mode);
  document.querySelectorAll('.cad-transform-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  updateStatusBar(`Mode: ${mode}`);
}

/* ===================== Snap ===================== */

export function toggleSnap() {
  const THREE = CS.THREE;
  CS.snapEnabled = !CS.snapEnabled;
  if (CS.snapEnabled) {
    CS.transformControls.setTranslationSnap(CS.snapGrid);
    CS.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    CS.transformControls.setScaleSnap(0.25);
  } else {
    CS.transformControls.setTranslationSnap(null);
    CS.transformControls.setRotationSnap(null);
    CS.transformControls.setScaleSnap(null);
  }
  const snapBtn = document.getElementById('cad-snap');
  if (snapBtn) snapBtn.classList.toggle('active', CS.snapEnabled);
  updateStatusBar(CS.snapEnabled ? 'Snap ON' : 'Snap OFF');
}

/* ===================== Shading Modes ===================== */

export function setShadingMode(mode) {
  CS.shadingMode = mode;
  CS.sceneObjects.forEach((obj) => {
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

/* ===================== Boolean Operations ===================== */

function booleanOperation(op) {
  const THREE = CS.THREE;
  if (CS.sceneObjects.length < 2) { updateStatusBar('Need at least 2 objects for boolean operation'); return; }
  if (!CS.selectedObject) { updateStatusBar('Select the target object first'); return; }

  let second = null;
  if (CS.multiSelection.length >= 2) {
    second = CS.multiSelection.find((o) => o !== CS.selectedObject) || null;
  }
  if (!second) {
    const otherObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject);
    if (otherObjects.length === 0) return;
    if (otherObjects.length === 1) { second = otherObjects[0]; }
    else {
      let minDist = Infinity;
      for (const o of otherObjects) {
        const d = CS.selectedObject.position.distanceTo(o.position);
        if (d < minDist) { minDist = d; second = o; }
      }
    }
  }
  if (!second) return;

  pushUndo('boolean');

  try {
    performBooleanOp(op, CS.selectedObject, second);
    updateStatusBar(`Boolean ${op} completed`);
  } catch (e) {
    updateStatusBar(`Boolean ${op} failed: ${e.message}`);
  }
}

function performBooleanOp(op, objA, objB) {
  const THREE = CS.THREE;

  if (op === 'union') {
    const geoA = objA.geometry.clone();
    const geoB = objB.geometry.clone();
    geoA.applyMatrix4(objA.matrixWorld);
    geoB.applyMatrix4(objB.matrixWorld);

    const merged = mergeGeometries(geoA, geoB);
    if (merged) {
      const material = objA.material.clone();
      const mesh = new THREE.Mesh(merged, material);
      CS.objectCounter++;
      mesh.name = `Union_${CS.objectCounter}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.type = 'union';
      mesh.userData.isCADObject = true;

      geoA.dispose();
      geoB.dispose();
      CS.scene.remove(objA);
      CS.scene.remove(objB);
      CS.sceneObjects = CS.sceneObjects.filter((o) => o !== objA && o !== objB);
      if (objA.geometry) objA.geometry.dispose();
      if (objA.material) objA.material.dispose();
      if (objB.geometry) objB.geometry.dispose();
      if (objB.material) objB.material.dispose();

      CS.scene.add(mesh);
      CS.sceneObjects.push(mesh);
      selectObject(mesh);
      updateSceneTree();
    }
  } else if (op === 'subtract') {
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
    CS.renderer.localClippingEnabled = true;
    CS.scene.remove(objB);
    CS.sceneObjects = CS.sceneObjects.filter((o) => o !== objB);
    if (objB.geometry) objB.geometry.dispose();
    if (objB.material) objB.material.dispose();
    updateSceneTree();
    updateStatusBar('Subtract applied (clipping approximation)');
  } else if (op === 'intersect') {
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
    CS.renderer.localClippingEnabled = true;
    CS.scene.remove(objB);
    CS.sceneObjects = CS.sceneObjects.filter((o) => o !== objB);
    if (objB.geometry) objB.geometry.dispose();
    if (objB.material) objB.material.dispose();
    updateSceneTree();
    updateStatusBar('Intersect applied (clipping approximation)');
  }
}

function mergeGeometries(geoA, geoB) {
  const THREE = CS.THREE;
  const posA = geoA.getAttribute('position');
  const posB = geoB.getAttribute('position');
  if (!posA || !posB) return null;

  const totalVerts = posA.count + posB.count;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);

  for (let i = 0; i < posA.count * 3; i++) { positions[i] = posA.array[i]; }
  const normA = geoA.getAttribute('normal');
  if (normA) { for (let i = 0; i < normA.count * 3; i++) { normals[i] = normA.array[i]; } }

  const offset = posA.count * 3;
  for (let i = 0; i < posB.count * 3; i++) { positions[offset + i] = posB.array[i]; }
  const normB = geoB.getAttribute('normal');
  if (normB) { for (let i = 0; i < normB.count * 3; i++) { normals[offset + i] = normB.array[i]; } }

  const idxA = geoA.getIndex();
  const idxB = geoB.getIndex();
  let indices = null;

  if (idxA && idxB) {
    indices = new Uint32Array(idxA.count + idxB.count);
    for (let i = 0; i < idxA.count; i++) { indices[i] = idxA.array[i]; }
    for (let i = 0; i < idxB.count; i++) { indices[idxA.count + i] = idxB.array[i] + posA.count; }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (indices) { merged.setIndex(new THREE.BufferAttribute(indices, 1)); }

  return merged;
}

/* ===================== Extrude / Revolve (Legacy) ===================== */

export function extrudeShape() {
  const THREE = CS.THREE;
  CS.objectCounter++;
  const shape = new THREE.Shape();
  const outerR = 1, innerR = 0.5, points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  const extrudeSettings = { depth: 1, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Extrude_${CS.objectCounter}`;
  mesh.position.y = 1;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'extrude';
  mesh.userData.isCADObject = true;

  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name}`);
}

export function revolveShape() {
  const THREE = CS.THREE;
  CS.objectCounter++;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const r = 0.3 + Math.sin(t * Math.PI) * 0.7;
    pts.push(new THREE.Vector2(r, t * 3));
  }

  const geometry = new THREE.LatheGeometry(pts, 32);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Revolve_${CS.objectCounter}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'revolve';
  mesh.userData.isCADObject = true;

  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name}`);
}

/* ===================== Sketch-based Extrude / Revolve Dialogs ===================== */

export function showExtrudeDialog() {
  if (CS.allSketches.length === 0) { updateStatusBar('No sketches available. Create a sketch first (Shift+S)'); return; }
  const dialog = document.getElementById('cad-extrude-dialog');
  if (!dialog) return;

  const profileSelect = document.getElementById('cad-extrude-profile');
  if (profileSelect) {
    profileSelect.innerHTML = CS.allSketches.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${s.entities.length} entities)</option>`).join('');
  }

  dialog.style.display = 'flex';
  updateExtrudePreview();
}

export function hideExtrudeDialog() {
  const dialog = document.getElementById('cad-extrude-dialog');
  if (dialog) dialog.style.display = 'none';
  removeExtrudePreview();
}

export function updateExtrudePreview() {
  const THREE = CS.THREE;
  removeExtrudePreview();
  const profileSelect = document.getElementById('cad-extrude-profile');
  const distInput = document.getElementById('cad-extrude-dist');
  const symCheck = document.getElementById('cad-extrude-symmetric');
  if (!profileSelect || !distInput) return;

  const sketch = CS.allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) return;

  const shape = buildShapeFromSketch(sketch);
  if (!shape) return;

  const dist = parseFloat(distInput.value) || 5;
  const symmetric = symCheck ? symCheck.checked : false;
  const bevelCheck = document.getElementById('cad-extrude-bevel');
  const bevel = bevelCheck ? bevelCheck.checked : false;

  const settings = {
    depth: dist,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.1 : 0,
    bevelSize: bevel ? 0.1 : 0,
    bevelSegments: bevel ? 2 : 0,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, settings);
  const material = new THREE.MeshStandardMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  CS.extrudePreviewMesh = new THREE.Mesh(geometry, material);
  CS.extrudePreviewMesh.userData.isHelper = true;

  const q = new THREE.Quaternion();
  const planeInfo = sketch.plane;
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planeInfo.normal);
  CS.extrudePreviewMesh.quaternion.copy(q);
  CS.extrudePreviewMesh.position.copy(planeInfo.origin);
  if (symmetric) {
    CS.extrudePreviewMesh.position.add(planeInfo.normal.clone().multiplyScalar(-dist / 2));
  }

  CS.scene.add(CS.extrudePreviewMesh);
}

function removeExtrudePreview() {
  if (CS.extrudePreviewMesh) {
    CS.scene.remove(CS.extrudePreviewMesh);
    CS.extrudePreviewMesh.geometry.dispose();
    CS.extrudePreviewMesh.material.dispose();
    CS.extrudePreviewMesh = null;
  }
}

export function executeExtrude() {
  const THREE = CS.THREE;
  const profileSelect = document.getElementById('cad-extrude-profile');
  const distInput = document.getElementById('cad-extrude-dist');
  const symCheck = document.getElementById('cad-extrude-symmetric');
  const bevelCheck = document.getElementById('cad-extrude-bevel');
  if (!profileSelect || !distInput) return;

  const sketch = CS.allSketches.find((s) => s.id === profileSelect.value);
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
  CS.objectCounter++;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Extrude_${CS.objectCounter}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'extrude';
  mesh.userData.isCADObject = true;
  mesh.userData.sketchId = sketch.id;

  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sketch.plane.normal);
  mesh.quaternion.copy(q);
  mesh.position.copy(sketch.plane.origin);
  if (symmetric) {
    mesh.position.add(sketch.plane.normal.clone().multiplyScalar(-dist / 2));
  }

  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  CS.featureCounter++;
  CS.featureTree.push({
    type: 'extrude', name: `Extrude ${CS.objectCounter} (${sketch.name})`,
    id: `feat_${CS.featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideExtrudeDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name} from ${sketch.name}`);
}

export function showRevolveDialog() {
  if (CS.allSketches.length === 0) { updateStatusBar('No sketches available. Create a sketch first (Shift+S)'); return; }
  const dialog = document.getElementById('cad-revolve-dialog');
  if (!dialog) return;

  const profileSelect = document.getElementById('cad-revolve-profile');
  if (profileSelect) {
    profileSelect.innerHTML = CS.allSketches.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${s.entities.length} entities)</option>`).join('');
  }

  dialog.style.display = 'flex';
  updateRevolvePreview();
}

export function hideRevolveDialog() {
  const dialog = document.getElementById('cad-revolve-dialog');
  if (dialog) dialog.style.display = 'none';
  removeRevolvePreview();
}

export function updateRevolvePreview() {
  const THREE = CS.THREE;
  removeRevolvePreview();
  const profileSelect = document.getElementById('cad-revolve-profile');
  const angleInput = document.getElementById('cad-revolve-angle');
  if (!profileSelect || !angleInput) return;

  const sketch = CS.allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) return;

  const pts = buildLathePoints(sketch);
  if (!pts || pts.length < 2) return;

  const angle = THREE.MathUtils.degToRad(parseFloat(angleInput.value) || 360);
  const geometry = new THREE.LatheGeometry(pts, 32, 0, angle);
  const material = new THREE.MeshStandardMaterial({ color: 0x44ff88, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  CS.revolvePreviewMesh = new THREE.Mesh(geometry, material);
  CS.revolvePreviewMesh.userData.isHelper = true;
  CS.revolvePreviewMesh.position.copy(sketch.plane.origin);
  CS.scene.add(CS.revolvePreviewMesh);
}

function removeRevolvePreview() {
  if (CS.revolvePreviewMesh) {
    CS.scene.remove(CS.revolvePreviewMesh);
    CS.revolvePreviewMesh.geometry.dispose();
    CS.revolvePreviewMesh.material.dispose();
    CS.revolvePreviewMesh = null;
  }
}

export function executeRevolve() {
  const THREE = CS.THREE;
  const profileSelect = document.getElementById('cad-revolve-profile');
  const angleInput = document.getElementById('cad-revolve-angle');
  const axisSelect = document.getElementById('cad-revolve-axis');
  if (!profileSelect || !angleInput) return;

  const sketch = CS.allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) { updateStatusBar('No sketch selected'); return; }

  const pts = buildLathePoints(sketch);
  if (!pts || pts.length < 2) { updateStatusBar('Cannot build profile for revolve'); return; }

  const angle = THREE.MathUtils.degToRad(parseFloat(angleInput.value) || 360);
  const geometry = new THREE.LatheGeometry(pts, 32, 0, angle);
  const material = new THREE.MeshStandardMaterial({ color: getRandomPastelColor(), metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
  CS.objectCounter++;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Revolve_${CS.objectCounter}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'revolve';
  mesh.userData.isCADObject = true;
  mesh.userData.sketchId = sketch.id;
  mesh.position.copy(sketch.plane.origin);

  const axisVal = axisSelect ? axisSelect.value : 'y';
  if (axisVal === 'x') { mesh.rotation.z = Math.PI / 2; }
  else if (axisVal === 'z') { mesh.rotation.x = Math.PI / 2; }

  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  CS.featureCounter++;
  CS.featureTree.push({
    type: 'revolve', name: `Revolve ${CS.objectCounter} (${sketch.name})`,
    id: `feat_${CS.featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideRevolveDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${mesh.name} from ${sketch.name}`);
}

/* ===================== Export ===================== */

function disposeExportScene(exportScene) {
  exportScene.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

export function exportSTL() {
  const THREE = CS.THREE;
  if (CS.sceneObjects.length === 0) { updateStatusBar('No objects to export'); return; }
  const exporter = new CS.STLExporter();
  const exportScene = new THREE.Scene();
  CS.sceneObjects.forEach((o) => { if (o.visible) exportScene.add(o.clone()); });
  const result = exporter.parse(exportScene, { binary: true });
  downloadBlob(new Blob([result], { type: 'application/octet-stream' }), 'model.stl');
  disposeExportScene(exportScene);
  updateStatusBar('Exported STL');
}

export function exportOBJ() {
  const THREE = CS.THREE;
  if (CS.sceneObjects.length === 0) { updateStatusBar('No objects to export'); return; }
  const exporter = new CS.OBJExporter();
  const exportScene = new THREE.Scene();
  CS.sceneObjects.forEach((o) => { if (o.visible) exportScene.add(o.clone()); });
  const result = exporter.parse(exportScene);
  downloadBlob(new Blob([result], { type: 'text/plain' }), 'model.obj');
  disposeExportScene(exportScene);
  updateStatusBar('Exported OBJ');
}

export function exportGLTF() {
  const THREE = CS.THREE;
  if (CS.sceneObjects.length === 0) { updateStatusBar('No objects to export'); return; }
  const exporter = new CS.GLTFExporter();
  const exportScene = new THREE.Scene();
  CS.sceneObjects.forEach((o) => { if (o.visible) exportScene.add(o.clone()); });
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

/* ===================== Import ===================== */

export function importFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      if (ext === 'stl') {
        const loader = new CS.STLLoader();
        const geometry = loader.parse(e.target.result);
        addImportedGeometry(geometry, file.name);
      } else if (ext === 'obj') {
        const loader = new CS.OBJLoader();
        const obj = loader.parse(e.target.result);
        addImportedGroup(obj, file.name);
      } else if (ext === 'gltf' || ext === 'glb') {
        const loader = new CS.GLTFLoader();
        loader.parse(e.target.result, '', (gltf) => {
          addImportedGroup(gltf.scene, file.name);
        });
      }
    } catch (err) {
      updateStatusBar(`Import error: ${err.message}`);
    }
  };

  if (ext === 'stl' || ext === 'glb') { reader.readAsArrayBuffer(file); }
  else { reader.readAsText(file); }
}

function addImportedGeometry(geometry, filename) {
  const THREE = CS.THREE;
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  CS.objectCounter++;
  mesh.name = `Import_${CS.objectCounter}_${filename}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'imported';
  mesh.userData.isCADObject = true;

  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 10) { mesh.scale.multiplyScalar(5 / maxDim); }

  const center = box.getCenter(new THREE.Vector3());
  mesh.position.sub(center);
  mesh.position.y = 0;

  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Imported ${filename}`);
}

function addImportedGroup(group, filename) {
  CS.objectCounter++;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.type = 'imported';
      child.userData.isCADObject = true;
      child.name = child.name || `Import_${CS.objectCounter}_part`;
      CS.sceneObjects.push(child);
    }
  });

  CS.scene.add(group);
  const THREE = CS.THREE;
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 10) { group.scale.multiplyScalar(5 / maxDim); }

  updateSceneTree();
  updateStatusBar(`Imported ${filename}`);
}

/* ===================== Scene Tree ===================== */

export function updateSceneTree() {
  const tree = document.getElementById('cad-scene-tree');
  if (!tree) return;

  tree.innerHTML = '';
  CS.sceneObjects.forEach((obj) => {
    const item = document.createElement('div');
    item.className = 'cad-tree-item' + (obj === CS.selectedObject ? ' selected' : '');
    item.innerHTML = `
      <span class="tree-icon">${getObjectIcon(obj.userData.type)}</span>
      <span class="tree-name" title="${escapeHtml(obj.name)}">${escapeHtml(obj.name)}</span>
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

/* ===================== Feature Tree ===================== */

export function updateFeatureTree() {
  const tree = document.getElementById('cad-feature-tree');
  if (!tree) return;
  tree.innerHTML = '';

  for (const obj of CS.sceneObjects) {
    if (!CS.featureTree.find((f) => f.meshUuid === obj.uuid)) {
      CS.featureCounter++;
      CS.featureTree.push({
        type: 'primitive', name: obj.name, id: `feat_${CS.featureCounter}`,
        meshUuid: obj.uuid, suppressed: false,
      });
    }
  }

  CS.featureTree = CS.featureTree.filter((f) => {
    if (f.type === 'sketch') return true;
    if (!f.meshUuid) return true;
    return CS.sceneObjects.some((o) => o.uuid === f.meshUuid);
  });

  const featureIcons = { sketch: '✏', extrude: '⬆', revolve: '🔄', boolean: '⊕', primitive: '🔲' };

  CS.featureTree.forEach((feat, idx) => {
    const item = document.createElement('div');
    item.className = 'cad-tree-item cad-feature-item' + (feat.suppressed ? ' suppressed' : '');
    item.dataset.featureId = feat.id;
    item.innerHTML = `
      <span class="tree-icon">${featureIcons[feat.type] || '🔲'}</span>
      <span class="tree-name" title="${escapeHtml(feat.name)}">${escapeHtml(feat.name)}</span>
      <span class="tree-feat-actions">
        ${feat.type !== 'sketch' ? `<button class="cad-feat-btn" data-action="suppress" title="${feat.suppressed ? 'Unsuppress' : 'Suppress'}">${feat.suppressed ? '👁' : '🚫'}</button>` : ''}
        <button class="cad-feat-btn" data-action="delete" title="Delete">✕</button>
      </span>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.cad-feat-btn')) return;
      if (feat.meshUuid) {
        const mesh = CS.sceneObjects.find((o) => o.uuid === feat.meshUuid);
        if (mesh) selectObject(mesh);
      }
    });

    item.querySelectorAll('.cad-feat-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'suppress') {
          feat.suppressed = !feat.suppressed;
          const mesh = CS.sceneObjects.find((o) => o.uuid === feat.meshUuid);
          if (mesh) mesh.visible = !feat.suppressed;
          updateFeatureTree();
        } else if (action === 'delete') {
          if (feat.meshUuid) {
            const mesh = CS.sceneObjects.find((o) => o.uuid === feat.meshUuid);
            if (mesh) {
              if (mesh === CS.selectedObject) { CS.transformControls.detach(); CS.selectedObject = null; }
              CS.scene.remove(mesh);
              CS.sceneObjects = CS.sceneObjects.filter((o) => o !== mesh);
              const occtShape = CS.occtShapes.get(mesh.uuid);
              if (occtShape) {
                try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
                CS.occtShapes.delete(mesh.uuid);
              }
              if (mesh.geometry) mesh.geometry.dispose();
              if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
                else mesh.material.dispose();
              }
            }
          }
          if (feat.type === 'sketch') {
            CS.allSketches = CS.allSketches.filter((s) => s.id !== feat.sketchId);
          }
          CS.featureTree.splice(idx, 1);
          updateFeatureTree();
          updateSceneTree();
        }
      });
    });

    tree.appendChild(item);
  });
}

/* ===================== Properties Panel ===================== */

export function updatePropertiesPanel() {
  const THREE = CS.THREE;
  if (!CS.selectedObject) return;
  const obj = CS.selectedObject;

  setInput('cad-pos-x', obj.position.x.toFixed(3));
  setInput('cad-pos-y', obj.position.y.toFixed(3));
  setInput('cad-pos-z', obj.position.z.toFixed(3));
  setInput('cad-rot-x', THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1));
  setInput('cad-rot-y', THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1));
  setInput('cad-rot-z', THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1));
  setInput('cad-scl-x', obj.scale.x.toFixed(3));
  setInput('cad-scl-y', obj.scale.y.toFixed(3));
  setInput('cad-scl-z', obj.scale.z.toFixed(3));

  if (obj.material) {
    const colorInput = document.getElementById('cad-mat-color');
    if (colorInput) colorInput.value = '#' + obj.material.color.getHexString();
    setInput('cad-mat-metalness', obj.material.metalness);
    setInput('cad-mat-roughness', obj.material.roughness);
    setInput('cad-mat-opacity', obj.material.opacity);
    const wireChk = document.getElementById('cad-mat-wireframe');
    if (wireChk) wireChk.checked = obj.material.wireframe;
  }

  const nameInput = document.getElementById('cad-obj-name');
  if (nameInput) nameInput.value = obj.name;

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  setInput('cad-dim-w', size.x.toFixed(3));
  setInput('cad-dim-h', size.y.toFixed(3));
  setInput('cad-dim-d', size.z.toFixed(3));

  updateMeasurement(obj);
}

export function clearPropertiesPanel() {
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
  const THREE = CS.THREE;
  const measDiv = document.getElementById('cad-measurement');
  if (!measDiv || !obj) return;

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let html = `Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;

  const occtShape = CS.occtShapes.get(obj.uuid);
  if (occtShape && CS.occtEnabled) {
    const area = OCCT.getSurfaceArea(occtShape);
    const volume = OCCT.getVolume(occtShape);
    if (area >= 0) html += `<br>Area: ${area.toFixed(4)}`;
    if (volume > 0) html += ` | Vol: ${volume.toFixed(4)}`;
    html += `<br>Faces: ${OCCT.getFaceCount(occtShape)} | Edges: ${OCCT.getEdgeCount(occtShape)}`;
  }

  measDiv.innerHTML = html;
}

/* ===================== Select All ===================== */

export function selectAll() {
  CS.multiSelection = [...CS.sceneObjects];
  if (CS.sceneObjects.length > 0) selectObject(CS.sceneObjects[0]);
  CS.sceneObjects.forEach((o) => {
    if (o.material) {
      o.material._originalEmissive = o.material._originalEmissive ?? o.material.emissive.getHex();
      o.material.emissive.setHex(0x111122);
    }
  });
  updateStatusBar(`Selected all (${CS.sceneObjects.length})`);
  updateSceneTree();
}

/* ===================== Copy / Paste ===================== */

export function copySelected() {
  if (!CS.selectedObject) return;
  CS.clipboardData = {
    type: CS.selectedObject.userData.type,
    position: CS.selectedObject.position.clone(),
    rotation: CS.selectedObject.rotation.clone(),
    scale: CS.selectedObject.scale.clone(),
    color: CS.selectedObject.material ? CS.selectedObject.material.color.getHex() : 0xcccccc,
    metalness: CS.selectedObject.material ? CS.selectedObject.material.metalness : 0,
    roughness: CS.selectedObject.material ? CS.selectedObject.material.roughness : 0.5,
    geometry: CS.selectedObject.geometry.clone(),
  };
  updateStatusBar(`Copied ${CS.selectedObject.name}`);
}

export function pasteClipboard() {
  const THREE = CS.THREE;
  if (!CS.clipboardData) { updateStatusBar('Nothing to paste'); return; }
  const material = new THREE.MeshStandardMaterial({
    color: CS.clipboardData.color, metalness: CS.clipboardData.metalness, roughness: CS.clipboardData.roughness, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(CS.clipboardData.geometry.clone(), material);
  CS.objectCounter++;
  mesh.name = `${CS.clipboardData.type || 'Object'}_${CS.objectCounter}`;
  mesh.position.copy(CS.clipboardData.position).add(new THREE.Vector3(2, 0, 2));
  mesh.rotation.copy(CS.clipboardData.rotation);
  mesh.scale.copy(CS.clipboardData.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = CS.clipboardData.type;
  mesh.userData.isCADObject = true;
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateStatusBar(`Pasted ${mesh.name}`);
}

/* ===================== Clear Scene ===================== */

export function clearScene() {
  if (CS.sceneObjects.length === 0) return;
  pushUndo('clear');

  CS.sceneObjects.forEach((obj) => {
    CS.transformControls.detach();
    CS.scene.remove(obj);
    const occtShape = CS.occtShapes.get(obj.uuid);
    if (occtShape) {
      try { if (typeof occtShape.delete === 'function') occtShape.delete(); } catch { /* already freed */ }
      CS.occtShapes.delete(obj.uuid);
    }
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  });
  CS.sceneObjects = [];
  CS.selectedObject = null;
  CS.objectCounter = 0;
  CS.multiSelection = [];
  CS.featureTree = [];
  CS.featureCounter = 0;
  CS.allSketches = [];
  CS.sketchCounter = 0;

  clearPropertiesPanel();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar('Scene cleared');
}

/* ===================== Context Menu ===================== */

export function showContextMenu(x, y) {
  const menu = document.getElementById('cad-context-menu');
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('visible');

  menu.querySelectorAll('[data-action]').forEach((item) => {
    const needsSelection = ['delete', 'duplicate', 'focus'].includes(item.dataset.action);
    item.style.display = needsSelection && !CS.selectedObject ? 'none' : '';
  });

  const close = (e) => {
    if (!menu.contains(e.target)) { hideContextMenu(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

export function hideContextMenu() {
  const menu = document.getElementById('cad-context-menu');
  if (menu) menu.classList.remove('visible');
}

export function handleContextAction(action) {
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
      document.querySelector('.cad-right-panel')?.scrollTo({ top: 9999, behavior: 'smooth' });
      break;
    case 'properties':
      if (CS.selectedObject) normalToFace();
      break;
  }
}

function normalToFace() {
  vpNormalToFace();
}

export function initContextMenu() {
  const menu = document.getElementById('cad-context-menu');
  if (!menu) return;
  menu.querySelectorAll('[data-action]').forEach((item) => {
    item.addEventListener('click', () => handleContextAction(item.dataset.action));
  });
}

/* ===================== S-Key Radial Menu ===================== */

export function toggleRadialMenu(e) {
  if (CS.radialMenuVisible) { hideRadialMenu(); return; }
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
    html += `<button class="radial-item" data-idx="${i}" style="left:${x}px;top:${y}px" title="${escapeHtml(item.label)}">
      <span class="radial-icon">${item.icon}</span>
      <span class="radial-label">${escapeHtml(item.label)}</span>
    </button>`;
  });
  menu.innerHTML = html;
  menu.classList.add('visible');
  CS.radialMenuVisible = true;

  menu.querySelectorAll('.radial-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (items[idx]) items[idx].action();
      hideRadialMenu();
    });
  });

  const _close = (ev) => {
    if (!menu.contains(ev.target)) { hideRadialMenu(); document.removeEventListener('mousedown', _close); }
  };
  setTimeout(() => document.addEventListener('mousedown', _close), 0);
}

export function hideRadialMenu() {
  const menu = document.getElementById('cad-radial-menu');
  if (menu) menu.classList.remove('visible');
  CS.radialMenuVisible = false;
}

/* ===================== Measurement Tool ===================== */

const toMeasureUnit = (dist) => dist * (CS.UNIT_FACTORS[CS.measureUnit] || 1);
const formatMeasure = (dist) => `${toMeasureUnit(dist).toFixed(3)} ${CS.UNIT_LABELS[CS.measureUnit]}`;

export function toggleMeasurementTool() {
  CS.measurementMode = !CS.measurementMode;
  CS.measurePoints = [];
  clearMeasureLines();
  const btn = document.getElementById('cad-measure-tool');
  if (btn) btn.classList.toggle('active', CS.measurementMode);
  updateStatusBar(CS.measurementMode ? 'Measure: Click first point' : 'Measure OFF');
  if (!CS.measurementMode) {
    const overlay = document.getElementById('cad-measure-overlay');
    if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); }
    hideMeasureFloat();
  }
}

export function handleMeasureClick(e) {
  const THREE = CS.THREE;
  if (!CS.measurementMode) return;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, CS.camera);

  const hits = rc.intersectObjects(CS.sceneObjects.filter((o) => o.visible), true);
  let hitPoint;
  if (hits.length > 0) { hitPoint = hits[0].point.clone(); }
  else {
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (rc.ray.intersectPlane(groundPlane, pt)) { hitPoint = pt; }
    else { return; }
  }

  const snapped = computeAdvancedSnap(hitPoint);
  if (snapped) hitPoint = snapped.point;

  CS.measurePoints.push(hitPoint.clone());

  if (CS.measurePoints.length === 1) {
    updateStatusBar('Measure: Click second point');
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, depthTest: false })
    );
    dot.position.copy(hitPoint);
    dot.userData.isMeasure = true;
    dot.renderOrder = 999;
    CS.scene.add(dot);
    CS.measureLines.push(dot);
  } else if (CS.measurePoints.length === 2) {
    const p1 = CS.measurePoints[0];
    const p2 = CS.measurePoints[1];
    const distance = p1.distanceTo(p2);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 2, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.userData.isMeasure = true;
    line.renderOrder = 999;
    CS.scene.add(line);
    CS.measureLines.push(line);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, depthTest: false })
    );
    dot.position.copy(p2);
    dot.userData.isMeasure = true;
    dot.renderOrder = 999;
    CS.scene.add(dot);
    CS.measureLines.push(dot);

    showMeasureFloat(p1, p2, distance);
    drawMeasurementLabel(p1, p2, distance);

    const displayDist = formatMeasure(distance);
    updateStatusBar(`Distance: ${displayDist}`);

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

    CS.measurePoints = [];
  }
}

const showMeasureFloat = (p1, p2, distance) => {
  const floatEl = document.getElementById('cad-measure-float');
  if (!floatEl) return;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const mid = p1.clone().add(p2).multiplyScalar(0.5).project(CS.camera);
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
  const mid = p1.clone().add(p2).multiplyScalar(0.5).project(CS.camera);
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

export function bindMeasureUnitEvents() {
  const unitSel = document.getElementById('cad-measure-unit');
  if (unitSel) unitSel.addEventListener('change', () => {
    CS.measureUnit = unitSel.value;
    updateStatusBar(`Unit: ${CS.UNIT_LABELS[CS.measureUnit]}`);
  });
}

export function clearMeasureLines() {
  CS.measureLines.forEach((obj) => {
    CS.scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  CS.measureLines = [];
  hideMeasureFloat();
  const overlay = document.getElementById('cad-measure-overlay');
  if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); }
}

/* ===================== Advanced Snap System ===================== */

export const computeAdvancedSnap = (point) => {
  const THREE = CS.THREE;
  if (!CS.snapEnabled || !point) return null;
  const threshold = CS.snapGrid * 1.5;
  let best = null;
  let bestDist = threshold;

  const gx = Math.round(point.x / CS.snapGrid) * CS.snapGrid;
  const gz = Math.round(point.z / CS.snapGrid) * CS.snapGrid;
  const gridPt = new THREE.Vector3(gx, point.y, gz);
  const gDist = point.distanceTo(gridPt);
  if (gDist < bestDist) { best = { type: 'grid', point: gridPt }; bestDist = gDist; }

  if (CS.snapMidpointEnabled) {
    for (const obj of CS.sceneObjects) {
      if (!obj.visible || !obj.geometry) continue;
      const edges = getEdgeMidpoints(obj);
      for (const mid of edges) {
        const d = point.distanceTo(mid);
        if (d < bestDist) { best = { type: 'midpoint', point: mid }; bestDist = d; }
      }
    }
  }

  if (CS.snapCenterEnabled) {
    for (const obj of CS.sceneObjects) {
      if (!obj.visible) continue;
      const center = getObjectCenter(obj);
      if (center) {
        const d = point.distanceTo(center);
        if (d < bestDist) { best = { type: 'center', point: center }; bestDist = d; }
      }
    }
  }

  if (CS.snapIntersectionEnabled) {
    for (const obj of CS.sceneObjects) {
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
        if (d < bestDist) { best = { type: 'intersection', point: c }; bestDist = d; }
      }
    }
  }

  CS.lastSnapInfo = best;
  return best;
};

const getEdgeMidpoints = (obj) => {
  const THREE = CS.THREE;
  const box = new THREE.Box3().setFromObject(obj);
  const min = box.min;
  const max = box.max;
  const midX = (min.x + max.x) / 2;
  const midY = (min.y + max.y) / 2;
  const midZ = (min.z + max.z) / 2;
  return [
    new THREE.Vector3(midX, min.y, min.z), new THREE.Vector3(midX, min.y, max.z),
    new THREE.Vector3(min.x, min.y, midZ), new THREE.Vector3(max.x, min.y, midZ),
    new THREE.Vector3(midX, max.y, min.z), new THREE.Vector3(midX, max.y, max.z),
    new THREE.Vector3(min.x, max.y, midZ), new THREE.Vector3(max.x, max.y, midZ),
    new THREE.Vector3(min.x, midY, min.z), new THREE.Vector3(max.x, midY, min.z),
    new THREE.Vector3(min.x, midY, max.z), new THREE.Vector3(max.x, midY, max.z),
  ];
};

const getObjectCenter = (obj) => {
  const THREE = CS.THREE;
  if (!obj.userData || !obj.userData.type) return null;
  const type = obj.userData.type;
  if (['sphere', 'cylinder', 'cone', 'torus'].includes(type)) { return obj.position.clone(); }
  const box = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return center;
};

export const showSnapIndicator = (snapInfo, viewport) => {
  const indicator = document.getElementById('cad-snap-indicator');
  if (!indicator || !snapInfo) { hideSnapIndicator(); return; }

  const rect = viewport.getBoundingClientRect();
  const projected = snapInfo.point.clone().project(CS.camera);
  const sx = (projected.x * 0.5 + 0.5) * rect.width;
  const sy = (-projected.y * 0.5 + 0.5) * rect.height;

  const dot = indicator.querySelector('.cad-snap-dot');
  const label = indicator.querySelector('.cad-snap-label');
  if (dot) { dot.className = 'cad-snap-dot'; dot.classList.add(`snap-${snapInfo.type}`); }
  if (label) {
    const labels = { grid: 'Grid', midpoint: 'Midpoint', center: 'Center', intersection: 'Vertex' };
    label.textContent = labels[snapInfo.type] || '';
  }
  indicator.style.left = sx + 'px';
  indicator.style.top = sy + 'px';
  indicator.style.display = 'flex';
};

export const hideSnapIndicator = () => {
  const indicator = document.getElementById('cad-snap-indicator');
  if (indicator) indicator.style.display = 'none';
};

/* ===================== Section / Clipping Plane ===================== */

export function toggleSectionView() {
  const THREE = CS.THREE;
  CS.sectionActive = !CS.sectionActive;
  const controls = document.getElementById('cad-clip-controls');
  const btn = document.getElementById('cad-section-tool');

  if (CS.sectionActive) {
    if (!CS.clippingPlane) { CS.clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); }
    CS.renderer.localClippingEnabled = true;
    CS.sceneObjects.forEach((o) => {
      if (o.material) { o.material.clippingPlanes = [CS.clippingPlane]; o.material.needsUpdate = true; }
    });
    if (!CS.clippingHelper) {
      const planeGeo = new THREE.PlaneGeometry(40, 40);
      const planeMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
      CS.clippingHelper = new THREE.Mesh(planeGeo, planeMat);
      CS.clippingHelper.userData.isHelper = true;
      CS.scene.add(CS.clippingHelper);
    }
    CS.clippingHelper.visible = true;
    if (controls) controls.style.display = 'block';
    if (btn) btn.classList.add('active');
    updateStatusBar('Section View ON');
  } else {
    CS.renderer.localClippingEnabled = false;
    CS.sceneObjects.forEach((o) => {
      if (o.material) { o.material.clippingPlanes = []; o.material.needsUpdate = true; }
    });
    if (CS.clippingHelper) CS.clippingHelper.visible = false;
    if (controls) controls.style.display = 'none';
    if (btn) btn.classList.remove('active');
    updateStatusBar('Section View OFF');
  }
}

export function updateClippingPlane() {
  const THREE = CS.THREE;
  if (!CS.clippingPlane) return;
  const axis = document.getElementById('cad-clip-axis');
  const pos = document.getElementById('cad-clip-pos');
  const flip = document.getElementById('cad-clip-flip');
  if (!axis || !pos) return;

  const a = axis.value;
  const p = parseFloat(pos.value);
  const f = flip && flip.checked ? -1 : 1;

  const normals = { x: new THREE.Vector3(f, 0, 0), y: new THREE.Vector3(0, f, 0), z: new THREE.Vector3(0, 0, f) };
  CS.clippingPlane.normal.copy(normals[a] || normals.y);
  CS.clippingPlane.constant = -p * f;

  if (CS.clippingHelper) {
    CS.clippingHelper.position.set(a === 'x' ? p : 0, a === 'y' ? p : 0, a === 'z' ? p : 0);
    if (a === 'x') { CS.clippingHelper.rotation.set(0, Math.PI / 2, 0); }
    else if (a === 'y') { CS.clippingHelper.rotation.set(Math.PI / 2, 0, 0); }
    else { CS.clippingHelper.rotation.set(0, 0, 0); }
  }
}

/* ===================== OCCT B-Rep Engine Integration ===================== */

export async function initOCCTEngine() {
  const progressBar = document.getElementById('cad-occt-progress');
  const progressFill = document.getElementById('cad-occt-progress-fill');
  const progressText = document.getElementById('cad-occt-progress-text');
  const statusIndicator = document.getElementById('cad-brep-status');

  if (progressBar) progressBar.style.display = 'flex';
  if (statusIndicator) { statusIndicator.textContent = t('cad.loadingBrep'); statusIndicator.className = 'cad-brep-status loading'; }

  const success = await OCCT.loadOCCT((pct, msg) => {
    if (progressFill && pct >= 0) progressFill.style.width = pct + '%';
    if (progressText) progressText.textContent = msg;
  });

  if (progressBar) { setTimeout(() => { progressBar.style.display = 'none'; }, 1000); }

  if (success) {
    CS.occtEnabled = true;
    if (statusIndicator) { statusIndicator.textContent = t('cad.brepActive'); statusIndicator.className = 'cad-brep-status active'; }
    document.querySelectorAll('.cad-occt-only').forEach((btn) => { btn.disabled = false; btn.title = btn.dataset.occtTitle || btn.title; });
    updateStatusBar('OpenCascade B-Rep engine loaded');
  } else {
    CS.occtEnabled = false;
    if (statusIndicator) { statusIndicator.textContent = t('cad.meshFallback'); statusIndicator.className = 'cad-brep-status fallback'; }
    updateStatusBar('B-Rep engine unavailable — using mesh mode');
  }
}

export function occtShapeToMesh(topoShape, color) {
  const THREE = CS.THREE;
  if (!topoShape || !THREE) return null;
  const data = OCCT.tessellate(topoShape, 0.1);
  if (!data) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  if (data.indices.length > 0) { geometry.setIndex(new THREE.BufferAttribute(data.indices, 1)); }
  geometry.computeBoundingBox();

  const material = new THREE.MeshStandardMaterial({ color: color || getRandomPastelColor(), metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (data.edges.length > 0) { mesh.userData.occtEdges = data.edges; }
  return mesh;
}

export function createPrimitiveOCCT(type) {
  if (!CS.occtEnabled) { createPrimitive(type); return; }

  let shape = null;
  let name = '';
  CS.objectCounter++;

  switch (type) {
    case 'box': shape = OCCT.createBox(2, 2, 2); name = `Box_${CS.objectCounter}`; break;
    case 'sphere': shape = OCCT.createSphere(1); name = `Sphere_${CS.objectCounter}`; break;
    case 'cylinder': shape = OCCT.createCylinder(1, 2); name = `Cylinder_${CS.objectCounter}`; break;
    case 'cone': shape = OCCT.createCone(1, 0, 2); name = `Cone_${CS.objectCounter}`; break;
    case 'torus': shape = OCCT.createTorus(1, 0.4); name = `Torus_${CS.objectCounter}`; break;
    default: createPrimitive(type); return;
  }

  if (!shape) { CS.objectCounter--; createPrimitive(type); return; }

  const mesh = occtShapeToMesh(shape);
  if (!mesh) { CS.objectCounter--; createPrimitive(type); return; }

  mesh.name = name;
  mesh.position.y = type === 'plane' ? 0.01 : 1;
  mesh.userData.type = type;
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  CS.occtShapes.set(mesh.uuid, shape);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created ${name} (B-Rep)`);
}

export function booleanOperationOCCT(op) {
  if (CS.sceneObjects.length < 2) { updateStatusBar('Need at least 2 objects for boolean operation'); return; }
  if (!CS.selectedObject) { updateStatusBar('Select the target object first'); return; }

  let second = null;
  if (CS.multiSelection.length >= 2) { second = CS.multiSelection.find((o) => o !== CS.selectedObject) || null; }
  if (!second) {
    const otherObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject);
    if (otherObjects.length === 0) return;
    if (otherObjects.length === 1) { second = otherObjects[0]; }
    else {
      let minDist = Infinity;
      for (const o of otherObjects) {
        const d = CS.selectedObject.position.distanceTo(o.position);
        if (d < minDist) { minDist = d; second = o; }
      }
    }
  }
  if (!second) return;

  const shapeA = CS.occtShapes.get(CS.selectedObject.uuid);
  const shapeB = CS.occtShapes.get(second.uuid);

  if (!CS.occtEnabled || !shapeA || !shapeB) { booleanOperation(op); return; }

  pushUndo('boolean');

  let resultShape = null;
  try {
    if (op === 'union') resultShape = OCCT.booleanUnion(shapeA, shapeB);
    else if (op === 'subtract') resultShape = OCCT.booleanSubtract(shapeA, shapeB);
    else if (op === 'intersect') resultShape = OCCT.booleanIntersect(shapeA, shapeB);
  } catch (e) { updateStatusBar(`B-Rep boolean ${op} failed, using mesh fallback`); booleanOperation(op); return; }

  if (!resultShape) { updateStatusBar(`B-Rep boolean ${op} failed, using mesh fallback`); booleanOperation(op); return; }

  const mesh = occtShapeToMesh(resultShape, CS.selectedObject.material ? CS.selectedObject.material.color.clone() : undefined);
  if (!mesh) { booleanOperation(op); return; }

  CS.objectCounter++;
  const capOp = op.charAt(0).toUpperCase() + op.slice(1);
  mesh.name = `${capOp}_${CS.objectCounter}`;
  mesh.userData.type = op;
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  OCCT.deleteShape(shapeA);
  OCCT.deleteShape(shapeB);
  CS.occtShapes.delete(CS.selectedObject.uuid);
  CS.occtShapes.delete(second.uuid);
  if (CS.selectedObject.geometry) CS.selectedObject.geometry.dispose();
  if (CS.selectedObject.material) CS.selectedObject.material.dispose();
  if (second.geometry) second.geometry.dispose();
  if (second.material) second.material.dispose();
  CS.scene.remove(CS.selectedObject);
  CS.scene.remove(second);
  CS.sceneObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject && o !== second);

  CS.occtShapes.set(mesh.uuid, resultShape);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Boolean ${op} completed (B-Rep)`);
}

/* ===================== Fillet / Chamfer / Shell ===================== */

export function showFilletDialog() {
  if (!CS.occtEnabled) { updateStatusBar('Fillet requires B-Rep engine (not loaded)'); return; }
  if (!CS.selectedObject || !CS.occtShapes.has(CS.selectedObject.uuid)) { updateStatusBar('Select a B-Rep object to fillet'); return; }
  const dialog = document.getElementById('cad-fillet-dialog');
  if (dialog) {
    const edgeCount = OCCT.getEdgeCount(CS.occtShapes.get(CS.selectedObject.uuid));
    const infoEl = dialog.querySelector('.cad-fillet-info');
    if (infoEl) infoEl.textContent = `${edgeCount} ${t('cad.edgesAvailable')}`;
    dialog.style.display = 'flex';
  }
}

export function executeFilletFromDialog() {
  const radiusInput = document.getElementById('cad-fillet-radius');
  const radius = parseFloat(radiusInput?.value) || 0.2;
  const shape = CS.occtShapes.get(CS.selectedObject?.uuid);
  if (!shape) return;

  pushUndo('fillet');
  const result = OCCT.filletEdges(shape, radius, []);
  if (!result) { updateStatusBar('Fillet failed — try a smaller radius'); return; }

  const mesh = occtShapeToMesh(result, CS.selectedObject.material?.color?.clone());
  if (!mesh) return;

  CS.objectCounter++;
  mesh.name = `Fillet_${CS.objectCounter}`;
  mesh.position.copy(CS.selectedObject.position);
  mesh.rotation.copy(CS.selectedObject.rotation);
  mesh.scale.copy(CS.selectedObject.scale);
  mesh.userData.type = 'fillet';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  OCCT.deleteShape(shape);
  CS.occtShapes.delete(CS.selectedObject.uuid);
  if (CS.selectedObject.geometry) CS.selectedObject.geometry.dispose();
  if (CS.selectedObject.material) CS.selectedObject.material.dispose();
  CS.scene.remove(CS.selectedObject);
  CS.sceneObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject);

  CS.occtShapes.set(mesh.uuid, result);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();

  const dialog = document.getElementById('cad-fillet-dialog');
  if (dialog) dialog.style.display = 'none';
  updateStatusBar(`Applied fillet (R=${radius})`);
}

export function showChamferDialog() {
  if (!CS.occtEnabled) { updateStatusBar('Chamfer requires B-Rep engine (not loaded)'); return; }
  if (!CS.selectedObject || !CS.occtShapes.has(CS.selectedObject.uuid)) { updateStatusBar('Select a B-Rep object to chamfer'); return; }
  const dialog = document.getElementById('cad-chamfer-dialog');
  if (dialog) {
    const edgeCount = OCCT.getEdgeCount(CS.occtShapes.get(CS.selectedObject.uuid));
    const infoEl = dialog.querySelector('.cad-chamfer-info');
    if (infoEl) infoEl.textContent = `${edgeCount} ${t('cad.edgesAvailable')}`;
    dialog.style.display = 'flex';
  }
}

export function executeChamferFromDialog() {
  const distInput = document.getElementById('cad-chamfer-dist');
  const distance = parseFloat(distInput?.value) || 0.2;
  const shape = CS.occtShapes.get(CS.selectedObject?.uuid);
  if (!shape) return;

  pushUndo('chamfer');
  const result = OCCT.chamferEdges(shape, distance, []);
  if (!result) { updateStatusBar('Chamfer failed — try a smaller distance'); return; }

  const mesh = occtShapeToMesh(result, CS.selectedObject.material?.color?.clone());
  if (!mesh) return;

  CS.objectCounter++;
  mesh.name = `Chamfer_${CS.objectCounter}`;
  mesh.position.copy(CS.selectedObject.position);
  mesh.rotation.copy(CS.selectedObject.rotation);
  mesh.scale.copy(CS.selectedObject.scale);
  mesh.userData.type = 'chamfer';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  OCCT.deleteShape(shape);
  CS.occtShapes.delete(CS.selectedObject.uuid);
  if (CS.selectedObject.geometry) CS.selectedObject.geometry.dispose();
  if (CS.selectedObject.material) CS.selectedObject.material.dispose();
  CS.scene.remove(CS.selectedObject);
  CS.sceneObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject);

  CS.occtShapes.set(mesh.uuid, result);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();

  const dialog = document.getElementById('cad-chamfer-dialog');
  if (dialog) dialog.style.display = 'none';
  updateStatusBar(`Applied chamfer (D=${distance})`);
}

export function showShellDialog() {
  if (!CS.occtEnabled) { updateStatusBar('Shell requires B-Rep engine (not loaded)'); return; }
  if (!CS.selectedObject || !CS.occtShapes.has(CS.selectedObject.uuid)) { updateStatusBar('Select a B-Rep object to shell'); return; }
  const dialog = document.getElementById('cad-shell-dialog');
  if (dialog) {
    const faceCount = OCCT.getFaceCount(CS.occtShapes.get(CS.selectedObject.uuid));
    const infoEl = dialog.querySelector('.cad-shell-info');
    if (infoEl) infoEl.textContent = `${faceCount} ${t('cad.facesAvailable')}`;
    dialog.style.display = 'flex';
  }
}

export function executeShellFromDialog() {
  const thicknessInput = document.getElementById('cad-shell-thickness');
  const faceIdxInput = document.getElementById('cad-shell-face');
  const thickness = parseFloat(thicknessInput?.value) || 0.2;
  const faceIdx = parseInt(faceIdxInput?.value) || 0;
  const shape = CS.occtShapes.get(CS.selectedObject?.uuid);
  if (!shape) return;

  pushUndo('shell');
  const result = OCCT.shellShape(shape, thickness, [faceIdx]);
  if (!result) { updateStatusBar('Shell failed — try different parameters'); return; }

  const mesh = occtShapeToMesh(result, CS.selectedObject.material?.color?.clone());
  if (!mesh) return;

  CS.objectCounter++;
  mesh.name = `Shell_${CS.objectCounter}`;
  mesh.position.copy(CS.selectedObject.position);
  mesh.rotation.copy(CS.selectedObject.rotation);
  mesh.scale.copy(CS.selectedObject.scale);
  mesh.userData.type = 'shell';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;

  OCCT.deleteShape(shape);
  CS.occtShapes.delete(CS.selectedObject.uuid);
  if (CS.selectedObject.geometry) CS.selectedObject.geometry.dispose();
  if (CS.selectedObject.material) CS.selectedObject.material.dispose();
  CS.scene.remove(CS.selectedObject);
  CS.sceneObjects = CS.sceneObjects.filter((o) => o !== CS.selectedObject);

  CS.occtShapes.set(mesh.uuid, result);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  updateSceneTree();
  updateFeatureTree();

  const dialog = document.getElementById('cad-shell-dialog');
  if (dialog) dialog.style.display = 'none';
  updateStatusBar(`Applied shell (T=${thickness})`);
}

/* ===================== STEP Export / Import ===================== */

export function exportSTEPFile() {
  if (!CS.occtEnabled) { updateStatusBar('STEP export requires B-Rep engine'); return; }
  const shapes = [];
  CS.sceneObjects.forEach((o) => { if (o.visible && CS.occtShapes.has(o.uuid)) shapes.push(CS.occtShapes.get(o.uuid)); });
  if (shapes.length === 0) { updateStatusBar('No B-Rep objects to export. Use OCCT primitives for STEP export.'); return; }

  const stepContent = OCCT.exportSTEP(shapes);
  if (stepContent) {
    downloadBlob(new Blob([stepContent], { type: 'application/step' }), 'model.step');
    updateStatusBar(`Exported ${shapes.length} shape(s) to STEP`);
  } else { updateStatusBar('STEP export failed'); }
}

export function importSTEPFile() {
  if (!CS.occtEnabled) { updateStatusBar('STEP import requires B-Rep engine'); return; }
  const input = document.getElementById('cad-step-import-input');
  if (input) input.click();
}

export function handleSTEPImport(file) {
  const THREE = CS.THREE;
  if (!CS.occtEnabled) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const shape = OCCT.importSTEP(e.target.result);
      if (!shape) { updateStatusBar('Failed to read STEP file'); return; }

      const mesh = occtShapeToMesh(shape);
      if (!mesh) { updateStatusBar('Failed to tessellate STEP geometry'); return; }

      CS.objectCounter++;
      mesh.name = `STEP_${CS.objectCounter}_${file.name}`;
      mesh.userData.type = 'step-import';
      mesh.userData.isCADObject = true;
      mesh.userData.isBRep = true;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = maxDim > 10 ? 5 / maxDim : 1;
      if (scaleFactor !== 1) mesh.scale.multiplyScalar(scaleFactor);

      mesh.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(mesh);
      const center = scaledBox.getCenter(new THREE.Vector3());
      mesh.position.sub(center);
      mesh.position.y = 0;

      CS.occtShapes.set(mesh.uuid, shape);
      CS.scene.add(mesh);
      CS.sceneObjects.push(mesh);
      selectObject(mesh);
      pushUndo('add', mesh);
      updateSceneTree();
      updateFeatureTree();
      updateStatusBar(`Imported STEP: ${file.name} (B-Rep)`);
    } catch (err) { updateStatusBar(`STEP import error: ${err.message}`); }
  };
  reader.readAsText(file);
}

/* ===================== OCCT-enhanced Extrude / Revolve ===================== */

export function executeExtrudeOCCT() {
  if (!CS.occtEnabled) { executeExtrude(); return; }

  const profileSelect = document.getElementById('cad-extrude-profile');
  const distInput = document.getElementById('cad-extrude-dist');
  const symCheck = document.getElementById('cad-extrude-symmetric');
  if (!profileSelect || !distInput) return;

  const sketch = CS.allSketches.find((s) => s.id === profileSelect.value);
  if (!sketch) { updateStatusBar('No sketch selected'); return; }

  const dist = parseFloat(distInput.value) || 5;
  const symmetric = symCheck ? symCheck.checked : false;

  const planeData = {
    origin: { x: sketch.plane.origin.x, y: sketch.plane.origin.y, z: sketch.plane.origin.z },
    normal: { x: sketch.plane.normal.x, y: sketch.plane.normal.y, z: sketch.plane.normal.z },
    right: { x: sketch.plane.right.x, y: sketch.plane.right.y, z: sketch.plane.right.z },
    up: { x: sketch.plane.up.x, y: sketch.plane.up.y, z: sketch.plane.up.z },
  };

  const wire = OCCT.createSketchWire(sketch.entities, planeData);
  if (!wire) { executeExtrude(); return; }

  const direction = { x: sketch.plane.normal.x, y: sketch.plane.normal.y, z: sketch.plane.normal.z };
  const shape = OCCT.extrudeShape(wire, direction, dist, symmetric);
  if (!shape) { executeExtrude(); return; }

  const mesh = occtShapeToMesh(shape);
  if (!mesh) { executeExtrude(); return; }

  CS.objectCounter++;
  mesh.name = `Extrude_${CS.objectCounter}`;
  mesh.userData.type = 'extrude';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;
  mesh.userData.sketchId = sketch.id;

  CS.occtShapes.set(mesh.uuid, shape);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  CS.featureCounter++;
  CS.featureTree.push({
    type: 'extrude', name: `Extrude ${CS.objectCounter} (${sketch.name}) [B-Rep]`,
    id: `feat_${CS.featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideExtrudeDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created B-Rep extrude from ${sketch.name}`);
}

export function executeRevolveOCCT() {
  if (!CS.occtEnabled) { executeRevolve(); return; }

  const profileSelect = document.getElementById('cad-revolve-profile');
  const angleInput = document.getElementById('cad-revolve-angle');
  const axisSelect = document.getElementById('cad-revolve-axis');
  if (!profileSelect || !angleInput) return;

  const sketch = CS.allSketches.find((s) => s.id === profileSelect.value);
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
  if (!wire) { executeRevolve(); return; }

  const axisDirs = {
    x: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } },
    y: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 1, z: 0 } },
    z: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } },
  };

  const shape = OCCT.revolveShape(wire, axisDirs[axisVal] || axisDirs.y, angleDeg);
  if (!shape) { executeRevolve(); return; }

  const mesh = occtShapeToMesh(shape);
  if (!mesh) { executeRevolve(); return; }

  CS.objectCounter++;
  mesh.name = `Revolve_${CS.objectCounter}`;
  mesh.userData.type = 'revolve';
  mesh.userData.isCADObject = true;
  mesh.userData.isBRep = true;
  mesh.userData.sketchId = sketch.id;

  CS.occtShapes.set(mesh.uuid, shape);
  CS.scene.add(mesh);
  CS.sceneObjects.push(mesh);
  selectObject(mesh);
  pushUndo('add', mesh);

  CS.featureCounter++;
  CS.featureTree.push({
    type: 'revolve', name: `Revolve ${CS.objectCounter} (${sketch.name}) [B-Rep]`,
    id: `feat_${CS.featureCounter}`, meshUuid: mesh.uuid, sketchId: sketch.id, suppressed: false,
  });

  hideRevolveDialog();
  updateSceneTree();
  updateFeatureTree();
  updateStatusBar(`Created B-Rep revolve from ${sketch.name}`);
}
