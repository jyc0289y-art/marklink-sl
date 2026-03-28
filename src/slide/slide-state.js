// OfficeLink SL — Slide State (shared mutable state for all slide modules)

/**
 * Shared mutable state object for the slide editor.
 * All module-level `let` variables are collected here so that
 * sub-modules can read/write them via `ST.varName`.
 */

const LAYOUTS = {
  title: '<h1 class="slide-title">Title</h1><p class="slide-subtitle">Subtitle</p>',
  content: '<h2>Slide Title</h2><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>',
  'two-col': '<h2>Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><p>Left column</p></div><div style="flex:1"><p>Right column</p></div></div>',
  section: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%"><h1 style="font-size:52px;margin:0">Section Title</h1><p style="font-size:24px;opacity:0.6;margin:12px 0 0">Section subtitle</p></div>',
  comparison: '<h2>Comparison</h2><div style="display:flex;gap:24px"><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px"><h3>Option A</h3><ul><li>Feature 1</li><li>Feature 2</li></ul></div><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px"><h3>Option B</h3><ul><li>Feature 1</li><li>Feature 2</li></ul></div></div>',
  blank: '<p>&nbsp;</p>',
  image: '<h2>Image Slide</h2><p style="text-align:center;color:#999">Click to insert an image</p>',
  'title-image': '<div style="display:flex;gap:32px;align-items:center;height:100%"><div style="flex:1"><h2 style="font-size:36px;margin:0 0 16px">Title Here</h2><p style="font-size:20px;margin:0;opacity:0.8">Description text goes here.</p></div><div style="flex:1;display:flex;align-items:center;justify-content:center"><div style="width:100%;aspect-ratio:4/3;background:rgba(128,128,128,0.1);border:2px dashed rgba(128,128,128,0.3);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">IMG</div></div></div>',
  'big-number': '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:120px;font-weight:900;line-height:1;opacity:0.9">42%</div><p style="font-size:28px;margin:20px 0 0;opacity:0.6">Key statistic or metric</p></div>',
  quote: '<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 40px"><div style="font-size:72px;line-height:0.8;opacity:0.15;font-family:Georgia,serif">&ldquo;</div><blockquote style="font-size:32px;font-style:italic;margin:0;line-height:1.5;padding:0 20px">Insert your quote here.</blockquote><p style="font-size:18px;margin:24px 0 0 20px;opacity:0.6">&mdash; Author Name</p></div>',
};

const SLIDE_TEMPLATES = {
  'title-slide': {
    name: 'Title Slide',
    icon: 'T',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:48px;margin:0 0 12px">Presentation Title</h1><p style="font-size:24px;opacity:0.6;margin:0">Your subtitle here</p></div>',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:48px;margin:0 0 12px">Presentation Title</h1><p style="font-size:24px;opacity:0.6;margin:0">Your subtitle here</p></div>',
  },
  'title-content': {
    name: 'Title + Content',
    icon: 'TC',
    preview: '<div><h2 style="font-size:20px;margin:0 0 8px;border-bottom:2px solid rgba(128,128,128,0.2);padding-bottom:6px">Slide Title</h2><ul style="margin:8px 0 0;padding-left:20px;font-size:12px"><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul></div>',
    content: '<h2 style="font-size:36px;margin:0 0 16px;border-bottom:2px solid rgba(128,128,128,0.2);padding-bottom:12px">Slide Title</h2><ul style="font-size:22px;line-height:1.8;margin:0;padding-left:28px"><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>',
  },
  'two-column': {
    name: 'Two Column',
    icon: '||',
    preview: '<div><h2 style="font-size:14px;margin:0 0 6px">Title</h2><div style="display:flex;gap:8px"><div style="flex:1;background:rgba(128,128,128,0.08);border-radius:4px;padding:4px;font-size:8px">Left</div><div style="flex:1;background:rgba(128,128,128,0.08);border-radius:4px;padding:4px;font-size:8px">Right</div></div></div>',
    content: '<h2 style="font-size:36px;margin:0 0 20px">Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Left Column</h3><p style="font-size:18px;line-height:1.6">Content for the left column goes here.</p></div><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Right Column</h3><p style="font-size:18px;line-height:1.6">Content for the right column goes here.</p></div></div>',
  },
  'blank': {
    name: 'Blank',
    icon: '[ ]',
    preview: '<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(128,128,128,0.4)">Blank</div>',
    content: '<p>&nbsp;</p>',
  },
};

const MASTER_SLIDES = {
  corporate: {
    name: 'Corporate',
    bg: 'linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)',
    color: '#fff',
    accentColor: '#3b82f6',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    headerStyle: 'border-bottom:2px solid #3b82f6;padding-bottom:12px;margin-bottom:16px',
    logo: '',
  },
  modern: {
    name: 'Modern',
    bg: 'linear-gradient(160deg, #fafafa 0%, #e8e8e8 100%)',
    color: '#222',
    accentColor: '#e53e3e',
    fontFamily: "'Inter', system-ui, sans-serif",
    headerStyle: 'color:#e53e3e;font-weight:800;text-transform:uppercase;letter-spacing:2px',
    logo: '',
  },
  nature: {
    name: 'Nature',
    bg: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    color: '#fff',
    accentColor: '#fbd38d',
    fontFamily: "'Georgia', serif",
    headerStyle: 'font-style:italic;border-left:4px solid #fbd38d;padding-left:16px',
    logo: '',
  },
  tech: {
    name: 'Tech',
    bg: '#0a0a0a',
    color: '#00ff88',
    accentColor: '#00ff88',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    headerStyle: 'font-weight:400;text-transform:uppercase;letter-spacing:4px;color:#00ff88',
    logo: '',
  },
  pastel: {
    name: 'Pastel',
    bg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    color: '#4a3728',
    accentColor: '#e17055',
    fontFamily: "'Nunito', system-ui, sans-serif",
    headerStyle: 'color:#e17055;font-weight:700',
    logo: '',
  },
  academic: {
    name: 'Academic',
    bg: '#fffef5',
    color: '#2d3436',
    accentColor: '#6c5ce7',
    fontFamily: "'Palatino', 'Book Antiqua', serif",
    headerStyle: 'font-variant:small-caps;color:#6c5ce7;border-bottom:1px solid #6c5ce7;padding-bottom:8px',
    logo: '',
  },
};

const MASTER_LAYOUTS = {
  'title-slide': {
    name: 'Title Slide',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 class="slide-title" style="font-size:52px;margin:0 0 16px">Presentation Title</h1><p class="slide-subtitle" style="font-size:24px;opacity:0.7;margin:0">Subtitle or author name</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:9px;font-weight:700">Title</div><div style="font-size:6px;opacity:0.6">Subtitle</div></div>',
  },
  'title-content': {
    name: 'Title + Content',
    content: '<h2 style="margin:0 0 20px;font-size:36px">Slide Title</h2><ul style="padding-left:1.5em;margin:0"><li style="font-size:22px;margin:8px 0">First point</li><li style="font-size:22px;margin:8px 0">Second point</li><li style="font-size:22px;margin:8px 0">Third point</li></ul>',
    preview: '<div style="font-size:8px;font-weight:700;border-bottom:1px solid rgba(0,0,0,0.2);padding-bottom:3px;margin-bottom:3px">Title</div><div style="font-size:5px;line-height:1.6">&#8226; Point 1<br>&#8226; Point 2<br>&#8226; Point 3</div>',
  },
  'two-column': {
    name: 'Two Columns',
    content: '<h2 style="margin:0 0 20px;font-size:36px">Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Left Column</h3><p style="font-size:18px;margin:0">Content for the left column goes here.</p></div><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Right Column</h3><p style="font-size:18px;margin:0">Content for the right column goes here.</p></div></div>',
    preview: '<div style="font-size:7px;font-weight:700;margin-bottom:3px">Title</div><div style="display:flex;gap:4px"><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;font-size:4px;border-radius:2px">Left</div><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;font-size:4px;border-radius:2px">Right</div></div>',
  },
  'blank': {
    name: 'Blank',
    content: '<p>&nbsp;</p>',
    preview: '<div style="height:100%"></div>',
  },
  'section-header': {
    name: 'Section Header',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:52px;margin:0;font-weight:800">Section Title</h1><div style="width:60px;height:4px;background:currentColor;opacity:0.3;margin:20px auto 16px;border-radius:2px"></div><p style="font-size:20px;opacity:0.5;margin:0">Section description</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:9px;font-weight:800">Section</div><div style="width:16px;height:1px;background:currentColor;opacity:0.3;margin:2px auto"></div><div style="font-size:5px;opacity:0.5">Description</div></div>',
  },
  'comparison': {
    name: 'Comparison',
    content: '<h2 style="margin:0 0 20px;font-size:36px">Comparison</h2><div style="display:flex;gap:24px"><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:12px;padding:20px"><h3 style="font-size:24px;margin:0 0 12px;color:#34a853">Option A</h3><ul style="padding-left:1.2em;margin:0"><li style="font-size:18px;margin:6px 0">Feature 1</li><li style="font-size:18px;margin:6px 0">Feature 2</li><li style="font-size:18px;margin:6px 0">Feature 3</li></ul></div><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:12px;padding:20px"><h3 style="font-size:24px;margin:0 0 12px;color:#4285f4">Option B</h3><ul style="padding-left:1.2em;margin:0"><li style="font-size:18px;margin:6px 0">Feature 1</li><li style="font-size:18px;margin:6px 0">Feature 2</li><li style="font-size:18px;margin:6px 0">Feature 3</li></ul></div></div>',
    preview: '<div style="font-size:7px;font-weight:700;margin-bottom:3px">Comparison</div><div style="display:flex;gap:3px"><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;border-radius:3px"><div style="font-size:5px;font-weight:600;color:#34a853">A</div><div style="font-size:3px">&#8226;&#8226;&#8226;</div></div><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;border-radius:3px"><div style="font-size:5px;font-weight:600;color:#4285f4">B</div><div style="font-size:3px">&#8226;&#8226;&#8226;</div></div></div>',
  },
  'title-image': {
    name: 'Title + Image',
    content: '<div style="display:flex;gap:32px;align-items:center;height:100%"><div style="flex:1"><h2 style="font-size:36px;margin:0 0 16px">Title Here</h2><p style="font-size:20px;margin:0;opacity:0.8">Description text goes here. Click the image icon to insert your image.</p></div><div style="flex:1;display:flex;align-items:center;justify-content:center"><div style="width:100%;aspect-ratio:4/3;background:rgba(128,128,128,0.1);border:2px dashed rgba(128,128,128,0.3);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">IMG</div></div></div>',
    preview: '<div style="display:flex;gap:3px;align-items:center;height:100%"><div style="flex:1"><div style="font-size:6px;font-weight:700">Title</div><div style="font-size:4px;opacity:0.6">Text...</div></div><div style="flex:1;background:rgba(0,0,0,0.05);border-radius:2px;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-size:8px;opacity:0.3">IMG</div></div>',
  },
  'big-number': {
    name: 'Big Number',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:120px;font-weight:900;line-height:1;opacity:0.9">42%</div><p style="font-size:28px;margin:20px 0 0;opacity:0.6">Key statistic or metric</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:18px;font-weight:900;line-height:1">42%</div><div style="font-size:5px;opacity:0.5;margin-top:2px">Metric</div></div>',
  },
  'quote': {
    name: 'Quote',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 40px"><div style="font-size:72px;line-height:0.8;opacity:0.15;font-family:Georgia,serif">&ldquo;</div><blockquote style="font-size:32px;font-style:italic;margin:0;line-height:1.5;padding:0 20px">Insert your quote here. Make it meaningful and impactful.</blockquote><p style="font-size:18px;margin:24px 0 0 20px;opacity:0.6">&mdash; Author Name</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 4px"><div style="font-size:14px;line-height:0.8;opacity:0.15">&ldquo;</div><div style="font-size:5px;font-style:italic;padding:0 3px">Quote text...</div><div style="font-size:4px;opacity:0.5;margin-top:2px;padding-left:3px">-- Author</div></div>',
  },
};

const ST = {
  // Slide data
  slides: [
    { content: LAYOUTS.title, notes: '', theme: 'default', transition: 'none' },
  ],
  activeSlideIdx: 0,

  // DOM references
  canvasEl: null,
  panelEl: null,
  notesEl: null,
  themeSelect: null,
  transitionSelect: null,

  // Canvas zoom
  _canvasZoom: 1,

  // Object selection
  slideSelectedObjects: [],
  slideIsResizing: false,
  slideIsRotating: false,
  slideIsDragging: false,
  _slideClipboard: [],

  // Undo/Redo
  _slideUndoStack: [],
  _slideRedoStack: [],
  SLIDE_UNDO_MAX: 30,

  // Grid
  slideGridVisible: false,
  snapGridSize: 20,
  snapGridEnabled: false,

  // Animation timeline
  animTimelineOpen: false,

  // Smart guides
  smartGuidesEnabled: true,
  SNAP_THRESHOLD: 5,

  // Sorter
  sorterSelectedIndices: new Set(),
  sorterClipboard: [],

  // View toggle
  currentSlideView: 'normal',

  // Morph transition
  morphPreviousSlide: null,

  // Cleanup tracking
  _slideCleanupRefs: {
    listeners: [],
    intervals: [],
  },
};

export default ST;
export { LAYOUTS, SLIDE_TEMPLATES, MASTER_SLIDES, MASTER_LAYOUTS };
