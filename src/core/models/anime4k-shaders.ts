const FULLSCREEN_VERTEX = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  output.uv = uvs[index];
  return output;
}
`;

/**
 * A conservative Anime4K-style gradient-directed scaler. The output is
 * bounded by the source neighbourhood, which limits halos and color ringing.
 */
export const ANIME_EDGE_AWARE_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

struct Params {
  sourceTexel: vec2f,
  outputTexel: vec2f,
  edgeStrength: f32,
  lineStrength: f32,
  _padding: vec2f,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var historyTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
struct TemporalParams { blend: f32, gate: f32, historyValid: f32, _padding: f32 }
@group(0) @binding(3) var<uniform> temporal: TemporalParams;
@group(0) @binding(2) var<uniform> params: Params;

fn sampleAt(uv: vec2f) -> vec3f {
  return textureSample(sourceTexture, sourceSampler, uv).rgb;
}

fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn edgeAwareMain(input: VertexOutput) -> @location(0) vec4f {
  let t = params.sourceTexel;
  let center = sampleAt(input.uv);
  let north = sampleAt(input.uv + vec2f(0.0, -t.y));
  let south = sampleAt(input.uv + vec2f(0.0, t.y));
  let west = sampleAt(input.uv + vec2f(-t.x, 0.0));
  let east = sampleAt(input.uv + vec2f(t.x, 0.0));
  let nw = sampleAt(input.uv + vec2f(-t.x, -t.y));
  let ne = sampleAt(input.uv + vec2f(t.x, -t.y));
  let sw = sampleAt(input.uv + vec2f(-t.x, t.y));
  let se = sampleAt(input.uv + vec2f(t.x, t.y));

  let gx = luma(ne) + 2.0 * luma(east) + luma(se)
    - luma(nw) - 2.0 * luma(west) - luma(sw);
  let gy = luma(sw) + 2.0 * luma(south) + luma(se)
    - luma(nw) - 2.0 * luma(north) - luma(ne);
  let magnitude = length(vec2f(gx, gy));
  let normal = select(vec2f(0.0, 1.0), normalize(vec2f(gx, gy)), magnitude > 0.00001);
  let tangent = vec2f(-normal.y, normal.x);

  let tangentOffset = tangent * t * 0.55;
  let normalOffset = normal * t * 0.55;
  let along = (sampleAt(input.uv - tangentOffset) + sampleAt(input.uv + tangentOffset)) * 0.5;
  let across = (sampleAt(input.uv - normalOffset) + sampleAt(input.uv + normalOffset)) * 0.5;
  let edgeWeight = smoothstep(0.025, 0.18, magnitude);
  let candidate = center + (along - across) * params.edgeStrength * edgeWeight;

  let localMin = min(center, min(min(north, south), min(west, east)));
  let localMax = max(center, max(max(north, south), max(west, east)));
  return vec4f(clamp(candidate, localMin, localMax), 1.0);
}
`;

/**
 * High quality's second pass restores line contrast in luminance only. The
 * correction is capped and clamped to observed neighbours, so it cannot
 * synthesize detail or create out-of-range chroma.
 */
export const ANIME_LINE_REFINEMENT_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

struct Params {
  sourceTexel: vec2f,
  outputTexel: vec2f,
  edgeStrength: f32,
  lineStrength: f32,
  _padding: vec2f,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

fn sampleAt(uv: vec2f) -> vec3f {
  return textureSample(sourceTexture, sourceSampler, uv).rgb;
}

fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn lineRefinementMain(input: VertexOutput) -> @location(0) vec4f {
  let t = params.outputTexel;
  let center = sampleAt(input.uv);
  let north = sampleAt(input.uv + vec2f(0.0, -t.y));
  let south = sampleAt(input.uv + vec2f(0.0, t.y));
  let west = sampleAt(input.uv + vec2f(-t.x, 0.0));
  let east = sampleAt(input.uv + vec2f(t.x, 0.0));
  let nw = sampleAt(input.uv + vec2f(-t.x, -t.y));
  let ne = sampleAt(input.uv + vec2f(t.x, -t.y));
  let sw = sampleAt(input.uv + vec2f(-t.x, t.y));
  let se = sampleAt(input.uv + vec2f(t.x, t.y));

  let crossMean = (north + south + west + east) * 0.25;
  let diagonalMean = (nw + ne + sw + se) * 0.25;
  let surround = crossMean * 0.75 + diagonalMean * 0.25;
  let contrast = luma(center) - luma(surround);
  let lineWeight = smoothstep(0.012, 0.11, abs(contrast));
  let correction = clamp(contrast * params.lineStrength * lineWeight, -0.025, 0.025);
  let candidate = center + vec3f(correction);

  let localMin = min(center, min(min(north, south), min(west, east)));
  let localMax = max(center, max(max(north, south), max(west, east)));
  return vec4f(clamp(candidate, localMin, localMax), 1.0);
}
`;

export const ANIME_PRESENT_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;

@fragment
fn presentMain(input: VertexOutput) -> @location(0) vec4f {
  let current = textureSample(sourceTexture, sourceSampler, input.uv);
  if (temporal.historyValid < 0.5) { return current; }
  let previous = textureSample(historyTexture, sourceSampler, input.uv);
  let currentLuma = dot(current.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let previousLuma = dot(previous.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let motion = smoothstep(temporal.gate, temporal.gate * 2.0, abs(currentLuma - previousLuma));
  let weight = clamp(temporal.blend * (1.0 - motion), 0.0, 0.18);
  return mix(current, previous, weight);
}
`;
