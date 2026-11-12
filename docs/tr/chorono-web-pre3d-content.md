# Chorono web için tamamlanan 2D özelliklerin teknik içerikleri

12 Kasım 2026. Mevcut helper bağlantılarının açtığı `chorono-web` rehberlerine
eklenmek üzere hazırlanmış teknik metinlerdir. Arayüzdeki İngilizce düğme adları
korunmuştur. Bölümlerin hedefleri mevcut konu eşlemesinden alınmıştır; yeni bir
helper sistemi veya yeni bir doküman rotası tanımlanmaz.

## Mevcut sayfalara içerik dağılımı

| Mevcut rehber konusu | Eklenecek veya güncellenecek içerik |
| --- | --- |
| `editor/properties` | Düz değer, kayıtlı formül, canlı expression ve tek seferlik hesaplama |
| `editor/timeline/controllers` | Prosedürel eğri ve iki farklı bake akışı |
| `editor/timeline`, `editor/keyframes/timing` | Set Key, gezinme, toplu düzenleme ve çakışma politikası |
| `editor/layers/scene-explorer` | Ortak hiyerarşi, Find ve alt ağaç işlemleri |
| `editor/layers`, `editor/canvas/selection` | Açık Timeline bulma eylemi ve geçici izolasyon |
| `editor/properties/transform`, `editor/canvas/tools` | Pivot, çoklu seçim, sürükleme ve çizim araçları |
| `editor/canvas/motion-keys` | Viewport'tan position key ve rota düzenleme |
| `editor/layers/cloning`, `editor/layers/arrays` | Alt ağaç, referans ve animasyon koruyan çoğaltma |
| `editor/canvas/snapping` | Cetvel, guide ve seçili komşuların mesafesi |
| `editor/projects`, `export/project-json` | Otomatik kayıt, session kimliği, Undo/Redo ve taşınabilir kayıt |
| `editor/resources` | Kaynak bütçesi, LOD, çizim sayaçları ve ölçüm sınırları |
| `export/images`, `export/sequence`, `export/svg`, `export/runtime-json` | Tam kaynak üzerinden çıktı, parametreler ve format sınırları |
| `editor/projects`, `editor/resources` | MCP ile güncel sahne düzenleme ve izinli tanılama |
| `editor/shortcuts` | Güncel, bağlama göre çalışan kısayollar |

## 1. Özellik alanlarında formül kullanımı

Desteklenen özellik alanları düz değer, uygulandığında hesaplanan kayıtlı formül
veya timeline üzerinde canlı expression ile yönetilebilir. Alanın yanındaki **fx**
düğmesi formül düzenleyicisini açar. Sayısal kaynak alanlarında çift tıklama da
bu düzenleyiciye erişim sağlar. Checkbox, renk seçici ve select normal kullanımını
korur; formül bu kontrollerin ayrı **fx** düğmesinden açılır.

**When applied**, formülü uygulama anında hesaplar. Formül ve hesaplanan sonuç
projede saklanır; her karede yeniden çalışmaz. Örneğin Width alanındaki `1920 / 2`
sonucu `960` olur ve formül yeniden açıldığında korunur. Aynı kaynak alanı başka
bir düzenleme yoluyla değiştirilirse eski formül kendiliğinden tekrar uygulanmaz.

**Live on timeline**, seçilen timeline'ın saatini ve adlandırılmış kaynakları
kullanarak her değerlendirilen kare için sonuç üretir. `timeMs` milisaniye,
`timeSec` saniye, `timeNormalized` normalize timeline zamanıdır. Kaynaklar başka
bir katmanın desteklenen özelliği veya sahne parametresi olabilir; bağlantılar
katman adı yerine kararlı kimlikler ve özellik yollarıyla tutulur.

**Calculate once**, Array sayısı, guide konumu, key zamanı, export ayarı ve
benzeri işlem alanlarındaki hesaplamadır. Yalnız sonuç ilgili ayara aktarılır;
formül metni saklanmaz ve canlı driver oluşturulmaz. Ayarın kendi **Apply/Cancel**
akışı geçerliliğini korur.

| Örnek | Uygun bağlam | Sonuç |
| --- | --- | --- |
| `1920 / 2` | Kayıtlı sabit sayısal formül | `960` |
| `100 + 50 * sin(2 * timeSec)` | Canlı sayısal özellik | Timeline saatine bağlı salınım |
| `timeMs >= 500` | Canlı boolean özellik | 500 ms'den itibaren `true` |
| `rgba(40 + 20 * timeSec, 100, 200, 0.8)` | Canlı renk; örneğin 0–3 s aralığı | RGB 0–255, alpha 0–1 |
| `vec2(40 + 20 * timeSec, 80)` | Desteklenen spline point/handle Vec2 alanı | Katman yerel koordinatlarında nokta |
| `concat("Time: ", fixed(timeSec, 1))` | Canlı metin özelliği | Zaman içeren metin |

Sonuç hedef türüyle eşleşmelidir: sayı, gerçek boolean, metin, renk veya Vec2.
Select formülü yalnız ilgili alanın izin verdiği seçeneklerden birini döndürebilir.
Boolean ile sayı arasında örtük dönüşüm yapılmaz. Trigonometrik girişler radyandır;
Rotation alanının kaynak birimi derecedir. Layer Opacity `0..1`, fill opacity
`0..100` aralığındadır; otomatik birim dönüşümü yapılmaz.

**Convert to value**, incelenen sonucu düz kaynak değere çevirir. Canlı formüldeki
**Keep authored value**, driver'ı kaldırıp özgün kaynak değerini korur. Bu iki
işlem farklı sonuç verebilir. Formül kaydetme, dönüştürme ve kaldırma işlemleri
mevcut Undo/Redo geçmişini kullanır.

Geçersiz sonuç, eksik kaynak, çevrim veya aynı alanı yöneten başka bir animasyon
mekanizması görünür açıklama üretir. Mevcut key/controller/Wire sessizce silinmez.
Kaynak arada değişirse taslak korunur; uygulamadan önce **Review current source**
ile güncel çalışma gözden geçirilir. Formüller sınırlı bir ifade diliyle çalışır;
JavaScript, dosya veya ağ erişimi sağlamaz. Dosya/asset kimliği, arama, seçim ve
onay kontrolleri otomatik olarak canlı expression alanına dönüşmez.

## 2. Prosedürel eğriler ve bake

Waveform ve modifier kanalları, hiç keyframe içermese de Curve Editor'da eğri
olarak görülebilir. Bu görüntüleme kaynak sahneye örnek key'ler yazmaz.
Sinüs waveform'unda frequency Hz, phase radyan, zaman timeline yerel ms'dir.
`offset=100`, `amplitude=50`, `frequency=1/pi`, `phase=0` ayarı
`100 + 50*sin(2*tSec)` hareketini üretir. Buradaki `tSec`, yerel zamanın saniye
cinsinden matematiksel gösterimidir; canlı expression alanında `timeSec` kullanılır.

**Track bake**, kanalın controller, modifier ve zaman işleme sonucunu örnekleyerek
normal keyframe'lere dönüştürür. Track menüsündeki **Bake Track to Keyframes**
ile başlangıç/bitiş, örnekleme hızı ve tolerans belirlenir. **Preview bake** kaynak
ve sadeleştirilmiş eğriyi karşılaştırır; **Apply bake** tek Undo adımıdır.
Seçilen aralık dışındaki mevcut key'ler korunur, ancak kaldırılan track
processor'ları bu aralığın dışında da çalışmayı bırakır.

**Expression bake**, kaydedilmiş canlı formülün **Bake to keyframes…** alanından
açılır. Proje/kompozisyon zamanı üzerinden yeni bir timeline'a örnekleme yapar ve
o canlı driver'ı kaldırır. Güncel parametre değerleri örnekleme için sabitlenir.
Sayı, renk ve Vec2 için linear; boolean ve metin için hold key'ler üretilir.
Örneklenen aralığın dışında ilk/son baked değer tutulur; canlı driver geri çalışmaz.

Tolerans örneklenen değer aralığının payıdır. Raporlanan hata hedef özelliğin
birimindedir; renk için RGBA kanal farkı, boolean/metin için örnek uyuşmazlığıdır.
Örnek ve ara nokta kontrolleri, bütün zamanlarda kusursuz eşlik garantisi değildir.
Hızlı veya kesikli hareketlerde örnekleme hızı sonucu etkiler. Preview kaynak
yazmaz; Cancel hazırlığı bırakır. Kaynak değişirse eski preview uygulanamaz.
State Machine tarafından sahiplenilen saatler expression bake'te açıkça reddedilir.

## 3. Set Key, gezinme ve toplu keyframe düzenleme

**◆ Set Key** veya varsayılan **K**, aktif timeline'daki açık katman seçimine
key ekler. Parent seçmek bütün çocukların tüm özelliklerine otomatik key eklemez.
Birden fazla katman seçilerek tek Undo ile toplu key oluşturulabilir.

Kısa tıklama güncel keyset'i uygular. Uzun basma kanal seçeneklerini açar;
aynı menüye sağ tık, ArrowDown/ArrowUp veya Shift+F10 ile de erişilir.
**All supported channels**, **Transform + opacity**, **Existing animated channels**
ve **Selected key channels** seçenekleri sonraki tıklamanın kapsamını belirler.
**Set keys now** bölümündeki hazır kanal seçimleri doğrudan key ekler.

Aynı zamandaki mevcut key güncellenirken kimliği, belirtilmeyen easing ve tangent
verileri korunur. Yeni normal key linear oluşturulur. Sürülen veya korunmuş
kanallar için kısmi uygulama incelemesi gösterilir; **Set supported keys** açık
uygulama, **Cancel** kaynak değişikliği olmadan çıkıştır.

Transport; timeline başlangıcı/sonu, önceki/sonraki frame, önceki/sonraki key ve
ilk/son key gezinmesini sunar. Düzenleme zamanı aktif timeline'ın yerel zamanıdır.
Varsayılan Timeline kısayolları Left/Right, Shift+Left/Right, comma/period,
Home/End ve Shift+Home/End'dir. Canvas odağında oklar seçili nesneyi taşır;
aynı tuşun etkisi odak bağlamına göre değişir.

Toplu taşıma, slide, ölçekleme, stagger, paste ve spreadsheet işlemleri ortak
çakışma politikası kullanır. Varsayılan davranış, çakışan işlemi bütünüyle
reddetmektir. **Overwrite collisions** hedefteki dokunulmamış key'lerin
değiştirilmesine izin verir; iki seçili key'in aynı kanal/zamanda birleşmesine
izin vermez. Sınırdaki key'ler ayrı ayrı kırpılarak grubun zaman aralığı bozulmaz.

Timeline katmanına sağ tık → **Clear all keyframes**, yalnız aktif timeline'daki
o katmanın key'lerini temizler. Parametre satırında yalnız o kanala uygulanır.
Çocuklar, diğer timeline'lar ve controller/modifier ayarları korunur. Bu nedenle
key'leri temizlemek procedural hareketi veya Wire bağlantısını kapatmak değildir.

## 4. Ortak hiyerarşi ve geçici izolasyon

Scene Explorer ve Timeline aynı kaynak parent/child yapısını gösterir. Arama,
filtre, katlama ve sanallaştırma kaynak nesneleri silmez. Bir katmanı bulmak için
Layers başlığındaki **▤ Timeline** veya Timeline'daki **Find selected** kullanılır.
İlgili parent yolları ve uygun animasyon satırları açılır; seçim tek başına
Timeline'ı otomatik kaydırmaz. **Restore filters** geçici gösterimi kaldırır.

**Expand/Collapse subtree** paneldeki katlamayı değiştirir. **Show/Hide subtree**,
Lock/Unlock, Solo/Clear solo ve Freeze/Unfreeze ise seçili köklerin bütün kaynak
çocuklarına uygulanır; filtrelenmiş veya kapalı satırlar da kapsamdadır.
Normal satır bayrağı yalnız o katmana uygulanır. Subtree işlemi tek Undo ile
önceki karma bayrak durumlarına dönebilir.

**⊡ Isolate**, seçili görsel dalların geçici viewport görünümüdür. Parent'lar
transform/compositing bağlamı olarak korunur; elle gizlenmiş çocuklar gizli kalır.
**Exit isolation** tam görünümü geri getirir. İzolasyonda yapılan gerçek kaynak
düzenlemeleri korunur. İzolasyon görünümü proje JSON'una, Undo'ya veya export'a
yazılmaz; ses transport'unu susturmaz ve kalıcı Solo işlemi değildir.

## 5. Pivot, seçim ve viewport hareketleri

Transform araçları görünen anchor/pivot, seçim çerçevesi ve gerçek çizim için
ortak 2D dönüşüm hesabını kullanır. Parent ve child birlikte seçildiğinde hareket
iki kez uygulanmaz; seçili kökler taşınır, çocukların yerel yapısı korunur.
Çoklu seçimde ortak çerçeve ve selection center/active object pivot seçimi vardır.

Sürükleme bir preview işlemi olarak başlar; mouse-up son konumu örnekleyerek tek
komutla tamamlar. Escape veya iptal edilen pointer akışı kaynak düzenlemesini
uygulamaz. Desteklenmeyen, tekil veya kayıpsız dönüştürülemeyen durumlarda işlem
açıklamayla durur; sahne yaklaşık bir transform ile sessizce değiştirilmez.

Nesneler kompozisyon dışına taşınabilir. Dış alan çizgileri düzenleme yardımıdır;
final görüntü kompozisyon alanıyla sınırlıdır. Bu alana ulaşan gölge veya efektler
çizime katkı verebilir. Viewport seçim çizgileri ve araç kontrolleri export'a girmez.

Shape eklemede Rectangle gibi bir çizim aracı seçildikten sonra canvas'ta
mouse-down başlangıcı, drag boyutları, mouse-up bitişi belirler. Çizim modu aynı
shape'i art arda üretmek için açık kalır; sağ tık veya ilgili araçtan çıkış
çizimi sonlandırır. Preview kalıcı source kaydı değildir.

## 6. Viewport'tan motion key ve rota düzenleme

Nesne ve timeline seçildikten sonra **Motion Keys** ile native position key'leri
viewport üzerinde düzenlenebilir. Noktalar aynı zamandaki X/Y key'lerini birlikte
temsil eder. Nokta seçimi Timeline ve Curve Editor ile aynı key kimliklerini
kullanır ve ilgili zamana gider. Shift seçim ekler/çıkarır.

**Edit** seçili noktayı sürükler; **World X / World Y / Time (ms)** kesin değer
girişi sağlar. Parent hareketliyse her key kendi zamanındaki parent dönüşümüyle
çözülür. Ekrandaki konum kaynak katmanın yerel X/Y kanallarına dönüştürülür;
pan/zoom kaynak koordinatına ikinci kez uygulanmaz.

**Add Key** playhead zamanında tıklamayla nokta ekler. **Draw Motion** sırayla
tıklanan rota noktalarını, başlangıç/bitiş zamanı ve equal-time/equal-distance
dağılımıyla hazırlar. **Apply route** tek Undo, Cancel/Escape kaynak değişikliği
olmadan çıkıştır. Varsayılan append mevcut çakışan key'leri silmez. **Replace range**
yalnız seçilen aralıktaki X/Y key'lerini değiştirir; komşu interpolasyon etkilenebilir.

Bu araç tek nesnenin native 2D position kanallarını düzenler. Serbest el çizim
veya spatial Bézier tangent editörü değildir. **Follow Path** durumunda
**Edit Path Source / Edit Progress Timing** kaynak geometri ve timing'e ayrı
erişim sağlar. Controller, binding ve diğer sahiplik çakışmalarında açıklama
gösterilir; arka planda otomatik bake yapılmaz.

## 7. Animasyon koruyan Duplicate ve Array

**Duplicate**, Quick Clone ve drag-copy ortak alt ağaç kopyalama işlemini kullanır.
Parent ve child birlikte seçilmişse aynı dal iki kez kopyalanmaz. İç parent,
mask/path/repeater gibi referanslar yeni kimliklere uyarlanır; dış kaynak
referansları ilgili kopyalama politikasıyla korunur. Varsayılan animasyon
kopyalama, kaynak dalları hedefleyen bütün timeline'ları kapsar.

Alt veya Cmd/Ctrl basılıyken mouse-down → drag → mouse-up bir Copy oluşturur.
Modifier'ı mouse-up'tan önce bırakmak gerekmez. Cmd/Ctrl+Shift+drag Instance
seçer; karar hareketin başlangıcında sabitlenir. Instance bağlı görünüm paylaşır,
ayrı animasyon kullanabilir; kaynağa sonradan eklenen çocukları otomatik izleyen
canlı component ağacı değildir. Desteksiz referans durumları açıklamayla reddedilir.

**Array**, birden fazla kökü Linear, Grid, Radial veya Path düzeninde çoğaltır.
**Include source** toplam görünüm sayısına kaynağı dahil eder; **Clone source too**
istenen sayıda yeni görünüm üretir. World/Parent/Local ve pivot seçenekleri
yerleşimin referansını belirler. Path dizilimi mevcut Bézier path kaynağını kullanır.

Preview sınırlı sınır çizgileridir; kaynak/history'ye geçici kopyalar yazmaz.
Özet, yeni layer ve key sayılarını gerçek kaynak genişlemesi olarak gösterir.
Preview çizgileri sınırlandırılsa da kabul edilmiş final kopya sayısı azaltılmaz.
**Apply** tek Undo ile tamamlar; Redo aynı kimlikleri geri getirir. Cancel/Escape
hazırlığı bırakır. Kaynak, seçim veya ilgili zaman değişirse eski plan uygulanamaz.

## 8. Cetvel, guide ve komşu mesafeleri

Cetvelden dikey veya yatay guide eklenebilir; guide sürüklenebilir veya
**Guide controls** üzerinden sayısal konumla düzenlenebilir. Koordinatlar
kompozisyon pikselidir. Lock, Hide ve Delete guide üzerinde ayrı işlemlerdir.
Guide ve cursor ruler çizgileri editör yardımıdır; final raster görüntüye girmez.

Çoklu seçimde ilgili yatay/dikey komşular arasında kenardan kenara mesafe
gösterilir. Ölçüm her nesne çifti için diagonal uzaklık üretmez. Değere tıklamak
**Edit selection gap** alanını açar. Hangi nesnenin sabit, hangisinin taşınacağı
gösterilir; negatif değer üst üste binmeyi ifade eder. Apply tek Undo'dur ve
diğer seçili nesneleri kendiliğinden yeniden dağıtmaz.

## 9. Otomatik kayıt, oturum kimliği ve Undo/Redo

Tamamlanmış düzenlemeler klasör seçmeden de aynı tarayıcı/origin içinde yerel
olarak kaydedilir. **Saved locally** tarayıcı kurtarma kaydını ifade eder;
indirilen proje dosyası veya sunucu yedeği anlamına gelmez. Başarısız yazmada
**Local save failed / Retry** gösterilir ve önceki sağlam kayıt korunur.

Yenilemede kaynak kayıt okunmadan demo sahneyle üzerine yazılmaz. Sahne,
geometri, key'ler, guide'lar, parametreler ve insan/ajan köken kayıtları geri gelir.
Undo/Redo geçmişi de saklanır. Yeni düzenleme bekleyen Redo dalını temizler.
Sürükleme/Array preview'ları, seçim ve runtime önbellekleri bu kaynak kaydının
parçası değildir. Aktif timeline ilk mevcut timeline olarak açılır.

Geçmiş toplam 50 Undo+Redo adımı ve yaklaşık 64 MiB kaynak tahminiyle sınırlandırılır.
Yakın adımlar korunur, uzak adımlar gerektiğinde bırakılır; güncel sahne korunur.
Bu değer toplam RAM kullanımı değildir. Decode edilmiş medya ve GPU kaynakları
ayrı sahipler tarafından yönetilir.

Her yeni belge bir session kimliği alır. Yerel manifest ve kurtarma kaydı bu
kimlikle ilişkilidir; büyük kaynak/medya IndexedDB'de, küçük journal ve manifest
localStorage'da tutulur. Kullanıcı indirmeleri session eki taşır; seçilen kayıt
klasöründe desteklenen host'ta `sessions/<sessionId>/` ayrımı kullanılır.
**Save Scene JSON** oturum/geçmiş içeren taşınabilir dosyayı yazabilir; JSON
inspector/Copy yalnız kaynak sahneyi gösterir. MCP kayıt akışı kendi public
proje sözleşmesini korur; her JSON çıktısının aynı recovery zarfını taşıdığı
varsayılmaz.

`localhost`, `127.0.0.1`, farklı portlar ve profiller ayrı tarayıcı depolarıdır.
Tarayıcı verilerinin silinmesi yerel kurtarmayı kaldırabilir; harici proje dosyası
ayrı saklanmalıdır. MCP bağlantısı yenileme sonrası tekrar açılabilir; bağlantı
oturumu ile projenin kalıcı session kimliği farklı sorumluluklardır.

## 10. Kaynak paneli ve LOD

**Resources & Performance**, izlenen medya, render yüzeyleri, kaynak bütçesi,
viewport çizimi, animasyon değerlendirmesi ve desteklenen GPU iş yükü bilgilerini
gösterir. Bilinen kaynak toplamı, JS heap ve tarayıcı sayfa ölçümü farklı
kapsamlardır; birbirine eklenerek toplam RAM bulunmaz. Sistem CPU/GPU yüzdesi
ve toplam GPU belleği tarayıcıdan kesin alınamıyorsa bu açıkça belirtilir.

Viewport'taki **Last draw**, son tamamlanan çizimin milisaniye süresidir.
Sürekli yeniden çizilmeyen bir sahnede bu gösterge FPS değildir. Heap, son
örneklenen JS heap tahminidir. Bu bilgi ve diğer editör overlay'leri export'a girmez.

Görünür alan kontrolü güvenle elenebilen ekran dışı çizimleri atlar; maske,
gölge/blur ve başka nesneleri besleyen kaynak bağımlılıkları korunur. Çizimi
atlamak kaynak layer verisinin proje veya Undo'dan silinmesi değildir.
Medya residency sistemi gerekli kaynakları hazırlar, gereksiz tüketici pin'lerini
bırakır ve önbellekleri bütçeyle sınırlar; fiziksel RAM'in anında azalmasını
veya bütün JS verisinin ekrandan çıkınca yok olmasını garanti etmez.

Statik grupların **LOD** önizlemesi alt çizimleri önbellekli bir proxy ile temsil
edebilir. Özgün çocuklar ve animasyon verisi korunur. Panelde temsil edilen
katmanlar, çizime girenler ve elenenler ayrı sayılır; bu sayaçlar GPU draw call
sayısı değildir. Final raster çıktı viewport LOD proxy'lerini kullanmaz.

## 11. Raster, SVG ve runtime çıktılarının sınırları

Raster export tam kompozisyon ve özgün kaynak üzerinden değerlendirilir;
viewport pan/zoom, izolasyon, seçim çerçevesi veya LOD çıktıyı kırpmaz. Geçerli
parametre snapshot'ı kaynak hazırlığında ve çizimde aynı kareye uygulanır.
Gerekli image/font/video kaynakları hazır olmadan başarılı boş görüntü kodlanmaz;
görsel katman için renderer yoksa açık hata verilir.

PNG/WebP alpha destekler. JPEG'de transparent arka plan isteği beyaza
birleştirilir ve warning üretilir. Mevcut raster çizim kompozisyon çözünürlüğünde
yapılır; `scale > 1` bitmap büyütmedir. Bu seçenek yüksek çözünürlükte yeniden
vektör hesaplama, FP16 veya gelişmiş renk yönetimi anlamına gelmez.

Image sequence her kareyi `i / fps * 1000` zamanından üretir; ekranın oynatma
hızına bağlı değildir. Frame sayısı mevcut duration/FPS hesabını kullanır;
en fazla 4096 frame sınırı vardır. Her kare, medya ve ZIP çıktısı iş sahipliği
ve kaynak bütçesi içinde tutulur.

Temel SVG export shape/path/text/group geometrisini üretir. Desteklenmeyen türler
atlandığında warning verir; desteklenen geometrinin mask, etkin efekt veya blend
görünümü taşınmıyorsa bunu da bildirir. Otomatik SVG raster bake yoktur.
Animated SVG canlı property expression'larını çalıştıramaz. Güncel full-scene
Web player desteği bütün basic/native player'lara genellenmez; ilgili hedef için
açık Convert veya native key bake gerekebilir. Metin/boolean hold key üretimi
tek başına her formatta eksiksiz destek garantisi değildir.

## 12. MCP ile devam ederken elle düzenlemelerin korunması

Ajan mevcut sahneyi düzenlemeden önce güncel kaynak okumalıdır. MCP mutasyonları
bu okumadan alınan revision ve tek kullanımlık readToken ile eşleştirilir.
Eski revision ile hazırlanmış değişiklik kaynak çatışması olarak reddedilir;
ajan yeniden okuyup düzenlemeyi güncel sahneye uyarlamalıdır.

İnsan/ajan köken bilgisi oluşturmayı, son alan yazarını ve kopyadan gelen içeriği
ayırır. Bilgisi olmayan eski kayıt **unknown** kabul edilir; otomatik insan veya
ajan etiketi üretilmez. Köken etiketi tek başına bir alanı değiştirme izni değildir.
İstenen değişiklik dar kapsamla uygulanır; örneğin saatin rengini değiştirmek
elle ayarlanmış `09:05` değerini, path tutamağını veya key easing'ini yeniden
oluşturmayı gerektirmez.

Scriptler izole QuickJS ortamında çalışır. Dry run kaynak sahneyi yazmadan plan
üretir; bu plan ayrıca uygulanır. Undo/Redo ve portable kayıt kaynak kökenini
korur; runtime çıktı editöre ait authoring kayıtlarını çıkarır.

## 13. Tanılama ve sürüm kontrolü

Yerel **Interaction** kaydı ayrıntılı inceleme için elle açılan tanı akışıdır.
İzinli uzak hata paylaşımı ise sade, tekilleştirilmiş hata özetidir; ham etkileşim
akışıyla aynı veri değildir. Hata yönetim panelinde aynı hata tekrar sayısıyla
tek satırda **New / Investigating / Fixed** durumlarıyla takip edilir.

Uzak gönderim için kullanıcı kararı kalıcı tutulur. Onaysız gönderim yapılmaz;
karar her uygulama açılışında yeniden sorulmaz. Dağıtımda geçerli alıcı servis
yapılandırması yoksa yapılandırılmış servis varmış gibi davranılmaz.
İzinli gönderim ve sürüm kontrolü aynı tercih kapsamını kullanır; ayarlar
Resources → Interaction içinden değiştirilebilir.

Paylaşım açıklaması; uygulama sürümü, hata kodu ve tekrar sayısı kapsamını,
gönderim aralığını, saklama süresini ve alıcıyı gösterir. Proje içeriği, nesne
koordinatları ve ham Interaction kaydı hata özeti diye otomatik gönderilmez.
Yerel alıcı API/depo uygulamasının bulunması, public servis yayınının tamamlandığı
anlamına gelmez.

## Mevcut helper alanları için kısa İngilizce metinler

Aşağıdaki metinler mevcut helper/rehber alanlarına içerik olarak eklenebilir.

| Konu | Metin |
| --- | --- |
| When applied | “Evaluates when you apply. Saves the formula and result; does not run every frame.” |
| Live expression | “Uses the selected timeline clock and named sources. The authored value stays as fallback.” |
| Calculate once | “Applies only the result to this setting. The formula is not saved.” |
| Convert | “Replace the formula with the reviewed result.” |
| Keep authored | “Remove the live formula and keep the authored fallback value.” |
| Set Key | “Set the current keyset on selected layers in the active timeline. Hold or open the menu for channels.” |
| Find in Timeline | “Reveal selected layers and their animation rows without changing source data.” |
| Isolation | “Temporarily focus the viewport on selected branches. Source visibility and exports stay unchanged.” |
| Drag-copy | “Hold Alt before dragging. Release the mouse to finish copying; Alt may stay pressed.” |
| Array preview | “Preview does not create layers. Apply commits one undo step; Cancel leaves the source unchanged.” |
| Gap | “Edge-to-edge distance in composition pixels. Negative values overlap.” |
| Local recovery | “Saved in this browser. Use Save Scene JSON or a save folder for an external project copy.” |
| LOD | “Viewport proxy only. Final raster output uses the original source layers.” |
| Resource measurements | “Known resources and JS heap have different scopes. Neither is total process RAM.” |
| Stale source | “The source changed after this draft was opened. Review the current source before applying.” |

## Yayın editörü ve teknik bakım için referanslar

Bu kısım yayın metnine eklenmesi zorunlu olmayan kaynak eşlemesidir.

- Mevcut helper: `src/components/help/DocumentationHelp.tsx` ve
  `documentation.ts`. Release hazırlığında 58 konu hedefi aynı ortak kontrolle
  bağlanmıştır. Panel ve dialoglar mevcut rehberleri açar; yeni bir helper
  sistemi veya router kurulmamıştır. Entegrasyon ve kontrol notları
  [editor-help-links.md](editor-help-links.md) içindedir.
- Expression: [typed-input-expressions.md](typed-input-expressions.md),
  [property-expressions.md](property-expressions.md),
  [boolean-expressions.md](boolean-expressions.md).
- Timeline: [timeline-authoring.md](timeline-authoring.md),
  [procedural-authoring.md](procedural-authoring.md).
- Hiyerarşi: [editor-hierarchy.md](editor-hierarchy.md), [layer-focus.md](layer-focus.md).
- Viewport: [viewport-transform-editing.md](viewport-transform-editing.md),
  [viewport-motion-keys.md](viewport-motion-keys.md),
  [viewport-layout-editing.md](viewport-layout-editing.md).
- Çoğaltma: [viewport-clone-editing.md](viewport-clone-editing.md),
  [viewport-array-editing.md](viewport-array-editing.md).
- Kayıt ve çıktı: [session-recovery.md](session-recovery.md),
  [pre3d-frame-contract.md](pre3d-frame-contract.md),
  [output-resource-ownership.md](output-resource-ownership.md).
- Tanılama: [diagnostic-sharing.md](diagnostic-sharing.md),
  [diagnostic-management.md](diagnostic-management.md).

Kısayol sayfasında değerler `src/lib/shortcuts` registry ve ilgili aracın güncel
sözleşmesiyle eşleştirilmelidir. Eski `ShortcutHelpModal` içindeki “Scroll → Zoom”
metni güncel Cmd/Ctrl+scroll davranışını anlatmıyor; Array metni Path seçeneğini,
statik liste de Set Key ve yeni transport kapsamını eksik bırakıyor. Bu eski
metinler web içeriğine kopyalanmamalıdır. Varsayılan kısayol ile kullanıcıya
gösterilen etkin kısayol aynı kavram değildir.

Kabul kaydı [pre3d-acceptance.md](pre3d-acceptance.md) içindedir: çalışma alanında
370 dosya/2988 test; 54 browser araç kontrolü, 8 native output kontrolü ve gerçek
insan düzenlemesi → fresh MCP devamı → Undo/portable/reload akışı. Four Seasons
512 MiB politikasında 10 tam oynatma, 46,25 MiB managed tepe ve sabit canvas
kaydı verdi. Bunlar bütün cihazlar için FPS/RAM garantisi veya tüm export
formatlarında tam eşlik iddiası olarak yayımlanmamalıdır. Tarihsel CPU süre
farkının sınırları aynı kabul kaydında korunur.

3D, Poly/UV, cloth/Blob/fluid ve tam Export E0 bu içeriklerin tamamlanmış
özellik kapsamına eklenmez. Mevcut helper kodu veya `chorono-web` sayfaları bu
içerik hazırlığı sırasında değiştirilmemiştir.
