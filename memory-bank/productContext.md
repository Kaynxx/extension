# Product Context

## Problem

YouTube ve diğer video platformlarındaki içerikler kaynak çözünürlüğü, düşük bitrate, tekrar kodlama ve üretim kalitesi nedeniyle 4K ekranlarda yumuşak, bloklu veya detayı az görünebilir.

## Kullanıcı Beklentisi

Kullanıcı videoyu normal biçimde açar. Eklenti uygun olduğunda tek hareketle etkinleşir, cihazı test ederek sürdürülebilir bir kalite seviyesi seçer ve oynatma deneyimini bozmadan görüntüyü iyileştirir.

## Deneyim İlkeleri

- **Açık kontrol:** Aç/kapat, profil ve kalite seviyesi anlaşılır olmalı.
- **Güvenli varsayılan:** Safe/Balanced varsayılanı, agresif keskinlikten önce gelir.
- **Görünmez başarısızlık:** Eklenti yetişemiyorsa video takılmamalı; orijinale dönmelidir.
- **Doğrulanabilir fark:** Karşılaştırma sürgüsü veya hızlı A/B kontrolü bulunmalı.
- **Cihaza saygı:** Pil, sıcaklık ve tarayıcı tepkiselliği gözetilmelidir.
- **Gizlilik:** Kareler cihazdan ayrılmaz; yerel metrikler varsayılan olarak gönderilmez.

## Kalite Kavramı

Amaç yalnızca daha keskin görünen görüntü değildir. Kalite; ayrıntı, renk sadakati, az halo, az sıkıştırma artefaktı, temporal tutarlılık ve akıcılığın birlikte değerlendirilmesidir.

## Temel Kullanıcı Akışı

1. Kullanıcı YouTube videosunu açar.
2. Eklenti videoyu ve WebGPU desteğini algılar.
3. Kullanıcı iyileştirmeyi etkinleştirir.
4. İlk kullanımda kısa GPU testi yapılır.
5. Kullanıcı profil seçer veya ileride Auto kullanır.
6. Eklenti kareleri canvas üzerinde işler.
7. Bütçe aşılırsa kalite otomatik düşer.
8. Kullanıcı istediği anda orijinale döner.
