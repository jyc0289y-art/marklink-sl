// OfficeLink SL — CAD Sketch Mode (2D sketch entities, constraints, dimensions)

import CS from './cad-state.js';
import { animateCamera, updateStatusBar } from './cad-viewport.js';

// Late-bound helpers — registered by orchestrator to break circular dependency
const updateFeatureTree = () => { if (CS._updateFeatureTree) CS._updateFeatureTree(); };
const updateSceneTree = () => { if (CS._updateSceneTree) CS._updateSceneTree(); };

/* ===================== Enter / Exit Sketch Mode ===================== */

export function enterSketchMode(planeName) {
  const THREE = CS.THREE;
  if (CS.sketchMode) return;
  CS.sketchMode = true;
  CS.sketchEntities = [];
  CS.sketchDimensions = [];
  CS.sketchConstraints = [];
  CS.sketchTempPoints = [];
  CS.sketchDrawing = false;
  CS.sketchTool = 'line';
  CS.sketchCounter++;

  const planes = {
    XY: { normal: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0) },
    XZ: { normal: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) },
    YZ: { normal: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(0, 0, 1) },
  };
  const p = planes[planeName] || planes.XY;
  CS.sketchPlane = { normal: p.normal.clone(), up: p.up.clone(), right: p.right.clone(), origin: new THREE.Vector3(0, 0, 0), name: planeName };

  const dist = 15;
  const endPos = CS.sketchPlane.normal.clone().multiplyScalar(dist);
  animateCamera(CS.camera.position.clone(), endPos, CS.sketchPlane.origin, 400);
  CS.orbitControls.target.copy(CS.sketchPlane.origin);

  const sketchTb = document.getElementById('cad-sketch-toolbar');
  if (sketchTb) sketchTb.style.display = 'flex';
  document.querySelectorAll('.cad-toolbar > .cad-toolbar-group:not(.cad-sketch-toolbar):not(#cad-sketch-group)').forEach((g) => {
    g.style.opacity = '0.3';
    g.style.pointerEvents = 'none';
  });

  showSketchGrid();
  setupSketchOverlay();

  updateStatusBar(`Sketch Mode — ${planeName} plane | L=Line C=Circle R=Rect A=Arc P=Polygon D=Dim | Esc=Finish`);
  updateFeatureTree();
}

export function exitSketchMode() {
  if (!CS.sketchMode) return;
  CS.sketchMode = false;

  if (CS.sketchEntities.length > 0) {
    const sketchId = `sketch_${CS.sketchCounter}`;
    CS.allSketches.push({
      id: sketchId,
      name: `Sketch ${CS.sketchCounter}`,
      plane: { ...CS.sketchPlane, normal: CS.sketchPlane.normal.clone(), up: CS.sketchPlane.up.clone(), right: CS.sketchPlane.right.clone(), origin: CS.sketchPlane.origin.clone() },
      entities: JSON.parse(JSON.stringify(CS.sketchEntities)),
      dimensions: JSON.parse(JSON.stringify(CS.sketchDimensions)),
      constraints: JSON.parse(JSON.stringify(CS.sketchConstraints)),
    });
    CS.featureCounter++;
    CS.featureTree.push({ type: 'sketch', name: `Sketch ${CS.sketchCounter}`, id: `feat_${CS.featureCounter}`, sketchId, suppressed: false });
    updateStatusBar(`Sketch ${CS.sketchCounter} saved (${CS.sketchEntities.length} entities)`);
  }

  const sketchTb = document.getElementById('cad-sketch-toolbar');
  if (sketchTb) sketchTb.style.display = 'none';
  document.querySelectorAll('.cad-toolbar > .cad-toolbar-group:not(.cad-sketch-toolbar):not(#cad-sketch-group)').forEach((g) => {
    g.style.opacity = '1';
    g.style.pointerEvents = 'auto';
  });

  hideSketchGrid();

  const overlay = document.getElementById('cad-sketch-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  CS.sketchDrawing = false;
  CS.sketchTempPoints = [];
  updateFeatureTree();
  updateSceneTree();
}

/* ===================== Sketch Grid ===================== */

function showSketchGrid() {
  const THREE = CS.THREE;
  if (CS.sketchGridMesh) { CS.scene.remove(CS.sketchGridMesh); CS.sketchGridMesh.geometry.dispose(); CS.sketchGridMesh.material.dispose(); }
  const size = 20;
  const gridGeo = new THREE.PlaneGeometry(size, size);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x3366cc, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  CS.sketchGridMesh = new THREE.Mesh(gridGeo, gridMat);
  CS.sketchGridMesh.userData.isHelper = true;

  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), CS.sketchPlane.normal);
  CS.sketchGridMesh.quaternion.copy(q);
  CS.sketchGridMesh.position.copy(CS.sketchPlane.origin);
  CS.scene.add(CS.sketchGridMesh);
}

export function hideSketchGrid() {
  if (CS.sketchGridMesh) {
    CS.scene.remove(CS.sketchGridMesh);
    CS.sketchGridMesh.geometry.dispose();
    CS.sketchGridMesh.material.dispose();
    CS.sketchGridMesh = null;
  }
}

/* ===================== Sketch Overlay ===================== */

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

/* ===================== Coordinate Conversion ===================== */

function screenToSketchCoords(clientX, clientY) {
  const THREE = CS.THREE;
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, CS.camera);
  const plane3 = new THREE.Plane();
  plane3.setFromNormalAndCoplanarPoint(CS.sketchPlane.normal, CS.sketchPlane.origin);
  const intersection = new THREE.Vector3();
  const hit = rc.ray.intersectPlane(plane3, intersection);
  if (!hit) return { x: 0, y: 0 };

  const local = intersection.clone().sub(CS.sketchPlane.origin);
  let x = local.dot(CS.sketchPlane.right);
  let y = local.dot(CS.sketchPlane.up);

  if (CS.sketchGridSnap) {
    x = Math.round(x / CS.sketchGridSize) * CS.sketchGridSize;
    y = Math.round(y / CS.sketchGridSize) * CS.sketchGridSize;
  }

  if (CS.sketchPointSnap) {
    const snapDist = 0.3;
    for (const ent of CS.sketchEntities) {
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

function sketchToScreen(sx, sy) {
  const p3d = CS.sketchPlane.origin.clone()
    .add(CS.sketchPlane.right.clone().multiplyScalar(sx))
    .add(CS.sketchPlane.up.clone().multiplyScalar(sy));
  const projected = p3d.project(CS.camera);
  const viewport = document.querySelector('.cad-viewport');
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

/* ===================== Mouse Handlers ===================== */

function handleSketchMouseDown(e) {
  if (!CS.sketchMode) return;
  if (e.button !== 0) return;
  const pos = screenToSketchCoords(e.clientX, e.clientY);

  if (CS.sketchTool === 'dimension') {
    handleDimensionClick(pos);
    return;
  }

  if (CS.sketchTool === 'line') {
    if (!CS.sketchDrawing || CS.sketchTempPoints.length === 0) {
      CS.sketchTempPoints = [pos];
      CS.sketchDrawing = true;
    }
  } else if (CS.sketchTool === 'circle') {
    CS.sketchTempPoints = [pos];
    CS.sketchDrawing = true;
  } else if (CS.sketchTool === 'rect') {
    CS.sketchTempPoints = [pos];
    CS.sketchDrawing = true;
  } else if (CS.sketchTool === 'arc') {
    if (!CS.sketchDrawing) {
      CS.sketchTempPoints = [pos];
      CS.sketchDrawing = true;
    }
  } else if (CS.sketchTool === 'polygon') {
    CS.sketchTempPoints = [pos];
    CS.sketchDrawing = true;
  }
}

function handleSketchMouseMove(e) {
  if (!CS.sketchMode) return;
  const pos = screenToSketchCoords(e.clientX, e.clientY);
  renderSketchOverlay(pos);
}

function handleSketchMouseUp(e) {
  if (!CS.sketchMode || !CS.sketchDrawing) return;
  if (e.button !== 0) return;
  const pos = screenToSketchCoords(e.clientX, e.clientY);

  if (CS.sketchTool === 'line') {
    CS.sketchTempPoints.push(pos);
    if (CS.sketchTempPoints.length >= 2) {
      const p1 = CS.sketchTempPoints[CS.sketchTempPoints.length - 2];
      const p2 = CS.sketchTempPoints[CS.sketchTempPoints.length - 1];
      if (Math.abs(p1.x - p2.x) > 0.01 || Math.abs(p1.y - p2.y) > 0.01) {
        CS.sketchEntityIdCounter++;
        CS.sketchEntities.push({ type: 'line', points: [p1, p2], id: CS.sketchEntityIdCounter });
        applyAutoConstraints(CS.sketchEntities[CS.sketchEntities.length - 1]);
      }
      CS.sketchTempPoints = [CS.sketchTempPoints[CS.sketchTempPoints.length - 1]];
    }
  } else if (CS.sketchTool === 'arc') {
    CS.sketchTempPoints.push(pos);
    if (CS.sketchTempPoints.length >= 3) {
      CS.sketchEntityIdCounter++;
      CS.sketchEntities.push({
        type: 'arc',
        points: [CS.sketchTempPoints[0], CS.sketchTempPoints[1], CS.sketchTempPoints[2]],
        id: CS.sketchEntityIdCounter,
      });
      CS.sketchTempPoints = [];
      CS.sketchDrawing = false;
    }
  } else if (CS.sketchTool === 'circle') {
    const center = CS.sketchTempPoints[0];
    const radius = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
    if (radius > 0.05) {
      CS.sketchEntityIdCounter++;
      CS.sketchEntities.push({ type: 'circle', points: [center], radius, id: CS.sketchEntityIdCounter });
    }
    CS.sketchTempPoints = [];
    CS.sketchDrawing = false;
  } else if (CS.sketchTool === 'rect') {
    const corner1 = CS.sketchTempPoints[0];
    if (Math.abs(pos.x - corner1.x) > 0.05 && Math.abs(pos.y - corner1.y) > 0.05) {
      CS.sketchEntityIdCounter++;
      const c2 = { x: pos.x, y: corner1.y };
      const c3 = pos;
      const c4 = { x: corner1.x, y: pos.y };
      CS.sketchEntities.push({ type: 'line', points: [corner1, c2], id: ++CS.sketchEntityIdCounter });
      CS.sketchEntities.push({ type: 'line', points: [c2, c3], id: ++CS.sketchEntityIdCounter });
      CS.sketchEntities.push({ type: 'line', points: [c3, c4], id: ++CS.sketchEntityIdCounter });
      CS.sketchEntities.push({ type: 'line', points: [c4, corner1], id: ++CS.sketchEntityIdCounter });
    }
    CS.sketchTempPoints = [];
    CS.sketchDrawing = false;
  } else if (CS.sketchTool === 'polygon') {
    const center = CS.sketchTempPoints[0];
    const radius = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
    if (radius > 0.05) {
      const sides = CS.polygonSides;
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
      }
      for (let i = 0; i < sides; i++) {
        CS.sketchEntityIdCounter++;
        CS.sketchEntities.push({ type: 'line', points: [pts[i], pts[(i + 1) % sides]], id: CS.sketchEntityIdCounter });
      }
    }
    CS.sketchTempPoints = [];
    CS.sketchDrawing = false;
  }

  renderSketchOverlay(pos);
}

function handleSketchDblClick(_e) {
  if (CS.sketchTool === 'line' && CS.sketchDrawing) {
    CS.sketchTempPoints = [];
    CS.sketchDrawing = false;
  }
}

/* ===================== Dimension & Constraints ===================== */

function handleDimensionClick(pos) {
  let nearest = null;
  let minDist = Infinity;
  for (const ent of CS.sketchEntities) {
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
      CS.sketchEntityIdCounter++;
      CS.sketchDimensions.push({ entityId: nearest.id, value: nv, id: CS.sketchEntityIdCounter });
      CS.sketchConstraints.push({ type: 'dimension', entityIds: [nearest.id], value: nv });
    }
    renderSketchOverlay(pos);
  }
}

function applyAutoConstraints(entity) {
  if (entity.type !== 'line') return;
  const dx = Math.abs(entity.points[1].x - entity.points[0].x);
  const dy = Math.abs(entity.points[1].y - entity.points[0].y);
  const tolerance = 0.15;
  if (dy < tolerance && dx > tolerance) {
    entity.points[1].y = entity.points[0].y;
    CS.sketchConstraints.push({ type: 'horizontal', entityIds: [entity.id] });
  } else if (dx < tolerance && dy > tolerance) {
    entity.points[1].x = entity.points[0].x;
    CS.sketchConstraints.push({ type: 'vertical', entityIds: [entity.id] });
  }
  for (const other of CS.sketchEntities) {
    if (other.id === entity.id || !other.points) continue;
    for (const pt of other.points) {
      for (const mypt of entity.points) {
        if (Math.abs(pt.x - mypt.x) < 0.2 && Math.abs(pt.y - mypt.y) < 0.2) {
          mypt.x = pt.x;
          mypt.y = pt.y;
          CS.sketchConstraints.push({ type: 'coincident', entityIds: [entity.id, other.id] });
        }
      }
    }
  }
}

/* ===================== Overlay Rendering ===================== */

function renderSketchOverlay(cursorPos) {
  const overlay = document.getElementById('cad-sketch-overlay');
  if (!overlay) return;
  const ctx = overlay.getContext('2d');
  const w = overlay.width;
  const h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(51, 102, 204, 0.15)';
  ctx.lineWidth = 0.5;
  const gridRange = 20;
  for (let i = -gridRange; i <= gridRange; i++) {
    const pStart = sketchToScreen(i * CS.sketchGridSize, -gridRange * CS.sketchGridSize);
    const pEnd = sketchToScreen(i * CS.sketchGridSize, gridRange * CS.sketchGridSize);
    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.stroke();
    const pStart2 = sketchToScreen(-gridRange * CS.sketchGridSize, i * CS.sketchGridSize);
    const pEnd2 = sketchToScreen(gridRange * CS.sketchGridSize, i * CS.sketchGridSize);
    ctx.beginPath();
    ctx.moveTo(pStart2.x, pStart2.y);
    ctx.lineTo(pEnd2.x, pEnd2.y);
    ctx.stroke();
  }

  // Draw entities
  for (const ent of CS.sketchEntities) {
    drawSketchEntity(ctx, ent, false);
  }

  // Draw dimensions
  ctx.font = 'bold 12px monospace';
  for (const dim of CS.sketchDimensions) {
    const ent = CS.sketchEntities.find((e) => e.id === dim.entityId);
    if (!ent) continue;
    ctx.fillStyle = '#ff00ff';
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    if (ent.type === 'line') {
      const mid = { x: (ent.points[0].x + ent.points[1].x) / 2, y: (ent.points[0].y + ent.points[1].y) / 2 };
      const scr = sketchToScreen(mid.x, mid.y);
      ctx.fillText(dim.value.toFixed(2), scr.x + 5, scr.y - 8);
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
  for (const con of CS.sketchConstraints) {
    if (con.type === 'horizontal' || con.type === 'vertical') {
      const ent = CS.sketchEntities.find((e) => e.id === con.entityIds[0]);
      if (!ent || !ent.points) continue;
      const mid = { x: (ent.points[0].x + ent.points[1].x) / 2, y: (ent.points[0].y + ent.points[1].y) / 2 };
      const scr = sketchToScreen(mid.x, mid.y);
      ctx.fillStyle = '#ff00ff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(con.type === 'horizontal' ? 'H' : 'V', scr.x - 4, scr.y + 16);
    }
  }

  // Draw temp preview
  if (CS.sketchDrawing && cursorPos) {
    ctx.setLineDash([4, 4]);
    if (CS.sketchTool === 'line' && CS.sketchTempPoints.length > 0) {
      const last = CS.sketchTempPoints[CS.sketchTempPoints.length - 1];
      const s1 = sketchToScreen(last.x, last.y);
      const s2 = sketchToScreen(cursorPos.x, cursorPos.y);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    } else if (CS.sketchTool === 'circle' && CS.sketchTempPoints.length === 1) {
      const center = CS.sketchTempPoints[0];
      const radius = Math.sqrt((cursorPos.x - center.x) ** 2 + (cursorPos.y - center.y) ** 2);
      const scr = sketchToScreen(center.x, center.y);
      const edgeScr = sketchToScreen(center.x + radius, center.y);
      const pixelR = Math.sqrt((edgeScr.x - scr.x) ** 2 + (edgeScr.y - scr.y) ** 2);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, pixelR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (CS.sketchTool === 'rect' && CS.sketchTempPoints.length === 1) {
      const c1 = CS.sketchTempPoints[0];
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
    } else if (CS.sketchTool === 'polygon' && CS.sketchTempPoints.length === 1) {
      const center = CS.sketchTempPoints[0];
      const radius = Math.sqrt((cursorPos.x - center.x) ** 2 + (cursorPos.y - center.y) ** 2);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= CS.polygonSides; i++) {
        const angle = (i / CS.polygonSides) * Math.PI * 2 - Math.PI / 2;
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
    ctx.fillText(`(${cursorPos.x.toFixed(2)}, ${cursorPos.y.toFixed(2)})`, w - 140, h - 10);
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
    ctx.fillStyle = '#66aaff';
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.type === 'arc' && ent.points.length === 3) {
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

/* ===================== Plane Dialog ===================== */

export function showPlaneDialog() {
  const dialog = document.getElementById('cad-sketch-plane-dialog');
  if (dialog) dialog.style.display = 'flex';
}

export function hidePlaneDialog() {
  const dialog = document.getElementById('cad-sketch-plane-dialog');
  if (dialog) dialog.style.display = 'none';
}

/* ===================== Sketch Tools ===================== */

export function setSketchTool(tool) {
  CS.sketchTool = tool;
  CS.sketchTempPoints = [];
  CS.sketchDrawing = false;
  document.querySelectorAll('.cad-sketch-tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  updateStatusBar(`Sketch tool: ${tool}`);

  if (tool === 'polygon') {
    const dialog = document.getElementById('cad-polygon-sides-dialog');
    if (dialog) dialog.style.display = 'flex';
  }
}

export function updateSketchSnapButtons() {
  const gridBtn = document.getElementById('cad-sketch-snap-grid');
  const ptBtn = document.getElementById('cad-sketch-snap-point');
  if (gridBtn) gridBtn.classList.toggle('active', CS.sketchGridSnap);
  if (ptBtn) ptBtn.classList.toggle('active', CS.sketchPointSnap);
}

/* ===================== Build Shape from Sketch ===================== */

export function buildShapeFromSketch(sketch) {
  const THREE = CS.THREE;
  const entities = sketch.entities;
  const lines = entities.filter((e) => e.type === 'line');
  if (lines.length === 0) {
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

  const shape = new THREE.Shape();
  const used = new Set();
  const tolerance = 0.25;

  let current = lines[0];
  used.add(current.id);
  shape.moveTo(current.points[0].x, current.points[0].y);
  shape.lineTo(current.points[1].x, current.points[1].y);
  let endPoint = current.points[1];

  for (let iter = 0; iter < lines.length * 2; iter++) {
    let found = false;
    for (const line of lines) {
      if (used.has(line.id)) continue;
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

export function buildLathePoints(sketch) {
  const THREE = CS.THREE;
  const entities = sketch.entities;
  const lines = entities.filter((e) => e.type === 'line');
  if (lines.length === 0) {
    const circle = entities.find((e) => e.type === 'circle');
    if (circle) {
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

  const pts = [new THREE.Vector2(Math.abs(lines[0].points[0].x), lines[0].points[0].y)];
  const used = new Set();
  used.add(lines[0].id);
  let endPoint = lines[0].points[0];

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
