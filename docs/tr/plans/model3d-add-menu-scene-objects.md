# Plan: 3D Add menüsü, sahne nesneleri ve çalışma araçları

15 Kasım 2026 · **Menü envanteri ve uygulama sırası önerisi.** Bu belge,
[Polygon / Primitive ilk dilimi](model3d-polygon-primitives-first-slice.md)
üzerine kurulur. Menüdeki bir öğe ancak kaynak, seçim, özellikler, render,
Undo ve portable kayıt yolu tamamlanınca eklenebilir olur.

3D Scene Explorer, 3D Snap ve 3D Parameters / Binding / Wire panelleri bu
sahnenin kendi araçlarıdır. Ana 2D sahnenin Layers, Snap ve Wiring panelleri
iç 3D nesneleri düzenlemez.

## Menü envanteri

3D editörde üst araç çubuğundaki **Add** tek giriş noktasıdır. Başlıklar menüde
görünür; aşağıdaki “sonra” öğeleri çalışmayan eylem olarak sunulmaz.

| Grup | Nesneler | Teslim durumu / işlem |
| --- | --- | --- |
| **Geometry → Polygon** | Box, Sphere, Cylinder, Cone | Primitive v4 taslağı; ilk işlevsel menü dilimi. |
| **Geometry → Polygon (sonra)** | Plane, Torus, Capsule | Ayrı primitive kaynak genişlemesi. |
| **Geometry → Spline (sonra)** | Line/Bezier, Rectangle, Circle, Extruded Spline | Ayrı Spline Extrusion modu ve geometri hattı. |
| **Scene** | Imported Model | Mevcut asset seçme/ekleme akışını aynı menüden açar; yeni bir dosya türü veya kopya nesne yaratmaz. |
| **Scene (sonra)** | Empty/Locator, Group | Gerçek transform ebeveyni ve Scene Explorer hiyerarşisiyle gelir. |
| **Camera** | Perspective Camera, Orthographic Camera | Gerçek kamera nesnesi; ilk kamera otomatik etkinleşir, sonrakiler Render seçicisinden atanır. |
| **Light** | Directional, Point, Spot | Ayrı seçilebilir ışık nesneleri. Area Light sonraki render kapasitesidir. |
| **Particles (sonra)** | 3D Particle Emitter | Tek yayıcı türü; Point/Box/Sphere yayım şekilleri properties içindedir. |

**Environment/Ambient** sahne ayarı olarak kalır; menüde bağımsız nesne diye
listelenmez. Yardımcı grid ve yön küpü de kaynak nesnesi değildir. 2D
`particleEmitter` katmanı 3D menüye doğrudan eklenmez.

**16 Kasım 2026 uygulama notu:** Camera (Perspective/Orthographic) ve Light
(Directional/Point/Spot) menüleri, gerçek kaynak nesneleri, Scene Explorer
seçimi ve render kamerası seçimi tamamlandı. Uygulanmış sözleşme ve kullanım
için [3D sahne kameraları ve ışıkları](../model3d-scene-cameras-lights.md)
belgesine bakın. Empty/Group, Area Light ve 3D emitter sonraki aşamalardır.

## UI ve etkileşim sözleşmesi

- Add yalnız 3D içerik editöründe görünür. 2D Layers listesi tek kapsayıcı 3D
  sahne katmanını göstermeye devam eder; yeni nesneler yalnız 3D Scene
  Explorer'da görünür. Add menüsü mevcut çalışma alanından bağımsız açılır.
- Menü kategori başlıkları ve açık nesne adları kullanır; yalnız ikonla seçim
  yaptırmaz. Klavyeyle açma, oklarla gezinme, Enter ile ekleme, Escape ile
  kapatma ve görünür focus gereklidir. Uzun menüde kategori/nesne araması
  eklenir; iç içe hover menüleri zorunlu değildir.
- Ekleme yeni kararlı ID ve varsayılan transform oluşturur, nesneyi seçer ve
  gerekirse kadraja alır. Sağ panel türün properties'ine geçer: primitive için
  Modeling, kamera/ışık için Render, emitter için Animation. Önceki çalışma
  alanına dönüş mümkündür; seçim aktif çıktı kamerasını kendiliğinden
  değiştirmez.
- Desteklenmeyen öğeler plan/katalogda kalır. Gri fakat tıklanabilir
  “ekle” düğmesi sahte başarı üretmez. Menüdeki limit/bütçe nedeniyle
  kullanılamayan gerçek öğe ise nedeni ve kalan kapasiteyi gösterir.

## 3D Scene Explorer

- İç 3D sahnenin tek nesne listesi imported instance/node, authored
  primitive, gelecekteki spline, Group/Empty, kamera, ışık ve emitter'ı
  **türlenmiş kararlı ID** ile birleştirir. Dış 2D katmanlar bu listede,
  iç 3D nesneler de 2D Layers listesinde görünmez. Ana 2D listede yalnız
  kapsayıcı 3D sahne katmanı kalır.
- Arama, tür filtresi (Geometry, Camera, Light, Particles, Helper), görünürlük,
  kilit ve seçili nesneyi listede bulma işlemleri 3D ağacında çalışır.
  Viewport seçimi ve liste seçimi aynı referansı kullanır. Aktif çıktı
  kamerası, kalibre edilmemiş imported model ve bozuk wire gibi durumlar
  nesne satırında metin/ikonla belirtilir; renge tek başına güvenilmez.
  Görünürlük geometri/emitter için çizimi, ışık için etkinliği kontrol eder;
  kamera yardımcısını gizlemek aktif çıktı kamerasını kapatmaz. Kilit seçme
  ve transform düzenlemeyi durdurur. Bu bayrakların kayıt/Undo davranışı
  nesne türü sözleşmesinde açıkça tanımlanır.
- Group hiyerarşisi geldiğinde aç/kapat, yeniden adlandır, sürükleyerek
  ebeveyn değiştirme ve çoklu seçim net komutlardır. Reparent, döngü ve
  geçersiz tür ilişkisini reddeder; seçildiğinde dünya dönüşümünü koruma
  davranışı açıkça seçilir. Imported glTF node hiyerarşisi, authored Group
  hiyerarşisine sessizce taşınmaz.

## 3D Snap

- 2D `SnapEngine` ve `useSnapSettings` kompozisyon pikseli/Vec2 üzerindedir;
  3D sahneye cast edilmez. Hedef sıralama, ekran pikseli toleransı ve
  açı/ölçek yuvarlama gibi boyuttan bağımsız kurallar uygun sözleşmeyle
  paylaşılır. 3D aday toplama, ray, derinlik ve dünya koordinatı ayrı
  adapter'dadır.
- **Move:** 3D dünya orijinine bağlı fiziksel grid adımı, nesne pivotu ve
  merkezleri ilk hedeflerdir. X/Y/Z eksen kilidi ve XZ/XY/YZ çalışma düzlemi
  desteklenir. Vertex, edge, face ve surface snap yalnız ilgili 3D geometri
  sorgusu/picking hazır olduğunda açılır. Gizli, kilitli veya kameranın
  arkasındaki hedefler varsayılan aday olmaz.
- **Rotate / Scale:** Derece adımı (öneri 15°) ve yüzde adımı (öneri %5)
  hareket snap'inden ayrı açılır. Lokal/dünya ekseni seçimi ve işlem sırası
  3D gizmo ile aynıdır; yalnız mouse hareketi değil sayısal transform da
  aynı kesin sonuç kuralını kullanır.
- **3D Snap Settings:** Modeling/Animation/Texture alanlarında ulaşılır;
  etkinlik, hedef türleri, ekran pikseli yakalama yarıçapı, fiziksel grid
  adımı, açı ve ölçek adımı gösterilir. Fiziksel adım, Measurement & Grid
  panelindeki **aynı** `gridBaseMeters` değeridir; ayrı ikinci grid sayısı
  tutulmaz. Adım sahneyle, snap hedef/açı/ölçek tercihleri editör görünümüyle
  saklanır. 2D ayarları etkilenmez. Üretilen nesne transformu sahne kaynağında ve
  Undo'da kalır. Grid görünürlüğü kapalıysa grid hedefi geçici devre dışıdır.
  Zoom nedeniyle seyreltilen **çizim** aralığı snap adımını değiştirmez;
  örneğin 10 cm ayarı her zoom'da 10 cm'ye oturur. Birim cm/in/px arasında
  değişince fiziksel adım korunur, gösterilen sayı çevrilir.
- İlk aşama, mevcut imported node taşıma gizmosu ve primitive taşıma
  komutuyla grid/pivot snap'i tamamlar. Vertex/edge/face ve yüzeye hizalama
  sonraki geometri dilimidir; menü veya panel bunları çalışır gibi göstermez.
  Dünya uzayında bulunan hedef nokta, kaynak node'un ebeveyninin yerel
  uzayına dönüştürülerek kaydedilir; imported glTF node birimi ile metre
  cinsinden 3D dünya birimi karıştırılmaz.

## 3D Parameters, Binding ve Wire

- 3D çalışma alanında ayrı **Parameters** ve **Connections** panelleri
  bulunur. Parameters, seçili 3D nesnenin dışarı açılabilir sayı/boolean
  kanallarını gösterir: ad, tür, birim, varsayılan, aralık ve mevcut değer.
  Connections içinde **Binding** (doğrusal aralık eşleme) ve **Wire**
  (kısıtlı ifade) ayrı sekmelerdir. Property yanındaki bağlantı eylemi hedef
  alanı önceden seçer. Kaynak/hedef seçiciler yalnız bu 3D sahnenin desteklenen
  nesne/parametre kanallarını listeler.
- Her uç, nesne ID'si + kararlı kanal ID'si + değer türü + birim boyutuyla
  tanımlanır; görüntülenen isim ve serbest metin property path kimlik değildir.
  İlk kanallar primitive konum/dönüş/ölçek ve boyut, imported instance
  transformu, mevcut kamera/ışık değerleridir. Kamera/ışık nesneleri ve
  emitter eklendikçe kendi türlenmiş kanalları aynı kayıt üzerinden açılır.
  Eski tekil kamera ve varsayılan ışık, yeni nesne ID'si üretilmeden
  ayrılmış sabit sahne uçlarıyla temsil edilir.
  Global Width/Length/Height gibi türetilmiş ölçüler salt okunur **kaynak**
  olabilir; düzenlenebilir kaynak alanıymış gibi hedef yapılamaz.
- Sayısal hesap metre/derece/ms gibi kanonik birimlerle çalışır; cm/in/px
  yalnız editör gösterimidir. Birim boyutları uyumsuzsa bağlantı açık
  dönüştürme/eşleme olmadan kabul edilmez. Eksik/silinmiş ID, tür değişimi,
  kaynak revizyonu, aralık dışı değer, döngü ve aynı hedefe iki yazıcı
  tanıyla reddedilir veya güvenli önceki değerde kalır.
- Var olan ortak sınırlı ifade yorumlayıcı, bağımlılık sırası ve wire
  doğrulaması semantiği uyuştuğunda yeniden kullanılır. 2D `ParameterRef`
  (`layerId`/2D path) iç 3D nesne ID'siymiş gibi kullanılmaz. 3D bağlantılar
  iç sahnenin sürümlü kaynağında kalır; frame değerlendirmesi önceden
  örneklenmiş kaynak değerlerinden deterministik override üretir, model
  kaynağını her karede değiştirmez. Native klip, içerik key'i, exposed input
  ve bağlantıların aynı hedef sahipliği açıkça doğrulanır.
- Ana 2D sahneyle ilişki yalnız açıkça **Expose input/output** edilen
  arayüzden geçer. Mevcut `ModelContent.parameters` ve dış `parameterWires` /
  `bindings` köprü olarak incelenir; dış panel iç objeleri doğrudan açmaz.
  Detay editöründe yerel Undo/Redo ve Apply/Cancel, bağlantıların tamamını
  tek ana Undo adımı olarak yayınlar; eski proje bağlantıları korunur.

## Kaynak ve renderer sınırları

- Menü tanımları tür, başlık, kategori, varsayılan kaynak üretimi ve ekleme
  komutuna giden küçük bir katalogdur; geometry, camera, light ve particle
  algoritmaları kendi feature dizinlerinde kalır. Scene Explorer bunları
  türlenmiş kararlı referanslarla tek listede toplar; ayrı kaynak kayıtları
  birbirine kopyalanmaz.
- Mevcut `modeling.objects` authored polygon nesnelerini,
  `content.instances` imported modelleri tutar. Kamera/ışık/boş nesne/3D
  emitter için yeni sürümlü sahne nesnesi kaynağı gerekir; v4 primitive alanına
  keyfi alanlar eklenmez. Aynı yeni sürümlü 3D içerik sınırı, private
  Parameters/Binding/Wire kayıtlarını da taşır; editörün snap tercihi bu
  kaynakta tutulmaz. Eski sahneler salt açılışta değiştirilmez. Her türün
  kendi validasyonu, oluşturma/silme, seçim/pick, gizmo, bounds, clone,
  Apply/Cancel, Undo/Redo, portable yükleme ve render/export kabiliyeti
  tanımlanır.
- Bugünkü tek çıktı kamerası ve varsayılan key light sahne ayarlarıdır.
  Kamera nesnesi eklendiğinde mevcut çıktı görünümü korunur; kullanıcı
  **Set as output camera** ile aktif kamerayı seçer. Aktif kamera silinirse
  belgelenmiş varsayılan çıktı kamerasına dönülür. Yeni ışıklar mevcut key
  light'a sessizce iki kez uygulanmaz: varsayılan ışık Scene Explorer/Render
  ayarlarında görünür, etkinliği ve yeni ışıklarla toplama kuralı açıktır.
- 3D emitter, metre temelli 3D konum/hız/yerçekimi ve milisaniye zaman,
  kararlı seed, sınırlı parçacık sayısı ve yönetilen GPU/CPU bütçesi ister.
  Viewport, scrub, raster frame/sequence ve portable kayıtta aynı sonucu
  verir; 2D particle runtime yalnız uyumlu matematik veya renk eğrisi
  yardımcıları için yeniden kullanılabilir. Bu sözleşme tamamlanmadan
  Particles menü girdisi etkinleşmez.

## Sıra ve kabul

1. **A0 — menü ve Explorer:** Primitive dört türü ve mevcut Imported Model
   akışı tek 3D Add yüzeyine taşınır; mevcut ekleme kontrolleri tek komut
   yolunu kullanır. 3D Explorer seçim/arama/tür filtresi ve 2D katman
   ayrımı tamamlanır. Boş sahne, silme, Undo ve Apply/Cancel doğrulanır.
2. **A1 — 3D Snap:** Metre temelli grid, nesne pivotu, eksen/düzlem kilidi,
   açısal/ölçek adımı ve ayrı ayar paneli mevcut taşınabilir 3D nesnelerde
   çalışır. Ortografik/perspektif, farklı zoom, 10 cm grid ve döndürülmüş
   ebeveyn altındaki imported node için dünya↔yerel dönüşüm kontrol edilir.
3. **A2 — sahne nesneleri:** Empty/Group; ardından kamera ve Directional/Point/
   Spot ışıkları sürümlü kaynağa eklenir. Eski kamera/ışık görünümü değişmeden
   açılır. Aktif kamera, ışık toplamı, gölge bütçesi, gizmo ve raster sonucu
   gerçek renderda kontrol edilir; Explorer bu yeni türleri kapsar.
4. **A3 — 3D Parameters / Connections:** Önce primitive/imported/tekil
   kamera/ışık kanalları, ardından yeni nesne kanalları için private Binding
   ve Wire yazımı/önizlemesi eklenir. Birim dönüşümü, sahiplik, döngü,
   silinmiş referans, deterministik scrub, Undo/clone/save/load ve 2D'ye
   yalnız Expose köprüsü kabul kapılarıdır.
5. **A4 — parçacık:** 3D emitter ayrı kaynak/simülasyon/render dilimi olarak
   eklenir; Explorer ve Connections'a türlenmiş kanallarla katılır. Sabit seed
   ile farklı zamanlarda ileri/geri scrub, kapalı budget, clone/save/load,
   Undo, frame sequence ve iptal edilen edit kontrol edilir.
6. Her dilimde 2D Layers filtresi, klavye erişimi, türün properties'i, kaynak
   round-trip ve eski sahne uyumluluğu kontrol edilir; uygulama değişiklikleri
   için `npm test`, `npm run mcp:build`, sunucu kapalıyken `npm run build` ve
   gerçek viewport/raster incelemesi çalıştırılır.
