# Edit geometri dönüşümleri

22 Kasım 2026 · Uygulanan statik geometri sözleşmesi v1.

## Kullanım

Basic Shape veya Spline seçip viewport sağ tık **Convert → Convert Spline /
Convert 2D Mesh** menüsünü kullanın. Edit dock'unda ayrı bir Convert düğmesi yoktur. Çoklu seçimde
2–8 kapalı nesne önce Boolean Union ile birleştirilir. Kesişen iç kenarlar
kaldırılır; içbükey dış sınır ve kapalı boşluklar korunur. Ayrık adalar aynı
Spline içinde ayrı editable SubShape elementleridir; delikler kendi dış
konturunun elementine bağlıdır. Mesh'te bunlar ayrık yüzeyler ve gerçek deliklerdir.

Edit'te **Source → sıralı modifierlar → sonuç** tek stack olarak gösterilir.
Dönüşüm adımları da bu listenin gerçek elemanlarıdır. **Add modifiers** mevcut
çıktı türüne göre Spline ve Mesh kategorilerini ayrı gösterir. Her örneğin kendi
ayarları, aç/kapat, yukarı/aşağı ve kaldırma ikonları vardır. Bağımlılığa aykırı
sıra/kaldırma açık hata verir ve nesne değişmez.

Ayar yazmak geometriyi değiştirmez. **Execute stack** bütün bekleyen ayarları
özgün kaynaktan başlayarak sırayla hesaplar; yalnız son başarılı sonuç tek Undo
adımında uygulanır. Satırdaki onay ikonu o satırın taslağını aynı tam zincirden
geçirir. Mesh toleransı 0,01–10 yerel pikseldir; varsayılan 0,25. Altta ayrı
Apply Mesh Settings / Remove last modifier düğmeleri yoktur.

Mesh dönüşüm satırını kaldırmak Spline girdisine döndürür. **Source → Rebuild
from source**, korunmuş parametrik kaynaktan hesaplar; boyut, köşe yarıçapı ve
mevcut sayısal shape parametreleri düzenlenebilir. Bu açık eylem, dönüştürülmüş
Spline nokta düzenlemelerini sıfırlar. Etkin geometri modifierı varken üretilen
noktalar doğrudan yazılamaz: ilgili adımları kapatın veya **Bake stack** kullanın.
Pin veya bağlanmış deformation clip varsa rest/topoloji değişimi sessizce eski
vertekslere bağlanmaz; önce pinleri kaldırın veya clip'i açıkça yeniden bağlayın.

## Mimari ve veri akışı

- `geometry/conversion/ShapeToSplineConverter.ts`, eski
  `ShapeBoundaryMesh2DGenerator` içinden çıkarılan tek path/control walker'dır.
  M/L/C/Q/Z, açık çizgiler, kapanış teğetleri ve full-ring seam ayrımı ortaktır.
  Tek nesnenin Bézier eğrileri poligona indirilmez; Q tam olarak C'ye yükseltilir.
  Boolean Basic Shape operand adaptörü de aynı owner'ı kullanır.
- `GeometryConversionService`, çoklu kaynak için mevcut
  `PolygonClippingBackend` Union'ını; delik/ada sınıflandırması için
  `classifyPlanarBoundaries` ve robust planar predicates'i kullanır. Convex hull
  uygulanmaz. Mesh için mevcut `SplineBoundaryMesh2DGenerator` / Earcut hattı
  ve topology validator kullanılır; ikinci üçgenleme algoritması yoktur.
- `editor/commands-geometry-conversion.ts`, kaynak admission, result-local matris
  yakalama ve tek Undo komutunun sahibidir. `prepareGeometryConversion(scene,
  ids, 'spline' | 'mesh2d')`, `{ layerId, command }` döndürür. Komut yakalanan
  layer/timeline snapshot'ı değişmişse reddeder; Undo özgün kimlikleri, sırayı
  ve timeline üyeliğini geri getirir.
- `Layer.modifierStack` v1, özgün kaynak ve sıralı `{ id, type, enabled, settings }`
  kayıtlarını saklar. Genel `Modifier`, `ModifierRegistry`, `ModifierStack.execute`
  geometriden bağımsızdır; tür/topoloji kuralları geometri adaptöründedir.
  Eski `geometryConversion` v1 okunur, yalnız açık düzenlemede yeni stack'e taşınır. Dönüşüm ilk nesnenin layer kimliğini, parent'ını, origin'ini,
  transform'unu ve lifetime'ını korur. Shape → Spline girişinde dolgu None olur,
  görünür stroke korunur veya 2 yerel piksel kontur oluşturulur. Dolgunun son
  etkin türü `style.fill.disabledType` ile, renk/gradient/image verileri aynı fill
  içinde saklanır. Spline → Mesh girişinde bu dolgu geri açılır; yalnız stroke'u
  olan bir kaynak için kontur renginde solid yüzey oluşturulur. Aynı türde
  modifier Execute, kullanıcının sonradan yaptığı fill/stroke düzenlemesini değiştirmez.
  Kaynak matrisleri bu nesnenin yerel
  uzayına gider; world transform vertekslere ikinci kez uygulanmaz. Ara Spline
  için sahnede gizli bir layer oluşturulmaz. Copy bağımsız kaynak kayıtları alır;
  Instance mevcut visual-source alan sözleşmesiyle çözümlenir.
- Sonuç sıradan `spline` / `mesh2d` verisidir: mevcut bounds, hit test, renderer,
  portable save/load ve runtime/export yollarını kullanır. Runtime compiler
  source-only modifier recipe'sini çıkarır. Runtime/scene JSON'a DOM, worker,
  GPU nesnesi veya per-frame dense cache yazılmaz. Edit edilmiş kontrol noktaları
  authored source'tur; Mesh'e geçerken Spline stage'ine kaydedilir.
- Mesh dış/hole boundary indeksleri `Mesh2DData.boundaryRings` alanında topology
  vertex'lerini adresler. Stroke/trim mevcut Spline paint kodundan geçer; iç
  triangle kenarları çizilmez. Deformation sırasında güncel vertex konumları
  kullanılır. Image fill aynı paint ve media dependency owner'larından geçer.
- Edit modunda Mesh taşıma/döndürme/ölçekleme, `meshTransform` (**Edit Mesh**)
  modifier'ıyla yerel vertekslere uygulanır. Layer transform/origin ve keyframe'ler
  değişmez; UV/topoloji korunur. Düzenleme başlangıcındaki geometri viewport'ta
  yarı saydam kesikli ghost olarak kalır, export'a girmez. Spline alt-nesne
  düzenlemeleri mevcut source-point komutlarını kullanır ve aynı ghost'u gösterir.

## Sınırlar ve sayısal davranış

Bu sürüm **statik geometri dönüşümüdür**. Tek nesnenin transform/paint animasyonu
korunur; size/shapeParams/cornerRadius/Spline geometri kanallarını yöneten
animasyon veya canlı driver varsa işlem açık hata verir. Bir frame'i sessizce
bake etmez. Zamana bağlı modifier parametreleri sonraki aşamadır; Deformation Clip mevcut
composition-ms oynatımını kullanır. Ortak altyapı Smooth ve detay artıran Mesh
algoritmalarını taşır. Smooth ve Delaunay/Grid seçilebilen Subdivision, Mesh
modifier listesinde kendi ayarlarıyla çalışır. [Sayısal sözleşme ve sınırlar](../../src/lib/geometry/mesh2d/modeling/README.md).
[Mimari, kayıt biçimi ve örnek](../../src/lib/modifiers/README.md).

Çoklu union, mevcut Boolean static-input politikasıyla aynı parent altında,
aynı lifetime'a sahip, çizim sırasında bitişik sibling kaynaklar ister. Sonuç
ilk nesnenin paint/opacity'sini kullanır; diğer nesnelerin ayrı görünümlerini
birleştirip aynı anda koruduğunu iddia etmez. Silinecek ikincil layer'ların dış
referansları varsa işlem reddedilir. Açık çizgi Spline olabilir; Mesh için
explicit stroke expansion olmadan kapatılmaz. Self-intersection, dejenere veya
manifold olmayan temaslar onarılmış gibi sunulmaz; kullanıcıya tanı döner.

Boolean eğrileri sabit yerel toleransla örnekler; bu çoklu kaynakta yaklaşık
bir sınır üretir. Mesh hazırlığında trig roundoff nedeniyle eşit koordinatların
`25` / `25.000000000000007` gibi ayrılmasını önlemek için 14 anlamlı basamağa
normalizasyon uygulanır. Kabul edilen ±10 milyon piksel uzayında hata minimum
0,01 px toleransın çok altındadır. Editable Spline kontrolleri yuvarlanmaz;
Mesh alan sapması ve topology geçerliliği sonrasında yeniden doğrulanır.

## Doğrulama ve tekrar üretme

`commands-geometry-conversion.test.ts` içbükey birleşim, delikli frame + ayrık
ada, ring/disk, açık çizgi, yansıtılmış parent, kaynak yeniden hesaplama,
edited Spline → Mesh → Spline, Undo/Redo, clone/instance, portable/runtime,
driver/ref/stack-order reddini denetler. `mesh2dBoundaryStroke.test.ts`, gerçek
Canvas çağrılarıyla dış stroke ve deformed vertex davranışını kontrol eder.

Next kapalıyken `node scripts/perf/geometry-conversion.mjs`, ardından
`node scripts/perf/serve.mjs /tmp/chorono-conversion-qa 2012` çalıştırın.
`http://127.0.0.1:2012/geometry-conversion.html` kullanıcı projesinden bağımsız,
üretim Canvas/Edit/Undo bileşenlerini kullanan kabul sahnesidir. Beş nesneden
Spline dönüşümü iki element/üç kontur, Mesh dönüşümü üç boundary ve `Hole PASS`
üretmelidir. Modifier listesi, kaynak/mesh ayarları ve Undo/Redo burada denenebilir.
