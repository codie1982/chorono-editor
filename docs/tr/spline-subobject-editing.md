# S2D-0/1/2 — Spline alt obje düzenleme ve compound edit

## 22 Kasım 2026 — Edit paneli ve viewport görünümü

Point / Edge / Object düğmeleri toggle'dır: aynı düğmeye yeniden basmak layer
moduna döndürür; başka bir düğme seçili alt-geometri seviyesini değiştirir.
Edit modunda bounding frame, köşe resize/rotate ve root pivot gizmo'ları gizlenir.
Spline'in gerçek konturları/hole sınırları hafif turuncudur; seçili point/edge
kırmızıdır. Viewport **SPLINE EDIT · Point / Edge / Object** etiketi ve turuncu
pressed düğme aktif seviyeyi belirtir. Çıkışta normal layer frame geri gelir.
Mod, araç veya pan değişimi yarım gesture'ı iptal eder; source preview commit olmaz.

Edit dock sırası: mode düğmeleri → **Spline modifiers / + Add modifiers** →
seçili işlemin ayarları → seçim özellikleri. Liste Offset, Outline, Chamfer,
Fillet içerir. Mesh'te ayrı **Mesh modifiers** listesi mevcut Deformation Clip'i
sunar; Texture/Pins/Geometry modifier diye yeniden adlandırılmaz. Add seçimi
Preview/Apply ayarlarını açar, tek başına source/history yazmaz. Genel canlı
procedural modifier stack'i uygulanmış gibi gösterilmez. Native Chamfer/Fillet
ve Offset mevcut worker controller'larını kullanır; ikinci owner oluşturulmaz.

Edit dock'unda Convert, yinelenen Source sekmesi ve ayrı Create Mesh2D düğmesi
yoktur. Dönüşüm sağ tıktadır; kaydedilen conversion stage'leri **Conversion history**
altında ayrı tutulur. Mesh ayarı onay ikonu ve son stage kaldırma çöp kutusu ilgili
satırdadır. Önce downstream Mesh kalkmadan Spline stage'i kaldırılamaz.

Selection actions ve Add to this Spline ileri bölümleri gerektiğinde
açılır. Klavye Delete tüm seviyelerde aynı `splineTopologyCommand` sahibini kullanır;
root layer veya yanlış seviyenin elemanları silinmez. Mode bank, Undo ve export
sözleşmeleri aşağıdaki kaynak uygulamayla aynıdır.


15 Kasım 2026. Tek bir mevcut spline katmanında üç alt seçim seviyesi ve bunlara
bağlı Spline & Boolean paneli/viewport/sağ tık davranışı uygulanmıştır. Source formatı
`SplinePathData` değişmez; yeni layer, Timeline veya modifier sistemi eklenmez.

## Kullanım ve kapsam

Bir spline seçin. **Edit** dock panelindeki Edit mode bölümünden **Point**, **Edge**
veya **Object** seçin; seçili spline'a çift tıklamak ve Pen aracı Point seviyesine
giriş yapar. Viewport, Layers ve Scene Explorer sağ tık menülerinde
**Edit Mode → Point / Edge / Object** bulunur. Menü seçimi aynı paneli öne
getirir. **Done** veya **Edit Mode → Layer mode** dış katman araçlarına döner.
Genel Properties ayrı kalır. Panel taşınabilir/kapatılabilir; mevcut kapalı veya
eski layout'ta Edit Mode paneli yeniden açar. Tab değiştirmek mode/ID bankalarını,
Boolean önizlemesini, kaynak veya Undo/Redo'yu değiştirmez.

| Mod | Seçim ve edit paneli |
| --- | --- |
| Point | Nokta/handle; tek seçimde yerel X/Y, tip ve kollar, çoklu seçimde ortak nokta tipi. Mevcut point/handle move, çoklu nokta translation ve ok tuşları kullanılır. |
| Edge | Segment; Line / Curve (cubic), tek seçimde uç ID'leri ve örneklenmiş yerel uzunluk. Sağ tıkta mevcut Insert Point ve segment tip komutları. |
| Object | Scene child layer değil `SplineSubShape`; donut gibi birden çok kontur birlikte seçilir/vurgulanır. Ad, kind/source, kontur durumu ve mevcut Open/Close/Reverse komutları. Küçük obje listesi çakışan objeleri adla seçtirir. |

Plain click değiştirir; Shift/Ctrl/Cmd seçilen öğeyi ekler/çıkarır, Alt çıkarır.
Boş alandan region drag yalnız aktif seviyeyi seçer; Box/Lasso/Circle/Paint ve
Inside/Touching tercihleri mevcut viewport araçlarından gelir. Modlar kendi
geçerli ID seçimlerini korur. Boş click yalnız alt seçimi temizler. Escape önce
menü/gesture, sonra alt seçim, sonra edit bağlamı, ardından katman seçimini
kapatır. Pan kaynak geometriyi değiştirmez. Mode/layer/document değişikliği eski
gesture/ID'leri yeni kaynağa uygulamaz.

Edge/Object taşıma/döndürme/ölçekleme ve Auto Close, S2D-1 ile uygulanmıştır.
S2D-2 toplu topoloji, Attach/Detach/Copy ve Join/Connect/Weld araçlarını ekler.
S2D-3 [Boolean önizleme](boolean-preview.md) kaynakları değiştirmeden kapalı
Shape/Spline/Object alanlarını hesaplar. S2D-4 [kalıcı Apply/recipe ve işlem düzenlemeyi](boolean-operation.md) ekler.
Edge/Object Delete kök katmana sızmaz; açıklama verir. Alt obje ok/transform
araçları kaynak noktaları düzenler; Done ile dış katman araçlarına dönülür. Mevcut nokta silme korumalı komutla
korunur. Detaylı sonraki işler [spline planındadır](plans/spline-2d-operations-plan.md).

## Sorumluluklar ve giriş noktaları

### S2D-5B: Offset / Outline

Edge veya Object seçip mevcut panelde Offset / Outline'ı açın. Açık Left/Right/
Both, kapalı Inside/Outside; kompozisyon px mesafe, miter/bevel/round birleşim,
önizleme, Cancel ve tek Apply/Undo vardır. Kaynaklar korunur; yeni düzenlenebilir
Object'ler eklenir. Worker, kalite/bütçe, hole/winding ve animasyon sınırları
[Spline Outline belgesinde](spline-outline.md) açıklanmıştır. Bu araç static
geometri üretir; canlı modifier veya Point Chamfer/Fillet değildir.

### S2D-5A: spline vertex snap ve çizerek Connect

Snap → Move → **Spline Vertices** açıkken Add Line'ı aktif spline'ın açık ucuna
tıklayarak başlatın. Diğer açık uca tıklamak çizimi tamamlar ve mevcut Connect
topolojisini kullanır; araya normal noktalar konabilir. İki uygun kontur tek
kontura birleşir; aynı konturun iki ucu kapanır. Her bağlantı tek Undo'dur.
Başka layer veya kapalı/iç vertex'e snap yalnız koordinatı yakalar; geometriyi
otomatik Attach/Weld etmez. Auto Close'dan bağımsızdır. Ana/parent transform
animasyonları korunur; keyed/locked spline topolojisi açıklamayla reddedilir.

`prepareSceneSnapContext(..., includeSplineVertices=true)` değerlendirilmiş
anchor'ları bir kez hazırlar. `SnapEngine.resolvePoint` en yakın tam vertex'i
ortak CSS-pixel radius içinde öncelikli alır; `nearestSplineVertex` axis'leri
karıştırmaz. `useSplineDrawing` endpoint ID'lerini gesture boyunca tutar;
`splineDrawingCommand` tam parent inverse, `extendSplineContour`,
`connectSplineEndpoints` ve `splineEditCommand` korumalarını tekrar kullanır.
Scene/JSON/MCP formatı değişmez. Offset/Chamfer/Fillet kapsamları
[planda](plans/spline-2d-operations-plan.md#s2d-5--vertex-snap-çizerek-bağlama-ve-sınırlı-köşeoutline-araçları) ayrıdır.

Test girişleri: `src/lib/snap/splineVertexSnap.test.ts`,
`src/components/splineEdit/drawing/drawingCommand.test.ts` ve gerçek SceneCanvas
kabulü için `node scripts/perf/spline-connections.mjs artifacts/spline-connections`.
Native kabul bağımsız origin ve private source kullanır; kullanıcı oturumuna yazmaz.

- `src/lib/spline/selection/state.ts`: değişmez mod bankaları, stable ID sırası,
  duplicate temizliği ve source'a göre prune. React/scene mutation/native nesne yok.
- `selection/geometry.ts`: Point/Edge/Object pick, alt obje path adaptörü ve tek
  edge path. Mevcut hit-test, fillRule/delik ve spline-to-path converter kullanılır.
- `selection/region.ts`: PathSampler ve mevcut selection/crossing matematiği.
  Dünya koordinatında 32 curve subdivision ile yaklaşık seçim; ayrı konturlar
  arasında sahte edge üretmez. Click fill picker mevcut 16 örnek politikasını korur.
- `edit/moveSplinePoints.ts`: mevcut single-point helper üzerinden her point ve
  kendi handle'larını bir kez çevirir; iki ucu birlikte taşınan quadratic edge'in
  kontrolü de çevrilir. Topoloji/ID'ler değişmez; authoring guard caller'a aittir.
- `edit/authoringGuard.ts`: önceden canvas içinde olan driver politikası ortak
  native adapter'lar için buraya alınmıştır; eski canvas import'u re-export ile
  korunur. Key/wire/expression sahipleri ve kilitli point/handle'lar korunur.
- `components/splineEdit/useSplineEditSelection.ts`: layer ID + document AbortSignal
  kapsamlı geçici UI sahibi. Prune render'da hemen uygulanır ve cleanup commit
  edilir; Undo stale seçimi kendiliğinden canlandırmaz. Persist edilmez.
- `useSplineViewportEditing.ts`: moda özel input/keyboard/menu adaptörü; geometri
  çizimi veya ikinci pointer lifecycle'ı kurmaz. Point drag mevcut CanvasDragSession,
  region drag mevcut SelectionRegionSession üzerinden çalışır.
- `commands.ts`: mevcut native source üstünde küçük immutable komut; source spline
  kimliği, edit uygunluğu ve driver'lar execute sırasında tekrar doğrulanır. Aradaki
  ilgisiz layer metadata'sı korunur. Guard reddinde source/history yazılmaz.
- `SplineEditInspector`, `SplineModeControls`, `SplineEditMenu`: paylaşılan controller
  ile seçim odaklı UI. Eski PointInspector opsiyonel guarded adoption alır; eski
  standalone çağrılar korunur. `SplineEditOverlay` yalnız aktif seviyeyi çizer.
- `src/app/page.tsx` controller'ı bir kez üretir; SceneCanvas ve Spline & Boolean aynı
  nesneyi kullanır. Embedded SceneCanvas için opsiyonel controller/fallback vardır.

UI kodu kontrolcüden aldığı IDs'leri okur, native komutla source'a yazar. Seçim,
hover, menu veya gesture sınıfları source JSON, undo snapshot veya runtime/export
paketine eklenmez. Yeni decoded asset/cache/GPU sahipliği yoktur.

## Koordinat, animasyon ve history sözleşmesi

Pick ve region query değerlendirilmiş **dünya/kompozisyon px** spline'ını alır;
source noktalarının değerini world pose ile değiştirmez. Click toleransı CSS
radius / zoom'dur. Point drag, başlangıçtaki tam parent inverse matrisiyle delta'yı
**layer-local px** alanına çevirir. Uzunluk yerel örneklenmiş uzunluktur; dış
non-uniform scale buna eklenmez. Overlay stroke/node ölçüleri CSS px'te sabittir.

Bir Point drag final pointer-up koordinatını örnekler ve tek source Undo verir.
Escape, mode değişimi ve stale source/document kendi preview'ını iptal eder;
başka komutun değişikliklerini geri sarmaz. Normal seçim/mod değişimi Undo yazmaz.
Nokta/handle koordinatları key veya başka driver'a aitse source edit reddedilir;
kullanıcı Timeline'dan düzenlemeye devam edebilir. Topoloji yazımı daha geniş
coordinate ownership/kilit kontrolü yapar. Metadata rename key'leri değiştirmez.
Mevcut animasyon ID, zaman, easing, actor kayıtları ve serialized spline payload'u
seçim işlemlerinden etkilenmez. Genel primitive regeneration/parametrik dönüşüm
ve yeni topoloji araçları S2D-1/2'ye aittir; bu dilim var olan mutations kullanır.

## Minimal native embedding

```tsx
const edit = useSplineEditSelection(selectedLayer, editor.getDocumentSignal())
<SceneCanvas {...canvasProps} splineEdit={edit} />
<SplineEditInspector layer={selectedLayer} controller={edit}
  getScene={editor.getScene} dispatchCommand={editor.dispatchCommand} />
```

Tek spline seçimi dışında controller'a null verin. CanvasProps gerçek frame,
parent scene, selection, pan ve editor kaynaklarını içerir. Source burada
fixture ile değiştirilmez; örnek bir public MCP yöntemi ilan etmez.

## Doğrulama

`selection.test.ts`: mode bankaları/prune, dönüştürülmüş picking, bütün region
stilleri, donut delikleri, SubShape aidiyeti, canonical cubic ve quadratic hareket.
`components/splineEdit/commands.test.ts`: keys/transform korunması, stale/driver/
lock reddi, metadata merge ve tek Undo/Redo. Eski canvas geometry testleri sürer.

Next kapalıyken `node scripts/perf/spline-edit.mjs /private/tmp/chorono-s2d0-qa`
hazırlanır; `node scripts/perf/serve.mjs /private/tmp/chorono-s2d0-qa 4356` üzerinden
spline-edit.html açılıp Run spline edit checks çalıştırılır. Gerçek React inspector,
viewport, keyboard, pointer/region owner ve PNG decoder kullanılır; kullanıcı
sahnesi yüklenmez. `layer-selection.mjs` tam EditorPage'i ayrıca Add/drag → modlar →
Properties/viewport → tek Undo akışında test eder. Source manifest ve görsel
kanıtlar ilgili ignored artifacts dizininde tutulur.


## S2D-1 — aynı katmanda üretim ve dönüşüm

- **Edit açıkken Add → Spline Objects** veya Spline & Boolean → **Add to this spline**,
  aynı katmana yeni bir `SplineSubShape` ekler. İlk objenin ID'si ve tüm eski
  kayıtları korunur. Çakışan adlara sayı eklenir. Done sonrasında normal Add,
  seçili spline olsa bile ayrı katman oluşturur. Geometri tamamlanana kadar source
  yazılmaz. Yeni objeye seçim odağı, source commit sonrası verilir.
- **Continue selected endpoint**, Point modunda yalnız bir açık konturun kilitsiz
  başlangıç/son ucu seçiliyken açılır. Başlangıçtan devam, yeni noktaları ters sırayla
  başa ekler; mevcut yön/segmentler/handle'lar korunur. Diğer konturlarla otomatik
  Join/Weld yapılmaz. Enter açık bitirir; sağ tık Auto Close tercihine göre kapatır veya açık bırakır.
- **Auto Close** varsayılan açık, yerel tarayıcı tercihidir (`chorono.spline-drawing.v1`).
  Yeni Line aracı seçildiğinde, henüz katman seçimi/ilk nokta yokken de ayrı
  Spline & Boolean panelindeki Draw Line bölümünde görünür. Açıkken sağ tık,
  farenin konumundan bağımsız olarak son yerleştirilen anchor'ı ilk/opposite
  anchor'a bağlar; imlecin konumuna yeni nokta eklenmez. En az üç anchor gerekir;
  iki noktalı line açık kalır, tek noktalı draft kaynak oluşturmaz. Enter açık
  bitirir. Escape de yerleştirilmiş noktaları açık Line olarak kaydeder ve araçtan
  çıkar; tek nokta kaynak/history oluşturmaz. Başlangıç/opposite uç noktasının
  10 CSS px yakınına tıklamak, Auto Close açıkken kapanış preview'si ve
  tek kapanış segmenti üretir. Zoom'a bağlı dünya toleransı kullanılır; çift
  endpoint veya sıfır uzunluklu kenar yazılmaz. Auto Close kapalıyken başlangıca
  dönüş ve başka spline anchor'ına snap çizimi bitirmez; noktalar eklenmeye devam
  eder. Esc/Enter veya sağ tık açık Line olarak kaydedip araçtan çıkarır. Açıkça
  kaydedilmiş kullanıcı tercihi korunur; eksik/bozuk storage varsayılanı true'dur.
- Auto Close açıkken kapalı circle/spline'ın snap ile alınmış başka bir anchor'ına ulaşmak çizimi
  tamamlar. Kapalı eğri değiştirilmez; aynı spline'a ayrı, açık Line Object
  eklenir. Yalnız açık uçlar mevcut native Join komutuyla topolojik bağlanır;
  kapalı circle'a branch/weld veya görünmez kapatma yayı uydurulmaz.
- Esc ve canvas/pasteboard sağ tık yalnız güncel yerleştirilmiş Line'ı bitirir;
  önceki Line Objects kalır. Her bitiş tek Undo/Redo'dur. Backspace son geçici
  anchor'ı siler. Box primitive iptali, mode/document değişimi ve stale revision/
  time korumaları geçici draft'ı temizlemeyi sürdürür; kalıcı kaynakları silmez.
- **Move / Rotate / Scale** araçları aktif seçili alt geometriyi sürükler. Point,
  Edge veya Object, aynı benzersiz anchor kümesine çözülür. Delikli objenin tüm
  konturları ve bağlı Bézier handle'ları birlikte dönüşür. İki ucu seçilmiş explicit
  quadratic kontroller de dönüşür. Ortak anchor yalnız bir kez işlenir. Rotate/Scale
  yerel anchor sınır kutusu merkezini kullanır; viewport Scale uniform, Properties
  X/Y ölçekleri bağımsızdır. Pozitif ölçek, yerel piksel ve saat yönünde derece
  sözleşmesi vardır. Shift ile sürüklenen rotation 15° adım kullanır.
- Spline & Boolean → **Selection transform · local**, delta X/Y, derece, yüzde X/Y ve
  **Apply selection transform** içerir. Apply tek Undo'dur. Oklar 1 yerel px,
  Shift+oklar 10 px taşır. Dış layer transform ve keyler değişmez. Katılımcı
  koordinatlarda key/wire/expression/kilit varsa source edit açıklamayla reddedilir;
  başka alt objenin koordinat animasyonu korunur.
- **Fill / Stroke**, yalnızca **Properties** panelinde düzenlenir; Edit içinde
  Appearance bölümü tekrarlanmaz. Yeni açık/kapalı spline'lar Fill None ve
  görünür stroke ile oluşur; dolgu isteğe bağlıdır. Fill None/Color/Gradient/Image;
  Stroke None/Color/Gradient ve width birbirinden bağımsızdır. Paylaşılan katman
  stilidir; alt obje başına material değildir. Fill yalnız kapalı konturları,
  stroke açık/kapalı konturları çizer. None, pasif payload ve keyleri silmez.
  Image mevcut Assets'ten seçilir ve mevcut image paint yerleştirme aracı kullanılır.
  Canlı/driven style verisi source üzerinden ezilmez.

### Teknik sahiplik ve veri akışı

`page.tsx` çizim başlatırken target ID ve opsiyonel Continue endpoint'ini ayrı
intent olarak yakalar. `useSplineDrawing` preview/world koordinatlarını tutar;
`drawing/drawingCommand.ts` görüntülenen tam parent inverse ile yerel kaynağa
çevirir. `appendSplineObjects` yalnız yeni ID'leri birleştirir, çakışmayı açık hata
olarak reddeder; generator UID sözleşmesi korunur. `splineEditCommand` tek Undo ve
execute anında source identity/driver denetimini sağlar. Revision/document/time
uyuşmazlığında çizim commit edilmez. Tool/intent değişikliği draft'ı iptal eder.

`selection/transformSelection.ts` seçim çözümü/pivot/affine edit domain'idir.
Var olan `geometry/transformSplineData` opsiyonel anchor kümesiyle genişletildi;
parametre verilmezse eski bütün-geometri sözleşmesi sürer. `SplineGeometryDrag`
aynı `CanvasDragSession` ve `commitCanvasDrag` akışına katılır. Box çizimi de
`PointerGestureSession` capture-phase terminal olaylarını kullanır: son up örneği,
kaçan capture fallback'i, cancel/Escape ve native teardown tek sahibin işidir.
Geçici geometri, seçim ve native owner source/Undo JSON'una yazılmaz.

Minimal kullanım: spline seç → Object → Add to this spline: rectangle → viewport'ta
sürükle → yeni obje seçilir → Move/Rotate/Scale veya yerel Apply → Undo. Açık line
çiz → Point → uç seç → Continue → noktalar → Enter. Done dış katmana geri döner.

Kabul: `node scripts/perf/spline-edit.mjs artifacts/spline-s2d1-20261115` ile 20
native grup; `node scripts/perf/editor-display.mjs artifacts/spline-s2d1-20261115`
ile tam EditorPage regresyonları ve Add/edit/Done/tek Undo entegrasyonu. Tarayıcı
fixture'ları kullanıcı scene/localStorage'ından ayrı QA origin'inde çalışır.


15 Kasım S2D-1 doğrulaması: 408 dosya / 3.249 test; MCP ve production derlemeleri
geçti. Native spline kabulü 20 grup, tam EditorPage kabulü 15 kontrol geçti.
Mevcut `applicationBuildInfo` named `version` import uyarısı sürer. Kanıtlar
ignored `artifacts/spline-s2d1-20261115/` altında tutulur. Kaynak formatında yeni
alan veya migration yoktur; native UI eklentileri MCP capability ilanı değildir.


## S2D-2 — temel topoloji

Spline & Boolean içindeki açılır **Topology · Point/Edge/Object** bölümü ileri ayarları
aynı panelde toplar. Sağ tık aktif modun uygun işlemlerini gösterir. Yeni detay
penceresi, çalışma modu, Timeline veya serialized seçim alanı yoktur.

| Mod | Araç ve davranış |
| --- | --- |
| Point | İki açık uç için **Join / Connect endpoints** düz köprü ekler; aynı konturun uçları kapanır. **Weld endpoints**, composition px toleransı içinde ikinci ucu ilk seçilen uçla birleştirir; ilk ID/konum korunur. Kollar bağımsız `bezierCorner` eklemine aktarılır. |
| Edge | **Refine position (%)** seçili edge'leri normalize parametre `t` konumunda böler; sağ tık **Insert Point** hit-test parametresini kullanır. **Divide parts**, 2–64 eşit parametre parçası üretir; eşit yay uzunluğu değildir. Mevcut De Casteljau hesabı tekrar kullanılır. |
| Object | **Copy objects**, yerel X/Y offset ile aynı katmanda bağımsız alt objeler üretir. Yeni geometri ID'leri ve adları ayrıdır; delikler birlikte kopyalanır. Ctrl/Cmd+D bu işlemdir. **Detach to new layer**, seçili objeleri aynı parent altında bağımsız kardeş katmana taşır. **Attach layer**, başka uygun spline katmanını aktif katmana alır. |

Delete/Backspace artık Point'te noktaları, Edge'de kenarları, Object'te alt objeleri
siler. Point Delete mevcut iki komşuyu **düz edge** ile birleştirme sözleşmesini
korur; kalan iki noktalı konturun noktası silinirse kontur kaldırılır. Edge Delete
köprü çizmez; kapalı konturu açar ve gerekli bağımsız açık koşulara böler. Yeni
kontur IDs dışında kalan edge/point IDs korunur. Bütün alt objeler silinse bile
kök spline katmanı kalır. Sonuçtaki orphan point/handle/segment ve boş Object'ler
silinir; source şema validatörü connectivity/order/ownership'i doğrular.

### Transfer ve animasyon sınırları

- Her işlem tek Undo/Redo'dur. Nokta/handle/segment koordinat key, controller,
  expression, binding veya wire sahipliğinde topoloji değişimi açıklamayla
  reddedilir. Dış konum/rotation/opacity animasyonları yerel topoloji için korunur.
- Silinen ID'yi okuyan wire/expression/controller/scene payload'ı varsa referans
  sessizce silinmez veya başka noktaya bağlanmaz; işlem reddedilir. Tarihsel
  `scene.authoring` kayıtları canlı referans sayılmaz. Ancestor lock/freeze/hidden,
  missing/cyclic parent ve instance kaynak sınırları korunur.
- **Detach**, mevcut `prepareCloneForest` sözleşmesiyle dış Timeline track/key ve
  ilgili presentation kaynağını çoğaltır; key IDs collision-safe yenilenir, zamanlar
  değişmez. Seçili geometri IDs yeni katmana taşınır. Kaynakta diğer objeler ve
  eski keyler kalır. Child layer, geometriye ait constant input recipe veya desteklenmeyen binding graph'ı varsa işlem
  reddedilir. Ayrı katman compositing'i kendi paint/opacity/effect sırasına sahiptir;
  bu işlem bir Boolean veya piksel bake değildir.
- **Attach**, kaynak katmanı kaldırıp geometriyi `targetWorld.inverse × sourceWorld`
  ile aktif katmanın yereline çevirir. Aktif katmanın ID ve ortak paint'i korunur;
  kaynak paint'i onunla değiştirilir ve UI bunu açıklar. Incoming ID çakışmaları
  tüm point/handle/segment/contour/Object referanslarında remap edilir. İlk aktif
  objelerin IDs değişmez. Bir Undo iki eski katmanı tam geri getirir.
- Attach v1 statik ve referanssız kaynak içindir: transform zincirinde key/live
  driver, source animasyonu/referansı, farklı start/end aralığı, child layer, opacity/effect/mask, interaktif
  davranış veya live presentation varsa açıklamalı ret verir. Kaynağa özel ancestor
  opacity/effect/mask de kaybedilmez; ortak ancestor sunumu yerinde kalır. Source
  ve hedef paint'ini birleştiren otomatik material sistemi yoktur.
- Join/Weld farklı alt objelerde yalnız single-contour objeleri birleştirir; hole
  ownership belirsizse reddedilir. Aynı objenin açık konturları bağlanabilir.
  Tolerans composition px'dir; zoom/FPS değiştirmez. Otomatik proximity weld yoktur.
- Divide source başına mevcut **10.000 point/edge** bütçesini aşmadan önce reddedilir;
  büyük bölme işlemleri parçalara ayrılmalıdır. Yeni kayıtlar normal, bounded
  Undo source verisidir; DOM/GPU handle veya per-frame yoğun tampon eklenmez.

### Ortak modül sahipliği ve bakım

`src/lib/spline/topology/` geometri domain'idir: `records` subset/orphan temizliği,
`remap` fresh/collision kimlik converter'ı, `connect` açık uç birleştirme,
`edges` bölme/silme, `objects` copy/delete ve `validation` ownership/locks/edited
metadata denetimlerini içerir. Hesaplar React veya transport kullanmaz. Native UI
ile script aynı validation/remove-contour implementation'ını kullanır; eski
`script/api/splineHandleData.ts` path'i script-safe boundary adaptörü olarak kalır.

`src/lib/editor/spline/` native source command/CAS/referans/transfer orchestration'ıdır.
Eski `components/splineEdit/commands.ts` public import'u uyumlu re-export'tur;
yetkili komut artık UI dizinine bağımlı değildir. `useSplineTopologyActions`,
Spline & Boolean paneli ve viewport menüsünde güncel source'u okur, bir komut dispatch eder ve
commit sonrası geçerli result IDs'ye odaklanır. Seçim/draft ayarları JSON'a yazılmaz.

Scripting/MCP'nin mevcut `splitSegment`, `removePoint`, `removeContour`,
`removeSubShape`, `setContourClosed`, `reverseContour` API'leri korunur. Native
Attach/Detach/Connect/Weld düğmeleri yeni bir MCP tool veya script method ilanı
anlamına gelmez; bilinmeyen API adı üretmeyin.

Minimal akış: spline → Edge → kenar seç → Topology → Divide parts: 3 → Divide →
Undo. Object → obje seç → Ctrl+D veya Detach. İki açık uç → Point → Shift ile ikinci
uç → Topology → Connect; yakın uçlarda toleransı ayarlayıp Weld.

Kabul girişleri: `scripts/perf/spline-topology.mjs` yeni transfer/topoloji UI'sını;
`scripts/perf/spline-edit.mjs` önceki 20 regresyon grubunu;
`scripts/perf/editor-display.mjs` gerçek EditorPage'i test eder. Ortak disposable
fixture `components/splineEdit/__tests__/splineHarness.tsx` içindedir. Bölme geometrisi
analitik olarak kontrol edilir. Canvas2D redundant line-joint antialiasing'i için
çıktı kontrolü yalnız bölünen kenarın 3 px yakınında en fazla 8 piksel, en fazla
128/255 kanal farkı ve tüm karede ortalama <0.002 byte fark sınırı kullanır. Son
örnekte 3 kenar pikseli / maksimum 57 kanal farkı ölçülmüştür; seçim overlay eşliği
ayrı testte bit düzeyinde aynı kalır. Boolean önizleme ve recipe/apply bu dilime
katılmamıştır.


15 Kasım S2D-2 son kabulü: **412 dosya / 3.274 test**, TypeScript, MCP build ve
production build geçti. Native topoloji 9 grup (biri raster-AA ölçümü), önceki
spline 20 grup, tam EditorPage 15 kontrol geçti. Build'deki mevcut
`applicationBuildInfo` named `version` import uyarısı değişmedi. Kanıtlar ignored
`artifacts/spline-s2d2-20261115/` dizinindedir.

Detach'ta gradient/image paint'in bounds'e bağlı yerleşimi yeni katmanın
sınırlarıyla yeniden hesaplanır; ayrı katman compositing'i de yeniden değerlendirilir.
Bu dilim Object başına baked UV/material veya bütün efektlerde bit düzeyinde
piksel eşliği vaat etmez. Source paint ayarları ve outer animasyonlar korunur.

Entegrasyon uyumluluğu: KeyboardShortcutsPanel legend dizileri literal context
tiplerini korur; cameraGesture yalnız var olan sayısal orthoHeight payload'ını
ölçekler ve eski kamera kaynağına zorunlu alan eklemez. Bunlar tip/uyumluluk
düzeltmeleridir; S2D-2 yeni 3D editör kapsamı açmaz.


## Ayrı dock paneli — 15 Kasım 2026

`src/components/splineEdit/SplineToolsPanel.tsx`, mevcut SplineEditInspector ve
BooleanPreviewControls bileşenlerini tek scroll alanında taşır. State ve worker
sahipliği page üzerinde kalır; paneli kapatmak veya taşımak yeni seçim/history
sistemi kurmaz. Genel Properties her zaman ayrı katman alanıdır.

`buildSplineEditModeMenu` ve `SPLINE_EDIT_MODES`, panel düğmeleri ile viewport,
Layers ve Scene Explorer için ortak mod adlarını/işleyicilerini sağlar. Modlar
Point/Edge/Object'tir. Menünün Layer mode seçeneği mevcut edit bağlamından çıkar.
Listeden henüz seçili olmayan bir hedef için page, yeni layer controller'ı
adopt edildikten sonra `SplineEditRequest` uygular; eski katmanın bankasına
mode/key yazılmaz. Source JSON, manuel animasyon ve Undo/Redo değişmez.

Yeni dock id'si `splineTools`, başlığı **Spline & Boolean**. Varsayılan sağ
kolonda Properties yanındadır. Eski kayıtlı layout'ta id bulunmasa da layout
korunur; spline seçimi / Edit Mode / Boolean preview paneli yakındaki Properties
leaf'ine ekleyip açar. Daha önce taşınmış panel kendi konumunda açılır. Menüden
kapatılan panel Panels menüsünden de geri açılabilir.

Kabul: `buildSplineEditModeMenu.test.ts`, dock layout ve Explorer menu testleri;
`checkSplineToolsPanel.ts` gerçek EditorPage, Layers/viewport/Explorer menüleri,
Point/Edge/Object, kapat/geri aç, Properties ayrımı, native Boolean worker ve
source/history eşliğini sınar. Standalone full-editor hazırlığı Next'in worker
URL'sini yalnız test artifact'ında `boolean-worker.js` olarak paketler; hesap
ve worker kaynakları production ile aynıdır ve digest'leri kaydedilir.

Panel düzenlemesinin tam test kabulü: 417 dosya / 3.293 test; TypeScript, MCP
build ve production build başarılı. Boolean paketinin default ESM/CommonJS
adaptörü düzeltildi; önceden bulunan applicationBuildInfo named-version uyarısı
sürer. UI kabul kanıtları artifacts/spline-tools-panel-20261115 altında yereldir.

### S2D-5C: Chamfer

Point modunda köşeleri seçip **Chamfer → Preview Chamfer** açın. Mesafeyi
composition px olarak ayarlayıp Apply ile tek Undo adımında uygulayın; Cancel
kaynağı değiştirmez. Line/quadratic/cubic parçaları eğri olarak kalır.
[Sayısal sınırlar ve animasyon/ID koruması](spline-chamfer.md).

### S2D-5D: Fillet

Point modunda keskin köşeleri seçip **Fillet → Preview Fillet** açın. Radius
composition px olarak ölçülür; Apply tek Undo, Cancel kaynak/history yazmadan
çalışır. Yeni yay komşu eğrilere teğettir; sığmayan veya belirsiz yarıçap
açıklamayla reddedilir. [Kullanım ve sınırlar](spline-fillet.md).


### 22 Kasım — gerçek modifier stack ile düzenleme sınırı

Edit panelindeki **Add modifiers** artık ayrı kalıcı örnekler oluşturur. Her
örnek kendi şema/varsayılan/doğrulamasını taşır. Ayarlar taslakta bekler; Execute
özgün kaynaktan bütün zinciri çalıştırıp yalnız son sonucu tek Undo ile uygular.
Etkin Offset/Outline/Chamfer/Fillet çıktısı üretilen geometridir; doğrudan nokta
düzenlemek için adımları kapatın veya Bake stack kullanın. Conversion-only
Spline'da nokta düzenlemeleri Convert Spline adımının authored override'ına
yazılır; açık Rebuild bunları sıfırlar. Viewport edit-mode renkleri ve seçim
bankası korunur. Eski context-menu worker Preview/Apply araçları ayrı tek seferlik
araçlardır ve generated-result yazma korumasını paylaşır.

Genel taban geometriye bağlı değildir; Spline/Mesh sözleşmeleri ayrı geometri
adaptöründedir. [Modifier mimarisi ve genişletme örneği](../../src/lib/modifiers/README.md).
