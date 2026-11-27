# Ortak öğe detay düzenleyicisi ve izolasyon planı

12 Kasım 2026 kullanıcı kararı. **13 Kasım: DET0–DET1'in dar ortak host'u
Shape/Path ve sabit model yerleşimiyle uygulandı**; [gerçek sözleşme ve kabul](../item-detail-editor.md).
Kalan yetenekler plandır; burada önerilen bütün alanlar çağrılabilir API değildir.
**13 Kasım birleştirme:** Animasyonlu izole nesne, alt klip, tür bazlı araçlar
ve parametrik definition/instance için [koordinasyon planı](item-owned-animation-plan.md)
esas alınır. Bu belge ortak host ve etkileşim sahipliğini ayrıntılandırır;
aynı kapsam için ikinci bir animasyon veya oturum sistemi tanımlamaz.
Shape/Path/Poly, image/resim, texture, video,
group/component ve kutulu 3D için yeniden kullanılabilir detay açma yapısı
planlanır. Texture bir katman türü olmak zorunda değildir; bir materyalin veya
Poly görünümünün image asset referansı da detay hedefi olabilir.

DET0–DET1 ortak detay/izolasyon akışı öne alındı ve dar teslimi tamamlandı.
**14 Kasım kullanıcı önceliği:** sırada [ana plan §3.2](../production-2d-roadmap.md)
önce 3D-T Timeline/iç animasyon temeli, sonra 3D0–3D6; ardından Poly → UV/görünüm → 2D bileşen/karakter → simülasyonlar →
export → son optimizasyon → sonraki CFX vardır. Ortak host yeniden yazılmaz;
3D adapter node/kamera/material/klip araçlarıyla kademeli genişler.
Bağımsız 3D Modeling, Video Editor veya Game Engine modunu etkinleştirmez.

3D native klip ve yerel key IA2a/IA2b için IA0'ın dar owner/zaman kontratı
kullanılır; önce 2D saat/IA1 authoring'ini teslim etmek şart değildir. Ancak
3D-T'de ana/iç bağlam, temel yerel key düzenleme, scoped commit ve zaman kabulü
3D0'dan önce tamamlanır; statik ana Timeline filtresi tek başına yeterli değildir. 13 Kasım
alt bölümündeki sıra yorumlarını bu yeni öncelik günceller; gerçek DET0–DET1
teslim sınırı değişmez.

## Mevcut kod ve tekrar kullanım sınırı

**14 Kasım T0 teslimi:** [Scene/content Timeline bağlamı ve key hedef policy'si](../timeline-authoring-context.md)
native komut/projection temelinde uygulandı. Statik detay host'u key UI'sına
dönüştürülmedi; sırada T1 scoped klip/commit ve T2 runtime zaman/çıktı kabulü vardır.

- `src/lib/scene/visibility/isolationView.ts` ve
  `src/app/hooks/useLayerIsolation.ts`: kaynak hidden/solo değerlerini
  değiştirmeyen geçici görünüm izolasyonu. İzolasyonda normal düzenlemeler
  mevcut komutlarla doğrudan belgeye uygulanır; Exit bunları geri almaz.
- `src/lib/registry/LayerDefinition.ts`: tür/property/capability keşfi ve
  kutulu 3D'nin ana Timeline'dan ayrılan iç property sınırı.
- `src/lib/editor/`, `src/lib/editor/authoring/` ve `src/lib/editor/history/`:
  komut, revision, insan/ajan kökeni ve bütçeli Undo/Redo sahipleri.
- `src/components/canvas/interactions/EditorPointerSession.ts`: araç
  gesture/cancel yaşam döngüsü. Yeni detay araçları ikinci mouse-up sistemi kurmaz.
- `src/lib/render/media/VisualMediaSession.ts` ve
  `src/lib/resources/residency/ResidentResourceCache.ts`: consumer lease ve
  bütçeli medya sahipliği; her detay sekmesi ayrı sınırsız cache açmaz.
- `src/lib/modes/ModeRegistry.ts`, `src/lib/core/ModeDescriptor.ts` ve
  `src/lib/modes/bootstrap.ts`: workspace modu farklı sorumluluktur. Bootstrap
  bugün yalnız `2danimation` kaydeder; mevcut core sözleşmeleri tamamen boyuttan
  bağımsız kabul edilmez, ihtiyaç oldukça uyumlu adapter ile genişletilir.

## İki işlem, ortak gezinme

**Isolate:** Seçilen katmanları ve alt ağaçlarını mevcut sahne bağlamında gösterir.
Parent transform/compositing bağlamı korunur; bir alt belge veya yeni timeline
yaratmaz. Mevcut davranış korunur, export kaynağı görünüm filtresi değildir.

**Edit content / Detay:** Çift tık, sağ tık menüsü veya açık komutla öğeye uygun editörü açar.
Ortak çerçeve başlık, breadcrumb, seçim odağı, yetenekler, kaynak hazırlık durumu
ve Apply/Cancel sunar. Düzenleme hedefe bağlı sınırlı taslakta yapılır; Apply
doğrulanan değişikliği ana belgeye tek Undo işlemiyle aktarır. Cancel taslağı
atar. Bu taslak davranışı mevcut Isolate işlemine geriye dönük uygulanmaz.

Öğe türü desteklemiyorsa mevcut çift tık/inline düzenleme korunur. Örneğin text
edit veya spline nokta düzenleme yeni genel çift tık handler'ı ile ele geçirilmez.
Katman birden çok detay yeteneğine sahipse açık komutlar hedefi ayırır: şekil
geometrisini düzenle, dokuyu düzenle veya UV'yi düzenle gibi.

## Arayüz kararı — aynı uygulamada detay çalışma alanı

İlk sürüm ayrı OS/browser penceresi veya küçük modal değildir. Mevcut dock
alanında geçici detay çalışma alanı açılır; uygulama üst araç çubuğu ve genel
görsel dil korunur. Tek bir dar panel içine viewport/araçlar/Properties sıkıştırılmaz.
Bu bir workspace **görünümüdür**; ModeRegistry'de yeni ürün modu değildir.

| Bölge | Detay açıkken davranış |
| --- | --- |
| Üst bağlam satırı | Viewport üstünde ayrılmış sabit satır: Back, breadcrumb, tür, draft durumu, Apply/Cancel. Canvas üstüne yüzen uyarı/etiket olarak çizilmez. |
| Breadcrumb | Örnek: Scene › Robot › Material. Scene ve gerçek üst düzenleme hedefleri geri dönüş düğmesidir; son öğe current-page'dir. Her node seçimi yeni detay oturumu/breadcrumb üretmez. |
| Sol panel | Yalnız aktif içeriğin ağacı/alt öğeleri veya ilgili araçları. Ana sahnenin uzun Layers/Explorer listesi geçici olarak geri planda kalır. |
| Orta alan | Aktif öğenin detay viewport'u; gerekirse ana kompozisyon bağlamını göster seçeneği. Bu bağlam görüntüsü editleme hedefini genişletmez. |
| Sağ panel | Aktif adapter'ın Properties'i. 3D yerleşim/kamera, shape konturu veya image crop aynı panel alanını kullanır. |
| Alt panel | Statik image/texture'da varsayılan katlı. Bir defalık Shape/group'ta mevcut key filtresi olabilir; animasyonlu komponentte gerçek yerel klip/Set Key/Curve görünümü açılır. İç 3D Timeline kendi capability'si teslim edilince gelir. |
| İlgisiz paneller | Main State Machine, Events/Wires ve diğer paneller kapatılıp silinmez; detay görünümünden geçici çıkarılır. Detay parametre bağlantısı gerekiyorsa capability ile erişilir. |

`src/components/dock/DockLayout.tsx`, `types.ts` ve mevcut panel registry yeniden
kullanım adaylarıdır. `useDockLayout.ts` bugün tek ana localStorage anahtarına
yazar; detay görünümü bu değeri geçici panel listesiyle ezemez. Uygulamada ana
dock snapshot'ı saklanır, detay layout state'i ayrı geçici sahibi üzerinden
verilir. Çıkışta ana panel konumları, açık sekmeler, layer/key seçimi, Timeline
zamanı/scroll'u ve viewport pan/zoom aynen geri gelir. Silinmiş seçimler stable
ID ile güvenli temizlenir. Detay girişinde ana playback durdurulur; çıkışta
kendiliğinden başlatılmaz. Zamanı olmayan editörde sahne keyleri değiştirilmez.

Layers/Scene Explorer/viewport sağ tık menüsünde ayrı **Edit content…** ve
**Isolate selection** eylemleri bulunur; ikisi aynı davranış gibi sunulmaz.
`src/components/ui/ContextMenu.tsx` ve mevcut menü kurucuları genişletilir.
Desteklenmeyen hedefte detay komutu disabled + neden sunar; yanlış editör açmaz.
Çoklu seçimde Isolate kullanılabilir; Edit content ilk dilimde tek desteklenen
hedef ister. Seçili çoklu kümenin üstünde sağ tık seçimi düşürmez; ilgisiz öğeye
sağ tık hedefi açıkça belirler. Klavye context menu ve açık komut eşdeğerdir.
Sürükleme, pen/shape placement veya başka aktif gesture ikinci tıkla kesilmez.

Breadcrumb/Back taslak değişikliklerini sessizce Apply veya Discard etmez.
Temiz taslakta doğrudan dönülür; dirty durumda Apply and return / Discard and
return / Stay seçenekleri sunulur. İç içe detayın Apply'ı üst taslağa işler;
en dış Apply ana belgeye tek Undo olarak gider. İlk dilimde tek seviye yeterli
olabilir, nested gezinme ancak aynı sahiplik kabulünü sağladığında açılır.
Escape önce popup/gesture'ı kapatır; dirty dokümanı sessizce atmaz. Focus ve
Undo/Redo kısayolu aktif editör kapsamındadır. Breadcrumb ve çıkış eylemleri
klavyeyle erişilir; dar alanda orta breadcrumb öğeleri erişilebilir menüye
alınır, Back/current item/Apply/Cancel kaybolmaz. Ana dock'un üzerine boş alan
eklenmez; detay bölgesi mevcut kullanılabilir yüksekliği doldurur.

## Genişletilebilir sorumluluklar

Aşağıdaki adlar önerilen sorumluluk isimleridir; public TypeScript API değildir.

| Sorumluluk | Sınırı |
| --- | --- |
| Detay çerçevesi / host | Sekme, breadcrumb, focus, Apply/Cancel ve desteklenen komutları gösterir; mesh/decoder/solver bilmez. |
| Detay oturumu | Hedef kimliği, açılış revision'ı, taslak, dirty durumu, iptal ve kaynak lease yaşam döngüsünü yönetir. Proje sessionId'sinden ayrı geçici kimliği vardır. |
| Tür adapter'ı | Hedefi çözer, gerçek schema üzerinden izinli editleri ve doğrulamayı sağlar; görünümü ve renderer'ı kendi domain'inden alır. |
| Belge/commit adapter'ı | Stable ID ve version doğrular, hedef kapsamındaki patch/komutları mevcut editöre uygular; bütün sahneyi taslakla değiştirmez. |
| İsteğe bağlı zaman/parametre adapter'ı | Yalnız gerekirse iç saat, klip ve dışarı açılan parametreleri sağlar. Her öğe Timeline veya fizik döngüsü uygulamak zorunda değildir. |

Host/UI `src/components` altında; editör oturumu/commit orchestration mevcut
`src/lib/editor` altında büyür. Shape/Poly, asset/video ve model3d araçları kendi
domain'lerinde kalır. Core'a yalnız en az iki gerçek tüketicinin gerektirdiği
küçük nötr sözleşmeler çıkarılır. Tek dev editor sınıfı, tüm türleri zorunlu
metotlarla yükleyen interface veya kopyalanmış ayrı editör uygulamaları kurulmaz.
Ortak yaşam döngüsü gerçekten oluşursa dar abstract base kullanılır; algoritma,
renderer ve iş politikaları composition ile verilir.

## Türlere göre içerik ve zaman

| Hedef | Detay içeriği ve kapsam | Zaman/ana sahne sınırı |
| --- | --- | --- |
| Shape / Path / Spline | Desteklenen ölçüler, kontur/nokta/tutamaç ve stil; mevcut nokta edit araçları kullanılır. | Bir defalık içerikte mevcut key filtresi; parametrik komponent kaynağında scoped iç klip authoring'i. Ana keyler otomatik taşınmaz, kaynak keyleri instance başına çoğaltılmaz. |
| Editable Poly | Vertex/edge/face ve topoloji; ilgili dilimde UV/vertex color. | Stable vertex/face kimliği ve topology invalidation korunur; iç mesh key/bake formatı kendi domain'indedir. |
| Image / resim | Kadraj/crop ve desteklenen non-destructive görünüm ayarları. | Kaynak piksel dosyası değiştirilmez. 2D layer transform'u ve keyleri yerinde kalır; Timeline zorunlu değildir. |
| Texture / material slot | Asset seçimi, texture offset/rotation/scale/wrap ve UV görünümü; UV düzenleme ilgili Poly adapter'ını kullanır. | Image kaynağı, materyal parametresi ve mesh UV'sinin sahipleri ayrıdır. Bu bir texture-paint veya PBR material editörü teslimi sayılmaz. |
| Video | Kaynak önizleme, in/out, poster ve desteklenen mevcut clip kontrolleri. | Kaynak zamanı ile kompozisyon zamanı adapter ile ayrılır. Çoklu decode/cache, ileri kurgu/keying CFX7/7K'de kalır. |
| Group / component | Alt ağaç, reusable source, açık kontroller ve iç klipler. | Isolate grupta yalnız görünüm filtresidir; komponent açık komutla yaratılır. Minimal source/instance IA1a, gerçek yerel authoring IA1b; saat örneği ikisi birlikte kabul edilir. |
| Kutulu 3D | Node ağacı, model/materyal/ışık/çıktı kamerası ve ileride iç klip/key araçları. | Ana Timeline yalnız dış 2D kutuyu yönetir. İç 3D Timeline ve inceleme/çıktı kamerası ayrımı 3D adapter'ına aittir. |

Statik image/detail açılması ücretsiz bir piksel boyama, video kurgu, mesh
modelleme veya rig üretme yeteneği eklemez. Her alan yalnız teslim edilen
capability'leri gösterir; source dönüşümü varsa ayrı converter kayıp/diagnostic
bilgisini verir ve özgün kaynağı korur.

## Belge, paylaşım ve düzenleme güvenliği

1. Hedef stable belge/öğe kimliği ve typed alt hedefle çözülür: katman,
   material slot, mesh UV veya asset gibi. İndeks/ekran seçimi kaynak kimliği
   sayılmaz. Oturum açılırken sahip revision ve izinli property kapsamı okunur.
2. Shared asset/component düzenlemesinde **bu kullanım** ile **ortak kaynak**
   seçimi görünürdür. Sadece bu kullanım için mevcut desteklenen override veya
   Make unique yolu kullanılır; diğer kullanıcılar/instance'lar sessizce değişmez.
   Import edilen GLB/image/video bytes'ı yerinde üzerine yazılmaz.
   Definition edit'i yeni immutable sürüm üretir. İlk uygulamada yalnız edit'in
   açıldığı instance yeni sürüme pin'lenir; diğer instance'ların sürümü korunur.
   Kütüphane kaynağından edit yeni sürümü kaydeder, toplu güncelleme ayrı işlemdir.
3. Apply revision'ı yeniden denetler. Arada değişiklik varsa hedef yeniden okunur;
   yalnız çakışmadığı doğrulanan alanlar yeniden hazırlanabilir. Aynı alandaki
   insan/ajan değişikliği sessizce ezilmez. Silinmiş hedefe veya değişmiş asset
   kimliğine stale taslak uygulanmaz. MCP readToken/expectedRevision kuralı sürer.
4. İç taslakta Undo/Redo kullanılabilir; ana belgeye Apply tek geri alınabilir
   komuttur. Kapsam dışı parent, child, key ID/easing, referans ve köken bilgileri
   korunur. Değişmeyen alanlar son yazan actor kaydını kaybetmez.
5. Kaydet/aç ve mevcut sessionId tabanlı kurtarma committed kaynak + mevcut
   bütçeli history'yi saklar. Açık detay taslağı ilk sürümde portable/session
   kaydına otomatik dahil edilmez; UI bunu belirtir. Taslak kurtarma eklenirse
   ayrı bounded/versioned kayıt ve yeniden revision doğrulaması gerekir.
6. Nested detaylar breadcrumb ile izlenir; döngüsel asset/component referansı
   açılmaz. Silinen hedef/belge değişimi ve Cancel async işleri iptal eder,
   lease'leri bırakır, pointer capture ve focus'u doğru editöre döndürür.

## Gelecekteki 3D ve Game Engine modlarıyla çakışmama sınırı

- Sonraki kullanıcı yönüyle [ortak 3D İçerik Editörü](boxed3d-isolated-editor.md)
  3D authoring araçlarının tek sahibidir; aynı iş için ikinci bağımsız 3D
  Animation/Modeling editörü kurulmaz. Gelecek tam alan görünümü aynı adapter'ı
  kullanabilir. 2D kutu ve oyun dünyası aynı versioned içeriğin ayrı kullanım
  adapter'larıdır; oyun dünyası native 3D içeriği kullanabilir, kutu bitmap'ine
  mecbur değildir. Bu yeniden kullanımın tamamı henüz uygulanmış değildir.
- **Workspace mode ≠ içerik editörü ≠ sahnedeki layer.** Detay sekmesi açmak
  ModeRegistry'ye yeni mod eklemez; kutulu model yeni oyun dünyası yaratmaz.
  Gelecekteki modlar aynı host/lifecycle'ı kendi belge ve renderer adapter'larıyla
  kullanabilir. 2D `Layer` türü veya model3d payload'ı evrensel GameObject yapılmaz.
- Paylaşılabilenler stable source/asset kimliği, validasyon, topology/UV hesapları,
  komut yaşam döngüsü, parametre sözleşmeleri ve kaynak sahipliğidir. 2D affine,
  3D matrix/projection, renderer/depth/material ve runtime solver ayrıdır.
- Bir static/detail içeriği otomatik oyun entity'si, physics body, behavior veya
  state machine state'i üretmez. İleride oyun için entity/component adapter'ı
  ve açık dönüşüm gerekir; yeni physics/scripting motoru bu planla yazılmaz.
- Host sabit 2D Timeline veya requestAnimationFrame döngüsü dayatmaz. Görsel
  authoring saati mevcut evaluated-frame/local-clock hattına bağlanır; gelecek
  oyun simülasyonunun tick saati kendi domain'indedir. Runtime test/oynatma
  durumu kaynak veya Undo'ya kendiliğinden Apply edilmez.
- Canvas2D, Three ve olası gelecek render backend'leri capability üzerinden
  seçilir; tek renderer hepsini destekliyor gibi gösterilmez. Farklı model
  kutularının ortak depth/ışık/gölgesi CFX10'daki ayrı compositing kapsamındadır.
- Dışarı açılan kontrol listesi typed ve sınırlıdır. İleride Wire/Expression ile
  bir iç kontrolü sürmek, bütün iç kemik/node/keylerini ana 2D Timeline'a taşımaz;
  bu bağlantı henüz mevcut bir model3d API'si olarak vaat edilmez.
- 2D içerik için dünya içi düzlem/sprite/billboard ile ekran üstü HUD/UI ayrı
  kullanım adapter'larıdır. 2D kaynak kendi editöründe kalır; 3D içerikte veya
  oyunda kullanmak orijinal shape/video/image kaynağını düzleştirmez. Görsel kaynak
  ile oyun entity/component/input/physics verisi farklı sahiplerde tutulur.

## Kaynak ve çıktı yaşam döngüsü

Source JSON ve stable referanslar saklanır; DOM, Three/WebGL, decoded frame,
texture ve solver buffer'ları saklanmaz. Taslak/history, decode işi ve render
hedefleri mevcut bayt bütçesi/queue/residency politikasına katılır. Detay açmak
her katmanın her kaynağını hazırlamaz; hedef ve gerekli bağımlılıklar demand ile
yüklenir, inactive/kapalı detay consumer pin'ini bırakır. Geç gelen sonuçlar
hedef+revision+oturumla doğrulanır; Cancel'dan sonra yayınlanmaz.

İnceleme bakışı, isolate filtresi, tutamaç ve seçim overlay'i çıktı kaynağı
değildir. Apply sonrası viewport/raster/portable aynı committed kaynağı kullanır.
Desteksiz runtime/export açık capability hatası veya kullanıcı tarafından
seçilmiş bake/converter ister; yeni detay ekranı mevcut çıktı desteğini genişletmiş
sayılmaz. Son genel optimizasyon bu temel yaşam döngüsü kontrollerini ertelemez.

## Teslim sırası ve önceki 3D önerilerinin yeri

### 13 Kasım kod denetimi — iç animasyon ve rig henüz yok

DET0–DET1 ortak statik detay host'udur; animasyon içinde animasyon veya
karakter rig editörü teslimi değildir. `src/lib/types/core.ts` içindeki
Timeline'lar düz scene listesinde durur; `evaluator.ts/evaluateTimelines`
bunları ortak overrides map'inde değerlendirir. Mevcut local-time/loop ve SM
saatleri yeniden kullanım temelidir, fakat nested source/instance/child Timeline
anlamına gelmez. `LayerType` içinde reusable component/subscene veya skeleton
source türü ve detayda ayrı oynatma/Timeline UI'sı henüz bulunmaz.

3D importta `ModelAssetService.ts` kaynak GLB bytes'ını korurken runtime parse
sırasında animations dizisini boşaltır; ilk dilim sabit pozu gösterir. İç
model/kamera keyleri de ana 2D authoring'de kapalıdır. Source alanlarını açmak
tek başına bir klip oynatıcısı veya bone/rig düzenleyicisi sağlamaz.

### Risk incelemesi — zorunlu ortak motor yerine ayrı kabul kapıları

**Güncel ürün kararı:** İç animasyon detay ekranının gerekli yeteneğidir.
[Ayrıntılı owned animasyon planı](item-owned-animation-plan.md), `Timeline[]`
yapısını koruyup owner, tek property yazıcısı, yerel saat ve gerçek detay
Timeline authoring'iyle IA1/IA2 teslimlerini tanımlar. Bütün nesnenin dış
animasyonunu kapatmak yerine yalnız içeriğin sahip olduğu kanallar korunur;
dış kök transform/opacity açık kalır. Genel recursive motorun ertelenmesi
bu ilk teslimlerin ertelendiği veya statik ekranın yeterli olduğu anlamına gelmez.
Koordinasyon planındaki IA1a/IA1b ve IA2a/IA2b, burada toplu IA1/IA2 diye anılan
teslimlerin alt adımlarıdır. Tür bazlı araç matrisi aynı belgenin §5.1'inde,
oturum/registry genişleme sınırı §5.2–5.4'ündedir.

Sonraki saat/3D örneğiyle ortaklık sınırı netleştirildi: aynı Timeline tipi ve
evaluator, bütün içerik kliplerinin tek global dizide durmasını gerektirmez.
Basit izolasyonda mevcut Timeline filtrelenebilir. Native 3D klip içerikte,
animasyonlu komponent klibi sürümlü definition'da kalır; ana görünüm yalnız
dış hareket ve açık kontrolleri taşır. Minimal parametrik definition/instance
IA1'in parçasıdır; tam library tarayıcısı ve component particle adapter'ı kendi
aşamalarında eklenir. Saat örneği sadece filtreli Timeline ile tamamlanmış sayılmaz.

[İç animasyon risk incelemesi](internal-animation-risk-review.md), mevcut düz
evaluator/clock ve instance sahipliği nedeniyle genel nested çekirdeğin
doğrudan entegrasyonunu riskli bulur. Önceki başarısız denemeye ait kesin
uygulama/revert kaydı bulunamadı; tarihsel plan zaten nested bileşenleri C2'ye
ayırır. Ortak iç animasyon motoru ileri 3D veya temel rig/FK için zorunlu bir
önkoşul değildir. Aşağıdakiler ayrı ihtiyaçlardır, tek seferde teslim taahhüdü
değildir:

1. **Bağımsız klip için kaynak ve değerlendirme:** Stable ID'li alt içerik ve
   instance referansı, iç Timeline/klip, ana zaman → içerik zamanı eşlemesi
   (başlangıç, offset, hız, loop/hold politikası), scoped hedefler ve döngüsel
   referans koruması. 2D affine ve 3D TRS payload'ları ayrı adapter'lardır.
2. **Detayda authoring:** Yerel playhead/scrub/Set Key ve iç animasyon listesi.
   Ana Timeline kutu/instance'ın dış hareketini kontrol eder; iç keyler aynı
   source alanlarına kopyalanmaz. Apply/Cancel, revision, Undo, instance override,
   portable ve final-frame zaman eşliği birlikte teslim edilir.
3. **Rig araçları:** 2D için parça/joint/attachment ve FK/IK; mesh deformasyonu
   gerektiğinde Poly/UV + skin weights/rest pose. 3D için imported skeleton/clip
   oynatma ve pose düzenleme ile sıfırdan rig/weight/IK üretme ayrı capability'lerdir.
   Aynı detay host'u araçları barındırır; aynı skeleton/solver formatı iki boyuta
   zorla uygulanmaz. Oyun runtime'ına otomatik entity/physics üretmez.

DET0–DET1 statik kalır. Mevcut grup/karakter keylerinin filtreli detay görünümü
ve normal transform keyleriyle rigid FK genel nested motor gerektirmez. Tek
ithal 3D klibi için önce tek seviyeli, yaprak model adapter'ı araştırılabilir;
per-instance pose, kesin zaman, bütçe ve çıktı kabulü olmadan açılmaz. Recursive
alt sahne, yerel SM/olay/ses ayrı ileri kapsamda bekler. Ortaklık kanıtlanan
track/math ve lifecycle sözleşmelerinden çıkarılır; legacy evaluator'ın genel
semantiği değiştirilmez. Bu 13 Kasım denetiminin Poly/UV-önce sırası 14 Kasım
§3.2 3D önceliğiyle güncellenmiştir; denetim klip/rig uygulaması sayılmaz.

### 13 Kasım kod denetimi — iç animasyon ve rig henüz yok

DET0–DET1 ortak statik detay host'udur; animasyon içinde animasyon veya
karakter rig editörü teslimi değildir. `src/lib/types/core.ts` içindeki
Timeline'lar düz scene listesinde durur; `evaluator.ts/evaluateTimelines`
bunları ortak overrides map'inde değerlendirir. Mevcut local-time/loop ve SM
saatleri yeniden kullanım temelidir, fakat nested source/instance/child Timeline
anlamına gelmez. `LayerType` içinde reusable component/subscene veya skeleton
source türü ve detayda ayrı oynatma/Timeline UI'sı henüz bulunmaz.

3D importta `ModelAssetService.ts` kaynak GLB bytes'ını korurken runtime parse
sırasında animations dizisini boşaltır; ilk dilim sabit pozu gösterir. İç
model/kamera keyleri de ana 2D authoring'de kapalıdır. Source alanlarını açmak
tek başına bir klip oynatıcısı veya bone/rig düzenleyicisi sağlamaz.

Mevcut ileri detay/3D ve bileşen/karakter dilimlerinin açık bağımlılığı:

1. **Ortak iç animasyon kaynağı ve değerlendirme:** Stable ID'li alt içerik ve
   instance referansı, iç Timeline/klip, ana zaman → içerik zamanı eşlemesi
   (başlangıç, offset, hız, loop/hold politikası), scoped hedefler ve döngüsel
   referans koruması. 2D affine ve 3D TRS payload'ları ayrı adapter'lardır.
2. **Detayda authoring:** Yerel playhead/scrub/Set Key ve iç animasyon listesi.
   Ana Timeline kutu/instance'ın dış hareketini kontrol eder; iç keyler aynı
   source alanlarına kopyalanmaz. Apply/Cancel, revision, Undo, instance override,
   portable ve final-frame zaman eşliği birlikte teslim edilir.
3. **Rig araçları:** 2D için parça/joint/attachment ve FK/IK; mesh deformasyonu
   gerektiğinde Poly/UV + skin weights/rest pose. 3D için imported skeleton/clip
   oynatma ve pose düzenleme ile sıfırdan rig/weight/IK üretme ayrı capability'lerdir.
   Aynı detay host'u araçları barındırır; aynı skeleton/solver formatı iki boyuta
   zorla uygulanmaz. Oyun runtime'ına otomatik entity/physics üretmez.

Bu çekirdeğin dar kısmı iç 3D animasyonun önünde, ileri 3D diliminde geliştirilir;
bileşen kütüphanesi ve karakter aşaması onu yeniden kullanır. Böylece ilerideki
component teslimini önce bekleyen döngüsel bağımlılık kurulmaz. Poly/UV önceliği
ve mevcut genel sıra değişmez; bu denetim kod veya rig sistemi uygulaması değildir.

| Dilim | Onaylı sıradaki yeri ve sınırı |
| --- | --- |
| DET0 — dar sözleşme uygulandı | Mevcut ContextMenu/Isolate/komut sahipleri üzerinden capability catalog, hedef, revision ve taslak sınırı. [Gerçek sözleşme](../item-detail-editor.md). |
| DET1 — ilk statik host uygulandı; T1 model genişlemesi ayrı | Shape, Bézier Path ve model3d sabit yerleşim; Layers/Explorer/viewport sağ tık, Shape/model çift tık, tek seviyeli breadcrumb/Back, bounded draft, Apply/Cancel ve tek Undo. Ana dock mounted/inert korunur. Path eski çift tık/Pen ve ad Rename korunur. Nested detay ve ileri native GLB klip/rig henüz yoktur. 14 Kasım T1, model/kamera için private klip/Keys/Curve ekler: [gerçek sözleşme](../model-content-clips.md). |
| DET2 — image / texture / Poly | Poly/UV ve asset araçları ilgili dilimleri teslim edildiğinde aynı host'a bağlanır; yeni UV algoritması veya texture-paint DET1'e gizlenmez. |
| DET3 — ileri kutulu 3D | Aynı host üzerinde node seçimi, materyal override, ışık/ortam, gölge, kamera preset/perspective/orthographic; iç Timeline/clip ayrıca risk kapısına tabidir. Genel nested motor bu statik araçların önkoşulu değildir. Her biri ayrı capability/kabul dilimidir. |
| DET4 — reusable kontroller | Bileşen/karakter diliminde group/component adapter, typed exposed parameters, slider/bool/Wire/Expression ve gerekirse parça etkileşimleri. Turntable ve explode gibi hazır hareketler iç zaman/parametre altyapısından sonra gelir. |
| DET5 — video ve compositing | Mevcut dar video kontrolleri adapter ile açılabilir; çoklu video/cache/kurgu/chroma/despill CFX7/7K, depth/part-mask/holdout ve ortak kamera CFX10 teslimidir. Yeni format importer'ları ayrı kabul edilir; ilk adapter kapısını bekletmez. |

İleri 3D'nin kamera preset'leri, material/lighting, imported clip, hazır hareket,
parametre ve etkileşim önerileri bu tabloda kaydedilmiştir; hepsi DET1'in
önkoşulu değildir. 3D rig üretme/IK, tam modelleme ve 3D fizik/kumaş/sıvı ayrı
ileriki kararlar olmaya devam eder. Simülasyonları bu host'a bağlamak solver
geliştirmesinin yerine geçmez.

## Kabul ve bakım devri

İlk ortak host en az iki gerçek türde denenir. Shape ve 3D adapter'ları aynı
Apply/Cancel/focus/revision yaşam döngüsünü paylaşırken farklı araç/render
kabiliyetlerini korumalıdır. Her yeni adapter için şu senaryolar doğrulanır:

- Isolate aç/kapat kaynak hidden/solo, animasyon ve export'u değiştirmez;
  Isolate sırasında yapılmış normal editler Exit ile silinmez.
- Detayda Cancel kaynağı değiştirmez; Apply tek ana Undo'dur, Redo ve portable
  tekrar açma aynı sonucu verir. Eski scene ve source formatı okunur.
- Parent dönüşümü/animasyonu, kapsam dışı child/key ve insan düzenlemeleri
  aynı kalır. Shape'in mevcut keyleri ve 3D kutunun iç/dış Timeline ayrımı korunur.
- Aynı asset'i kullanan iki öğede instance-only ve shared edit beklenen kapsamdadır;
  nested hedef, silinme ve aynı anda MCP/manual değişimi veri kaybettirmez.
- İlk pointer-up commit, Escape/cancel, klavye/focus, belge/sekme değişimi,
  async stale sonuç ve kaynak bırakma gerçek browser'da sınanır.
- Çift tık/sağ tık/açık komut aynı hedefe gider; Back/breadcrumb dirty taslağı
  sessizce uygulamaz/atmaz. Detaydan dönüş ana dock/localStorage, seçim, zaman,
  scroll ve pan/zoom'u korur; gereksiz alt panel/boş alan oluşmaz.
- Oynatma/scrub ve desteklenen final raster aynı zamana gider; aynı düzenleme
  viewport/portable/raster görünümünde doğrulanır. GPU/decoder handle'ı JSON'a girmez.

Bu belgedeki ileri özelliklerin planlanması runtime/test kabulü değildir;
yalnız DET0–DET1'in dar gerçekleşen sınırı yukarıda ayrı belgelenmiştir. Uygulamada
AGENTS.md kuralları, ilgili testler, MCP/Next derlemeleri ve render değişikliği
varsa gerçek çıktı kabulü uygulanır. Yeni public API/skill ancak gerçek capability
teslim edildiğinde güncellenir; önerilen isimler bugün araç çağrısında kullanılmaz.

Bkz. [izole 3D detay](boxed3d-isolated-editor.md),
[güncel sıra](geometry-material-boxed3d-sequence.md),
[CFX](advanced-compositing-tracking-plan.md) ve
[ana yol haritası](../production-2d-roadmap.md).
