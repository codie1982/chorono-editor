// ── GPUEffectShaders ────────────────────────────────────────────────────────────
//
// GLSL for full-screen image post-processing passes. The current pass is a
// separable Gaussian blur (run twice: horizontal then vertical). Weights are
// computed in-shader from sigma, so no weight array uniform is needed.
//
// Geometry is a full-screen quad in clip space; v_uv is the [0,1] sample coord.
// Textures hold PREMULTIPLIED alpha (uploaded with UNPACK_PREMULTIPLY_ALPHA),
// so the blur averages premultiplied colour and stays halo-free at edges.
//
// MAX_TAPS bounds the loop (GLSL ES 1.00 needs a constant bound). The runtime
// radius uniform breaks the loop early; taps beyond the radius cost nothing.

export interface EffectShaderSources {
  vertex:   string
  fragment: string
}

export const MAX_BLUR_TAPS = 96

const BLUR_MAIN = `
void main() {
  vec4 sum = SAMPLE(u_tex, v_uv);
  float wsum = 1.0;
  for (int i = 1; i < ${MAX_BLUR_TAPS}; i++) {
    if (float(i) > u_radius) break;
    float w = exp(-0.5 * float(i) * float(i) / (u_sigma * u_sigma));
    sum += SAMPLE(u_tex, v_uv + u_dir * float(i)) * w;
    sum += SAMPLE(u_tex, v_uv - u_dir * float(i)) * w;
    wsum += 2.0 * w;
  }
  OUT_COLOR = sum / wsum;
}
`

// ── WebGL2 (GLSL ES 3.00) ───────────────────────────────────────────────────────

function vertex300(): string {
  return `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`
}

function blurFragment300(): string {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_dir;
uniform float u_radius;
uniform float u_sigma;
out vec4 fragColor;
#define SAMPLE(t, uv) texture(t, uv)
#define OUT_COLOR fragColor
${BLUR_MAIN}`
}

// ── WebGL1 (GLSL ES 1.00) ───────────────────────────────────────────────────────

function vertex100(): string {
  return `precision highp float;
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`
}

function blurFragment100(): string {
  return `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_dir;
uniform float u_radius;
uniform float u_sigma;
#define SAMPLE(t, uv) texture2D(t, uv)
#define OUT_COLOR gl_FragColor
${BLUR_MAIN}`
}

// ── Motion-blur accumulation shaders ─────────────────────────────────────────────
// Two full-screen passes sharing the quad vertex shader:
//   - accumulate: OUT = sample * weight  (additive-blended into the accum buffer)
//   - blit:       OUT = sample           (copy the averaged buffer to the GL canvas)

const ACCUMULATE_MAIN = `
void main() {
  OUT_COLOR = SAMPLE(u_tex, v_uv) * u_weight;
}
`

const BLIT_MAIN = `
void main() {
  OUT_COLOR = SAMPLE(u_tex, v_uv);
}
`

function accumulateFragment300(): string {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_weight;
out vec4 fragColor;
#define SAMPLE(t, uv) texture(t, uv)
#define OUT_COLOR fragColor
${ACCUMULATE_MAIN}`
}

function blitFragment300(): string {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 fragColor;
#define SAMPLE(t, uv) texture(t, uv)
#define OUT_COLOR fragColor
${BLIT_MAIN}`
}

function accumulateFragment100(): string {
  return `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_weight;
#define SAMPLE(t, uv) texture2D(t, uv)
#define OUT_COLOR gl_FragColor
${ACCUMULATE_MAIN}`
}

function blitFragment100(): string {
  return `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
#define SAMPLE(t, uv) texture2D(t, uv)
#define OUT_COLOR gl_FragColor
${BLIT_MAIN}`
}

export interface MotionBlurShaderSources {
  vertex:              string
  accumulateFragment:  string
  blitFragment:        string
}

// ── Public ──────────────────────────────────────────────────────────────────────

export function buildBlurShaderSources(isGL2: boolean): EffectShaderSources {
  return isGL2
    ? { vertex: vertex300(), fragment: blurFragment300() }
    : { vertex: vertex100(), fragment: blurFragment100() }
}

export function buildMotionBlurShaderSources(isGL2: boolean): MotionBlurShaderSources {
  return isGL2
    ? { vertex: vertex300(), accumulateFragment: accumulateFragment300(), blitFragment: blitFragment300() }
    : { vertex: vertex100(), accumulateFragment: accumulateFragment100(), blitFragment: blitFragment100() }
}
