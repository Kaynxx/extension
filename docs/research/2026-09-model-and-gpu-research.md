# Açık kaynak video iyileştirme modelleri ve kullanıcı GPU kapasitesi

Tarih: 2026-09-15  
Durum: Araştırma özeti  
Kapsam: Tarayıcı içinde yerel WebGPU ile gerçek zamanlı video/görsel iyileştirme

## Kısa sonuç

Bu ürün için tek bir “en iyi model” yok. Gerçek zamanlı tarayıcı ürünü için en düşük riskli yol:

1. Anime için Anime4K-WebGPU/WGSL ailesi.
2. Gerçek çekim için doğrudan 1080p→4K `x2` ve 720p→4K `x3` hedefleyen RT4KSR tabanlı hafif model.
3. Ekran/oyun/3D için ayrı, kenar ve yazı korumaya göre eğitilmiş bir profil; ilk referans olarak WebSR'nin 3D ağırlıkları ve RT4KSR'nin oyun içeriği değerlendirmesi.
4. Real-ESRGAN'ı canlı varsayılan yerine kalite karşılaştırma/oracle ve duraklatılmış kare modu olarak kullanmak.
5. NanoVSR'yi temporal video modeli için gelecek adayı olarak benchmark etmek; mevcut kanıtı 4x ve Jetson üzerindedir, WebGPU tarayıcı kanıtı yoktur.

Hugging Face model etiketi araması güncel olarak yalnızca dokuz adet `video-super-resolution` modeli gösteriyor; bunların önemli bölümü 3B/diffusion veya araştırma amaçlı. Bu nedenle model hub'ında bulunmak, Chrome/WebGPU'da gerçek zamanlı çalışmaya hazır olmak anlamına gelmiyor.

## Kullanıcı donanımı için ana sinyal

Steam'in Ağustos 2026 birleşik verisinde:

- 16 GB VRAM: `%26,92`
- 8 GB VRAM: `%25,74`
- 12 GB VRAM: `%12,99`
- 4 GB VRAM: `%5,69`
- 6 GB VRAM: `%5,30`
- 24 GB VRAM: `%5,41`
- 1080p birincil ekran: `%50,52`
- 1440p birincil ekran: `%21,86`
- 4K birincil ekran: `%4,98`

Bu, `8 GB + 16 GB` sınıflarının Steam örneğinin `%52,66`'sını oluşturduğunu gösterir. Ancak bu oran internet kullanıcılarının oranı değildir; Steam örneği oyunculara ve ayrık GPU'lara doğru yanlıdır. Genel tarayıcı kitlesinde entegre GPU, eski laptop ve paylaşımlı belleğin payı daha yüksek olacaktır.

## Ürün sonucu

Eklenti başlangıçta GPU adından sabit karar vermemeli. WebGPU adaptörü, cihaz limitleri, shader-f16/format desteği ve kısa gerçek iş yükü testi birlikte değerlendirilmelidir. En güvenli hedef matrisi:

| Kapasite katmanı | Yaklaşık donanım profili                                            | Önerilen davranış                                                                                            |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Düşük            | Entegre GPU, 2–4 GB raporlanan VRAM veya belirsiz paylaşımlı bellek | Orijinal video, klasik ölçekleme veya çok hafif Anime4K; 4K AI zorunlu değil                                 |
| Orta             | 6–8 GB dGPU/iGPU, ör. GTX 1650/RTX 3050/RTX 4060 sınıfı             | Anime4K low/medium; RT4KSR yalnızca kısa test geçerse 30 FPS                                                 |
| Yüksek           | 10–12 GB ve güçlü WebGPU, ör. RTX 3080/4070 sınıfı                  | RT4KSR x2/x3 için 30 FPS adayı; p95 aşılırsa seviye düşür                                                    |
| Çok yüksek       | 16 GB+ güçlü dGPU                                                   | Daha yüksek kalite, daha geniş tile/ara tampon ve gelecek temporal modeller için aday; 60 FPS yine ölçülmeli |

Bu katmanlar dağılım tahmini değil, ürünün ilk kalite yönlendirme hipotezidir. Kabul kararı gerçek cihaz benchmark'ıyla verilecektir.

## Kaynak güvenilirliği

- Resmî model/GitHub depoları: mimari, lisans ve desteklenen ölçek için birincil kaynak.
- Model kartları: ağırlık formatı, parametre ve cihaz benchmark'ı için birincil kaynak; genellikle bağımsız doğrulama değildir.
- Steam survey: kullanıcı donanımı için en kullanışlı açık proxy; genel web kitlesi için temsilî değildir.
- Bu çalışma: tarayıcıda 30/60 FPS garantisi iddia etmez. O iddia için repository benchmark'larından ayrı cihaz ölçümü gerekir.

## Sonraki doğrulama

P0 passthrough hattı hazırlandıktan sonra en az şu cihaz sınıflarında aynı test klipleri çalıştırılmalıdır:

- Intel/AMD entegre GPU
- 4–6 GB laptop GPU
- RTX 3060/4060 sınıfı 8 GB GPU
- RTX 4070/3080 sınıfı 10–12 GB GPU
- 16 GB sınıfı modern GPU

Her cihazda 720p→4K ve 1080p→4K için p50/p95/p99 süre, missed frame, GPU belleği, ana iş parçacığı yükü ve 20–30 dakikalık termal davranış kaydedilmelidir.
