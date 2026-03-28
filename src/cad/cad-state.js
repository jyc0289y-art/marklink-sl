// OfficeLink SL — CAD State (shared mutable state for all CAD modules)

/**
 * Shared mutable state object for the CAD editor.
 * All module-level `let` variables are collected here so that
 * sub-modules can read/write them via `CS.varName`.
 */
const CS = {
  // Three.js CDN-loaded modules (set by loadThreeJS)
  THREE: null,
  OrbitControls: null,
  TransformControls: null,
  STLExporter: null,
  OBJExporter: null,
  GLTFExporter: null,
  STLLoader: null,
  OBJLoader: null,
  GLTFLoader: null,

  // CDN base URL
  CDN: 'https://cdn.jsdelivr.net/npm/three@0.162.0',

  // Core Three.js objects
  scene: null,
  camera: null,
  renderer: null,
  orbitControls: null,
  transformControls: null,
  gridHelper: null,
  axesHelper: null,

  // Selection
  selectedObject: null,
  multiSelection: [],

  // Scene objects
  sceneObjects: [],
  undoStack: [],
  redoStack: [],

  // Transform
  currentTransformMode: 'translate',
  snapEnabled: true,
  snapGrid: 0.5,
  shadingMode: 'solid',

  // Lifecycle
  isInitialized: false,
  objectCounter: 0,

  // Lights
  lights: {},

  // DOM references
  viewportEl: null,
  canvasEl: null,

  // Animation & observers
  animFrameId: null,
  themeObserver: null,
  resizeObserver: null,
  keydownHandler: null,

  // Measurement Unit System
  measureUnit: 'mm',
  UNIT_FACTORS: { mm: 1, cm: 0.1, in: 0.03937 },
  UNIT_LABELS: { mm: 'mm', cm: 'cm', in: 'in' },

  // Advanced Snap State
  snapMidpointEnabled: true,
  snapCenterEnabled: true,
  snapIntersectionEnabled: true,
  lastSnapInfo: null,

  // Background State
  bgMode: 'solid',
  bgColor1: 0x1a1a2e,
  bgColor2: 0x0a0a1a,

  // OCCT B-Rep State
  occtEnabled: false,
  occtShapes: new Map(),

  // Sketch Mode State
  sketchMode: false,
  sketchPlane: null,
  sketchEntities: [],
  sketchCounter: 0,
  sketchTool: 'line',
  sketchGridSnap: true,
  sketchPointSnap: true,
  sketchGridSize: 0.5,
  sketchDrawing: false,
  sketchTempPoints: [],
  sketchDimensions: [],
  sketchConstraints: [],
  allSketches: [],
  featureTree: [],
  featureCounter: 0,
  polygonSides: 6,
  extrudePreviewMesh: null,
  revolvePreviewMesh: null,
  sketchGridMesh: null,
  sketchEntityIdCounter: 0,

  // Grid visibility
  gridVisible: true,

  // Clipboard
  clipboardData: null,

  // Late-bound callbacks (break circular deps between sub-modules)
  _updateFeatureTree: null,
  _updateSceneTree: null,
  _buildShapeFromSketch: null,
  _buildLathePoints: null,

  // Radial menu
  radialMenuVisible: false,

  // View Cube
  viewCubeScene: null,
  viewCubeCamera: null,
  viewCubeRenderer: null,

  // Box Select
  boxSelectActive: false,
  boxSelectStart: null,
  boxSelectDiv: null,

  // Measurement
  measurementMode: false,
  measurePoints: [],
  measureLines: [],

  // Section / Clipping
  clippingPlane: null,
  clippingHelper: null,
  sectionActive: false,

  // Camera views constant
  STANDARD_VIEWS: {
    front:       { pos: [0, 0, 1],  label: 'Front (1)' },
    back:        { pos: [0, 0, -1], label: 'Back (2)' },
    left:        { pos: [-1, 0, 0], label: 'Left (3)' },
    right:       { pos: [1, 0, 0],  label: 'Right (4)' },
    top:         { pos: [0, 1, 0.001], label: 'Top (5)' },
    bottom:      { pos: [0, -1, 0.001], label: 'Bottom (6)' },
    perspective: { pos: [1, 0.75, 1], label: 'Iso (7)' },
  },
};

export default CS;
