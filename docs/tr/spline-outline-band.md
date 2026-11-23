# Outline / Stroke to Path — ilk geometri teslimi

23 Kasım 2026. Native Outline ve statik Stroke to Path aynı kapalı bant hesabını
kullanır. Bu teslim [Outline v2 planının](plans/spline-outline-band-v2-plan.md)
geometri/görünüm temelidir; tam eğri-fit/preset kapsamının tamamlandığı anlamına
gelmez.

## Kullanım

- Spline seçip `2` (Edge) veya `3` (Object) ile Edit'e girin. Bir veya daha fazla
  edge zinciri ya da Object seçin. Panelde veya sağ tıkta **Outline · Stroke to
  Path** → **Preview Outline**. Width, Alignment, Caps, Corners, dash/gap,
  maksimum vertex aralığı ve toleransı ayarlayın. **Apply Outline** tek Undo'dur.
- Varsayılan, yalnız seçili edge'leri bantla değiştirir. **Keep source**, bandı
  aynı spline içinde yeni Object olarak ekler. Seçilmemiş edge'ler/Objects,
  layer/parent TRS, gerçek origin ve animasyonlar korunur. Cancel veya mod/seçim/
  zaman/belge değişimi kaynak/geçmişe yazmaz; geç worker sonucu uygulanamaz.
- Object'in delikleri dahil tam kapalı konturlarda Inside/Center/Outside;
  açık veya kısmi zincirlerde Center/Left/Right kullanılabilir. Geçersiz seçenek
  nedenini gösterir ve Apply edilmez. Offset Path paralel kontur aracı olarak
  ayrı kalır; eski `outline` modifier kayıtlarının davranışı değiştirilmez.
- Kaynak koruyan parametrik kullanım: Edit moduna girmeden **+ Add modifiers →
  Stroke to Path**. Yeni type `strokeToPath`; statik ayarlar ve açık Object
  hedefleri **Execute stack** ile kaynak → etkin adımlar sırasıyla uygulanır.
  Sıralama, aç/kapat, silme, Bake ve native Undo/Redo mevcut altyapıdır.
- Boya **Properties** içindedir. Bant başlangıçta kaynak layer stroke'unu fill
  olarak kullanır (Solid/Gradient/Pattern/None ve alpha); kaynak fill'i değişmez.
  **Paint target** listesinden Outline Object seçip bağımsız Fill/Stroke verin.
  **Use source stroke as fill** bağa döner. Bağımsız boya statiktir; root layer
  animasyon/expression yolları yanlışlıkla Object boyasına bağlanmaz. Execute,
  aynı deterministik output Object ID'sinin açık custom boyasını korur.

## Modüller ve veri akışı

`src/lib/spline/band` yerel saf geometri sahibidir:

- `selection.ts`: source sıralı, birbirine bağlı seçili edge zincirleri; kapalı
  seam birleşir, seçilmemiş edge'e genişletme yapılmaz.
- `SplineBandBackend`: canonical `SplineArcSampler` üzerinden yay uzunluğu,
  mevcut `offsetJoin` üzerinden join ve `PolygonClippingBackend.combineBand`
  üzerinden aynı Boolean motoru. İkinci bir solver/runner yoktur. Kaynak anchor'lar
  ve dash kesimleri korunarak aralıklar adaptif örneklenir; Bézier chord ve
  displacement-normal hatası, round sagitta ve precision grid bütçelenir.
- `bandPieces`: sabit kalınlıkta ortak cross-section'lar, Butt/Round/Square uçlar,
  Miter/Round/Bevel köşeler. Miter limitte bevel ve sayılabilir tanı. Çok geniş
  bandın iç boşluğu tüketmesi geçerlidir; dar bölgeyi ters çevirmek yerine swept
  parçaların alanı Boolean ile temizlenir. Reversed cusp açıkça reddedilir.
- `dashes`: SVG tek sayılı diziyi çiftleme, imzalı offset, contour başına reset,
  sıfır gap'te birleşme ve Round/Square nokta dash'leri. Kapalı seam'de görünür
  aralıklar birleştirilir; seam'de gereksiz cap oluşmaz.
- `applyBand`: gerçek normalized point/segment/contour/Object kayıtları. Native
  komut `src/lib/editor/spline/band/bandPlan.ts`, var olan topology/lock/driver/
  geometry-reference guard'larını ve tek Undo yolunu kullanır. Edit ayarları
  modifier kaydına dönüşmez. Yeni public MCP `spline.edit` kind'ı eklenmedi.
- `SplineBandWorkerClient`: mevcut BoundedJobQueue + OneShotWorkerClient,
  realm başına 1 aktif / 2 kuyruk, 10 saniye deadline. Abort/unmount/stale
  context worker'ı sonlandırır; kaynak/result buffer'ı kalıcı cache'e alınmaz.
- `useSplineBand`: mevcut `useSplineOperationPreview`; yalnız viewport overlay
  için yerel sonuç mevcut evaluated world matrix ile dönüştürülür.
- `StrokeToPathModifier`: aynı hesap + shared defaults/field schema; genel
  Modifier/registry/stack korunur. Yeni `text` field kind dash dizisini taşır.

Tüm uzunluklar **layer-local px**, açılar mevcut layer transform sözleşmesinde;
zoom/parent ölçeği genişliği yeniden hesaplatmaz. Çıktı açıkça **polyline**'dır.
Gerçek Bézier offset veya cubic fitting iddiası yoktur. Maksimum vertex aralığı
üst sınırdır; eğri ve anchor çevresinde daha yoğun örnekler vardır, bant genişliği
artmaz. 32 zincir, 2048 source edge; 4096 sampled merkez vertex, 262144 arc
lookup sample; 4096 generated parça/32768 parça vertex ve 8192 final vertex
ve Object başına 256 final contour sınırları vardır. Aşım geometriyi kısaltmaz, açıklamayla reddeder. Sayısal grid
`tolerancePx/4096`; yalnız üretilmiş parçalar/maskeler bu hassasiyete taşınır,
kayıtlı kaynak değişmez. Karmaşık self-crossing kapalı material maskeleri ve
reversed cusp'lar desteklenmez; açık center zincirler alan union'u kullanır.

## Görünüm, taşınabilirlik ve çıktı

`SplineSubShape.paint?: {version:1, source:'stroke'|'custom', style?:ShapeStyle}`
isteğe bağlıdır. Parametrik output boyası, geometri yazımı sayılmadan
`Layer.splinePaintOverrides: {version:1, objects:{[stableObjectId]:ShapeStyle|null}}`
üzerinde tutulur; null açıkça source-stroke bağına dönmektir. Bu kayıtlar geçici
output kaybolsa da aç/kapat/Execute sırasında korunur. Bake ve runtime projection
boyayı normal Object paint'e işler; Bake/runtime çıktısından override map'i
kaldırılır. Eski spline'ların ortak compound fill/paint anlamı aynıdır.
`src/lib/spline/paint/objectPaint.ts` tek paint-group adapter'ıdır: eski Objects
bir compound grup, bağımsız bantlar kendi delikleriyle ayrı gruplar. Canvas ve
SVG aynı adapter'ı kullanır. Custom paint var olan ShapeStyle/image placement
şemasını kullanır; renderer/media demand, paint bounds, SVG asset hazırlığı,
RuntimeValidator, portable paint validation ve AssetIndex buna dahildir.
Clone/remap ve Bake normal Object kaydını korur. Runtime compiler stack'i normal
spline geometriye indirirken Object boyasını taşır; destek mevcut Chorono
renderer/runtime ve PNG/SVG yollarıdır. Eski runtime sürümlerine görünüm garantisi
verilmez. Edit/native metadata veya worker sınıfı scene JSON'a girmez.

Minimal saf hesap:

```ts
const chains = bandSelection(spline, 'object', selectedObjectIds)
const result = new SplineBandBackend().compute({
  data: spline, chains, settings: { ...defaultBandSettings, widthPx: 12 },
})
const edited = applySplineBand(spline, chains, result, false).data
// UI bunu doğrudan kaydetmez: bandPlan + native dispatch/Undo guard'larını kullanır.
```

Mesh dönüşümü geometride bant deliklerini mevcut triangulation akışına taşır;
Object başına custom paint materyallerinin tek Mesh görünümüne aktarılması bu
teslimde desteklenmez. Mesh mevcut ortak layer paint sözleşmesini kullanır.

## Doğrulama ve kalan genişletmeler

Doğrulama: **579 dosyada 4.167 test**, gerçek Chrome'da **7 kabul grubu**
geçti. TSC, MCP/CLI ve Next production build kontrolleri tamamlandı; dışa
aktarılmış PNG ve SVG ayrıca gerçek tarayıcıda görsel olarak incelendi.

Domain testleri analitik düz çizgi/rectangle alan ve sınırlarını, cap/join/
limitleri, delikleri, geniş bandı, dash seam/dots, Bézier doğruluğunu, kısmi Edge
ve seçilmemiş geometriyi doğrular. Integration testleri local TRS/origin,
locked/driven geometri, Undo/Redo/stale source, deterministic stack, custom boya,
portable load/clone/runtime ve SVG'yi kapsar. Tarayıcı kabulü gerçek worker,
SceneCanvas, panel/sağ tık, iptal, Edit dışı modifier, Properties ve PNG/SVG:

```sh
node scripts/perf/spline-band.mjs /tmp/chorono-spline-band-qa
node scripts/perf/serve.mjs /tmp/chorono-spline-band-qa 2021
# spline-band.html?autorun
```

Ayrı kalan v2 genişletmeleri: doğrulanmış Bézier fitting/fit-error ve kalıcı
source-segment provenance, ayarlanabilir corner/curvature weight/min-spacing,
ortak Stroke/Outline hazır-özel preset ve clipboard arayüzü. Tam v2 bunlar
uygulanıp doğrulanmadan tamamlandı sayılmaz. Variable Width ve zamanlı modifier
parametreleri mevcut Faz 2 planında ayrı işlerdir.
