# İlk Fizibilite Araştırması

Tarih: 2026-09-14

## Sonuç

Chrome eklentisi içinde video karelerini WebGPU ile işleyip ayrı bir canvas'ta göstermek teknik olarak mümkündür. Gerçek zamanlı 4K için tek ve ağır bir genel model yerine içeriğe özel, küçük modeller ve adaptif performans seviyeleri gerekir.

## Dayanaklar

- WebGPU, `HTMLVideoElement` ve `VideoFrame` kaynaklarını `GPUExternalTexture` olarak alabilir. Kaynak origin-clean olmalıdır: <https://www.w3.org/TR/webgpu/>
- Video karelerine `requestVideoFrameCallback` ile erişilebilir: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback>
- ONNX Runtime Web, WebGPU ve GPU belleğinde I/O binding destekler: <https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html>
- Anime4K'nın WebGPU video→canvas uygulaması vardır: <https://github.com/Anime4KWebBoost/Anime4K-WebGPU>
- WebSR, WebGPU için Animation, Real Life ve 3D ağırlıkları ile S/M/L ağlar sunar: <https://github.com/sb2702/websr>
- RT4KSR, doğrudan 1080p→4K `2x` ve 720p→4K `3x` model tasarımı için aday referanstır: <https://github.com/eduardzamfir/RT4KSR>
- Real-ESRGAN gerçek dünya restorasyonu için güçlü ancak tam sürümü tarayıcıda gerçek zamanlı 4K için ağırdır: <https://github.com/xinntao/Real-ESRGAN>
- AnimeSR, genel gerçek-çekim modellerinin animede çizgi ve gürültü artefaktı oluşturabileceğini gösterir: <https://proceedings.neurips.cc/paper_files/paper/2022/file/48cca987b3af66e1a607abd4820b330d-Paper-Conference.pdf>
- COMISR, sıkıştırılmış ve YouTube benzeri videolarda compression-aware VSR yaklaşımını destekler: <https://arxiv.org/abs/2105.01237>
- Algılanan kalite ile piksel sadakati arasında temel bir trade-off bulunur: <https://openaccess.thecvf.com/content_cvpr_2018/html/Blau_The_Perception-Distortion_Tradeoff_CVPR_2018_paper.html>
- Manifest V3 uzaktan çalıştırılabilir kodu yasaklar; model dosyaları veri olarak yönetilebilir: <https://developer.chrome.com/docs/extensions/ai>

## İlk Model Kararları

- Anime MVP: Anime4K-WebGPU.
- Gerçek çekim prototipi: WebSR Real Life ile ölçüm; uzun vadede RT4KSR tabanlı x2/x3 model.
- Ekran/oyun/3D: Ayrı profil; WebSR 3D ilk baseline.
- Manga: Video hattından ayrı, metin korumalı statik görsel hattı.
- HDR: İlk sürüm kapsamı dışı.

## Doğrulanması Gerekenler

- YouTube'un farklı codec ve oynatma yollarında origin-clean davranışı.
- Tam ekran, altyazı, sinema modu ve Picture-in-Picture davranışı.
- Chrome'un kullandığı gerçek GPU adaptörü ve cihaz limitleri.
- External texture'dan model tensörüne geçişin kopya maliyeti.
- Aday modellerin WebGPU operator uyumluluğu ve gerçek p95 süreleri.
