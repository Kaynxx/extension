# Progress

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
- `docs/testing/evidence/p1/visual/visual-results.json` archive provenance ile yazıldı ve
  acceptance validator geçti. Bu yalnız mekanik kanıttır; eski console uyarısı, native YouTube
  compositor/CORS/DRM ve insan halo/çift çizgi/renk lekesi/titreşim kararı açık kalır.

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

| Alan                        | Durum                               | Kanıt                                                  |
| --------------------------- | ----------------------------------- | ------------------------------------------------------ |
| MV3/toolchain               | Doğrulandı                          | `npm run check` ve build                               |
| YouTube video/overlay       | Fixture düzeyinde doğrulandı        | headless extension harness; native YouTube açık        |
| Latest-frame-wins/metrikler | Production + unit kanıtlı           | `FrameScheduler`, `RollingFrameMetrics`, adaptive JSON |
| Adaptif kalite              | Headless stress ile doğrulandı      | high→low, 120 low örneği, 5 s recovery                 |
| Anime4K backend             | İki gerçek pass seviyesi            | low=1 pass, high=2 pass; direct x2/x3                  |
| P1 performans               | Headless fiziksel GPU'da tamamlandı | Güncel 4×120, 24/30 FPS p95 7.60–10.00 ms              |
| P1 görsel mekanik kayıt     | Tamamlandı; insan incelemesi açık   | 12 capture ve visual manifest                          |

## P1 kabul matrisi

- Anime4K tabanlı iki seviye: **tamamlandı**; `Anime4kBackend` low/high pass map'i ve benchmark.
- 1080p→4K 24/30 FPS: **headless fiziksel GPU kanıtıyla tamamlandı**; native YouTube ölçümü değildir.
- GPU yetişmeyince otomatik seviye düşürme: **tamamlandı**; high→low, latest-frame single-flight ve 5 s hysteresis recovery.
- Orijinal/iyileştirilmiş karşılaştırma: **mekanik olarak tamamlandı**; headless fixture slider 0/55/100 ve A/B kompozit kontrolü mevcut, native YouTube manuel kontrolü açık.
- Halo/çift çizgi/renk lekesi/temporal titreşim: **kayıt tamamlandı**; 12 PNG mekanik kayıt, subjektif olumlu/olumsuz karar açık.

## Kanıt dosyaları

- `docs/testing/evidence/p1/benchmark-results.json`
- `docs/testing/evidence/p1/adaptive-results.json`
- `docs/testing/evidence/p1/visual/visual-results.json`
- `docs/testing/evidence/p1/visual/archive-diagnostic-headless-2026-09-15/visual-results.json`
- `docs/testing/evidence/p1/visual/archive-diagnostic-headless-2026-09-15/*.png`

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
