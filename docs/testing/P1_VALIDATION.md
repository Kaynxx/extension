# P1 Anime MVP Doğrulama Kaydı

Tarih: 2026-09-20  
Durum: **Headed mekanik P1 kanıtı mevcut; native YouTube ve insan görsel kabulü açık.**

2026-09-20 headed reconciliation: benchmark, adaptive ve visual JSON'ları `headless:false`,
normal Chrome/151 user-agent ve fiziksel RTX 5070/Vulkan/WebGPU kanıtı taşıyor. Benchmark
dört koşulda 120/120 frame, failed=0 ve GPU error=0; adaptive headed guard'larının tamamı
true. Visual manifest 12 capture ve tüm mekanik objective guard'larını geçiyor, ancak
`humanReviewRequired:true`; bu manifest mekanik canonical kanıttır, nihai insan/native kabulü değildir.

## Kabul politikası

Canonical benchmark/adaptive/görsel kabul kanıtı headed Chromium olmalıdır. `headless:true` veya
`HeadlessChrome` user-agent içeren her kayıt, fiziksel GPU bulunsa bile geçersizdir ve yalnız açık
adlı diagnostic-headless arşivde tutulur. Canonical kapı headed flag, normal user-agent, fiziksel
GPU, yazılım renderer reddi, ham zaman serileri ve tamamlanmış koşuları zorunlu tutar.

Son headed visual denemesinde ilk hata `Anime4kBackendError: WebGPU cihazı kaybedildi` idi.
Tanı, fixture `canvas.captureStream()` kaynağının headed Vulkan WebGPU external-image yaşam
döngüsüyle çakışabileceğini gösterdi. Harness artık fixture'ı sahipli `ImageBitmap`/`VideoFrame`
olarak veriyor ve kaynağı açıkça kapatıyor; sonraki tanı koşusunda `deviceLost` gözlenmedi.
Bu düzeltme visual manifesti mekanik olarak doğrular; içerik kırpma/insan incelemesi ve native
YouTube gözlemi hâlâ açık olduğundan P1 bütünü tamamlanmış sayılmaz. İlk hata kaydı ile
`visual/archive-diagnostic-headed-2026-09-20/` altındaki takip arşivi diagnostic'tir.

## P1 kabul matrisi

| P1 kriteri                                    | Durum                                       | Kanıt                                                       |
| --------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Anime4K tabanlı en az iki seviye              | **Tamamlandı (kod/ölçüm)**                  | `Anime4kBackend`: low=1 pass, high=2 pass; benchmark JSON'ı |
| 1080p→4K 24/30 FPS gerçek zamanlı             | **Headed mekanik ölçüm tamam; native açık** | `benchmark-results.json`, 4×120 frame, raw samples          |
| GPU yetişmeyince otomatik seviye düşürme      | **Headed guard tamam; native açık**         | `adaptive-results.json`, guard'lar ve raw samples           |
| Orijinal/iyileştirilmiş karşılaştırma         | **Mekanik tamam; insan/native açık**        | `visual/visual-results.json`, 12 capture                    |
| Halo/çift çizgi/renk lekesi/temporal titreşim | **Mekanik tamam; subjektif inceleme açık**  | 12 capture, `humanReviewRequired:true`                      |

## Performans kanıtı

Headed koşu kaynak `1920×1080`, çıktı `3840×2160`, doğrudan x2; fiziksel NVIDIA GeForce RTX
5070, Chrome/Chromium 151, WebGPU + Vulkan etkin olduğunu bildirdi. Bu sentetik
canvas/ImageBitmap ölçümüdür; native YouTube/DRM/CORS ölçümü değildir.

| FPS |        low (p50/p95/p99) |       high (p50/p95/p99) |
| --: | -----------------------: | -----------------------: |
|  24 | 10.40 / 11.00 / 11.60 ms | 10.40 / 11.30 / 12.90 ms |
|  30 | 10.20 / 10.80 / 11.20 ms | 10.40 / 11.20 / 12.10 ms |

Ham örnekler ve p50/p95/p99 alanları canonical JSON'da saklanır; bu sonuç sentetik SDR
canvas/ImageBitmap harness ölçümüdür, native YouTube/DRM/CORS ölçümü değildir. Aynı JSON'da
`mainThreadSamplesMs` ve main-thread p50/p95/p99 alanları da bulunur; bu koşuda submit maliyeti
ayrıca kaydedilmiştir.

## Adaptive kanıtı

Headed WebGPU harness'inde high kaliteye deterministik 32.2 ms yük uygulanarak üç
ardışık bütçe aşımından sonra low'a geçiş gözlendi.
Sonraki 120 low örneği bütçe altında kaldı;
en az 5 saniye istikrarlı boşluktan sonra high'a döndü. `maxConcurrentPrepares=1`, stale=1,
failed=0, bypass=0 ve GPU hatası yoktur.

## Görsel risk kanıtı

`halo`, `double-line`, `color-bleed` ve `temporal-shimmer` fixture'ları; `anime-low`,
`anime-high` ve `safe-fallback` modlarında kaydedildi. Mechanical archive manifest; seed, çözünürlük, mod,
pass sayısı, playback değişmezliği, temporal çift ve non-black çıktı kontrollerini içerir.
Headless manifest ve PNG/hash kayıtları `archive-diagnostic-headless-2026-09-20` altında
diagnostic olarak korunur; güncel headed manifest `visual/visual-results.json` yolundadır.
Mekanik kayıt insan gözünün “olumlu/olumsuz” kalite kararının yerine geçmez; bu karar native
masaüstü açmadan yapılmayacağı için P1 goal'ü henüz tamamlandı ilan edilmemiştir.

## Tekrar üretim (headed canonical; çalıştırılmadı)

```bash
P1_CHROME_BIN=chromium P1_BENCHMARK_FRAMES=120 npm run test:p1-benchmark
P1_CHROME_BIN=chromium npm run test:p1-adaptive
P1_CHROME_BIN=chromium npm run test:p1-visual
P1_CHROME_BIN=chromium npm run test:p1-visual-manifest
node scripts/acceptance-validation.mjs --validate-manifest docs/testing/evidence/p1/visual/visual-results.json
```

## Mevcut kanıt arşivleri

Canonical mekanik JSON yolları:
`docs/testing/evidence/p1/benchmark-results.json`,
`docs/testing/evidence/p1/adaptive-results.json` ve
`docs/testing/evidence/p1/visual/visual-results.json`. Eski headless kayıtları
`archive-diagnostic-headless-*` altında diagnostic'tir; headed visual takip arşivi de
`visual/archive-diagnostic-headed-2026-09-20/` altında diagnostic tutulur.

## Açık native kabul kapısı

Native YouTube DRM/CORS, altyazı/kontrol/tam ekran/seek ve insan görsel değerlendirmesi için ayrı,
kullanıcı tarafından izin verilen bir headed masaüstü ortamı gerekir. Mekanik headed koşu tamamlanmış
olsa da native YouTube doğrulaması 401/403 ve overlay kaybı nedeniyle kısmi; insan görsel kararı
ayrıca beklemede. Bu nedenle nihai P1 kabulü beklemededir.

Headless extension fixture'ı bu P0 bağımlılıklarının güvenli alt kümesini 4/4 testle doğrular:
pause/seek/playback-rate/volume, captions track, fullscreen değişim sinyali, kontrol DOM'u,
SPA video değişimi ve aynı-element çözünürlük değişimi. Bu sonuç native YouTube DRM/CORS veya
gerçek compositor kabulü değildir.
