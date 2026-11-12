# Ortak 3D İçerik Editörü, model kutusu ve gelecek runtime sınırı

12 Kasım 2026 kullanıcı kararı. İlk kutulu model diliminin sınırı güncellenir;
tam iç sahne/Timeline ekranı bu belgede **planlanır**. 13 Kasım'da ortak
host'un temel sabit model yerleşimi ekranı [DET0–DET1 ile uygulandı](../item-detail-editor.md);
iç node/klip/rig Timeline'ı henüz yoktur.
Sonraki kullanıcı kararıyla ekran Shape/Poly, image/texture, video ve component
için de kullanılacak [ortak öğe detay host'unun](shared-item-detail-editor.md)
3D adapter'ıdır. Ayrı kopyalanmış bir 3D editör uygulaması kurulmaz; ortak
host/oturum ve 3D domain araçları farklı sorumluluklarda kalır.
Dar ortak detay host'u DET0–DET1 sonraki kullanıcı kararıyla Poly/UV öncesinde
öne alınıp dar teslimi tamamlandı; temel sabit model yerleşimi adapter'ını içerir. Sonra Poly → UV
→ ileri kutulu 3D sırası korunur; bağımsız tam 3D Modeling
veya Game Engine çalışma alanı bu kararla etkinleşmez.

## Mimari yön — ayrı bir ikinci 3D editör yerine ortak içerik editörü

Sonraki kullanıcı kararı: 3D authoring yeteneklerinin sahibi **3D İçerik
Editörü** olur. Bu editör ortak detay host'unun bir adapter'ıdır ve bir model
viewer'ıyla sınırlı kalmadan sahne ağacı, çoklu model, materyal, ışık, kamera
ve iç animasyon yetenekleriyle kademeli büyür. Aynı işler için bağımsız ikinci
bir 3D Animation/Modeling editör motoru ve paralel belge formatı kurulmaz.
İleride tam alan 3D görünümü gerekirse aynı editörün daha geniş bir yerleşimi
olabilir; farklı source veya renderer uygulaması olmak zorunda değildir.

Üç sorumluluk ayrı kalır:

| Alan | Görevi ve veri sahipliği |
| --- | --- |
| 3D içerik kaynağı | Yeniden kullanılabilir sürümlü belge: node/model/asset referansları, materyal, ışık, kamera, iç klip/key ve açık parametreler. Stable ID ve açık bağımlılıklar taşır; DOM/GPU/runtime state taşımaz. Bu yeni belge şeması henüz uygulanmadı. |
| 3D İçerik Editörü | Bu kaynağı ortak host içinde author eder. İnceleme bakışı, araç/focus/seçim geçicidir; Apply/Cancel ve revision kuralları paylaşılır. |
| Kullanım/instance adapter'ı | Aynı içerik 2D kompozisyonda kutulu render veya gelecekte oyun dünyasında native 3D instance olarak kullanılır. Dış transform, runtime davranış ve çıktı sözleşmesi kullanım yerine aittir. |

Mevcut `Layer.type = 'model3d'` kaldırılmaz. Bugünkü kutu, GLB asset referansı
ve sabit `Layer.model3d` payload'ı eski kaydet/aç/clone/history davranışıyla
çalışmayı sürdürür. Gelecek içerik-belgesi referansı için açık versioned
converter/adapter ve geri uyumluluk gerekir; mevcut her GLB dosyası kendiliğinden
native düzenlenebilir sahne belgesi veya oyun prefab'ı sayılmaz.

Bu yönün yeniden kullanım kazancı aynı model/asset yükleme, geometri, materyal,
klip değerlendirme ve authoring araçlarını paylaşmaktır. Sadece aynı UI'ı
kullanmak bütün 3D yeteneklerini veya oyun runtime'ını hazır hale getirmez.
Ürün performans kazancı ilgili iş yükünde ölçülür; çalışma zamanı ve bellek
maliyetinin aynı kalacağı peşinen vaat edilmez.

## 3D yeteneklerinin sahibi ve aşamaları

| Yetenek | Ortak 3D İçerik Editörü içindeki yeri |
| --- | --- |
| Temel model yerleşimi | DET1'de mevcut iç XYZ/dönüş/ölçek/kamera Properties'inin adapter'ı. Çift tık/sağ tık, breadcrumb ve Apply/Cancel; henüz klip/rig düzenleme değil. |
| Sahne, materyal ve ışık | Poly/UV'den sonraki ileri 3D dilimi: model/node ağacı, çoklu model, imported material override, ışık/ortam/gölge ve kamera yetenekleri. |
| 3D animasyon | Aynı içerik belgesinin iç Timeline'ı: model/node/camera TRS ve imported clip/morph/pose. Ana 2D Timeline'a bone/node keyleri açılmaz. |
| Rig üretme, weight painting, IK, ileri modelleme | Aynı editörün isteğe bağlı ileriki araç modülleri olarak planlanabilir. İlk ortak host veya klip oynatma tesliminin önkoşulu değildir; bugün desteklenmiş sayılmaz. |
| 3D particle/fizik/kumaş/sıvı | İleride açık solver/renderer adapter'ları ve bake manifestleriyle bağlanabilecek modüller. Mevcut düzlemsel 2D solver planı otomatik 3D solver sayılmaz; ayrı ileriki kapsam/kabul kararı gerekir. |
| Oyun davranışları | Game Engine runtime/scene adapter'ı: entity/component, input, collision ve simülasyon tick'i. Model içeriğinin veya 3D authoring araçlarının ikinci kopyası değildir. |

## 2D içerikler ve gelecekteki Game Engine kullanımı

2D Shape/Poly, image, video, çizim, sprite ve component kendi detay editörlerinin
kaynakları olmaya devam eder. 3D editörde kullanmak bu öğeleri otomatik olarak
3D asset'e veya tek bir bitmap'e dönüştürmez. Sahip kaynak stable referansla
alınır; yalnız kullanım transform'u/projection'ı ve desteklenen instance override
ayrı tutulur. Ortak kaynağı düzenleme / bu kullanımı değiştirme seçimi korunur.

| Yerleştirme yolu | Kullanım |
| --- | --- |
| 3D dünya içindeki 2D düzlem/sprite/billboard | Bir tabela, kart, video ekranı veya sprite kamera/derinlik içinde bulunur. Piksel-boyut ↔ dünya-birimi, UV/orientation, alpha/depth ve gerekirse hit-test dönüşümü açık adapter ile tanımlanır. |
| Ekran üstü 2D kompozisyon/UI | HUD, yazı, buton ve kontrol ekran koordinatlarında kalır. Oyun kamerasının dünya depth'ine kendiliğinden katılmaz; kendi viewport/input ve compositing katmanını kullanır. |
| Animasyonlu 2D alt içerik | Mevcut evaluated-frame/local-clock ve asset manifesti üzerinden gerektiği zamanda render yüzeyi sağlanır. Dinamik texture bütçe/readiness/invalidation kurallarına tabidir; her kare bütün alt sahne yeniden hazırlanmaz. |

Her iki tür aynı gelecek oyun sahnesinde birlikte gösterilebilir. 3D için
yalnız 2D kutunun düzleştirilmiş görüntüsünü oyuna vermek zorunlu olmaz: native
3D içerik instance'ı dünya kamerası/ışık/depth hattına katılabilir. 2D kutu ise
ana animasyon compositor'ına şeffaf yüzey üretmeye devam eder. Kullanıcı açıkça
seçerse texture üstünde 3D render da ayrı bir kullanım olabilir.

Game Engine bu içeriğin **tüketicisi ve etkileşim/simülasyon sahibi** olarak
planlanır; yalnız bir gösterim paneliyle tamamlanmış oyun motoru sayılmaz.
Entity/behavior/physics tanımları içerikten ayrılır. 3D sahne ağacı evrensel
GameObject, mevcut 2D Layer da evrensel oyun entity'si yapılmaz. Görsel klip,
parametre ve node referansları oyun component'lerine açık binding'lerle bağlanır.

## Ortak kaynak, farklı saat ve runtime sahipliği

- Kaynak/instance kimlikleri ve asset bağımlılıkları paylaşılır. Renderer'a bağlı
  GPU handle'ı backend/context dışına taşınmaz; ortak kaynak referansı her
  context'in aynı GPU nesnesini paylaşacağı anlamına gelmez.
- Authoring/scrub/export kesin içerik zamanından değerlendirilir. Gelecek oyun
  runtime'ı kendi tick/simülasyon saatiyle animasyon zamanını açık adapter üzerinden
  sürer; editörün duvar saati veya UI döngüsünü yeniden kullanmak zorunda değildir.
- Bir property'yi clip, Wire/Expression, manuel override ve fizik birlikte
  sürüyorsa sahiplik/blending sırası açık olur; aynı transform iki kez uygulanmaz.
  Oyun sırasında oluşan pose/physics state kaynak veya editör Undo'suna sessizce
  yazılmaz. Bake veya runtime sonucunu kaynağa al açık, doğrulanan işlemdir.
- Native source, imported file, kullanıcı delta'sı ve derived bake/render cache
  ayrılır. Shared kaynak değişiminde bağımlı instance/bake invalidation stable
  sürüm/hash ile yapılır; bütün consumer'lara kontrolsüz deep-copy dağıtılmaz.
- Ortak renderer/evaluator yalnız gerçekten eşleşen işlemleri paylaşır. 2D
  affine/piksel ile 3D matrix/dünya birimi ayrıdır; aynı renderer sözleşmesini
  zorla her boyuta uygulayan cast veya her 2D transform'a z ekleme yapılmaz.

## Geliştirme sırası üzerindeki etkisi

DET0–DET1 ortak detay host'u ve dar Shape/Path + sabit model yerleşimi
adapter'ı 13 Kasım'da uygulandı. Sonra Poly → UV → aynı host üzerinde ileri 3D içerik araçları gelir.
İleri 3D işleri ayrı bir workspace motoruna taşınmaz. Bileşen/2D asset yeniden
kullanımı ilgili dilimde, video/tracking/compositing CFX sırasında kalır.
Game Engine ve 3D solver geliştirmesi bu mimari yönle başlatılmış olmaz; sonraki
ayrı ürün kapsamıdır. `EditorMode` değerleri veya mevcut source şemaları yalnız
bu planı yazmak için silinmez/değiştirilmez.

## 3D film üretimi — gömülü çekimler ve ana kompozisyon

Kullanıcı onayıyla 3D film üretimi bu mimarinin hedef kullanımına eklenmiştir.
Ayrı ikinci bir 3D Animation workspace motoru önkoşul değildir. Bir içerik
kutusu, tek modelin yanında bütün bir çekimi de barındırabilir: dekor, modeller,
karakterler, ışık, çıktı kamerası ve iç Timeline aynı 3D içerik belgesindedir.
Birbirini örten/gölgeleyen veya etkileşen nesneler aynı iç 3D sahnede bulunur.
Bağımsız kutular arasında ortak derinlik/ışık kendiliğinden oluşmaz.

- **Çekim hazırlığı:** Ortak 3D İçerik Editörü'nde modeller, imported klip/rig,
  pose, kamera ve ışıklar ilgili capability'leri teslim edildikçe düzenlenir.
  Kaynak model/rig ile çekime özel instance/animasyon düzeltmeleri ayrılır.
- **Kurgu ve kompozisyon:** Ana 2D sahne çekimlerin sırasını/yerleşimini,
  geçişleri, yazıları, grafikleri ve ses/müzik yerleşimini yönetir. İç kemik ve
  kamera keyleri ana 2D Timeline'a otomatik yayılmaz. Çok çekimli kurguya gereken
  trim/offset/süre/speed/loop mapping, ilgili component/local-clock ve CFX
  araçları üzerinden açık teslimdir; bugünkü model kutusunda var sayılmaz.
- **Kare hesabı:** Final render ana çıktı karesinin zamanını çekimin yerel
  saatine dönüştürür; kamera, karakter/klip, video ve bake sonucu o kesin zamanda
  değerlendirilir. UI FPS'i veya ayrı serbest playback saati çıktı zamanını seçmez.
  Ses aynı kurgu zaman tabanından mix edilir; geçişte gereken iki çekim de hesaba katılır.
- **Kaynak yönetimi:** Ortak asset referansları paylaşılır. Yalnız aktif çekim,
  geçiş bağımlılıkları ve bütçeli yakın hazırlık yüklenir; bütün film/decoded
  kareler/texture'lar belleğe yığılmaz. Bake/cache, job cancellation ve stale
  invalidation mevcut kaynak sözleşmelerini kullanır.
- **Teslim:** Önce kısa bir çok çekimli ürün/açıklayıcı film fixture'ı; ardından
  daha uzun/karakterli iş yükleri. Hedef çözünürlükte 3D yüzey, sampling, gölge,
  renk/alpha, efektler ve ses eşliği export/final kalite aşamasında doğrulanır.
  İlk model diliminin 2048 px surface sınırı ve statik poz desteği tam film veya
  yüksek kaliteli final render kabulü değildir.

Kabul: shot/local time mapping ile scrub ve final raster aynı kareyi verir;
kamera/karakter keyleri yalnız ilgili iç belgeyi değiştirir; portable açılışta
çekim/asset referansları ve ses yerleşimi korunur; geçişte eksik kaynak sessizce
boş kareye dönüşmez; uzun render/cancel/resume işi bellek bütçesini izler. Resume
desteği ancak gerçek job/çıktı manifesti teslim edilince capability olarak açılır.

Bu hedef DET0–DET1'i film editörü teslimine büyütmez. Ortak detay → Poly/UV →
ileri 3D içerik/animasyon → ilgili bileşen/saat işleri → export/final kalite
sırası ve daha sonraki CFX konumu korunur. Game Engine film üretiminin önkoşulu
değildir; tam rig üretme/3D simülasyon araçları ayrı ileri kabul gerektirir.

## Şimdi çalışan sınır

| Alan | Sorumluluk |
| --- | --- |
| Ana 2D sahnedeki model kutusu | Normal 2D konum, dönüş, ölçek, opaklık ve mevcut dış kompozisyon davranışları |
| 2D Timeline / Curve / Dope Sheet | Kutunun dış kanalları; iç model, kamera, ışık ve kemik keyleriyle karışmaz |
| Properties | Temel iç XYZ konumu/dönüşü/ölçek ve kamera kadrajı sabit yerleşim ayarları olarak kalır |
| GLB/glTF içeriği | Özgün dosya ve klipler korunur; ilk dilim sabit pozu gösterir |
| Önceden kaydedilmiş iç 3D track'ler | Veri kaybı olmadan save/open, clone, undo snapshot ve eski değerlendirmede korunur; 2D authoring'de görünmez ve düzenlenmez |

Registry'nin `timelineExcludedPaths` sözleşmesi kutulu model için `model3d`
alt ağacını ayırır. Aynı politika normal Set Key, explicit key/script, paste /
move / delete, authoring gezinmesi ve ortak Timeline hiyerarşisinde kullanılır.
İç property schema'ları 2D editöründe animatable değildir; temel Properties
kontrolleri kaldırılmaz. Statik Properties değişimi Auto Key açıkken iç track
üretmez. Raw source import/restore eski keyleri reddetmez veya temizlemez.

## İleri dilim — çift tıkla izole içeriği aç

1. Model kutusuna çift tıklama veya açık bir **Edit 3D content** komutu ortak
   detay host'unda 3D adapter'ıyla bir sekme açar. Temel yerleşim için çift tık
   ve sağ tık **Edit content…** girişi DET1'de uygulandı; aşağıdaki tam iç sahne
   ve iç Timeline yetenekleri ileri dilimdir.
2. İç sahne ağacı, model/node seçimi, materyal, ışık ve çıktı kamerası bu
   belgeye aittir. Dış 2D parent, konum, pivot ve kutu boyutu değiştirilmez.
3. İç Timeline yalnız bu içeriğin model/kamera/klip animasyonlarını gösterir.
   GLB klipleri referansla oynatılır; kemik başına bütün keyler ana Timeline'a
   otomatik dağıtılmaz. Klip keylerini native düzenlemeye açma açık, isteğe bağlı
   bir dönüşüm olur; ID/easing/tangent ve dönüşüm kayıpları raporlanır.
4. **İnceleme bakışı** editör oturumuna aittir. Orbit/pan ile modeli incelemek
   çıktı kamerasını ve kameranın keylerini değiştirmez. **Çıktı kamerasını düzenle**
   açık bir eylemdir; Auto Key veya Set Key yalnız iç Timeline'da çalışır.
5. İlk detay sürümü bir draft üzerinde Apply / Cancel sağlar. Apply, belge
   revision'ını doğrular ve içeriği ana editöre tek geri alınabilir işlem olarak
   aktarır. Cancel dış sahneyi değiştirmez. Arada değişen kaynak üzerine sessiz
   overwrite yapılmaz; aynı insan/ajan kökeni ve revision kuralları uygulanır.

## Veri ve zaman sınırları

- Ortak detay host'u bütün öğelere iç Timeline, Three renderer veya GameObject
  sözleşmesi dayatmaz. Buradaki iç 3D belge/Timeline/kamera, 3D adapter'ının
  capability'sidir. Mevcut geçici viewport Isolate filtresi ayrı kalır; normal
  Isolate düzenlemeleri Apply bekleyen taslağa dönüştürülmez.
- İç kaynak sürümlü, serializable ve stable ID'li bir içerik belgesidir. Bugün
  bunun için yeni JSON alanı veya public scripting API ilan edilmedi.
- 2D affine/piksel/derece verisi ayrı kalır. İç 3D matrix/projection, camera,
  UV/normal ve rig rest verisi açık tipli kendi kaynak alanlarında tutulur.
- İç zaman ile ana sahne zamanı için açık bir local-clock adapter'ı kurulur;
  offset, süre, hız, döngü ve seek aynı evaluated frame'e bağlı olur. Duvar
  saati veya ayrı serbest oynatıcı export zamanını belirlemez.
- Kaynak klip, kullanıcı delta/key düzeltmesi ve derived render/bake cache ayrı
  sahipliklerdir. Three/GPU/decoder nesneleri JSON veya undo snapshot'a girmez.
- Mevcut bounded source lease, preparation queue, cache ve global kaynak bütçesi
  paylaşılır. Detay kapatılınca consumer pin'leri bırakılır; stale işler sonuç
  olarak yayınlanmaz. İkinci sınırsız bir model/texture cache'i kurulmaz.
- Dış compositor o andaki iç sahne yüzeyini çizer. 2D kutunun keyleri iç model
  node keylerine dönüştürülmez; iç kamera ana 2D Timeline'a taşınmaz.

## Kabul kapıları

Önce kaynak/detail yaşam döngüsü ve draft Apply/Cancel; sonra node/kamera
Properties + ayrı inceleme bakışı; sonra local Timeline/klip oynatma ve explicit
key düzenleme geliştirilir. Her dilim import, save/open, undo/redo, clone/
instance, resource cancellation ve hazırlanmış raster çıktıyla birlikte biter.

Asgari senaryolar: ana sahnede hareketli model kutusunu taşırken iç klip/kemik/
kamera keyleri aynı kalır; detayda kamerayı düzenleyince ana sahnenin 2D keyleri
aynı kalır; bakışı incelemek çıktı keyi üretmez; Apply tek Undo'dur; Cancel ve
stale revision veri değiştirmez; portable tekrar açılış aynı kadrajı ve zamanı
verir. Henüz uygulanmamış ekran için başarı veya performans iddiası yapılmaz.

Bkz. [ortak detay ve gelecek mod sınırları](shared-item-detail-editor.md),
[ilk dilim](../boxed-3d-first-slice.md) ve
[ana sıra](geometry-material-boxed3d-sequence.md).
