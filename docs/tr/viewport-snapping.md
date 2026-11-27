# Viewport Snap ve kompakt menüler

15 Kasım 2026. Mevcut 2D/2.5D düzenleyici üzerindeki kullanıcı düzeltmeleri.

## Kullanım

**Snap** iki sütunlu, sekmeli bir precision palette açar. **Move** sekmesinde
hedefler native checkbox olarak birlikte seçilir; **Clear all** hedeflerin
tamamını temizler, master açık/kapalı durumunu değiştirmez. **Options** sekmesi
1–30 ekran px yakalama mesafesini (varsayılan 12 px) ve ortak grid aralığını düzenler. Object
Edges nesne/kompozisyon sınırlarını; Points sınır kutularının merkez çizgilerini;
Parent Edges doğrudan parent'ın değerlendirilen sınırlarını yakalar. Guides
görünür kullanıcı guide'larını; Grid View ayarıyla aynı sıfır-orijinli piksel
ızgarasını kullanır. Pixel, bir eksende geometrik hedef yoksa tam piksele yuvarlar.
Hedef checkbox'ları birbirini kapatmaz. Grid görünmüyorsa Grid hedefi devre dışıdır ve
grid yakalaması uygulanmaz; saklanan hedef tercihi grid yeniden gösterilince kullanılabilir.

Tüm geometrik adaylar aynı anda değerlendirilir. Her eksende ekran pikseli
cinsinden yarıçap içindeki en yakın aday kazanır. X grid, Y nesne kenarı olabilir.
Eşit uzaklıkta custom guide, parent, diğer sınırlar/merkezler ve grid sırası
belirleyicidir. Sonradan grid veya pixel uygulayıp bir kenar eşleşmesi bozulmaz.
Önceki koşulsuz grid yuvarlaması yerine manyetik yakalama yarıçapı uygulanır.
Pan koordinat dönüşümündedir; yarıçap zoom'a bölünerek CSS pikseli olarak korunur.

Fare üzerindeki amber halka yakalanan noktayı gösterir. Yeni temel şeklin
başlangıcı ve mouse-up son noktası, nesne taşıma ve viewport motion key yolları
ortak SnapEngine'i kullanır. Boyut ve çoklu seçim tutamaçları da aynı hedefleri
kullanır: tutamacın gerçek geometri noktası yakalanır; mouse'un tutamak içindeki
ilk tutuş ofseti korunur. Kenar yalnız izinli doğrultuda, oran kilidi kendi
doğrusu üzerinde en yakın ulaşılabilir hedefe gider. Minimum/maksimum boyut veya
oran kısıtı hedefe ulaşmayı engellerse yanlış yakalama işareti gösterilmez.
Amber **SNAP · X, Y** geri bildirimi tutamacın gerçekten ulaştığı noktadır.
Son mouse-up örneği aynı immutable başlangıçtan yeniden değerlendirilip tek Undo
ile commit edilir. Bu dilim path/mesh vertex veya eğri-segment projeksiyon çözücüsü
eklemez; pivot ve spline araçlarının bütün politikalarını yeniden yazmaz.
Fare imlecini işletim sistemi düzeyinde taşımak için bir API eklenmez.

## Bağımsız dönüşüm yakalama

**Rotate** ve **Scale** sekmeleri kendi checkbox ve adım değerlerine sahiptir.
Move kapalıyken de kullanılabilirler. Rotate 15°/45°/90° hazır adımları ve
1–180° özel adımı destekler. Tek nesnede parent-local mutlak açı, çoklu seçimde
ortak dünya pivotuna göre dönüş farkı yuvarlanır. Kendi açı yakalaması kapalıyken
eski Shift ile 15° göreli dönüş korunur.

Scale 5%/10%/25% hazır adımları ve 1–100% özel adımı destekler. Scale gizmosu
başlangıç ölçeğine göre büyüme katsayısını yuvarlar; 10% adımda 1.16 → 1.20.
Yansımalar ve etkin olmayan eksen korunur. Çoklu seçim kutusunun tutamaçları da
aynı yüzde kuralını kullanır; yüzde açıkken nokta/grid yakalaması yerine bu
kural son boyutu belirler. Tek şeklin geometri boyut tutamaçları mevcut Move
hedefleriyle kenar/grid yakalamayı sürdürür. Mevcut shear reddi ve minimum
ölçek sınırları geçerlidir. Her gesture tek Undo ile uygulanır.

Açı etiketi dönüştürülmüş artboard içinde fixed konumlandırılmaz; viewport'a
portal edilir ve dönüş halkası çevresinde, viewport sınırları içinde tutulur.
Halkadaki dört teğet ok ve soluk X/Y çizgileri pivotu/dönüş yönünü belirtir.
Bu işaretler ve tercihler kaynak JSON, animasyon veya export'a yazılmaz.

## Sahiplik ve hesaplama

`src/lib/snap/SnapEngine.ts` React/DOM/depolamadan bağımsızdır. `snapRect` ve
`resolvePoint` aynı `AlignmentGuides` aday çözücüsünü kullanır. Eski bağlamsız
`snapPoint(point)` grid/pixel API'si korunur; yeni viewport çağrıları bağlamlıdır.
`prepareSceneSnapContext` görüntülenen zamanı ve dünya sınırlarını kullanır;
taşınan alt ağaçlar ve ataları normal nesne adaylarından çıkarılır. Gizli,
zaman dışında veya isolation kapsamı dışında kalan nesneler normal aday değildir.
Doğrudan parent ayrı listede değerlendirilir; roots için parent kompozisyondur.
Grup/rotasyon sınırları mevcut dünya eksenli bounding-box sözleşmesidir; eğik
kenarlara veya gerçek şekil konturuna projeksiyon iddiası yoktur. Parent'ın
grup birliği gesture başlangıcında sabitlenir, kendi hareketini takip etmez.

Mouse gözlemi mevcut `useViewportCursor`'un olayla tetiklenen tek rAF'ını kullanır.
Araç/menü/canvas dışına çıkış, blur ve görünmez belge marker'ı temizler. Yeni timer,
idle çizim döngüsü, yoğun piksel tamponu veya kaydedilen source alanı oluşturulmaz.
Grid tercihi `ViewportGridPreferences`'ın version 1 formatıyla yerel saklanır;
Snap hedef seçimleri ve scene/Undo kaydı bu üç tercih kaydına eklenmez.

## Sağ tık Add ve üst çubuk

Canvas sağ tık Add, Layers Add ile aynı kalıcı çizim aracını seçer; menü seçimi
tek başına source veya Undo değiştirmez ve varsayılan şekil eklemez. Menü açılış
noktası bir referans işaretiyle tutulur. Tarayıcı OS imlecini bu noktaya taşımaz;
gerçek pointer-down noktası çizimin başlangıcıdır, drag ölçüyü belirler. Referans
ilk çizimden sonra temizlenir; Escape/sağ tık normal iptali uygular. Medya/spline/3D
import akışları değişmez. İki menü aynı registry ve yerleştirme matematiğini,
tek Add/Undo komutunu kullanır.

## Timeline yokken ilk Set Key

Ana editörde seçili katman olup hiç Timeline yoksa Set Key açık kalır. Bu açık
kullanıcı eylemi, kompozisyon süresinde bir Timeline ve seçilen izinli kanalların
key'lerini tek komutta hazırlar. Hazırlık sırasında boş Timeline yayımlanmaz;
korumalı kanalların review akışı sürer. Undo/Redo Timeline ve key'leri birlikte,
aynı ID'lerle geri getirir. `prepareInitialSetKey` mevcut `prepareSetKey`
sahiplik/driver/stale-source kontrollerini kullanır. Sadece ana UI host'u bu
kolaylığı etkinleştirir; iç içerik host'ları ve MCP'nin explicit Timeline API'si
bu değişiklikle yeniden yorumlanmaz. Var olan Timeline seçimi varsa orada çalışır.

## İlk ve son key arasında oynatma

Play düğmesini basılı tutma, sağ tık veya ArrowDown ile açılan **Play Mode**
menüsünde **First to last key** seçilir. Aktif Timeline'ın tüm track'lerindeki
finite, duration içi ilk/son zaman alınır; seçim ve row filtreleri bu hesabı
daraltmaz. Aralık key ekleme/silme/taşıma sonrası yeniden hesaplanır.
`Timeline.playKeyRange` optional tercihi source JSON, recovery ve Undo/Redo ile
saklanır; eski sahneler varsayılan tam oynatma davranışını korur.

Bu pencere Work Area'nın önüne geçer, fakat Work Area veya duration'ı yazmaz.
Loop, Ping-pong ve loopCount aktif Timeline'ın bu aralığı üzerinde çalışır.
Tek key yalnız o pozu gösterir ve idle rAF döngüsü başlatmaz; hiç key yoksa
normal oynatma/Work Area'ya dönülür ve menüde durum açıklanır. Paused scrub ve
manuel navigasyon aralığın dışında çalışmayı sürdürür.

Sahipler: `keyframePlaybackRange` O(keys)/O(1) sorgusu; `PlaybackClock` monoton
elapsed-phase; `usePlayback` rAF adapter'ı; `playbackTime` runtime ile ortak cycle
hesabı. Eski evaluator import'ları re-export ile korunur. Ana editör ve model
detay Timeline'ı aynı pencere sözleşmesini kullanır. Aktif range sırasında
evaluator'a local zaman açıkça verilir; Ping-pong ikinci kez uygulanmaz.
Runtime ve raster export süreleri bu editor tercihini uygulamaz; basic runtime
converter alanı çıkarır. Kontroller source key'lerini değiştirmez.

Export katalogu `Project → Export` bölümünde mevcut callback'leri çağırır.
Üst çubukta ayrı Export ve Group/Ungroup düğmeleri yoktur. Çoklu seçime Group,
grup hedefine Ungroup sağ tıkta sunulur; klavye komutları korunur. Ungroup explicit
hedef ID'sini kullanır, seçim setState'inin tamamlanmasına bağlı değildir.

Önceki Preview, Timeline Play değildir: tappable/draggable katmanların runtime
etkileşim testidir. Artık **Interact** adını taşır ve bu yetenekte nesne yoksa
gizlenir. Aktifken Exit interaction her zaman kullanılabilir. Source/key yazmadan
mevcut native click/drag olaylarını runtime'a iletir.

## Doğrulama

Domain testleri en yakın hedef, iki eksende farklı kaynak, parent-only, zoom,
fractional-grid/pixel, gizli hiyerarşi ve bozuk/engellenen depoyu kapsar. Native
browser fixture gerçek SceneCanvas/checkbox/Add/undo yolunda mouse marker'ını,
ilk sürükleme ve son pointer-up örneğini, parent-local konumu ve temiz PNG'yi
denetler. Toolbar fixture Project export callback'lerini ve gerçek canvas tap
olayıyla Interact giriş/çıkışını source karşılaştırmasıyla kontrol eder.

15 Kasım kabul sonucu: 389 dosyada 3.145 test, MCP build, Next production build
ve TypeScript kontrolü başarılıdır. Viewport fixture'daki 35 kontrol ve toolbar
fixture'daki iki akış geçti. Açık editörde görünürlük/üstte çizim açık ve aralık
37,5 px iken sayfa yenilendi; üç değer de UI'da korundu. Ardından kullanıcının
önceki 20 px aralığı geri bırakıldı. Kaynak sahneye test nesnesi eklenmedi.

Aynı gün resize ve ilk Set Key düzeltmeleri sonrasında: 391 dosyada 3.151 test,
MCP build, Next production build ve TypeScript kontrolü başarılıdır. Genişletilen
viewport fixture'ındaki 43 kontrol geçti. Bunlar altı resize tutamacını,
mouse-up koordinatını, Snap kapalı davranışını ve Timeline olmayan sahnede ilk
Set Key'in tek Undo/Redo ile oluşturulmasını içerir. Sağ tık Add'in kaynak
değiştirmeden çizime hazırlanması ve ilk çizimde referans işaretinin temizlenmesi
de aynı fixture'da kontrol edilir.

## Tek ayar yüzeyi — 15 Kasım 2026

Dock'taki Snap kaldırıldı; çalışan ayarlar viewport **Snap → Move / Rotate /
Scale / Options** altında toplandı. `SnapSettingsMenu` tek hook adapter'ıdır.
Options: 1–30 ekran px yakalama yarıçapı, grid görünürlüğü/üstte çizim/piksel
aralığı ve Reset Snap settings. Grid görünürlüğü ve aralığı View ile aynı state'i
kullanır. Move/rotation/scale switch'leri bağımsızdır.

Eski panelde Vertex / Segment / Subdivisions kontrolleri bağlı değildi; çalışan
özellik gibi sunulmazlar. Reserved settings alanları eski caller'lar için kalır.
Object Points mevcut toplama davranışıdır; ayrı path-vertex/segment solver'ı
tamamlanmış sayılmaz. Eski panelin 2–32 slider'ı ile hook'un 1–30 aralığı farkı,
tek menünün aynı doğrulanmış aralığı kullanmasıyla giderildi.

`migrateDockLayout`, kaydedilmiş Snap ve Shortcuts tablarını kaldırır; diğer
panelleri, aktif paneli, oranları ve collapsed durumunu korur. Yalnız bu iki
panelden oluşan boşalmış bir yerleşim varsayılana döner. Kaynak/history değişmez.
Shortcuts artık **Menu → Help → Keyboard Shortcuts…** penceresidir; Cmd/Ctrl+/
aynı pencereyi açar. Var olan registry görünümü/search/2D–3D sınıflandırması
yeniden kullanılır; eski hard-coded liste kaldırıldı. Native dialog modal focus
ve Escape kapanışını sağlar; File menüsü tetikleyicisine focus geri döner.
