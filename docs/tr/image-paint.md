# Basic Shape ve kompozisyon resim dolgusu

15 Kasım 2026. Bu özellik statik resim dolgusudur; video dokusu, mesh UV editörü
veya Boolean geometri motoru değildir. Mevcut renk/gradient, keyframe ve eski
proje alanları korunur.

## Kaynak sözleşmesi ve kullanım

Basic Shape → Properties → Fill Type: None / Color / Gradient / Image.
Image'da mevcut image asset seçilir veya Import image… kullanılır. Import tek
Undo ile yalnız asset + fill ekler; ayrıca bir Image layer üretmez. Stroke Type:
None / Color / Gradient bağımsızdır. None, eski değerleri/key'leri silmez.

Kompozisyon Properties ve Composition Settings aynı background kontrolünü
kullanır. Modal taslak Apply/Cancel davranışını korur; taslağa dosya import
edilmez, mevcut Assets listesinden seçim yapılır. Kompozisyon inspector'ı direkt
resim import edebilir. Include in export varsayılan açıktır ve projeye kaydedilir.

```ts
// Mevcut style'ın diğer alanlarını koruyarak fill'i değiştirin.
const fill = {
  type: 'image' as const,
  image: { version: 1 as const, assetId: 'registered-image-id', fit: 'cover' as const,
    offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 },
}
```

`ImagePaint.version` yalnız 1'dir. `fit`: cover / contain / fill (UI: Stretch).
Önce resim kutuya sığdırılır; kutu merkezi etrafında pozitif uniform `scale` ve
saat yönünde derece `rotationDeg` uygulanır, sonra yerel piksel `offsetX/Y`
eklenir. UI scale yüzdesi 100 = kaynak faktörü 1'dir. Şeklin dış transform'u
bunlardan bağımsızdır. None ve contain boşluğu alpha'dır. Eksik/hazır olmayan
resim siyah fallback çizmez. Arayüzde yerleşim sayısal alanlarla düzenlenir;
resmi ayrı bir mouse crop/UV modunda sürükleme bu dilimde yoktur.

Basic Shape paint box, orijinal `size` dikdörtgenidir; gerçek path'e kırpılır
(ring deliği dahil). Kapalı Bezier/spline ortak painter'ı kullanır; kutuları yerel
geometri bounds'udur. Bu nedenle farklı kutulu geometriye dönüştürme paint'i
aynı kaynakla korur fakat otomatik UV görünüm eşliği vaat etmez. Açık eğriler
fill üretmez. `style.fill.image.offsetX/offsetY/scale/rotationDeg` sayısal key
kanallarıdır; asset/fit/type statiktir. Mevcut key'ler tip değişiminde korunur.

Kompozisyon: `backgroundFill?: ShapeFill`, `backgroundInExport?: boolean`.
Geçersiz paint payload runtime doğrulamasında `INVALID_PAINT`, eksik image
referansı `MISSING_ASSET` olarak raporlanır. Yeni fill yoksa `backgroundColor/backgroundGradient` legacy adapter'ından okunur;
zorlu migration yoktur. Kaydet/aç inactive image payload'unu da korur.

## Sorumluluklar, veri akışı ve kaynak ömrü

- `src/lib/paint/imagePlacement.ts`: platform bağımsız fit/yerleşim hesabı;
  geçersiz/dejenere ölçüde null, native handle veya mutation yoktur. Eski image
  ve frame-sequence fit hesapları aynı helper'ı kullanır; eski natural-size
  top-left image davranışı caller politikasında korunur.
- `paintSource.ts`: tip değişimi, legacy stroke/background adapter'ı ve output
  inclusion politikası. `validatePaint.ts` yeni sürümlü payload'u doğrular.
- `render/paint/drawImagePaint.ts`, `drawPathFill.ts`: ödünç hazır image ile path'e
  clip ve çizim; Canvas state save/finally restore. Decode/cache/URL sahipliği yok.
- Shape/path/spline renderer registry media dependencies bildirir. Aktif image
  paint statik LOD proxy'ye alınmaz; decode öncesi boş raster'ın cache'lenmesi
  engellenir. None'a geçince image demand kalkar; source referansı kalır.
- `render/media/VisualDemandResolver.ts`: görünür shape talepleri ve zero-layer
  kompozisyon background talebi. Root/ghost render background yüklemez. Final
  output readiness için aynı managed media session/asset map kullanılır.
- `editor/commands-image-paint.ts` + `app/hooks/useImport.ts`: mevcut bounded
  ImportManager, source leases, document cancellation kullanılır. Await öncesi
  paint imzası kaydedilir; aynı paint değişmiş/silinmiş/kilitlenmiş ise adoption
  reddedilir. Aradaki ilgisiz hareketler korunur. Dispatch sonrası creator lease
  finally bırakılır; document/history kendi sahipliğini sürdürür.
- `asset/AssetIndex.ts`: active ve inactive image paint; kompozisyon referansı
  layer ID'lerinden ayrıdır. Assets Panel orphan cleanup bu indeksi kullanır.
- `components/paint`: ImagePaintControls ve CompositionBackgroundControls ortak
  UI'dır; modal taslağı ve gerçek source inspector'ı aynı kontrolleri kullanır.

Sık render edilen hesaplar source dışında kalır. Yeni dense frame cache, ikinci
image loader veya source/undo içinde DOM nesnesi yoktur. Yerleşim hesapları
zoom/FPS'ten bağımsız deterministiktir. Mevcut büyük renderer/Properties dosyaları
bu sorumluluk için yeni küçük painter/kontrol modüllerini çağırır; alakasız büyük
refactor yapılmaz.

## Çıktı sözleşmesi ve sınırlar

`backgroundInExport:false` editör preview'ını değiştirmez; PNG, sequence SVG,
runtime ve HTML çıktılarında source background'u çıkarır. Explicit custom export
color önceliklidir. JPEG alpha desteklemediği için beyaz fallback ve uyarı verir.
Portable/editor JSON, resim ve inclusion tercihini düzenlenebilir olarak tutar.
Renderer'a `output:true` ayrı amaç bayrağı gönderilir; editörde de kullanılan
`renderMode:'preview'` export kararı olarak yorumlanmaz.

Raster ve sequence aynı `renderRasterFrame` adımını kullanır. SVG pattern'leri
ortak fit hesabını kullanır, aynı asset bytes'ını tek image tanımında tutar. Async
SVG output mevcut portable converter/scope ile blob image'ı embed eder; sync
ham helper session blob URL'yi reddeder. Eksik image açık hatadır. Static SVG
seçilen zamanı değerlendirir; animated SVG yalnız mevcut outer transform/opacity
kapsamındadır. Image yerleşim key'leri timeMs'de dondurulur ve warning döner.
Maske/efekt gibi önceki SVG kayıp uyarıları devam eder. Eski harici native player
sürümlerinin bu yeni paint payload'unu çizdiği doğrulanmış değildir.

## Doğrulama giriş noktaları

`src/lib/paint/imagePaint.test.ts`: fitting/dejenere girdi, inactive data, import
stale guard/Undo/Redo/clone/save, asset sahipliği, yeni payload doğrulama ve output
source inclusion. Media demand/LOD testleri affected adapter sınırlarını kapsar.

`node scripts/perf/image-paint.mjs /private/tmp/chorono-image-paint-qa` Next
kapalıyken ayrı QA bundle üretir. `node scripts/perf/serve.mjs
/private/tmp/chorono-image-paint-qa 4355` ile açılan image-paint.html gerçek
Properties/import/media/renderer ve encoders kullanır; Run image paint checks,
PNG/SVG piksel, sequence ZIP decode, kaynak key eşliği, tek import Undo/Redo ve
viewport/export background ayrımını sınar. İnsan editörüne fixture yüklemez.
