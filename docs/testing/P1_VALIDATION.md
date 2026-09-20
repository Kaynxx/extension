# P1 Anime MVP Doğrulama Kaydı

Tarih: 2026-09-20  
Durum: **Headless doğrulama arşivleri mevcut; native YouTube ve insan gözlem adımları açık.**

## Kabul politikası

Benchmark, adaptive, görsel harness ve extension entegrasyonu yalnız headless Chromium ile
çalışır; headed/visible/CUA açılışları kod seviyesinde reddedilir. Canonical kapı `headless:true`,
`HeadlessChrome`, fiziksel GPU, yazılım renderer reddi, ham zaman serileri ve tamamlanmış koşuları
zorunlu tutar.

## P1 kabul matrisi

| P1 kriteri                                    | Durum                                         | Kanıt                                                                     |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Anime4K tabanlı en az iki seviye              | **Tamamlandı (kod/ölçüm)**                    | `Anime4kBackend`: low=1 pass, high=2 pass; benchmark JSON'ı               |
| 1080p→4K 24/30 FPS gerçek zamanlı             | **Headless donanımda doğrulandı**             | Güncel 4×120 RTX 5070 koşusu, p95 en çok 10.20 ms; sentetik kaynak sınırı |
| GPU yetişmeyince otomatik seviye düşürme      | **Headless stress arşivinde**                 | high→low, 120 low kare, 5 s recovery; low→bypass unit kanıtı              |
| Orijinal/iyileştirilmiş karşılaştırma         | **Mekanik olarak tamamlandı**                 | A/B PNG'leri ve fixture harness; native YouTube manuel kontrolü açık      |
| Halo/çift çizgi/renk lekesi/temporal titreşim | **Kayıt tamamlandı; subjektif inceleme açık** | 12 PNG (4 fixture × 3 mod), visual manifesti                              |

## Performans kanıtı

Güncel headless koşu kaynak `1920×1080`, çıktı `3840×2160`, doğrudan x2; fiziksel NVIDIA
GeForce RTX 5070, Chrome/Chromium 151, WebGPU + Vulkan etkin. Dört koşunun her biri 120 kare sundu; missed,
skipped, stale, failed, bypass ve GPU hata sayaçları sıfırdır. p95 değerleri:

| FPS |      low |     high |
| --: | -------: | -------: |
|  24 | 10.20 ms | 10.20 ms |
|  30 |  8.20 ms |  8.50 ms |

Ham örnekler ve p50/p95/p99 alanları canonical JSON'da saklanır; bu sonuç sentetik SDR
canvas/ImageBitmap harness ölçümüdür, native YouTube/DRM/CORS ölçümü değildir.

## Adaptive kanıtı

Headless gerçek WebGPU harness'inde high kaliteye deterministik 32.2 ms yük uygulanarak üç
ardışık bütçe aşımından sonra low'a geçiş gözlendi.
Sonraki 120 low örneği bütçe altında kaldı;
en az 5 saniye istikrarlı boşluktan sonra high'a döndü. `maxConcurrentPrepares=1`, stale=1,
failed=0, bypass=0 ve GPU hatası yoktur.

## Görsel risk kanıtı

`halo`, `double-line`, `color-bleed` ve `temporal-shimmer` fixture'ları; `anime-low`,
`anime-high` ve `safe-fallback` modlarında kaydedildi. Manifest; seed, çözünürlük, mod, pass
sayısı, playback değişmezliği, temporal çift ve non-black çıktı kontrollerini içerir.
Mekanik kayıt insan gözünün “olumlu/olumsuz” kalite kararının yerine geçmez; bu karar native
masaüstü açmadan yapılmayacağı için P1 goal'ü henüz tamamlandı ilan edilmemiştir.

## Tekrar üretim (headless-only)

```bash
P1_CHROME_BIN=chromium P1_BENCHMARK_FRAMES=120 npm run test:p1-benchmark
P1_CHROME_BIN=chromium npm run test:p1-adaptive
P1_CHROME_BIN=chromium npm run test:p1-visual
```

## Mevcut kanıt arşivleri

`docs/testing/evidence/p1/benchmark-results.json` ve
`docs/testing/evidence/p1/adaptive-results.json` güncel headless GPU kayıtlarıdır. Fixture manifestleri ve PNG'ler
`docs/testing/evidence/p1/visual/archive-diagnostic-headless-2026-09-15/` altındadır; bunlar canonical visual manifest veya insan kalite kararı değildir.

## Açık native kabul kapısı

Native YouTube DRM/CORS, altyazı/kontrol/tam ekran/seek ve insan görsel değerlendirmesi için ayrı,
kullanıcı tarafından izin verilen bir masaüstü ortamı gerekir. Bu çalışma alanındaki runner'lar
`headless:false` değerini bilinçli olarak reddeder; bu nedenle burada başlıklı/görünür komut çalıştırılmadı.
