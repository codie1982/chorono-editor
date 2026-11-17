# Spline edit: Point / Edge / Object ve sınırlı 2D işlemleri

15 Kasım 2026. Bu belge aşamalı geliştirme planıdır; uygulama durumu aşağıda ayrıdır. Boolean
ve yeni modifier desteği bu belgeyle uygulanmış ilan edilmez. Devam eden Image/None paint
teslimi önce tamamlanır. Ana iş sırası ve Poly/3D öncelikleri değiştirilmez.
Kullanıcının ilettiği 3ds Max araç listesi işlev referansıdır; Chorono'nun mevcut
kapasitesi veya bütün listeyi 2D'de uygulama taahhüdü değildir.

## Uygulama durumu

**S2D-0 uygulandı:** Point/Edge/Object edit bağlamı, UI-only ayrı seçim bankaları,
mode-specific viewport/Properties/sağ tık, region seçim ve güvenli Escape/Delete
sahipliği. Teknik sözleşme ve test girişleri [spline edit belgesindedir](../spline-subobject-editing.md).
Mevcut Point drag/inspector ve temel contour/segment komutları tekrar kullanılır.
**S2D-1 uygulandı:** Edit'te Add aynı katmana yeni SubShape ekler; Continue yalnız
seçili açık ucu uzatır. Yerel çoklu alt obje move/rotate/scale, Auto Close ve ortak
katman Fill/Stroke bağımsızlığı tamamlandı. **S2D-2 uygulandı:** Attach/Detach/Copy, açık uç Join/Connect/Weld,
Refine/Divide ve üç modda Delete ortak source komutlarına bağlandı. Dinamik veya
referanslı transferler açıklamayla reddedilir. **S2D-3 uygulandı:** kapalı Shape,
Spline ve Object girdileri için sınırlı worker tabanlı Boolean önizleme. Kaynak,
key, geçmiş ve export değişmez. [Teknik sözleşme](../boolean-preview.md).
Kalıcı recipe / Apply / Cancel **S2D-4** ile uygulandı. Vertex snap ve çizerek
Connect **S2D-5A**, statik Offset / Outline **S2D-5B** olarak uygulandı;
Chamfer **S2D-5C** ve Fillet **S2D-5D** uygulandı.

## Nesne ve düzenleme modeli

Tek bir `type:'spline'` katmanı altında birden çok **spline alt objesi** bulunur.
Bunlar bugünkü `SplinePathData.subShapes` / `SplineSubShape` kayıtlarına karşılık
gelir. Yeni scene layer/parent-child taklidi veya ikinci spline veri modeli
kurulmaz. Alt obje bir veya birden çok kontur içerebilir: Donut dış çevre ve
deliğiyle tek alt objedir; iki bağımsız çizim iki alt objedir.

```text
Spline Layer — dış transform, stil ve mevcut layer animasyonları
├─ Object A (SubShape ID)
│  └─ Contour → Point ID'leri + Edge/Segment ID'leri + Handle ID'leri
└─ Object B (SubShape ID)
   └─ Contour → Point ID'leri + Edge/Segment ID'leri + Handle ID'leri
```

**Edit sırasında Add ile ikinci spline eklemek**, aktif katmana yeni Object B
oluşturur. Object A da bağımsız kimliğini, adını ve seçim sınırını korur.
Yeni çizim otomatik weld/union edilmez. S2D-5A'da yalnız Vertex snap ile açık
uçtan başlayan Add Line aynı katmandaki diğer açık uca çizerek bağlanabilir;
bu, açık bir Connect niyetidir ve bağımsız çizimler için geçerli değildir.
Katmanın dışındayken Add yeni layer
oluşturma davranışını korur. `Continue` seçili açık uçtan mevcut konturu uzatır;
`Join/Connect` iki uygun açık ucu bağlar. Bu işlemler Add/Attach ile karışmaz.

### Üç modun sahipliği

| Mod | Ne seçilir? | Inspector ve araçların hedefi |
| --- | --- | --- |
| **Point** | Nokta ve ona ait in/out Bézier kolları; tek veya çoklu nokta | Yerel X/Y, Corner / Smooth / Bezier / Bezier Corner, kollar, kilit ve nokta işlemleri. Sadece seçili noktalar ve etkilenen bağlı segmentler değişir. |
| **Edge (Segment)** | İki nokta arasındaki düz/eğrisel segment; tek veya çoklu segment | Line/Curve, uç kimlikleri, salt okunur uzunluk, Refine/Divide ve segment işlemleri. Dönüştürmede ortak uç/handle yalnız bir kez işlenir. |
| **Object (Sub-spline)** | Bir alt objenin bütün konturları, noktaları, segmentleri ve kolları | Adı, kaynak/primitive bilgisi, açık/kapalı durumu, yönü; Move/Rotate/Scale, Copy/Detach/Attach ve uygun kapalı objelerde Boolean. Diğer alt objeler korunur. |

Katmanın tümünün dış transform, opacity, fill/stroke ve animasyonu standart
layer Properties alanında kalır. Object modundaki hareket, yalnız seçili
SubShape'in yerel geometri koordinatlarına uygulanır; root layer transform'unu
hareket ettirmez. İlk dilimde her SubShape için yeni bir transform/paint/Timeline
sistemi açılmaz. Fill/stroke katman ortak stilidir ve panel bunu açıkça belirtir.
Ayrı alt obje materyalleri ancak sürümlü bir material diliminde ele alınır.

Parametrik primitive nokta/edge/obje geometri düzenlemesi gördüğünde
`editable/source` sözleşmesi korunur; generatorParams sessizce yeniden hesaplanıp
elle düzenlenmiş noktaları ezmez. Yeniden Generate, kayıpları açıklayan ayrı bir
gelecek işlemidir. Mevcut `smooth` collinear ve farklı uzunluklu kollar;
`bezier` simetrik kollar sözleşmesine sahiptir. Referans listedeki isimlerden
hareketle bu davranışlar değiştirilmez; Auto Smooth ayrı değerlendirilir.

## UI — aynı viewport ve Properties içinde

- Spline düzenlemeye mevcut akışla girilir. Küçük **Point | Edge | Object**
  segment kontrolü yalnız bu bağlamda görünür; Properties, seçime göre uygun
  inspector bölümünü gösterir. 2D şekiller için yeni detay penceresi açılmaz.
- Viewport'ta modun seçilebilir öğeleri belirgindir. Point modunda noktalar ve
  kollar, Edge'de hover edilen/selected segment, Object'te ilgili alt objenin
  bütün konturu vurgulanır. Pasif mod öğeleri mouse olayını yakalamaz.
- Object modunda çakışan alt objeleri adlarıyla seçebilmek için Properties içinde
  küçük bir alt obje listesi bulunur; Scene Explorer'a yeni child layer yazılmaz.
- Shift/Ctrl/Cmd ve mevcut region selection sözleşmeleri yeniden kullanılır;
  Point/Edge/Object kendi ID seçim kümesine sahiptir. Mod değiştirmek geometri
  veya Undo yazmaz, geçersiz/eski ID'ler seçimi başka objeye taşımaz.
- Sağ tık yalnız aktif modun uygulanabilir işlemlerini sunar. Delete, Point'te
  noktaları, Edge'de segmentleri, Object'te alt objeleri hedefler; root katmanı
  yanlışlıkla silmez. Boş alana tıklama alt seçimi temizler. Escape sırasıyla
  açık menü/gesture'ı, alt seçimi ve edit bağlamını kapatır; Pan düzenleme yapmaz.
- Mevcut X/Y/rotation/scale ve ortak pivot/snap araçları kullanılır. Alt seçim
  dönüşümünde parent-local koordinatlar, farklı zoom ve dönüşmüş parent korunur.
- Sürükleme preview'ı source'u her hareket için kalıcılaştırmaz; final pointer-up
  son koordinatı örnekleyip tek Undo yapar. Cancel/Escape source'u geri getirir.

## Fill, stroke-only çizim ve Auto Close

**Fill ve Stroke bağımsızdır.** Mevcut layer style sözleşmesi kullanılır:
Fill None / Color / Gradient / desteklenen Image; Stroke None / Color / Gradient.
Point/Edge düzenlemesi bu değerleri otomatik silmez. Object modunda kapalı
konturların alanı dolabilir; açık Line/eğri, Fill None + etkin Stroke ile yalnız
çizgi olarak kullanılabilir. Fill + Stroke ve Fill-only de geçerlidir.

Açık kontur renderer tarafından dolu görünmek için gizlice kapatılmaz. Aynı spline
katmanında kapalı ve açık konturlar birlikte varsa yalnız kapalı olanlar fill
alır; etkin stroke her iki türde çizilir. `closed`, görünümden bağımsız topoloji
bilgisidir: Fill'i None yapmak konturu açmaz, Stroke'u None yapmak noktaları
silmez. Delikler mevcut nonzero/evenodd fillRule sözleşmesiyle korunur. İlk ortak
stil bütün alt objelere aittir; ayrı alt obje fill materyali bu dilimin parçası
değildir.

Çizim bağlamında küçük bir **Auto Close** checkbox'ı eklenir:

- Yeni kurulumda kapalıdır; kullanıcı kapatmadıkça açık çizim beklenmedik şekilde
  kapanmaz. Çizim tercihi mevcut workspace preference mekanizmasında saklanır;
  geometri JSON'unda yalnız sonuç contour.closed ve gerçek kapanış segmenti olur.
- Açık olduğunda son nokta başlangıç yakalama alanına girdiğinde kapanacak kenar
  kesikli önizleme/işaretle gösterilir. Bitirme sırasında yalnız aktif kontur
  kapanır. Eşik ekran/CSS pikselinde tanımlanıp mevcut koordinat adapter'ıyla
  hesaplanır; pan/zoom/parent dönüşümünde pointer ile eşleşir.
- Auto Close açıkken başlangıca tıklama, Object → Close ve aynı konturun iki ucunda Point → Connect işlemleri kullanılabilir;
  Auto Close kapalı olmak bu açık komutları devre dışı bırakmaz. Başlangıçtan
  uzakta Enter açık bitirir; sağ tık Auto Close açıksa son anchor ile ilkini bağlar,
  kapalıysa açık bitirir. Henüz katman seçilmemiş yeni Line çiziminde de tercih
  Spline & Boolean panelinde görünür. Escape iptal eder.
- Tek nokta veya iki uçlu düz line'a sıfır alanlı dolgu uydurulmaz; geçerli
  kapanış/alan oluşturabilen kontur kontrolü gerekir. Özellikle düz çizimlerde
  üç farklı, aynı doğru üzerinde olmayan nokta sınanır; eğri kapanışında geçerli
  eğrisel alan ayrı değerlendirilir. Kapanış kenarı seçilen line/curve türünü ve
  uç handle sözleşmesini korur.
- Başka Object'e yaklaşmak Auto Close değildir; Attach/Join/Weld ayrı işlemdir.
  Yeni bir kapanışta duplicate endpoint/orphan handle üretilmez; preview Undo
  yazmaz, bitirme bir kaynak komutu ve tek Undo oluşturur.

Bugünkü `drawSplineLayer`, kapalı konturlara fill ve tüm konturlara stroke uygular;
`useSplineDrawing` Enter/sağ tık ile açık bitirme ve ilk noktaya tıklayarak kapatma
akışını içerir. Yeni iş fill motorunu baştan kurmak değil, bu davranışları üç moda
bağlamak ve **kullanıcı kontrollü Auto Close tercihi + önizleme** eklemektir.

## Kodda bugün olanlar — tekrar kullanılacak temel

- `src/lib/types/spline.ts`: normalized subShapes, contours, points, handles ve
  segments; stable kimlikler ve point/segment türleri mevcut.
- `src/components/SplinePointInspector.tsx`: tek seçili noktanın tip, konum ve
  handle düzenlemesi; üç mod ve çoklu alt obje inspector'ı henüz yok.
- `src/components/SplineEditOverlay.tsx`: point/handle ve segment hover çizimi;
  mevcut seçim `selectedPointId` ile sınırlı, Object/çoklu mod altyapısı değil.
- `src/lib/spline/edit/mutations.ts`: point/handle move, point type, line/cubic,
  eğriyi koruyan Refine, point Delete, Close ve Reverse yardımcıları mevcut.
  Bunların varlığı bütün listelenen araçların UI'da tamamlandığını göstermez.
- `src/lib/spline/edit/extendSplineContour.ts`: mevcut devam çizimi genişletilir.
- `src/lib/spline/factory/appendSplinePrimitiveToLayer.ts` ve `mergeSplineData`
  kayıtları birleştirir; uç Join veya geometri Union yapmaz. Generator dışı mevcut
  veriyi Attach ederken ID çakışması kontrol/remap gerekir; yalnız spread yetmez.
- `src/lib/spline/creation/placeSplineInLayer.ts`: dünya/yerel yerleştirme ve
  dönüştürülmüş parent hesabı tekrar yazılmaz.
- `SplineCombineMode` add/subtract/intersect/exclude adları içerir;
  `splineToPathDefinition` bunları gerçek Boolean çözücüsü olarak değerlendirmez.
  Fill-rule ile boşluk oluşması, doğrulanmış Boolean topolojisi sayılmaz.

## Referans araçların modlara ve kapsama dağılımı

| Seviye | Temel 2D edit diliminde | Genişletme / 3D detay alanında daha sonra |
| --- | --- | --- |
| **Oluşturma** | Var olan Line, Rectangle, Circle/Ellipse, Arc, Donut, NGon, Star üreticileri; Edit'te Add → yeni SubShape, Continue → mevcut kontur. Desteklenen üretici kontrol edilmeden bütün enumlar UI'ya konmaz. | Freehand, Text outline, Egg, planar Spiral, Helix, 3D Section; her biri ayrı doğrulanan üretici dilimi. Gerçek 3D helix, 2D metadata adından türetilmez. |
| **Point** | Corner/Smooth/Bezier/Bezier Corner, Move/Rotate/Scale, Refine, Delete, açık uç Connect, kontrollü Weld, Chamfer ve Fillet; mevcut yardımcıları genişletme. | Automatic Welding, Fuse, Break, Make First, Tangent Copy/Paste, Bind/Unbind. Weld eşik/preview; Bind bağımlılık döngüsü ayrıca tasarlanır. |
| **Edge / Segment** | Line/Curve, Move/Rotate/Scale, Refine, Divide, Delete, Copy/Detach; paylaşılan uçlar/topoloji korunur. | Break, Connect Copy, per-segment Material ID. Stil/UV sözleşmesi olmadan boş material alanı açılmaz. |
| **Object / Sub-spline** | Create Line/Add, Attach/Attach Multiple, Detach, Close, Reverse, Copy/Mirror; kapalı girişlerde Union/Subtract/Intersect preview ve Apply/Cancel. | Outline/Outline Center, Trim/Extend, Cross Section, Explode ve ayrıntılı modifier sırası. Planar offset ile 3D surface üretimi aynı araç sayılmaz. |
| **Seçim/kalite** | Üç modda çoklu/alan seçimi; mevcut hit-test ve toleranslar; gerekli basit nokta numarası görünümü. | Soft Selection/Area falloff ortak seçim planıyla; Steps/Adaptive/Optimize ölçümlü kalite kontrolü. Soft Selection bu dilimde öne çekilmez. |
| **Render kesiti / yüzey** | Mevcut 2D stroke/fill ve görünürlük kullanılır. | Enable in Renderer/Viewport, Radial/Rectangular kesit, Thickness/Sides/Angle, Generate Mapping Coordinates ve yüzey Auto Smooth, 3D içerik üretimi kapsamında. |

Referanstaki bütün araçlar tek sürümde uygulanmaz. **2D için önce ortak edit
mekanizması ve temel araçlar; ayrıntılı modelleme/modifier yığını 3D detayda.**
Gelecek 3D workspace veya GameEngine'i etkinleştiren yeni bağımlılık kurulmaz.

## Yapım sırası ve kabul sınırları

| Dilim | Sonuç | Tamamlanma şartı |
| --- | --- | --- |
| **S2D-0 — Edit bağlamı** | Point/Edge/Object seçim durumu, viewport vurgusu, moda özel Properties/sağ tık. | Tek/çoklu/region seçim; mode switch, Escape/Delete/Pan; hatalı ID temizliği; source/key değişmezliği. |
| **S2D-1 — Compound edit · tamamlandı** | Edit'te Add yeni alt obje; Continue açık kontur; Fill/Stroke bağımsızlığı ve Auto Close; mevcut point/segment edit ve bütün SubShape dönüşümleri. | İlk objenin kimliği korunur; açık stroke-only/kapalı fill ve Auto Close açık/kapalı sınanır; donut delikleri birlikte taşınır; ortak uçlar bir kez işlenir; parent-local eşlik ve tek Undo. |
| **S2D-2 — Temel topoloji · tamamlandı** | Attach/Detach/Copy, Join/Connect/Weld, Close/Reverse, Refine/Divide/Delete. | ID çakışması remap; orphan segment/handle yok; açık/kapalı düzen doğrulanır; eski key/ref korunur veya güvenli açıklamalı ret. |
| **S2D-3 — Boolean preview · tamamlandı** | Kapalı Shape/Spline/SubShape için Union/Subtract/Intersect; aktif giriş ve A−B/B−A sırası görünür. | Açık veya bozuk giriş reddi, hole/winding/teğet/dejenere durumlar; preview source/key değiştirmez. |
| **S2D-4 — Apply ve işlem düzenleme · tamamlandı** | Sürümlü recipe + korunan kaynaklar; Apply/Cancel ve sağ tık Edit operation; tek Undo. | Clone/instance/referans, bounds/hit-test, portable save/load, viewport/export eşliği. Bake to editable path ayrı açık işlemdir. |

S2D-0 ve S2D-1 ortak temel önceliğidir; Boolean'ı önce ekleyip seçim/edit
modelini sonradan yamamak hedeflenmez. Ayrıntılı gelecek araçlar bu kabul
paketlerinden ve ana plandaki 3D/Poly sırasından bağımsızca etkinleştirilmez.

## Hesaplama, animasyon ve source koruma

Ortak `Matrix2D`/path converter ile girişler tek alana alınır, sonuç hedef
parent-local koordinatlara döner. Yakın uçlar kullanıcı seçimi olmadan weld
edilmez; tolerans kompozisyon pikselindedir, zoom/FPS sonucu değiştirmez.
Eğri düzleştirme gerekirse tolerans ve yaklaşım kaybı kaydedilir. Kontur/delik
yönü, sıfır alan, çakışan/teğet kenar ve küçük parçalar doğrulanır. Mevcut veya
güvenilir çözücü araştırılmadan yeni genel algoritma yazılmaz.

Topoloji değişikliklerinde nokta/segment hedefli eski key'ler incelenir. Silinen
ID'ye başka bir noktayı sessizce atamak, bağımsız iki animated layer'ı tek dış
transform'a indirmek veya variable-topology Boolean sonucuna eski vertex ID/key
aktarmak yasaktır. Kaynaklar/track'ler korunur; uyumsuz animasyonlu giriş için
ilk dilimde açıklamalı ret uygulanır. Değişmeyen stable ID'ler korunur; zorunlu
remap bütün ilgili referanslara atomik uygulanır ve diagnostics döner.

Basic Shape girişleri mevcut shape-to-path converter'ı kullanır. İlk Boolean
sonucu tek layer fill/stroke alır (varsayılan aktif girişin stili); farklı
resimleri otomatik ortak UV'ye birleştirdiği varsayılmaz. Kaynak stilleri saklanır.

Selection/hover/gesture state source JSON ve Undo snapshot'ına konmaz. Serialized
işlem verisi sürümlü recipe, operation, input/subshape ID'leri ve toleranstır;
yoğun frame geometri, runtime sınıfı veya GPU tamponları içermez. Kaynak girişler
silinir/değişirse sessiz bağlama yoktur; cycle/referans hatası açıklanır. Renderer,
bounds, hit-test ve export aynı değerlendirilmiş sonucu kullanır.

## Modül sınırları ve 3D ile paylaşım

Önerilen sınırlar: spline edit selection/context, saf alt seçim dönüşümleri,
topoloji mutations/validation, converter, Boolean recipe değerlendirmesi ve
UI/history adapter'ı. Yeni public API isimleri implementation sırasında mevcut
`src/lib/spline` public sözleşmeleri incelenerek belirlenir; bu belge API ilanı
değildir. Mevcut PointInspector/Overlay genişletilir, paralel editör kurulmaz.

Kontur, connectivity, curve örnekleme, tolerans ve doğrulama paylaşılabilir.
2D affine ve 3D matrix/projection; planar Boolean ve hacimsel mesh Boolean ayrı
sözleşmelerdir. 3D detay editörü aynı edit prensiplerini uygun 3D koordinat ve
render adapter'ıyla kullanır. Extrude/Revolve, UV/material, rig veya fizik
araçları yalnızca bu üç modun eklenmesiyle tamamlanmış sayılmaz.

## Doğrulama

Her dilimde saf algoritma invariants + mevcut caller testleri + gerçek UI kabulü:
mode/çoklu/boş seçim, donut/subShape aidiyeti, mixed açık/kapalı fill-stroke,
Auto Close açık/kapalı ve pan/zoom altındaki eşik, mod-özel Delete, final pointer-up,
Cancel/tek Undo/Redo, transformed parent, stable/remapped ID'ler, source key JSON
eşliği, eski save/load, bounds/hit-test ve temsilî viewport/export piksel eşliği.
Geometri/ref kaybı ile source'u sessizce değiştiren başarılı görünüm kabul edilmez.

## S2D-4 uygulama sınırı — 15 Kasım 2026

Normal group üzerinde `booleanOperation` v1, özgün kaynak çocuklar ve boş
`spline` sonuç çocuğu kullanılır; yeni layer türü yoktur. Apply/Cancel, sağ tık
Edit Operation ve tek Undo uygulanır. Yerel kaynak ID/geometry/style ve parent
animasyonu korunur. Dinamik girdiler, dış okuyucular, farklı parent veya araya
başka kardeş giren seçim açıklamalı reddedilir. Kaynakların ömürleri eşittir.
Bağımsız Copy bütün ağacı remap eder; linked Instance / kısmi Copy desteklenmez.
Üretilen vertex'ler key hedefi değildir; outer transform/style animasyonu sürer.
Bake to editable path bu teslimin parçası değildir. Ayrıntı:
[Boolean recipe ve lifecycle](../boolean-operation.md). Sonraki ana plan
öncelikleri değiştirilmez; daha büyük 2D/3D modelleme dilimleri ayrıca onaylanır.

## S2D-5 — Vertex snap, çizerek bağlama ve sınırlı köşe/outline araçları

16 Kasım 2026. Kullanıcı kabul örneği: Circle'ın bir çeyrek edge'ini sil →
açık yayı içeri offset et → karşılıklı iki uç çiftini çizerek bağla → tek kapalı
kontur elde et → seçili köşeleri pahla/yuvarlat. Bu akış 2D spline topolojisidir;
Poly yüzü, extrusion veya yeni 3D workspace gerektirmez. Her paketin uygulama
durumu ayrıdır; 5A/5B/5C/5D uygulanmıştır; sınırlar ilgili teslim belgelerindedir.

### S2D-5A — Vertex snap ve açık uçları çizerek birleştirme

**Uygulandı — 16 Kasım 2026.** Teknik sözleşme ve test girişleri
[spline düzenleme belgesindedir](../spline-subobject-editing.md#s2d-5a-spline-vertex-snap-ve-çizerek-connect).

- Snap → Move içinde bağımsız **Spline Vertices** checkbox. Ortak master ve
  screen-px radius kullanılır. Yakalama tam X/Y çiftidir; iki farklı noktadan
  eksen birleştirilmez. En yakın vertex grid/pixel'den önce gelir; eşitlikte
  hazırlanan layer/point sırası kararlıdır. Object Points, bounds center'dır ve
  bu seçenekle karıştırılmaz. Segment Projection bu teslimde açılmaz.
- Noktalar görünür/izole kapsamda, değerlendirilmiş parent ve animasyon
  koordinatlarıyla hazırlanır; her mousemove'da sahne yeniden değerlendirilmez.
  Snap feedback editör overlay'idir; source/Undo/render/export'a girmez.
- Edit'te Add Line: bir açık uç yakalanırsa o konturdan devam edilir. Aynı layer'da
  başka açık uca tıklamak, araya konmuş noktalarla birlikte tek Connect komutudur.
  İkinci uç yeniden üretilmez. Aynı konturun uçları kapanır; iki uygun kontur
  birleşir. Son iki açık ucu tekrar bağlamak kapalı/dolgulu bandı tamamlar.
- Başka katman, kapalı kontur ve iç vertex yalnız konum hedefidir. Otomatik
  Attach/Weld, branş veya delik sahipliği tahmini yoktur. Mevcut Connect'in
  single-contour Objects sınırı ve kilit/key/driver/referans korumaları sürer.
- Auto Close kapalıyken de açık uç hedefleme Connect yapar; Auto Close yalnız
  sağ tıkla bitirme ve yeni konturun başlangıcına dönme politikasını yönetir.
  Normal boş alandan Add Line ayrı Object'tir. Enter açık bitirir; Esc iptal eder.
- Tek Undo/Redo, eski eğri/kimlikler, elle yapılan key'ler, dönüşmüş/animasyonlu
  parent, kapalı/iç/dış katman vertex'leri, master/vertex off ve stale/time change
  kabul kontrolleridir. Yeni serialized spline biçimi veya MCP komutu gerekmez.

### S2D-5B — Offset / Outline (uygulandı)

16 Kasım 2026: aşağıdaki statik, kaynak koruyan dilim uygulanmıştır.
[Kullanım, algoritma sınırları ve test sözleşmesi](../spline-outline.md).

**Sahip:** `src/lib/spline` geometri/konverter; native editor command;
mevcut Spline & Boolean panelinde ayrı, katlanır Outline alanı. Edge seçimi ilk
sürümde seçili edge'in tüm sahip konturunu hedeflediğini açıkça belirtir;
seçilmemiş bitişik kenarlar sessizce kesilmez. Object modunda konturlar hedeflenir.

- Açık kontur için **Left / Right / Both**, kapalı için **Inside / Outside**;
  mesafe composition px. Açık bir yayın geometrik “içi” varsayılmaz. Orientation
  ve kapalı konturların delik sahipliği belirleyicidir.
- Varsayılan **Keep source**: aynı layer'da yeni Object ve yeni geometri ID'leri;
  eski yay/handle/key/paint aynen kalır. Önizleme → Apply / Cancel; Apply tek Undo.
- Ortak parent altında nonuniform scale/rotation olsa da görünen normal uzaklık
  korunur: hesap composition düzleminde, sonuç tam inverse ile layer-local'e.
  Singular transform açıklamalı ret. Normal kopyalama veya scale offset yerine
  kullanılmaz. İlk dilim sabit geometri; source point driver'ları açıklamayla
  reddedilir. Katman/parent dış transform animasyonu korunur.
- Join: miter/bevel/round, miter limit; cubic/quadratic paraleli genellikle tek
  aynı dereceli Bézier değildir. Adaptif yaklaşımın azami hatası composition px
  olarak ilan edilir (başlangıç hedefi 0.25 px); zoom değişimi source'u değiştirmez.
  Point/segment bütçesi ve iş iptali ortak geometri job altyapısında uygulanır.
- Degenerate edge, cusp, aşırı dar dönüş ve self-intersection için görünür tanı;
  ilk sürüm belirsiz sonuçları sessizce budamak yerine reddeder. Delik yönü ve
  fillRule korunmadan offset'e Apply denmez.
- Kabul: çeyreği silinmiş circle → iç paralel açık yay; iki ucu Connect ile bağla;
  radius/mesafe, winding, gap, parent transform ve raster/export eşliği ölçülür.

### S2D-5C — Chamfer / pah (uygulandı, 16 Kasım 2026)

- Point modunda seçili köşeler; px cinsinden kesme mesafesi, önizleme ve tek Apply.
  Line–line, line–quadratic, line–cubic ve cubic–cubic kesme desteklenir.
  [Kullanım, kaynak/ID koruması, sayısal sınırlar ve kabul](../spline-chamfer.md).
- Köşenin iki yanındaki edge'ler uygun parametrelerden bölünür, eski köşe
  yerine iki yeni uç ve düz pah edge'i oluşur. Mevcut Bézier split/trim hesapları
  tekrar kullanılır. Bu işlem yeni Poly yüzü oluşturmaz.
- Komşu seçili köşelerin kesimleri çakışırsa tanı; sessiz clamp yok. Sıfır uzunluk,
  kilit, canlı koordinat key'leri ve kaldırılacak ID'ye referans önce doğrulanır.
- Sağlam kısımlar/ID'ler korunur; değişen topoloji için açık eşleme/tanı.
  Cancel kaynak ve history'yi değiştirmez; Undo bütün köşeleri birlikte geri alır.

### S2D-5D — Fillet / yuvarlatma (uygulandı, 16 Kasım 2026)

- Point modunda radius (px), tangent continuity ve preview. Chamfer'ın düz
  kesmesinden ayrı araçtır. Line–line, line–quadratic, line–cubic ve düzenli
  cubic–cubic çiftleri desteklenir. [Kullanım, sayısal sınırlar ve kabul](../spline-fillet.md). Sadece point type'ını Smooth yapmak
  radius kontrollü fillet yerine geçmez.
- Komşu eğriler trim edilir, yeni yay/Bézier bağlantısı üretilir; kesim ve teğet
  hataları composition px/radyan toleranslarıyla doğrulanır. Çözüm bulunmayan
  veya çoklu/ambiguous radius durumunda açıklamalı ret; boyut/ID/key uydurulmaz.
- Tek/multi corner, bitişik radius çakışması, açık/kapalı kontur, dönüşmüş parent,
  kesilen circle'ın bridge köşeleri, fill/stroke, save/open ve Undo/Redo kabulüdür.

Yerel sıra **5A → 5B → 5C → 5D**. 5A, 5B, 5C ve 5D uygulandı.
Trim/Extend, spline segment projection, serbest otomatik weld, per-Object material,
3D kesit/extrude ve genel modifier stack kapsamı ayrıca planlı kalır; mevcut
diğer ana paketlerin durumu bunlarla tamamlanmış kabul edilmez.
