# Progress

## 2026-09-20 latest evidence reconciliation

- Headed P1 benchmark/adaptive artifacts are now authoritative at `docs/testing/evidence/p1/benchmark-results.json` and `adaptive-results.json`: 4×120 complete benchmark samples, no failed/GPU-error frames, and all adaptive guards true on RTX 5070/Vulkan/WebGPU.
- `docs/testing/evidence/p1/visual/visual-results.json` is the current headed mechanical manifest: 12 captures and objective guards pass, but `humanReviewRequired:true`; native YouTube remains partial (401/403 and overlay loss).
- P2/P3 `p2-p3-results.json` contains only the bundled baseline (8 headed cells, 120/120 presented, no GPU errors). Real WebSR/RT4KSR candidates and OCR/halo/model comparison remain pending.

## 2026-09-20 P1 canonical evidence correction

- `headless:true` / `HeadlessChrome` benchmark, adaptive and visual records were
  moved from canonical paths into explicit diagnostic-headless archives; raw
  JSON/PNG files remain preserved.
- Canonical validation now requires headed (`headless:false`) Chromium and a
  normal user-agent. No headed run was started; P1 acceptance is pending.

## 2026-09-20 headed visual recovery audit

- Root cause evidence: the first headed fixture capture lost the WebGPU device while using
  `canvas.captureStream()` as the source; no canonical manifest was written.
- Harness now uses owned `ImageBitmap`/`VideoFrame` snapshots with explicit close and queue drain;
  follow-up diagnostics report no device loss and all 12 screenshot hashes validate.
- Human/content-crop review still failed for halo/double-line/safe-fallback panels, so this is a
  safe diagnostic fix only; canonical visual acceptance remains pending.

Son güncelleme: 2026-09-20

## 2026-09-20 statik kapanış doğrulaması

- README ve `docs/IMPLEMENTATION_PLAN.md`, kodun gerçek kapsamı ve açık kabul kapılarıyla senkronlandı.
- `npm run check` geçti: 15 test dosyası, 76 test ve üç build hedefi.
- `npm audit --omit=dev` sonucu: 0 bilinen açık.
- Release paketi üretildi ve doğrulandı: `artifacts/webgpu-video-upscaler-0.1.0.zip` + `.sha256`; arşivde source map, raw evidence, test/source ağacı veya yerel yol yok.
- Paket manifesti yalnız `storage` izni ve YouTube match kullanıyor; extension CSP `script-src 'self'; object-src 'none'`. Statik taramada `eval`, `new Function`, `importScripts` veya uzak çalıştırılabilir kod bulunmadı.
- Native YouTube DRM/CORS, insan görsel kararı ve mekanik görsel arşivin subjektif kabulü, P2/P3 gerçek model–OCR–60 FPS ve P4 temporal model hâlâ açık; bu nedenle yayın/goal tamamlandı sayılmıyor.

## 2026-09-20 mechanical headless visual archive

- 12 mevcut headless PNG'nin SHA-256 ve byte değerleri yeniden doğrulandı; fiziksel RTX 5070
  WebGPU/Vulkan probe'u ve `HeadlessChrome` user-agent kanıtı tazelendi.
- Headless kayıtlar fiziksel GPU bildirse de acceptance için geçersizdir; raw JSON/PNG'ler
  diagnostic-headless arşivlerine taşındı. Canonical headed koşu bekliyor.

## 2026-09-20 P2/P3 statik profil yolu

- Manuel `live-action` ve `screen-3d` seçimleri popup'ta etkin; controller bunları artık anime dışı diye reddetmiyor.
- Yerel WebGPU shader'ında gerçek çekim için sınırlı denoise/unsharp, ekran/oyun/3D için renk taşması ve halo riskini azaltan bounded-luma yolu var.
- Doğrudan 2x/3x output hedefi ortak boyut hesabıyla korunuyor; profile backend arızasında safe düşük kalite, ardından orijinal video fallback'i var.
- Unit kanıtı: `npm run typecheck`, `npm run lint`, `vitest` ilgili 3 dosya — 11 test geçti. GPU/gerçek ekran yazı OCR veya subjektif kalite benchmarkı bu statik değişiklikle iddia edilmiyor.

## 2026-09-20 statik çekirdek doğrulaması

- Aynı-element kaynak yenilemede SDR gate, async device generation ownership, stale resize error guard ve `VideoFrame` finally-close düzeltildi.
- Çıkış boyutu invalid GPU texture limitlerinde fail-closed; 2×/3×/4K/display hedefleri popup'ta tutarlı.
- Locator extension-owned overlay/HUD mutation testi ve output invalid-limit testi eklendi.
- Kanıt: `npm run check` — typecheck/lint/format, 11 dosyada 59 test ve content/popup/background build başarılı.

## Genel durum

| Alan                        | Durum                          | Kanıt                                                  |
| --------------------------- | ------------------------------ | ------------------------------------------------------ |
| MV3/toolchain               | Doğrulandı                     | `npm run check` ve build                               |
| YouTube video/overlay       | Fixture düzeyinde doğrulandı   | headless extension harness; native YouTube açık        |
| Latest-frame-wins/metrikler | Production + unit kanıtlı      | `FrameScheduler`, `RollingFrameMetrics`, adaptive JSON |
| Adaptif kalite              | Headless stress ile doğrulandı | high→low, 120 low örneği, 5 s recovery                 |
| Anime4K backend             | İki gerçek pass seviyesi       | low=1 pass, high=2 pass; direct x2/x3                  |
| P1 performans               | Bekliyor; headed kanıt gerekli | Headless ölçüm diagnostic arşivde                      |
| P1 görsel mekanik kayıt     | Bekliyor; headed kanıt gerekli | Headless capture diagnostic arşivde                    |

## P1 kabul matrisi

- Anime4K tabanlı iki seviye: **tamamlandı**; `Anime4kBackend` low/high pass map'i ve benchmark.
- 1080p→4K 24/30 FPS: **headless fiziksel GPU kanıtıyla tamamlandı**; native YouTube ölçümü değildir.
- GPU yetişmeyince otomatik seviye düşürme: **tamamlandı**; high→low, latest-frame single-flight ve 5 s hysteresis recovery.
- Orijinal/iyileştirilmiş karşılaştırma: **mekanik olarak tamamlandı**; headless fixture slider 0/55/100 ve A/B kompozit kontrolü mevcut, native YouTube manuel kontrolü açık.
- Halo/çift çizgi/renk lekesi/temporal titreşim: **kayıt tamamlandı**; 12 PNG mekanik kayıt, subjektif olumlu/olumsuz karar açık.

## Kanıt dosyaları

- `docs/testing/evidence/p1/archive-diagnostic-headless-2026-09-20/benchmark-results.json`
- `docs/testing/evidence/p1/archive-diagnostic-headless-adaptive-2026-09-20/adaptive-results.json`
- `docs/testing/evidence/p1/visual/archive-diagnostic-headless-2026-09-20/visual-results.json`

Benchmark JSON'ı artık processing timing serilerinin yanında `mainThreadSamplesMs` ve
main-thread p50/p95/p99 özetlerini de taşıyor; bu alanlar her koşu için raw seriden validator
öncesi yeniden üretiliyor.

## Son test koşusu

- `npm run check`: geçti; 15 test dosyası, 76 test ve üç build hedefi.
- `CHROMIUM_PATH=<configured Chromium binary> npm run test:integration`: 3/3 geçti; koşu headless persistent Chromium'du.
- `CHROMIUM_PATH=<configured Chromium binary> npm run test:integration`: 4/4 geçti; yeni fixture testi pause/seek/rate/volume, captions, fullscreen sinyali ve controls DOM korunumu ekledi. Koşu headless persistent Chromium'du.
- Güncel headless benchmark ve adaptive JSON'ları fiziksel RTX 5070/WebGPU kapısından geçti.
- Tam 12-capture visual runner bu oturumda GPU kaynak beklemesine takıldı; mevcut 12 capture headless arşivi mekanik kanıt olarak kullanılıyor, insan incelemesi açık.

## Açık riskler

- Native YouTube external-video, gerçek ağ/DRM/CORS, caption/controls/fullscreen/seek/pause ve insan gözlemli artefakt kararı headless fixture kapsamının dışındadır.
- Kullanıcı masaüstü testini yasakladığı için bu riskler için headed/visible test çalıştırılmayacaktır.

## 2026-09-20 P5 manga static MVP

### Headed acceptance

- Evidence: `docs/testing/evidence/p5-manga/` (`headless:false`, RTX 5070 hardware
  gate, source/enhanced/comparison captures and JSON report).
- 24-tile/64px-overlap geometry and all safety/exclusion/rollback checks passed.
- Fixed headed canvas readback by using a deterministic `willReadFrequently` 2D
  context in the static renderer. Re-run is opaque/nonblack at 4096×2458; source,
  enhanced and comparison captures show intact glyphs/bubbles with no visible
  seam, halo, double-line or color-bleed artifact. Evidence is accepted for the
  conservative tiled baseline (not a generative model).

- `MangaImagePipeline` lazy IntersectionObserver ve MutationObserver ile yalnızca
  açık opt-in sonrasında uygun statik görselleri işler.
- Büyük görseller overlap tile'lara ayrılır; canvas baseline metin/çizgi sadakatini
  korumak için non-generative yüksek kaliteli kopyalama kullanır.
- Animated/media-adjacent görseller reddedilir; original image ve rollback korunur;
  duplicate processing WeakMap/record ile engellenir.
- Kanıt: `npm run check` — 15 test dosyası, 76 test ve üç build hedefi geçti.
- Arbitrary-site erişimi bilinçli olarak kapsam dışıdır; geniş host izni eklenmedi.

## 2026-09-20 P4 otomatik profil ve temporal sınırlar

- Otomatik seçim yalnız sınırlı yerel spatial özet + metadata alır; güven eşiği
  ve üç örnek hysteresis ile güçlü kanıt yoksa `safe` kalır.
- Manual `anime`, `live-action`, `screen-3d` ve `safe` seçimleri selector'a
  girmez; popup'ta P4 otomatik seçenek artık devre dışı değildir.
- Scheduler geriye giden media time/presented-frame seek'ini algılar; kalite,
  kaynak, resize ve explicit scene-cut resetleri in-flight kareleri geçersiz
  kılar. Temporal model/history henüz uygulanmadı.
- Kanıt: `npm run typecheck`, `npm run lint`, P4 unit tests — 8 test geçti (full unit suite 73).

## 2026-09-20 P1 headed visual evidence recovery

- Harness kaynak paneli immutable snapshot'a taşındı; captureStream ve üretim
  video mutasyonu kullanılmadı. Snapshot boyutu, kaynak/enhanced non-black ve
  queue/present sırası doğrulanıyor.
- Normal headed Chromium + fiziksel RTX 5070/Vulkan/WebGPU ile halo preflight ve
  12/12 görsel capture geçti; UA headless değil, console error/device loss yok.
- İnsan incelemesi: 12 görüntüde paneller hizalı; halo/çift çizgi temiz, color-bleed
  taşması yok, temporal çiftler beklenen hareketi gösteriyor.
- Kanıt: `npm run check` — 16 test dosyası, 78 test ve üç build hedefi geçti.

## 2026-09-20 P2/P3 headed matrix baseline

- 30/60 FPS × 2x/3x tüm 8 hücre headed RTX 5070 koşusunda 120/120 frame sundu;
  GPU error ve failure yok.
- Ham processing samples, p50/p95/p99 ve deterministic OCR/text-edge/halo proxy
  metrikleri `docs/testing/evidence/p2-p3/p2-p3-results.json` içinde.
- Model karşılaştırması `pending-candidates-not-available`; ölçüm WebSR/RT4KSR
  değil, bundled WebGpuBackend baseline'ıdır.
