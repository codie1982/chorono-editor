# 3D0–3D6: model detay araçları

14–16 Kasım 2026. Mevcut ortak detay host'u genişletildi. Ayrı üst düzey 3D
belge modu, geometri değiştiren editable-poly/UV araçları veya film üretim hedefi açılmadı.

## Kullanıcı akışı

1. GLB 2 veya bütün kaynakları gömülü glTF 2 içe aktarın. Dış katman normal
   2D kutudur; ana Timeline dış transform/opacity/compositing alanlarını yönetir.
2. Modeli çift tıklayın veya sağ tık **Edit content**. İlk açılış salt incelemedir.
   **Enable part editing** kaynak üzerinde açık, geri alınabilir v3 dönüşümüdür.
3. Soldaki **Scene Explorer** ağacından bu içerikteki model instance'ını veya
   onun node'unu seçin. Ağacın ve viewport'un
   seçimi ortaktır. Bu iç nesneler ana 2D Layers/Scene Explorer listesine
   eklenmez; 2D listede yalnız 3D sahnenin kapsayıcı katmanı kalır. XYZ kolları yerel parça konumunu taşır; sağdaki sayısal
   konum/dönüş/ölçek ve görünürlük alanları aynı kaynağı düzenler. Dış kutu taşınmaz.
4. 3D araç çubuğunda **Select (V), Move (G), Rotate (R), Scale (S), Pan (H),
   Orbit (O)** seçilir. Select nesneyi tıkla seçer; Move/Rotate/Scale seçili
   nesnenin renkli eksen tutamaçlarını sürükler. Select aracı da seçili nesnede
   taşıma eksenlerini gösterir. Bir eksenin çizgisine veya ucuna fareyle gelince
   çizgi kalınlaşır; sürükleme boyunca aktif kalır. Odaklı tutamaçta ok tuşları küçük
   adımlar uygular. Rotate aracı nesneyi saran üç renkli eksen halkası ve dış
   çember, Scale aracı kare uçlu üç eksen kolu ve dış çember çizer. Primitive'in
   üç eksen tutamacı kaynak şemasındaki uniform ölçeği değiştirir; imported node
   ölçeği XYZ ayrı düzenlenir. Bir sürükleme yerel geçmişte tek Undo adımıdır. Araçlar
   yalnız 3D detay görünümündedir ve 2D araç kısayollarını değiştirmez.
   Select aracındaki **Square, Circle, Freehand** seçenekleri boş viewport
   alanından sürüklenir. **Inside** nesnenin ekrana yansıtılan sınırlarının tümünü
   kapsar; **Touching** bu sınırlara değenleri de alır. Shift/Ctrl ekler, Alt
   çıkarır. Aynı çoklu seçim 3D Scene Explorer ve viewport'ta vurgulanır;
   Explorer satırlarında da Shift/Ctrl/Alt kullanılır. **Isolate selection**
   seçili nesneleri viewport ve Scene Explorer'da bırakır; içe aktarılan
   modellerin ilgili üst/alt düğümleri ağaçta korunur. **Exit isolation** tüm
   sahneyi geri gösterir. İzolasyon, seçim ve seçim alanı kaynak/Undo/çıktıya yazılmaz.
   3ds Max düzenine göre orta fare sürükleme pan, Alt+orta orbit,
   Ctrl+Alt+orta dolly yapar; tekerlek de dolly'dir. Chorono'da sol sürükleme
   seçili Pan/Orbit aracıyla gezinir; Select dışındaki araçlarda Shift+sol pan,
   Alt+sol veya sağ sürükleme pitch tilt alternatifi
   olarak kalır. Shift+sağ sürükleme kamera roll açısını değiştirir.
   Shift+tekerlek pan yapar; ayrı bir trackpad pan modu yoktur.
   Tarayıcının Ctrl+tekerlek pinch olayı zoom yapar. Safari'nin `gesturechange`
   olayı trackpad pinch ve roll'u taşır; diğer masaüstü tarayıcılarında roll
   için Shift+sağ sürükleme kullanılabilir. Odaklı 3D viewport'ta F/T/L/B Front/Top/Left/Bottom,
   P Perspective, U Orthographic ve Z / **Frame selection** kadrajdır.
   I gerçek orthographic Isometric, Chorono ekidir. 3D üst şeritteki
   **File → Keyboard Shortcuts** penceresi başlangıçta 3D Mode listesini açar;
   2D Mode ve 3D Mode bölümleri birbirinden ayrıdır.
   Viewport'ta sağ tık bırakma ve Scene Explorer satırına sağ tıklama aynı nesne
   menüsünü açar; sağ sürükleme tilt olarak kalır. Menü **Select all scene
   objects**, **Clear selection**, **Isolate selection**, tek nesnede görünürlük,
   freeze ve render işaretleri ile **Delete selected** komutlarını içerir.
   Scene Explorer'daki primitive, model instance ve iç düğüm satırlarında
   **Rename** seçilince ad satır içi girişe dönüşür. Enter tek yerel Undo
   adımıyla kaydeder; Escape veya odak kaybı düzenlemeyi iptal eder. İçe
   aktarılmış düğümün yeni görünen adı sahneye yerel override olarak yazılır;
   glTF dosyası ve sabit düğüm kimliği değişmez.
   Viewport veya Explorer odaklıyken Cmd/Ctrl+A seçilebilir nesneleri topluca
   seçer, Delete/Backspace silinebilen seçili nesneleri tek yerel Undo adımında
   kaldırır. Shift+F10 ve menü tuşu bağlam menüsünü klavyeden açar.
   Referans: [Autodesk viewport yön tuşları](https://help.autodesk.com/cloudhelp/2026/ENU/3DSMax-Basics/files/GUID-26518D1C-3F68-4D77-AAD1-3A78F0948B5C.htm),
   [pan](https://help.autodesk.com/cloudhelp/2027/ENU/3dsMax-Basics/files/viewing_and_navigating_3d_space/viewport_navigation/navigating_in_perspective_and_orthographic_viewports/zooming_panning_and_orbiting_views/GUID-802A4CCA-1695-4D91-BC30-9A4C0DAEEE5F.html),
   [orbit](https://help.autodesk.com/cloudhelp/2027/ENU/3dsMax-Basics/files/viewing_and_navigating_3d_space/viewport_navigation/navigating_in_perspective_and_orthographic_viewports/zooming_panning_and_orbiting_views/GUID-6DA741AB-9941-4957-903A-4B998C1C65E7.html),
   [fare düzeni](https://help.autodesk.com/cloudhelp/2023/ENU/3DSMax-Customizing/files/GUID-75E03BAB-0D94-43E0-B281-3AE3299BD2B9.htm),
   [wheel/pinch olayı](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event),
   [Safari GestureEvent](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html).
   Küpteki yüzler eksen bakışlarını, altındaki üç küçük simge Perspective,
   Orthographic ve Isometric projeksiyonlarını seçer. Bu inceleme seçenekleri
   source/key yazmaz. **Use view for output** açıkça çıktı kamerasını
   değiştirir. Sağ üstteki yön küpünün yüz/kenar/köşesine tıklama hazır bakışa,
   küpü sürükleme orbit'e geçer. Küp klavyeyle odaklanır; ok tuşları 45° döndürür,
   odaklanan yön Enter/Space ile seçilir. Ana viewport'taki önceki 3D camera
   toggle ise çıktı kamerası aracıdır.
5. Seçili parçanın PBR material bölümünden renk, roughness, metalness, opacity
   ve hazırlanmış gömülü texture slotlarını değiştirin. Işık XYZ/renk/şiddet,
   ortam rengi/şiddeti/exposure ve 512 px self-shadow seçenekleri içeriktedir.
6. **Native animation** bölümünde gömülü klibi seçin. In/out, speed, loop ve
   Follow scene/content time / Authored pose time seçimleri vardır. Klipsiz
   içerikte de yerel preview transport'u çalışır. Bone/mesh kanalları ana 2D
   Timeline'a kopyalanmaz. Native TRS'nin sahibi olduğu alanlar elle keylenmez.
7. **+ Clip** ile kendi içerik klibinizi oluşturun. Mevcut Set Key, Keys ve Curve
   motoru node TRS/görünürlük, assembly placement ve native `timeMs` kanallarını
   düzenler. Native klibin sahibi olduğu TRS, açık parametreyle sürülen alanlar
   ve turntable Y dönüşü key listesinden çıkarılır. Native pose zamanı keylenince
   otomatik saat o kanala tekrar yazmaz. Klibin loop/hold zamanı native oynatımla ortaktır.
8. Viewport sol üstündeki dikey araç şeridinin **küp +** menüsünden mevcut bir
   imported asset'i seçip
   **Add model** ile aynı 3D içeriğe
   ekleyin; üst sınır sekizdir. Modeller kamera, ışık ve depth buffer paylaşır.
   Ayrı dış 2D kutular ortak bir dünyaya otomatik birleştirilmez.
9. **Exposed parameters** desteklenen model/kamera veya içerik numeric/visibility
   alanını açık input'a dönüştürür. Apply sonrasında ana Properties'deki bu
   alanlarda mevcut Wire ve constant/live expression akışı kullanılabilir.
   Turntable ve uygun assembly'de explode hazır presentation kontrolleridir.
10. **Apply & return** bütün taslağı tek ana Undo ile yayınlar. Cancel/Discard,
    source değişikliği ve bekleyen gesture güvenli biçimde korunur. Yerel history
    20 adım / 16 MiB politika sınırındadır. Portable JSON kaydet/aç desteklenir.
11. Viewport sol üstündeki **küp +** menüsünde Polygon / Primitive satırındaki Box
    hızlı ekleme düğmesidir. Fareyle üzerine gelince, uzun basınca veya klavyede
    sağ/aşağı okla Box, Sphere, Cylinder, Cone ve Plane ikonları açılır. Seçilen
    primitive aynı 3D sahneye eklenip seçilir. Nesneler Scene Explorer'dan veya
    viewport'tan seçilir; sağ panelde ad, boyut, konum, dönüş, ölçek ve renk
    düzenlenir. Explorer satırındaki kaldırma ikonu veya iki görünümün sağ tık
    menüsü nesneyi siler. Birden fazla nesne seçiliyse kaynak tek seferde güncellenir;
    eklenmiş imported modelin birkaç düğümü seçili olsa bile instance bir kez
    silinir. Ana imported asset ve iç düğümleri kaynak modelden ayrılmaz; bunlar
    için silme komutu pasiftir. Yerel Undo/Redo
    ve Apply/Cancel diğer 3D içerik
    işlemleriyle aynıdır. En çok 16 primitive eklenir; imported modellerle aynı
    kamera, ışık ve depth ortamını paylaşırlar. **Spline Extrusion** ayrı modelleme
    modudur, ancak profil extrusion üretimi henüz etkin değildir.
12. Viewport sol üstündeki dişli **Viewport settings → Measurement & Grid**
    dört 3D çalışma alanından açılır.
    Metre, santimetre, inç veya tasarım pikseli seçin; `px` yoğunluğu başlangıçta
    96 px/in'dir. Temel grid karesi başlangıçta 10 cm ve beş alt bölümdür.
    Görünür büyük kare aralığı zoom'a göre seyrelir ve viewport'ta gerçek uzunluğu
    gösterilir. Grid görünürlüğü yalnız bu editör görünümündedir; Render ve çıktı
    temizdir. Seçili nesnenin **World dimensions** bölümü Width=X, Length=Z,
    Height=Y değerlerini dönüşmüş dünya sınır kutusundan salt okunur gösterir.
    Box'ın yerel boyutları, 3D sahne/instance yerleşimi ve kayıtlı kamera/ışık
    doğrusal alanları aktif birimde düzenlenir; açılar derece, ölçek boyutsuz,
    imported node transformları yerel glTF birimindedir. İçe aktarılan modeller
    fiziksel boyutu kendiliğinden bildirmez; bilinen bir instance eksen uzunluğu
    girilip **Calibrate instance** seçildiğinde yalnız o instance metreye
    ölçeklenir. Kalibrasyon yeniden yapılabilir ve Undo ile geri alınabilir.
13. **Empty 3D Scene** ilk eklendiğinde 2D editör görünümünde koyu bir 3D
    viewport kartı, gerçek kamera gridi ve düzenleme çağrısı gösterilir. İçine
    ilk model veya primitive eklenince normal 3D render görünür. Bu kart yalnız
    editör önizlemesidir; oynatma, raster çıktı ve export boş sahnenin gerçek
    şeffaf piksellerini korur.
14. 3D detay editörü **Scene Explorer**, **3D Viewport** ve **Properties**
    panellerini kendi koyu dock düzeninde açar. **Animation** alanında
    **Content Timeline** dördüncü panel olarak altta açılır. Başlıkları başka
    panele sürükleyerek sekme veya kenara bırakarak ayrı bölme oluşturun;
    ayırıcıları sürükleyin ya da odaklanmış ayırıcıda ok tuşlarını kullanın.
    Paneller daraltılabilir. **Panels** menüsü kapalı panelleri geri getirir ve
    düzeni sıfırlar. Viewport kapatılamaz; **Focus view** geçici olarak yalnız
    viewport'u gösterir. Dar pencerede paneller sekmelerle açılır. Yerleşim
    `chorono.model3d.panels.v2.<workspace>` anahtarlarında yalnız tarayıcıda tutulur; 2D dock,
    sahne JSON'u, Undo geçmişi ve dışa aktarılan görüntü bundan etkilenmez.
    Animation alanının özel klibi artık 3D Timeline, nesne/özellik ağacına sahip
    Dope Sheet ve sayısal Curve Editor görünümlerini paylaşır. Sahne, kamera,
    imported node/instance, authored primitive, ışık/ortam ve uygun materyal
    alanları X/Y/Z dahil keylenebilir. Primitive keyleri sabit nesne ID'sine
    bağlanır; alt Properties panelindeki elmas yalnız seçili özel klibe key yazar.
    Ana 2D Timeline kendi katman keylerini göstermeye ve düzenlemeye devam eder;
    3D modelin iç keyleri oraya taşınmaz. Kanal, sınır ve kalan işler
    [animasyon planında](plans/model3d-animation-timeline-plan.md) belgelenir.
15. 3D detay açılınca ana 2D ikon şeridi yerine koyu **3D** üst şeridi ve
    Modeling / Animation / Render / Texture & Material çalışma alanları gelir.
    Seçim, taşıma, döndürme ve ölçekleme araçları viewport'un kendi araç
    satırındadır; böylece 2D ile 3D araçları aynı anda görünmez. Seçili statik
    mesh/primitive turuncu siluet çizgisiyle, XYZ eksenleri kırmızı/yeşil/mavi
    çizgilerle belirtilir. İçe aktarılan skinned/instanced veya çok büyük
    meshlerde siluet yerine turuncu dünya sınır kutusu gösterilir. Bu yardım
    çizimleri yalnız inceleme görünümündedir, kaynağa veya çıktıya yazılmaz.
16. Tek, görünür ve donmamış Box/Sphere/Cylinder/Cone/Plane seçiliyken viewport
    veya Scene Explorer sağ tık menüsünden **Edit Mode** açılır. Modeling ve
    Properties > Modifiers görünür. Object, Vertex, Edge, Border, Polygon ve
    Element modlarında mantıksal mesh bileşenleri tıklanır; Shift/Ctrl ekler,
    Alt çıkarır, Cmd/Ctrl+A geçerli moddaki tüm bileşenleri seçer. Seçilen
    bileşenler viewport'ta vurgulanır, tek seçim için yerel koordinat, kenar
    uzunluğu veya polygon alanı salt okunur gösterilir. Bu değerler nesnenin
    **yerel uzayındadır**; uzunluk seçili cm/in/px/m, alan aynı birimin karesiyle
    etiketlenir. Dünya boyutları Object sekmesinde ayrıdır. Box 8 vertex, 12 edit
    edge ve 6 quad polygon taşır; render üçgen diyagonali edit edge değildir.
    Border yalnız açık sınırda, Element bağlı yüz adasında çalışır. Escape veya
    **Exit Edit Mode** çıkış yapar. Nesne gizlenir, dondurulur, silinir,
    izolasyon dışında kalır, başka nesne seçilir veya Modeling alanından
    çıkılırsa Edit Mode kapanır. Topoloji değiştiren Undo/Redo da modu kapatır;
    yalnız ölçü değişirse kimlikler korunur. Bu geçici mod/seçim kayıt ve Undo'ya girmez;
    modifier stack'te yalnız parametrik base görünür. Geometri değiştiren Edit
    Poly komutları ve kalıcı modifier uygulaması sonraki teslimlerdir.

## Kaynak ve sahiplik

`Model3DData` v1 statik kutuları ve v2 sayısal klipleri dönüştürmeden okur.
Parça düzenleme v3 ve `content.version:1` kullanır. Primitive ekleme açık v4
terfisidir; `modeling.version:1` içinde yalnız polygon primitive kayıtları vardır.
Eski okuyucular bilmedikleri kaynak sürümünü reddeder;
özellikleri sessizce düşürerek dosyayı yeniden kaydetmez.

- `content.instances.primary.assetId` dış `assetId` ile aynıdır. Her slotta asset
  kimliği, özgün dosya byte'larının SHA-256 revision'ı, okunur ad, placement,
  `nodes`, `materials` ve isteğe bağlı `native` klip kaynağı vardır.
- `n0` gibi node kimlikleri glTF node indeksidir; isim eşleştirmesi değildir.
  `m0` material ve `c0` klip indeksleri aynı asset revision'ına bağlıdır.
  Referansı kayıp/değişmiş kaynak otomatik yeniden eşlenmez; açık hata verir.
- Node pozları glTF parent-local birimlerinde, dönüşleri XYZ Euler derecedir.
  Negatif/sıfır imported node scale kaynakta korunur. Dünya yerleşimi, kamera
  uzaklığı ve primitive geometri için 1 kaynak birimi = 1 metredir. Import edilen
  asset önce rest bounding sphere yarıçapı 1 olan normalize alana alınır; bu
  fiziksel ölçü bildirmez. `content.instances[id].calibration` asset revision'ına
  bağlı metre/normalize-birim katsayısıdır ve yalnız o instance'a uygulanır.
  Farklı asset'lerin fiziksel ölçüsü otomatik eşit varsayılmaz. Vertexler veya
  özgün glTF node transformları yeniden yazılmaz.
- `content.animation` yoktur: özel klipler mevcut `model3d.animation` alanındadır.
  Persist edilen hedef kökü `layers.content...`; detay projection'ında gerçek
  owner ID'sine geçer. Ana sahnenin global Timeline dizisi değiştirilmez.
- Native klip `channels` envanteri decoded revision ile doğrulanır. Quaternion
  rotation bütün vektörün sahibidir; tek bir bileşeni ikinci yazarla ezmek yasaktır.
  Native `timeMs` key authoring'i desteklenir; tam bone/weight/IK editörü değildir.
- Parametre tanımı (name/type/min/max/target/value) aynı sürümlü kaynağa aittir.
  Her hedefin tek parametresi olur. Key/native/turntable ile sahiplik çatışması
  reddedilir. Numeric frame değerleri güvenli aralığa sınırlandırılır.
- Thin live kopyaların `Layer.model3dInputValues` kaydı yalnız açık input değerlerini
  taşır; geometri/klip/parametre tanımı kaynaktan miras alınır. Copy kendi tam
  kaynağına sahiptir. Live örneğin input'ları ayrıca key/Wire/expression alabilir.
  Kaynakta kaldırılmış/tipe veya aralığa uymayan override açık hatadır; sessiz kayıp yoktur.
- Runtime `content.timeMs`, inspection kamerası/seçim/grid tercihi, Three nesneleri, mixer,
  decoded bitmap ve GPU buffer'ları ordinary source/undo kaydına yazılmaz.
- Kamera `roll` açısı derecedir, `[-180, 180]` aralığındadır ve eski kaynaklarda
  yoksa 0 kabul edilir. İnceleme hareketi kaynak yazmaz; **Use view for output**
  roll dahil kamera açısını kaydeder. Küpte hazır bir yön seçmek roll'u sıfırlar.
- v4 `modeling.objects[]` stable ID, ad, türlenmiş geometri, Y-up konum/dönüş,
  ölçek ve temel renk taşır. Box genişlik/yükseklik/derinlik; Sphere yarıçap;
  Cylinder/Cone yarıçap/yükseklik kullanır. Tüm boyutlar metredir; Box `depth`
  kaynak alanı uyumluluk için korunur ve UI'da Length (Z) diye gösterilir.
  Spline profili, editable-poly topolojisi ve modifier kaydı bu v1 modelleme
  kaynağında bulunmaz. Bunlar daha sonraki sürümlü kaynak genişlemeleridir.
- Primitive mantıksal half-edge mesh'i parametrik kaynaktan deterministik
  üretilir; v4'ün örtük üretici sürümü `1`dir. Render üçgenleri ve UV/normal
  nedeniyle kopyalanan render vertex'leri aynı mesh'in face-corner verisinden
  türetilir. Kopya render vertex, yeni geometrik vertex veya border değildir.
  Sphere/Cylinder UV dikişleri kapalı yüzeyi açık hale getirmez.
- `modelEditBase` sampled kardeşleri, özellikle parametreden hesaplanan fallback'leri,
  authored base'e taşımayı engeller.

## Bakım girişleri ve veri akışı

| Sorumluluk | Gerçek giriş |
| --- | --- |
| Kaynak/limit/dependency | `src/lib/model3d/content/modelContent.ts`, `types.ts`, `assertInstanceInventory.ts` |
| Fiziksel birim, grid adımı, kalibrasyon | `src/lib/model3d/measurement/modelMeasurement.ts`, `gridSpacing.ts`; `src/components/detail/model3d/ModelViewportSettings.tsx`, `ModelWorldDimensions.tsx` |
| v1–v4 kaynak doğrulama | `src/lib/model3d/source/modelDefaults.ts` |
| Kimlik/decoded metadata | `src/lib/model3d/resources/modelInventory.ts`, `ModelAssetService.ts` |
| Pose/skeleton/material sahipliği | `src/lib/model3d/render/ModelPose.ts` |
| Ortak 3D dünya/selection/camera | `src/lib/model3d/render/ModelComposition.ts`, `inspection/types.ts` |
| Polygon primitive kaynak/komutları | `src/lib/model3d/modeling/poly/primitiveSource.ts` |
| Primitive mesh/lease sahibi | `src/lib/model3d/modeling/poly/PrimitiveScene.ts` |
| Edit Poly mantıksal topoloji/picking | `src/lib/model3d/modeling/poly/meshSnapshot.ts`, `PrimitivePolyView.ts`, `editSelection.ts`; `src/components/detail/model3d/ModelEditPolyPanel.tsx`, `ModelPolyOverlay.tsx` |
| İki modelleme modu ve primitive UI | `src/components/detail/ModelDetailWorkspace.tsx`, `model3d/ModelAddMenu.tsx`, `model3d/ModelPrimitiveInspector.tsx` |
| 3D seçim ve bağlam menüsü | `src/lib/model3d/inspection/modelSelection.ts`, `src/components/detail/model3d/modelSceneContextMenu.ts`, ortak `src/components/ui/ContextMenu.tsx` |
| Toplu nesne silme | `src/lib/model3d/source/modelSceneDeletion.ts`, `src/lib/model3d/animation/removeInstanceTracks.ts`, `src/components/detail/ModelDetailWorkspace.tsx` |
| 3D nesne adlandırma | `src/lib/model3d/source/modelSceneRename.ts`, `src/components/detail/model3d/ModelSceneExplorer.tsx` |
| Editör grid ve yön küpü | `src/lib/model3d/render/ModelInspectionGrid.ts`, `inspection/viewDirections.ts`, `src/components/detail/model3d/ModelViewCube.tsx` |
| Seçim silueti ve eksenler | `src/lib/model3d/render/ModelSelectionOutline.ts`, `ModelComposition.ts`, `src/components/detail/model3d/ModelTransformOverlay.tsx` |
| 3D üst şerit | `src/components/detail/model3d/ModelDetailHeaderHost.tsx`, `ModelWorkspaceNavigation.tsx` |
| 2D editörde boş 3D sahne görünümü | `src/lib/model3d/render/EmptyModelScenePreview.ts`, `modelRendererPlugin.ts` |
| Kamera hareketleri | `src/lib/model3d/inspection/cameraNavigation.ts`, `src/lib/model3d/source/cameraGesture.ts`, `src/components/detail/model3d/ModelViewport.tsx` |
| 3D araç, seçim ve dönüşüm | `src/lib/model3d/inspection/viewportTools.ts`, `modelSelection.ts`, `transformSelection.ts`, `src/components/detail/model3d/ModelViewportTools.tsx`, `ModelSelectionControls.tsx`, `ModelGizmoSession.ts` |
| 3D kısayol sözleşmesi | `src/lib/model3d/inspection/viewShortcuts.ts`, `viewPresets.ts`, `src/components/panels/KeyboardShortcutsPanel.tsx` |
| Bounded native backend | `src/lib/model3d/render/ThreeModelBackend.ts` |
| Kesin frame/instance kontrolü | `src/lib/model3d/animation/modelClipFrame.ts`, `modelContentClock.ts`, `modelCandidates.ts` |
| Kaynak/yerel key ayırımı | `content/modelEditBase.ts`, `animation/modelChannels.ts` |
| Scoped publication | `src/lib/editor/detail/ModelClipDraft.ts`, `ItemDetailSession.ts`, `ModelSourceDrivers.ts` |
| Detay UI | `src/components/detail/ModelDetailWorkspace.tsx`, `model3d/` |
| 3D panel düzeni | `src/components/detail/model3d/ModelPanelDock.tsx`, `modelPanelLayout.ts`; ortak `src/components/dock/` yerleşim işlemleri |
| Main input adapters | `content/modelInstanceInputs.ts`, registry schema, mevcut Wire/expression altyapısı |

Frame sırası: root Timeline/SM base → özel numeric klip → ortak içerik/native saat
→ parameter/binding → mevcut Wire/live expression → açık input'un tek hedefi
→ immutable render projection → hazır medya → native 3D → 2D compositor.
Klipler kaynakla sabit zamanda örneklenir; her instance yeni rAF başlatmaz.
Mikser her frame reset/absolute seek yapar. Geometri ve texture immutable paylaşılır;
her slot skeleton, TRS/morph state ve material kopyalarını ayrı tutar.

Primitive akışı: `ModelAddMenu` → saf `addPrimitive`/`removePrimitive`/
`updatePrimitive` → mevcut `ModelClipDraft` kaynak doğrulaması ve yerel komut
geçmişi → v4 portable JSON → `ModelComposition` → `PrimitiveScene` → ortak Three
render. `PrimitiveScene` değişmeyen geometriyi yeniden kullanır; geometri
parametresi değişince yenisini admission/lease ile hazırlar, sonra eskisini
bırakır. Silme ve composition dispose, mesh/material/geometry ve bütçe lease'ini
serbest bırakır. Kaynak/Y-up konum birimleri ile renderer transform'u aynıdır;
2D kutunun piksel transform'u ayrı kalır. Örnek kaynak kullanımı:

```ts
const next = addPrimitive(modelSource, preparedInventory, 'box', stableObjectId)
validateModel(next)
// Detail editor: updateLayer({ ...layer, model3d: next })
// Apply, bu özel taslağı ana sahneye tek Undo adımı olarak yayınlar.
```

### Fiziksel ölçü ve grid — 15 Kasım 2026

`model3d/measurement/modelMeasurement.ts` birim dönüşümü, v4 ölçü ayarı
doğrulaması ve import kalibrasyon komutunun tek kaynağıdır. `Model3DData.measurement`
eksik eski v4 ve v1–v3 sahneler varsayılan cm, 96 px/in, 0,1 m temel aralık,
beş alt bölme ile okunur; açılış kaynak yazmaz. İlk ayar veya kalibrasyon işlemi
`withModelContent` üzerinden açık v4 terfisi yapar; `modeling.version:1`
boşsa eklenir. `updateModelMeasurement(data, primaryInventory, {unit:'in'})`
gösterimi değiştirir, saklanan metre koordinatlarını ve grid uzunluğunu değiştirmez.
`calibrateModelInstance(data, primaryInventory, id, observedWorldSpan, knownMeters)`
yalnız seçili import slotunun revision'a bağlı katsayısını değiştirir. Aynı
dosyadan birden çok slot varsa diğerlerine dokunmaz. Revision değişirse envanter
kontrolü kalibrasyonu reddeder; yeniden kalibrasyon gerekir.

`gridSpacing.ts` kamera/projeksiyon ve temel metre aralığından yalnız görünür
1–2–5 çizgi aralığını hesaplar; `ModelInspectionGrid` tek shader/çizgi kaynağını
oluşturur ve composition dispose sırasında bırakır. `ModelViewport` bu hesabı
etikette kullanır. `ModelComposition.measure` örneklenmiş görünen geometriyi
world AABB'ye çevirir. Width X, Length Z, Height Y'dir. Dönen nesnenin yerel
geometri parametreleri bu salt okunur üç global ölçüye geri yazılmaz. İçe
aktarılmış içerik kalibre edilmediyse panelde `normalized` gösterilir; gerçek
metre izlenimi verilmez. Ölçü mevcut sampled kareyi okur ve kaynak/Undo üretmez.
`showGrid` ve inceleme kamerası kaynak JSON'u dışında kalır. Raster/export
inspection geçirmediği için grid çizmez. 3D px tasarım yoğunluğudur; 2D canvas
ve monitör pikseliyle paylaşılmaz. 3D snap bu sürümde yoktur; daha sonra aynı
kayıtlı temel metre aralığına bağlanabilir.

### 3D inspection grid ve yön küpü — 15 Kasım 2026

`ModelInspection.showGrid` yalnız geçici editör görünümü ayarıdır. Modeling,
Animation ve Texture/Material alanları bu bayrağı açar; Render alanı kapatır.
Çıktı/MCP/raster çizimleri inspection geçirmediğinden grid ve Y göstergesi
çıktıya girmez. Grid glTF içerikten bağımsızdır, seçim ray'i yalnız model
placement grubunu tarar. Tek prosedürel XZ düzlemi kamera hedefini izler,
1–2–5 ölçekli çizgileri shader ile üretir ve uzaklıkta saydamlaşır; her pan/zoom
için yeni mesh/texture oluşturmaz. X kırmızı, Z mavi zemin eksenidir. Y yeşil
dikey orijin göstergesidir. Grid/çizgi GPU kaynakları composition dispose ile
bırakılır. Bu görsel sınırsızlık, kamera uzaklığı .1..1000 sınırını değiştirmez.

Y-up ve +Z-front sözleşmesinde küpün 26 yönü, yön vektöründen yaw/pitch olarak
hesaplanır. Tıklama projeksiyon, hedef ve uzaklığı korur; inceleme kamerasını
değiştirir, source yazmaz. `Use view for output` bu açıyı mevcut v1–v4 kamera
alanına kaydeder. Tam üst/alt görünüm ±90° pitch kullanır; renderer bu kutuplarda
yaw'a bağlı yatay up vektörü seçer. Kaynak, sayısal property ve içerik klip
sınırları aynı ±90° aralığını kabul eder. Yeni bir JSON sürümü gerekmez.
Yön küpü her görünür yüzü tek poligon ve tek seçim hedefi olarak çizer; köşeler
küçük nokta hedefleridir. Kenar hedefleri görünür çizgileri bölmeden 26 yönü
korur. Yüz, köşe ve kenar hedefleri klavyeden de etkinleştirilebilir.

3D Scene Explorer yalnız kaynakta bulunan içe aktarılmış modelleri ve oluşturulmuş
primitive nesneleri listeler. Çıktı kamerası ve ortam ışığı ayar olarak kalır;
nesne satırı oluşturmaz. Dolu türler otomatik koleksiyonlara ayrılır; boş 3D
sahnenin primary kabı görünmez. Nesne ve içe aktarılmış düğümlerdeki göz
`visible`, kar işareti `frozen`, çıktı işareti `renderable` alanını ayrı ayrı
değiştirir. Eski dosyalarda bu alanlar yoksa nesneler görünür, seçilebilir ve
çıktıya girer. `frozen` editörde pick ve gizmo seçimini engeller; `renderable`
yalnız çıktıyı etkiler. Viewport **küp +** menüsündeki primitive paleti Box, Sphere,
Cylinder, Cone ve XZ düzlemindeki Plane için ikon kullanır; Plane genişlik ve
uzunluk ölçüsünü metre temelli kaynakta saklar.

Scene Explorer `ModelContent.instances` ile hazır model envanterini ve primitive
kaynağını okur. Yalnız sahnede bulunan instance/node hiyerarşisini, primitive,
mesh ve material alt satırlarını gösterir; kamera/ışık sanal satırı üretmez.
Arama, dalları açma/kapatma, görünürlük gözleri ve izolasyon buradadır. Göz
değişiklikleri source üzerinde yerel Undo adımıdır. Kaynak kimlikleri viewport
pick ve inspector ile aynıdır. Explorer, 2D sahnenin `Layer[]` listesine yeni
kayıt eklemez. Dolayısıyla 2D
modundaki tek 3D sahne kapsayıcısı korunur ve iç 3D node/instance'lar 2D katman
işlemlerine karışmaz. Görünüm/pan/tilt değişiklikleri geçici inspection kamerasında
kalır; yalnız **Use view for output** kayıtlı kamerayı değiştirir.

`ModelInspection.clipNear/clipFar` yalnız editör kamerasının metre cinsinden
görüş aralığıdır; kaynak/çıktı 0,001–10000 m varsayılanını korur. Dişli menüsünde
Inspection/Scene output kamera önizlemesi, %90 safe area, pencereye yayılma,
kare veya composition en boy oranı seçilir. Bu tercihler kaynak/Undo'ya girmez.
Şimdilik tek kayıtlı output kamera vardır; ek kamera nesnesi eklenince liste
genişletilebilir. Geometri LOD varlıkları henüz üretilmediğinden **Geometry**
bölümü yalnız durum açıklar; etkisiz LOD seçimi yoktur. `viewportFrameSize`
gerçek CSS alanını hesaplar; render, picking ve grid aynı oranı kullanır.
Kısayol metni viewport altında yer kaplamaz; 3D üst şeridin File menüsünden
okunur. Bu menü, uygulanmamış 3D taslak sırasında dosya komutlarını sunmaz;
**Apply & return** sonrasında ana sahnenin File komutları tekrar kullanılabilir.

Viewport dişli menüsünün açılır Camera, Guides, Framing, View depth,
Measurement units ve Geometry bölümleri yalnız etkin kontrolleri gösterir:

| Ayar | Etki ve sahiplik |
| --- | --- |
| Preview camera | Geçici inspection veya kaynakta kayıtlı tek output kamerayı gösterir; hareket inspection'a döner. |
| Use view for output | Görünen kameranın yön/projeksiyonunu 3D taslağa yazar; Apply ile yayınlanır. |
| Frame selection | Seçime göre geçici kameranın hedef ve uzaklığını değiştirir. |
| Grid on viewport floor | Modeling, Animation ve Texture/Material'da editör gridini açar; Render/çıktıda görünmez. |
| Base grid spacing / Grid subdivisions | Kaydedilen metre tabanlı grid aralığı ve shader'ın küçük çizgi sayısıdır; büyük çizgiler zoom ile seyrelir. |
| 90% safe area guide | Yalnız viewport üstündeki çerçevedir; çıktıya yazılmaz. |
| Viewport shape | Pencere, kare veya composition oranına göre gerçek çizim ve picking alanını seçer. |
| Near/Far clip | Yalnız inspection kamerasının metre cinsinden görünür derinliğini değiştirir; çıktı sabit sınırını değiştirmez. |
| Display unit / Design pixels per inch | Kaydedilen ölçü gösterimi ve `px` dönüşüm yoğunluğudur; kaynak geometri metre kalır. |

Sayısal kontroller 2D Properties ile aynı `ScrubInput` metin/sürükleme
arabirimini kullanır. Geçersiz taslak kaynak değişikliği yapmaz.

Medyalar mevcut queue/lease/source-pin/cache sistemine bağlıdır. Sekiz cache girişi,
128 MiB model residency, 16 MiB dosya ve decoded admission sınırları devam eder.
Pose kopyaları shared 512 MiB ledger'dan admission alır. Render yüzeyi 2048 px uzun
kenar / 16 byte-pixel politika tahmini; her açık shadow world ayrıca 512²×8 byte
ayırır. Bunlar toplam işlem RAM'i/driver GPU belleği değildir. Secondary asset
silindiğinde diğer composition'ların onu borçlanan pose'ları, source geometry
bırakılmadan önce yok edilir. Cancel/abort consumer pinlerini bırakır. Idle cache sınırlar içinde LRU olarak
kalabilir; cache eviction/clear işlemi native kaynakları dispose eder. Fiziksel
RAM’in son pin bırakılır bırakılmaz anında düşeceği iddia edilmez.

### Minimal kullanım

Native UI yolu **Import → Edit content → Enable part editing → select node →
edit → Apply**'dır. Repository içindeki küçük domain kullanımı:

```ts
const lease = await modelAssetService.acquire(asset, { signal })
try {
  const inventory = lease.value.inventory!
  const node = inventory.nodes[0]
  if (!node) throw new Error('No editable imported node')
  const source = withModelContent(modelDefaults(asset.id), inventory)
  source.content!.instances.primary.nodes[node.id].position.x += 0.2
  validateModel(source)
  // Publish only through the owning detail command; native resources stay leased.
} finally { lease.release() }
```

Bu örnek bir MCP/script metodu ilan etmez. MCP import/static `update_model3d`,
`get_scene`, preview ve portable çıktı mevcut sözleşmelerini korur. Katalog v4
kaynağı/native UI yeteneklerini bildirir; genel patch ile node/klip/primitive
kaynağı üretme yetkisi açılmadı. Her MCP source mutation için güncel
revision/readToken gerekir.

## Açık sınırlar

Texture düzenleme mevcut UV ve hazırlanmış gömülü texture indeksleriyle sınırlıdır;
Color-space uyumsuz texture-slot atamaları reddedilir.
UV unwrap/paint, yeni harici texture/HDRI importu, normal oluşturma ve genel material
node graph yoktur. PBR dışı imported material'lar görüntülenir; bu override editörü
onları PBR diye yeniden yorumlamaz. Material ID override'ı aynı slotta o material'ı
kullanan bütün parçaları etkiler; başka instance'ı değiştirmez.

Self-shadow sınırlı 512 px directional gölgedir; harici zemin/HDRI stüdyo motoru
veya kutular arası shadow/depth değildir. Imported kamera import/seçimi, FBX/OBJ/3DS,
rig kurma/weight paint/IK, native bone eğrilerinin tam editörü ve 3D solver'lar bu
paketlerde ilan edilmez. XYZ gizmo seçili node/primitive için Move, Rotate ve
Scale uygular; primitive scale kaynak şemasında uniformdur. Top preset tam 90° pitch kullanır;
renderer kutup up vektörüyle tekilliği önler. Explode tek mesh'i parçalamaz; unary wrapper'lar altındaki ilk
çok parçalı assembly dallarını ayırır. Basic/native player ve standalone HTML
boxed 3D'yi açıkça reddeder; portable source ve hazırlanmış raster desteklenir.
Alan seçimi görünür geometrinin ekrandaki sınır kutusunu kullanır; mesh siluetine
göre piksel düzeyinde seçim yapmaz. Derinlikte tamamen kapanmış ama görünür
durumdaki bir nesne, sınırı alana giriyorsa seçilebilir.

## Doğrulama

- Domain/source: gerçek GLTFLoader fixture'ında node/asset revision, iki ayrı pose,
  skeleton/morph absolute seek, native TRS sahipliği, bool/node/native-time key'leri,
  ortak loop saati, template/instance Wire-expression, sampled fallback koruması,
  scoped Apply/stale/Undo ve shadow/pose bütçe kapanışı.
- Browser: `node scripts/model3d/prepare-packages-browser.mjs`; çıktı klasörünü
  `node scripts/perf/serve.mjs /private/tmp/chorono-3d-packages-browser 4337` ile açın.
  **Run rendered acceptance** gerçek viewport draw adapter, MCP PNG dispatcher ve
  raster encoder'ı karşılaştırır. UI flow aynı sayfadaki **Open 3D detail**'dedir.
- İlk gerçek render kabulü: iki model, native skin+morph ve dış 2D key, 9 seek
  örneği/24 kontrol, her RGBA kanalında fark 0; sonunda yönetilen charge/entry 0.
  Nihai derleme/test ve UI kabul sonuçları aşağıdaki teslim kaydında tutulur.

### Teslim kaydı — 14 Kasım 2026

- `npm test`: **382 dosya / 3.116 test** geçti.
- `tsc --noEmit`, `npm run mcp:build`, `npm run cli:build`, `npm run build` geçti.
  Next'in mevcut `applicationBuildInfo.ts` named JSON import uyarısı sürer.
- Gerçek Chrome/WebGL: **9 zaman / 24 kontrol**, viewport/MCP PNG/raster tüm
  RGBA kanal farkları 0; ileri/geri seek ve portable reopen eşleşir.
- 512 MiB ledger: tepe **4.583.630 byte (4,37 MiB)**; sonunda charge/entries 0,
  denial 0. Küçük aynı-browser fixture; Four Seasons veya toplam RAM ölçümü değildir.
- Eski statik detay **6/6**, eski numeric model klip **6/6** browser akışı geçti.
- Yeni native ilk XYZ drag bir yerel Undo; inspection source'u değiştirmedi;
  üçüncü model/material/kamera/node key/Curve Apply tek ana Undo; Undo/Redo ve
  Cancel kaynak koruması geçti. Parametre sampled fallback'i kaynakta 0 kaldı.
- Yerel kanıt: `/private/tmp/chorono-3d-packages-render-result.json`,
  `chorono-3d-packages-ui-result.json`, `chorono-3d-packages-legacy-result.txt`,
  `chorono-3d-packages-detail.jpg`. Sürekli yeniden üretim kaynağı yukarıdaki
  repository fixture/testleridir; geçici dosyalar ürün kaynağı değildir.

Hiçbir yeni sınıf 300 implementation satırı sınırını aşmaz. Büyük mevcut
Properties/registry/evaluator dosyaları yalnız gerekli dar adapter noktalarında
zenginleştirildi; ilgisiz repository yeniden düzenlemesi yapılmadı. MCP'nin
revision/readToken/authoring-ledger sözleşmeleri değişmedi. İşler mevcut geliştirme
dalındadır; bu teslim merge/push/release talebi değildir.
