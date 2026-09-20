# Model and shader provenance

The current release ships no third-party model weights. The production anime
path is a bundled, hand-authored WGSL implementation with conservative
edge-aware and line-refinement passes. It is not a downloaded model artifact.

Research candidates are kept separate from the package: Anime4K is documented
as MIT-licensed, RT4KSR as Apache-2.0, and Real-ESRGAN as BSD-3-Clause in the
research notes. Their code, weights, and datasets are not redistributed by the
current extension. Any future weight must record its source URL, version,
license, SHA-256, and dataset restrictions here before release.
