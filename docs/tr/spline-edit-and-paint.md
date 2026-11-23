# Spline Edit, Boolean ve görünüm sözleşmesi

22 Kasım 2026. Bu belge uygulanan davranışı açıklar; Outline v2 ayrı bir
[tasarım önerisidir](plans/spline-outline-band-v2-plan.md).

## Edit ve seçim

Seçili Spline veya Mesh üzerinde 1 Point, 2 Edge, 3 Object düzenleme modunu
başlatır/seviyesini değiştirir; aynı rakam modu kapatmaz. Mod düğmesine yeniden
basmak veya Done/Exit edit mode çıkış yapar. Form, modal, timeline ve özel araç
kapsamları kendi tuşlarını korur. `defaultBindings.ts` ve `useKeyboard.ts` tek
kısayol yönlendirme yoludur.

Spline mevcut alt seçim bankalarını kullanır. Mesh için
`geometry/mesh2d/selection/MeshComponentSelection.ts` canonical adjacency'den
kenarları ve tam parent/world affine üzerinden pick koordinatlarını üretir;
`useMeshViewportEditing` transient Point/Edge seçimlerini native drag/region
sahiplerine bağlar. Paylaşılan uç vertex yalnız bir kez değişir. Geometri yerel
px, pick toleransı composition/world px, overlay genişliği CSS px'tir.

Mesh Point/Edge ve Object hareketleri aynı aktif tail Edit Mesh modifier'ını
kullanır. `settings.vertexEdits` isteğe bağlı v1 uzantısı
`{topologyHash, offsets: [[vertexId, dx, dy], ...]}` taşır; offset'ler affine
sonrasında yerel px cinsindendir. Seçili vertex hareketi yalnız kendi offset'ini
artırır; Object hareketi affine'i biriktirir ve var olan offset'leri vektör olarak
dönüştürür. Hash/ID uyuşmazlığı, terslenen/çöken üçgen, ownership veya bütçe ihlali
atomik olarak reddedilir. Layer TRS, origin, UV ve bağlantı kimlikleri değişmez.
Her hareket ayrı Undo'dur. Exit/entry tail modifier'ı yeniden kullanır.

`GeometryEditGhost` entry anındaki sınırı, matrisi ve origin'i saklar; seçim
seviyesi veya geometri hareketi bu snapshot'ı değiştirmez. Exit/entry güncel
geometriyi yeni başlangıç yapar. Grid mesh'te saklı boundary ring yoksa mevcut
`Mesh2DBoundaryRingExtractor` kullanılır. Ghost source/history/export'a yazılmaz.

## Native spline araçları ve eski stack

Spline Edit panelinde seçim özellikleri, moda özel araçlar ve ortak transform
öndedir. Chamfer/Fillet Point, Offset Path Edge/Object aracıdır; panel ile sağ tık
menüsü `components/splineEdit/tools/splineEditTools.ts` admission tanımlarını
kullanır. Kaynak/Geçmiş kapalı gelir; eski dönüşüm/stack kayıtları orada korunur.
`legacySplineTool` descriptor işareti dört eski sınıfı yeni UI instance chooser'ından
çıkarır; evaluator, kayıt ID'leri ve programmatik uyumluluk davranışı değişmez.

Native Offset varsayılanı Replace'tir. Tam seçili contour'ları değiştirir;
Object kimliği/adı, seçilmemiş contour'lar/delikler, layer TRS ve paint korunur.
Keep source Append yapar. Kısmi Edge zinciri sessizce bütün contour'a genişletilmez;
bu teslimde tam contour seçimi gerekir. Inside/Outside aynı aracın Inset/Outset
seçenekleridir. Paralel kontur gerçek bant değildir; arayüzde Outline diye sunulmaz.

Headless `offset` operasyonu isteğe bağlı `resultMode: 'append'|'replace'` alır.
Omitted/append eski çağrıların fresh Object ekleme ve edge promotion davranışını
korur. Replace tam contour seçimi gerektirir ve native Edit'le aynı planner/solver'ı
kullanır. İkinci işlem pipeline'ı yoktur. Preview/Keep source/Cancel kaynak veya
Undo yazmaz; Apply bir komuttur. Kaldırılacak geometriye canlı referans varsa
sessiz ID eşleme yerine işlem reddedilir.

Eski stack sonucu doğrudan edit edilemiyorsa Apply to editable spline, mevcut
Bake komutunu açıkça çalıştırır ve aynı layer'da Object Edit'i odaklar. Bir Undo
eski stack ve sonucu geri getirir. Dosya açılışında veya drawer açarken otomatik
Bake yoktur. Sonraki araç teslimleri [native Edit planında](plans/spline-edit-native-tools-plan.md)
açıkça ayrı tutulur; tamamlanmamış komutlar UI'da çalışıyormuş gibi gösterilmez.

## Point ve Edge kesme/tangent araçları

Point modunda Break, Fuse, Reset Tangents ve Copy/Paste Tangents; Edge modunda
Split vardır. Panel ve sağ tık `splineComponentTools.ts` tanımlarından aynı
seçim/kilit/driver kurallarını üretir. Tümü `splineTopologyCommand` üzerinden tek
native komuta bağlanır; yeni modifier veya ayrı solver yoktur. Seçimsiz işlem
bütün spline'a genişlemez. Geometri değiştiren her uygulama ayrı Undo/Redo'dur.

- `spline/topology/cut.ts`: Break kapalı contour'u açar; açık contour'u aynı
  Object altında iki contour'a ayırır. Uçlar aynı konumda ama farklı ID'dedir.
  Eski ID gelen kenarda, yeni ID giden kenarda kalır. Giden kol kendi yeni ucuna
  aktarılır. Mevcut açık uçlarda Break reddedilir. Split exact De Casteljau
  insertion + aynı Break sahipliğini kullanır; doğru/kuadratik/kübik korunur.
- Split panelde varsayılan %50, değiştirilebilir `0<t<1` parametresidir; sağ tıkta
  tıklanan kenarın pick parametresidir. Çoklu panel seçimi bütün seçili kenarları
  aynı parametrede keser. Menü sadece tıklanan seçili kenarı keser. Arc length
  yüzdesi değildir; sonuçtaki iki kenar Edge modunda seçili kalır.
- `spline/edit/tangents.ts`: Fuse seçili anchor ve kollarını yerel aritmetik
  merkeze taşır, hiçbir kimliği/bağlantıyı birleştirmez. Reset komşu anchor
  chord'larının üçte birini kullanır: Smooth aynı eksende bağımsız uzunluk;
  Bézier kısa uzunlukla aynalı; Bézier Corner iki bağımsız yön; Corner kolsuz.
  Uçta eksik komşu karşı vektörden türetilir; çakışan noktalar sonlu kalır.
- Copy tek noktadan bağlantı tipi ve yerel px kol offset'lerini okur; Paste bir
  veya çok hedefte anchor konumunu korur. Quadratic komşular kol düzenlemesinden
  önce tam kübiğe yükseltilir. Kimlikler mümkün olduğunda korunur, seçilmemiş
  uçtaki eğri kontrolü değiştirilmez. Layer TRS/origin/paint bu işlemlere dahil olmaz.
- `useSplineTangentClipboard` belge sahibi geçici panodur. Panel/menu paylaşır;
  mod, layer ve seçim değişiminde yaşar, document AbortSignal değişince geçersizdir.
  Scene JSON/Undo/OS clipboard'a yazılmaz. Copy bu nedenle Undo eklemez.

Headless örnek: `operation: {kind:'topology', selection:{mode:'edge',ids:[edgeId]},
action:{kind:'split',t:0.35}}`. Point eylemleri `break`, `fuse`, `resetTangents`,
`pasteTangents` değerleridir. Paste açık `tangents:{type,in?:{x,y},out?:{x,y}}`
payload'ı alır; UI panosuna bağımlı değildir. Mevcut source CAS, kilit, canlı
referans ve driver kontrolleri aynen uygulanır. Save/load yalnız sonuç geometrisini
taşır. Özel tarayıcı kabulü: `scripts/perf/spline-point-tools.mjs`; eski topoloji
regresyonları `spline-topology.mjs` ile kontrol edilir, hazırlamada Next durdurulur.

## Trim ve Extend

Edge → Selection actions → Topology içindeki Trim/Extend bir sonraki viewport
tıklamasını bekler; aktif düğme, panel açıklaması ve viewport rozeti bunu gösterir.
Trim tıklanan kesişim aralığını siler; Extend terminal edge'in açık ucunu kullanır.
Tek edge'li açık contour'da yakın uç seçilir (`t<.5` başlangıç, diğer durumda son).
Sağ tık menüsü tıklanan edge/parametreyi aynı komuta gönderir. Çoklu seçimde yalnız
tıklanan contour/aralık veya açık uç etkilenir; diğer seçili parçalar değişmez.
Esc/Cancel, seçim/mod/layer/belge değişimi veya kaynak değişikliği bekleyen pick'i
iptal eder. Pick niyeti ve açıklamalar source, modifier stack veya Undo'ya yazılmaz.

`spline/topology/trim.ts`, aynı contour üzerindeki sıralı kesişimleri bulur;
silinen aralık birden fazla edge ve kapalı dikiş üzerinden geçebilir. Açık uçlar
ilk/son aralığın sınırıdır; gerçek kesişim yokken bütün path silinmez. Kesişimin
üzerine tıklamak belirsizdir ve reddedilir. `insertPointOnSegment` tam Bézier
parçalarını üretir; `deleteSplineEdges` bağımsız, sahipsiz vertex içermeyen
contour'ları aynı Object altında saklar. Tek kübikteki izole self-crossing de
iki ayrı parametre sınırı olarak hesaplanır. Seçilmemiş geometry ID'leri korunur.

`spline/topology/extend.ts`, açık ucun ilk sıfır olmayan kontrol yönünden terminal
teğetini bulur. `extendSplineContour` yalnız en yakın ileri kesişime bir düz edge
ekler. Orijinal eğri/anchor'lar, layer TRS/origin/paint ve hedef kenar değişmez;
hedefe weld veya Bézier polinomunu kontrolsüz extrapolate etme yoktur. Kesişim
yoksa aynı kaynak kimliği döner, görünür neden verilir ve Undo oluşmaz.

`editor/spline/edgeBoundaries.ts` aynı spline'ın kaynak edge'lerini ve diğer
görünür spline layer'larının değerlendirilmiş edge'lerini hedef layer'ın yerel px
alanında toplar. Tam parent affine, current frame, hidden ancestor ve görsel Solo
hesaba katılır. Kilitli hedefler salt okunur sınır olabilir; düzenlenen layer'ın
kilit/driver/instance/stack kısıtları mevcut native guard ile korunur. Basic Shape
ve Mesh hedefleri bu sözleşmeye dahil değildir. Başlangıç ve execute arasında
boundary snapshot veya timeline değişirse komut eski kesişimi uygulamaz.

`geometry/bezier/intersections.ts` çizgi/Q/C için Bernstein kök izolasyonu ve
tam De Casteljau hull bölmesini kullanır; korunan source eğriler düzleştirilmez.
Fillet ile interval matematiği ve Jacobian uniqueness hesabı ortaktır; sıfır
offset sorgusu da aynı polynomial intersection yoluna gider. Line/curve teğet
kökleri desteklenir. İki eğrinin tekil teğet teması, çakışık/retrace sınırlar ve
çözülemeyen yakın kökler tahmin edilmez; bütün edit kaynakta iz bırakmadan reddedilir.
Residual toleransı yerel `1e-7 px`, parameter dedup `1e-7`; formal directed-rounding
sertifikası değildir. Trim en fazla 256 contour edge / 2.048 boundary / 65.536
broad-phase çift / 2.048 örtüşen çift / 60.000 subdivision cell kabul eder; tek
pair en fazla 12.000 cell, derinlik 48. Büyük iş sessizce eksiltilmeden reddedilir.

Headless örnek: `operation:{kind:'topology',selection:{mode:'edge',ids:[edgeId]},
action:{kind:'trim',edgeId,t:.35}}`; Extend için `kind:'extend'` ve uç yakınındaki
`t` verilir. Her uygulama native tek komuttur. Domain, scene/transform/stale input,
MCP plan/apply/Undo ve panel/menu/picker adapter testleri vardır. DOM sunum testleri
gerçek tarayıcı piksel kontrolü olarak raporlanmaz.

## Spline Boolean & Paths

Edit içindeki Union/Subtract/Intersect/XOR düğmeleri mevcut ortak Boolean
komutlarını ve solver'ı kullanır. Varsayılan **Non-Destructive kapalıdır**:
seçili Objects → canonical solve → parent collapse → seçili edit edilebilir
Spline, tek Undo. `editor/boolean/materializeSplineBoolean.ts` bu akışın domain
adapter'ıdır. Eski `makeMergeBooleanPathsCmd` API'sinin group/result sözleşmesi
korunur; UI yeni parent collapse komutunu kullanır. Parent ID/TRS/outer animation
korunur, generated child kaldırılır. Tüketilmeyen Objects sıradan sibling olarak
kalır; tükenen boş kaynaklar kaldırılır. Kaybolacak animation/reader bağlantısı
veya reparent edilemeyen placement sessizce atılmaz, işlem reddedilir.

`+` aktif işlemle sonraki viewport veya Scene Explorer pick'ini uygular ve yeni
sonuç üzerinde devam eder. Kaynak konturlar entry/apply anındaki soluk kesikli
ghost, çözülen dış sınır belirgin turuncudur. Kaynak iç kenarları sonuç sanılmaz.

Non-Destructive açıkken kaynakları tutan recipe korunur. Kaynak düzenlemesi
sonucu tekrar hesaplar. Merge Paths parent'ın kendisini edit edilebilir Spline'a
indirger; Separate Inputs kaynakları geri açar. Explicit Boolean Preview ve
scripting API mevcut non-destructive sözleşmesini korur.

Compound Path seçili (seçim yoksa tüm) Objects'i tek Object'e toplar, exact
Bézier/contour kayıtlarını korur, layer fillRule'ünü evenodd yapar. Fill rule
layer düzeyindedir; seçilmemiş konturlar da bu kurala uyar. Separate Paths mevcut
`separateSplineElements` sınıflandırıcısıyla adaları ayrı Objects yapar, her
adaya ait delikleri birlikte tutar. Bu, retained recipe Separate Inputs'ten
farklıdır. Boolean sonucu mevcut tolerance ile örneklenir; Undo özgün Bézier
kayıtlarını geri getirir. Bu işlem exact Bézier curve Boolean iddiasında bulunmaz.

## Properties: Fill ve Stroke

Görünüm yalnız Properties'tedir; Edit geometri/modifier ayarları içindir.
`SplinePaintControls`/`SplineStrokeControls` aynı source style üzerinde native
Undo yapar. No Fill/Solid/Linear/Radial/Angle/Reflected/Diamond/Pattern ve Image
seçenekleri vardır. Pattern mevcut ImagePaint v1 + `repeat:true` ile temsil
edilir; yeni asset deposu/decoder eklenmez. Stop opacity 0–100, color alpha ve
fill opacity ile çarpılır. Inactive gradient/image/dash payload'ları saklanır.
Gradient açıları mevcut 0° sağa/90° aşağı sözleşmesini korur.

Stroke None/Solid/Gradient/Pattern, opacity/width, Solid/Dashed/Dotted,
Inside/Center/Outside, caps/corners ve özel dash dizisi sunar. Eski dashArray,
dashEnabled yoksa aktiftir; false diziyi kaybetmeden kapatır. Odd dash dizileri
Canvas kuralıyla tekrarlanır; negatif, non-finite, tümü sıfır veya 256'dan fazla
öğe reddedilir. Dotted round caps kullanır. Açık veya açık/kapalı karışık
contour'lar Center kullanır.

`drawSplineStroke` kapalı Inside için gerçek fill-rule clip, Outside için
budgeted SurfacePool üzerinde izole maske kullanır. No Fill/alpha/delikler
altındaki katmanları silmez. Lease her yolda finally ile bırakılır. Mesh'in
gerçek boundary paint'i aynı adapter'a gider; internal triangulation kenarları
stroke değildir. `gradientStops` Canvas/SVG için tek stop/alpha/reflection
hazırlığıdır. Diamond dört parça doğrusal paint ile çizilir; cache 16 MiB/8entry,
2s idle, global bütçeye bağlı ve 2048px/side sınırındadır. Bu sınır texture
çözünürlüğünü etkiler, kaynak geometriyi değiştirmez.

SVG Inside/Outside clip/mask üretir. Diamond native linear quadrants kullanır.
SVG'nin taşınabilir conic primitive'i olmadığından Angle **720 vektör sektörle
yaklaşık** çıkar ve exporter bunu uyarır; PNG/sequence native sürekli conic'tir.
Pattern asset demand, AssetIndex, runtime validation, portable save ve shared
paint schema üzerinden izlenir. Dense bitmap/cache/runtime sınıfları JSON'a girmez.
Preset/custom preset/copy-paste ve Outline'ın bağımsız band paint'i bu sürümde
uygulanmış değildir; Outline v2 planında açıkça sıralanmıştır.

## Doğrulama ve giriş noktaları

Saf testler materialization/Undo/reader guards, path islands/holes, Mesh
vertex-offset bileşimi/topoloji ve paint/schema round-trip'ini kapsar. Gerçek UI
kabul sayfaları normal editor/hooks/renderer/exporter'ı kullanır, bağlı kullanıcı
sahnesini değiştirmez:

```
node scripts/perf/spline-tools.mjs /tmp/chorono-tools-qa
node scripts/perf/spline-edit.mjs /tmp/chorono-edit-qa
node scripts/perf/spline-attach.mjs /tmp/chorono-boolean-qa
node scripts/perf/image-paint.mjs /tmp/chorono-paint-qa
node scripts/perf/serve.mjs /tmp/chorono-paint-qa 2021
```

Hazırlama ve `npm test`, `npm run mcp:build`, `npm run cli:build`, `npm run build`
Next durdurulmuşken çalıştırılır. Native kontroller 1/2/3 ve input ownership,
Point/Edge gesture, ghost re-entry, Boolean+Explorer+Undo ve gerçek PNG/SVG
piksel karşılaştırmalarını içerir. Büyük eski host dosyaları bu değişiklikte
küçük adapter bağlantıları alır; yeni matematik, paint ve UI sahiplikleri ayrı
cohesive modüllerde kalır; repository genelinde rewrite yapılmaz.
