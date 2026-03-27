// OfficeLink SL — OpenCascade.js (OCCT) B-Rep Engine
// Wraps OpenCascade.js WASM for precise parametric B-Rep modeling
// Falls back gracefully if WASM fails to load

const OCCT_CDN = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5765fb/dist';
const OCCT_LOADER_URL = `${OCCT_CDN}/opencascade.full.js`;
const OCCT_WASM_URL = `${OCCT_CDN}/opencascade.full.wasm`;
const IDB_STORE = 'occt-wasm-cache';
const IDB_KEY = 'opencascade-full-wasm';
const IDB_DB_NAME = 'OfficeLink_OCCT';
const IDB_VERSION = 1;

let oc = null; // OpenCascade instance
let occtReady = false;
let occtLoading = false;
let occtLoadError = null;

/* ===================== Safe OCCT Helpers ===================== */

/**
 * Safely delete one or more OCCT objects.
 * Accepts individual objects or arrays. Silently skips null/undefined.
 */
const safeDelete = (...objs) => {
  for (const obj of objs) {
    if (Array.isArray(obj)) { obj.forEach((o) => { try { if (o && typeof o.delete === 'function') o.delete(); } catch { /* already freed */ } }); }
    else { try { if (obj && typeof obj.delete === 'function') obj.delete(); } catch { /* already freed */ } }
  }
};

/**
 * Wrap an OCCT operation with user-friendly error handling.
 * Returns the result of fn() or null on failure.
 * @param {string} opName - Human-readable operation name for error messages
 * @param {Function} fn - The OCCT operation to execute
 * @param {Function} [onProgress] - Optional progress callback(percent, msg)
 * @returns {*|null}
 */
const safeOCCT = (opName, fn, onProgress) => {
  if (!oc) {
    console.warn(`[OCCT] ${opName}: Engine not loaded`);
    return null;
  }
  try {
    if (onProgress) onProgress(0, `Starting ${opName}...`);
    const result = fn();
    if (onProgress) onProgress(100, `${opName} complete`);
    return result;
  } catch (e) {
    const msg = e?.message || String(e);
    // Detect common OCCT failures and provide actionable messages
    if (msg.includes('Standard_NullObject') || msg.includes('Null shape')) {
      console.error(`[OCCT] ${opName}: Input shape is null or invalid. Ensure the source geometry is valid.`);
    } else if (msg.includes('BRepCheck') || msg.includes('not valid')) {
      console.error(`[OCCT] ${opName}: Shape validation failed. The geometry may be self-intersecting or degenerate.`);
    } else if (msg.includes('out of memory') || msg.includes('OOM')) {
      console.error(`[OCCT] ${opName}: Out of memory. Try simpler geometry or lower tessellation quality.`);
    } else {
      console.error(`[OCCT] ${opName} error:`, msg);
    }
    return null;
  }
};

/* ===================== IndexedDB WASM Cache ===================== */

let _cachedIDB = null; // Cache db instance to avoid repeated IndexedDB open requests

const openIDB = () => {
  if (_cachedIDB) return Promise.resolve(_cachedIDB);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      _cachedIDB = req.result;
      // Clear cache if db is closed unexpectedly
      _cachedIDB.onclose = () => { _cachedIDB = null; };
      resolve(_cachedIDB);
    };
    req.onerror = () => reject(req.error);
  });
};

const getCachedWasm = async () => {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
};

const cacheWasm = async (data) => {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(data, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Cache failure is non-fatal
  }
};

/* ===================== WASM Fetch with Progress ===================== */

const fetchWithProgress = async (url, onProgress) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);

  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress && total > 0) {
      onProgress(received, total);
    }
  }

  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
};

/* ===================== Load OpenCascade.js ===================== */

/**
 * Load and initialize OpenCascade.js WASM engine.
 * @param {(percent: number, status: string) => void} onProgress - Progress callback
 * @returns {Promise<boolean>} true if loaded successfully
 */
export const loadOCCT = async (onProgress = () => {}) => {
  if (occtReady) return true;
  if (occtLoading) {
    // Wait for existing load — clear interval when occtReady or loading finishes
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (occtReady || !occtLoading) {
          clearInterval(check);
          resolve(occtReady);
        }
      }, 200);
    });
  }

  occtLoading = true;
  occtLoadError = null;

  try {
    onProgress(0, 'Checking WASM cache...');

    // Step 1: Check IndexedDB cache
    let wasmBinary = await getCachedWasm();

    if (wasmBinary) {
      onProgress(50, 'Loading cached WASM...');
    } else {
      // Step 2: Download WASM with progress tracking
      onProgress(5, 'Downloading OpenCascade WASM (~15MB)...');
      wasmBinary = await fetchWithProgress(OCCT_WASM_URL, (received, total) => {
        const pct = Math.round((received / total) * 80) + 5;
        const mb = (received / 1024 / 1024).toFixed(1);
        const totalMb = (total / 1024 / 1024).toFixed(1);
        onProgress(pct, `Downloading WASM: ${mb}/${totalMb} MB`);
      });

      // Cache for next time
      onProgress(85, 'Caching WASM...');
      await cacheWasm(wasmBinary);
    }

    // Step 3: Load the JS loader
    onProgress(88, 'Loading OpenCascade.js module...');
    const ocModule = await import(/* @vite-ignore */ OCCT_LOADER_URL);
    const initOC = ocModule.default || ocModule;

    // Step 4: Initialize with the WASM binary
    onProgress(92, 'Initializing B-Rep kernel...');
    oc = await initOC({
      wasmBinary,
    });

    occtReady = true;
    onProgress(100, 'B-Rep Engine ready');
    console.log('[OCCT] OpenCascade.js B-Rep engine initialized');
    return true;
  } catch (err) {
    occtLoadError = err;
    occtReady = false;
    console.warn('[OCCT] Failed to load OpenCascade.js:', err.message);
    onProgress(-1, `OCCT load failed: ${err.message}`);
    return false;
  } finally {
    occtLoading = false;
  }
};

/* ===================== Status Helpers ===================== */

export const isOCCTReady = () => occtReady;
export const getOCCTError = () => occtLoadError;
export const getOC = () => oc;

/** Safely delete an OCCT shape (exported for use by cad-editor cleanup) */
export const deleteShape = (shape) => safeDelete(shape);

/* ===================== Primitive B-Rep Creation ===================== */

/**
 * Create a box (B-Rep)
 * @returns {TopoDS_Shape}
 */
export const createBox = (width = 2, height = 2, depth = 2) => {
  if (width <= 0 || height <= 0 || depth <= 0) {
    console.warn('[OCCT] createBox: dimensions must be positive');
    return null;
  }
  return safeOCCT('createBox', () => {
    const maker = new oc.BRepPrimAPI_MakeBox_1(width, height, depth);
    const shape = maker.Shape();
    // Shape() returns a reference owned by maker — deep copy before deleting maker
    const copy = new oc.BRepBuilderAPI_Copy_2(shape, true, false);
    const result = copy.Shape();
    safeDelete(copy, maker);
    return result;
  });
};

/**
 * Create a sphere (B-Rep)
 * @returns {TopoDS_Shape}
 */
export const createSphere = (radius = 1) => {
  if (radius <= 0) {
    console.warn('[OCCT] createSphere: radius must be positive');
    return null;
  }
  return safeOCCT('createSphere', () => {
    const maker = new oc.BRepPrimAPI_MakeSphere_1(radius);
    const shape = maker.Shape();
    const copy = new oc.BRepBuilderAPI_Copy_2(shape, true, false);
    const result = copy.Shape();
    safeDelete(copy, maker);
    return result;
  });
};

/**
 * Create a cylinder (B-Rep)
 * @returns {TopoDS_Shape}
 */
export const createCylinder = (radius = 1, height = 2) => {
  if (radius <= 0 || height <= 0) {
    console.warn('[OCCT] createCylinder: radius and height must be positive');
    return null;
  }
  return safeOCCT('createCylinder', () => {
    const maker = new oc.BRepPrimAPI_MakeCylinder_1(radius, height);
    const shape = maker.Shape();
    const copy = new oc.BRepBuilderAPI_Copy_2(shape, true, false);
    const result = copy.Shape();
    safeDelete(copy, maker);
    return result;
  });
};

/**
 * Create a cone (B-Rep)
 * @returns {TopoDS_Shape}
 */
export const createCone = (r1 = 1, r2 = 0, height = 2) => {
  if (r1 < 0 || r2 < 0 || height <= 0) {
    console.warn('[OCCT] createCone: radii must be >= 0, height must be positive');
    return null;
  }
  if (r1 === 0 && r2 === 0) {
    console.warn('[OCCT] createCone: at least one radius must be > 0');
    return null;
  }
  return safeOCCT('createCone', () => {
    const maker = new oc.BRepPrimAPI_MakeCone_1(r1, r2, height);
    const shape = maker.Shape();
    const copy = new oc.BRepBuilderAPI_Copy_2(shape, true, false);
    const result = copy.Shape();
    safeDelete(copy, maker);
    return result;
  });
};

/**
 * Create a torus (B-Rep)
 * @returns {TopoDS_Shape}
 */
export const createTorus = (majorR = 1, minorR = 0.4) => {
  if (majorR <= 0 || minorR <= 0) {
    console.warn('[OCCT] createTorus: radii must be positive');
    return null;
  }
  if (minorR >= majorR) {
    console.warn('[OCCT] createTorus: minor radius must be less than major radius');
    return null;
  }
  return safeOCCT('createTorus', () => {
    const maker = new oc.BRepPrimAPI_MakeTorus_1(majorR, minorR);
    const shape = maker.Shape();
    const copy = new oc.BRepBuilderAPI_Copy_2(shape, true, false);
    const result = copy.Shape();
    safeDelete(copy, maker);
    return result;
  });
};

/* ===================== Sketch → Wire → Extrude/Revolve ===================== */

/**
 * Build a TopoDS_Wire from sketch entities (lines, circles, arcs)
 * @param {Array} entities - sketch entities [{type, points, radius}]
 * @param {Object} plane - {normal: {x,y,z}, origin: {x,y,z}, right: {x,y,z}, up: {x,y,z}}
 * @returns {TopoDS_Wire|null}
 */
export const createSketchWire = (entities, plane) => {
  if (!entities || entities.length === 0) return null;
  return safeOCCT('createSketchWire', () => {
    const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
    const toClean = [wireBuilder];

    const lines = entities.filter((e) => e.type === 'line');
    const circles = entities.filter((e) => e.type === 'circle');

    // If only a circle, make a circle wire
    if (lines.length === 0 && circles.length > 0) {
      const c = circles[0];
      if (!c.radius || c.radius <= 0) { safeDelete(toClean); return null; }
      const center = to3D(c.points[0], plane);
      const normal = plane.normal;
      const ax2 = makeAx2(center, normal);
      const circle = new oc.gp_Circ_2(ax2, c.radius);
      const edge = new oc.BRepBuilderAPI_MakeEdge_8(circle);
      if (edge.IsDone()) {
        wireBuilder.Add_1(edge.Edge());
      }
      safeDelete(edge, ax2, circle);
    } else {
      // Chain line segments into wire edges
      for (const line of lines) {
        const p1 = to3D(line.points[0], plane);
        const p2 = to3D(line.points[1], plane);
        // Skip degenerate edges (coincident points)
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6) continue;
        const gp1 = new oc.gp_Pnt_3(p1.x, p1.y, p1.z);
        const gp2 = new oc.gp_Pnt_3(p2.x, p2.y, p2.z);
        const edgeMaker = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
        if (edgeMaker.IsDone()) {
          wireBuilder.Add_1(edgeMaker.Edge());
        }
        safeDelete(gp1, gp2, edgeMaker);
      }
    }

    if (!wireBuilder.IsDone()) {
      safeDelete(toClean);
      return null;
    }

    // Wire() returns a reference owned by wireBuilder — deep copy before deleting
    const wireRef = wireBuilder.Wire();
    const wireCopy = new oc.BRepBuilderAPI_Copy_2(wireRef, true, false);
    const wire = wireCopy.Shape();
    safeDelete(wireCopy, wireBuilder);
    return wire;
  });
};

/**
 * Extrude a wire/shape along a direction
 * @param {TopoDS_Wire|TopoDS_Shape} profile
 * @param {{x,y,z}} direction - extrusion direction (unit vector)
 * @param {number} distance - extrusion distance
 * @param {boolean} symmetric - extrude in both directions
 * @returns {TopoDS_Shape|null}
 */
export const extrudeShape = (profile, direction, distance, symmetric = false) => {
  if (!oc || !profile) return null;
  // Declare outside try so catch can clean up
  let faceMakerRef = null;
  let vec = null;
  try {
    // First make a face from wire if it's a wire
    let face = profile;
    if (profile.ShapeType && profile.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
      faceMakerRef = new oc.BRepBuilderAPI_MakeFace_15(profile, true);
      if (!faceMakerRef.IsDone()) {
        faceMakerRef.delete();
        return null;
      }
      face = faceMakerRef.Face();
      // Do NOT delete faceMakerRef here — Face() returns a reference owned by the maker.
      // Deleting the maker invalidates the face. We delete it after extrusion below.
    }

    vec = new oc.gp_Vec_4(
      direction.x * distance,
      direction.y * distance,
      direction.z * distance
    );

    let result;
    if (symmetric) {
      // Symmetric: move face back by half distance, then extrude full distance
      const halfVec = new oc.gp_Vec_4(
        -direction.x * distance / 2,
        -direction.y * distance / 2,
        -direction.z * distance / 2
      );
      const trsf = new oc.gp_Trsf_1();
      trsf.SetTranslation_1(halfVec);
      const movedFace = new oc.BRepBuilderAPI_Transform_2(face, trsf, true);
      const prism = new oc.BRepPrimAPI_MakePrism_1(movedFace.Shape(), vec, false, true);
      // Shape() returns a reference owned by prism — deep copy before deleting
      const copy = new oc.BRepBuilderAPI_Copy_2(prism.Shape(), true, false);
      result = copy.Shape();
      safeDelete(copy, prism, movedFace, trsf, halfVec);
    } else {
      const prism = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
      // Shape() returns a reference owned by prism — deep copy before deleting
      const copy = new oc.BRepBuilderAPI_Copy_2(prism.Shape(), true, false);
      result = copy.Shape();
      safeDelete(copy, prism);
    }

    safeDelete(vec);
    vec = null;
    if (faceMakerRef) { faceMakerRef.delete(); faceMakerRef = null; }
    return result;
  } catch (e) {
    safeDelete(vec, faceMakerRef);
    console.error('[OCCT] extrudeShape error:', e);
    return null;
  }
};

/**
 * Revolve a profile around an axis
 * @param {TopoDS_Wire|TopoDS_Shape} profile
 * @param {{origin: {x,y,z}, dir: {x,y,z}}} axis
 * @param {number} angleDeg - angle in degrees
 * @returns {TopoDS_Shape|null}
 */
export const revolveShape = (profile, axis, angleDeg = 360) => {
  if (!oc || !profile) return null;
  let faceMakerRef = null;
  try {
    let face = profile;
    if (profile.ShapeType && profile.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
      faceMakerRef = new oc.BRepBuilderAPI_MakeFace_15(profile, true);
      if (!faceMakerRef.IsDone()) { faceMakerRef.delete(); return null; }
      face = faceMakerRef.Face();
      // Keep faceMakerRef alive — Face() returns a reference owned by the maker
    }

    const origin = new oc.gp_Pnt_3(axis.origin.x, axis.origin.y, axis.origin.z);
    const dir = new oc.gp_Dir_4(axis.dir.x, axis.dir.y, axis.dir.z);
    const ax1 = new oc.gp_Ax1_2(origin, dir);

    const angleRad = (angleDeg * Math.PI) / 180;
    const revolve = new oc.BRepPrimAPI_MakeRevol_1(face, ax1, angleRad, true);
    // Shape() returns a reference owned by revolve — deep copy before deleting
    const copy = new oc.BRepBuilderAPI_Copy_2(revolve.Shape(), true, false);
    const result = copy.Shape();

    safeDelete(copy, revolve, ax1, dir, origin);
    if (faceMakerRef) faceMakerRef.delete();
    return result;
  } catch (e) {
    if (faceMakerRef) try { faceMakerRef.delete(); } catch { /* ignore */ }
    console.error('[OCCT] revolveShape error:', e);
    return null;
  }
};

/* ===================== Boolean Operations ===================== */

/**
 * Boolean union of two shapes
 * @returns {TopoDS_Shape|null}
 */
export const booleanUnion = (shape1, shape2) => {
  if (!oc || !shape1 || !shape2) return null;
  try {
    const progress = new oc.Message_ProgressRange_1();
    const fuse = new oc.BRepAlgoAPI_Fuse_3(shape1, shape2, progress);
    safeDelete(progress);
    if (!fuse.IsDone()) { fuse.delete(); return null; }
    const result = fuse.Shape();
    // Deep copy result before deleting the algorithm object
    const copy = new oc.BRepBuilderAPI_Copy_2(result, true, false);
    const copied = copy.Shape();
    safeDelete(copy, fuse);
    return copied;
  } catch (e) {
    console.error('[OCCT] booleanUnion error:', e);
    return null;
  }
};

/**
 * Boolean subtract (shape1 - shape2)
 * @returns {TopoDS_Shape|null}
 */
export const booleanSubtract = (shape1, shape2) => {
  if (!oc || !shape1 || !shape2) return null;
  try {
    const progress = new oc.Message_ProgressRange_1();
    const cut = new oc.BRepAlgoAPI_Cut_3(shape1, shape2, progress);
    safeDelete(progress);
    if (!cut.IsDone()) { cut.delete(); return null; }
    const result = cut.Shape();
    const copy = new oc.BRepBuilderAPI_Copy_2(result, true, false);
    const copied = copy.Shape();
    safeDelete(copy, cut);
    return copied;
  } catch (e) {
    console.error('[OCCT] booleanSubtract error:', e);
    return null;
  }
};

/**
 * Boolean intersection (common volume)
 * @returns {TopoDS_Shape|null}
 */
export const booleanIntersect = (shape1, shape2) => {
  if (!oc || !shape1 || !shape2) return null;
  try {
    const progress = new oc.Message_ProgressRange_1();
    const common = new oc.BRepAlgoAPI_Common_3(shape1, shape2, progress);
    safeDelete(progress);
    if (!common.IsDone()) { common.delete(); return null; }
    const result = common.Shape();
    const copy = new oc.BRepBuilderAPI_Copy_2(result, true, false);
    const copied = copy.Shape();
    safeDelete(copy, common);
    return copied;
  } catch (e) {
    console.error('[OCCT] booleanIntersect error:', e);
    return null;
  }
};

/* ===================== Advanced Operations ===================== */

/**
 * Fillet (round) edges of a shape
 * @param {TopoDS_Shape} shape
 * @param {number} radius
 * @param {number[]} edgeIndices - which edges to fillet (empty = all)
 * @returns {TopoDS_Shape|null}
 */
export const filletEdges = (shape, radius = 0.2, edgeIndices = []) => {
  if (!oc || !shape) return null;
  try {
    const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_ChFiAlgo.ChFi3d_Rational);

    // Get all edges
    const edgeExplorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    const edges = [];
    while (edgeExplorer.More()) {
      edges.push(oc.TopoDS.Edge_1(edgeExplorer.Current()));
      edgeExplorer.Next();
    }
    edgeExplorer.delete();

    if (edgeIndices.length === 0) {
      // Fillet all edges
      edges.forEach((edge) => fillet.Add_2(radius, edge));
    } else {
      edgeIndices.forEach((idx) => {
        if (idx >= 0 && idx < edges.length) {
          fillet.Add_2(radius, edges[idx]);
        }
      });
    }

    const filletProgress = new oc.Message_ProgressRange_1();
    fillet.Build(filletProgress);
    safeDelete(filletProgress);
    if (!fillet.IsDone()) {
      fillet.delete();
      console.warn('[OCCT] filletEdges: build failed — try a smaller radius');
      return null;
    }

    // Shape() returns a reference owned by fillet — deep copy before deleting
    const copy = new oc.BRepBuilderAPI_Copy_2(fillet.Shape(), true, false);
    const result = copy.Shape();
    safeDelete(copy, fillet);
    return result;
  } catch (e) {
    console.error('[OCCT] filletEdges error:', e);
    return null;
  }
};

/**
 * Chamfer edges of a shape
 * @param {TopoDS_Shape} shape
 * @param {number} distance
 * @param {number[]} edgeIndices - which edges to chamfer (empty = all)
 * @returns {TopoDS_Shape|null}
 */
export const chamferEdges = (shape, distance = 0.2, edgeIndices = []) => {
  if (!oc || !shape) return null;
  try {
    const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);

    // Get edges via map
    const edgeMap = new oc.TopTools_IndexedDataMapOfShapeListOfShape_1();
    oc.TopExp.MapShapesAndAncestors(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_FACE, edgeMap);

    const nEdges = edgeMap.Extent();
    if (edgeIndices.length === 0) {
      for (let i = 1; i <= nEdges; i++) {
        const edge = oc.TopoDS.Edge_1(edgeMap.FindKey(i));
        const faceList = edgeMap.FindFromIndex(i);
        if (faceList.Extent() > 0) {
          const face = oc.TopoDS.Face_1(faceList.First_1());
          chamfer.Add_2(distance, edge, face);
        }
      }
    } else {
      edgeIndices.forEach((idx) => {
        const i = idx + 1;
        if (i >= 1 && i <= nEdges) {
          const edge = oc.TopoDS.Edge_1(edgeMap.FindKey(i));
          const faceList = edgeMap.FindFromIndex(i);
          if (faceList.Extent() > 0) {
            const face = oc.TopoDS.Face_1(faceList.First_1());
            chamfer.Add_2(distance, edge, face);
          }
        }
      });
    }

    edgeMap.delete();
    const chamferProgress = new oc.Message_ProgressRange_1();
    chamfer.Build(chamferProgress);
    safeDelete(chamferProgress);
    if (!chamfer.IsDone()) {
      chamfer.delete();
      console.warn('[OCCT] chamferEdges: build failed — try a smaller distance');
      return null;
    }
    // Shape() returns a reference owned by chamfer — deep copy before deleting
    const copy = new oc.BRepBuilderAPI_Copy_2(chamfer.Shape(), true, false);
    const result = copy.Shape();
    safeDelete(copy, chamfer);
    return result;
  } catch (e) {
    console.error('[OCCT] chamferEdges error:', e);
    return null;
  }
};

/**
 * Shell (hollow out) a shape
 * @param {TopoDS_Shape} shape
 * @param {number} thickness
 * @param {number[]} faceIndicesToRemove - faces to remove (open faces)
 * @returns {TopoDS_Shape|null}
 */
export const shellShape = (shape, thickness = 0.2, faceIndicesToRemove = [0]) => {
  if (!oc || !shape) return null;
  try {
    const shell = new oc.BRepOffsetAPI_MakeThickSolid();

    // Gather faces to remove
    const facesToRemove = new oc.TopTools_ListOfShape_1();
    const faceExplorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    const faces = [];
    while (faceExplorer.More()) {
      faces.push(faceExplorer.Current());
      faceExplorer.Next();
    }
    faceExplorer.delete();

    faceIndicesToRemove.forEach((idx) => {
      if (idx >= 0 && idx < faces.length) {
        facesToRemove.Append_1(faces[idx]);
      }
    });

    const progress = new oc.Message_ProgressRange_1();
    shell.MakeThickSolidByJoin(
      shape,
      facesToRemove,
      thickness,
      1e-3, // tolerance
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false, // intersection
      false, // selfInter
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false, // removeIntEdges
      progress
    );
    safeDelete(progress);

    facesToRemove.delete();

    if (!shell.IsDone()) {
      shell.delete();
      return null;
    }

    // Shape() returns a reference owned by shell — deep copy before deleting
    const copy = new oc.BRepBuilderAPI_Copy_2(shell.Shape(), true, false);
    const result = copy.Shape();
    safeDelete(copy, shell);
    return result;
  } catch (e) {
    console.error('[OCCT] shellShape error:', e);
    return null;
  }
};

/**
 * Loft through multiple wires
 * @param {TopoDS_Wire[]} wires
 * @returns {TopoDS_Shape|null}
 */
export const loftShapes = (wires) => {
  if (!oc || !wires || wires.length < 2) return null;
  try {
    const loft = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
    wires.forEach((wire) => loft.AddWire(wire));
    const progress = new oc.Message_ProgressRange_1();
    loft.Build(progress);
    safeDelete(progress);

    if (!loft.IsDone()) { loft.delete(); return null; }
    // Shape() returns a reference owned by loft — deep copy before deleting
    const copy = new oc.BRepBuilderAPI_Copy_2(loft.Shape(), true, false);
    const result = copy.Shape();
    safeDelete(copy, loft);
    return result;
  } catch (e) {
    console.error('[OCCT] loftShapes error:', e);
    return null;
  }
};

/* ===================== Tessellation (B-Rep → Mesh Data) ===================== */

/**
 * Tessellate a shape into vertices, normals, indices, and edge data
 * suitable for Three.js BufferGeometry.
 * @param {TopoDS_Shape} shape
 * @param {number} deflection - tessellation quality (lower = better, 0.1 is good)
 * @returns {{ vertices: Float32Array, normals: Float32Array, indices: Uint32Array, edges: Float32Array }|null}
 */
export const tessellate = (shape, deflection = 0.1) => {
  if (!oc || !shape) return null;
  try {
    // Perform tessellation
    const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, deflection, false, deflection * 5, true);
    const meshProgress = new oc.Message_ProgressRange_1();
    mesh.Perform(meshProgress);
    safeDelete(meshProgress);

    const vertices = [];
    const normals = [];
    const indices = [];
    const edges = [];

    let indexOffset = 0;

    // Extract face triangles
    const faceExplorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (faceExplorer.More()) {
      const face = oc.TopoDS.Face_1(faceExplorer.Current());
      const location = new oc.TopLoc_Location_1();
      const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);

      if (triangulation && !triangulation.IsNull()) {
        const tri = triangulation.get();
        const nNodes = tri.NbNodes();
        const nTriangles = tri.NbTriangles();
        const transform = location.Transformation();

        // Extract vertices and normals
        for (let i = 1; i <= nNodes; i++) {
          const node = tri.Node(i);
          const transformed = node.Transformed(transform);
          vertices.push(transformed.X(), transformed.Y(), transformed.Z());
          // Free WASM heap objects returned by Node/Transformed
          try { node.delete(); } catch { /* value type */ }
          try { transformed.delete(); } catch { /* value type */ }

          // Compute normal from triangulation if available
          if (tri.HasNormals()) {
            const normal = tri.Normal(i);
            const tDir = normal.Transformed(transform);
            normals.push(tDir.X(), tDir.Y(), tDir.Z());
            try { normal.delete(); } catch { /* value type */ }
            try { tDir.delete(); } catch { /* value type */ }
          } else {
            normals.push(0, 1, 0);
          }
        }

        // Extract triangle indices
        const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
        for (let i = 1; i <= nTriangles; i++) {
          const triangle = tri.Triangle(i);
          const n1 = triangle.Value(1) - 1 + indexOffset;
          const n2 = triangle.Value(2) - 1 + indexOffset;
          const n3 = triangle.Value(3) - 1 + indexOffset;

          if (isReversed) {
            indices.push(n1, n3, n2);
          } else {
            indices.push(n1, n2, n3);
          }
        }

        indexOffset += nNodes;
      }

      location.delete();
      faceExplorer.Next();
    }
    faceExplorer.delete();

    // Extract edge data for wireframe display
    const edgeExplorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (edgeExplorer.More()) {
      const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
      const location = new oc.TopLoc_Location_1();
      const polygon = oc.BRep_Tool.Polygon3D(edge, location);

      if (polygon && !polygon.IsNull()) {
        const poly = polygon.get();
        const nNodes = poly.NbNodes();
        const transform = location.Transformation();

        for (let i = 1; i <= nNodes; i++) {
          const nodesArr = poly.Nodes();
          const node = nodesArr.Value(i);
          const transformed = node.Transformed(transform);
          edges.push(transformed.X(), transformed.Y(), transformed.Z());
          // Free WASM heap objects
          try { transformed.delete(); } catch { /* value type */ }
          try { node.delete(); } catch { /* value type */ }
          try { nodesArr.delete(); } catch { /* value type */ }
        }
        // Add NaN separator between edges
        if (nNodes > 0) edges.push(NaN, NaN, NaN);
      }

      location.delete();
      edgeExplorer.Next();
    }
    edgeExplorer.delete();
    mesh.delete();

    if (vertices.length === 0) return null;

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
      edges: new Float32Array(edges),
    };
  } catch (e) {
    console.error('[OCCT] tessellate error:', e);
    return null;
  }
};

/* ===================== STEP Export/Import ===================== */

/**
 * Export shapes to STEP format
 * @param {TopoDS_Shape[]} shapes
 * @returns {string|null} STEP file content
 */
export const exportSTEP = (shapes) => {
  if (!oc || !shapes || shapes.length === 0) return null;
  try {
    const writer = new oc.STEPControl_Writer_1();
    writer.SetTolerance(1e-6);

    shapes.forEach((shape) => {
      const progress = new oc.Message_ProgressRange_1();
      writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
      safeDelete(progress);
    });

    // Write to virtual FS — path must start with '/'
    const status = writer.Write('/output.step');
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      writer.delete();
      return null;
    }

    const fileContent = oc.FS.readFile('/output.step', { encoding: 'utf8' });
    try { oc.FS.unlink('/output.step'); } catch { /* ignore */ }
    writer.delete();
    return fileContent;
  } catch (e) {
    console.error('[OCCT] exportSTEP error:', e);
    return null;
  }
};

/**
 * Import a STEP file
 * @param {string} stepContent - STEP file contents
 * @returns {TopoDS_Shape|null}
 */
export const importSTEP = (stepContent) => {
  if (!oc || !stepContent) return null;
  try {
    // Write to virtual filesystem
    oc.FS.writeFile('/import.step', stepContent);

    const reader = new oc.STEPControl_Reader_1();
    const status = reader.ReadFile('/import.step');

    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      reader.delete();
      try { oc.FS.unlink('/import.step'); } catch { /* ignore */ }
      return null;
    }

    const progress = new oc.Message_ProgressRange_1();
    reader.TransferRoots(progress);
    safeDelete(progress);
    // OneShape() returns a reference owned by reader — deep copy before deleting
    const shapeRef = reader.OneShape();
    const copy = new oc.BRepBuilderAPI_Copy_2(shapeRef, true, false);
    const shape = copy.Shape();
    safeDelete(copy, reader);
    try { oc.FS.unlink('/import.step'); } catch { /* ignore */ }
    return shape;
  } catch (e) {
    console.error('[OCCT] importSTEP error:', e);
    return null;
  }
};

/**
 * Export shapes to IGES format
 * @param {TopoDS_Shape[]} shapes
 * @returns {string|null} IGES file content
 */
export const exportIGES = (shapes) => {
  if (!oc || !shapes || shapes.length === 0) return null;
  try {
    const writer = new oc.IGESControl_Writer_1();

    shapes.forEach((shape) => {
      writer.AddShape(shape);
    });

    writer.ComputeModel();
    const success = writer.Write_2('/output.iges');
    if (!success) { writer.delete(); return null; }

    const fileContent = oc.FS.readFile('/output.iges', { encoding: 'utf8' });
    try { oc.FS.unlink('/output.iges'); } catch { /* ignore */ }
    writer.delete();
    return fileContent;
  } catch (e) {
    console.error('[OCCT] exportIGES error:', e);
    return null;
  }
};

/**
 * Import an IGES file
 * @param {string} igesContent - IGES file contents
 * @returns {TopoDS_Shape|null}
 */
export const importIGES = (igesContent) => {
  if (!oc || !igesContent) return null;
  try {
    oc.FS.writeFile('/import.iges', igesContent);

    const reader = new oc.IGESControl_Reader_1();
    const status = reader.ReadFile('/import.iges');

    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      reader.delete();
      try { oc.FS.unlink('/import.iges'); } catch { /* ignore */ }
      return null;
    }

    const progress = new oc.Message_ProgressRange_1();
    reader.TransferRoots(progress);
    safeDelete(progress);
    // OneShape() returns a reference owned by reader — deep copy before deleting
    const shapeRef = reader.OneShape();
    const copy = new oc.BRepBuilderAPI_Copy_2(shapeRef, true, false);
    const shape = copy.Shape();
    safeDelete(copy, reader);
    try { oc.FS.unlink('/import.iges'); } catch { /* ignore */ }
    return shape;
  } catch (e) {
    console.error('[OCCT] importIGES error:', e);
    return null;
  }
};

/**
 * Export a single shape to BRep format
 * @param {TopoDS_Shape} shape
 * @returns {string|null}
 */
export const exportBRep = (shape) => {
  if (!oc || !shape) return null;
  try {
    const progress = new oc.Message_ProgressRange_1();
    // BRepTools is a static utility — call Write_2 directly on the class
    oc.BRepTools.Write_2(shape, '/output.brep', progress);
    safeDelete(progress);
    const fileContent = oc.FS.readFile('/output.brep', { encoding: 'utf8' });
    try { oc.FS.unlink('/output.brep'); } catch { /* ignore */ }
    return fileContent;
  } catch (e) {
    console.error('[OCCT] exportBRep error:', e);
    return null;
  }
};

/* ===================== Utility Helpers ===================== */

/**
 * Convert sketch 2D point to 3D using plane info
 */
const to3D = (pt2d, plane) => {
  const ox = plane.origin.x || 0;
  const oy = plane.origin.y || 0;
  const oz = plane.origin.z || 0;
  const rx = plane.right.x || 0;
  const ry = plane.right.y || 0;
  const rz = plane.right.z || 0;
  const ux = plane.up.x || 0;
  const uy = plane.up.y || 0;
  const uz = plane.up.z || 0;
  return {
    x: ox + pt2d.x * rx + pt2d.y * ux,
    y: oy + pt2d.x * ry + pt2d.y * uy,
    z: oz + pt2d.x * rz + pt2d.y * uz,
  };
};

/**
 * Create a gp_Ax2 from center point and normal direction
 */
const makeAx2 = (center, normal) => {
  const pnt = new oc.gp_Pnt_3(center.x, center.y, center.z);
  const dir = new oc.gp_Dir_4(normal.x, normal.y, normal.z);
  const ax2 = new oc.gp_Ax2_3(pnt, dir);
  pnt.delete();
  dir.delete();
  return ax2;
};

/**
 * Get edge count of a shape
 * @param {TopoDS_Shape} shape
 * @returns {number}
 */
export const getEdgeCount = (shape) => {
  if (!oc || !shape) return 0;
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count = 0;
  while (explorer.More()) { count++; explorer.Next(); }
  explorer.delete();
  return count;
};

/**
 * Get face count of a shape
 * @param {TopoDS_Shape} shape
 * @returns {number}
 */
export const getFaceCount = (shape) => {
  if (!oc || !shape) return 0;
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count = 0;
  while (explorer.More()) { count++; explorer.Next(); }
  explorer.delete();
  return count;
};

/* ===================== B-Rep Measurements ===================== */

/**
 * Compute the surface area of a shape using GProp
 * @param {TopoDS_Shape} shape
 * @returns {number} surface area, or -1 on failure
 */
export const getSurfaceArea = (shape) => {
  if (!oc || !shape) return -1;
  try {
    const props = new oc.GProp_GProps_1();
    oc.BRepGProp.SurfaceProperties_1(shape, props, 1e-6, false);
    const area = props.Mass();
    props.delete();
    return area;
  } catch (e) {
    console.error('[OCCT] getSurfaceArea error:', e);
    return -1;
  }
};

/**
 * Compute the volume of a solid shape using GProp
 * @param {TopoDS_Shape} shape
 * @returns {number} volume, or -1 on failure
 */
export const getVolume = (shape) => {
  if (!oc || !shape) return -1;
  try {
    // Volume is only meaningful for solids/compsolids
    const shapeType = shape.ShapeType();
    if (shapeType !== oc.TopAbs_ShapeEnum.TopAbs_SOLID &&
        shapeType !== oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID &&
        shapeType !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
      return 0;
    }
    const props = new oc.GProp_GProps_1();
    oc.BRepGProp.VolumeProperties_1(shape, props, 1e-6, false, false);
    const volume = props.Mass();
    props.delete();
    return volume;
  } catch (e) {
    console.error('[OCCT] getVolume error:', e);
    return -1;
  }
};

/**
 * Compute the center of mass of a shape
 * @param {TopoDS_Shape} shape
 * @returns {{x: number, y: number, z: number}|null}
 */
export const getCenterOfMass = (shape) => {
  if (!oc || !shape) return null;
  try {
    const props = new oc.GProp_GProps_1();
    // Use VolumeProperties for solids, SurfaceProperties for non-solids
    const shapeType = shape.ShapeType();
    if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_SOLID ||
        shapeType === oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID ||
        shapeType === oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
      oc.BRepGProp.VolumeProperties_1(shape, props, 1e-6, false, false);
    } else {
      oc.BRepGProp.SurfaceProperties_1(shape, props, 1e-6, false);
    }
    const center = props.CentreOfMass();
    const result = { x: center.X(), y: center.Y(), z: center.Z() };
    // Free WASM heap object returned by CentreOfMass
    try { center.delete(); } catch { /* value type */ }
    props.delete();
    return result;
  } catch (e) {
    console.error('[OCCT] getCenterOfMass error:', e);
    return null;
  }
};
