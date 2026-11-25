# Nesneye ait iç animasyon — ortak motor, scoped klip ve komponent örnekleri


14 Kasım durum notu: 3D-T0 ve 3D-T1'in dar model/kamera klip dilimi uygulandı;
[gerçek sözleşme](../model-content-clips.md). Genel 2D komponent/rig/nested
owner sistemi bu teslimle tamamlanmış sayılmaz. 3D-T2 ortak kabulü de [tamamlandı](../model-clip-acceptance.md); sırada 3D0 vardır.

13 Kasım 2026 kullanıcı kararı. **İç animasyon gerekli bir ürün yeteneğidir.**
Detay ekranının statik ayarlarla kalması nihai hedef değildir. Bu belge uygulama
tasarımıdır; genel komponent/nested owner yetenekleri henüz uygulanmadı; dar T1 model klibi yukarıdaki durum notunda ayrılır. [Risk incelemesi](internal-animation-risk-review.md)
genel recursive motor ile ilk çalışan nesne-içi klip teslimini ayırır.

Ana yapım kuyruğu [üretim yol haritasının §3.1 bölümündedir](../production-2d-roadmap.md).
Bu belge animasyonlu izole nesne, alt klip, türe göre detay araçları ve parametrik
komponentin teknik tasarımını ayrıntılandırır; ayrı rakip iş kuyruğu değildir.
[Ortak detay planı](shared-item-detail-editor.md) host/etkileşim,
[bileşen planı](component-library-2d-plan.md) library/sürüm,
[kutulu 3D planı](boxed3d-isolated-editor.md) 3D adapter ayrıntılarını sahiplenir.
Bu belgeler ayrı rakip animasyon sistemleri tanımlamaz. Çalışan dar host'un
gerçek sınırı [DET0–DET1 belgesinde](../item-detail-editor.md) kalır.

## 0. Kodla uyum denetimi ve üç düzenleme işlemi

| Mevcut kod | Doğrulanan durum / genişleme ihtiyacı |
| --- | --- |
| `scene/visibility/isolationView.ts` | Source'u değiştirmeyen geçici görünüm üretir; klip veya alt belge yaratmaz. Aynen korunur. |
| `editor/detail/ItemDetailRegistry.ts`, `detailAdapters.ts` | İlk eşleşen adapter; Shape/Path ve statik model3d alanları var. Alt asset/UV hedefi veya tek nesnenin birden fazla edit yeteneği için capability keşfi genişletilmeli. |
| `editor/detail/ItemDetailSession.ts` | Tek öğenin izinli alan patch'i; diğer öğe/Timeline değişimi reddedilir. Mevcut guard gevşetilmez; owned subtree/definition/klip için ayrı scoped commit capability gerekir. |
| `components/detail/ItemDetailWorkspace.tsx` | Ortak başlık, sınırlı taslak, Apply/Cancel ve içerik incelemesi var; yerel Timeline/parça authoring'i henüz yok. |
| `clone/InstanceResolver.ts` | İnce görsel kaynak paylaşımı; versioned parametrik komponent veya bağımsız klip durumu değildir. |
| `model3d/types.ts` ve `ModelAssetService` | Statik model kaynağı/çizimi; imported klipler runtime parse'ta kapalı. Animasyonlu pose/instance yaşam döngüsü henüz yok. |

**Isolate selection:** Ana sahne içinde görünüm filtresi; çoklu kök ve mevcut
source komutları. Parent/world bağlamı ve ana zaman korunur. Exit yapılmış
normal editleri geri almaz; Apply/Cancel veya gizli yeni klip yaratmaz.

**Edit content:** Desteklenen tek hedefin türüne uygun detay ortamı; scoped
taslak ve Apply/Cancel. Geometri, resim crop'u, materyal slotu veya 3D klip gibi
hangi içerik hedefinin açıldığı bellidir. Detaya girmek komponent yaratmaz.

**Edit component / Create animated component:** Private içerik tanımı ve
parametre/klip authoring'i. Yeni komponent yaratma açık bir komuttur; eski
katmanın ID, referans ve insan keyleri sessizce yeni kaynağa taşınmaz. Ana
sahnedeki normal instance düzenlemesi dış transform ve açık kontrollerdir.

## 1. Ortak motor ve Timeline tipi; bütün klipler global listede olmak zorunda değil

Sonraki kullanıcı örneği: native animasyonlu 3D modeli ana Timeline'ı doldurmadan
kullanmak; detayda parametrik saat tasarlayıp farklı değerli örneklerini üretmek.
Bu ihtiyaç, yalnız mevcut satırları filtrelemekten daha geniş bir **animasyonlu
komponent** modelidir. Önceki tek fiziksel global Timeline dizisi önerisi bir
zorunluluk değildir. Ortak olan interpolation, Timeline tipi ve değerlendirme
kontratıdır; her klibin aynı global hedef alanında durması gerekmez.

| Kullanım | Kaynak / Timeline görünümü |
| --- | --- |
| Eski sahne veya bir defalık grup izolasyonu | Mevcut `scene.layers` / `scene.timelines` korunur; detay görünümü owner/subtree filtresi olabilir. Bu tek başına parametrik shared instance sağlamaz. |
| Native animasyonlu 3D import | GLB/glTF asset ve clip referansı içerikte kalır. Ana Timeline'a bütün bone/node keylerini çevirmek zorunlu veya varsayılan değildir; detay native klip listesini gösterir. |
| Animasyonlu 2D komponent | Tek sürümlü definition: yerel parça ağacı, aynı `Timeline[]` türünde scoped klipler, açık parametreler ve asset referansları. |
| Komponent örneği | Definition/sürüm referansı + kendi parametreleri, dış transform, klip seçimi ve zaman eşlemesi. Keyler her örnek için source'ta çoğaltılmaz. |

Ana sahne mevcut root Timeline'larını taşır. Komponent klibi definition'a aittir;
root evaluator tarafından ayrıca ikinci kez çalıştırılmaz. Yerel kimlikler
instance bağlamında çözülür. Owner bir nesne veya definition/instance kapsamıdır;
UI'da yalnız aktif kapsamın Timeline'ı gösterilir. `timeline.layerIds` görünüm
üyeliğidir, sahiplik değildir. İlk teslimde tek aktif klip ve tek içerik seviyesi
vardır; normal parent/child derinliği veya alternatif klipler yasaklanmaz.

Mevcut [ComponentDefinition/Instance planı](component-library-2d-plan.md) genişletilir;
ayrıca rakip bir generic içerik deposu kurulmaz. Minimal definition + number
parametre + instance bu saat örneği için gereklidir; tam kütüphane tarayıcısı,
thumbnail, cloud veya genel recursive belge motoru önkoşul değildir.
`instanceOf` eski davranışını korur; bu yeni parametrik instance yerine geçmez.

## 2. Nesneyi kilitlemek yerine kanal sahipliği

| Hedef | Sahip / davranış |
| --- | --- |
| Owner kökünün `transform.*`, `opacity`, görünür zaman aralığı | Ana sahne. İçeride kol hareket ederken kök sahnede hareket/ölçek/dönüş alır. İç klip bu dış alanlara yazamaz. |
| Owner altındaki parça transform'u / izinli içerik property’si | İç klip. Kol rotation'ı ile karakter kökü rotation'ı farklı hedeflerdir; matrisler parent sırasıyla birleşir. |
| Tek Shape/Path'in izinli renk, ölçü ve geometri alanı | İç klip sahiplenebilir; dış transform açık kalır. Ayrıca iç transform gerekiyorsa açık grup/parça modeli gerekir; ilk dilimde ikinci örtük transform eklenmez. |
| `model3d.*` ve imported node/pose kanalı | 3D detay bağlamı. Ana 2D Timeline dış kutuyu yönetir; model iç keyleri ana liste görünümüne açılmaz. |
| Owner olmayan eski katman/Timeline | Eski davranış; mevcut çakışmalar otomatik dönüştürülmez. |

Önerilen tek domain sorgusu `(revision, owner, layerId, propertyPath)` için
izin/sahip/sebep döndürür. İç kliplerin ilan ettiği hedeflerden revision'a bağlı
geçici ownership index çıkarılır; her input'a ayrı `internal` flag'i yazılmaz.
Owner'ın kayıtlı kliplerinin hedef birleşimi korunur. Klibi durdurmak kanalı
serbest bırakmaz; son iç track'i kaldırmak açık sahiplik değişimidir.
Private komponent alanları ana Timeline'ın adres alanına zaten açılmaz. Bu
sınır varken bütün uygulamaya yeni input kilitleri eklemek ilk iş değildir.
Kanal guard'ı, eski inline gruptan iç sahipliğe geçişte ve dışarı açılan kontrolün
aynı iç kanala ikinci yazıcı getirdiği durumlarda kullanılır. Ana dış hareketi
toptan kapatan bir `hasInternalAnimation` bayrağı kurulmaz.

- Dış key, controller, Wire, binding, Expression ve Set Value korunan kanala
  yazamaz. UI, native komut, MCP/script ve son frame driver birleşimi aynı
  kurala tabidir. Yalnız düğme gizlemek yeterli değildir.
- `transform` ile `transform.x`, vektör ile bileşenleri de çakışır. Mevcut
  `propertyPathsOverlap` kullanılır; string eşitliği yeterli değildir.
- Aynı owner'ın alternatif klipleri aynı hedefi kullanabilir; yalnız seçili
  klip örneklenir. Farklı owner'ın aynı kanalı sahiplenmesi / subtree dışına
  yazması reddedilir. İlk teslimde bir owner'ın altında başka owner reddedilir;
  normal parent/child derinliği bu kısıtla karıştırılmaz.
- Setup temel değerleri ve key düzenleme içeride yapılır; oynatma source'a
  yazmaz. Dış Properties, sahip ve `Open inner animation` yolunu gösterir.
- Parametrik komponentin ilk teslimi typed exposed number parametreyi içerir;
  saat örneği bu olmadan tamamlanmış sayılmaz. Parametre, iç hesabın girdisidir;
  aynı frame sonucunu sonradan ezen ikinci property yazıcısı değildir.
  Genel replace/offset/multiply/blend politikaları ayrıca kabul edilir.

Bu kural çift yazmayı çözer; yerel saat, instance durumu, medya ve çıktı
uyumluluğunu tek başına çözmez. Nesnenin bütün dış animasyonunu kapatmak gerekmez.

## 3. Mevcut insan keyleri korunarak sahiplik alma

Owner/track eklenmeden önce root Timeline ve bütün driver'lar taranır. Çakışma
varsa eski key silinmez veya bastırılmaz. Kullanıcı dış animasyonu koruyup bu
kanalı iç klibe almayabilir; ya da desteklenen seçili kanalları tek Undo ile
taşır. İkinci yol yalnız zaman/hedef dönüşümü kayıpsız tanımlanabiliyorsa açılır.
ID/easing/tangent/modifier korunur; nonlinear warp, SM veya dış referans
kayıpsız taşınamıyorsa işlem reddedilir. Bake ayrı işlem ve kaynak korunur.
İlk fixture yeni kliple başlar; genel precompose converter önkoşul değildir.
Owner kökünün zaman aralığı composition ms, owned çocukların görünürlük ve
desteklenen medya aralıkları içerik ms olur. Mevcut çocukların zaman alanları
sahiplik değişirken sessizce yeniden yorumlanmaz; ön inceleme bu farkı da
gösterir, yalnız desteklenen dönüşüm uygulanır. İlk fixture baştan bu bağlamla
oluşturulur. Property kilidi bu zaman dönüşümünün yerini tutmaz.

## 4. Tek değerlendirme hattı ve kesin yerel zaman

Mevcut `evaluateTrack`, `computeLocalTime` ve typed interpolation algoritmaları
kullanılır. Düşük seviye `evaluateTimelines` açık bir listeyi örneklemeye devam
edebilir; scene tüketicileri owned klipleri raw global listede yürütmez.
Önerilen frame planlayıcısı root/SM tabanını ve seçili owned klipleri birer kez
örnekler; disjoint/izinli sonuçları birleştirir. Binding/Wire/Expression aynı
korunan hedefleri sonradan ezemez. Render/bounds/demand/output aynı hazır frame
ve owner-time bilgisini alır; eksik overrides map'i inner hesabı atlayamaz.

Playback seçimi: aktif Timeline ID, offset ve speed. Başlangıç owner'ın mevcut
`Layer.startMs` alanıdır; duration/loop/hold Timeline'a aittir, iki yerde
çelişen kopya tutulmaz. İlk sürüm negatif hız/offset veya serbest time-remap açmaz:

```text
owner aktif değilse klip örneklenmez
qMs = offsetMs + (compositionTimeMs - owner.startMs) × speed
clipTimeMs = ortak süre/loop/hold politikası(qMs)
```

3.000 ms'de başlayan nesne, 500 ms offset ve 1× hızla sahnenin 4.000 ms anında
klibin 1.500 ms anını gösterir. 2.000 ms loop varsa sahne 5.500 ms'de klip
1.000 ms'dedir. Sıfır/bozuk süre ve loop sınırı açık doğrulanır. Seek, geriye
scrub ve offline export dt biriktirmez; her nesneye yeni rAF kurulmaz.

Sprite/video/particle/bake adapter'ları global `ctx.timeMs` yerine owner zamanını
uçtan uca aldığında açılır; ilk 2D teslim hepsini desteklemiş sayılmaz.
Onion-skin/motion blur her örnekte aynı planlayıcıyı kullanır. Owned klipli grup
statik LOD değildir. İlk owned 2D klip fazladan canvas/renderer gerektirmez.
Görünürlük, seçim ve demand hazırlığı aynı yerel aralıkları kullanır; yalnız
keyleri yerel saatte örneklemek yeterli değildir. Zamana bağlı medya consumer
kimliği asset ID'siyle sınırlanmaz; owner/kullanım kimliği ve kaynak zamanı
birlikte taşınır, aynı dosyanın iki kullanımı decoder saatini paylaşmaz.

## 5. Detayda gerçek authoring

Mevcut breadcrumb/Back/Apply/Cancel korunur. Solda izinli parça ağacı, ortada
yerel görünüm, sağda Properties, altta **yerel Timeline** bulunur. Aynı Set Key,
Curve ve Dope Sheet komutları açık owner+Timeline bağlamıyla kullanılır.
Sadece ana Timeline'ı filtrelemek bu teslimi karşılamaz.

- Yeni klip oluşturma, süre/loop/klip seçimi, Set Key ve scrub yapılabilir.
  Ana Timeline iç keyleri açmaz; nesnede klip/durum ve iç düzenleyici yolu olur.
- Ana zaman/bakış girişte tutulur, ana oynatma askıya alınır. Detay transport'u
  iç klibi sürer; dönüşte ana zaman korunur. İki host aynı runtime'ı tick etmez.
- `ItemDetailSession` bugün tek öğe patch'i kabul eder. Bu kontrol kaldırılmaz;
  izinli owner subtree + owned Timeline patch'i doğrulayan yeni session capability
  gerekir. Host/focus/bounded draft ve Apply transaction'ı paylaşılır.
- Apply tek ana Undo; Cancel source'u değiştirmez. Revision/CAS, insan kökeni,
  autosave/session restore ve bounded history korunur; stale Apply reddedilir.

### 5.1. Tek host, nesne tipine göre araç ve Timeline

Statik araç ile animasyon yeteneği ayrı capability'lerdir. Türün detay ekranı
olması bütün sütunların bugün desteklendiği anlamına gelmez. Aşağıdaki tablo
hedef tasarımdır; yalnız yukarıdaki DET0–DET1 alanları uygulanmıştır:

| Nesne / alt hedef | Detayda içerik araçları | Zaman / alt animasyon sınırı |
| --- | --- | --- |
| Shape / Path / Spline | Uygun geometri, nokta/tutamaç, stil; mevcut Pen/Spline araçları | Bir defalık içerikte mevcut keyleri filtreleme; komponentte izinli geometri/stil ve parça transform keyleri. Stable nokta kimliği korunur, indeks değişimi keyi başka noktaya bağlamaz. |
| Poly / mesh | Vertex/edge/face, UV, vertex color ve materyal | Sabit topolojide deform/pose kanalları; topoloji değişimi ayrı dönüşüm/diagnostic ister. Blob'un değişken topolojisi aynı key/cache formatına zorlanmaz. Poly/UV domain teslimini bekler. |
| Image / resim | Kaynak önizleme, crop/kadraj ve desteklenen görünüm ayarları | Statik resimde Timeline zorunlu değil. Pan/zoom/crop animasyonu capability eklenirse açılır; serbest çizim/piksel boyama kendi Drawing araçlarıdır. Kaynak dosyaya yazılmaz. |
| Texture / material slot | Slot asset'i, offset/rotation/scale/wrap; ilgili UV editörü | Mesh UV, image bytes ve material parametresinin sahipleri ayrıdır. Slot/UV keyleri yalnız adapter teslim edilince; her texture'a bağımsız klip yaratılmaz. |
| Video | Kaynak oynatıcı, in/out, poster ve mevcut temel clip ayarları | İç kaynak zamanı ile sahne zamanı ayrılır. Çoklu video/cache, chroma/despill, tracking ve ileri kurgu CFX'te kalır; video detay girişi bunları erkene çekmez. |
| Group / animasyonlu komponent | Yerel parça ağacı, Setup, number kontrolleri, klip oluşturma ve instance önizleme | Mevcut grup izolasyonu filtreli olabilir. Private komponentte gerçek yerel Timeline/Set Key/Curve/Dope Sheet; saat örneği IA1 kabulüdür. |
| Character / rig | Parça/bone/attachment ve poz araçları | Aynı içerik Timeline'ı; FK/IK/rest/skin kendi domain diliminde. Yeni bir Character Timeline motoru kurulmaz. |
| Kutulu 3D | Node ağacı, model yerleşimi, inceleme/çıktı kamerası, materyal/ışık | Native clip seçimi/trim/speed/loop ve yerel camera/placement keyleri. Imported bone/node keylerini tam authoring'e dönüştürme ayrı yetenektir; ilk clip oynatıcısı tam rig editörü diye sunulmaz. |
| Particle/emitter | Kaynak komponent seçimi, kontrol dağılımları ve emitter ayarları | Komponentin kendisi aynı detay editöründe; emitter doğum/yaş/fazı sürer. Particle başına kalıcı Timeline açılmaz; bu adapter particle aşamasındadır. |

Text/spline gibi mevcut doğrudan edit davranışları korunur. Genelleştirilmiş
double-click bunları ele geçirmez; açık sağ tık/toolbar komutu aynı yeteneğe
klavyeyle de ulaşır. Bir öğe birden fazla capability taşıyabilir: `Edit geometry`,
`Edit UV`, `Edit texture`, `Edit animation` hedefi açıkça ayırır. Shape/Path/model
için var olan detay girişleri bozulmaz. Çoklu seçimde Isolate sürer; tek içerik
detayı için belirsiz hedef otomatik seçilmez.

### 5.2. UI ve oturum davranışı

- Üst bağlam satırı `Scene › Clock` veya desteklenen alt hedefte
  `Scene › Robot › Material` gösterir. Her node tıklaması breadcrumb eklemez.
  Back/Apply/Cancel tuval üstünde yüzen uyarıya dönüşmez.
- Sol ağaç yalnız aktif kaynağın parçaları/asset alt hedeflerini gösterir.
  Ortada türe uygun canvas/3D/media görünümü, sağda aynı hedefin Properties'i
  bulunur. İlgisiz SM/Wires panelleri ana layout'tan silinmez.
- Alt alan zaman yeteneği varsa açılır; klip yokken `Create clip` sunar.
  Statik içerikte gereksiz boş Timeline ile viewport alanı daraltılmaz.
  Playhead birimi ve klip sahibi görünürdür; Timeline key seçimiyle detay
  viewport seçimi aynı local ID/instance bağlamında senkron çalışır.
- Ana dock mounted/inert kalır. Ana zaman/seçim/scroll/pan/zoom tutulur;
  detay girişinde ana playback durur, dönüşte kendiliğinden başlamaz.
  İnceleme kamerası/zoom kaynak animasyonuna key yazmaz; çıktı kamerasını
  düzenleme ayrı ve anlaşılır araç durumudur.
- Dirty Back, Apply/Discard/Stay sunar; Escape önce gesture/popup'ı kapatır,
  source'u sessizce atmaz. Odak geri döner, klavye kısayolu tek aktif editöre
  aittir. Desteksiz araç için neden gösterilir, yapılmamış işlem başarı sayılmaz.
- İlk teslimde tek detay oturumu vardır. Çok seviyeli edit gezinmesi sonradır;
  yalnız breadcrumb eklemek recursive source/runtime desteği sayılmaz.

### 5.3. Kaynak düzenleme, instance düzenleme ve sürüm sınırı

Instance Properties'i yalnız bu kullanımın parametrelerini ve dış transform'unu
değiştirir. `Edit definition`, private içeriğin kaynak sürümünü açar ve Apply
yeni immutable sürüm üretir. İlk uygulamada yalnız açıldığı instance'ın pin'i
güncellenir; diğer instance'lar eski sürümünde kalır. UI Apply öncesinde bu
kapsamı gösterir. Kütüphane kaynağından açılan edit yeni sürümü kaydeder;
toplu instance güncellemesi ayrı, açık sürüm yönetimi işidir.

`Make unique` yeni definition kimliği üretir; bağımlı asset'ler güvenli biçimde
paylaşılabilir. Normal instance kopyası aynı pin'li definition'a bağımsız
parametre/zamanla referans verir; kaynak keyleri kopyalamaz. Detayda değiştirilen
bir slotun bu kullanıma mı ortak asset'e mi ait olduğu bellidir. Imported image,
video veya GLB bytes'ı üzerine yazılmaz. Tanım içinden dış sahne katmanına gizli
referans verilmez; ihtiyaç açık input/slot ile karşılanır.

### 5.4. Küçük sözleşmeler ve mevcut registry'nin genişlemesi

Önerilen `DetailTarget` türü layer, component definition/instance, material slot,
mesh UV veya asset kullanımını stable ID ve sürümle ayırır. Bu yeni bir çağrılabilir
API değildir. Hedef çözümü, content belge okuma/commit, araç listesi ve zaman/klip
adapter'ları ayrı küçük kontratlardır; her statik image adapter'ı animasyon veya
solver metodu uygulamak zorunda kalmaz.

`ItemDetailRegistry.find` mevcut statik caller'lar için korunur. Bir hedefin
birden fazla yeteneğini keşfetme ve açık araç seçimi uyumlu biçimde eklenir;
first-match sırasını değiştirerek eski double-click davranışı bozulmaz.
Host türlere göre büyüyen tek bir switch/editor sınıfı olmaz. Math/topology,
resource, converter ve UI kendi feature köklerinde kalır; 300 satır sınıf hedefi
ve açıklanmış sözleşmeler uygulanır. Yeni mode veya uygulama geneline ikinci
state/history/asset cache sistemi kurulmaz.

## 6. 3D ve rig genişlemesi

2D ve 3D aynı owner/zaman orchestration'ını kullanır; 3D quaternion/skeleton
verisi 2D affine track gibi cast edilmez. Imported glTF klibi kaynak dosyada
kalır; Timeline kaydı bir 3D clip adapter'ına asset sürümü + animation index
referansı taşıyabilir. İsim tek başına kimlik değildir. Bone keyleri ana 2D
Timeline'a kopyalanmaz. Yeni authored 3D placement/camera kanalları yalnız
detay bağlamında açılır; mevcut global `animatable` yasağı toptan kaldırılmaz.

Three `AnimationMixer.setTime` saniye alır ve mixer timeScale'i uygular; adapter
ms→s ve hızın iki kez uygulanmamasını sahiplenir. Reset/loop/weight/action
durumu backward-seek testiyle doğrulanır; tek çağrı determinism kanıtı değildir.
`SkeletonUtils.clone` bone/skeleton eşleşmesini korurken geometri/materyali
paylaşabilir. Pose/mixer instance'a aittir; animasyon paylaşılan materyali
değiştiriyorsa copy-on-write gerekir. Statik `Model3DResource.draw` bugün
zaman/instance kontratı taşımıyor; açık adapter uzantısı ve bütçe gerekir.

2D rig/FK aynı parentId/parça ağacında bu kliplere key yazar; IK/rest/skin ayrı
domain teslimidir. Minimal parametrik definition/instance ortak ilk kullanımın
parçasıdır; library C1 bunu katalog/sürüm/kontrol authoring akışına genişletir,
ikinci iç animasyon sistemi kurmaz. Native 3D klip oynatmak için 2D definition'a
bone keyleri dönüştürmek gerekmez. Yerel SM/olay/ses ve recursive owner daha
ileri kapsamdır; temel iç klibin teslimini bekletmez.

### Parametrik saat ve particle örneği

Bir saat definition'ı kadran/parça kaynaklarını ve iç hareketi bir kez taşır.
İlk açık girdiler başlangıç saati/dakikası, çalışma hızı ve isteğe bağlı fazdır.
İç hesap, verilen başlangıç saatini içerik zamanıyla ilerletir; sistemin gerçek
duvar saati veya frame başına yeni random kullanmaz. Akrep/yelkovan dönüşleri
bu parametreler ve zamandan hesaplanabilir; dense key üretmek zorunlu değildir.

İlk kabul, aynı definition'ın farklı saat gösteren iki normal instance'ıdır.
Parametreler ve dış konum değişir; ortak kadran/key/source değişmez. Instance
her zaman ayrı bir rAF/Timeline kopyası başlatmaz. Ortak global zaman yeterliyse
kullanılır; offset/start/particle age yalnız açık playback politikasıdır.

Particle aşamasında emitter appearance kaynağı komponent referansı olabilir.
Her parçacık definition'a referans, kendi başlangıç parametreleri/fazı ve dış
particle transform'unu taşır. Parametre random'ı doğumda seed + kararlı
spawn/instance kimliği + kontrol kimliğiyle belirlenir; scrub/export aynı sonucu
üretir. Sahneye her parçacık için yüzlerce kalıcı Layer/Track yazılmaz.
Kaynak/animasyon/asset paylaşılır; küçük instance verisi ve gerekli pose ayrıdır.

Mevcut `ParticleRandom` ve particle age hesabı başlangıç sahipleridir. Yeni
parametre random'ı mevcut PRNG çağrı sırasını değiştirip eski emitter görünümünü
bozmaz; bağımsız deterministic stream/salt sözleşmesi gerekir. Bu bir component
particle renderer adapter'ı ister; bugün desteklenmiş sayılmaz. Görünür canlı
örnek, değerlendirme, pose ve yüzeyler bütçelenir. Paylaşılan geometri her
animasyonlu komponentin tek GPU draw call ile çizileceği anlamına gelmez.

## 7. Entegrasyon ve source uyumluluğu

| Sorumluluk | Mevcut sahip / değişmesi gereken sınır |
| --- | --- |
| Owner/saat | `src/lib/timeline` altında cohesive domain; interpolation evaluator'dan kopyalanmaz. |
| Kanal guard | `keyableChannels` / `drivenChannelReason`, `timelinePropertyScope`, `propertyPathsOverlap`; tek owner sorgusuna bağlanır. |
| Bütün yazıcılar | Set/Auto Key, paste/bulk/clear, native komut, script/MCP, generic patch ve import; aynı source doğrulaması/revision. |
| Frame girişleri | `evaluateSceneFrame`, `ChronoPlayer`, `useInteractiveRuntime`, `useSMRuntime`, SceneCanvas baseline, selection fallback ve MCP introspection'daki raw `evaluateTimelines` çağrıları. |
| Görüntü/kaynak | `prepareRenderFrame`, bounds/matrix, media demand/lease, temporal samples ve LOD; aynı frame/time context. |
| Kimlik/history | Clone remapper/Timeline clone, delete, authoring `SourceEntities`, portable ve session/history; orphan owner/clip reddi. |
| Çıktı | Web/player/prepared raster kabulü; basic/native/SVG açık capability veya seçilmiş bake. Metadata sessizce atılmaz. |

Bugünkü `SceneJsonConverter` ve MCP protocol bütün `1.x` sürümlerini tanıyabilir.
Yalnız `1.0.1` + optional owner, eski reader'ın iç klibi global oynatmasını
önlemez; private definition'ı da sessizce atlayabilir. Öneri owned belge için **yeni major source formatı**, yeni reader'da
eski 1.x desteği ve açık converter'dır. Eski proje otomatik migrate edilmez;
özellik kullanılmayan kaynak eski formatta kalır. CLI/MCP sürümü ayrı kontrattır.
Eski uygulamaya çıktı gerekiyorsa açık uyumlu compile/bake gerekir; metadata
silmek uyum sağlamaz. Bu sürüm henüz uygulanmaz/yayımlanmaz.

## 8. Aşamalı fakat gerekli teslim

**14 Kasım önceliği ve bağımlılık düzeltmesi:** [Ana plan §3.2–3.2.1](../production-2d-roadmap.md)
önce 3D-T0–T2 Timeline/iç animasyon kapısını, sonra 3D0–3D6'yı Poly/UV önüne
alır. IA kimlikleri yetenek adıdır, zorunlu sayısal sıra
değildir: önce IA0'ın dar 3D kaynak/instance/zaman sınırı; sonra 3D3/IA2a ve
3D4/IA2b. Parametrik 2D saat/IA1a–IA1b, Poly/UV sonrası bileşen aşamasındadır.
Native 3D klip için önce 2D komponent authoring'ini bitirmek gerekmez. Ortak
kontratlar gerçek tüketiciden çıkarılır; iç animasyon statik ekrana indirgenmez.
3D-T, IA0 ve IA2b'nin mevcut model/kamera alanlarıyla dar ilk teslimidir;
3D4'te temel authoring yeniden yazılmaz, node/native pose bağlamına genişletilir.

| Dilim | Somut tamamlanma koşulu |
| --- | --- |
| IA0 — kontrat | Owner/kanal/saat/format kararı; bütün girişlerin envanteri ve eski sahne fixture'ları. |
| 3D-T0–T2 — önce ortak Timeline kapısı | Ana/iç scope, owner/key doğrulaması; detayda yerel klip/Set Key/Curve/Dope Sheet; kesin zaman, scoped Apply/Cancel ve source/runtime/raster kabulü. IA0+dar IA2b'yi gerçek 3D tüketiciyle kapatır; 3D0'dan önce gelir. |
| IA1a — minimal tanım/örnek | Pin'li kaynak, bağımsız instance parametresi, yerel ID/asset çözümü, clone/save/history/çıktı kapsamı. İki saat ortak kaynağı paylaşır; yalnız registry veya JSON şeması teslim sayılmaz. |
| IA1b — çalışan 2D iç animasyon | Tür bazlı araç/Timeline capability, grup/parça ve izinli Shape/Path keyleri; dış hareket + iç animasyon eşzamanlı. Detay klip oluştur/Set Key/Curve/scrub, Apply/Cancel/tek Undo ve raster; iki saat farklı değer/hızla oynar. IA1a+IA1b birlikte ilk parametrik animasyonlu komponent kabulüdür. |
| IA2a — native 3D klip | Imported clip referansı/seçimi ve zaman adapter'ı, iki bağımsız pose, clip kontrolü ve raster. Ana Timeline dış kutu olarak kalır; import bütün bone keylerini üretmez. |
| IA2b — yerel 3D key authoring | Model/kamera yerel keyleri ve aynı detail transport'u. Native clip ile authored kanalın çakışma politikası açık; ilk kapsamda native bone keyleri read-only kalabilir. Tam rig/skin editörü ayrıca kabul edilir. |
| IA3 — kütüphane/rig genişlemesi | C1 katalog/sürüm/gelişmiş kontrolleri ve Character Motion; IK/skin kendi kabulüyle bağlanır. Particle tüketicisi kendi aşamasında bu kaynak/instance kontratını kullanır. |
| IA-P — component particle tüketicisi | Particle/fizik aşamasında kaynak referansı + deterministic doğum parametreleri/faz; age/scene-sync saati, bütçe ve eski emitter regresyon kabulü. Ana plan §3.1'de ayrı iş paketidir. |
| IA4 — kontrollü çok seviye | DAG/cycle/depth/toplam iş bütçesi; exposed controls, yerel SM/event/audio kararı. İlk klibin çalışması bu aşamayı beklemez. |

**14 Kasım T0 teslimi:** [Ana/iç authoring context ve key hedef policy'si](../timeline-authoring-context.md)
uygulandı. Optional host context native komut/script adapter/projection'a
taşınır; mevcut UI/MCP varsayılanı scene'dir, source formatı/evaluator aynı
kalır. T0 teslim kaydı 377 dosya / 3.042 testti. Sonraki T1 ve
[T2 ortak kabulü](../model-clip-acceptance.md) tamamlandı; genel komponent
ve native GLB klip işi kendi sonraki dilimlerinde kalır.
377 dosyada 3.042 test ve zorunlu build'ler geçti; genel komponent/native clip
oynatma desteği bu sonuçtan çıkarılmaz.

Asgari kabul fixture'ları:

1. Kök X'de giderken iki çocuk iç klipte döner. Dış X açık; iç rotation'a dış
   key/Wire/Expression/native/MCP ve bütün `transform` yazısı gerekçeyle reddedilir.
2. İki alternatif klipten yalnız seçili olan çalışır; farklı başlangıçlı iki
   kopyanın fazı bağımsızdır. Owner olmayan eski sahne aynı sonucu üretir.
3. 0→1.500→500→1.500 ms ve rastgele sırada aynı zaman aynı değer/görüntüdür.
   Loop sınırı, son kare hold ve sıfır süre test edilir.
4. Parent pivot/ölçek/dönüş, path/mask, bounds ve temporal örnekler aynı frame'i
   kullanır. Owner yaratma çakışması transaction yayınlamaz; insan keyleri korunur.
5. Apply/Cancel/Undo/Redo/reload/autosave/clone/array/delete referansları korur.
   Yeni portable kaynak eski reader'a sessizce açılamaz.
6. Preview/Web player/MCP/raster karşılaştırılır. Decode/mixer/pose kapat/sil/abort
   döngüsünde bırakılır; owner olmayan sahnede yeni sürekli iş yükü başlamaz.
7. Tek saat definition'ının iki instance'ı farklı saat/hız taşır; birini
   değiştirmek diğerini veya definition'ı değiştirmez. Detayda doğru kaynak
   sürümü düzenlenir. Ana Timeline'da akrep/yelkovan/bone track yığını oluşmaz.
8. Component particle adapter'ı eklendiğinde aynı seed/spawn kimliğiyle rastgele
   parametreler ve particle-age klip zamanı deterministiktir; eski emitter'lar
   değişmez, doğan parçacık sayısıyla source Layer/Track sayısı artmaz.
9. Tür değişimi / açık capability seçimi doğru araç, Properties ve Timeline
   kapsamını açar. Statik image gereksiz Timeline açmaz; UV tıklaması image
   bytes'ını değiştirmez. Eski Pen/Spline/text ve model kamera toggle korunur.
10. Kaynak düzenleme yeni sürümde yalnız seçili pin'i günceller; diğer instance
    korunur. Make unique, library edit ve instance parametresi farklı kapsamdadır.
    MCP/script de aynı hedef/sürüm/revision kurallarına uyar.

Her dilimde gerçek render ve asgari save/load/clone/history/çıkış/resource kabulü
tamamlanır; bunlar sonraki genel optimizasyona ertelenmez. Capability/API/skill
ve mevcut helper içerikleri uygulamayla birlikte güncellenir; ayrı helper
sistemi veya henüz çalışmayan araçlara yardım metni eklenmez.

Bu plan yeni yeteneği test edilmiş saymaz. Önceki 53 regresyon testi mevcut
davranışı kontrol eder; IA1/IA2'nin yukarıdaki testleri uygulamayla eklenir.
Bu tasarım incelemesinde Set Key, bulk/clear, model Timeline scope, düz Timeline
bağımsızlığı ve statik detay oturumu için 6 dosyada 51 mevcut test ayrıca geçti.
Bu da owner/yerel klip kodunun henüz uygulanmış olduğu anlamına gelmez.

Tür bazlı detay/komponent planı birleştirilirken mevcut statik detay oturumu,
görünüm izolasyonu ve seeded particle random için 3 dosyada 25 test geçti.
Değişiklikler yalnız dokümandır; yeni capability'ler çalışıyor diye işaretlenmedi.
Eklenen/değişen yerel belge bağlantıları ve whitespace kontrolü de doğrulandı.

## Birincil referanslar

- [Adobe precomposing/nesting](https://helpx.adobe.com/mena_en/after-effects/desktop/work-with-compositions/precomposing-and-nesting/precomposing-nesting-pre-rendering.html): dış/iç transform ayrımı örneği; ilk Chorono dilimi tam composition network değildir.
- [Three AnimationMixer](https://threejs.org/docs/pages/AnimationMixer): runtime, saniye, setTime/timeScale ve cleanup.
- [Three SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils): skeleton clone ve geometri/materyal paylaşımı.
