# Ortak 3D İçerik Editörü, model kutusu ve gelecek runtime sınırı

12 Kasım 2026 kullanıcı kararı. İlk kutulu model diliminin sınırı güncellenir;
tam iç sahne/Timeline ekranı bu belgede **planlanır**. 13 Kasım'da ortak
host'un temel sabit model yerleşimi ekranı [DET0–DET1 ile uygulandı](../item-detail-editor.md);
iç node/klip/rig Timeline'ı henüz yoktur.
Sonraki kullanıcı kararıyla ekran Shape/Poly, image/texture, video ve component
için de kullanılacak [ortak öğe detay host'unun](shared-item-detail-editor.md)
3D adapter'ıdır. Ayrı kopyalanmış bir 3D editör uygulaması kurulmaz; ortak
host/oturum ve 3D domain araçları farklı sorumluluklarda kalır.
Dar ortak detay host'u DET0–DET1 tamamlandı; temel sabit model yerleşimini içerir.
**14 Kasım kullanıcı önceliği:** sıradaki işler 3D içerik editörünü geliştirmeye
odaklanır. Önce Timeline/iç animasyon kapısı 3D-T, sonra 3D0–3D6 Poly/UV önüne
alınır. Editable Poly ve UV
authoring daha sonra kalır; bağımsız tam 3D Modeling/Game Engine modu açılmaz.

**13 Kasım risk sınırı:** [İç animasyon incelemesi](internal-animation-risk-review.md)
sonrasında genel nested motor bu planın zorunlu önkoşulu değildir. Statik
node/materyal/ışık/kamera araçları ayrı ilerler; tek seviyeli imported clip
oynatma önce per-instance pose, kesin zaman, kaynak ve çıktı kabulü ister.
Recursive sahne/klip/yerel SM daha ileri kapsamda bekler. Aşağıdaki iç Timeline
ve animasyonlu alt içerik tasvirleri uygulanmış destek değil, bu kapılara bağlı
planlardır; mevcut statik GLB yükleme ve ana 2D evaluator değişmez.
İç animasyon kapsamdan çıkarılmaz: [owned Timeline tasarımının](item-owned-animation-plan.md)
IA2 diliminde model/kamera iç keyleri ve imported clip adapter'ı geliştirilir.
Owner/kanal koruması ve zaman orchestration'ı IA1 ile paylaşılır; ana 2D
Timeline'a modelin iç bone/node keyleri aktarılmaz.
Native GLB/glTF kliplerinin bütün keylerini Chorono root Timeline'ına çevirmek
varsayılan import yolu değildir. Model asset + clip referansı ve detayda klip
seçimi kullanılır; yeni yerleşim/kamera keyleri kendi iç bağlamında yazılır.
Desteksiz kanal/extension açık raporlanır, orijinal dosya korunur; destek varmış
gibi eksik dönüşüm veya otomatik bake yapılmaz. Native source kullanımı bütün
uzantılarda otomatik görünüm eşliği vaat etmez.

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
| Sahne, materyal ve ışık | 14 Kasım'da öne alınan 3D dilimi: node seçimi, çoklu model, imported material override, ışık/ortam/gölge ve kamera. Hazır modelin mevcut UV'sini kullanmak editable Poly/UV editörünü beklemez. |
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
adapter'ı 13 Kasım'da uygulandı. 14 Kasım kararıyla **aynı host üzerinde ileri
3D-T temeli → 3D içerik araçları → Poly → UV → 2D komponent/library/karakter** sırası uygulanır.
İleri 3D işleri ayrı bir workspace motoruna taşınmaz. Bileşen/2D asset yeniden
kullanımı ilgili dilimde, video/tracking/compositing CFX sırasında kalır.
Game Engine ve 3D solver geliştirmesi bu mimari yönle başlatılmış olmaz; sonraki
ayrı ürün kapsamıdır. `EditorMode` değerleri veya mevcut source şemaları yalnız
bu planı yazmak için silinmez/değiştirilmez.

### 14 Kasım — 3D odaklı yapım sırası

Ana kuyruk [üretim yol haritası §3.2'dedir](../production-2d-roadmap.md).
**14 Kasım T0 durumu:** [Ana/iç authoring context ve hedef doğrulaması](../timeline-authoring-context.md)
uygulandı; 3D-T1 iç Timeline UI/clip commit de tamamlandı. T2 zaman/çıktı ortak kabulü de [tamamlandı](../model-clip-acceptance.md); 3D0–3D6 da [tamamlandı](../model-detail-3d-packages.md); sırada Poly vardır.
T1 numeric model/kamera kliplerini [ayrı source](../model-content-clips.md) olarak düzenler; imported native GLB klip oynatımı 3D3'tedir.
Aşağıdaki kuyruk 14 Kasım’da tamamlandı. Gerçek API, UI, sürüm ve destek sınırlarının
sahibi [uygulama/kabul belgesidir](../model-detail-3d-packages.md):

| Paket | 3D detay alanındaki çıktı | Bağımlılık / kabul |
| --- | --- | --- |
| 3D-T — önce Timeline/iç animasyon | Ana/iç scope ve owner guard'ı; mevcut model/kamera alanlarında yerel klip/Set Key/Curve/Dope Sheet; zaman ve scoped commit | Ana plan §3.2.1'deki T0–T2 geçer: dış key ve iç key ayrımı, tek Undo/Cancel, eski source, iki kullanım, scrub/loop ve raster eşliği. Mevcut ana Timeline dışlama filtresi bu teslimin tamamı değildir. |
| 3D0 — kaynak ve parça düzenleme — tamamlandı | IA0'ın dar 3D kaynak/kimlik/instance/commit sınırını node'lara genişletme; ağaç/seçim/Frame Selection ve XYZ gizmo | 3D-T sonrasında. Imported kaynak korunur; node override'ı asset sürümü/stable referansla saklanır. 2D kutu hareketinden ayrıdır; tek Undo/Apply/Cancel, reload ve prepared raster birlikte doğrulanır. |
| 3D1 — kamera — tamamlandı | İnceleme ve çıktı kamerası ayrımı, perspektif/orthographic, front/top/side/isometric preset, hedef/kadraj ve mevcut orbit/pan/dolly | 3D0; inceleme kamera değişimi sahne keyine dönüşmez. Imported kamerayı kullanma varsa açık seçim ve capability'dir; bütün kamera animasyonunu otomatik çevirmek değildir. |
| 3D2 — materyal, ışık ve gölge — tamamlandı | Imported material override: renk, roughness/metalness, opacity ve desteklenen texture slotları; ışık konumu/rengi/şiddeti, ortam/exposure ve kontrollü gölge | 3D0/1; modelin mevcut UV'si kullanılır. Texture/HDRI/shadow kaynakları bütçelenir, shared material kazara bütün örnekleri değiştirmez. Ayrı 2D kutular arasında ortak ışık/depth vaat edilmez. |
| 3D3 — native klip (IA2a) — tamamlandı | GLB/glTF clip seçme, play/scrub, in/out, hız/loop; desteklenen imported skeleton/morph animasyonu | IA0'ın owner/zaman kontratı + 3D instance pose adapter'ı. İki örneğin pozu bağımsız; backwards seek ve raster aynı frame'i verir. Bütün bone keyleri ana Timeline'a aktarılmaz. IA1'in 2D saat demosu veya Poly/UV önkoşul değildir. |
| 3D4 — detay Timeline genişlemesi (IA2b) — tamamlandı | 3D-T'deki temel yerel key authoring'ini yeni node'lar ve native clip/pose kanallarına genişletme | 3D-T + 3D3. Set Key/Curve/Dope Sheet tekrar yazılmaz; native klip/authoring sahipliği doğrulanır. Native bone keylerini tam düzenleme, rig kurma ve weight paint ayrı ileri araçlardır. |
| 3D5 — çoklu model içerik — tamamlandı | Tek 3D içerikte birden fazla model, parça hiyerarşisi, ortak kamera/ışık/depth ve instance seçimi | Önceki kaynak/render kontratları; farklı asset ölçüleri/dünya birimleri açık adapter ile eşlenir. İki model + kamera fixture'ı save/clone/raster ve kaynak bütçesiyle kabul edilir. Farklı model kutularını ortak 3D dünyaya çevirmek değildir. |
| 3D6 — açık kontroller ve yeniden kullanım — tamamlandı | Seçili model/klip/kamera alanları için typed parametreler ve instance override; Wire/Expression bağlantısı, turntable ve uygun parça ağacında explode | Mevcut parametre/driver sözleşmeleri kullanılır; iç pose ikinci yazıcıyla ezilmez. Minimal 3D kaynak/instance reuse edilir; tam 2D library, saat authoring'i veya particle adapter'ı bu dilimin önkoşulu değildir. |

OBJ/MTL, FBX ve 3DS importer'ları, gelişmiş rig/weight/IK/modelleme ve 3D
particle/fizik/kumaş/sıvı önerileri korunur; yukarıdaki ilk kuyruğu bekletmeyen
ayrı ileri capability'lerdir. Her format kendi materyal/kamera/klip kayıp
matrisiyle değerlendirilir; destekleniyor diye henüz ilan edilmez.

Poly → UV bundan sonra 2D mesh authoring'i için gelir. Ortak saat/owner/asset
ve commit kontratları bu araçlardan önce gerçek 3D tüketiciyle dar biçimde
çıkarılır; sırf yeniden kullanım için genel recursive motor inşa edilmez.

## Kullanım örneği — 3D çekimlerin 2D kompozisyonda birleşmesi

13 Kasım kullanıcı düzeltmesi: **3D film üretimi ayrı ürün hedefi, geliştirme
fazı veya kabul kapısı değildir; mimarinin olası kullanım örneğidir.** Bu örnek
için zorunlu film/demo fixture'ı, film editörü veya yeni teslim maddesi eklenmez.

Örnekte bir 3D içerik dekor, karakterler, ışık, kamera ve iç animasyonu aynı
belgede barındırabilir; ana 2D kompozisyon bunları yazı, grafik ve sesle
birleştirebilir. Birbirini örten/gölgeleyen nesneler aynı iç 3D sahnede tutulur.
Bağımsız kutular arasında ortak derinlik/ışık kendiliğinden oluşmaz.

Örneğin ihtiyaç duyduğu scene/clip/local-clock, kaynak sahipliği ve final render
yetenekleri zaten kendi onaylı aşamalarında değerlendirilir; yalnız bu örnek
üzerinden yeni zorunluluk veya bitmiş özellik iddiası çıkarılmaz. Güncel sıra
14 Kasım 3D önceliğidir; film örneği bu sıraya ek iş veya kapı eklemez.

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
