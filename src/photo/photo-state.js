// OfficeLink SL — Photo State (shared mutable state for all photo modules)

import { DEFAULT_PARAMS, cloneParams } from './webgl-engine.js';

/**
 * Shared mutable state object for the photo editor.
 * All module-level `let` variables are collected here so that
 * sub-modules can read/write them via `PS.varName`.
 */
const PS = {
  // WebGL engine
  engine: null,

  // Image params & history
  currentParams: cloneParams(DEFAULT_PARAMS),
  history: [cloneParams(DEFAULT_PARAMS)],
  historyIndex: 0,
  imageDataUrl: null,
  imageInfo: null,
  showOriginal: false,

  // Zoom
  zoomLevel: 1,
  zoomPanX: 0,
  zoomPanY: 0,

  // Zoom constants
  ZOOM_MIN: 0.1,
  ZOOM_MAX: 16,
  ZOOM_STEP: 0.1,

  // Tracked event listeners for cleanup
  _managedListeners: [],

  // Layers
  BLEND_MODES: [
    'normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
    'difference', 'exclusion', 'color-dodge', 'color-burn', 'darken', 'lighten',
  ],
  layers: [],
  activeLayerIndex: 0,
  layerIdCounter: 0,

  // History panel
  MAX_HISTORY_ENTRIES: 50,
  historyEntries: [{ action: 'Open Image', timestamp: new Date() }],

  // Crop
  cropActive: false,
  cropRect: { x: 0, y: 0, w: 0, h: 0 },
  _cropDragCleanup: null,

  // Text overlay
  textMode: false,
  textItems: [],

  // Draw
  drawMode: false,
  drawCtx: null,

  // Filters
  FILTER_PRESETS: [
    { name: 'Original', params: {} },
    { name: 'Vivid', params: { saturation: 40, vibrance: 30, contrast: 15, clarity: 20 } },
    { name: 'Warm', params: { colorTemp: 7000, saturation: 15 } },
    { name: 'Cool', params: { colorTemp: 4500, saturation: 10 } },
    { name: 'B&W', params: { saturation: -100 } },
    { name: 'B&W Film', params: { saturation: -100, contrast: 25, grain: { amount: 30, size: 40 } } },
    { name: 'Vintage', params: { saturation: -20, contrast: -10, colorTemp: 6500, grain: { amount: 15, size: 30 }, vignette: { amount: 40, midpoint: 50, roundness: 0, feather: 60 } } },
    { name: 'Cinematic', params: { contrast: 20, saturation: -15, colorTemp: 4800, vignette: { amount: 30, midpoint: 40, roundness: 0, feather: 50 } } },
    { name: 'High Key', params: { exposure: 0.8, contrast: -20, highlights: 30, shadows: 30 } },
    { name: 'Low Key', params: { exposure: -0.5, contrast: 30, shadows: -20, vignette: { amount: 50, midpoint: 40, roundness: 0, feather: 50 } } },
    { name: 'Fade', params: { contrast: -20, saturation: -15, highlights: -20 } },
    { name: 'Dramatic', params: { clarity: 50, contrast: 30, saturation: 10, vignette: { amount: 25, midpoint: 50, roundness: 0, feather: 60 } } },
    { name: 'Sunset', params: { colorTemp: 7500, saturation: 30, vibrance: 20, exposure: 0.2 } },
    { name: 'Matte', params: { contrast: -15, highlights: -25, shadows: 25 } },
    { name: 'Chrome', params: { contrast: 25, saturation: -10, clarity: 30 } },
  ],

  // GIF
  gifFrames: [],

  // HSL
  HSL_COLORS: ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'],
  HSL_COLOR_SWATCHES: { red: '#e74c3c', orange: '#e67e22', yellow: '#f1c40f', green: '#2ecc71', aqua: '#1abc9c', blue: '#3498db', purple: '#9b59b6', magenta: '#e91e63' },

  // Tone Curve
  activeCurveChannel: 'rgb',
  curveCanvasCtx: null,
  curveDraggingPoint: -1,

  // Selective Color
  selectedHues: new Set(),

  // Split View
  splitViewActive: false,
  splitPosition: 0.5,
  _splitDragCleanup: null,

  // Histogram
  histogramVisible: false,

  // Clone/Stamp
  cloneMode: false,
  cloneSourceSet: false,
  cloneSourceX: 0,
  cloneSourceY: 0,
  cloneBrushSize: 20,

  // Spot Heal
  healMode: false,

  // Adjustment layer types
  ADJUSTMENT_TYPES: {
    'brightness-contrast': { label: 'Brightness/Contrast', params: { brightness: 0, contrast: 0 } },
    'levels': { label: 'Levels', params: { inputBlack: 0, inputWhite: 255, gamma: 1.0, outputBlack: 0, outputWhite: 255 } },
    'hue-saturation': { label: 'Hue/Saturation', params: { hue: 0, saturation: 0, lightness: 0 } },
    'color-balance': { label: 'Color Balance', params: { shadowsCR: 0, shadowsMY: 0, shadowsBY: 0, midsCR: 0, midsMY: 0, midsBY: 0, highsCR: 0, highsMY: 0, highsBY: 0 } },
    'curves': { label: 'Curves', params: { points: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } },
  },

  // Slider map for param bindings
  SLIDER_MAP: [
    { id: 'photo-exposure', key: 'exposure', min: -3, max: 3, step: 0.1 },
    { id: 'photo-contrast', key: 'contrast', min: -100, max: 100, step: 1 },
    { id: 'photo-highlights', key: 'highlights', min: -100, max: 100, step: 1 },
    { id: 'photo-shadows', key: 'shadows', min: -100, max: 100, step: 1 },
    { id: 'photo-colortemp', key: 'colorTemp', min: 2000, max: 10000, step: 100 },
    { id: 'photo-saturation', key: 'saturation', min: -100, max: 100, step: 1 },
    { id: 'photo-vibrance', key: 'vibrance', min: -100, max: 100, step: 1 },
    { id: 'photo-clarity', key: 'clarity', min: -100, max: 100, step: 1 },
    { id: 'photo-grain-amount', key: 'grain.amount', min: 0, max: 100, step: 1 },
    { id: 'photo-grain-size', key: 'grain.size', min: 0, max: 100, step: 1 },
    { id: 'photo-vig-amount', key: 'vignette.amount', min: 0, max: 100, step: 1 },
    { id: 'photo-vig-midpoint', key: 'vignette.midpoint', min: 0, max: 100, step: 1 },
    { id: 'photo-vig-roundness', key: 'vignette.roundness', min: -100, max: 100, step: 1 },
    { id: 'photo-vig-feather', key: 'vignette.feather', min: 0, max: 100, step: 1 },
    { id: 'photo-lens-distortion', key: 'lens.distortion', min: -100, max: 100, step: 1 },
    { id: 'photo-lens-ca-r', key: 'lens.caRed', min: -100, max: 100, step: 1 },
    { id: 'photo-lens-ca-b', key: 'lens.caBlue', min: -100, max: 100, step: 1 },
  ],
};

export default PS;
