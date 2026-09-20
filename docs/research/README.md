# Araştırma klasörü

Bu klasör, WebGPU tabanlı video/görsel iyileştirme eklentisi için teknik araştırmaları, kaynakları ve karar özetlerini içerir.

## Belgeler

- [2026 açık kaynak model ve GPU araştırması](2026-09-model-and-gpu-research.md)
- [Model adayları ve lisans/uygulama değerlendirmesi](model-candidates.md)
- [GPU kullanıcı tabanı ve kapasite tahmini](gpu-user-base-and-capability.md)
- [Uygulama ve benchmark önerileri](implementation-recommendations.md)
- [Kaynak envanteri](sources.md)
- [İlk fizibilite araştırması](initial-feasibility.md)
- [Anime4K WebGPU uygulama notu](anime4k-implementation.md)

## Kapsam ve tarih

- Son güncelleme: 2026-09-15
- Hedef: Chrome masaüstü, Manifest V3, WebGPU, yerel SDR video işleme
- İlk çözünürlük yolları: 1080p→4K (`x2`) ve 720p→4K (`x3`)
- Varsayılan ürün ilkesi: sadakat, akıcılık ve güvenli bypass; generatif ayrıntı varsayılan değildir

## Okuma yöntemi

Model deposunun kod lisansı, model ağırlığı lisansı, benchmark donanımı ve gerçek tarayıcı performansı ayrı kanıtlar olarak ele alınır. Bir projenin README'sindeki performans sonucu, bağımsız cihaz ölçümü yapılana kadar ürün garantisi sayılmaz.

GPU dağılımı için en güncel erişilebilir Steam Hardware & Software Survey proxy olarak kullanılmıştır. Bu veri tüm internet kullanıcılarını temsil etmez; oyun oynayan masaüstü/laptop kullanıcılarını aşırı temsil eder.
