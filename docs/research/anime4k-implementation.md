# Anime4K-compatible WebGPU implementation note

Date: 2026-09-15

## Scope

The Anime MVP backend is an original WGSL adaptation of the conservative,
gradient-directed line treatment used by Anime4K. It does not copy upstream
GLSL verbatim and ships no model weights. All executable shader source lives in
the extension package at `src/core/models/anime4k-shaders.ts`.

The two levels are intentionally different GPU workloads:

- `low`: one edge-aware direct x2 render pass.
- `high`: the same edge-aware direct x2 pass followed by a bounded luminance
  line-refinement pass.

Both paths clamp corrections to colors already present in the local
neighbourhood. High also caps its luminance correction. Neither path is
generative and neither synthesizes texture.

## Frame and resource path

`copyExternalImageToTexture` copies `HTMLVideoElement`, `VideoFrame`, or
`ImageBitmap` into a persistent source texture. This is the WebGPU
external-image copy path; it does not perform application-visible CPU readback.
Input, intermediate, output, uniform and sampler resources are allocated at
initialization/resize, not per frame. Real target-device profiling is still
required before making a zero-copy or performance claim.

Processing writes to an offscreen final texture. `prepare()` waits for submitted
GPU work and returns a single-use prepared frame. Only its `present()` method
requests the canvas current texture, so the latest-frame-wins scheduler can
discard an obsolete completed frame without displaying it.

The backend only accepts direct integer x2 or x3 dimensions. Thus 1920x1080
maps directly to 3840x2160 (x2), and 1280x720 maps directly to 3840x2160 (x3),
instead of producing x4 and downsampling. Resize destroys the old
size-dependent textures and invalidates any prepared frame. Device loss and GPU
submission failures are surfaced as typed errors for safe bypass.

## Attribution and license

Algorithm inspiration and terminology:

- Anime4K by bloc97: <https://github.com/bloc97/Anime4K>
- Upstream license: MIT, Copyright (c) 2019 bloc97.
- License text: <https://github.com/bloc97/Anime4K/blob/master/LICENSE>

The upstream project documents modular real-time anime shaders, including line
reconstruction/restoration and x2 upscaling variants. This implementation uses
the same broad non-generative design family while expressing a new,
fidelity-limited algorithm in WGSL.

## Verification boundary

Unit tests prove the direct x2 invariant and the one-pass/two-pass level map.
They do not establish visual quality, GPU frame time, copy behavior, or 24/30
FPS. Those claims require the repository's target-device Chrome benchmark and
representative anime artifact captures.
