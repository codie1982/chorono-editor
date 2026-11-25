# S2D-4 — kaynakları koruyan Boolean işlemi

## Kullanım ve kaynak sözleşmesi

Spline & Boolean panelinde 2–8 kapalı Shape/Spline katmanı veya aynı spline'ın
Object modunda alt objeleri seçilir. Preview Boolean → Union/Subtract/Intersect/XOR,
A−B/B−A, tolerans → **Apply Boolean**. **Cancel** hiçbir kaynak/history komutu
oluşturmaz. Grup, kaynak veya sonuç üzerinde sağ tık → **Edit Operation** aynı
paneli açar. İşlemi oluşturmak veya değiştirmek tek Undo/Redo adımıdır.

Apply, normal bir group ve sonuç spline çocuğu oluşturur. Özgün girdiler kendi
ID, geometry, style ve parametreleriyle grubun doğrudan çocukları olur. Sonuç A'nın
stilini/opacity değerini başlangıçta alır; farklı girdilerin dokularını ortak UV'ye
birleştirmez. Kısmen kullanılan spline'da seçilmeyen Objects kendi stil ve kimlikleriyle
çizilmeye devam eder. Kaynak JSON'unda tüketilen objeler de aynen durur.

- Girdiler görünür, kilitsiz, aynı parent altında araya başka kardeş girmeyen
  Shape/Spline'lardır. Aynı başlangıç/bitiş ömrünü paylaşırlar; child taşımazlar.
- Girdinin kendi key'leri (boş/muted track dahil), wire/binding/expression,
  constraint, mask/effect veya dış okuyucusu varsa Apply açıklamalı reddedilir.
  Ortak parent animasyonu ve ilgisiz kaynak/elle key'ler korunur.
- Girdi geometrisi statik olarak değiştirilebilir. Açık/bozuk/limit aşan geometri
  commit edilemez. Sonuç topology'si türetilmiştir; Point/Edge edit veya generated
  vertex key'i yerine Edit Operation kullanılır. Grup/sonuç transform ve style
  kanalları normal animasyon alır.
- Grup ve özgün girdiler aynı lifetime sözleşmesindedir. Bu sürümde grup lifetime'ını
  girdilerden bağımsız kırpmak desteklenmez. Değişmeyen outer transform/style serbesttir.
- Bütün grup **independent Copy** ile kopyalanır; recipe/input/result layer
  referansları remap edilir. Kısmi Copy, linked Instance, sıradan Ungroup veya
  tek protected child silme/reparent işlemi reddedilir. Bütün grup silinebilir ve Undo edilir.
- Nested Boolean ve bağımsız giriş animasyonlarını birleştirme desteklenmez.
  Editable-path materialization aşağıdaki Merge Paths komutuyla yapılır. Preview, Apply için uyumsuz bazı animated girişleri
  salt alan önizlemesi olarak gösterebilir; Apply tanısı ayrıca görünür.

## Add Spline ile ortak işlem ve Merge Paths

Add Spline içindeki Operation seçicisinde Union (varsayılan), Subtract,
Intersect ve Exclude/XOR bulunur. `+` açıldıktan sonra viewport veya Scene
Explorer'dan seçilen mevcut kapalı spline, aynı `prepareBooleanOperation`
recipe grubuna girer. A ilk hedef, kalan girdiler B'dir; Subtract A−union(B),
Intersect bütün girdilerin ortak alanı, XOR bütün girdilerin tek/çift paritesidir.
İşlem türünü sonradan değiştirmek tüm özgün girdilerden yeniden hesaplar.
Kesişim hesabı, hole/island/winding ve tolerans ayrı uygulanmaz:
`PolygonClippingBackend`, preview, conversion ve cold-load ile ortaktır.

`editor/boolean/pickOperation.ts` ilk pick'te mevcut planı oluşturur; sonraki
pick'ler aynı recipe'ye girdi ekler. Parent ve bitişik-kardeş stacking sınırları
korunur. Taşınmış owner'a girdi eklemek statik, TRS ile temsil edilebilen bir
reparent gerektirir; `branches/WorldPlacement.localTransform` kullanılır, shear
ve animasyonlu owner dönüşümü reddedilir. Her pick/tür değişimi bir Undo'dur.
Kaynak katman/vertex kimlikleri ve geometrileri korunur; yalnız parent/local
transform gerekli durumda dünya konumu korunarak değişir.

**Attach · keep contours** eski açık/kapalı contour ekleme davranışıdır; Boolean
alan işlemi değildir. Recipe varken Attach seçmek için önce Separate Inputs
kullanılır. Açık stroke'lar Boolean'a sessizce kapatılmaz.

**Merge Paths**, Add Spline ve mevcut Boolean panelinde aynı native
`makeMergeBooleanPathsCmd` komutunu çağırır. Yalnız seçilen recipe normal bir
group + düzenlenebilir sonuç spline'ına uygulanır. Sonuç ID/TRS/paint/animasyonu,
owner'ın outer animasyonu ve kısmen tüketilmeyen Objects korunur; tam tüketilen
girdiler kaldırılır. Diğer Boolean grupları recipe olarak kalır. Undo özgün
recipe ve girdileri aynen geri getirir.

Mevcut çözücü C/Q eğrileri kayıtlı toleransla örnekler. Merge sonucu gerçek spline
point/segment kayıtlarıdır fakat segmentler **doğrusaldır**; özgün Bézier kolları
birebir geri kurulmaz. Kaynak Bézier geometrisi Merge öncesi ve Undo'da korunur.
Delikler, ayrık alanlar ve geçerli boş sonuç korunur; convex hull uygulanmaz.

**Separate Inputs** aynı owner'ı normal group'a çevirir ve özgün girdileri yeniden
gösterir. Sonucun dış okuyucusu veya kendi animasyonu varsa bağlantı/key kaybını
önlemek için reddedilir. Merge ve Separate ayrı birer Undo/Redo'dur.
Bu iki yeni aksiyon UI/native komut girişleridir; MCP `spline_edit` Boolean
sözleşmesine eklenen yeni operation değeri yalnız `xor`'dur.

## Veri ve modüller (recipe)

`src/lib/types/booleanOperation.ts`: normal group'taki `booleanOperation` v1:
operation/reverse/tolerancePx, inputs `{layerId, subShapeId?}`, resultLayerId ve
sampling `[a,b,c,d]`. Sonuç child'ı `booleanResultFor` ile owner'ı belirtir;
source `spline` verisi **boş placeholder**'dır. Runtime nesnesi, Worker, Path2D,
çözülmüş yoğun path veya GPU buffer scene/Undo/session JSON'una yazılmaz.

`src/lib/editor/boolean/operationPlan.ts` native UI/komut adapter'ıdır. Örnek:

```ts
const draft = prepareBooleanOperation(scene, targets,
  { operation: 'union', reverse: false, tolerancePx: 0.25 }, timeMs, overrides)
const result = await executor.execute(draft.request, abortSignal)
// UI source/document/selection guard'larını da doğruladıktan sonra:
dispatchCommand(draft.command(result))
```

Komut exact-source compare-and-swap kullanır; arada elle edit olursa eski draft
uygulanmaz. UI ayrıca time/selection/document değişimini ve aktif drag'i kontrol
eder. Worker iptal/deadline sözleşmesi S2D-3 ile aynıdır; Cancel ve late reply
source/history'ye erişemez. Redo aynı ID ve recipe'yi kullanır.

`src/lib/geometry/boolean/layerOperand.ts` mevcut shape-to-path ve spline
adaptörünün tek sahibidir; preview ve persisted evaluation birlikte kullanır.
`polygonPathToSpline.ts` kapalı M/L/Z solver sonucunu deterministic yerel ID'lerle
normalized spline'a çevirir; C/Q ve açık çıktı reddedilir. Delik/island winding'i
korunur, eski vertex key'leri yeni vertex'e taşınmaz.

`src/lib/booleanOperations/validation.ts` ownership, static driver, lifetime ve
referans sınırıdır. `scene/references/assertLayerUnreferenced.ts` var olan Attach
okuyucu kontrolünden çıkarılan ortak konservatif ID-token tarayıcıdır. Source
name/provenance ve Timeline üyeliği okuyucu değildir; bilinmeyen semantic plugin
payload'ları güvenli tarafta kalmak için taranır. `assertLayerAncestors` mevcut
preview hierarchy kontrolünün ortak sahibidir.

`evaluateOperation.ts` yalnız statik owner-local girdileri hesaplar. Child TRS,
`geometry/layerTransformMatrix.ts` ortak anchored affine helper'ını kullanır.
Sampling lineeri Apply anındaki owner-world lineerinden alınır; tolerans o andaki
kompozisyon px ölçeğindedir. Translation clipping alanına sokulmaz. Sonuç inverse
sampling ile child-local'e döner. FPS/zoom ve sonraki outer animasyon geometry'yi
tekrar çözmez; kayıtlı sampling Edit Operation'da korunur.

`projectOperations.ts`, render-only snapshot üretir: tüketilen kaynaklar gizlenir,
kısmi kaynakların yalnız tüketilen contour'ları çıkarılır, generated spline sonucu
alır. Orijinal scene değişmez. `materializeRenderScene`, SceneCanvas geometry
snapshot'ı ve SVG aynı projection'ı kullanır. Font ve override projection'ları
runtime-only idempotence işaretini taşır; tekrar materialize sonucu gizlemez.

## Kaynak ömrü ve hata davranışı

Önbellek en çok **8 kayıt / tahmini 16 MiB** tutar (vertex başına konservatif
1 KiB, en az 1 KiB/kayıt). LRU eviction; source Layer referansları weak'tir.
Tek son projection da weak tutulur; her Undo snapshot'ı için yoğun ikinci bir
geometri geçmişi birikmez. `booleanGeometryCacheStatistics()` bu türetilmiş
bütçeyi bildirir; toplam tarayıcı/işlem RAM'i ölçümü değildir. Bu sayaç Resources
paneline yeni bir sistem RAM ölçümü olarak eklenmemiştir.

UI Apply, Worker sonucuyla cache'i önceden doldurur. **Cold load veya statik kaynak
editinde aynı bounded solver ana thread'de bir kez çalışabilir.** Bu bir GPU
backend veya sıfır stall garantisi değildir. Operands 8, commands/input vertices
2048, rings 64, contacts 4096, output vertices 8192 sınırları korunur. Ayrıca sahnede en çok 64 işlem / toplam 65.536
çözümlenmiş vertex (konservatif yaklaşık 64 MiB projection geometry) kabul edilir;
bu sınır LRU dışında canlı render snapshot'ının da büyümesini kısıtlar. Cache sahne
bırakıldığında en çok 16 MiB'lık türetilmiş veri tutabilir; `clearBooleanGeometryCache`
source/Undo değiştirmeden bırakır.

Viewport bozuk bir dış kaynakta fail-open ile orijinalleri gösterip sonucu gizler;
Edit Operation tanı verir. Commit ve output sınırları strict'tir: solver/schema
hatasında yanlış kaynakları veya boş bir başarılı export üretmezler.

## Kaydetme ve çıktı

Portable proje JSON, grup recipe'si + özgün girdiler + boş sonuç placeholder'ını
korur. `SceneJsonConverter`, normal command commit ve session reset ownership'i
kontrol eder. Kopyalama sonrasında remap edilmiş veri aynı doğrulamadan geçer.

Raster/sequence bütün composition'ı normal renderer ile çizer; viewport LOD/overlay
export'a aktarılmaz. SVG artık ordinary splines'ı da shared path converter ile
çizer; closed fill, evenodd/nonzero delikler ve open stroke ayrılır. Mevcut SVG
paint/effect/SMIL uyarıları geçerlidir; SVG tüm efektleri destekleme iddiası değildir.

RuntimeOptimizer, eski runtime JSON ve iki HTML output yolu recipe'yi ordinary
group/spline verisine çevirir, tam tüketilmiş kaynakları çıkarır ve Timeline
üyeliklerini temizler. Outer track'ler/partial remainders korunur. Mobil/native
player'ların bütün spline yetenekleri bu dilimde yeniden sertifikalanmamıştır;
consumer kendi format desteğini sağlamalıdır. Portable proje bu flatten işlemini
kullanmaz.

Dedicated Boolean MCP araçları eklenmez. `get_scene` recipe'yi okuyabilir; edit
source revision/readToken kuralları sürer. Ajanlar protected child'ı silerek veya
`combineMode` yazarak Apply taklit etmemeli; existing generic outer edit/whole
forest Copy sözleşmeleri kullanılır.

## Doğrulama girişleri

- `src/lib/editor/boolean/operationPlan.test.ts`: kaynak/recipe, parent animation,
  save/load, SVG/runtime/HTML, partial Objects/holes/empty, copy/instance/ref,
  stale result, tek Undo/Redo ve cache sınırı.
- `scripts/perf/boolean-preview.mjs`: gerçek Worker + production UI/SceneCanvas;
  Apply/Cancel/Edit Operation, kaynak/key/history, PNG ve viewport RGBA eşliği.
- `scripts/perf/editor-display.mjs`: gerçek EditorPage; dock ve üç edit menüsüne
  ek olarak Apply/Cancel, Layers Edit Operation, tek Undo/Redo.
- `npm test`, `npm run mcp:build`, `npm run build`; fixture/build öncesi Next durur.

Yerel kanıtlar: `artifacts/boolean-operation-20261115/` (Git'e eklenmez).

15 Kasım 2026 kabulü: 419 test dosyası / 3.307 test, hedefli Boolean 8 test,
TypeScript, MCP build ve production build başarılıdır. Gerçek Worker/viewport
paketinde 11; gerçek EditorPage paketinde 21 kabul kontrolü geçti. Viewport ve
final PNG RGBA verisi birebir eşleşti. Build'deki mevcut `applicationBuildInfo`
named `version` import uyarısı sürer. İnsan editörü 2012'de aynı session,
50 Undo / 0 Redo ile korundu. Raw tarayıcı logları ve ölçüm kapsamı
`validation.json` içinde açıkça kaydedildi.
