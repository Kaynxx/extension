# GPU kullanıcı tabanı ve kapasite tahmini

Tarih: 2026-09-15  
Ana veri: Valve Steam Hardware & Software Survey, Ağustos 2026

## Veri kaynağı ve sınırları

Steam survey aylık, isteğe bağlı ve anonim bir donanım örneğidir. Genel internet kullanıcılarını ölçmez. Bununla birlikte açık ve güncel bir GPU/VRAM/ekran çözünürlüğü dağılımı sunduğu için ilk ürün kapasite planında proxy olarak kullanılabilir.

Genel web kitlesi Steam'e göre muhtemelen daha fazla entegre GPU, düşük güçlü laptop ve Apple/ARM cihaz içerir. Bu yüzden Steam yüzdeleri “eklenti kullanıcılarının beklenen yüzdesi” olarak yazılmamalı; yalnızca üst sınıra yakın, oyuncu-ağırlıklı bir referans kabul edilmelidir.

## Ağustos 2026 birleşik dağılımı

### VRAM

| VRAM sınıfı |    Pay |
| ----------- | -----: |
| 512 MB      |  2.67% |
| 1 GB        |  1.58% |
| 2 GB        |  4.05% |
| 3 GB        |  1.32% |
| 4 GB        |  5.69% |
| 6 GB        |  5.30% |
| 8 GB        | 25.74% |
| 10 GB       |  1.96% |
| 11 GB       |  0.83% |
| 12 GB       | 12.99% |
| 16 GB       | 26.92% |
| 20 GB       |  1.37% |
| 22 GB       |  1.12% |
| 24 GB       |  5.41% |
| 32 GB       |  1.34% |
| Other       |  1.71% |

Türetilen değerler:

- 8 GB + 16 GB: `%52,66`
- 12 GB ve üzeri olarak listelenen sınıflar: yaklaşık `%49,15`
- 6 GB ve altı olarak listelenen sınıflar: yaklaşık `%20,61`
- 4 GB ve altı olarak listelenen sınıflar: yaklaşık `%15,31`

Bu toplamlar “kullanılabilir VRAM” ile aynı şey değildir. Entegre GPU'larda raporlanan değer sistem belleğiyle paylaşılabilir; tarayıcı, işletim sistemi, video decode ve diğer sekmeler aynı bütçeyi kullanır.

### Ekran çözünürlüğü

| Birincil çözünürlük |    Pay |
| ------------------- | -----: |
| 1920×1080           | 50.52% |
| 2560×1440           | 21.86% |
| 3840×2160           |  4.98% |
| 3440×1440           |  3.14% |
| 2560×1600           |  5.71% |

Bu dağılım, 1080p kaynağı 4K ekrana büyütme ihtiyacının gerçek olduğunu, fakat her kullanıcının 4K hedef canvas'a ihtiyacı olmadığını gösterir. Eklenti çıktı boyutunu oynatıcının fiziksel piksel boyutu ile kullanıcının hedefi arasındaki minimuma indirmelidir.

### Öne çıkan ekran kartları

Steam Ağustos 2026'da öne çıkan tekil modeller arasında RTX 3060 `%3,92`, RTX 4060 Laptop `%3,84`, RTX 5070 `%3,77`, RTX 4060 `%3,60`, RTX 3050 `%3,21`, RTX 5060 `%3,16`, GTX 1650 `%2,49`, RTX 4060 Ti `%2,37`, RTX 3060 Ti `%2,16` ve RTX 3070 `%1,99` pay bildiriyor. İlk on model toplamı yaklaşık `%30,51` eder; ancak “Other” ve uzun kuyruk önemlidir.

Bu tablo ürün benchmark'ı için RTX 3060/4060 sınıfını “orta” referans, GTX 1650/RTX 3050 sınıfını “düşük-orta” referans, RTX 4070/3080 ve üstünü “yüksek” referans seçmek için kullanılabilir.

## 4K framebuffer maliyeti

3840×2160 = 8.294.400 piksel.

| Kaynak                                | Yaklaşık ham bellek |
| ------------------------------------- | ------------------: |
| 4K RGBA8 texture                      |             33.2 MB |
| 4K RGBA16F texture                    |             66.4 MB |
| 1080p RGBA8 source                    |              8.3 MB |
| 2 adet 4K RGBA8 output/intermediate   |             66.4 MB |
| 2 adet 4K RGBA16F output/intermediate |            132.7 MB |
| 4K, 64 kanal, FP16 feature map        |    yaklaşık 1.06 GB |

Son satır, feature map'leri 4K'da tutmanın neden pahalı olduğunu gösterir. RT4KSR gibi tasarımlarda hesap yükünü düşük çözünürlükte tutmak ve yalnızca son aşamada büyütmek, tarayıcı hedefi için kritik olmalıdır. Tam bellek kullanımı texture alignment, bind group, tile padding, driver allocation ve compositor nedeniyle bu ham değerlerden yüksek olabilir.

## 30/60 FPS zaman bütçesi

- 30 FPS toplam kare aralığı: `33,3 ms`
- 60 FPS toplam kare aralığı: `16,7 ms`
- Overlay, video decode, compositing ve scheduler payı ayrıldıktan sonra SR için muhafazakâr hedef: 30 FPS'te p95 `20–24 ms`, 60 FPS'te tercihen `8–10 ms`

Bu hedefler depodaki ölçüm değildir; projenin kabul planındaki mühendislik bütçesidir. GPU'da bir frame 20 ms görünse bile `copyExternalImageToTexture`, command submission, canvas compositing veya main-thread işi toplam akıcılığı bozabilir.

## Önerilen kapsama yaklaşımı

1. WebGPU adaptörünü ve gerçek limitleri sorgula.
2. 1280×720→3840×2160 ve 1920×1080→3840×2160 kısa sentetik/gerçek klip testi çalıştır.
3. p95 hedefi ve missed-frame eşiği geçilmiyorsa profili etkinleştir.
4. Yüksek p95'te önce kalite seviyesini, sonra hedef çözünürlüğü düşür; eski frame kuyruğu biriktirme.
5. Device loss, desteklenmeyen format, HDR veya CORS durumunda orijinal videoya dön.

## Kaynak

- [Valve Steam Hardware & Software Survey — Ağustos 2026](https://store.steampowered.com/hwsurvey)
