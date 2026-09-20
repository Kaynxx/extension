# Active Context

## 2026-09-20 canonical evidence correction

- Root P1 benchmark/adaptive/visual artifacts had `headless: true` and/or
  `HeadlessChrome`; physical GPU status does not make them acceptance evidence.
- Raw files were preserved under explicit diagnostic-headless archives and
  removed from canonical paths. Canonical guards now require headed Chromium
  (`headless:false`) and reject HeadlessChrome user-agents.
- No headed/browser/GPU run was started in this session; P1 canonical evidence is
  pending and old headless records are diagnostic only.

## 2026-09-20 headed visual device-loss audit

- Interrupted headed visual evidence recorded `Anime4kBackendError: WebGPU cihazı kaybedildi`
  during fixture capture; the associated failure record is diagnostic and canonical promotion
  remained false.
- The uncommitted harness fix removes `canvas.captureStream()` external-image ownership, uses
  owned `ImageBitmap`/`VideoFrame` snapshots, closes snapshots deterministically, waits for queue
  completion, and records uncaptured/device-lost diagnostics.
- Follow-up headed diagnostic produced 12 hash-valid captures and no observed device loss, but
  content-crop/human visual review remained failed; visual acceptance stays pending.

Son güncelleme: 2026-09-20

## 2026-09-20 statik kapanış durumu

- README ve implementation plan mevcut P5 statik MVP durumuna ve açık P1/P2/P3/P4 yayın kapılarına senkronlandı; proje tamamlandı ilan edilmedi.
- `npm run check` geçti: typecheck, lint, format, 15 test dosyası/76 test ve üç build hedefi.
- `npm audit --omit=dev` bilinen güvenlik açığı bildirmedi.
- `npm run package:release` deterministik `artifacts/webgpu-video-upscaler-0.1.0.zip` ve SHA256 üretiyor; arşiv yalnız dist ve lisans/gizlilik dosyalarını içeriyor, source map/evidence/local path içermiyor.
- Native YouTube DRM/CORS ve insan görsel değerlendirmesi; yalnız mekanik görsel arşiv (subjektif kabul değil); P2/P3 gerçek model/OCR/60 FPS; P4 temporal model açık kabul kapılarıdır. Başlıklı/görünür test çalıştırılmadı.

## 2026-09-20 headless görsel kayıtlarının geri çekilmesi

- `headless:true` / `HeadlessChrome` içeren benchmark, adaptive ve visual kayıtları canonical
  yollardan diagnostic-headless arşivlerine taşındı; raw evidence silinmedi.
- Canonical validation artık `headless:false` ve HeadlessChrome içermeyen user-agent ister.
  Headed yeniden koşu yapılmadı; P1 acceptance beklemede.
- Tam visual runner'ın GPU kaynak yaşam döngüsü beklemesi çözülmedi; goal native YouTube/CORS/DRM
  ve insan subjektif inceleme kanıtları gelmeden tamamlandı sayılmayacak.

## 2026-09-20 P2/P3 profil yolu

- Controller artık anime dışındaki manuel profilleri reddetmiyor; bundled WebGPU backend'i `live-action` ve `screen-3d` parametreleriyle çalışıyor.
- Gerçek çekim yolu sınırlı cross-denoise + unsharp, ekran/oyun/3D yolu yalnız bounded luminance ve diagonal-pass kapalı olacak şekilde ayrıldı; ekran yolu generatif/model iddiası taşımaz.
- 2x/3x hedefleri mevcut output-size sözleşmesiyle korunuyor; Anime4K yalnız doğrudan x2/x3 anime geometrisinde seçiliyor.
- Profil backend hatası tek denemede `safe` WebGPU düşük kaliteye, o da başarısızsa orijinal videoya döner. Orijinal `<video>`, ses ve oynatma durumu değiştirilmez.
- `npm run typecheck`, `npm run lint` ve ilgili 11 unit test geçti; son tam `npm run check` sonucu yukarıdaki kapanış kaydında tutuluyor.

## 2026-09-20 statik çekirdek düzeltmeleri

- Aynı video elementi kaynak/kalite değiştirince strict SDR/HDR kapısı yeniden uygulanıyor; HDR/unknown durumda mevcut overlay güvenle durduruluyor.
- Başlatma iptal edilirse geç gelen `GPUDevice` yok ediliyor; resize kuyruğu eski backend/overlay hatalarını yeni oturuma taşımıyor.
- Renk metadata okuması `VideoFrame` için `finally` kapanışı kullanıyor; çıktı limiti geçersiz adaptör değerlerinde fail-closed.
- Popup hedefleri doğrudan 2×/3×, 4K ve ekran seçeneklerini aynı ayar sözleşmesiyle gösteriyor; VideoLocator extension-owned overlay/HUD mutasyonlarını yok sayıyor.
- `npm run check` geçti (59 unit test, üç build hedefi).

## Mevcut durum

- MV3 TypeScript/Vite iskeleti, YouTube locator, non-destructive overlay, HUD ve A/B clip kontrolü hazır; kaynak `<video>` playback, ses ve oynatma durumu değiştirilmez.
- `Anime4kBackend` paket içi WGSL ile `low`/`high`, doğrudan x2/x3, stale-frame discard ve device-loss korumasını uygular. `FrameScheduler`, metrikler ve adaptif kalite production'a bağlıdır.
- Kullanıcının açık politikası nedeniyle benchmark, visual, adaptive ve extension entegrasyonu yalnız headless Chromium + terminal ile çalışır; headed/visible/ CUA yolları kod seviyesinde reddedilir.
- Canonical GPU kapısı fiziksel NVIDIA WebGPU/Vulkan, yazılım renderer reddi, ham zaman serileri ve eksiksiz koşuları zorunlu tutar.

## Son doğrulama

- Headless RTX 5070 benchmarkı: 1920×1080→3840×2160 direct 2×, 24/30 FPS low/high, 4×120 kare; güncel p95 en çok 10.00 ms (24/low), main-thread submit p50/p95/p99 alanları da canonical JSON'a eklendi; missed/skipped/stale/failed/bypass/GPU hata 0.
- Headless adaptive stress: high→low, 120 settled-low örneği, 5 saniye hysteresis sonrası low→high; maxConcurrentPrepares=1, failed=0, bypass=0.
- Görsel harness: 4 risk fixture × 3 mod; mekanik pass map, playback değişmezliği, temporal çift ve non-black çıktı kapıları mevcut.
- `tests/integration/extension.spec.ts` başlatması headless persistent Chromium kullanır; native YouTube/DRM/CORS ve insan subjektif kalite kararı bu masaüstü politikasında açık risk olarak kalır.
- Son headless doğrulama: `npm run check` (76 unit test + üç build), headless extension integration (3/3) ve adaptive/benchmark runner'ları geçti. Tam visual runner GPU kaynak yaşam döngüsü nedeniyle tamamlanmadı; 12 capture'lık headless arşiv manifesti korunuyor.
- Son headless extension integration artık 4/4: playback state + SPA replacement + same-element resize yanında pause/seek/rate/volume, captions, fullscreen sinyali ve controls DOM korunumu da fixture seviyesinde doğrulanıyor. Native YouTube DRM/CORS hâlâ açık.

## Sonraki somut adım

1. Headless canonical benchmark/adaptive JSON'larını koru; visual PNG/manifest arşivini referansla.
2. `npm run check` ve headless extension integration sonucunu kaydet.
3. Native YouTube ve insan gözlem kanıtı için kullanıcıdan ayrı, görünür olmayan bir test ortamı/manuel inceleme kararı bekle; bu eksikler kapanmadan goal'ü tamamlandı ilan etme.

## 2026-09-20 P1 headed visual harness düzeltmesi

- Görsel harness artık `sourceVideo` akışına bağlı değildir; Original paneli aynı
  boyutlu immutable SVG snapshot, WebGPU ise owned ImageBitmap/VideoFrame alır.
- Panel aspect-ratio/overflow geometrisi düzeltildi; kaynak ve enhanced panel
  siyah/eksik içerik için ayrı luminance kapısından geçmeden kanıt yazılamaz.
- Headed RTX 5070 koşusunda preflight ve 12/12 capture geçti; görsel incelemede
  halo, çift çizgi, renk taşması veya temporal shimmer görülmedi. Canonical
  manifest bu tam, headed ve headless olmayan koşudan üretildi.

## 2026-09-20 P5 manga static MVP

- `mangaEnabled` ayarı ve popup opt-in anahtarı eklendi; varsayılan kapalı.
- Video hattından bağımsız `MangaImagePipeline`, lazy IntersectionObserver,
  conservative uygunluk filtresi, overlap tile üretimi ve canvas overlay
  restoration davranışı eklendi.
- Orijinal `<img>` kaynağına dokunulmaz; stop/restore overlay'i kaldırır.
- Arbitrary-site host izni eklenmedi; exact optional-permission akışı
  `docs/MANGA_PIPELINE.md` içinde belgeli.
- P5 unit testleri dahil `npm run check` 65 test ile geçti.

## 2026-09-20 P4 conservative auto/reset plumbing

- `src/core/profiles/auto-profile.ts` bounded spatial feature + metadata heuristic,
  confidence threshold and three-sample hysteresis provides anime/live-action/
  screen-3d routing; incomplete/ambiguous evidence remains `safe`.
- Popup auto profile is enabled. `UpscalerController.observeAutoEvidence()` is
  opt-in and manual profiles always bypass the selector; no normal WebGPU
  readback or video mutation is introduced.
- `TemporalStateBoundary` and scheduler reset signals cover seek, quality change,
  source change, resize and explicit scene-cut. It stores no temporal history;
  stabilization remains a documented future model rather than a fake completion.
- P4 deterministic tests pass (auto classification/hysteresis/manual override
  behavior and temporal seek/scene-cut reset signals). Browser/GPU validation was
  intentionally not run under the headless-only policy.

## 2026-09-20 P2/P3 headed baseline

- 8 hücrelik live-action/screen-3d × 30/60 FPS × 2x/3x matrisi headed normal
  Chromium + fiziksel RTX 5070/Vulkan/WebGPU ile 120 frame/case çalıştı.
- Kaynak captureStream yerine owned SVG snapshot + VideoFrame kullanılır; OCR,
  text-edge ve halo proxy fixture ölçümleri ham sample dizileriyle raporlanır.
- Sonuç yalnız bundled WebGpuBackend conservative shader baseline'ıdır; WebSR/
  RT4KSR gerçek model karşılaştırması mevcut olmadığından pending kalır.
