# Plan: Polygon / Primitive modellemenin ilk dilimi

15 Kasım 2026 · **İnceleme için öneri.** Önceki turda bu konu için kod değişiklikleri
erken yapıldı; bu belge o taslağın kabul ölçütlerini ve gerekirse düzeltilecek
noktalarını tanımlar. Plan onayı, mevcut taslağın otomatik olarak kabul edildiği
anlamına gelmez. [Modifier stack planı](model3d-modifier-stack-plan.md) ayrı
bir sonraki aşamadır. [3D Add menüsü ve sahne nesneleri](model3d-add-menu-scene-objects.md)
ayrı genişleme planıdır.

## Amaç ve kapsam

3D sahnenin **Modeling** alanı iki açık moda ayrılır:

| Mod | Bu dilimdeki durum |
| --- | --- |
| **Polygon / Primitive** | Box, Sphere, Cylinder ve Cone ekleme, seçme, özellik düzenleme ve kaldırma çalışır. |
| **Spline Extrusion** | Ayrı kaynak ve araç alanı olarak görünür; extrusion üretimi bu dilimde açılmaz. |

İki mod aynı 3D sahneye aittir. Kaynak türleri ayrı kalır; gelecekte ürettikleri
mesh, ortak modifier/render/seçim hattına girer. Bu dilimde vertex/edge/face
düzenleme, Convert to Editable Poly, modifier stack, spline extrusion, Boolean,
UV açma ve animasyon kanalı eklenmez. Imported glTF modeller aynı sahnede
görüntülenmeye devam eder; iki authored modelleme modundan biri sayılmaz.

## Kaynak sözleşmesi

- İlk authored primitive değişikliği `Model3DData` v4'e açık geçiştir;
  `modeling.version:1` içinde sıralı `objects[]` bulunur. V1–v3 yalnız açılınca
  değiştirilmez. Eski okuyucu v4'ü açıkça reddeder.
- Her nesnede sahne içinde kararlı `id`, ad, türlenmiş geometri parametreleri,
  Y-up konum, XYZ derece dönüş, pozitif ölçek ve temel renk tutulur. Box:
  genişlik/yükseklik/derinlik; Sphere: yarıçap; Cylinder/Cone:
  yarıçap/yükseklik. Authored 3D boyutlar metre temelli dünya birimindedir;
  dış 2D kutu kompozisyon pikseli olarak kalır.
- ID, yeniden sıralama, Undo/Redo, clone, portable save/load ve yeniden açma
  boyunca korunur. Clone bağımsız kayıt alır. Runtime Three nesneleri, GPU
  buffer ve türetilmiş vertex dizileri kaynak JSON'a girmez.
- En çok 16 primitive; kimlik, sayı, boyut, renk ve bilinmeyen alanlar kayıt
  sınırında doğrulanır. Gelecek spline/stack alanları `modeling.version:1` içine
  sessizce eklenmez; yeni sürüm ve dönüştürücü gerektirir.

## Gerçek ölçü ve viewport ayarları

Bu bölüm, henüz kabul edilmemiş v4 primitive taslağına **uygulama öncesi ek
kabul şartıdır**. Mevcut kod yalnız “presentation units” gösterir; fiziksel
ölçü desteği tamamlandı diye yorumlanmaz.

- **Tek hesap birimi:** 3D sahne dünyasında 1 iç birim = 1 metre. Authored
  geometri, dünya konumu, kamera ve grid aynı Y-up uzayını kullanır; içe
  aktarılan glTF node'larının yerel koordinatları kendi dosya biriminde kalır.
  UI'da en az **cm, inç (`in`) ve
  piksel (`px`)** seçilir; isteğe bağlı mm/m birimleri aynı dönüştürücüye
  eklenebilir. 1 inç = 2,54 cm; varsayılan yoğunlukta 96 px = 1 inç = 0,0254 m.
  3D `px`, varsayılan **96 px/in** yoğunluğuyla
  tanımlanan *tasarım pikselidir*; monitörün fiziksel pikseli, 2D kompozisyon
  pikseli veya zoom'a göre değişen ekran mesafesi değildir.
- **Tek dönüşüm yolu:** Giriş değeri seçili birimden metreye çevrilip
  doğrulanarak saklanır; özellik paneli ve ölçü etiketi metreden seçili birime
  çevrilir. Birim değişimi mevcut nesnelerin metre değerlerini, görsel boyunu,
  kamerayı veya Undo'daki geometriyi yeniden ölçeklemez. Örneğin 100 cm'lik
  Box genişliği, inç seçilince yaklaşık 39,37 inç görünür.
- **Global Width / Length / Height:** Ölçü panelinin esas boyutları, modelin
  3D sahne dünyasındaki eksenlere hizalı sınır kutusundan hesaplanır:
  **Width = X, Length = Z, Height = Y**. Primitive geometri parametreleri,
  nesne ve sahne ölçek/dönüşümleri; imported modelde kalibrasyon, instance ve
  node dönüşümleri hesaba katılır. 2D kapsayıcının piksel boyutu, 2D affine
  dönüşümü, kamera zoom'u ve projeksiyon bu boyutlara katılmaz. Konum yalnız
  sınır kutusunun merkezini değiştirir. Örneğin yerel Width 1 m, Length 2 m
  olan Box 90° Y dönüşünden sonra global Width 2 m, Length 1 m görünür.
  Geometri kaynağındaki Box `depth` alanı uyumluluk için korunur; UI'da
  **Length (Z)** adıyla sunulur.
- **Ölçü ve düzenleme ayrımı:** Global üç boyut, renderdaki sonucun türetilmiş
  ölçüsüdür; kaynağa ayrıca yazılmaz. Seçili nesnenin global W/L/H değerleri
  aktif birimde ve açıkça **World dimensions** başlığıyla gösterilir. İlk
  dilimde bu üç değer yalnız okunur; düzenlenebilir Width/Length/Height
  değerleri Box'ın yerel geometri parametreleridir. Dönüşmüş bir nesnenin
  eksenlere hizalı global boyutlarını bağımsız sayısal girişlerle zorlamak,
  mevcut tekil ölçek sözleşmesinde her zaman mümkün değildir. Böyle bir
  global hedef boyut komutu, dönüşüm/ölçek sözleşmesiyle ayrı tasarlanır.
  Animasyonlu modelde okuma mevcut değerlendirilmiş kareye aittir; oynatma
  kaynak geometriyi veya Undo kaydını değiştirmez.
- **Sahne ölçü sözleşmesi:** `Model3DData` v4 taslağına sürümlü ölçü ayarı
  eklenir: gösterim birimi, 3D piksel yoğunluğu ve metre cinsinden temel grid
  aralığı. Bu ayarlar sahneyle kaydedilir, clone/portable round-trip içinde
  korunur ve yerel düzenleme geçmişine girer. Kodlanmış mevcut v4 taslağı bu
  sözleşmeye uyarlanır; teslim edilmiş v4 dosyası varsa eksik alanlar tanımlı
  varsayılanla okunur. V1–v3 salt açılışta yeniden yazılmaz; ölçü ayarı ilk kez
  değiştirildiğinde açık sürüm geçişi yapılır. `showGrid` gibi görünürlük ve
  kamera inceleme durumu editör görünümünde kalır; kaynak JSON'ına ve dışa
  aktarılan görüntüye girmez.
- **Viewport Settings → Measurement & Grid:** Dört 3D çalışma alanından
  erişilen ayrı bir viewport panelinde gösterim
  birimi, fiziksel grid aralığı (ör. 10 cm), alt bölme sayısı (varsayılan 5),
  3D px/in değeri
  ve grid görünürlüğü yer alır. Birim veya px/in değişimi aralığın fiziksel
  uzunluğunu korur; panel yeni sayısal karşılığı gösterir. Sayısal alanlar
  pozitif/sonlu ve güvenli sınırlarla doğrulanır. 2D grid ayarlarına ve 2D
  kompozisyon pikseline dokunulmaz.
- **Ölçekli grid:** XZ zemin gridi orijine bağlı olarak metre cinsinden
  hesaplanır. Önerilen varsayılan temel kare **10 cm**; küçük çizgiler 5'e
  bölünür. Zoom uzaklaştıkça üst üste binen çizgiler atlanır, görünür büyük
  aralık temel uzunluğun 1–2–5 × 10^n katlarından seçilir. Zoom yaklaşınca
  temel aralık geri gelir. Viewport üzerinde **“1 büyük kare = 10 cm”** gibi
  o anda çizilen gerçek aralık gösterilir; perspektif nedeniyle ekrandaki piksel
  genişliği fiziksel ölçeğin kendisi sayılmaz. X kırmızı, Y yeşil, Z mavi
  kalır. Render alanı ve dışa aktarılan raster grid/etiket içermez.
- **İçe aktarılan modeller:** Mevcut glTF hattı modeli yarıçapı 1 olacak
  şekilde normalize eder; bu veriden gerçek cm/inç boyu güvenle çıkarılamaz.
  Eski sahnelerin görüntüsü korunur ve içe aktarılan model ölçüsü kalibre
  edilene kadar **“ölçek kalibre edilmedi”** olarak işaretlenir. Modelin ölçülen
  genişlik/yükseklik/derinliğinden birine gerçek değer girme akışı, normalize
  uzaya uygulanan tek bir instance ölçek katsayısı üretir; orijinal glTF
  vertexleri ve diğer instance'lar değişmez. Kalibrasyon kaydı instance'a ve
  asset revision'ına bağlanır; mevcut kullanıcı `instance.scale` değeri ayrı
  kalır ve nihai dünya boyuna çarpan olarak uygulanır. Bu kayıt kaynakla
  kaydedilir ve Undo/clone/portable yüklemede korunur; asset revision değişirse
  tekrar kalibrasyon gerekir. Tek eksenli kalibrasyon, dosyanın birim niyetini
  veya diğer eksenlerdeki gerçek doğruluğu kanıtlamaz.
- **Ölçü okuması:** Seçilen primitive'in global W/L/H boyutu ve dünya konumu
  aktif birimde yazılır; seçilen imported instance için kalibre edilmiş global
  sınırlar gösterilir. Kalibrasyon yoksa fiziksel birim iddiası yerine
  normalize edilmiş boyut ve “ölçek kalibre edilmedi” uyarısı gösterilir.
  Bu aşamada iki nokta arası serbest ölçüm aracı ve 3D snap komutu açılmaz;
  gridin varlığı aktif snap anlamına gelmez.

## Komutlar ve editör akışı

1. **Add primitive:** Seçilen tür için kararlı ID oluşturur, nesneyi 3D iç
   listeye ekler ve seçer. Başlangıç konumu diğer nesneleri örtmeyecek biçimde
   deterministik seçilir; kullanıcıya görünmüyorsa kadraj yeni nesneye döner.
2. **Edit properties:** Sayısal girişler geçici eksik yazımda kaynak değiştirmez;
   Enter/blur ile doğrulanıp tek yerel geçmiş adımı olur. Türün geçerli alanları
   gösterilir. Geçersiz değer kayda ve GPU'ya ulaşmaz.
3. **Remove primitive:** Yalnız hedef ID'yi kaldırır; imported örnekler ve diğer
   primitive'ler etkilenmez. Liste/viewport seçimi temizlenir. Yerel Undo geri
   getirir. Son primitive kaldırıldığında sahne boş kalabilir; kaynak sessizce
   v3'e düşürülmez.
4. **Apply / Cancel:** Detay içindeki işlemler yerel Undo/Redo kullanır. Apply
   ana sahneye tek Undo adımı yayınlar; Cancel hiçbir kaynak değişikliği yapmaz.
   Stale belge/revision Apply'ı reddeder. 2D Layers panelinde yalnız kapsayıcı
   3D sahne katmanı görünür.

Polygon ve Spline modları ayrı, klavyeyle erişilebilir düğmelerle seçilir.
Scene Explorer imported node'ları ve authored primitive'leri ayrı başlıklarla
listeler. Primitive adının yanında tür, seçim durumu ve kaldırma eylemi açıkça
görünür. Sağ panel, Polygon nesnesi seçilince yalnız o türün property alanlarını
gösterir; Texture/Material alanında temel renk düzenlenebilir. Spline modu bu
dilimde desteklenmeyen işlemi etkin bir düğmeymiş gibi göstermez.

## Render ve kaynak ömrü

- Primitive geometri, source parametrelerinden Three adaptöründe üretilir.
  Imported modellerle aynı kamera, ışık ve depth buffer içinde çizilir;
  viewport ray seçimi ve Frame selection sınırları authored ID'ye döner.
- Geometri parametresi değişmediyse mesh tekrar üretilmez. Yeni geometri
  bütçe onayından sonra yayınlanır; başarısız hazırlık eski geçerli önizlemeyi
  korur. Kaldırma, değiştirme ve composition dispose geometri/materyal/bütçe
  lease'ini bırakır. Grid ve seçim vurgusu raster çıktıya girmez.
- Portable JSON ve PNG/image-sequence raster çıktıda aynı nesneler görünür.
  Basic/native runtime ve standalone HTML için mevcut açık unsupported sınırı
  geçerlidir. MCP bu dilimde primitive yapısal ekleme/silme yetkisi ilan etmez.

## Uygulama sırası ve kabul kapıları

| Kapı | Kanıt |
| --- | --- |
| P0 — kaynak | V1–v3 uyumluluğu; v4 ölçü/primitive doğrulaması, stable ID, clone ve portable round-trip; 100 cm = 1 m, 1 in = 0,0254 m, 96 px = 1 in dönüşüm sınırları ve birim değiştirince geometri sabitliği. |
| P1 — komut | Dört tür için ekle/düzenle/kaldır; yerel Undo/Redo, Apply/Cancel, stale reddi. |
| P2 — render | Boş ve imported model içeren sahnede gerçek GPU pikselleri; 10 cm grid, pan/zoom ve perspektif/ortografik ölçek etiketi; 90° döndürülmüş ve ölçeklenmiş Box için global X/Z/Y sınırları, kamera/2D kutu değişiminde sabit ölçü; pick, frame, raster, dispose ve bütçe hatası. |
| P3 — UI | İki modun açık ayrımı; dört türün birimli property ve kaldırma kontrolleri; global W/L/H okuması; 3D Viewport Settings; imported ölçek kalibrasyonu; klavye/focus; 2D listesinde tek kapsayıcı. |
| P4 — handoff | Kod, plan, MCP/skill belgeleri aynı yetenekleri söyler; `npm test`, `npm run mcp:build`, sunucu kapalıyken `npm run build` ve gerçek tarayıcı incelemesi geçer. |

## Önerilen ilk tercihler

- İlk türler **Box, Sphere, Cylinder, Cone**; Plane/Torus sonraki ayrı kaynak
  genişlemesidir.
- Varsayılan gösterim **cm**, temel grid aralığı **10 cm**, tasarım pikseli
  yoğunluğu **96 px/in**. UI birimi değişimi fiziksel ölçeği değiştirmez.
- İlk materyal **temel renk**; PBR slotları ve UV düzenleme ayrı aşamadır.
- İlk primitive yüzey bölüm sayıları güvenli sabit değerlerdir; poligon
  yoğunluğu ve modifier'lar sonra açılır.
- Spline Extrusion modunun ayrı görünmesi bu dilimin parçasıdır; gerçek profil
  ve extrusion farklı kaynak/adapter teslimidir.
