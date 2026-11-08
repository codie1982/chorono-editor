# Maske ve efekt ara tamponlarında ROI

Bu teslim, 2D render'daki **ara efekt ve maske yüzeylerini** gereken alanla sınırlar.
Kaynak katmanları, medya, timeline veya undo silinmez. Viewport culling ve statik
grup LOD'den bağımsızdır; aynı havuz/sahiplik altyapısını kullanır. Raster/preview/
export tüketicileri aynı varsayılan render yolunu kullanır.

## Koordinatlar ve veri akışı

`CanvasRenderer`, offscreen gereken katmanlarda `planLayerSurfaceRegion` çağırır.
Plan materialized frame/index, native paint bounds, world matrix ve child index'i
yeniden kullanır. `paint.regionSafe` ve bilinen bounds/ordinary children gerekir.
Stroke/miter, grup çocukları, efekt zinciri ve feather payları composition
koordinatlarında birleşir. Integer rect yalnız composition'a kırpılır; editör
pan/zoom'u export alanını daraltmaz. `null` her zaman eski tam alan yoludur.
Analiz 4096 node/128 seviye ile sınırlıdır; state/cache veya kaynak mutation yoktur.

Grup taraması, `createLayerWorldMatrixResolver` ile aynı frame'in canonical parent
matrislerini paylaşır. Sahne/time/override değişiminde resolver yeniden oluşturulur;
cyclic parent ve index dışındaki effective clone eski truncation davranışını korur.
Matris işlemlerinin sırası korunur; memo sadece bu senkron analiz çağrısına aittir.

Kısa kenarı en az 512 piksel olan composition'da rect dışa doğru **128 piksel**
bloklarına yuvarlanır. Küçük animasyon değişimleri GPU'nun iki blur hedefini her
kare yeniden boyutlandırmaz. Bu bir kalite/çözünürlük azaltımı değildir; yalnız
çalışma alanı biraz büyür. Küçük composition'da tam integer bounds kullanılır.

`LayerSurfacePass.region` optional integer composition rect'idir. Akış:

1. Kaynak şekil/path/grup **tam kompozisyonda** çizilir.
2. Integer rect, ROI içerik yüzeyine kopyalanır; kaynak lease bırakılır.
3. Desteklenen efekt zincirinin output/scratch yüzeyleri ROI boyutundadır.
4. Maskenin content/final yüzeyleri ROI boyutundadır. Silhouette, feather ve
   inversion önce tam kompozisyonda hesaplanır, ilgili rect alınır.
5. Sonuç tam kompozisyon yüzeyine genişletilir; eski boyut/origin ile composite edilir.

Tek, maskesiz gölge için `EffectPlugin.applyRegion` capability'si bu akışı birleştirir:
kaynak/output tam boyutta kalır, yalnız tint/blur scratch'i ROI olur. Böylece iki ek
tam-kare crop/expand kopyası kalkar. Legacy ve bölgesel giriş aynı `renderShadow`
algoritmasını kullanır; ikinci bir gölge implementasyonu yoktur. Capability'si
olmayan zincirler yukarıdaki genel yolu kullanır. `EffectRegistry` her iki girişte
aynı allocator sahipliğini doğrular; GPU kaybı aynı tek retry sözleşmesini izler.

**İlk ve son yüzeyler neden tam boyutta?** Native Canvas'ta target extent/origin
değişimi karmaşık path rasterizasyonunu, küçük son bitmap ise parent-inverse
altındaki örneklemeyi değiştirdi. Bu iki faz korununca Four Seasons'ın altı tam
karesinde sıfır RGBA farkı elde edildi. V1 ek crop/expand kopyaları karşılığında
ara GPU/efekt işini küçültür; bütün yüzeylerin sıkı ROI olduğu iddia edilmez.

## Destek ve geri dönüş

`EffectPlugin.regionPadding(effect)`, composition pikselinde bağımsız destek/
komşuluk payı döndürür. Eksik/null capability tam alana döner; merkezi type-name
switch'iyle bilinmeyen plugin'e destek varsayılmaz. Paylar zincir boyunca toplanır.

- **GPU blur, glow, shadow ve tint** desteklenir. Gaussian guard `ceil(6*radius)+2`;
  shadow ayrıca mutlak offset ve fractional resampling payını ekler. Mevcut GPU
  kernelinin 3-sigma/95-tap hesabı değişmez; çalışma alanı konservatif belirlenir.
- **CSS blur** tam domain'de kalır: extent değişimi küçük rounding farkları üretti,
  test toleransı artırılmadı. `supportsRegionBlur` aynı GPU backend'ini allocation
  öncesi yoklar. Mid-pass GPU başarısızlığında `SurfaceRegionFallback`, kısmi scope'u
  kapatıp tam alanda yalnız bir kez yeniden çizer. Budget/drawing hataları gizlenmez.
- **Inner glow, inner shadow, vignette, bilinmeyen efektler**, bilinmeyen text ink,
  particle/repeater, instance/follow/motion, temporal trail, nested offscreen çocuk
  ve destination blend muhafazakâr tam alan yolunu kullanır.
- Native shape/path/spline ve sınırı bilinen media/group içerikleri adaydır.
  Add/subtract/intersect, opacity, inversion, feather ve missing mask korunur.
  Maskenin kutusu host'u küçültmez. `MaskRenderArgs.compositionSize`, tam-domain
  silhouette adaptasyonudur; eski callers değişmez.

## Sahiplik ve bütçe

`CanvasSurfaceScope.cropped` senkron backend geri dönüş bilgisidir; scene JSON'a
girmez. Borrowed input bırakılmaz; output/scratch aynı allocator'dandır. Hata,
retry ve composite sonunda lease'ler `finally` ile kapanır. Composite callback
full-composition canvas/rect alır; canvas'ı tutamaz veya resize edemez.

`CanvasSurfacePool` exact-size idle yüzeyi önce kullanır; yoksa en eski idle
canvas'ın backing'i bırakılıp yeni ölçü admission'ı yapılır. Animasyon karesi başına
boyut cache'i biriktirilmez. Aktif lease resize/evict edilmez; imkânsız istek yararlı
idle girdileri korur. Resize hatasında rezervasyon geri alınır. `reuses` resize'ı da
kapsar; fiziksel backing allocation'ın sıfır olduğu anlamına gelmez.

Havuz **128 MiB**, idle süre **2 saniye**, LOD cap'i **64 MiB** olarak kaldı.
Benchmark **512 MiB bilinen kaynak / 768 MiB heap** guard'larını korur. Bu rakamlar
kesin süreç RAM/GPU limitleri değildir; decoder/driver/RSS tam ölçülmez.

## Doğrulama ve tekrar çalıştırma

Next kapalıyken `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run mcp:build`,
`npm run build`, ardından `npm run perf:prepare -- artifacts/performance/opt5-roi-20261107/build`.
`npm run perf:serve -- artifacts/performance/opt5-roi-20261107/build 4319` sonrasında:

- `/region-check.html`: CSS/GPU, mask/inversion/feather, transformed group, local
  chain, backend fallback ve idle. İlk testten önce belirlenen full-res eşik max
  kanal farkı 2 ve RMS 0,25; mask/tint'in exact vakaları ayrıca sıfır fark ister.
  Readback disposable kopyalardandır; tolerans artırılmadı.
- `/region-scene-check.html`: immutable Four Seasons kopyasında altı authored
  zamanda ROI opt-out reference'a karşı tam kare kontrolü.
- `/?case=four-seasons`: aynı 60 aktif saniye warmup + 6×10 sparse timing protokolü.

`new CanvasRenderer(pool, undefined, false)` debug/reference opt-out'tur. Normal
varsayılan açık; serialized format ve MCP authoring şeması değişmez.
[Ölçümler, kaynak/bundle kimlikleri ve sınırlar](../../artifacts/performance/opt5-roi-20261107/README.md).

## Ortak render şeması hazırlığı

CPU profilinde aynı native property şemalarını her layer/frame için yeniden
oluşturmak önemli maliyet üretti. `RenderSchemaResolver`, canonical
`LayerDefinition.getPropertyGroups` sonucunu render doğrulama indeksine derler.
Yalnız `propertyGroupsAreStatic: true` capability'sini açıkça veren tanımlar
paylaşılır; audited shape, group, Bezier ve path-stroke tanımları opt-in yapar.
Dynamic/custom tanımlar her layer'da yeniden sorgulanır. `showWhen` inspector
koşulu olarak kalır; render clamp eskisi gibi bütün yayımlanan constraints'i kullanır.

`CanvasRenderer` composition'ı ortak resolver'ı sağlar. Weak cache canlı definition
kimliği + provider function ile ilişkilidir; layer/scene/override referansı tutmaz.
Provider değişimi cache'i yeniler; registry lookup her çağrıda canlıdır. Statik
olarak sertifikalanmış constraint değişecekse definition/provider değiştirilir;
aynı function'ın kapattığı mutable değişkeni değiştirmek bu capability'ye aykırıdır.
Schema index borrowed/read-only'dir; tüketici değiştiremez veya mutation için cast edemez.

`RenderSchemaProvider` eski readonly array dönüşünü korur, ek olarak readonly
path→schema map kabul eder. Clamp, typed color, invalid input ve instance/source
animasyon ayrımı değişmez. Sahne JSON'u veya yeni bir keyframe cache'i eklenmez.

```ts
const schemas = new RenderSchemaResolver(layer => registry.findForLayer(layer))
const frame = materializeRenderScene(scene, overrides, schemas.resolve)
```

Resolver mutable cache sahibi, sahne hazırlığı ise senkron borrowed consumer'dır.
3000 layer için bir static provider çağrısı, dynamic min/max, provider/registry
replacement ve eski array caller kontrolleri `RenderSchemaResolver.test.ts`'tedir.

## CPU takip dilimi — ilk ve güncel sonuçlar

Parent-prefix paylaşımı, değişmeyen GPU canvas ölçüsünün yeniden atanmaması ve
sertifikalı boş-alpha effect/mask alt ağaçlarının çizimden elenmesi eklendi.
Sonuncusu registry'deki isteğe bağlı `EffectPlugin.alphaSafe` capability'sini kullanır;
bilinmeyen/custom efektler, destination işlemleri, seçim ve temporal içerik korunur.
Bu sözleşme değerlendirme, state veya ses saatini durdurmaz.

**İlk denemede CPU gerilemesi çözülmüş sayılmadı.** Dengeli A/B tekrarında altı tam kare aynı,
izlenen tepe 44,47 MiB ve scratch tepe 21,07 MiB kaldı. Çizim p50 189,0 → 177,9 ms
olsa da p95 245,2 → 311,0 ms oldu. Ortanca iyileşmesi tail kabulünü kapatmaz.
Ortam varyansı, birlikte yaşayan iki GPU context ve senkron submit sürelerinin
sınırları ham raporla birlikte kaydedilir. [CPU takip raporu](../../artifacts/performance/opt6-roi-cpu-20261107/README.md).

**Güncel dar CPU kabulü geçti:** ortak şema hazırlığı sonrasında iki bağımsız
dengeli A/B koşusunda p50/p95 **166,1/515,5 → 147,7/345,4 ms** ve
**186,7/547,6 → 152,6/420,1 ms**. İki koşuda da 6/6 hash aynı, izlenen tepe
44,47 MiB, scratch tepe 21,07 MiB ve idle scratch 0 kaldı. Her sürüm için toplam
120 zamanlı örnek vardır; koşuların yüzdelikleri birleştirilmedi. İkinci koşunun
en kötü tek karesi 651,4 → 938,7 ms geriledi; genel stall/CPU scheduling kabulü
bu yüzden tamamlandı diye işaretlenmez. [Güncel ham karşılaştırma](../../artifacts/performance/opt6-roi-cpu-20261107/comparison-schema.json).
