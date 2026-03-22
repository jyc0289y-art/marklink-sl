/**
 * OfficeLink SL — Photo WebGL Engine
 * Multi-pass rendering pipeline ported from PhotoLink (React/TS → vanilla JS)
 */

import {
  VERT_SRC, BASIC_FRAG, HSL_FRAG, SPLIT_TONE_FRAG,
  CLARITY_BLUR_H_FRAG, CLARITY_BLUR_V_FRAG, CLARITY_APPLY_FRAG,
  GRAIN_FRAG, SELECTIVE_COLOR_FRAG, VIGNETTE_FRAG, TONE_CURVE_FRAG,
} from './shaders.js';

/* ---------- Color Temperature Helper ---------- */
function colorTempToRGBAbsolute(tempK) {
  const temp = tempK / 100;
  let r, g, b;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }
  return [
    Math.max(0, Math.min(255, r)) / 255,
    Math.max(0, Math.min(255, g)) / 255,
    Math.max(0, Math.min(255, b)) / 255,
  ];
}

export function colorTempToRGB(tempK) {
  const temp = tempK / 100;
  let r, g, b;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }
  r = Math.max(0, Math.min(255, r)) / 255;
  g = Math.max(0, Math.min(255, g)) / 255;
  b = Math.max(0, Math.min(255, b)) / 255;
  const base = colorTempToRGBAbsolute(5800);
  return [r / base[0], g / base[1], b / base[2]];
}

/* ---------- Default Edit Parameters ---------- */
const DEFAULT_HSL_CHANNEL = { hue: 0, saturation: 0, luminance: 0 };

export const DEFAULT_PARAMS = {
  rotation: 0,
  flipH: false,
  flipV: false,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  colorTemp: 5800,
  saturation: 0,
  vibrance: 0,
  hsl: {
    red: { ...DEFAULT_HSL_CHANNEL },
    orange: { ...DEFAULT_HSL_CHANNEL },
    yellow: { ...DEFAULT_HSL_CHANNEL },
    green: { ...DEFAULT_HSL_CHANNEL },
    aqua: { ...DEFAULT_HSL_CHANNEL },
    blue: { ...DEFAULT_HSL_CHANNEL },
    purple: { ...DEFAULT_HSL_CHANNEL },
    magenta: { ...DEFAULT_HSL_CHANNEL },
  },
  splitToning: { shadowHue: 0, shadowSat: 0, highlightHue: 0, highlightSat: 0, balance: 0 },
  clarity: 0,
  grain: { amount: 0, size: 50 },
  selectiveColor: { enabled: false, preserveHueRanges: [], desaturateStrength: 0 },
  vignette: { amount: 0, midpoint: 50, roundness: 0, feather: 60 },
  toneCurve: {
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  },
  rotation: 0,
  flipH: false,
  flipV: false,
};

export function cloneParams(p) {
  return JSON.parse(JSON.stringify(p));
}

/* ---------- WebGL Engine ---------- */
export class WebGLEngine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;
    this.programs = {};
    this.quadBuffer = null;
    this.texCoordBuffer = null;
    this.sourceTexture = null;
    this.fbos = [];
    this.fboTextures = [];
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.curveLUTTexture = null;
    this._initBuffers();
    this._initPrograms();
  }

  _initBuffers() {
    const gl = this.gl;
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  }

  _compileShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile error: ' + log);
    }
    return shader;
  }

  _createProgram(fragSrc, uniformNames) {
    const gl = this.gl;
    const vert = this._compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.bindAttribLocation(program, 1, 'aTexCoord');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
    }
    const uniforms = {};
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  _initPrograms() {
    this.programs.basic = this._createProgram(BASIC_FRAG, [
      'uTexture', 'uExposure', 'uContrast', 'uHighlights', 'uShadows',
      'uColorTempRGB', 'uSaturation', 'uVibrance',
    ]);
    this.programs.hsl = this._createProgram(HSL_FRAG, [
      'uTexture',
      'uHSL_Red', 'uHSL_Orange', 'uHSL_Yellow', 'uHSL_Green',
      'uHSL_Aqua', 'uHSL_Blue', 'uHSL_Purple', 'uHSL_Magenta',
    ]);
    this.programs.splitTone = this._createProgram(SPLIT_TONE_FRAG, [
      'uTexture', 'uShadowHue', 'uShadowSat', 'uHighlightHue', 'uHighlightSat', 'uBalance',
    ]);
    this.programs.clarityBlurH = this._createProgram(CLARITY_BLUR_H_FRAG, [
      'uTexture', 'uResolution', 'uRadius',
    ]);
    this.programs.clarityBlurV = this._createProgram(CLARITY_BLUR_V_FRAG, [
      'uTexture', 'uResolution', 'uRadius',
    ]);
    this.programs.clarityApply = this._createProgram(CLARITY_APPLY_FRAG, [
      'uTexture', 'uBlurred', 'uClarity',
    ]);
    this.programs.grain = this._createProgram(GRAIN_FRAG, [
      'uTexture', 'uGrainAmount', 'uGrainSize', 'uTime',
    ]);
    this.programs.selectiveColor = this._createProgram(SELECTIVE_COLOR_FRAG, [
      'uTexture', 'uNumRanges', 'uDesaturateStrength',
      ...Array.from({ length: 8 }, (_, i) => `uHueRanges[${i}]`),
    ]);
    this.programs.vignette = this._createProgram(VIGNETTE_FRAG, [
      'uTexture', 'uAmount', 'uMidpoint', 'uRoundness', 'uFeather',
    ]);
    this.programs.toneCurve = this._createProgram(TONE_CURVE_FRAG, [
      'uTexture', 'uCurveLUT',
    ]);
  }

  _createFBO() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.imageWidth, this.imageHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, texture };
  }

  _drawQuad(prog) {
    const gl = this.gl;
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _bindTexture(unit, texture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  _cleanupFBOs() {
    const gl = this.gl;
    for (const fbo of this.fbos) gl.deleteFramebuffer(fbo);
    for (const tex of this.fboTextures) gl.deleteTexture(tex);
    this.fbos = [];
    this.fboTextures = [];
  }

  loadImage(image) {
    const gl = this.gl;
    this.imageWidth = image.width;
    this.imageHeight = image.height;
    this.canvas.width = image.width;
    this.canvas.height = image.height;
    gl.viewport(0, 0, image.width, image.height);

    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    this.sourceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._cleanupFBOs();
    for (let i = 0; i < 3; i++) {
      const { fbo, texture } = this._createFBO();
      this.fbos.push(fbo);
      this.fboTextures.push(texture);
    }
  }

  render(params) {
    if (!this.sourceTexture || this.fbos.length < 3) return;
    const gl = this.gl;
    let currentTexture = this.sourceTexture;
    let fboIndex = 0;

    const renderPass = (prog, setUniforms, toScreen = false) => {
      if (!toScreen) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[fboIndex]);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.viewport(0, 0, this.imageWidth, this.imageHeight);
      gl.useProgram(prog.program);
      this._bindTexture(0, currentTexture);
      gl.uniform1i(prog.uniforms['uTexture'], 0);
      setUniforms();
      this._drawQuad(prog);
      if (!toScreen) {
        currentTexture = this.fboTextures[fboIndex];
        fboIndex = (fboIndex + 1) % 2;
      }
    };

    // Pass 1: Basic adjustments
    const tempRGB = colorTempToRGB(params.colorTemp);
    const basicProg = this.programs.basic;
    renderPass(basicProg, () => {
      gl.uniform1f(basicProg.uniforms['uExposure'], params.exposure);
      gl.uniform1f(basicProg.uniforms['uContrast'], params.contrast);
      gl.uniform1f(basicProg.uniforms['uHighlights'], params.highlights);
      gl.uniform1f(basicProg.uniforms['uShadows'], params.shadows);
      gl.uniform3f(basicProg.uniforms['uColorTempRGB'], tempRGB[0], tempRGB[1], tempRGB[2]);
      gl.uniform1f(basicProg.uniforms['uSaturation'], params.saturation);
      gl.uniform1f(basicProg.uniforms['uVibrance'], params.vibrance);
    });

    // Pass 2: HSL
    const hasHSL = Object.values(params.hsl).some(ch => ch.hue !== 0 || ch.saturation !== 0 || ch.luminance !== 0);
    if (hasHSL) {
      const hslProg = this.programs.hsl;
      renderPass(hslProg, () => {
        const channels = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
        const keys = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
        for (let i = 0; i < channels.length; i++) {
          const ch = params.hsl[keys[i]];
          gl.uniform3f(hslProg.uniforms[`uHSL_${channels[i]}`], ch.hue, ch.saturation, ch.luminance);
        }
      });
    }

    // Pass 3: Split toning
    const hasSplitTone = params.splitToning.shadowSat > 0 || params.splitToning.highlightSat > 0;
    if (hasSplitTone) {
      const stProg = this.programs.splitTone;
      renderPass(stProg, () => {
        gl.uniform1f(stProg.uniforms['uShadowHue'], params.splitToning.shadowHue);
        gl.uniform1f(stProg.uniforms['uShadowSat'], params.splitToning.shadowSat);
        gl.uniform1f(stProg.uniforms['uHighlightHue'], params.splitToning.highlightHue);
        gl.uniform1f(stProg.uniforms['uHighlightSat'], params.splitToning.highlightSat);
        gl.uniform1f(stProg.uniforms['uBalance'], params.splitToning.balance);
      });
    }

    // Pass 4: Clarity (multi-pass blur + unsharp mask)
    if (params.clarity !== 0) {
      const radius = Math.abs(params.clarity) * 0.5 + 5;
      // Copy pre-clarity to fbo[2]
      const copyProg = this.programs.basic;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[2]);
      gl.viewport(0, 0, this.imageWidth, this.imageHeight);
      gl.useProgram(copyProg.program);
      this._bindTexture(0, currentTexture);
      gl.uniform1i(copyProg.uniforms['uTexture'], 0);
      gl.uniform1f(copyProg.uniforms['uExposure'], 0);
      gl.uniform1f(copyProg.uniforms['uContrast'], 0);
      gl.uniform1f(copyProg.uniforms['uHighlights'], 0);
      gl.uniform1f(copyProg.uniforms['uShadows'], 0);
      gl.uniform3f(copyProg.uniforms['uColorTempRGB'], 1, 1, 1);
      gl.uniform1f(copyProg.uniforms['uSaturation'], 0);
      gl.uniform1f(copyProg.uniforms['uVibrance'], 0);
      this._drawQuad(copyProg);

      // Horizontal blur
      const blurHProg = this.programs.clarityBlurH;
      renderPass(blurHProg, () => {
        gl.uniform2f(blurHProg.uniforms['uResolution'], this.imageWidth, this.imageHeight);
        gl.uniform1f(blurHProg.uniforms['uRadius'], radius);
      });
      // Vertical blur
      const blurVProg = this.programs.clarityBlurV;
      renderPass(blurVProg, () => {
        gl.uniform2f(blurVProg.uniforms['uResolution'], this.imageWidth, this.imageHeight);
        gl.uniform1f(blurVProg.uniforms['uRadius'], radius);
      });
      // Apply clarity
      const blurredTexture = currentTexture;
      const clarityProg = this.programs.clarityApply;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[fboIndex]);
      gl.viewport(0, 0, this.imageWidth, this.imageHeight);
      gl.useProgram(clarityProg.program);
      this._bindTexture(0, this.fboTextures[2]);
      gl.uniform1i(clarityProg.uniforms['uTexture'], 0);
      this._bindTexture(1, blurredTexture);
      gl.uniform1i(clarityProg.uniforms['uBlurred'], 1);
      gl.uniform1f(clarityProg.uniforms['uClarity'], params.clarity);
      this._drawQuad(clarityProg);
      currentTexture = this.fboTextures[fboIndex];
      fboIndex = (fboIndex + 1) % 2;
    }

    // Pass 5: Selective color
    if (params.selectiveColor.enabled && params.selectiveColor.preserveHueRanges.length > 0) {
      const scProg = this.programs.selectiveColor;
      renderPass(scProg, () => {
        gl.uniform1i(scProg.uniforms['uNumRanges'], params.selectiveColor.preserveHueRanges.length);
        gl.uniform1f(scProg.uniforms['uDesaturateStrength'], params.selectiveColor.desaturateStrength);
        for (let i = 0; i < 8; i++) {
          const range = params.selectiveColor.preserveHueRanges[i];
          gl.uniform2f(scProg.uniforms[`uHueRanges[${i}]`], range ? range.center : 0, range ? range.width : 0);
        }
      });
    }

    // Pass 6: Tone Curve
    if (this._hasToneCurveChanges(params.toneCurve)) {
      this._updateCurveLUT(params.toneCurve);
      const tcProg = this.programs.toneCurve;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[fboIndex]);
      gl.viewport(0, 0, this.imageWidth, this.imageHeight);
      gl.useProgram(tcProg.program);
      this._bindTexture(0, currentTexture);
      gl.uniform1i(tcProg.uniforms['uTexture'], 0);
      this._bindTexture(1, this.curveLUTTexture);
      gl.uniform1i(tcProg.uniforms['uCurveLUT'], 1);
      this._drawQuad(tcProg);
      currentTexture = this.fboTextures[fboIndex];
      fboIndex = (fboIndex + 1) % 2;
    }

    // Pass 7: Vignette
    if (params.vignette.amount > 0) {
      const vigProg = this.programs.vignette;
      renderPass(vigProg, () => {
        gl.uniform1f(vigProg.uniforms['uAmount'], params.vignette.amount / 100);
        gl.uniform1f(vigProg.uniforms['uMidpoint'], params.vignette.midpoint / 100);
        gl.uniform1f(vigProg.uniforms['uRoundness'], params.vignette.roundness / 100);
        gl.uniform1f(vigProg.uniforms['uFeather'], params.vignette.feather / 100);
      });
    }

    // Pass 8: Grain
    if (params.grain.amount > 0) {
      const grainProg = this.programs.grain;
      renderPass(grainProg, () => {
        gl.uniform1f(grainProg.uniforms['uGrainAmount'], params.grain.amount);
        gl.uniform1f(grainProg.uniforms['uGrainSize'], params.grain.size);
        gl.uniform1f(grainProg.uniforms['uTime'], performance.now() * 0.001);
      }, true);
      return;
    }

    // Final pass to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.imageWidth, this.imageHeight);
    const finalProg = this.programs.basic;
    gl.useProgram(finalProg.program);
    this._bindTexture(0, currentTexture);
    gl.uniform1i(finalProg.uniforms['uTexture'], 0);
    gl.uniform1f(finalProg.uniforms['uExposure'], 0);
    gl.uniform1f(finalProg.uniforms['uContrast'], 0);
    gl.uniform1f(finalProg.uniforms['uHighlights'], 0);
    gl.uniform1f(finalProg.uniforms['uShadows'], 0);
    gl.uniform3f(finalProg.uniforms['uColorTempRGB'], 1, 1, 1);
    gl.uniform1f(finalProg.uniforms['uSaturation'], 0);
    gl.uniform1f(finalProg.uniforms['uVibrance'], 0);
    this._drawQuad(finalProg);
  }

  getCanvas() { return this.canvas; }

  _hasToneCurveChanges(tc) {
    const isDefault = (pts) =>
      pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255;
    return !isDefault(tc.rgb) || !isDefault(tc.red) || !isDefault(tc.green) || !isDefault(tc.blue);
  }

  _updateCurveLUT(tc) {
    const gl = this.gl;
    const data = new Uint8Array(256 * 4);
    const masterLUT = this._interpolateCurve(tc.rgb);
    const redLUT = this._interpolateCurve(tc.red);
    const greenLUT = this._interpolateCurve(tc.green);
    const blueLUT = this._interpolateCurve(tc.blue);
    for (let i = 0; i < 256; i++) {
      data[i * 4 + 0] = masterLUT[i];
      data[i * 4 + 1] = redLUT[i];
      data[i * 4 + 2] = greenLUT[i];
      data[i * 4 + 3] = blueLUT[i];
    }
    if (!this.curveLUTTexture) this.curveLUTTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUTTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _interpolateCurve(points) {
    const lut = new Uint8Array(256);
    if (points.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const n = sorted.length;
    const xs = sorted.map(p => p.x);
    const ys = sorted.map(p => p.y);
    const dxs = [], dys = [], ms = [];
    for (let i = 0; i < n - 1; i++) {
      dxs.push(xs[i + 1] - xs[i]);
      dys.push(ys[i + 1] - ys[i]);
      ms.push(dys[i] / Math.max(dxs[i], 0.001));
    }
    const c1s = [ms[0]];
    for (let i = 0; i < dxs.length - 1; i++) {
      if (ms[i] * ms[i + 1] <= 0) { c1s.push(0); }
      else {
        const common = dxs[i] + dxs[i + 1];
        c1s.push(3 * common / ((common + dxs[i + 1]) / ms[i] + (common + dxs[i]) / ms[i + 1]));
      }
    }
    c1s.push(ms[ms.length - 1]);
    const c2s = [], c3s = [];
    for (let i = 0; i < c1s.length - 1; i++) {
      const invDx = 1 / Math.max(dxs[i], 0.001);
      const common = c1s[i] + c1s[i + 1] - 2 * ms[i];
      c2s.push((ms[i] - c1s[i] - common) * invDx);
      c3s.push(common * invDx * invDx);
    }
    for (let x = 0; x < 256; x++) {
      if (x <= xs[0]) { lut[x] = Math.round(Math.max(0, Math.min(255, ys[0]))); }
      else if (x >= xs[n - 1]) { lut[x] = Math.round(Math.max(0, Math.min(255, ys[n - 1]))); }
      else {
        let seg = n - 2;
        for (let i = 0; i < n - 1; i++) { if (x < xs[i + 1]) { seg = i; break; } }
        const diff = x - xs[seg];
        const val = ys[seg] + c1s[seg] * diff + c2s[seg] * diff * diff + c3s[seg] * diff * diff * diff;
        lut[x] = Math.round(Math.max(0, Math.min(255, val)));
      }
    }
    return lut;
  }

  destroy() {
    const gl = this.gl;
    this._cleanupFBOs();
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    this.sourceTexture = null;
    if (this.curveLUTTexture) gl.deleteTexture(this.curveLUTTexture);
    this.curveLUTTexture = null;
    for (const prog of Object.values(this.programs)) {
      gl.deleteProgram(prog.program);
    }
  }
}
