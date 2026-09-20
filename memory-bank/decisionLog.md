# Decision Log

## D-027 — Harici zip aracına bağımlı olmayan deterministik release arşivi

- Tarih: 2026-09-20
- Durum: Accepted
- Karar: Release betiği, ortamda `zip` komutu bulunmasa da Node.js standart kütüphaneleriyle sabit zaman damgalı ZIP ve SHA256 üretir; pakete yalnız build çıktısı ve lisans/gizlilik dosyaları alınır.
- Gerekçe: Yayın artefaktının çalışma ortamına bağlı olmadan tekrar üretilebilmesi ve source/evidence/local path sızıntısının statik kapıyla engellenmesi.

## D-001 — WebGPU birincil inference yolu

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: Ana video işleme WebGPU/WGSL üzerinden yapılacak.
- Gerekçe: Tarayıcı içinde çapraz GPU üreticisi desteği ve kareleri GPU belleğinde tutma olanağı.

## D-002 — Orijinal video korunacak

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: Kaynak `<video>` oynatma/ses kaynağı kalacak; çıktı overlay canvas'ta gösterilecek.
- Gerekçe: Non-destructive davranış, anlık bypass ve daha düşük entegrasyon riski.

## D-003 — Tek genel model kullanılmayacak

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: Anime, live-action ve screen/3D ayrı profiller olacak.
- Gerekçe: Kenar, doku, yazı ve sıkıştırma karakterleri farklıdır.

## D-004 — Doğrudan x2 ve x3 ölçek

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: 1080p→4K için x2, 720p→4K için x3 model/yol kullanılacak.
- Gerekçe: x4 üretip yeniden küçültmenin hesap ve artefakt maliyetini önlemek.

## D-005 — Adaptif kalite zorunlu

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: Sabit kalite yerine ölçülen p95 kare maliyetine dayalı seviye kontrolü kullanılacak.
- Gerekçe: Aynı GPU adında bile tarayıcı, sürücü, güç modu ve video FPS farklıdır.

## D-006 — Sadakat odaklı varsayılan

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: Generatif/agresif model varsayılan olmayacak.
- Gerekçe: Kullanıcının "kaliteyi bozmasın" gereksinimi ve temporal titreşim riski.

## D-007 — SDR-first

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: HDR ilk yayın kapsamı dışında; tespit edilirse bypass.
- Gerekçe: Renk uzayı, transfer fonksiyonu, bit derinliği ve canvas sunum yolu ayrı doğrulama ister.

## D-008 — YouTube-first, site adaptörlü mimari

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: P0–P2 YouTube'a odaklanacak, siteye özel kod adaptör sınırında tutulacak.
- Gerekçe: İlk riski sınırlamak, ileride diğer sitelere genişlemeyi korumak.

## D-009 — Manga ayrı pipeline

- Tarih: 2026-09-14
- Durum: Accepted
- Karar: Manga desteği video scheduler'ına eklenmeyecek; ayrı statik görsel/tile hattı olacak.
- Gerekçe: Statik görselde zaman bütçesi ve metin koruma gereksinimleri farklıdır.

## D-010 — P1 anime backend adayı ve entegrasyon sınırları

- Tarih: 2026-09-15
- Durum: Accepted — canonical interface ve bundled WGSL benchmarkı tamamlandı; üçüncü taraf aday kullanılmadı
- Karar: P1 için tercih edilen aday `anime4k-webgpu@1.0.0`; mevcut elle yazılmış WGSL Anime4K uyumlu yol, sadakat odaklı güvenli fallback olarak korunacak.
- Karar: `WebGpuBackend` ve `Anime4kBackend` iki ayrı sözleşme olarak bırakılmayacak; scheduler/controller öncesinde tek `UpscalerBackend` interface'inde birleştirilecek.
- Gerekçe: MV3 içinde yerel, paketlenebilir WGSL yolu güvenli bypass sağlıyor; aday kütüphane ise P1 model kalitesini ve bakım maliyetini benchmark ile karşılaştırmaya izin veriyor.
- Blocker: `rgba16float` format/özellik desteği, dispose ve device-loss kaynak yaşam döngüsü, capability probe ve gerçek cihaz benchmark'ı tamamlanmadan P1 kabul edilmeyecek.
- Reddedilen aday: `@websr/websr`, doğrudan MV3 eval/CSP kısıtları nedeniyle tarayıcı içi runtime adayı olarak kullanılmayacak.

## D-011 — Hazırla/sun iki aşamalı backend sözleşmesi

- Tarih: 2026-09-15
- Durum: Accepted
- Karar: Backend işlenmiş kareyi offscreen texture'da `prepare()` ile hazırlar; scheduler tek kullanımlı `PreparedFrame.present()` veya `discard()` kararı verir. Canvas current texture'a yalnız `present()` dokunur.
- Gerekçe: GPU işi sürerken daha yeni video karesi gelirse eski sonucu canvas'a sunmadan atmak ve latest-frame-wins garantisini gerçekleştirmek.

## D-012 — Anime MVP için paket içi, iki seviyeli WGSL yolu

- Tarih: 2026-09-15
- Durum: Accepted — production entegrasyonu ve RTX 5070 headless benchmarkı tamamlandı; native/human audit açık
- Karar: `low`, tek edge-aware doğrudan upscale pass'i; `high`, buna ek sınırlı line-refinement pass'i kullanır. Her iki seviye generatif değildir. 1080p→4K x2 ve 720p→4K x3 doğrudan yolları kabul edilir; keyfi oranlar reddedilir.
- Gerekçe: Gerçek GPU maliyeti farkı olan iki kademe, sadakat odaklı varsayılan ve x4 üretip küçültme maliyetinden kaçınma.

## D-013 — TypeScript 6 yerel WebGPU tipleri

- Tarih: 2026-09-15
- Durum: Accepted
- Karar: TypeScript 6 DOM kitaplığındaki WebGPU tipleri kullanılacak; ayrı `@webgpu/types` paketi eklenmeyecek.
- Gerekçe: Çift global deklarasyon ve tip çakışmalarını önlemek.

## D-014 — Doğrulanmamış profilde otomatik fallback yok

- Tarih: 2026-09-15
- Durum: Superseded by D-016
- Karar: İlk tasarımda controller'ın anime dışı profile otomatik fallback yapmaması planlandı.
- Gerekçe: Anime shader'ını başka içerik türlerine uygulamamak için güvenli başlangıç varsayımıydı.

## D-015 — Safe WebGPU fallback canonical contract

- Tarih: 2026-09-15
- Durum: Accepted — controller'a bağlandı; headless gerçek cihaz doğrulaması tamamlandı
- Karar: Eski fallback backend, `Anime4kBackend` ile aynı `UpscalerBackend` sözleşmesini kullanacak; GPU cihazı controller tarafından enjekte edilecek, fallback yalnız offscreen texture hazırlayıp scheduler onayında canvas'a sunacak.
- Gerekçe: Anime4K başlatılamadığında veya profil/ölçek uygun olmadığında oynatma ve ses bozulmadan güvenli bypass/fidelity yolu sağlamak; duplicate backend contract ve doğrudan canvas sunumunu kaldırmak.
- Sınır: ImageBitmap kaynakları fallback'te güvenli bypass'a yönlendirilir; üretim video yolu HTMLVideoElement/VideoFrame ile sınırlıdır.

## D-017 — Headless hardware evidence and strict SDR gate

- Tarih: 2026-09-15
- Durum: Superseded by D-021 for canonical acceptance; strict SDR gate remains accepted
- Karar: P1 performans kanıtı masaüstü açmadan, browser-level CDP GPU kapısı (`WebGPU enabled`, `Vulkan enabled_on`, yazılım renderer reddi) ve dört ayrı headless sayfada 120 kare ile alınır. Headless screenshot GPU yüzeyini şeffaf yakaladığı için yalnız kanıt kompozisyonunda `canvas.toDataURL()` geçici 2D image'e dönüştürülür; üretim frame yolunda CPU readback yoktur.
- Karar: Native YouTube renk metadata'sı HDR veya unknown ise orijinal videoya dönülür. Local canvas-capture fixture, kaynağın SDR olduğu bilindiğinden açık test istisnasıdır.
- Gerekçe: Kullanıcının masaüstünde test açmama kısıtını korurken gerçek NVIDIA donanımını ölçmek ve doğrulanmamış HDR yolunda renk bozulmasını önlemek.

## D-016 — Anime-first, canonical safe fallback seçimi

- Tarih: 2026-09-15
- Durum: Accepted
- Karar: Controller anime profilinde doğrudan x2/x3 ve Anime4K başlatmasını dener; oran/başlatma/cihaz hatasında aynı `UpscalerBackend` sözleşmesini uygulayan conservative `WebGpuBackend` fallback'ine geçer. Anime dışı profiller Anime4K shader'ına yönlendirilmez; yalnız safe profil parametreleriyle fallback yolu kullanılır.
- Gerekçe: D-003 içerik ayrımını korurken oynatma/ses bozulmadan güvenli görüntü iyileştirmesi ve runtime recovery sağlamak. Fallback de `prepare/present/discard` ile latest-frame-wins sözleşmesini korur.

## D-018 — P1 görsel kabulü görünür donanım koşuluna bağlı

- Tarih: 2026-09-15
- Durum: Accepted again via D-021; D-019 superseded
- Karar: P1 görsel capture yalnız `headless:false`, `requireHardware:true` görünür Chromium koşusunda kabul edilir. Headless görsel çıktı mekanik tanı ve hata ayıklama girdisidir; ürün görsel kalite kanıtı değildir.
- Karar: WebGPU swapchain screenshot'ta siyah/şeffaf yakalanırsa yalnız evidence runner içinde `canvas.toDataURL()` geçici image kompoziti ve %1 non-black assertion kullanılabilir; üretim kare yolu CPU readback yapmaz.
- Gerekçe: Siyah ekran görüntüsünü backend'in siyah çıktı üretmesiyle karıştırmamak ve gerçek browser compositor/GPU yüzeyini P1 görsel kanıtına dahil etmek. Bu oturumdaki headed deneme adaptör vermediği için visual acceptance açık kaldı.

## D-019 — Kullanıcı talimatıyla headless-only doğrulama

- Tarih: 2026-09-19
- Durum: Superseded by D-021
- Karar: Bu masaüstünde hiçbir headed/visible browser veya CUA testi açılmayacak. Benchmark ve visual runner'ları `P1_HEADLESS=false` / `P1_VISUAL_HEADLESS=false` değerlerini kod seviyesinde reddeder; kanonik kanıt yalnız headless Chromium + terminal koşularından alınır.
- Gerekçe: Kullanıcının açık talimatını bütün sohbet/ajan süreçlerinde enforce etmek ve eski otomasyonların yanlışlıkla desktop test başlatmasını önlemek. Headless A/B kompozisyonu yalnız evidence aşamasında yapılır; üretim kare yoluna CPU readback eklenmez.

## D-020 — Anime adaptive bütçesi için explicit headroom payı

- Tarih: 2026-09-19
- Durum: Accepted; doğrulama modu D-021 ile headed olarak güncellendi
- Karar: Production anime auto kalite yolu nominal 24/30 FPS cadence bütçesini doğrudan kullanmayacak; `ANIME_ADAPTIVE_FRAME_BUDGET_MS = 24` ile explicit işlem bütçesi kullanacak. Headless adaptive harness aynı production controller/scheduler ile high→low ve 5 saniye low→high recovery'yi doğrulayacak; low→bypass davranışı unit kanıtıyla korunacak.
- Gerekçe: 30 FPS nominal 33.3 ms bütçesi compositor/headroom payı bırakmaz ve ölçülen yaklaşık 32 ms high overload'ı kabul edebilir. 24 ms, kaliteyi düşürme kararını daha erken ve güvenli verir.
- Sınır: Bu karar sentetik canvas/ImageBitmap GPU kanıtının native YouTube external-video, CORS/DRM ve subjektif görsel kalite kanıtı olduğu anlamına gelmez.

## D-021 — Canonical P1 kanıtı yalnızca görünür Chromium'dan yazılır

- Tarih: 2026-09-19
- Durum: Accepted; D-019'u ve D-017'nin canonical acceptance kapsamını supersede eder
- Karar: P1 benchmark, görsel evidence, adaptive evidence ve extension entegrasyon koşuları
  `headless:false` görünür Chromium kullanır. Headless Chromium canonical kabul kanıtı
  üretemez.
- Karar: Canonical JSON yazma kapısı `headless:false`, `HeadlessChrome` içermeyen user-agent,
  fiziksel GPU, software renderer reddi, ham zamanlama serileri ve eksiksiz koşu koşullarını
  birlikte zorunlu tutar.
- Karar: Eski headless JSON/PNG'ler açık adlı `archive-diagnostic-headless-*` dizinlerinde
  korunur; canonical dosya yollarını temsil edemez.
- Gerekçe: Kullanıcının açık "testi headless çalıştırma" talimatını uygulamak,
  browser compositor/görsel inceleme yüzeyini kabul kapsamına almak ve tanı çıktısının
  yanlışlıkla ürün kanıtı sayılmasını önlemek.

- D-028 tarafından supersede edilmiştir: bu masaüstünde canonical kabul headless-only'dir.

## D-022 — Release ve kanıt kapısı hizalaması

- Tarih: 2026-09-20
- Durum: Superseded by D-028
- Karar: D-021 runner uygulamasında da zorunludur: P1 browser yüzeyleri
  `headless:false` ile açılır; canonical guard `headless:true`, `HeadlessChrome`,
  software renderer, eksik ham örnek ve tamamlanmamış koşuyu reddeder. Üretim MV3
  paketinde `object-src 'none'`, Chrome 131 hedefi, sourcemap kapalı yapı ve
  deterministik ZIP/SHA-256 çıktısı kullanılır.
- Gerekçe: Tarihsel headless tanı çıktısının yanlışlıkla kabul kanıtı veya dağıtım
  paketi sayılmasını önlemek; yayın artefaktının tekrar üretilebilir ve denetlenebilir
  olması.

## D-028 — Headless-only kullanıcı politikası canonical kabul kapsamını belirler

- Tarih: 2026-09-20
- Durum: Accepted; D-021 ve D-018'in headed koşulunu supersede eder.
- Karar: Bu masaüstünde hiçbir headed/visible browser veya CUA testi açılmayacak. Benchmark,
  adaptive, visual ve extension integration yalnız `headless:true` ile çalışır; canonical gate
  HeadlessChrome user-agent'ını reddetmez, fiziksel GPU/WebGPU/Vulkan, ham timing ve eksiksiz
  koşu kapılarını korur.
- Gerekçe: Kullanıcının açık talimatını bütün sohbet/ajan süreçlerinde tutarlı şekilde uygulamak
  ve mevcut RTX 5070 headless donanım ölçümünü yanlışlıkla geçersiz saymamak.
- Sınır: Native YouTube compositor, gerçek DRM/CORS ve insan subjektif artefakt kararı bu nedenle
  açık risk olarak raporlanır; goal, bu kanıtlar ayrıca sağlanmadan tamamlandı ilan edilmez.

## D-023 — Kaynak yenilemede strict SDR ve generation sahipliği

- Tarih: 2026-09-20
- Durum: Accepted
- Karar: Aynı HTMLVideoElement üzerinde kaynak/kalite değişiminde renk kapısı yeniden çalıştırılır; başlatma/resize işlemleri generation ve backend kimliğiyle sahiplenilir. İptal edilen WebGPU cihazları derhal destroy edilir ve geç dönem hataları yeni oturuma failover taşımaz.
- Gerekçe: YouTube SPA/kalite geçişlerinde eski SDR kaynak veya eski GPU işinin yeni kaynağa sızmasını ve cihaz sızıntısını önlemek.

## D-024 — P2/P3 için paket içi profil-parametreli conservative baseline

- Tarih: 2026-09-20
- Durum: Accepted — model benchmarkı açık
- Karar: Doğrulanmış WebSR/RT4KSR portu bulunmadan gerçek çekim ve ekran/oyun/3D profilleri paket içi WebGPU shader baseline'ı olarak çalışacak. `live-action` sınırlı denoise/unsharp, `screen-3d` yalnız bounded luminance ve diagonal-pass kapalı yol kullanır.
- Karar: Profil backend hatası bir kez `safe` düşük kaliteye, devam eden hata orijinal video bypass'ına düşer. 2x/3x output ortak boyut hesabıyla doğrudan korunur.
- Gerekçe: Uydurma ayrıntı, metin halo/renk taşması ve uzaktan çalıştırılabilir kod riskini sınırlarken manuel P2/P3 akışını gerçek davranışla etkinleştirmek.

## D-025 — P5 manga ayrı, opt-in static pipeline

- Tarih: 2026-09-20
- Durum: Accepted
- Karar: Manga/webtoon görselleri video scheduler'ından ayrı bir
  `MangaImagePipeline` ile, varsayılan kapalı popup ayarıyla ve lazy
  IntersectionObserver işleme ile ele alınacak. Büyük sayfalar overlap tile'lara
  ayrılıp non-generative canvas baseline ile çizilecek; orijinal `<img>` daima
  korunacak ve overlay kaldırılarak geri dönülecek.
- Karar: MV3 manifestine genel host izni eklenmeyecek. Arbitrary-site desteği,
  açık origin açıklaması ve `chrome.permissions.request` optional-permission
  akışı tasarlanmadan etkinleştirilmeyecek.
- Gerekçe: Metin/çizgi sadakati, geri alınabilirlik ve minimum izin; manga hattının
  video yaşam döngüsüne sızmasını önlemek.

## D-026 — P4 bounded auto routing and reset-only temporal boundary

- Tarih: 2026-09-20
- Durum: Accepted — temporal enhancement model remains future work
- Karar: Otomatik profil yalnız sınırlı spatial feature özeti ve metadata ile
  çalışır; confidence `< 0.62` veya eksik kanıt `safe` döndürür. Geçiş için üç
  ardışık örnek gerekir; manual profile always wins.
- Karar: Seek, quality-change, source-change, resize ve explicit scene-cut
  sinyalleri in-flight output'u geçersiz kılan reset-only boundary'den geçer.
  Kare geçmişi veya sahte temporal stabilizasyon eklenmez.
- Gerekçe: P4 güvenlik hedeflerini karşılayıp normal GPU yolunda CPU readback,
  temporal leakage ve uydurma model iddiasını önlemek.
