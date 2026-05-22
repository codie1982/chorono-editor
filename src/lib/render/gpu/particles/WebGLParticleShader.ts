// ── WebGLParticleShader ─────────────────────────────────────────────────────────
//
// Generates GLSL source for the instanced-quad particle program.
//
// Geometry: a unit quad (corners in [-0.5, 0.5]) is instanced once per particle.
// The vertex shader rotates/scales/translates the corner into world space and
// forwards the UN-rotated corner as v_local so the fragment shader can evaluate
// each shape's SDF in shape-local space.
//
// Output is PREMULTIPLIED alpha (rgb * a, a) to composite cleanly onto a 2D
// canvas via drawImage with blendFunc(ONE, ONE_MINUS_SRC_ALPHA).
//
// Two variants are produced from one shared body:
//   - WebGL2 → GLSL ES 3.00 (in/out, fwidth is core)
//   - WebGL1 → GLSL ES 1.00 (attribute/varying, fwidth via OES_standard_derivatives)

export interface ParticleShaderSources {
  vertex:   string
  fragment: string
}

// ── Shared SDF + main body (version-agnostic GLSL) ──────────────────────────────
// All SDFs take p in [-0.5, 0.5]. Negative = inside, positive = outside.

const SDF_BODY = `
float sdfCircle(vec2 p) {
  return length(p) - 0.5;
}

float sdfBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdfRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdfTriangle(vec2 p) {
  // Equilateral, apex up, fit to [-0.5, 0.5]. Matches CPU drawTriangle.
  const float k = 1.7320508075688772; // sqrt(3)
  p.y = -p.y;
  p.x = abs(p.x) - 0.5;
  p.y = p.y + 0.5 / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -1.0, 0.0);
  return -length(p) * sign(p.y);
}

float sdfStar(vec2 p, float innerRatio, float pts) {
  // Inigo Quilez n-star SDF. innerRatio (0-1) is mapped to the m parameter.
  float n = max(2.0, pts);
  float m = clamp(2.0 + innerRatio * (n - 2.0), 2.0, n);
  float an = 3.14159265359 / n;
  float en = 3.14159265359 / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float r = 0.5;
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

float sdfFlameBlob(vec2 p) {
  // Teardrop approximation — vertical ellipse, slightly shifted. Visual match
  // for the CPU bezier teardrop at particle sizes (not pixel-exact).
  vec2 q = vec2(p.x / 0.4, (p.y + 0.05) / 0.52);
  return (length(q) - 1.0) * 0.4;
}
`

// Returns final premultiplied colour. Soft shapes (softCircle, smokePuff) use a
// radial gradient instead of an SDF edge.
const MAIN_BODY = `
void main() {
  vec2 p = v_local;
  int shape = int(v_shapeId + 0.5);

  // ── Soft radial shapes ──────────────────────────────────────────────────
  if (shape == 1) {
    // softCircle: full to 0.6, fade to 1.0 (matches CPU radial gradient)
    float d = length(p) / 0.5;
    if (d > 1.0) discard;
    float soft = 1.0 - smoothstep(0.6, 1.0, d);
    float a = v_color.a * v_opacity * soft;
    OUT_COLOR = vec4(v_color.rgb * a, a);
    return;
  }
  if (shape == 7) {
    // smokePuff: soft ellipse (0.5 x 0.4)
    float d = length(p / vec2(0.5, 0.4));
    if (d > 1.0) discard;
    float soft = 1.0 - smoothstep(0.5, 1.0, d);
    float a = v_color.a * v_opacity * soft;
    OUT_COLOR = vec4(v_color.rgb * a, a);
    return;
  }

  // ── SDF shapes ──────────────────────────────────────────────────────────
  float sdf;
  if      (shape == 0) sdf = sdfCircle(p);
  else if (shape == 2) sdf = sdfBox(p, vec2(0.5, 0.3));
  else if (shape == 3) sdf = sdfRoundedBox(p, vec2(0.5, 0.3), 0.15);
  else if (shape == 4) sdf = sdfBox(p, vec2(0.04, 0.5));
  else if (shape == 5) sdf = sdfTriangle(p);
  else if (shape == 6) sdf = sdfStar(p, v_shapeParam, float(u_starPoints));
  else if (shape == 8) sdf = sdfFlameBlob(p);
  else                 sdf = sdfCircle(p);

  float aa = AA_WIDTH(sdf);
  float alpha = 1.0 - smoothstep(-aa, aa, sdf);
  if (alpha <= 0.0) discard;

  float a = v_color.a * v_opacity * alpha;
  OUT_COLOR = vec4(v_color.rgb * a, a);
}
`

// ── WebGL2 (GLSL ES 3.00) ───────────────────────────────────────────────────────

function vertex300(): string {
  return `#version 300 es
precision highp float;

in vec2  a_corner;
in vec2  a_position;
in float a_size;
in float a_rotation;
in float a_opacity;
in vec4  a_color;
in float a_shapeId;
in float a_shapeParam;

uniform mat3 u_transform;

out vec2  v_local;
out vec4  v_color;
out float v_opacity;
out float v_shapeId;
out float v_shapeParam;

void main() {
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  vec2 corner = a_corner * a_size;
  vec2 rotated = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  vec3 world = u_transform * vec3(a_position + rotated, 1.0);
  gl_Position = vec4(world.xy, 0.0, 1.0);

  v_local      = a_corner;
  v_color      = a_color;
  v_opacity    = a_opacity;
  v_shapeId    = a_shapeId;
  v_shapeParam = a_shapeParam;
}
`
}

function fragment300(): string {
  return `#version 300 es
precision highp float;

in vec2  v_local;
in vec4  v_color;
in float v_opacity;
in float v_shapeId;
in float v_shapeParam;

uniform int u_starPoints;

out vec4 fragColor;

#define OUT_COLOR fragColor
#define AA_WIDTH(x) fwidth(x)
${SDF_BODY}
${MAIN_BODY}`
}

// ── WebGL1 (GLSL ES 1.00) ───────────────────────────────────────────────────────

function vertex100(): string {
  return `precision highp float;

attribute vec2  a_corner;
attribute vec2  a_position;
attribute float a_size;
attribute float a_rotation;
attribute float a_opacity;
attribute vec4  a_color;
attribute float a_shapeId;
attribute float a_shapeParam;

uniform mat3 u_transform;

varying vec2  v_local;
varying vec4  v_color;
varying float v_opacity;
varying float v_shapeId;
varying float v_shapeParam;

void main() {
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  vec2 corner = a_corner * a_size;
  vec2 rotated = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  vec3 world = u_transform * vec3(a_position + rotated, 1.0);
  gl_Position = vec4(world.xy, 0.0, 1.0);

  v_local      = a_corner;
  v_color      = a_color;
  v_opacity    = a_opacity;
  v_shapeId    = a_shapeId;
  v_shapeParam = a_shapeParam;
}
`
}

function fragment100(hasDerivatives: boolean): string {
  const header = hasDerivatives
    ? '#extension GL_OES_standard_derivatives : enable\n'
    : ''
  const aa = hasDerivatives ? '#define AA_WIDTH(x) fwidth(x)' : '#define AA_WIDTH(x) 0.02'
  return `${header}precision highp float;

varying vec2  v_local;
varying vec4  v_color;
varying float v_opacity;
varying float v_shapeId;
varying float v_shapeParam;

uniform int u_starPoints;

#define OUT_COLOR gl_FragColor
${aa}
${SDF_BODY}
${MAIN_BODY}`
}

// ── Public ──────────────────────────────────────────────────────────────────────

export function buildParticleShaderSources(
  isGL2:          boolean,
  hasDerivatives: boolean,
): ParticleShaderSources {
  if (isGL2) {
    return { vertex: vertex300(), fragment: fragment300() }
  }
  return { vertex: vertex100(), fragment: fragment100(hasDerivatives) }
}
