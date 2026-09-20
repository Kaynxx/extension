# Project Brief

## Proje

WebGPU Video Upscaler — Chrome eklentisi.

## Temel Amaç

YouTube ile başlayarak düşük çözünürlüklü veya sıkıştırma nedeniyle kalitesi azalmış videoları, kullanıcının GPU'sunda gerçek zamanlı ve içerik türüne uygun biçimde iyileştirmek.

## Birincil İçerik Türleri

1. Gerçek çekim/gündelik video
2. Anime/2D animasyon
3. Ekran kaydı, oyun ve 3D içerik
4. Sonraki aşamada manga/webtoon

## Zorunlu İlkeler

- Tüm inference varsayılan olarak cihazda ve GPU'da yapılır.
- Orijinal video değiştirilmez ve yeniden kodlanmaz.
- Kullanıcı her zaman orijinal görüntüye dönebilir.
- Akıcılık, sözde daha yüksek keskinlik için feda edilmez.
- Varsayılan profil gerçeğe sadıktır ve uydurma ayrıntıyı sınırlar.
- Desteklenmeyen durumda eklenti zarar vermeden bypass olur.
- Gizlilik: Video kareleri uzak sunucuya gönderilmez.

## İlk Yayın Hedefi

Chrome masaüstünde YouTube SDR videoları için manuel anime, gerçek çekim ve screen/3D profilleri; otomatik GPU kalite ayarı ve anlık bypass.

## Başarı Ölçütü

Desteklenen hedef cihazlarda görünür kalite artışı; kabul edilebilir kare süresi, A/V hissinde bozulma olmaması, minimum izin ve tam yerel işleme.
