# P4 temporal validation

`npm run test:p4-temporal` runs a headed, hardware-gated Chromium matrix using the real
`Anime4kBackend` at 30/60 FPS with temporal history disabled and enabled. It records raw per-frame
hashes, CPU submit samples, and representative headed screenshots. The harness never promotes a
canonical manifest unless every objective and human visual gate passes.

Thresholds are registered before measurement: temporal shimmer must improve by at least 10%,
fast-pan ghost error must stay below 12%, scene-cut leakage below 8%, and p95 CPU submit time must
stay below 24 ms at 30 FPS and 16.7 ms at 60 FPS. Seek, resize, quality, and profile changes must
invalidate history before the next presented frame.

The 2026-09-20 headed RTX 5070 run remains diagnostic: the captured WebGPU surface was black, so
temporal improvement and visual leakage could not be accepted and no canonical evidence was written.
