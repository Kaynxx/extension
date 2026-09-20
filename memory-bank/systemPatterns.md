# System Patterns

## 1. Non-destructive Overlay

Orijinal `<video>` elementi oynatma, ses ve zamanlama kaynağı olarak kalır. Görsel çıkış ayrı bir WebGPU canvas'ta sunulur. Bypass, canvas'ı kaldırıp orijinal videoyu göstermek kadar güvenli olmalıdır.

## 2. Latest-frame-wins Scheduler

Her yeni kare `requestVideoFrameCallback` ile izlenir. Aynı anda birden fazla ağır inference kuyruklanmaz. Eski bir sonuç tamamlandığında daha yeni bir kare sunulduysa eski sonuç ekrana verilmez.

## 3. Backend Contract

Her upscale uygulaması ortak sözleşmeye uyar. Üretim sözleşmesi, stale kareyi canvas'a sunmadan atabilmek için iki aşamalıdır:

```ts
interface UpscalerBackend {
  initialize(context: BackendContext): Promise<void>;
  resize(input: FrameSize, output: FrameSize): Promise<void>;
  setQualityLevel(level: "low" | "high"): void;
  prepare(source: HTMLVideoElement | VideoFrame | ImageBitmap): Promise<PreparedFrame>;
  dispose(): void;
}

interface PreparedFrame {
  stats: RenderStats;
  present(): void;
  discard(): void;
}
```

Model/runtime ayrıntısı overlay ve scheduler koduna sızmaz.

## 4. Profile-based Processing

Profil, yalnızca model adı değildir. Preprocess, upscale, restoration, ölçek, kalite seviye haritası ve güvenlik sınırlarını birlikte tanımlar.

```ts
type ContentProfile = "anime" | "live-action" | "screen-3d" | "safe";
```

## 5. Capability before Configuration

Kalite seçiminden önce WebGPU adaptörü, cihaz limitleri, gerekli format/özellikler ve kısa gerçek iş yükü testi yapılır. GPU marka adı tek başına karar kaynağı değildir.

## 6. Hysteresis in Adaptive Quality

Kalite hızla düşebilir fakat ancak istikrarlı bir süre sonunda yükselir. Bu desen kalite seviyesinin kareden kareye gidip gelmesini ve görsel titreşimi engeller.

## 7. Explicit Color Pipeline

Girdi renk uzayı, modelin beklediği uzay ve canvas sunum uzayı açık tanımlanır. Bilinmeyen HDR veya desteklenmeyen renk yolunda upscale devre dışı kalır.

## 8. Site Adapter Boundary

YouTube DOM seçicileri ve SPA davranışı `content/youtube` adaptöründe tutulur. GPU/model kodu siteye özel DOM varsayımları bilmez.

## 9. Resource Ownership

GPU buffer, texture, frame ve callback sahipliği açık olmalıdır. Video değişiminde, resize'da ve device loss'ta eski kaynaklar serbest bırakılır. `VideoFrame` kullanılıyorsa işi biter bitmez kapatılır.

## 10. Observable Locally, Private by Default

Performans HUD'u ve debug kayıtları yereldir. Uzak telemetri ayrı ve açık kullanıcı kararı olmadan eklenmez.
