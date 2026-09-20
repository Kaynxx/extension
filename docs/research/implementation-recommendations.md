# Uygulama ve benchmark önerileri

## Önerilen MVP sırası

### P0: model olmadan yol doğrulama

- Video→GPU texture→canvas yolu.
- `requestVideoFrameCallback` ile latest-frame-wins scheduler.
- Kaynak, hedef, codec, tam ekran ve YouTube SPA yaşam döngüsü değişimlerinde resize/dispose.
- Yerel p50/p95/p99, missed-frame ve device-loss HUD'u.

### P1: Anime4K-WebGPU profili

- Low: tek doğrudan x2 CNN/WGSL geçişi.
- Medium: x2 + sınırlı denoise/deblur.
- High: yalnızca benchmark geçerse restore/GAN benzeri ek adım.
- Varsayılan: halo/aliasing ve uydurma doku sınırlandırılmış low veya medium.

### P2: RT4KSR tabanlı gerçek çekim

- Resmî x2/x3 checkpoint'i ONNX veya doğrudan WGSL'e çevirmeden önce graph ve operatör listesini çıkar.
- 1080p→4K x2 ve 720p→4K x3 ayrı backend manifestleri olsun.
- İlk portta feature map'leri 4K'ya taşımaktan kaçın.
- YouTube VP9/AV1/H.264 sıkıştırmasını içeren içerik setiyle test et; yalnızca DIV2K bicubic sonuçlarına güvenme.

### P3: screen/3D

- Küçük metin, UI çizgisi, oyun HUD'ı ve düz renk geçişi içeren test klipleri.
- OCR/karakter biçimi korunumu ve halo/renk taşması manuel A/B ile birlikte ölçülsün.
- Anime veya live-action modelinin otomatik olarak bu profile geçirilmesi yasak olsun.

### Gelecek

- NanoVSR gibi temporal modeller, canlı gecikme ve WebGPU dönüşümü kanıtlandıktan sonra.
- Real-ESRGAN/diffusion kalite modu, yalnızca duraklatılmış kare veya kullanıcı seçimiyle.

## Kalite seviyeleri

| Seviye   | İş yükü                         | Hedef                          |
| -------- | ------------------------------- | ------------------------------ |
| Bypass   | Yalnızca orijinal video         | Her cihazda güvenli çıkış      |
| Safe     | Basit shader/çok hafif x2       | Düşük GPU, kısa test başarısız |
| Balanced | Anime4K low veya RT4KSR-lite    | 30 FPS sürdürülebilirlik       |
| Quality  | Daha geniş model/ek restoration | Güçlü GPU, p95 boşluğu varsa   |

Kalite yükseltme en az birkaç saniye kararlı boşluk beklemeli; düşürme daha hızlı yapılmalıdır. Bu, kalite seviyesinin kareden kareye titreşmesini önler.

## Test matrisi

| Boyut     | Değerler                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| İçerik    | anime, gerçek çekim, ekran/oyun/3D                                            |
| Kaynak    | 720p, 1080p; 24/30/60 FPS                                                     |
| Hedef     | oynatıcı fiziksel boyutu, 1440p, 4K                                           |
| Cihaz     | iGPU, 4–6 GB, 8 GB, 10–12 GB, 16 GB+                                          |
| Tarayıcı  | güncel Chrome stable, WebGPU açık/kapalı fallback                             |
| Metrik    | p50/p95/p99, missed frame, presented frame, GPU memory, main-thread long task |
| Görsel    | PSNR/SSIM/LPIPS/VMAF sinyalleri + kör A/B + halo/titreşim/OCR                 |
| Uzun test | en az 20–30 dakika, sıcaklık/güç ve device loss gözlemi                       |

## Kabul kapıları

- 30 FPS içerikte art arda p95 aşımı yok.
- 60 FPS içerikte hedef cihaz profili açıkça etiketli; “her cihazda 60 FPS” iddiası yok.
- Eski frame sonucu tamamlandığında daha yeni kare gösterildiyse ekrana sunulmuyor.
- Ses, oynatma konumu, seek ve duraklatma orijinal `<video>` üzerinden değişmeden kalıyor.
- HDR, DRM/protected media, CORS veya device loss durumunda güvenli bypass.
- Yüz, yazı ve anime çizgisinde görsel olarak doğrulanmamış generatif ayrıntı varsayılan değil.

## Model paketleme

Her model manifesti en az şu alanları taşımalı:

```json
{
  "id": "rt4ksr-x2-safe",
  "profile": "live-action",
  "scale": 2,
  "input": { "maxWidth": 1920, "maxHeight": 1080 },
  "runtime": "webgpu",
  "precision": "fp16-or-fp32",
  "weightsSha256": "required",
  "codeLicense": "Apache-2.0",
  "weightsLicense": "verify-separately",
  "qualityLevel": "balanced"
}
```

Model ağırlıkları veri olarak cache'lenebilir; çalıştırılabilir JavaScript/WASM uzaktan yüklenmemelidir. Hash, sürüm ve model uyumluluğu doğrulanmadan ağırlık kullanılmamalıdır.
