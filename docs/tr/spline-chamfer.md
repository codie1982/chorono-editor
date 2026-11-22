# Spline Chamfer — S2D-5C

Point modunda seçili spline köşelerini pah kırarak düzenler. Line–line,
line–quadratic, line–cubic ve cubic–cubic komşulukları desteklenir. Bu bir
statik kaynak geometrisi işlemidir; Fillet, yeni Poly yüzü veya canlı modifier değildir.

## Kullanım

1. Spline'a sağ tık → **Edit mode → Point**. Mevcut **Spline & Boolean** paneli
   açılır. Bir veya birden fazla iç köşeyi seçin; açık konturun uçları uygun değildir.
2. Panelde **Chamfer → Preview Chamfer** açın. **Cut distance** iki komşu kenarın
   her biri boyunca, gösterilen kompozisyonda **px cinsinden yay uzunluğudur**.
   Örneğin 10 px, gelen kenardan 10 ve giden kenardan 10 px keser. Pah çizgisinin
   toplam uzunluğu veya bir Fillet yarıçapı değildir.
3. Sarı kesikli sınır ve kare kesim işaretleri sonucu gösterir. Kaynak hâlâ eski
   geometridir; önizleme render/export'a girmez. Ayar değişince hesap yenilenir.
4. **Apply Chamfer** bütün köşeleri tek Undo adımıyla değiştirir; yeni iki uç
   seçili kalır. **Cancel Chamfer** kaynak ve Undo/Redo geçmişini değiştirmez.

Kesilmiş circle → iç Offset → Add Line + Spline Vertices snap ile iki ucu
birleştir → Point modunda köprü köşelerini seç → Chamfer akışı desteklenir.
Orijinal circle'ın kalan üç cubic kenarı düzleştirilmez.

## Kaynak, zaman ve sahiplik

- Eski köşe ve ona bağlı handle ID'leri kaldırılır. Her köşe için iki yeni point
  ve bir line segment ID'si oluşur. Sonuç `cuts` alanında eski→yeni eşlemeyi taşır.
- Gelen/giden mevcut edge ID'leri, kontur/Object ID'leri, sıra, yön ve fillRule
  korunur. Etkilenmeyen kayıtlar kaynak kimliğini korur. Sadece değişen Object
  `source: edited, editable: true` olur; yeniden jeneratör hesabı yapılmaz.
- Eğriler uygun t parametrelerinde De Casteljau ile kesilir; quadratic/cubic
  dereceleri korunur. Kısalan tek mirror handle komşu eğriyi bozmamak için
  korunur; ilgili eski `bezier` noktası bağımsız uzunluklu `smooth` olur.
  Yeni cubic uçları `bezierCorner` olur; pah ile teğet eşitliği zorlanmaz.
- Tam parent hiyerarşisi, dönüş, yansıma, nonuniform ölçek ve o andaki parent
  animasyonu mesafe hesabına dahildir. Kesilen koordinatlar inverse affine ile
  layer-local kaynağa döner; dış transform ve paint animasyonları korunur.
- Kilitli/gizli/frozen parent, instance, üretilmiş Boolean sonucu ve spline
  koordinatlarını süren key/expression/binding/controller varsa işlem reddedilir.
  Kaldırılacak ID'yi kullanan scene/wire referansı sessizce taşınmaz veya silinmez.
- Source, seçim, mod, zaman, document veya playback bağlamı değişirse preview
  geçersizleşir ve işi iptal eder. Apply ayrıca güncel source kimliğini ve aktif
  transaction durumunu kontrol eder. Kaydet/aç normal spline JSON kullanır;
  yeni şema veya runtime/export özelliği gerekmez.

## Uygulama sınırları ve sayısal sözleşme

- Mesafe 0.1–10.000 composition px, seçili köşe en çok 128. Komşu köşeler aynı
  edge'i keserse iki uç bir defada hesaplanır. Kesimler çakışır veya kalan edge
  0.01 px'den kısa olursa bütün işlem reddedilir; sessiz clamp yoktur.
- Bézier yay uzunluğu chord/control-polygon alt/üst sınırlarıyla adaptif ölçülür.
  Ayrıca doğrusal parametre yaklaşım hatası sınırlandırılır; aynı doğru üzerindeki
  düzensiz kontrol noktaları da doğru t ile kesilir. Lookup hedef toleransı
  0.005 px; her edge en çok 32.768 düğüm ziyareti, toplam 262.144 lookup örneği.
  Derinlik 24; kalite bütçesi aşılırsa daha düşük kaliteye düşmek yerine tanı verir.
- Self-intersection, temas, winding ve delik sahipliği etkilenen Object'in bütün
  konturlarında kontrol edilir. Kontroller 0.01 world px adaptif örneklemeye
  dayanır; bu, matematiksel exact curve–curve intersection garantisi değildir.
  Kaynak eğriler bu örneklemeye dönüştürülmez. Önce/sonra toplam 4.096 doğrulama
  köşesi, 2.048 path komutu ve her yönde en çok 32 kontur sınırı vardır.
  Karmaşık veya belirsiz sınırlar açıklamalı reddedilir. Ayrı Object'ler
  arasındaki bilinçli görsel örtüşmeler engellenmez.
- Hesap tek kullanımlık CPU worker'dadır. Realm başına aynı anda 1 iş ve en çok
  2 bekleyen iş; 5 saniye deadline. Cancel/değişen ayar/unmount worker'ı
  terminate eder. Main-thread fallback ve kalıcı yoğun geometri cache'i yoktur.

## Bakım için giriş noktaları

- `src/lib/spline/chamfer`: seri DTO/sınırlar, saf geometri, segment kontrol
  adapter'ı, boundary doğrulaması, worker adapter'ı.
- `src/lib/geometry/bezier`: ortak exact split/evaluate/trim ve ayrı adaptif
  arc-length lookup. Spline Refine, eski path anchor insert ve render trim aynı
  subdivision'ı kullanır. Render trim'in mevcut 32-örnek zamanlama hesabı değişmez.
- `src/lib/geometry/planar/boundaries.ts`: Offset ve Chamfer'ın ortak boundary
  sınıflaması; eski Outline import'u uyumlu export olarak kalır.
- `src/lib/editor/spline/chamfer/chamferPlan.ts`: scene/driver/reference guard,
  source kimliği, dünya↔yerel dönüşüm ve tek native command. Worker kopyasındaki
  değişmeyen kayıtlar mevcut source kayıtlarıyla tekrar paylaşılır.
- `src/components/splineEdit/preview/useSplineOperationPreview.ts`: Offset ve
  Chamfer için ortak iptal/stale-result/Apply/Cancel yaşam döngüsü. Page sahibidir;
  dock kontrolleri ve viewport overlay yalnız ödünç alır.
- `src/components/splineEdit/chamfer`: Point modu kontrolleri ve saf SVG overlay.

Saf kullanım örneği (editor komutu için plan katmanını kullanın):

```ts
const result = chamferSpline({
  data: spline, pointIds: selectedPointIds, distancePx: 10,
  matrix: displayedWorldMatrix.toArray(),
})
// result.data: yeni yerel spline; result.path/markers: geçici dünya preview.
// Gerçek editörde Apply, prepareSplineChamfer(...).command(result) üzerinden
// dispatch edilir; scene.spline doğrudan yazılmaz.
```

## Doğrulama

`npm test`, `npx tsc --noEmit`, `npm run mcp:build`, `npm run build`.
Çalışan Next checkout'una build yazılmaz; aynı kaynakların izole kopyası kullanılır.
Native kabulü `node scripts/perf/spline-chamfer.mjs <çıktı>` ile hazırlanır.
Tarayıcıda ayrı QA origin'inde gerçek worker, viewport/input, render/export pixel
karşılaştırması, driver retleri, preview iptali ve tek Undo/Redo doğrulanır.
Kullanıcının sahnesi veya recovery/Undo store'u test için değiştirilmez.

**S2D-5D güncellemesi:** [Fillet](spline-fillet.md) uygulandı. Chamfer ile
seçim/topoloji splice ve native command guard artık `spline/corners` ve
`editor/spline/corners` altında ortaktır. Eski Chamfer public import
yolları ve DTO/Undo sözleşmesi compatibility adapter'larıyla korunur.
