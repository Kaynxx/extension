# Açık kabul doğrulama hazırlığı

Bu paket gerçek tarayıcı koşusu başlatmaz; headed doğrulama, kullanıcı tarafından
ayrı bir görünür Chrome oturumunda çalıştırılmak üzere plan ve manifest kapıları
sağlar. DRM koruması aşılmaz; korumalı veya origin-clean olmayan kaynakta orijinal
video korunur.

Planı görmek için:

```bash
npm run test:acceptance-plan
```

P1 görsel kanıtı yayınlamadan önce gelecekteki headed RTX koşusunun manifestini
doğrulayın:

```bash
npm run test:acceptance-manifest -- docs/testing/evidence/p1/visual/visual-results.json
```

Kapı; HeadlessChrome user-agent'ını, yazılım renderer'ını, eksik 12 mod/fixture
capture'ını, eksik SHA-256 screenshot hash'lerini ve ham zaman örneği olmayan
capture'ları reddeder. Native YouTube/CORS/DRM ve insan görsel kararı plan üzerinde
`pending` kalır. P2/P3 matrisi 30/60 FPS ve 2x/3x yollarını içerir; model/backend
kimliği ile gerçek karşılaştırma sonuçları olmadan kabul edilmez.
