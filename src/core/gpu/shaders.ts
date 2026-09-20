export const PROCESS_SHADER = /* wgsl */ `
struct Params {
  inputSize: vec2f,
  outputSize: vec2f,
  strength: f32,
  denoise: f32,
  profile: u32,
  quality: u32,
  _padding: vec2u,
}

@group(0) @binding(0) var sourceTexture: texture_external;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

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

fn sampleAt(uv: vec2f) -> vec3f {
  return textureSampleBaseClampToEdge(sourceTexture, sourceSampler, uv).rgb;
}

fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let texel = 1.0 / params.inputSize;
  let center = sampleAt(input.uv);

  if (params.quality == 0u) {
    return vec4f(center, 1.0);
  }

  let north = sampleAt(input.uv + vec2f(0.0, -texel.y));
  let south = sampleAt(input.uv + vec2f(0.0, texel.y));
  let west = sampleAt(input.uv + vec2f(-texel.x, 0.0));
  let east = sampleAt(input.uv + vec2f(texel.x, 0.0));
  let crossMean = (north + south + west + east) * 0.25;

  var result = center;
  if (params.profile == 1u) {
    // Anime: strengthen stable line edges while preserving flat color regions.
    let edge = abs(4.0 * luma(center) - luma(north) - luma(south) - luma(west) - luma(east));
    let edgeWeight = smoothstep(0.025, 0.18, edge);
    result = center + (center - crossMean) * params.strength * edgeWeight;
  } else if (params.profile == 2u) {
    // Live action: mild denoise before conservative unsharp masking.
    let difference = abs(center - crossMean);
    let denoised = mix(center, crossMean, params.denoise * (1.0 - smoothstep(0.015, 0.09, max(difference.r, max(difference.g, difference.b)))));
    result = denoised + (denoised - crossMean) * params.strength;
  } else if (params.profile == 3u) {
    // Screen/3D: luminance-focused edge enhancement avoids color bleeding around text.
    let delta = luma(center) - luma(crossMean);
    result = center + vec3f(delta * params.strength);
  } else {
    // Safe: low-strength, bounded luminance enhancement.
    let delta = clamp(luma(center) - luma(crossMean), -0.08, 0.08);
    result = center + vec3f(delta * params.strength);
  }

  // Screen/UI edges are already high contrast. A diagonal pass can create a
  // one-pixel halo around glyphs, so screen/3D stays on the cross-only path.
  if (params.quality >= 2u && params.profile != 3u) {
    let nw = sampleAt(input.uv + vec2f(-texel.x, -texel.y));
    let ne = sampleAt(input.uv + vec2f(texel.x, -texel.y));
    let sw = sampleAt(input.uv + vec2f(-texel.x, texel.y));
    let se = sampleAt(input.uv + vec2f(texel.x, texel.y));
    let diagonalMean = (nw + ne + sw + se) * 0.25;
    result += (center - diagonalMean) * params.strength * 0.12;
  }

  if (params.profile == 3u) {
    // Keep text chroma and glyph coverage stable: only a tightly bounded
    // luminance delta is allowed, with no coloured unsharp halo.
    let centerLuma = luma(center);
    let crossLuma = luma(crossMean);
    let boundedDelta = clamp(centerLuma - crossLuma, -0.045, 0.045);
    result = center + vec3f(boundedDelta * params.strength);
  }

  return vec4f(clamp(result, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

export const PRESENT_SHADER = /* wgsl */ `
@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;

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

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(sourceTexture, sourceSampler, input.uv);
}
`;
