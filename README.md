# WebGPU Video Upscaler

YouTube ile başlayarak web videolarını kullanıcının cihazında, WebGPU üzerinden ve içerik türüne uygun modellerle gerçek zamanlı iyileştirmeyi amaçlayan Chrome eklentisi.

Kaynak video değiştirilmez veya yeniden kodlanmaz; işlenmiş görüntü ayrı bir canvas katmanında gösterilir. Mevcut ağaçta P0–P5 için çalışan statik/fixture kapsamı vardır, ancak yayın kabulü henüz tamamlanmış değildir.

## Belgeler

- [Uygulama planı](docs/IMPLEMENTATION_PLAN.md)
- [Araştırma klasörü](docs/research/README.md)
- [İlk fizibilite araştırması](docs/research/initial-feasibility.md)
- [Proje hafızası](memory-bank/README.md)

## Mevcut Aşama

`P5 statik manga MVP + P1/P2/P3/P4 doğrulama ve yayın hazırlığı`

Kod ve fixture kanıtları; MV3 build'i, YouTube overlay/scheduler'ı, Anime4K uyumlu bundled WGSL yolu, live-action/screen-3d güvenli profilleri, bounded auto/reset plumbing'i ve opt-in manga hattını kapsar. `npm run check` ile statik doğrulama geçer; `npm audit --omit=dev` bilinen açık bildirmemiştir. P1 benchmark/adaptive ve 12-capture visual manifest headed mekanik kanıttır; native YouTube ve insan görsel kabulü hâlâ açıktır.

## Açık yayın kabulü

- Native YouTube'da DRM/CORS, altyazı/kontrol/tam ekran/seek ve gerçek kullanıcı gözlemli görsel kalite kararı henüz doğrulanmadı.
- P1 visual manifesti (`docs/testing/evidence/p1/visual/visual-results.json`) headed mekanik guard'ları geçer; `humanReviewRequired:true` olduğu için insan/native inceleme açık kalır.
- P2/P3 bundled baseline 8 koşulda 120/120 frame ile ölçülmüştür; gerçek WebSR/RT4KSR karşılaştırması, OCR/halo kabulü ve ayrı model 60 FPS benchmarkı açık kalır.
- P4 temporal stabilizasyon modeli uygulanmadı; mevcut sınır yalnız reset ve stale-frame güvenliğidir.

Bu oturumda headed tarayıcı/GPU testi çalıştırılmadı. Ayrı bir izinli ortamda tek seferlik headed manuel kabul için `docs/testing/P1_VALIDATION.md` içindeki komut ve açık riskler kullanılmalıdır.

## Release paketi

`npm run package:release` deterministik ZIP ve yanında SHA256 üretir: `artifacts/webgpu-video-upscaler-0.1.0.zip`.
