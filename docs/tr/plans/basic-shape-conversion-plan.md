# Basic Shape → Spline / 2D Mesh dönüşüm planı

22 Kasım 2026 · **Statik geometri dönüşümü v1 uygulandı.**

Uygulanan menüler, kalıcı stage kaydı, çoklu kaynak Union/delik/ada davranışı,
public kod yolları ve gerçek sürüm sınırları için
[Edit geometri dönüşümleri](../geometry-conversion.md) belgesine bakın.
Aşağıdaki metin özgün geniş hedefi korur: zamana bağlı canlı source recipe,
genel modifier yeniden sıralaması ve animasyonlu geometri conversion evaluator'ı
henüz uygulanmış özellikler değildir. V1 bu durumları sessizce bake etmek yerine
reddeder; source parametre değişiklikleri açık Rebuild komutuyla uygulanır.

## Kullanıcı sözleşmesi

Edit panelindeki **Convert** menüsü iki hedef sunar: **Spline** ve **2D Mesh**.
Basic Shape doğrudan nokta/segment düzenlemeye açılmaz; parametrik kaynak
olarak kalır. Her dönüşüm kalıcı bir geometri stack girdisi olur ve seçildiğinde
kendi ayarlarını açar. Bu stack, timeline **Animation Modifiers** panelinden
ayrıdır. Kullanıcıya sahnede ayrı bir Spline oluşturma zorunluluğu yüklenmez.

İki hedef aynı şekil değerlendirme ve kontur hazırlama yolunu kullanır:

```text
Değerlendirilmiş Basic Shape → ortak kontur hazırlama → editable Spline
                                                   ↘ Mesh2D üçgenleme
```

Buradaki ara kontur, gerektiğinde bellekte tutulan geometri temsilidir;
bağımsız bir sahne katmanı değildir. Spline → Mesh2D de aynı üçgenleyiciyi kullanır.

## Mevcut koddan doğrulananlar

`codex/developing-3d-mode` branch'inin `18db0874` kaynakları entegrasyona
alındı. Aşağıdaki planar/Boolean hesapları bu branch'ten geliyor; dönüşüm
için bağımsız kopyaları yazılmayacak. Kaynak branch'in kaydedilmemiş 3D/WIP
dosyaları bu commit birleşiminin parçası değildir.

- `ShapeToPathConverter`: köşe yarıçapı ve shape parametrelerinden gerçek
  M/L/C/Q/Z sınırını üretir. Sadece `size` kutusundan tahmin yapılmamalı.
- `ShapeBoundaryMesh2DGenerator`: kapalı şekli deterministik bir ara Spline'a
  çevirir; tam ring'i dış sınır ve delik olarak ayırır. Bu ara Spline sahnede
  kaydedilmez. Kendi özel adaptörünün desteklediği türler sınırlıdır.
- `SplineBoundaryRingBuilder`: kapalı konturları örnekler, dış sınır/delik
  rollerini belirler; kesişen, birbirine değen ve dejenere sınırları reddeder.
- `SplineBoundaryMesh2DGenerator`: içbükey ve delikli konturları Earcut 3.2.4
  ile üçgenler; alan sapması, üçgen yönü ve ortak topology validator ile denetler.
  Varsayılan örnekleme toleransı 0,25 yerel pikseldir; zoom'dan bağımsızdır.
- `geometry/planar/boundaries.ts`: `classifyPlanarBoundaries` dış sınır/delik
  rollerini evenodd nesting ve nonzero winding ile ayırır. `planar/contours.ts`
  alan, içerme, temas ve self-intersection denetimlerinde robust-predicates
  kullanır. Var olan Mesh ring adaptörüyle semantik/tolerans farkları açıkça
  karşılaştırılıp bu ortak owner üzerinden birleştirilecek; eski mesh çıktıları
  sessizce değiştirilmeyecek.
- `geometry/boolean/layerOperand.ts`: Basic Shape/Spline/SubShape girdisini
  ortak yerel geometri sözleşmesine çevirir, full-ring seam'ini normalize eder.
  `PolygonClippingBackend` Union/Subtract/Intersect için mevcut backend'dir.
- `booleanOperations` ve `editor/boolean`: kaynakları koruyan kalıcı Boolean
  recipe, tek Undo komutu, derived geometri cache/projection ve output flatten
  yolunu sağlar. Conversion stage yaşam döngüsü bunların source-recipe,
  preview/admission ve renderer/bounds/output sözleşmelerini tekrar kullanacak.
  Boolean topoloji hesabı ile dönüşüm aynı işlem değildir; her Basic Shape'i
  dönüştürürken gereksiz Union uygulanmayacak. `polygonPathToSpline` Boolean'ın
  poligonal çıktısına aittir; doğrudan Spline hedefinde Bézier eğrilerini
  poligona düşürmek için kullanılmayacak.
- Eski `makeConvertToSplineCmd`, adına rağmen `type: 'path'` üretir. Yeni
  normalized `type: 'spline'` sözleşmesi bununla karıştırılmamalı; eski çağıranlar
  uyumlu kalacak, yeni dönüşüm açıkça adlandırılmış bir uygulama kullanacak.
- Edit'teki Offset/Outline/Chamfer/Fillet listesi şu an Preview/Apply araç
  seçicisidir. Kaydedilen, sıralı geometri stack altyapısı ayrıca kurulmalıdır.

## Uygulama sırası

1. **Son geometriyi değerlendirme.** Mevcut evaluator/materialize hattından
   seçili frame'in size, shapeParams ve cornerRadius değerlerini al. Transform,
   parent, anchor ve yerel geometriyi ayrı tut; world transform'u vertekslere
   ikinci kez uygulama. Canlı recipe ile tek-frame bake davranışlarını açıkça
   ayır. Animasyon/driven kanalları sessizce statik geometriye düşürme.
2. **Ortak Shape → Spline dönüştürücüsü.** Mesh adaptöründeki mevcut kontur
   dönüşümünü sahip olduğu geometri alanında çıkar/genişlet; ikinci bir shape
   algoritması kopyalama. Kapalı/açık konturlar, çoklu konturlar, Bézier handle'lar,
   kapanış segmentleri ve ring delikleri korunmalı. Spline çıktısı editable
   point/handle/segment/contour kayıtları üretmeli. Eğriler Spline hedefinde
   gereksiz yere poligona çevrilmemeli.
3. **Kontur analizi.** Açıklık, yön, alan, tekrarlanan/kollinear noktalar,
   nesting ve dış sınır/delik rolleri ortak doğrulayıcılarla belirlenmeli.
   İçbükey/dışbükey köşeler yön ve tolerans dikkate alınarak sınıflandırılmalı.
   Concave geometriye convex hull uygulamak yasak: çentikler ve boşluklar
   dolmamalı. Convex bilgisi tanı/uygun optimizasyon içindir; ikinci, uyumsuz
   bir üçgenleyici gerektirmez. Çakışma/self-intersection otomatik tahminle
   onarılmaz; tanı ve kaynak konumu gösterilir.
   Bu adım yeni bir Boolean/alan motoru değil, `classifyPlanarBoundaries`,
   ortak contour predicates ve mevcut Mesh ring adaptörlerinin kontrollü
   entegrasyonudur. İçbükey köşe sınıflandırmasında robust orientation işareti
   kontur yönüyle birlikte yorumlanır; flatten toleransı UI zoom'undan bağımsızdır.
4. **Spline hedefi.** Parametrik son sınırı düzenlenebilir normalized Spline
   olarak üret. Fill rule, fill/stroke, opacity, transform, origin, parent ve
   zaman kapsamını koru. Açık line/arc/wave/spiral Spline olarak desteklenir.
5. **Mesh hedefi.** Geçerli kapalı konturu mevcut ring builder ve Earcut hattına
   yönlendir. Concave bölgeler, delikler ve ayrık adalar korunmalı. Üçgenler
   Chorono'nun x-sağa/y-aşağı pozitif yönünde, UV'ler yerel bounds'a göre üretilir.
   Açık çizgiden yüzey oluşturmak ayrı bir stroke expansion işlemidir; kendiliğinden
   kapatılmaz. Stroke, cap/join ve trim'in Mesh görünümüne etkisi için açık
   capability/outline sözleşmesi gerekir; desteklenmeyen görünüm sessizce atılmaz.
   Blur/shadow gibi piksel efektleri sınır geometrisi sayılmaz; raster bake ayrıdır.
6. **Kalıcı stack ve ayarlar.** Versiyonlu source recipe, sabit stage kimliği,
   parametreler, aktiflik ve girdi/çıktı türü kaydedilir; türetilmiş frame buffer'ları
   normal scene JSON'a girmez. Spline girdisi nokta düzenleyicisini, Mesh girdisi
   tolerans/topology/UV ayarlarını açar. Tür uyumsuz yeniden sıralama engellenir.
   Basic Shape kaynak geometrisi korunur; kaynak değişirse downstream sonuç
   yeniden hesaplanır. Topoloji değişince eski point/pin seçimleri sessizce yanlış
   vertekslere bağlanmaz; eşleme yoksa açıkça geçersiz kılınır.
7. **Tek komut ve tam entegrasyon.** Preview history dışındadır; Apply kaynak
   revision/document doğrulamasıyla tek undo'dur. Save/load, copy/instance,
   parent selection/bounds/hit-test, Canvas renderer, portable/runtime ve export
   aynı değerlendirilmiş geometriyi kullanmalıdır. Scene'ye gizli ara katmanlar
   eklemek veya yalnız UI satırı oluşturmak tamamlanmış stack sayılmaz.

## Kabul kapısı

- Dikdörtgen, yuvarlatılmış dikdörtgen, ellipse, convex polygon, concave star,
  ring/donut, açık eğri ve ayrık adalar; sınırda örnekleme/alan toleransları.
- İçbükey çentiğin boş kalması, deliğin dolmaması, üçgenlerin sınır dışına
  taşmaması; toplam üçgen alanı = dolu kontur alanı (belirlenmiş toleransla).
- Ters yön, negatif/nonuniform scale, rotation, özel pivot ve dönüştürülmüş
  parent altında yer değiştirmeme; geometry'ye transform'un iki kez uygulanmaması.
- Preview/Apply anında belge, frame veya kaynak değişirse stale commit'in reddi.
- Kaynak parametresi/animasyonu değiştiğinde doğru sonuç, bounds ve picking;
  topoloji değişikliğinde eski seçim/pin/animation adresleri için güvenli tanı.
- Tek undo/redo, kararlı clone/instance, portable save/load ve gerçek render/export
  görüntüsünün karşılaştırılması. Bu kapı geçmeden iki menü satırı tamamlanmış
  dönüşüm özelliği olarak sunulmaz.
