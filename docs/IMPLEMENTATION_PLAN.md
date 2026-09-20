# Uygulama Planı

Tarih: 2026-09-14 (son durum: 2026-09-20)  
Durum: Aktif — yayın kabulü açık  
Mevcut aşama: P5 statik manga MVP; P1/P2/P3/P4 kabul doğrulaması sürüyor

> Bu plan hedef kapsamını korur. Mevcut kodun statik ve headless kanıtları bazı maddeleri
> desteklese de native YouTube, insan görsel değerlendirmesi ve model-karşılaştırma kapıları
> kapanmadığı için proje tamamlandı sayılmaz. Ayrıntılı durum `README.md`,
> `docs/testing/P1_VALIDATION.md` ve `memory-bank/progress.md` içindedir.

## 1. Başarı Tanımı

Eklenti, desteklenen bir YouTube videosunda kullanıcının cihazından ayrılmadan WebGPU ile iyileştirilmiş görüntü üretmeli ve:

- Orijinal video/ses akışına dokunmamalı.
- Oynatma konumu, hızı, duraklatma ve tam ekran davranışını korumalı.
- GPU yetersiz kaldığında eski kareleri kuyrukta göstermemeli.
- Anime, gerçek çekim ve ekran/oyun içeriğinde ayrı işleme profilleri kullanmalı.
- 4K ekran için 1080p→2x ve 720p→3x yollarını desteklemeli.
- Kullanıcıya anlık kapatma ve orijinal/iyileştirilmiş karşılaştırma sunmalı.
- Desteklenmeyen GPU, CORS/DRM veya HDR durumunda güvenle orijinale dönmeli.

"4K" yalnızca canvas boyutu anlamına gelmez. Hedef, kaynaktan geri getirilebilen ayrıntıyı iyileştirmek ve sıkıştırma kaynaklı bozulmaları kontrollü biçimde azaltmaktır.

## 2. Ürün Kapsamı

### İlk sürüm

- Chrome Manifest V3
- YouTube masaüstü sitesi
- SDR video
- WebGPU
- Manuel profil seçimi
- Anime profili
- Gerçek çekim profili
- Ekran/oyun/3D profili
- Otomatik GPU seviye testi
- Yerel inference ve telemetrisiz varsayılan davranış

### Sonraki sürümler

- Otomatik içerik sınıflandırma
- Hafif temporal stabilizasyon
- Diğer HTML5 video siteleri
- Eski/ağır bozulmuş içerik profili
- Manga ve webtoon görselleri
- HDR; ancak renk doğruluğu ayrı kabul testlerinden geçerse

### İlk sürüm dışı

- Bulut GPU işleme
- Videoyu indirme veya yeniden kodlama
- Kare interpolasyonu
- DRM kısıtlamalarını aşma
- Kayıp gerçek ayrıntının hatasız geri getirileceği iddiası

## 3. Hedef Mimari

```text
MV3 service worker
  ├─ site izni ve kullanıcı ayarları
  ├─ model manifesti / sürümü / cache yönetimi
  └─ content script yaşam döngüsü

YouTube content script
  ├─ VideoLocator (SPA + MutationObserver)
  ├─ OverlayController (canvas, boyut, tam ekran, kontroller)
  ├─ FrameScheduler (requestVideoFrameCallback)
  ├─ CapabilityProbe (WebGPU, limitler, formatlar)
  ├─ AdaptiveQualityController
  └─ MetricsCollector (yalnızca yerel)
             │
             ▼
       Frame Processing Pipeline
  video external texture
    → renk/girdi hazırlama
    → profile-specific preprocess
    → x2 veya x3 SR modeli
    → kontrollü restoration/sharpen
    → WebGPU canvas
```

### Temel modül sınırları

- `VideoLocator`: YouTube SPA geçişlerinde aktif video elementini bulur.
- `OverlayController`: Canvas'ı videonun görünen piksel alanıyla hizalar; altyazı ve kontrolleri kapatmaz.
- `FrameScheduler`: Her sunulan kareyi izler, birikmiş iş oluşturmaz.
- `UpscalerBackend`: Modelden bağımsız `initialize/render/resize/dispose` sözleşmesi.
- `ProfileRegistry`: Anime, live-action ve screen/3D modellerini aynı yaşam döngüsü altında toplar.
- `AdaptiveQualityController`: Gecikme, kaçan kare ve GPU cihaz kaybına göre kaliteyi azaltır.
- `SafeFallback`: Hızlı shader upscale veya orijinal video.

## 4. Model Stratejisi

### Anime

- P1 başlangıcı: Anime4K-WebGPU veya uyumlu WGSL portu.
- 1080p kaynakta `2x` CNN hattı.
- 720p ve eski anime ayrı test edilir; 1080p ayarı otomatik uygulanmaz.
- Denoise ve deblur, kullanıcı tarafından veya profil tarafından ayrı kontrollere sahip olur.

### Gerçek çekim

- P2 prototip: WebSR Real Life S/M/L ağlarını benchmark et.
- Uzun vadeli aday: RT4KSR tabanlı doğrudan `2x` ve `3x` modeller.
- YouTube/VP9/AV1/H.264 sıkıştırmasını taklit eden verilerle fine-tune.
- Tam Real-ESRGAN yalnızca karşılaştırma veya duraklatılmış görsel kalite modu adayıdır.

### Ekran, oyun ve 3D

- Yazı glifleri, UI kenarları ve düz renk geçişleri için ayrı model.
- Halo, renk taşması ve harf biçimi değişikliği reddetme kriteridir.

### Manga

- Video MVP'sinden sonra ayrı image pipeline olarak geliştirilir.
- Sayfa tile'lara ayrılır; dikiş izi oluşmaması için overlap kullanılır.
- Metin balonları ve çizim bölgeleri farklı işlenir.
- Metinde generatif ayrıntı üretimi kullanılmaz.

## 5. Kare Zamanlama ve Performans Bütçesi

- 30 FPS kare süresi: 33,3 ms. SR hedefi: en fazla 20–24 ms.
- 60 FPS kare süresi: 16,7 ms. SR hedefi: tercihen 8–10 ms.
- Son 120 kare üzerinden p50, p95 ve p99 inference süresi tutulur.
- `presentedFrames` farkıyla kaçırılan kareler izlenir.
- P95 bütçeyi art arda aşarsa profil bir kademe düşer.
- Kalite yükseltme, en az 5 saniyelik istikrarlı boşluk sonrasında yapılır; sık seviye değişimi engellenir.
- Yeni kare geldiğinde eski bekleyen inference iptal edilemiyorsa sonucu sunulmaz.
- Hedef canvas boyutu, oynatıcının fiziksel piksel boyutu ile kullanıcının hedefi arasındaki minimumdur.

## 6. Aşamalar ve Kabul Kriterleri

### P0 — YouTube/WebGPU fizibilite prototipi

Amaç: Model eklemeden önce video→GPU→canvas yolunun doğrulanması.

- [ ] MV3 eklentisi Chrome'a unpacked olarak yükleniyor.
- [ ] Yalnızca gerekli YouTube izinleri isteniyor.
- [ ] YouTube SPA gezinmesinde aktif `<video>` bulunuyor.
- [ ] Video karesi `GPUExternalTexture` veya doğrulanmış eşdeğer yolla canvas'ta gösteriliyor.
- [ ] Ses ve video kontrol davranışı bozulmuyor.
- [ ] Duraklatma, ileri/geri sarma, kalite değiştirme ve tam ekran test ediliyor.
- [ ] Canvas boyutu kaynağın ve oynatıcının değişimine uyuyor.
- [ ] Yerel FPS, p50/p95 frame cost ve missed-frame sayacı görülebiliyor.
- [ ] WebGPU/CORS/cihaz kaybında orijinal video otomatik geri geliyor.

### P1 — Anime MVP

- [ ] Anime4K tabanlı en az iki performans seviyesi çalışıyor.
- [ ] 1080p→4K 24/30 FPS hedef cihazda gerçek zamanlı.
- [ ] GPU yetişmediğinde otomatik seviye düşüyor.
- [ ] Orijinal/iyileştirilmiş karşılaştırma kontrolü var.
- [ ] Halo, çift çizgi, renk lekesi ve temporal titreşim örnekleri kaydedildi.

### P2 — Gerçek çekim MVP

- [ ] WebSR ve RT4KSR türevi adaylar aynı test setinde karşılaştırıldı.
- [ ] Doğrudan x2 ve x3 modeller destekleniyor.
- [ ] Safe profil kimlik/yüz ayrıntısı uydurmuyor.
- [ ] Sıkıştırma bloklarını büyütme oranı manuel ve metrik testlerinden geçiyor.
- [ ] 30 ve 60 FPS davranışı ayrı benchmark edildi.

### P3 — Ekran/oyun/3D profili

- [ ] Küçük yazılar ve UI örneklerinde karakter şekli korunuyor.
- [ ] Anime ve gerçek çekim profillerinden anlamlı derecede daha az halo/renk taşması var.
- [ ] Manuel profil seçimi anlık ve güvenli.

### P4 — Otomatik seçim ve temporal stabilizasyon

- [ ] Sınıflandırıcı her karede değil, düşük frekansta ve sahne bazlı çalışıyor.
- [ ] Düşük güvende profil değiştirmiyor veya Safe moda dönüyor.
- [ ] Sahne kesiminde temporal durum sıfırlanıyor.
- [ ] Temporal katman gecikmeyi kabul edilen bütçenin dışına çıkarmıyor.

### P5 — Manga/webtoon

- [ ] Lazy-loaded sayfalar algılanıyor.
- [ ] Tile dikişleri normal yakınlaştırmada görünmüyor.
- [ ] Metin gliflerinde anlam veya şekil değişikliği yok.
- [ ] Orijinal görsel tek hareketle geri getirilebiliyor.

### P6 — Mağaza ve yayın hazırlığı

- [ ] Tüm çalıştırılabilir kod paket içinde.
- [ ] Model dosyaları hash ve sürümle doğrulanıyor.
- [ ] Üçüncü taraf lisans/atıf listesi eksiksiz.
- [ ] İzinler minimum ve kullanıcıya açıklanıyor.
- [ ] Gizlilik politikası yerel işlemeyi doğru anlatıyor.
- [ ] En az düşük, orta ve yüksek GPU katmanı test edildi.

## 7. Test Stratejisi

### Fonksiyonel

- Normal oynatma, duraklatma ve seek
- YouTube SPA video geçişi
- Kaynak kalite değişimi: 720p ↔ 1080p
- Tam ekran, sinema modu ve pencere boyutlandırma
- Altyazılar ve oynatıcı kontrolleri
- Birden fazla video elementi bulunan sayfa
- WebGPU device loss ve sekme arka plana alma

### Görsel kalite

- PSNR ve SSIM: referansı bilinen kontrollü veri
- LPIPS: algısal fark
- VMAF: video seviyesinde ek sinyal
- Temporal titreşim/tutarsızlık metriği
- Kör A/B insan değerlendirmesi
- Anime için çizgi/halo; ekran için OCR karakter doğruluğu

Tek bir metrik yayın kararı vermek için yeterli değildir.

### Performans

- Kaynak/ hedef çözünürlük
- Video FPS ve ekran yenileme hızı
- Inference p50/p95/p99
- Kaçırılan/sunulmayan kare
- GPU bellek kullanımı ve device loss
- Ana iş parçacığı uzun görevleri
- Güç tüketimi/termal davranış için uzun oynatma testi

## 8. Planlanan Depo Yapısı

```text
src/
  background/
  content/
    youtube/
  core/
    gpu/
    scheduling/
    metrics/
    profiles/
    models/
  ui/
  workers/
models/
  manifests/
tests/
  unit/
  integration/
  fixtures/
  visual/
scripts/
docs/
  research/
memory-bank/
```

Bu dizinler ilgili aşama başlamadan boş olarak oluşturulmaz.

## 9. Başlıca Riskler

| Risk                        | Etki                             | Önlem                                                           |
| --------------------------- | -------------------------------- | --------------------------------------------------------------- |
| CORS/origin-clean engeli    | Kare GPU'ya alınamaz             | P0'da gerçek YouTube testi; güvenli bypass                      |
| DRM/protected video         | Bazı siteler desteklenmez        | Korumayı aşmama; destek matrisi                                 |
| GPU modelinin yavaş kalması | A/V hissi ve akıcılık bozulur    | Benchmark, kalite kademeleri, kuyruksuz scheduler               |
| Tek kareli model titreşimi  | Görsel kalite düşer              | Sadakat modu, temporal metrik, sonradan hafif stabilizasyon     |
| Renk/HDR farkı              | Soluk, yanlış veya kıpılmış renk | SDR-first; açık renk uzayı testleri                             |
| YouTube DOM değişikliği     | Overlay bozulur                  | Küçük adaptör katmanı, DOM varsayımları için test               |
| Lisans uyumsuzluğu          | Dağıtım engeli                   | Model/kod lisansını ayrı kaydet; GPL bileşenlerini bilinçli seç |
| Model dosyası boyutu        | Kurulum ve güncelleme zorlaşır   | İsteğe bağlı indirme, cache, quantization/FP16                  |

## 10. Bir Sonraki Somut İş

Yayın kabulünü tamamlamak için, izin verilen ayrı test ortamında aşağıdaki başlıkları yürüt:

1. Native YouTube'da DRM/CORS, pause/seek/quality/fullscreen, altyazı ve overlay yaşam döngüsünü doğrula.
2. İnsan görsel incelemesiyle P1 halo/çift çizgi/renk lekesi/temporal titreşim kararını kaydet; canonical visual manifesti üret.
3. P2 WebSR/RT4KSR aday karşılaştırmasını, sıkıştırma ölçümlerini ve ayrı 30/60 FPS benchmarkını tamamla.
4. P3 OCR ve halo/renk taşması kabulünü ayrı screen/3D örnekleriyle tamamla.
5. P4 temporal modelini ancak bütçe ve reset sınırları ölçülerek ekle; mevcut reset-only davranışı tamamlanmış stabilizasyon diye işaretleme.
6. Sonuçları `docs/testing/P1_VALIDATION.md` ve `memory-bank/progress.md` içine kanıt yollarıyla kaydet.

Headless-only politika nedeniyle bu oturumda bu adımlar çalıştırılmadı; yeniden üretim komutları ve açık riskler P1 doğrulama kaydında tutulur.
