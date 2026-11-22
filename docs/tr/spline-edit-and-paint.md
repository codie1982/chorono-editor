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
