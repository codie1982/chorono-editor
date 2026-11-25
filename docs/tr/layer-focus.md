# Layers → Timeline ve geçici izolasyon

## Liste seçimi ve toplu işlemler — 15 Kasım 2026

Layers ve Scene Explorer'da düz tıklama tek satırı seçer. **Shift+tıklama** son
doğrudan tıklanan satırdan hedefe kadar görünen ağaç sırasındaki aralığı seçer;
ardışık Shift tıklamaları aynı başlangıçtan uzatır/kısaltır. **Ctrl/Cmd+tıklama**
tek satırı ekler/çıkarır; **Ctrl/Cmd+Shift** aralığı mevcut seçime ekler. Katlanmış,
filtrelenmiş veya izolasyon dışında kalan çocuklar aralığa girmez. Sanallaştırma
nedeniyle DOM'da olmayan fakat listedeki görünen sıralamada bulunan satırlar
aralık seçimine dahildir. Viewport'ta Shift+tıklamanın tek tek seçim davranışı
korunur. Seçimi temizlemek veya başka yüzeyden seçim yapmak eski liste başlangıcını
geçersiz kılar.

Ortak hesap `src/lib/selection/orderedSelection.ts`, React adaptörü
`components/layerHierarchy/useLayerListSelection.ts` içindedir. İki panel aynı
`onSelectLayers(ids, primaryId)` atomik güncellemesini kullanır; eski host'larda
bu opsiyonel callback yoksa önceki additive callback sözleşmesi korunur.

Delete/Backspace, Layers/Scene Explorer ve viewport sağ tık **Delete N layers**
işlemleri seçimin tüm köklerini `makeDeleteLayersCmd` ile tek history adımında
siler. Parent/child birlikte seçilse bile alt ağaç bir kez işlenir; silinenlerin
Timeline satır/track'leri aynı adımda temizlenir. Undo sahne sırasını, ID'leri ve
key'leri aynen geri getirir. `makeDeleteLayerCmd` aynı uygulamanın singleton
uyumluluk girişidir. Varlık dosyaları tutulur; mevcut tek katman silme sözleşmesi
bu noktada genişletilmez. Scene Explorer'ın çoklu Duplicate işlemi host'un
`duplicateLayers` kabiliyetini bir kez çağırır; aynı ormanı her satır için tekrar
çoğaltmaz.

Seçili satıra sağ tık tüm seçimi korur; seçilmemiş satıra sağ tık onu tek seçer.
Menüler silme/çoğaltma hedef sayısını gösterir. Rename, içerik düzenleme ve henüz
toplu karşılığı olmayan viewport dönüşüm/sıralama işlemleri çoklu seçimde pasiftir;
gruplama, hizalama ve dağıtma kendi seçim sayısı koşullarını kullanır.

Native kabul: `node scripts/perf/layer-selection.mjs <output>` gerçek EditorPage'i
ayrı QA origin'inde çalıştırır. Üretim sahnesini veya source setter'larını mock'lamaz;
normal liste, kaynak JSON denetçisi, klavye ve menüleri kullanır. Shift başlangıcı,
Ctrl/Cmd, boş alan/Esc, çoklu sağ tık, Delete ve tam JSON ile tek Undo/Redo kontrol
edilir. Ortak domain testleri 3.000 satırı, ters sıralamayı, kaybolan başlangıcı ve
parent/child silme çakışmasını kapsar.

Doğrulama: 397 dosya / 3.177 test; TypeScript, MCP build ve production build
geçti. Gerçek EditorPage liste kabulünde 6, SceneCanvas kabulünde 14 ve motion
key kabulünde 16 native kontrol geçti. Test sahneleri ayrı QA origin'indedir;
kullanıcının açık projesi bu silme/çoğaltma denemelerinde değiştirilmez.

---

14 Kasım 2026. Nesne seçimi, etkin Timeline'da katmanı/dalları ve mevcut
animasyon satırlarını otomatik bulur. Parent yolları ve çocuklar mevcut Find
akışıyla açılır. Canvas sürüklenirken dock veya Timeline kaydırılmaz: istek
pointer bırakıldıktan ve source transaction tamamlandıktan sonraki kareye
ertelenir. Hızlı seçimler son istekte birleşir; detay düzenleyicisi/preview ve
oynatma sırasında otomatik eşitleme bekler.

Layers başlığında yalnız yardım ve Add kalır. Katman satırlarında ayrı bir
Timeline düğmesi bulunmaz; seçime göre otomatik gösterim kullanılır. Kapalı/katlanmış Timeline
mevcut dock üzerinden geri açılır. Çoklu seçimde birincil nesneye kaydırılır.
Timeline'ın **Tools** bölümü varsayılan kapalı tek satırdır; keyframe seçim,
easing/zamanlama, çakışma politikası, Find/Restore filters ve alt ağaç işlemleri
burada toplanır. Aç/kapat source veya undo yazmaz. **Find selected** aynı bulma
yolunu kullanır; **Restore filters** geçici gösterimi kaldırır.

**Isolate selection** nesnenin sağ tık menüsündedir. **Edit content…** yalnız
3D model nesnelerinde bulunur; 2D nesneler ana viewport/Properties içinde düzenlenir.
Layers'taki **Exit isolation** ve Canvas durum satırındaki **Exit isolation**
geçici izolasyondan çıkarır. Detay düzenleyicisi desteklemeyen içerik veya
çoklu seçimde Edit content gerekçesiyle devre dışıdır.

Etkin timeline üyeliği, başka timeline'a yönlendirilmiş audio ve normal track
eligibility kuralları korunur. Find üye yapmaz, key oluşturmaz, playhead taşımaz
ve undo/source kökenine kayıt eklemez. Aktif timeline'daki mevcut animasyonlar
gösterilir; hangi animasyonu açacağını tahmin ederek başka timeline seçilmez.

**⊡ Isolate**, seçili görsel katmanlar ve bütün kaynak çocukları için geçici bir
viewport görünümüdür. Ancestor'lar transform/compositing bağlamı olarak korunur.
İçeride elle gizlenmiş çocuklar gizli kalır; kaynak solo bayrakları izolasyon
görünümünü kısıtlamaz. Audio transport'unu susturmaz. Sağ tık **Exit isolation** veya Canvas
üzerindeki ayrılmış durum satırındaki **Exit isolation** tam görünümü geri getirir.
Bu sırada yapılan source düzenlemeleri ve mevcut hidden/solo ayarları aynen kalır.
İzolasyon açıkken eklenen/reparent edilen çocuklar canlı kaynak ağacına göre
kapsama girer. Belge değişimi izolasyonu temizler; silinen kökler boş görünüm
bırakmaz. View-only durum JSON, undo, export ve MCP sahnesine yazılmaz.

Scene Explorer'ın eski Isolate arayüzü aynı geçici owner'a bağlandı; izolasyonda
Show All yalnız çıkar. İzolasyon dışında eski Show All görünürlük komutu değişmedi.
Eski düşük seviyeli `makeIsolateLayersCmd` kaynak bayrağı yazan uyumluluk komutudur;
yeni geçici UI bunu çağırmaz. Böylece mevcut doğrudan komut sözleşmesi sessizce
değişmez ve ikinci bir source visibility snapshot/restore sistemi kurulmaz.

## Bakım sözleşmesi

- `useLayerIsolation` yalnız seçili kök ID'lerini ve belge yaşam döngüsünü tutar.
  `projectIsolationView` mevcut `LayerIndex` subtree/ancestor algoritmasını
  kullanır. Boş scope orijinal source referansını döndürür; aktif projection
  immutable sahneden yalnız display hidden/solo bayraklarını türetir. Zaman,
  geometri, kimlik, topology, animasyon ve attribution dönüştürülmez.
- `SceneCanvas.scene` komut/transaction baseline'ı olarak tam source kalır.
  Optional `displayScene` yalnız renderer, font/geometry hit query ve dış alan
  çizgilerine gider. İzole görünümün dışındaki katmanlar snap adayı da değildir.
  Kaynak pointer commit'leri display bayraklarını sahneye geri yazmaz. Export,
  evaluator ve ses mevcut source owner'ını kullanır.
- `TimelineRevealRequest` küçük bir typed UI kaydıdır: nonce, etkin timeline, click anındaki root ID'leri ve primary ID.
  `useSelectionTimelineReveal` pointer/transaction bitişine kadar bekletir; Page
  bunu oluşturup mevcut `dispatchRestorePanel` çağırır. Timeline `useFindSelected`,
  `useLayerBranches` ve `useSelectedLayerReveal` üzerinden mevcut sanallaştırmaya
  ulaşır. Selection/time/source API değiştirilmez. İstek selection/belge değişince
  yenilenir; eski bir istek başka timeline'a uygulanmaz.
- `LayerIsolationBar` yalnız UI durum/çıkış alanıdır.
  `TimelineTools` native details/summary ile klavye üzerinden de açılır; Canvas durum satırı resim
  üzerinde yüzen bir uyarı değildir. Timer, ağ çağrısı, GPU handle veya kalıcı
  büyük view cache eklenmez. Legacy büyük panel/page dosyaları ilgili bağlantıyla
  sınırlı güncellendi.

```ts
// Yalnız renderer/query adapter'ına verilir; save/export/editor source'u değildir.
const view = projectIsolationView(source, ['product-group'])
// <SceneCanvas scene={source} displayScene={view.scene} ... />
```

## Kabul

`scripts/perf/layer-focus.mjs <output>` izole gerçek Layers/Timeline/Canvas
sayfası üretir. 254 katmanda gesture sonrası otomatik/repeated Find, seçimi değiştirmeyen
çoklu seçim, Tools yüksekliği/aç-kapat, reversible text filter,
subtree/hidden/solo izolasyonu, gerçek kırmızı piksel, kaynak edit/undo, belge
değişimi ve gerçek Canvas pointer drag test edilir. Kullanıcı editörüne veya
MCP oturumuna yazmaz. Mevcut 505 katmanlı hiyerarşi kabulü de yeni explicit Find
tercihine uyarlandı. Kanıt `artifacts/validation/layer-focus-20261110/` altındadır.
Kaynak yerel koordinatlar piksel, zaman milisaniye; hiçbir yeni animasyon
formatı/MCP aracı veya export davranışı eklenmedi.

## Scene Explorer yoğunluğu

Alt ağaç aç/kapat ve göster/gizle kontrolleri `compact` sunumda 24 px native
düğmelerle gösterilir. SVG'ler dekoratiftir; aria-label ve tooltip aynı işlemi
açıklar. Diğer işlemler native select içinde kalır; menü komutları, yetenek ve
undo kuralları değişmez. `Find selected` seçili katmanı bulur; arama sorgusunu
çalıştırmaz. Simge arama alanının yanındadır; filtre istisnası yine geri alınabilir.

14 Kasım UI doğrulaması: 382 dosyada 3.117 test, TypeScript, MCP ve Next üretim
derlemeleri geçti. Gerçek production bileşenleri kullanan ayrı browser
fixture'larında 9 katman/Timeline, 8 Explorer/hiyerarşi ve 7 detay akışı geçti.
Bunlar kullanıcı belgesini veya recovery oturumunu yüklemez. Native fareyle ilk
seçim+sürükleme/tek Undo ve Explorer simgeleriyle collapse/expand da doğrulandı.
2D menü girişi yoktur; 3D Apply/Cancel, CAS ve tek Undo korunur.

## Panel izolasyonu ve dikdörtgen key seçimi — 14 Kasım eki

`projectIsolationView.contentScope` yalnız seçili kökler ve kaynak çocuklarını
kapsar. Render `scope` alanı ayrıca transform/compositing için ancestor'ları
korur. `useLayerIsolation` üyelik değişmedikçe contentScope kimliğini sabit tutar;
key/geometri preview'ları geçici panel düzenleyicilerini kapatmaz.

Layers, Explorer, Timeline, Curve ve Dope Sheet optional `layerScope` ile aynı
sınırı kullanır. Kaynak parentId, transform ve global reorder indeksleri korunur;
izole çocuk yalnız **görünümde** kök olur. Arama/Find ve dış solo izolasyonu
genişletemez. Gizli çocuklar listede düzenlenebilir kalır; Canvas onların authored
hidden durumunu korur. Çıkış normal filtre/solo görünümünü geri getirir. Komut,
undo, save, playback değerlendirmesi ve export her zaman tam kaynağı kullanır.

`timelineTracksInScope` ve `resolveSelectedKeyframes` optional scope ile dış/global
key hedeflerini UI seçimi ve toplu işlemlerden çıkarır. Dış key seçimi ana host'ta
dormant kalabilir; izolasyondaki bir seçim hareketi onu yeni seçimle değiştirir.
Set Key ve boş nesne seçimindeki key gezinmesi de izolasyona uyar. Scope değişince
eski review/dialog hedefleri bırakılır; bekleyen Set Key planı kapsamı yeniden
kontrol eder. Timeline üyeliğine veya keyframe verilerine yazılmaz.

`useTimelineMarquee` boş track alanında düz sol sürüklemeyi sahiplenir. En az
3 CSS px hareketten sonra dikdörtgen görünür; Shift veya platform Cmd/Ctrl
seçime ekler. Eski Alt-sürükle de korunur. Etkileşimli kontroller ve key üstündeki
sürükleme kendi mevcut yollarında kalır. Son pointerup koordinatları esas alınır;
sürükleme sonrası click seçimi temizlemez. Escape/cancel/capture kaybı/blur ve
bağlam değişimi önizlemeyi iptal eder. Seçim source/history yazmaz.

Hit testi mevcut `timelineKeysInBox` ve `RowLayout` üzerinden yapılır. Zaman ms,
geometri CSS px ve scroll-content koordinatlarıdır; Canvas export pikseli değildir.
Property collapse/filtre, graph ordinate, sticky audio ve sanallaştırma korunur.
Key merkezleri dikdörtgenin içinde veya sınırındaysa seçilir; DOM'da mount edilmiş
key sayısı seçim kapsamını sınırlamaz. Native ve dense Timeline key hedefleri
zaman taşıma için `ew-resize` imleci kullanır.

Doğrulama: 383 dosyada 3.123 test; TypeScript, MCP ve Next üretim derlemeleri.
Ayrı gerçek bileşen fixture'ı 16 browser akışını kapsar: scope/çıkış, dış key
koruması, dört keyin iki property satırından seçimi, Shift ekleme, son release
koordinatı, Escape/cancel, nesne seçimsiz gezinme ve tek Undo. Native fareyle
aynı dört keyin dikdörtgen seçimi ayrıca gözlendi. Kullanıcı recovery sahnesine
fixture veya test katmanı eklenmedi.

## Add, Fit Parent ve gezinme — 15 Kasım 2026

Sağ tık menülerinin sonunda **Add** bulunur: Canvas boş alanı/nesne, Layers
boş alanı/satırı ve Scene Explorer boş alanı/satırı. Kategoriler ve kullanılabilir
öğeler tek `ADD_LAYER_GROUPS` listesinden gelir. `components/layers/add` altındaki
`buildAddLayerMenu` yalnız UI modeli üretir; `activateAddLayerItem` mevcut native
çizim ve document-lifetime file picker akışlarını yönlendirir. Yeni factory veya
ikinci bir import/undo sistemi yoktur. Özel detay host'u handler vermiyorsa Add
sunulmaz. Sağ tıkla aktif çizimi bitirme davranışı korunur.

Canvas **Align → Fit Parent**, tek nesnede de kullanılabilir. Parent yoksa
kompozisyon çerçevesi kullanılır; group parent için işlem öncesindeki çocuk
geometri birleşimi esas alınır. Stroke/effect taşması ölçüye dahil değildir.
`buildFitParentCommand`, parent-local eksenleri ortak bounds resolver'ın
`worldToSpace` seçeneğiyle ölçer. `applyWorldTransform`, kaynak kanal diff'i ve
viewport keyframe politikası tekrar kullanılır. ParentId, pivot, geometri ve alt
ağaç değiştirilmez; mevcut animasyonların yalnız amaçlanan kanalları normal
manual/auto-key politikasına göre düzenlenir. Tam işlem tek Undo'dur.
TRS'nin temsil edemediği shear, sıfır/eksik geometri, kilit veya driver durumunda
kısmi uygulama yapılmadan tanı döner; yaklaşık/bozuk transform kaydedilmez.

Timeline taşımaları Play'in iki yanında dört küçük açılır tetikleyiciyle
sunulur: baş, önceki frame, Play, sonraki frame, son. Kısa tık yaygın işlemi;
uzun basış, sağ tık veya ArrowDown ilişkili key gezinmesini açar. Eski kısayollar
aynı domain owner'a gider. Scope metni tooltip/menüye taşındı; alt satır yoktur.
Beş kontrol aynı grup ve yükseklikte tutulur, dar panelde birbirinden kopmaz.
