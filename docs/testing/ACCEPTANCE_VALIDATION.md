# Açık kabul doğrulama hazırlığı

Bu paket headed fiziksel-GPU koşuları için plan ve manifest kapıları sağlar.
DRM koruması aşılmaz; korumalı veya origin-clean olmayan kaynakta orijinal video korunur.

Planı görmek için:

```bash
npm run test:acceptance-plan
```

P1 görsel kanıt manifestini doğrulayın:

```bash
npm run test:acceptance-manifest -- docs/testing/evidence/p1/visual/visual-results.json
```

Kapı; headless olmayan yüzeyi, eksik HeadlessChrome user-agent kanıtını, yazılım
renderer'ını, eksik 12 mod/fixture capture'ını, eksik SHA-256 screenshot hash'lerini
ve ham zaman örneği olmayan capture'ları reddeder. Native YouTube/CORS/DRM ve insan görsel kararı plan üzerinde
`pending` kalır. P2/P3 headed baseline matrisi
`docs/testing/evidence/p2-p3/p2-p3-results.json` içinde 8/8 hücre ve 120 frame/case
olarak kaydedilmiştir; kimlik bundled WebGpuBackend conservative shader baseline'ıdır.
WebSR/RT4KSR gerçek model karşılaştırması mevcut olmadığı için model kabulü pending'dir.
