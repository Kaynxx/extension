# Açık kabul doğrulama hazırlığı

Bu paket gerçek tarayıcı koşusu başlatmaz; headless fiziksel-GPU doğrulama için
plan ve manifest kapıları sağlar. Kullanıcı politikası gereği headed/visible/CUA açılmaz.
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
`pending` kalır. P2/P3 matrisi 30/60 FPS ve 2x/3x yollarını içerir; model/backend
kimliği ile gerçek karşılaştırma sonuçları olmadan kabul edilmez.
