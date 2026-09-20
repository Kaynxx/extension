# Model adayları

## Karar tablosu

| Aday                         | İçerik                  |                                   Ölçek | Tarayıcı uygunluğu | Güçlü taraf                                                                 | Ana risk                                                                            | İlk karar                                |
| ---------------------------- | ----------------------- | --------------------------------------: | ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| Anime4K-WebGPU               | Anime/2D                |                  x2, x3, x4 bileşenleri | Çok yüksek         | Doğrudan WebGPU/WGSL, gerçek zamanlı tasarım                                | Live-action ve yazı için yanlış profil; agresif ayarda halo/aliasing                | P1 ana baseline                          |
| WebSR                        | Anime, gerçek hayat, 3D | ağırlık setine bağlı; Anime4K x2 ağları | Yüksek             | S/M/L ağlar, WebGPU compute, worker/OffscreenCanvas ve ağ değiştirme örneği | README'deki gerçek hayat/3D desteği ürün kalitesi için ayrıca doğrulanmalı          | Entegrasyon ve özel ağırlık referansı    |
| RT4KSR                       | Gerçek çekim, oyun/3D   |                       doğrudan x2 ve x3 | Orta               | 1080p→4K ve 720p→4K hedefiyle tasarlanmış; Apache-2.0                       | Resmî depo PyTorch test kodu; WebGPU/WGSL portu yok                                 | P2 ana araştırma adayı                   |
| Real-ESRGAN / RealESRNet     | Gerçek çekim, fotoğraf  |             x2/x4 ve arbitrary outscale | Düşük-orta         | Güçlü gerçek-dünya restorasyonu, olgun model zoo                            | x4 ağırlığı ve aktivasyonları ağır; temporal tutarlılık yok; ayrıntı uydurma riski  | Kalite oracle ve duraklatılmış kare modu |
| realesr-animevideov3         | Anime video             |                    x1–x4 kullanılabilir | Düşük-orta         | Anime-video için özel ağırlık                                               | Tarayıcı canlı 4K için benchmark yok; gerçek zamanlı scheduler'a uygunluğu belirsiz | Karşılaştırma adayı                      |
| NanoVSR                      | Genel video             |                                      4x | Şimdilik düşük     | Temporal/bidirectional VSR, 226k–5.4M seçenekleri; edge hedefi              | 4x mimari, tarayıcı/WebGPU portu yok; bidirectional yapı canlı gecikme yaratabilir  | P4/P5 gelecek araştırması                |
| RTSR (AV1 sıkıştırma odaklı) | Sıkıştırılmış AV1 video |                   360p→1080p ve 540p→4K | Belirsiz           | YouTube benzeri codec bozulmasına doğrudan odaklanma                        | Üretim kodu ve WebGPU yolu doğrulanmadı                                             | Veri/degradation araştırması             |

## 1. Anime4K-WebGPU

Anime4K-WebGPU, Anime4K algoritmalarını WebGPU compute shader'ları ile uygular. Depo; CNN x2, GAN x3/x4, denoise, deblur, restore ve preset modları listeliyor. Kendi performans analizinde 720p girdi için RTX 4090 ve RTX 3070 Ti üzerinde tüm modellerde yaklaşık 3 ms seviyesinde GPU işlem süresi raporluyor. Bu sonuç repo içi ölçümdür; 4K hedef, Chrome sürümü, compositor ve başka sekmeler için doğrudan garanti değildir.

Anime için en güçlü tarafı, model ağırlıklarını büyük bir runtime'a sokmadan WGSL hattına yakın olmasıdır. Varsayılan profilde GAN/restore zinciri yerine sınırlı CNN x2 ve kontrollü düzeltme tercih edilmelidir.

Kaynaklar:

- [Anime4K-WebGPU deposu](https://github.com/Anime4KWebBoost/Anime4K-WebGPU)
- [Anime4K ana deposu](https://github.com/bloc97/Anime4K)

Lisans notu: Anime4K ve Anime4K-WebGPU depolarında MIT bilgisi bulunur; dağıtımda upstream LICENSE metni ve kullanılan ağırlıkların durumu ayrıca paketlenmelidir.

## 2. WebSR

WebSR, tarayıcıda WebGPU compute shader'larıyla gerçek zamanlı AI upscaling için JavaScript kütüphanesidir. README; Animation, Real Life ve 3D içerik ağırlıkları, Small/Medium/Large ağ boyutları, OffscreenCanvas/worker desteği ve çalışma sırasında ağ değiştirme özelliklerini listeler. Ayrıca custom training ve ağırlıkların WebGPU formatına aktarılması için bir yol sunar.

Bu proje, ürün mimarisi için iyi bir entegrasyon referansıdır. Ancak içerik tespiti örneği yalnızca animation/real life ayrımı yapar ve yazarın üç ağ sınıflandırıcısında doğruluk sorunu yaşadığını belirttiği görülür. Bu nedenle otomatik profil seçimi ilk sürümde WebSR örneğinden doğrudan alınmamalıdır.

Kaynak: [WebSR deposu](https://github.com/sb2702/websr)

## 3. RT4KSR

RT4KSR'nin resmî test kodu doğrudan `x2 (1080p→4K)` ve `x3 (720p→4K)` checkpoint'leri sağlar. NTIRE 2023 benchmark'ında bicubic'e göre:

- x2: PSNR RGB `33.916 → 34.193`, SSIM RGB `0.8829 → 0.8848`
- x3: PSNR RGB `31.302 → 31.721`, SSIM RGB `0.8246 → 0.8300`

Model, pixel-unshuffle, düşük çözünürlüklü feature haritaları ve structural re-parameterization ile 4K maliyetini azaltmayı amaçlar. Bu, projenin 1080p→2x ve 720p→3x kararına doğrudan uyar.

Bir ikincil gerçek-zamanlı SR model karşılaştırması RT4KSR için yaklaşık `0.05M` parametre ve benchmark konvansiyonunda yaklaşık `172 GFLOPs` verir. Bu sayılar RT4KSR deposunun ana README'sinde yer almadığı için portlama öncesi graph üzerinden yeniden hesaplanmalıdır. 172 GFLOPs/frame kabul edilirse teorik hesap yükü 30 FPS'te yaklaşık 5.2 TFLOP/s, 60 FPS'te yaklaşık 10.3 TFLOP/s olur; WebGPU dispatch, bellek trafiği ve video kopyaları buna dahildir ve ayrıca ölçülmelidir.

Kaynaklar:

- [RT4KSR resmî deposu](https://github.com/eduardzamfir/RT4KSR)
- [RT4KSR CVPR/NTIRE makalesi](https://openaccess.thecvf.com/content/CVPR2023W/NTIRE/papers/Zamfir_Towards_Real-Time_4K_Image_Super-Resolution_CVPRW_2023_paper.pdf)
- [İkincil gerçek-zamanlı model karmaşıklığı tablosu](https://openreview.net/pdf/0522f854bf6e5859c87ab35b1d5f05df4318f181.pdf)

Lisans notu: Resmî GitHub deposu Apache-2.0 olarak işaretlidir. Checkpoint ve dataset şartları dağıtım öncesi ayrıca incelenmelidir.

## 4. Real-ESRGAN

Real-ESRGAN gerçek-dünya görüntü/video restorasyonu için olgun ve güçlü bir baseline'dır. Resmî model zoo; genel görüntü için `RealESRGAN_x4plus`, daha küçük anime modeli ve `realesr-animevideov3` gibi seçenekler sunar; ayrıca `RealESRGAN_x2plus` modeli vardır.

Qualcomm'un model kartı `RealESRGAN_x4plus` için 16.7M parametre ve float ağırlık boyutunu 63.9 MB bildirir. 4K video karesinde asıl sorun yalnızca ağırlık boyutu değildir; ara aktivasyonlar, tile geçişleri ve output texture bellek trafiği baskındır. Anime4K-WebGPU deposu da Real-ESRGAN karşılaştırmasını gerçek zamanlı kullanım için yaklaşık 1000 kat daha yavaş olarak raporlar; bu sayı da repo içi ve aynı koşullarla bağımsız doğrulanmalıdır.

Real-ESRGAN'ın GAN/perceptual karakteri nedeniyle yüz, yazı ve eksik detaylarda “daha güzel ama yanlış” çıktı riski vardır. Bu nedenle ürünün sadakat odaklı varsayılanı olamaz.

Kaynaklar:

- [Real-ESRGAN resmî deposu](https://github.com/xinntao/Real-ESRGAN)
- [RealESRGAN_x4plus model kartı ve parametre/boyut bilgisi](https://huggingface.co/qualcomm/Real-ESRGAN-x4plus)
- [Tarayıcı Real-ESRGAN/Real-CUGAN uygulaması](https://github.com/xororz/web-realesrgan)

Lisans notu: Resmî Real-ESRGAN kodu BSD-3-Clause olarak belirtilir. Tarayıcıdaki `web-realesrgan` projesi GPL-2.0'dır; bu kodu veya türevlerini eklentiye kopyalamadan önce dağıtım etkisi incelenmelidir.

## 5. NanoVSR

NanoVSR, Hugging Face model kartında ECCV 2026 kabul edilmiş, edge cihazlar için 4x video super-resolution modeli olarak tanımlanıyor. Model seçenekleri:

| Model        | Parametre | Jetson Orin NX 25 W FPS | REDS4 PSNR/SSIM |
| ------------ | --------: | ----------------------: | --------------: |
| NanoVSR-226k |      226k |                   43.86 |  28.23 / 0.8057 |
| NanoVSR-644k |      644k |                   27.20 |  28.64 / 0.8215 |
| NanoVSR-1.7M |      1.7M |                   19.58 |  29.15 / 0.8364 |
| NanoVSR-5.4M |      5.4M |                    8.66 |  29.73 / 0.8526 |

Bu, temporal tutarlılık için ilginç bir araştırma hattıdır. Fakat 4x ve bidirectional yapısı mevcut ürünün canlı, düşük gecikmeli x2/x3 hedeflerine doğrudan uymaz. Ayrıca verilen performans Jetson Orin NX içindir; Chrome/WebGPU üzerinde aynı sonucu beklemek doğru değildir.

Kaynaklar:

- [NanoVSR Hugging Face model kartı](https://huggingface.co/filippawlicki/nanovsr)
- [NanoVSR demo ve model tablosu](https://huggingface.co/spaces/filippawlicki/nanovsr-demo/blob/main/README.md)
- [NanoVSR GitHub deposu](https://github.com/filippawlicki/nanovsr)

Lisans notu: Model kartı MIT gösterir. Ağırlık, kod ve eğitim verisinin ayrı şartları yayın paketinden önce doğrulanmalıdır.

## Model dışı genel sonuç

Diffusion tabanlı veya büyük generatif video-restoration modelleri duraklatılmış kare/klip kalite modu için ilginç olabilir; canlı Chrome eklentisinin default yolu değildir. Bu ürün için temporal tutarlılık, sadakat ve p95 kare süresi; tek karede etkileyici keskinlikten daha önemli kabul edilmelidir.
