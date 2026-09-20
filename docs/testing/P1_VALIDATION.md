# P1 Anime MVP Doğrulama Kaydı

Tarih: 2026-09-20  
Durum: **Headless kayıtlar tanı arşivine taşındı; headed canonical ve insan gözlem adımları açık.**

## Kabul politikası

Canonical benchmark/adaptive/görsel kabul kanıtı headed Chromium olmalıdır. `headless:true` veya
`HeadlessChrome` user-agent içeren her kayıt, fiziksel GPU bulunsa bile geçersizdir ve yalnız açık
adlı diagnostic-headless arşivde tutulur. Canonical kapı headed flag, normal user-agent, fiziksel
GPU, yazılım renderer reddi, ham zaman serileri ve tamamlanmış koşuları zorunlu tutar.

Son headed visual denemesinde ilk hata `Anime4kBackendError: WebGPU cihazı kaybedildi` idi.
Tanı, fixture `canvas.captureStream()` kaynağının headed Vulkan WebGPU external-image yaşam
döngüsüyle çakışabileceğini gösterdi. Harness artık fixture'ı sahipli `ImageBitmap`/`VideoFrame`
olarak veriyor ve kaynağı açıkça kapatıyor; sonraki tanı koşusunda `deviceLost` gözlenmedi.
Bu düzeltme visual kanıtı otomatik olarak kabul etmez: içerik kırpma/insan incelemesi başarısız
kaldığı için headed visual manifest hâlâ pending ve diagnostic arşivde tutuluyor.

## P1 kabul matrisi

| P1 kriteri                                    | Durum                                         | Kanıt                                                       |
| --------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Anime4K tabanlı en az iki seviye              | **Tamamlandı (kod/ölçüm)**                    | `Anime4kBackend`: low=1 pass, high=2 pass; benchmark JSON'ı |
| 1080p→4K 24/30 FPS gerçek zamanlı             | **Bekliyor — headed kanıt gerekli**           | Headless kayıt diagnostic arşivinde; sentetik kaynak sınırı |
| GPU yetişmeyince otomatik seviye düşürme      | **Bekliyor — headed kanıt gerekli**           | Headless stress kayıtları diagnostic arşivinde              |
| Orijinal/iyileştirilmiş karşılaştırma         | **Mekanik kayıt tanı amaçlı**                 | Headless slider 0/55/100; headed/native kontrolü açık       |
| Halo/çift çizgi/renk lekesi/temporal titreşim | **Kayıt tamamlandı; subjektif inceleme açık** | 12 PNG (4 fixture × 3 mod), visual manifesti                |

## Performans kanıtı

Headless koşu kaynak `1920×1080`, çıktı `3840×2160`, doğrudan x2; fiziksel NVIDIA GeForce RTX
5070, Chrome/Chromium 151, WebGPU + Vulkan etkin olduğunu bildirdi. Bu kayıt canonical kabul
değildir; headed yeniden koşu beklenir.

| FPS |       low (p50/p95/p99) |     high (p50/p95/p99) |
| --: | ----------------------: | ---------------------: |
|  24 | 7.30 / 10.00 / 10.20 ms | 7.10 / 9.90 / 10.10 ms |
|  30 |  7.10 / 8.40 / 10.00 ms |  7.20 / 7.60 / 7.90 ms |

Ham örnekler ve p50/p95/p99 alanları canonical JSON'da saklanır; bu sonuç sentetik SDR
canvas/ImageBitmap harness ölçümüdür, native YouTube/DRM/CORS ölçümü değildir. Aynı JSON'da
`mainThreadSamplesMs` ve main-thread p50/p95/p99 alanları da bulunur; bu koşuda submit maliyeti
ayrıca kaydedilmiştir.

## Adaptive kanıtı

Diagnostic headless WebGPU harness'inde high kaliteye deterministik 32.2 ms yük uygulanarak üç
ardışık bütçe aşımından sonra low'a geçiş gözlendi.
Sonraki 120 low örneği bütçe altında kaldı;
en az 5 saniye istikrarlı boşluktan sonra high'a döndü. `maxConcurrentPrepares=1`, stale=1,
failed=0, bypass=0 ve GPU hatası yoktur.

## Görsel risk kanıtı

`halo`, `double-line`, `color-bleed` ve `temporal-shimmer` fixture'ları; `anime-low`,
`anime-high` ve `safe-fallback` modlarında kaydedildi. Mechanical archive manifest; seed, çözünürlük, mod,
pass sayısı, playback değişmezliği, temporal çift ve non-black çıktı kontrollerini içerir.
Mevcut headless manifest ve PNG/hash kayıtları canonical yoldan çıkarılıp
`archive-diagnostic-headless-2026-09-20` altına taşınmıştır; headed yeniden capture beklenir.
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

Canonical benchmark/adaptive/visual JSON yolu şu anda bilerek boştur. Raw headless kayıtları
`docs/testing/evidence/p1/archive-diagnostic-headless-2026-09-20/`,
`archive-diagnostic-headless-adaptive-2026-09-20/` ve
`visual/archive-diagnostic-headless-2026-09-20/` altındadır; bunlar kabul kanıtı değildir.

## Açık native kabul kapısı

Native YouTube DRM/CORS, altyazı/kontrol/tam ekran/seek ve insan görsel değerlendirmesi için ayrı,
kullanıcı tarafından izin verilen bir headed masaüstü ortamı gerekir. Bu çalışma alanında headed
komut çalıştırılmadı; canonical kabul bu nedenle beklemede.

Headless extension fixture'ı bu P0 bağımlılıklarının güvenli alt kümesini 4/4 testle doğrular:
pause/seek/playback-rate/volume, captions track, fullscreen değişim sinyali, kontrol DOM'u,
SPA video değişimi ve aynı-element çözünürlük değişimi. Bu sonuç native YouTube DRM/CORS veya
gerçek compositor kabulü değildir.
