/**
 * OfficeLink SL — Photo Editor Shaders
 * All GLSL shader sources for WebGL multi-pass rendering pipeline
 */

export const VERT_SRC = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
varying vec2 vUv;
void main() {
  vUv = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

export const BASIC_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform vec3 uColorTempRGB;
uniform float uSaturation;
uniform float uVibrance;
varying vec2 vUv;
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 color = texColor.rgb;
  color *= pow(2.0, uExposure);
  color = (color - 0.5) * (1.0 + uContrast / 100.0) + 0.5;
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float highlightMask = smoothstep(0.5, 1.0, lum);
  float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
  color += color * highlightMask * (uHighlights / 200.0);
  color += color * shadowMask * (uShadows / 200.0);
  color *= uColorTempRGB;
  float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(gray), color, 1.0 + uSaturation / 100.0);
  float currentSat = length(color - vec3(gray)) / (gray + 0.001);
  float vibranceWeight = 1.0 - clamp(currentSat, 0.0, 1.0);
  color = mix(vec3(gray), color, 1.0 + uVibrance / 100.0 * vibranceWeight);
  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, texColor.a);
}`;

export const HSL_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform vec3 uHSL_Red;
uniform vec3 uHSL_Orange;
uniform vec3 uHSL_Yellow;
uniform vec3 uHSL_Green;
uniform vec3 uHSL_Aqua;
uniform vec3 uHSL_Blue;
uniform vec3 uHSL_Purple;
uniform vec3 uHSL_Magenta;
varying vec2 vUv;
vec3 rgb2hsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) / 2.0;
  float d = maxC - minC;
  float s = 0.0;
  float h = 0.0;
  if (d > 0.001) {
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) { h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0); }
    else if (maxC == c.g) { h = (c.b - c.r) / d + 2.0; }
    else { h = (c.r - c.g) / d + 4.0; }
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x; float s = hsl.y; float l = hsl.z;
  if (s < 0.001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0/3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0/3.0));
}
float channelWeight(float hue, float center, float width) {
  float dist = abs(hue - center);
  if (dist > 0.5) dist = 1.0 - dist;
  return smoothstep(width, 0.0, dist);
}
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 hsl = rgb2hsl(texColor.rgb);
  float h = hsl.x;
  float w = 1.0 / 12.0;
  float wR = max(channelWeight(h, 0.0/360.0, w), channelWeight(h, 360.0/360.0, w));
  float wO = channelWeight(h, 30.0/360.0, w);
  float wY = channelWeight(h, 60.0/360.0, w);
  float wG = channelWeight(h, 120.0/360.0, w);
  float wA = channelWeight(h, 180.0/360.0, w);
  float wB = channelWeight(h, 240.0/360.0, w);
  float wP = channelWeight(h, 270.0/360.0, w);
  float wM = channelWeight(h, 300.0/360.0, w);
  float totalW = wR + wO + wY + wG + wA + wB + wP + wM + 0.001;
  float hueShift = (wR*uHSL_Red.x + wO*uHSL_Orange.x + wY*uHSL_Yellow.x + wG*uHSL_Green.x + wA*uHSL_Aqua.x + wB*uHSL_Blue.x + wP*uHSL_Purple.x + wM*uHSL_Magenta.x) / totalW;
  float satShift = (wR*uHSL_Red.y + wO*uHSL_Orange.y + wY*uHSL_Yellow.y + wG*uHSL_Green.y + wA*uHSL_Aqua.y + wB*uHSL_Blue.y + wP*uHSL_Purple.y + wM*uHSL_Magenta.y) / totalW;
  float lumShift = (wR*uHSL_Red.z + wO*uHSL_Orange.z + wY*uHSL_Yellow.z + wG*uHSL_Green.z + wA*uHSL_Aqua.z + wB*uHSL_Blue.z + wP*uHSL_Purple.z + wM*uHSL_Magenta.z) / totalW;
  hsl.x = fract(hsl.x + hueShift / 360.0);
  hsl.y = clamp(hsl.y * (1.0 + satShift / 100.0), 0.0, 1.0);
  hsl.z = clamp(hsl.z + lumShift / 200.0, 0.0, 1.0);
  gl_FragColor = vec4(hsl2rgb(hsl), texColor.a);
}`;

export const SPLIT_TONE_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform float uShadowHue;
uniform float uShadowSat;
uniform float uHighlightHue;
uniform float uHighlightSat;
uniform float uBalance;
varying vec2 vUv;
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x; float s = hsl.y; float l = hsl.z;
  if (s < 0.001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  float tr = h + 1.0/3.0; float tg = h; float tb = h - 1.0/3.0;
  if (tr > 1.0) tr -= 1.0; if (tb < 0.0) tb += 1.0;
  float r = tr < 1.0/6.0 ? p+(q-p)*6.0*tr : tr < 0.5 ? q : tr < 2.0/3.0 ? p+(q-p)*(2.0/3.0-tr)*6.0 : p;
  float g = tg < 1.0/6.0 ? p+(q-p)*6.0*tg : tg < 0.5 ? q : tg < 2.0/3.0 ? p+(q-p)*(2.0/3.0-tg)*6.0 : p;
  float b = tb < 1.0/6.0 ? p+(q-p)*6.0*tb : tb < 0.5 ? q : tb < 2.0/3.0 ? p+(q-p)*(2.0/3.0-tb)*6.0 : p;
  return vec3(r, g, b);
}
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 color = texColor.rgb;
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float balanceNorm = uBalance / 100.0;
  float threshold = 0.5 + balanceNorm * 0.3;
  float shadowWeight = (1.0 - smoothstep(0.0, threshold, lum)) * (uShadowSat / 100.0);
  float highlightWeight = smoothstep(threshold, 1.0, lum) * (uHighlightSat / 100.0);
  if (shadowWeight > 0.001) {
    vec3 shadowTint = hsl2rgb(vec3(uShadowHue / 360.0, 1.0, lum));
    color = mix(color, shadowTint, shadowWeight * 0.5);
  }
  if (highlightWeight > 0.001) {
    vec3 highlightTint = hsl2rgb(vec3(uHighlightHue / 360.0, 1.0, lum));
    color = mix(color, highlightTint, highlightWeight * 0.5);
  }
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
}`;

export const CLARITY_BLUR_H_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 texelSize = 1.0 / uResolution;
  vec3 result = vec3(0.0);
  float total = 0.0;
  int r = int(uRadius);
  for (int i = -50; i <= 50; i++) {
    if (i > r || i < -r) continue;
    float weight = exp(-float(i * i) / (2.0 * uRadius * uRadius / 4.0));
    vec2 offset = vec2(float(i) * texelSize.x, 0.0);
    result += texture2D(uTexture, vUv + offset).rgb * weight;
    total += weight;
  }
  gl_FragColor = vec4(result / total, 1.0);
}`;

export const CLARITY_BLUR_V_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 texelSize = 1.0 / uResolution;
  vec3 result = vec3(0.0);
  float total = 0.0;
  int r = int(uRadius);
  for (int i = -50; i <= 50; i++) {
    if (i > r || i < -r) continue;
    float weight = exp(-float(i * i) / (2.0 * uRadius * uRadius / 4.0));
    vec2 offset = vec2(0.0, float(i) * texelSize.y);
    result += texture2D(uTexture, vUv + offset).rgb * weight;
    total += weight;
  }
  gl_FragColor = vec4(result / total, 1.0);
}`;

export const CLARITY_APPLY_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform sampler2D uBlurred;
uniform float uClarity;
varying vec2 vUv;
void main() {
  vec3 original = texture2D(uTexture, vUv).rgb;
  vec3 blurred = texture2D(uBlurred, vUv).rgb;
  vec3 detail = original - blurred;
  vec3 result = original + detail * (uClarity / 100.0);
  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}`;

export const GRAIN_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform float uGrainAmount;
uniform float uGrainSize;
uniform float uTime;
varying vec2 vUv;
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 color = texColor.rgb;
  float scale = max(1.0, 101.0 - uGrainSize);
  vec2 grainUv = vUv * scale + vec2(uTime);
  float noise = rand(grainUv) - 0.5;
  noise *= uGrainAmount / 100.0;
  color += noise;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
}`;

export const SELECTIVE_COLOR_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform int uNumRanges;
uniform vec2 uHueRanges[8];
uniform float uDesaturateStrength;
varying vec2 vUv;
vec3 rgb2hsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) / 2.0;
  float d = maxC - minC;
  float s = 0.0; float h = 0.0;
  if (d > 0.001) {
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 color = texColor.rgb;
  vec3 hsl = rgb2hsl(color);
  float hue = hsl.x * 360.0;
  float preserve = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumRanges) break;
    float center = uHueRanges[i].x;
    float width = uHueRanges[i].y;
    float dist = abs(hue - center);
    if (dist > 180.0) dist = 360.0 - dist;
    float feather = width * 0.3;
    preserve = max(preserve, 1.0 - smoothstep(width * 0.5, width * 0.5 + feather, dist));
  }
  float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float desat = (1.0 - preserve) * (uDesaturateStrength / 100.0);
  color = mix(color, vec3(gray), desat);
  gl_FragColor = vec4(color, texColor.a);
}`;

export const VIGNETTE_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform float uAmount;
uniform float uMidpoint;
uniform float uRoundness;
uniform float uFeather;
varying vec2 vUv;
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 color = texColor.rgb;
  vec2 center = vUv - 0.5;
  float aspect = 1.0 + uRoundness * 0.5;
  center.x *= mix(1.0, aspect, step(0.0, uRoundness));
  center.y *= mix(aspect, 1.0, step(0.0, uRoundness));
  float dist = length(center) * 2.0;
  float start = uMidpoint;
  float end = start + uFeather * (1.0 - start);
  float vignette = 1.0 - smoothstep(start, max(end, start + 0.01), dist);
  float darken = mix(1.0, vignette, uAmount);
  color *= darken;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
}`;

export const TONE_CURVE_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform sampler2D uCurveLUT;
varying vec2 vUv;
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 color = texColor.rgb;
  float r = texture2D(uCurveLUT, vec2(color.r, 0.5)).g;
  float g = texture2D(uCurveLUT, vec2(color.g, 0.5)).b;
  float b = texture2D(uCurveLUT, vec2(color.b, 0.5)).a;
  r = texture2D(uCurveLUT, vec2(r, 0.5)).r;
  g = texture2D(uCurveLUT, vec2(g, 0.5)).r;
  b = texture2D(uCurveLUT, vec2(b, 0.5)).r;
  gl_FragColor = vec4(r, g, b, texColor.a);
}`;

export const LENS_CORRECTION_FRAG = `
precision highp float;
uniform sampler2D uTexture;
uniform float uDistortion;
uniform float uCaRed;
uniform float uCaBlue;
varying vec2 vUv;

vec2 barrelDistort(vec2 uv, float k) {
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);
  float distort = 1.0 + k * r2;
  return centered * distort + 0.5;
}

void main() {
  // Barrel/pincushion distortion
  float k = uDistortion * 0.005;
  vec2 uvDist = barrelDistort(vUv, k);

  // Chromatic aberration: offset R and B channels
  float caR = uCaRed * 0.001;
  float caB = uCaBlue * 0.001;
  vec2 uvR = barrelDistort(vUv, k + caR);
  vec2 uvB = barrelDistort(vUv, k + caB);

  // Clamp to valid range
  float r = (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0)
    ? texture2D(uTexture, uvR).r : 0.0;
  float g = texture2D(uTexture, uvDist).g;
  float b = (uvB.x >= 0.0 && uvB.x <= 1.0 && uvB.y >= 0.0 && uvB.y <= 1.0)
    ? texture2D(uTexture, uvB).b : 0.0;
  float a = texture2D(uTexture, uvDist).a;

  // Check if main UV is out of bounds
  if (uvDist.x < 0.0 || uvDist.x > 1.0 || uvDist.y < 0.0 || uvDist.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    gl_FragColor = vec4(r, g, b, a);
  }
}`;
