// OfficeLink SL — Slide File I/O

import { getSlidesData, setSlidesData } from './slide-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';

let currentName = 'untitled-presentation.html';

const THEMES = {
  default: 'background:#fff;color:#333',
  dark: 'background:#1a1a2e;color:#eee',
  blue: 'background:linear-gradient(135deg,#0f3460,#16213e);color:#eee',
  green: 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee',
};

/**
 * Open a slide presentation file (.html or .json)
 */
export async function openSlideFile() {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Presentation Files', accept: {
        'text/html': ['.html'],
        'application/json': ['.json'],
      } }],
    });
    const file = await handle.getFile();
    const text = await file.text();
    importSlideContent(file.name, text);
    currentName = file.name;
    return { name: file.name };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      const text = await file.text();
      importSlideContent(file.name, text);
      currentName = file.name;
      resolve({ name: file.name });
    };
    input.click();
  });
}

/**
 * Route import by file type
 */
function importSlideContent(name, text) {
  if (/\.json$/i.test(name)) {
    parseSlideJSON(text);
  } else {
    parsePresentation(text);
  }
}

/**
 * Save slides as JSON (preserves all features: transitions, animations, notes, etc.)
 */
export async function saveSlideJSON() {
  const slides = getSlidesData();
  const payload = {
    version: 1,
    generator: 'OfficeLink SL',
    created: new Date().toISOString(),
    slides: slides.map((s) => ({
      content: s.content || '',
      notes: s.notes || '',
      theme: s.theme || 'default',
      transition: s.transition || 'none',
      transitionDuration: s.transitionDuration || 0.5,
      transitionEasing: s.transitionEasing || 'ease',
      animations: s.animations || [],
      layout: s.layout || null,
      background: s.background || null,
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const tsName = generateTimestampFilename(currentName.replace(/\.html?$/i, ''), 'json');
  const blob = new Blob([json], { type: 'application/json' });

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'Slide JSON', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { name: handle.name || tsName };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
  return { name: tsName };
}

/**
 * Parse JSON slide format with validation
 */
function parseSlideJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    alert('Invalid JSON file. The file may be corrupted.');
    console.error('Slide JSON parse error:', e);
    return;
  }

  // Validate structure
  if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
    // Try bare array format
    if (Array.isArray(data) && data.length > 0) {
      const validated = validateSlides(data);
      if (validated.length > 0) { setSlidesData(validated); return; }
    }
    alert('Invalid slide file format. Expected { slides: [...] } or an array of slides.');
    return;
  }

  const validated = validateSlides(data.slides);
  if (validated.length === 0) {
    alert('No valid slides found in the file.');
    return;
  }
  setSlidesData(validated);
}

/**
 * Validate and sanitize slide data
 */
function validateSlides(slides) {
  return slides.filter((s) => s && typeof s === 'object').map((s) => ({
    content: typeof s.content === 'string' ? s.content : '',
    notes: typeof s.notes === 'string' ? s.notes : '',
    theme: typeof s.theme === 'string' ? s.theme : 'default',
    transition: typeof s.transition === 'string' ? s.transition : 'none',
    transitionDuration: typeof s.transitionDuration === 'number' ? s.transitionDuration : 0.5,
    transitionEasing: typeof s.transitionEasing === 'string' ? s.transitionEasing : 'ease',
    animations: Array.isArray(s.animations) ? s.animations : [],
    layout: s.layout || null,
    background: s.background || null,
  }));
}

/**
 * Save as standalone HTML presentation
 */
export async function saveSlideFile() {
  const html = buildPresHTML();
  const tsName = generateTimestampFilename(currentName, 'html');
  const blob = new Blob([html], { type: 'text/html' });

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'Presentation', accept: { 'text/html': ['.html'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    currentName = handle.name || tsName;
    return { name: currentName };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
  currentName = tsName;
  return { name: tsName };
}

export function getSlideFileName() {
  return currentName;
}

/**
 * Build standalone HTML presentation (navigable with arrow keys)
 */
function buildPresHTML() {
  const slides = getSlidesData();
  let slidesHTML = '';
  slides.forEach((s, i) => {
    const themeStyle = THEMES[s.theme] || THEMES.default;
    const transition = s.transition || 'none';
    const transitionDuration = s.transitionDuration || 0.5;
    const transitionEasing = s.transitionEasing || 'ease';
    slidesHTML += `<section class="slide" style="${themeStyle}" data-notes="${escape(s.notes || '')}" data-transition="${transition}" data-transition-duration="${transitionDuration}" data-transition-easing="${transitionEasing}">${s.content}</section>\n`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(currentName.replace(/\.html?$/i, ''))}</title>
<meta name="generator" content="OfficeLink SL">
<!-- MARKLINK_SLIDE_DATA:${btoa(JSON.stringify(slides))} -->
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:64px 96px;font-size:32px;line-height:1.5}
.slide.active{display:flex}
.slide h1{font-size:56px;margin:0 0 16px}
.slide h2{font-size:40px;margin:0 0 12px}
.slide h3{font-size:28px;margin:0 0 8px}
.slide ul,.slide ol{padding-left:1.5em;margin:8px 0}
.slide li{margin:8px 0;font-size:28px}
.slide img{max-width:100%;max-height:70vh}
.nav{position:fixed;bottom:16px;right:16px;color:#fff;font-size:14px;opacity:0.5;z-index:10}
</style>
</head>
<body>
${slidesHTML}
<div class="nav"><span id="counter"></span> | ESC to exit</div>
<script>
const slides=document.querySelectorAll('.slide');
let idx=0;
function show(i){slides.forEach((s,j)=>s.classList.toggle('active',j===i));document.getElementById('counter').textContent=(i+1)+'/'+slides.length}
show(0);
document.addEventListener('keydown',e=>{
if(e.key==='ArrowRight'||e.key===' '||e.key==='Enter'){e.preventDefault();if(idx<slides.length-1){idx++;show(idx)}}
else if(e.key==='ArrowLeft'){e.preventDefault();if(idx>0){idx--;show(idx)}}
});
document.addEventListener('click',()=>{if(idx<slides.length-1){idx++;show(idx)}});
</script>
</body>
</html>`;
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escape(s) {
  return encodeURIComponent(s);
}

/**
 * Parse a OfficeLink presentation HTML file
 */
function parsePresentation(html) {
  // Try to find embedded slide data
  const dataMatch = html.match(/MARKLINK_SLIDE_DATA:([A-Za-z0-9+/=]+)/);
  if (dataMatch) {
    try {
      const data = JSON.parse(atob(dataMatch[1]));
      if (Array.isArray(data) && data.length > 0) {
        setSlidesData(validateSlides(data));
        return;
      }
    } catch (e) {
      console.warn('Failed to parse embedded slide data:', e);
      /* fall through to DOM parsing */
    }
  }

  // Fallback: parse <section class="slide"> elements
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const sections = doc.querySelectorAll('.slide');
    if (sections.length > 0) {
      const slides = Array.from(sections).map((s) => ({
        content: s.innerHTML,
        notes: decodeURIComponent(s.getAttribute('data-notes') || ''),
        theme: 'default',
        transition: s.getAttribute('data-transition') || 'none',
        transitionDuration: parseFloat(s.getAttribute('data-transition-duration')) || 0.5,
        transitionEasing: s.getAttribute('data-transition-easing') || 'ease',
        animations: [],
      }));
      setSlidesData(validateSlides(slides));
    } else {
      alert('No slides found in the imported file.');
    }
  } catch (e) {
    console.error('Presentation parse error:', e);
    alert('Failed to parse presentation file. The file may be corrupted.');
  }
}
