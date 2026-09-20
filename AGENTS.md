# Proje Çalışma Kuralları

Bu depo, tarayıcı içinde WebGPU kullanarak video ve görselleri gerçek zamanlı iyileştiren Chrome eklentisini geliştirir.

## Her Çalışma Oturumunun Başında

Aşağıdaki dosyaları sırasıyla oku:

1. `memory-bank/projectbrief.md`
2. `memory-bank/productContext.md`
3. `memory-bank/systemPatterns.md`
4. `memory-bank/techContext.md`
5. `memory-bank/decisionLog.md`
6. `memory-bank/activeContext.md`
7. `memory-bank/progress.md`

Ardından `docs/IMPLEMENTATION_PLAN.md` içindeki mevcut aşamayı ve kabul kriterlerini kontrol et.

## Çalışma Sırasında

- Orijinal `<video>` akışını, sesini veya oynatma durumunu değiştirme.
- Kullanıcıya gösterilen iyileştirilmiş kareler ayrı bir WebGPU canvas katmanında üretilmeli.
- Kuyruk biriktirip eski kare gösterme. GPU yetişemiyorsa en yeni kareye geç veya güvenli geçiş yolunu kullan.
- Varsayılan görüntü modu sadakat odaklı olmalı; agresif/generatif ayrıntı üretimi varsayılan olamaz.
- Anime, gerçek çekim ve ekran/oyun içerikleri aynı modelmiş gibi ele alınamaz.
- 1080p→4K için `2x`, 720p→4K için `3x` yolunu tercih et.
- SDR hattı doğrulanmadan HDR desteği ekleme; desteklenmeyen içerikte orijinal videoya dön.
- Uzaktan çalıştırılabilir JavaScript/WASM yükleme. Model ağırlıkları veri olarak indirilebilir, sürüm ve bütünlükleri doğrulanmalıdır.
- Her performans iddiasını gerçek cihaz ölçümüyle destekle.

## Memory Bank Güncelleme Protokolü

Anlamlı her çalışma sonunda:

- `activeContext.md`: Son durum, bir sonraki somut adım ve engeller.
- `progress.md`: Tamamlanan kabul kriterleri, test sonucu ve bilinen sorunlar.
- `decisionLog.md`: Geri dönmesi maliyetli yeni mimari kararlar.
- `techContext.md`: Bağımlılık, tarayıcı veya araç zinciri değişiklikleri.

Karar kaydı silinmez. Karar değişirse eskisi `Superseded` olarak işaretlenir ve yeni kararın kimliğine bağlanır.

## Tamamlanma Standardı

Bir iş ancak ilgili kabul kriteri karşılandığında ve uygun test/manuel doğrulama kaydedildiğinde tamamlanmış sayılır. Sadece kodun yazılmış olması yeterli değildir.
