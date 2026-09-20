# Technical Context

## 2026-09-20 canonical evidence policy correction

- Canonical P1 evidence requires `headless:false` and a user-agent without
  `HeadlessChrome`; physical GPU does not override this gate.
- Existing headless outputs are preserved under explicit diagnostic-headless
  archives and absent from canonical paths. Headed runs were not started.

## Hedef Platform

- Birincil: Güncel masaüstü Google Chrome
- Eklenti platformu: Manifest V3
- İlk site: `https://www.youtube.com/*`
- İlk medya kapsamı: HTML5 SDR video
- GPU API: WebGPU / WGSL

## Planlanan Araç Zinciri

- Dil: TypeScript, strict mode
- Build: Vite tabanlı kontrollü MV3 build
- Paket yöneticisi: npm; proje kurulurken lockfile sabitlenir
- Unit test: Vitest
- Tarayıcı entegrasyon testi: Playwright + gerçek Chrome kanalı
- Lint/format: ESLint ve Prettier; yalnızca proje kurulurken eklenir

Bu seçimler P0 iskelesi kurulurken doğrulanacak, henüz bağımlılık kurulmamıştır.

## 2026-09-15 oturum checkpoint'i

- Node 26.7.0 / npm 12.0.2, TypeScript 6.0.3, Vite 8.3.0, Vitest 5.0.0 ve Playwright 1.63.0 kurulu ve unit/integration iskeletiyle doğrulandı.
- Hedef cihaz: NVIDIA GeForce RTX 5070 (12 GB), sürücü 610.57.04; Chrome for Testing 151.0.7922.34. Eski headless ölçümler yalnız tanı arşividir; native YouTube P1 audit'i açık.
- P1 backend'i paket içi WGSL Anime4K uyarlamasıdır: `low` tek edge-aware pass, `high` ek sınırlı line-refinement pass. Kare kaynağı kalıcı GPU texture'a `copyExternalImageToTexture` ile aktarılır; uygulama tarafında CPU readback yoktur.
- `src/core/contracts.ts` tek backend sözleşmesini ve tek kullanımlı `PreparedFrame.present()/discard()` yaşam döngüsünü tanımlar. Bu iki aşama stale kareyi canvas'a sunmadan atmak için seçildi.
- `upscaler-controller.ts` bu canonical sözleşmeye bağlıdır: P1 anime yolu production'da aktiftir; `WebGpuBackend` aynı `PreparedFrame`/device-loss/resize sözleşmesini uygular ve Anime4K başlatma/çalışma hatalarında safe fallback olarak seçilir. Anime dışı profiller Anime4K'ya yönlendirilmez.
- Legacy tireli scheduler/adaptive-quality ve `metrics-window` kopyaları kaldırıldı; tekil kaynaklar camelCase canonical modüllerdir.
- `WebGpuBackend` aynı canonical sözleşmeyi uygular; controller-injected `GPUDevice` kullanır, kendi device'ını destroy etmez ve fallback kaynaklarını resize/dispose/device-loss sınırlarında temizler. Production controller seçim ve runtime failover zincirine bağlıdır.

## Runtime Seçenekleri

- Anime için elle optimize edilmiş WGSL/Anime4K-WebGPU.
- Model denemeleri için ONNX Runtime Web + WebGPU.
- Üretim performansı gerektirirse fused, elle yazılmış WGSL kernel'ları.
- WebAssembly yalnızca küçük CPU yardımcıları veya güvenli fallback; 4K SR ana yolu değil.

## 2026-09 model araştırması sonucu

- Tarayıcıya en yakın baseline: Anime4K-WebGPU/WebSR tipi el yazımı WGSL/WebGPU shader hattı; `@websr/websr` mevcut MV3 CSP/eval kısıtı nedeniyle runtime adayı değildir.
- Doğrudan 4K hedefi için araştırma adayı: RT4KSR x2/x3; WebGPU portu ve operator uyumluluğu henüz yok.
- Real-ESRGAN x2/x4 kalite karşılaştırması için; canlı varsayılan değil.
- NanoVSR temporal edge adayı; mevcut kanıt Jetson Orin NX ve 4x içindir.
- 4K RGBA8 tek texture yaklaşık 33.2 MB; 4K RGBA16F tek texture yaklaşık 66.4 MB. 4K feature map'leri belleği hızla GB seviyesine çıkarabileceği için ağır hesap LR uzayında tutulmalı.
- Model ağırlığı boyutu, aktivasyon ve texture/compositor belleğinden ayrı ölçülmelidir.

## 2026-09-19 P1 visual harness checkpoint

> Historical checkpoint; superseded by the 2026-09-20 headless-only update below.

- `scripts/run-p1-visual-evidence.mjs` yalnızca görünür Chromium (`headless:false`) ve
  browser-level fiziksel GPU kapısıyla çalışır.
- Evidence screenshot'ı WebGPU swapchain yüzeyine güvenmez: `canvas.toDataURL()` geçici mutlak konumlu `<img>` ile yalnız kanıt aşamasında kompoze edilir ve 64×36 örnekte `nonBlackPixelRatio >= 0.01` assertion'ı raporlanır. Bu yol üretim backend/scheduler'ına bağlı değildir.
- Canonical visual manifest henüz yoktur. Eski 12 headless capture
  `docs/testing/evidence/p1/visual/archive-diagnostic-headless-2026-09-15/` altında tanı arşividir.

## 2026-09-20 release packaging checkpoint

- `scripts/package-release.mjs`, harici `zip` binary'si gerektirmeden deflate edilmiş deterministik ZIP ve SHA256 üretir. Staging yalnız `dist/`, `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES` ve `PRIVACY.md` içerir; source map ve kanıt ağacı pakete girmez.
- Son statik doğrulama: `npm run check` (76 test), `npm audit --omit=dev` (0 açık), archive listing/checksum/forbidden-entry gate geçti.
- Native YouTube ve insan görsel kabulü bu statik kapıların kapsamı değildir.

## Platform Kısıtları

- WebGPU secure context gerektirir.
- Kaynak video origin-clean değilse `GPUExternalTexture` aktarımı reddedilebilir.
- Chrome GPU adaptörü seçimi, fiziksel ayrık GPU bulunduğunu bilmekten farklıdır.
- `requestVideoFrameCallback` main thread'de çalışır ve tam zamanlama garantisi vermez.
- MV3 uzaktan JavaScript/WASM çalıştırılmasına izin vermez.
- Model ağırlıkları veri olarak ayrı indirilebilir; cache, hash ve sürüm gerekir.
- YouTube bir SPA'dır; URL değişikliği tek başına video yaşam döngüsü sinyali değildir.
- Canvas, altyazı ve kontrollerin z-order davranışını bozmamalıdır.

## Performans İlkeleri

- CPU readback normal kare yolunda yasaktır.
- Buffer/texture tahsisi kare başına yapılmaz; resize veya model değişiminde yapılır.
- Statik şekiller ve önceden ayrılmış GPU çıktıları tercih edilir.
- GPU zamanı kadar main-thread ve compositing maliyeti de ölçülür.
- 4K ara feature map'leri minimum tutulur; ağır hesap LR uzayında yapılır.

## Lisans Notları

- Anime4K / Anime4K-WebGPU: MIT.
- RT4KSR: Apache-2.0.
- Real-ESRGAN: BSD-3-Clause.
- APISR: GPL-3.0; dağıtım kararından önce ayrı inceleme gerekir.
- Kod lisansı ile model ağırlığı/dataset lisansı ayrı ayrı kaydedilmelidir.

## 2026-09-15 gerçek GPU benchmark checkpoint

- Masaüstü açılmadan yapılandırılmış Chromium binary'si headless ve `P1_REQUIRE_HARDWARE=true` ile dört ayrı koşul çalıştırıldı; runner her koşulda yeni sayfa açıp kapatır.
- CDP `SystemInfo.getInfo`: NVIDIA GeForce RTX 5070/Blackwell, driver 610.57.4.0, ANGLE Vulkan, WebGPU `enabled`, Vulkan `enabled_on`, GPU compositing/video decode `enabled`, `maxTextureDimension2D: 16384`.
- 1920×1080→3840×2160 direct 2× dört koşuda 120/120 kare sunuldu. p95: 24 FPS low 8.40 ms, high 8.30 ms; 30 FPS low 8.30 ms, high 8.50 ms. GPU validation errors 0; skipped/stale/failed 0.
- Headless Chromium WebGPU canvas'ını doğrudan `page.screenshot` ile alma yolu şeffaf GPU yüzeyi yakaladığı için benchmark runner, yalnızca kanıt ekranı aşamasında `canvas.toDataURL()` çıktısını geçici 2D `<img>` ile A/B kompozite eder. Normal üretim yolunda CPU readback yoktur.
- Strict SDR gate, native YouTube'da unknown renk metadata'sını bypass eder; local canvas-capture fixture açık SDR kabulüyle test edilir.

## 2026-09-19 headed-only acceptance policy

> Historical checkpoint; superseded by D-027 and the 2026-09-20 headless-only update below.

- `run-p1-benchmark.mjs`, `run-p1-visual-evidence.mjs`, `run-p1-adaptive-evidence.mjs`,
  `p1-browser.mjs` ve extension Playwright entegrasyonu `headless:false` kullanır; ortak
  kabul kapısı `headless:true` veya `HeadlessChrome` user-agent'ını reddeder.
- `assertCanonicalAcceptanceEvidence()` canonical JSON yazılmadan önce headed flag, normal Chrome
  user-agent, fiziksel GPU, software-renderer reddi, ham zamanlama ve tam koşu kapılarını uygular.
- Eski headless JSON/PNG'ler `archive-diagnostic-headless-*` altına taşındı. Canonical benchmark,
  adaptive ve visual manifestler henüz yoktur.
- 12-kare headed/no-write smoke RTX 5070 ve normal Chrome/151 UA ile tamamlandı; kabul için 4×120
  performans, adaptive ve tam visual koşuları ayrıca gereklidir.

## 2026-09-19 adaptive stress checkpoint

> Historical checkpoint; superseded by the 2026-09-20 headless-only update below.

- `scripts/run-p1-adaptive-evidence.mjs`, headed Chromium + browser-level CDP hardware gate ile aynı
  production `AdaptiveQualityController` ve `FrameScheduler`'ı çalıştırır.
- Eski headless adaptive sonucu `archive-diagnostic-headless-adaptive-2026-09-18/` altında tanı
  arşividir; canonical headed `adaptive-results.json` henüz yoktur.
- Production controller'da anime auto kalite için `ANIME_ADAPTIVE_FRAME_BUDGET_MS = 24` sabitlenmiştir. Bu, 30 FPS nominal 33.3 ms cadence'ini doğrudan kabul etmek yerine compositing/headroom payı bırakır; explicit budget unit testi vardır.

## 2026-09-19 adaptive stress checkpoint

- `tests/harness/p1-adaptive.ts` production `AdaptiveQualityController` ve `FrameScheduler` ile sentetik 1920×1080→3840×2160 akışta deterministik 32.2 ms high overload uygular.
- Headed canonical stress koşusu bekliyor; eski headless sayılar yalnızca tanı arşivinde tutulur.

## 2026-09-20 headless-only doğrulama güncellemesi

- Kullanıcı politikası gereği `p1-browser.mjs`, benchmark/visual/adaptive runner'ları ve Playwright extension integration `headless:true` kullanır; headed/visible/CUA açılışları reddedilir.
- `assertCanonicalAcceptanceEvidence()` artık `headless:false` ve HeadlessChrome olmayan
  user-agent ister; fiziksel GPU sonucu bu policy'yi geçersiz kılamaz.
- Önceki headless RTX 5070 kayıtları diagnostic arşivdedir; headed canonical koşu yapılmadı.
- Visual evidence runner `halo`, `double-line`, `color-bleed`, `temporal-shimmer` fixture'larını low/high/safe-fallback modlarında kaydeder; `canvas.toDataURL()` yalnız kanıt kompozisyonunda kullanılır.
- `scripts/acceptance-validation.mjs` ve unit manifest kapısı headed-only canonical policy'ye hizalandı.
- Son `npm run check`: 15 test dosyası / 76 test; headless extension integration 3/3.

## 2026-09-20 visual archive promotion

- Canonical visual manifest yazımı `scripts/promote-p1-visual-archive.mjs` ile sınırlıdır:
  arşiv PNG/hash bütünlüğü ve fiziksel headless GPU/user-agent provenance doğrulanır.
- Promotion bir rerun değildir; `manifestKind=headless-mechanical-archive` ve açık human/native
  review alanları, fixture görsellerinin subjective kalite kanıtı olmadığını belirtir.

## 2026-09-20 statik güvenlik notu

- Controller, `requestDevice()` sonrası generation değişimini kontrol edip geç gelen cihazı destroy eder; resize failure yalnız aynı backend/overlay generation'ında failover başlatır.
- `computeOutputSize` finite olmayan `maxTextureDimension2D` değerlerini 1 piksele indirerek canvas boyutuna NaN/Infinity sızmasını engeller.

## 2026-09-20 P4 auto/reset statik çekirdeği

- Auto selector is a pure TypeScript module under `src/core/profiles`; it
  accepts bounded normalized feature summaries and never performs GPU/CPU frame
  readback itself.
- `FrameScheduler` owns `TemporalStateBoundary`; seek detection compares media
  time and presented-frame counters. Explicit reset API invalidates stale
  in-flight work and exposes a future-model hook.

## 2026-09-20 P2/P3 bundled shader baseline

- `WebGpuBackend` artık güvenli fallback yanında `live-action` ve `screen-3d` profillerini de parametreli olarak çalıştırır; uzak JS/WASM veya doğrulanmamış model ağırlığı eklenmedi.
- Gerçek çekim stratejisi bounded cross-neighbour denoise + düşük unsharp gücüdür. Ekran/oyun/3D stratejisi chroma'yı koruyan bounded luminance delta'dır; diagonal yüksek-seviye pass kapalıdır.
- Bu baseline WebSR/RT4KSR doğruluğu iddia etmez; P2 model karşılaştırması ve OCR/halo benchmarkı açık kalır.

## 2026-09-20 P5 manga pipeline

- Static manga processing lives under `src/content/manga` and does not share the
  video scheduler/backend lifecycle.
- The MVP uses a tiled 2D canvas baseline with overlap (no generative detail),
  fixed-position non-interactive output overlays, and IntersectionObserver lazy
  scheduling. WebGPU is not required for this safe opt-in path.
- Manifest permissions remain `storage` plus the existing YouTube match; no
  `<all_urls>` host permission is present. An arbitrary-site release requires
  an explicit `chrome.permissions.request` optional-origin flow first.
