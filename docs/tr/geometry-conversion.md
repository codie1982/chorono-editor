# Edit geometri dönüşümleri

22 Kasım 2026 · Uygulanan statik geometri sözleşmesi v1.

## Kullanım

Basic Shape veya Spline seçip viewport sağ tık **Convert → Convert Spline /
Convert 2D Mesh** menüsünü kullanın. Edit dock'unda ayrı bir Convert düğmesi yoktur. Çoklu seçimde
2–8 kapalı nesne önce Boolean Union ile birleştirilir. Kesişen iç kenarlar
kaldırılır; içbükey dış sınır ve kapalı boşluklar korunur. Ayrık adalar aynı
Spline içinde ayrı editable SubShape elementleridir; delikler kendi dış
konturunun elementine bağlıdır. Mesh'te bunlar ayrık yüzeyler ve gerçek deliklerdir.

Edit'in **Conversion history** bölümü özgün geometriyi, **Editable Spline** ve
varsa **2D Mesh output** adımlarını gösterir. Bu geçmiş, **Add modifiers** ile
seçilen Spline/Mesh işlemlerinden ayrıdır. Kaynak yeniden hesaplama ve dönüşüm
ayarları burada açılır. Mesh toleransı 0,01–10 yerel pikseldir; varsayılan 0,25.
Satırdaki onay ikonu bekleyen Mesh ayarını tek Undo ile uygular; çöp kutusu
ikonu ilgili son dönüşüm adımını kaldırır. Bir stage sonraki Mesh stage'inin
girdisiyse kaldırma ikonu açıklamalı olarak pasiftir: önce aşağıdaki Mesh kaldırılır.
Altta ayrı Apply Mesh Settings / Remove last modifier düğmeleri yoktur.

Mesh üzerindeki **Edit Spline input**, Mesh stage'ini kaldırıp kaydedilmiş Spline
kontrol noktalarına döner; düzenlemeden sonra sağ tık Convert ile Mesh'e geçilir.
**Original Basic Shape → Rebuild from source**, korunmuş parametrik kaynaktan
hesaplar. Boyut, köşe yarıçapı ve mevcut sayısal shape parametreleri düzenlenebilir.
Bu açık yeniden oluşturma, sonradan yapılmış Spline nokta düzenlemelerini sıfırlar.
Pin/deformation varsa topology değişimi eski vertex kimliklerine sessizce
bağlanmasın diye önce bunların kaldırılması gerekir.

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
- `Layer.geometryConversion` v1, kaynak geometri snapshot'ları ve sıralı stage
  kayıtlarını saklar. Dönüşüm ilk nesnenin layer kimliğini, parent'ını, origin'ini,
  transform'unu, paint ve lifetime'ını korur. Kaynak matrisleri bu nesnenin yerel
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

## Sınırlar ve sayısal davranış

Bu sürüm **statik geometri dönüşümüdür**. Tek nesnenin transform/paint animasyonu
korunur; size/shapeParams/cornerRadius/Spline geometri kanallarını yöneten
animasyon veya canlı driver varsa işlem açık hata verir. Bir frame'i sessizce
bake etmez. Canlı, zamana bağlı conversion değerlendirmesi sonraki aşamadır.

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
