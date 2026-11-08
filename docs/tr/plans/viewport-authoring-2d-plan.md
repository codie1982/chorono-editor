# E−1.6 — Viewport araçları: doğruluk, etkileşim ve yeni özellikler

**Güncel kuyruk, 8 Kasım:** V3 ve V4 native duplicate/drag-copy tamamlandı;
[V4 gerçek destek ve sınırları](../viewport-clone-editing.md).
V5 çoklu Array de uygulandı; [gerçek sözleşme ve kabul](../viewport-array-editing.md).
Kullanıcı önceliğiyle [komşu mesafesi/ruler-guide araçları](../viewport-layout-editing.md) da tamamlandı. Sırada kalan ortak düzenleme/araç kabulü var.
Sonra [onaylanan yeni 3D/Poly sırası](geometry-material-boxed3d-sequence.md)
uygulanır; tam export ve bütün alanları kapsayan ikinci optimizasyon sona taşındı.
Aşağıdaki V5 gereksinimleri korunur; gerçek teslimdeki destek sınırları V5 sözleşmesindedir.

Tarih: 8 Kasım 2026. Durum: ilk V1/V2 doğruluk dilimi ve çoklu transform
mekanizmaları uygulandı; [gerçek sözleşme](../viewport-transform-editing.md).
V3 native position key authoring uygulandı; [gerçek kapsam ve sözleşme](../viewport-motion-keys.md).
V4 native clone ve V5 forest Array uygulandı; tam V6 kabulü bekler. [E−1 ortak düzenleme
planının](human-agent-editing-timeline-plan.md) parçasıdır ve birleşik kabulden,
dolayısıyla **Export E0'dan önce** uygulanır. Aktif kapsam 2D/2.5D'dir.

## 1. Sorunlar ve incelemenin sınırı

Kullanıcı pivot dışında dönme, seçimin belli olmaması, nesne/bağlı noktalar
sürüklenirken kayma, hareket çizgisinin düzenlenememesi ve modifier tuşuyla
çoğaltmanın çalışmamasını bildirdi. Bunlar kabul testine dönüştürülecek kullanıcı
senaryolarıdır. Bu tur kullanıcının açık sahnesinde pointer ile yeniden üretim
yapılmadı; aşağıdaki kod tutarsızlıkları tek başına o sahnedeki kök nedeni
kanıtlamaz.

İlk iş yeni araç eklemekten önce mevcut Select/Move/Rotate/Scale/Anchor, path ve
spline araçlarının tutarlılığını düzeltmektir. Mevcut math, selection, transaction,
clone ve array sahipleri genişletilir; paralel bir viewport veya geometri motoru
kurulmaz. Soft selection/connected-loop seçimi önceki isteğe göre en son
tartışılacak ayrı başlıktır; temel doğrudan düzenlemenin önkoşulu olmaz.

## 2. Mevcut kod ve doğrulanan açıklar

| Alan | Zaten bulunan | Kodda doğrulanan eksik/tutarsızlık |
| --- | --- | --- |
| Pivot | Tek nesne rotation gesture'ı displayed pivot ve inverse parent matrix kullanır; anchor taşıma/yeniden merkezleme yardımcıları vardır. | Çoklu rotate/scale parent-local koordinatları world gibi ortalar; görünen ring primary pivot'tadır. Hesap ve gösterim farklı pivot kullanabilir. |
| Seçim | Seçim çerçevesi, hover, çoklu seçim ve box/lasso/circle/paint araçları vardır. | Canvas'ın Shift bilgisi page adapter'ında düşer; primary seçili küme dışında kalabilir. Hover child gösterirken click root group seçebilir. Marquee statik t=0 bounds, click güncel frame kullanır. |
| Seçim çerçevesi | Shape için çerçeve/handle, group/vector için world bounds yolları vardır. | Sıradan size'lı layer çerçevesi tam parent/scale matrix'ini kullanmaz; overlay ile boyalı nesne ayrışabilir. |
| Taşıma/ölçek | Body drag, axis gizmo, resize ve multi-transform vardır. | Composition delta parent-local x/y'ye doğrudan eklenir; seçili parent+child ikisine de uygulanabilir. Axis move yalnız primary'yi taşır. Multi preview/auto-key commit yolu single transform'dan farklıdır. |
| Path noktaları | Spline edit full world inverse kullanır; bağlı handle'ları ID/topoloji korunarak taşır. | Legacy path hit/drag/overlay translation-only'dir. Yeni anchor commit'i x/y telafisiz pivot merkezleyebilir; döndürülmüş/ölçekli çizim kayabilir. |
| Hareket çizgisi | `MotionPathOverlay` x/y key elmaslarını sürükleyip transaction ile güncelleyebilir. | Seçili timeline yerine tüm timeline'larda son eşleşeni bulur; x/y farklı timeline'lardan gelebilir. Parent/time dönüşümü, key seçim/seek senkronu ve viewport'tan yeni key çizme eksiktir. |
| Sürükleyerek kopya | Gerçek handler Ctrl/Cmd+drag copy, Ctrl/Cmd+Shift+drag instance yapar. | Shortcut kaydı Shift=clone, Alt=instance der; uygulama Shift=selection/axis lock ve Alt=deep pick kullanır. Drag clone animasyonu kopyalamaz; hareket eşiği olmadan Ctrl-click de clone oluşturabilir. |
| Duplicate / Clone | Subtree-aware `makeCloneCmd` ve root-only offset veren `CloneTreeResolver` vardır. | Legacy Cmd/Ctrl+D yalnız bir layer'ı çoğaltır. Çoklu kökler normalize edilmez; internal mask/follow vb. referans remap'i tamamlanmamıştır. |
| Array | Linear/Grid/Radial/Path solver'ları, modal/mini preview, copy/instance ve repeater yolları vardır. | UI tek primary source açar. Solver'lar `space` seçimini uygulamaz; local/parent UI'da kapalıdır. “World” de parented source için doğru matris dönüşümü sağlamaz. Path array translation dışındaki path dönüşümlerini yok sayar. |
| Animasyonlu kopya | Clone command seçilen timeline'ın track'lerini yeni key ID'leriyle kopyalayabilir. | Root offset source transform'a eklenir, kopyalanan x/y track değerlerine yerleşim uygulanmaz; key'ler offset'i ezebilir. Bütün ilgili timeline'ların politikası açık değildir. |
| Gesture yaşam döngüsü | Preview/begin/commit/cancel transaction altyapısı vardır. | Canvas ve motion overlay'de Escape/pointercancel/unmount/document-change temizliği eksiktir; final pointer örneği/React snapshot yarışları test edilmelidir. |

Kaynak sahipleri:
[SceneCanvas](../../../src/components/SceneCanvas.tsx),
[useCanvasDrag](../../../src/components/canvas/hooks/useCanvasDrag.ts),
[usePathEdit](../../../src/components/canvas/hooks/usePathEdit.ts),
[rotationGesture](../../../src/lib/canvas/math/rotationGesture.ts),
[anchorMath](../../../src/lib/canvas/math/anchorMath.ts),
[spline edit adapter](../../../src/components/canvas/splineEditGeometry.ts),
[selection queries](../../../src/lib/selection/canvasShapes.ts),
[MotionPathOverlay](../../../src/components/MotionPathOverlay.tsx),
[clone komutları](../../../src/lib/editor/commands-clone.ts),
[CloneTreeResolver](../../../src/lib/clone/CloneTreeResolver.ts),
[array sözleşmesi](../../../src/lib/array/ArrayTypes.ts),
[ArrayTransformResolver](../../../src/lib/array/ArrayTransformResolver.ts),
[ArrayModal](../../../src/components/modals/ArrayModal.tsx),
[shortcut registry](../../../src/lib/shortcuts/defaultBindings.ts).

## 3. Uygulama sırası

| Sıra | Teslim | Kabul özeti |
| --- | --- | --- |
| V0 | Yeniden üretim ve araç matrisi | Her rapor layer/group/legacy path/spline, statik/animasyonlu ve nested parent fixture'ında ayrıştırılır; ilk görüntü ve source değerleri kaydedilir. |
| V1 | Ortak transform ve gesture doğruluğu | Görünen pivot ile hesap aynı; parent/child çift taşınmaz; preview=commit, tek undo ve tam cancel. |
| V2 | Seçim ve viewport geri bildirimi | Primary/secondary/hover/point seçimi açık; hit ve marquee güncel görüntüyle aynı; zoom/pan'de handle kaymaz. |
| V3 | Viewport hareket yolu ve key authoring | Doğru timeline'da key seç/ekle/sürükle/sil; çizerek native position animasyonu oluştur; Follow Path geometri ve timing ayrıdır. |
| V4 | Tek çoğaltma ve subtree akışı | Duplicate/Clone/drag aynı servisi kullanır; copy/instance açık; çocuklar, animasyon ve referanslar korunur. |
| V5 | Etkileşimli çoklu Array | Nesne/group/seçili kök kümesiyle solver tabanlı gerçek sahne preview; count/space/pivot/timing açık, Apply tek undo. |
| V6 | Birleşik native kabul | Gerçek pointer/keyboard, kaydet/aç ve büyük sahne kaynak regresyonu; ardından E−1.7 birleşik kabul ve Export E0. |

V1/V2, V3–V5'in temelidir. V3 ortak key/zaman sözleşmeleri için E−1.4/5'i;
V4/V5 hiyerarşi ve attribution için E−1.2/3'ü kullanır. V0 baseline ve V1/V2
hata düzeltmeleri bu bağımlılıklardan bağımsız hazırlanabilir. Her dilim kendi
testiyle teslim edilir; bütün feature'lar yazılana kadar ilk hata kapalı tutulmaz.

### V1 — Pivot, bağlı geometri ve dönüşüm tutarlılığı

- Tek koordinat zinciri: client/CSS px → viewport pan/zoom → composition →
  evaluated parent-local → layer-local. `Matrix2D`,
  [world matrix resolver](../../../src/lib/geometry/resolveLayerWorldMatrix.ts)
  ve mevcut transform math kullanılır. DPR/zoom iki kez uygulanmaz.
- Pointer-down'da immutable gesture başlangıcı, ilgili source revision,
  evaluated frame, seçili kökler ve pivot snapshot'ı hazırlanır. Her move aynı
  başlangıçtan hesaplanır; son preview'a tekrar delta eklenerek birikme yapılmaz.
- Seçili parent ve child birlikteyse bağımsız **seçim kökleri** bir kez
  dönüştürülür. Child tek başına seçilmişse world hareketi parent inverse ile
  local'e çevrilir. Farklı parent'lı kardeşler aynı composition delta'yı alır.
  Mevcut `LayerIndex`/Explorer seçili-kök davranışı ortak domain helper'a çıkarılır.
- Single rotate gerçek anchor etrafında döner. Multi rotate/scale için ilk
  teslimde açık **Selection center / Active pivot** seçimi bulunur; hesap,
  ring/crosshair ve HUD aynı pivot'u kullanır. Individual pivot modu gerekiyorsa
  daha sonra eklenir; ilk doğruluk kabulünü bekletmez.
- Pivot taşımak çizimi taşımak değildir. Anchor değişimi gerekiyorsa mevcut
  `reanchorTransform` telafisi kullanılır; custom pivot key/point eklerken
  kendiliğinden merkezlenmez. Negatif/nonuniform scale ve iç içe parent test edilir.
  Singular veya mevcut 2D TRS'nin temsil edemediği shear açık diagnostic verir;
  yaklaşık ve kaymış bir transform sessizce yazılmaz.
- Bütün nesneyi taşıma source geometriyi deforme etmez. Tek point taşıma ise
  point ID/connectivity'yi korur; bağlı handle ofsetlerini mevcut spline kuralına
  göre taşır. Komşu noktalar yanlışlıkla ikinci delta almaz. Legacy path,
  spline'ın test edilmiş world/local adapter yaklaşımıyla uyumlu hale gelir.
- Body/axis move, resize, scale ve rotation aynı seçim kapsamı ve commit/auto-key
  adapter'ını kullanır. Animasyonlu layer'da source değer ile evaluated pose
  ayrımı E−1.4'e bağlıdır; controller çıktısı tekrar input'a yazılmaz.
- Snap hedefleri statik source kutuları yerine aynı frame'in world bounds'udur.
  Snap/gizmo/resize handle'ın gösterdiği nokta ile gerçek sonuç uyuşur.
- Pointer capture/lost capture, Escape, pointercancel, unmount, document/timeline
  değişimi ve source conflict transaction'ı eksiksiz sonlandırır. Release son
  pointer örneğini synchronous scene erişimiyle commit eder. Tıklama/no-op undo
  üretmez; bir gesture tek undo olur. Playback'in edit sırasında durdurulması
  veya zamanının pin'lenmesi aynı araçlarda ortak ve görünür bir kuraldır.

### V2 — Seçili nesnenin anlaşılması

- Primary daima selected IDs içinde veya null olur. Shift toggle bilgisi
  adapter'da kaybolmaz. Hover sonucu click'in seçeceği object/group ile uyumludur;
  child/deep-pick modu ayrı cursor/tooltip ile görünür.
- Click, box/lasso/circle/paint selection aynı evaluated frame ve selectable
  kurallarını kullanır. Hidden/locked/frozen, group/child, instance ve helper
  kaynak kapsamları açık olur; araçlar birbirinden farklı nesne seçmez.
- Rendered geometry'yle hizalı outline/bounds, belirgin pivot ve yeterli hit
  alanı; primary, diğer seçili nesneler ve point/handle seçimi farklı görsel
  biçimlerle gösterilir. Renk tek işaret olmaz. HUD seçili nesne sayısını,
  aktif aracı ve parent/child kapsamını kısa metinle belirtir.
- Stroke/handle boyutu screen px cinsinden okunur kalır; bütün sahne zoom'una
  göre devleşmez/kaybolmaz. Overlay canvas/pan/zoom/layout dönüşümünü bir kez
  uygular. Üst üste binmiş seçimde cycle/deep-pick veya seçili dalı reveal yolu
  bulunur; gizli handle tıklamayı yutmaz.
- LOD proxy seçim verisinin yerine geçmez: işlem source ID'lere gider. Gerekli
  gerçek bounds/geometry seçilen kapsam için hazırlanır; tüm büyük sahnenin LOD'si
  kapatılmaz. UI overlay export'un içine çizilmez.
- Sayısal position/rotation/pivot girişi, keyboard nudge ve menü eylemleri drag'e
  alternatif sağlar. Toolbar tooltips/shortcut yardımının gerçek handler'la
  uyumu test edilir. Bu etkileşim planında `ui-ux-pro-max` Dragging Movements
  rehberindeki keyboard/tek-pointer alternatifi kullanılmıştır; arayüz stili
  veya tüm uygulama tasarım sistemi değiştirilmez.

### V3 — Viewport'tan animasyon çizme ve key düzenleme

Geometri ve zaman kaynakları ayrı kalır:

| Görünen yol | Source | Düzenlemenin anlamı |
| --- | --- | --- |
| Position trajectory | Seçili timeline'da x/y key'leri | Belirli ms'deki konumu değiştirmek |
| Path/spline | Layer-local point/handle/topoloji | Geometrik yolu değiştirmek |
| Follow Path | Kaynak geometri + progress key'leri | Geometriyi değiştirmek veya yol boyunca zamanlamayı değiştirmek |
| Legacy inline motionPath | Layer'ın SVG `pathData`/`offset` verisi | Inline yol kaynağını düzenlemek; position key'iyle aynı şey değildir |

1. **Doğru bağlam:** `MotionPathOverlay` seçili timeline, local playhead, selected
   key IDs ve ortak selection/seek callbacks alır. X/y başka timeline'lardan
   birleştirilmez. Timeline/scope ekranda görünür; değiştirmek eski gesture'ı iptal eder.
2. **Key seç/düzenle:** noktaya tıklama Timeline/Curve Editor'da ilgili x/y key
   grubunu seçer ve o zamana gider. Drag yalnız spatial value değiştirir, zamanı
   kendiliğinden kaydırmaz. Çoklu doğrudan key seçimi, silme/duplicate ve açık
   numeric x/y/time kontrolü aynı domain komutlarını kullanır; soft selection değildir.
3. **Seyrek eksenler:** yalnız x veya y key'i varsa görünüm ve drag davranışı açık
   olur. Gereken eksen key'i o zamandaki unmodified source değerinden eklenir;
   işlemin scope'u önceden hesaplanır. Zaman eşleştirme tolerance/collision
   E−1.4 ile ortaktır. İlgisiz key'lerin ID/easing/tangent alanları korunur.
   Shape-preserving insertion'ın etkilediği komşu segment ve support key kapsamı
   aşağıdaki insertion kuralıyla ayrıca gösterilir.
4. **Koordinat:** her key/sample kendi zamanında world'e projekte edilir.
   Nokta sürüklenince o key zamanındaki parent inverse kullanılır; evaluated
   anchor ofseti çıkarılır. Şimdiki parent matrisini bütün geçmiş key'lere uygulamak
   yanlış olur. Parent animasyonu/binding/follow-path içeren noninvertible signal
   zincirinde edit açıkça read-only veya ayrı Bake/Convert olur.
   Legacy `layer.motionPath.pathData/offset`, x/y track'lerinden sonra uygulandığı
   için bu durumda etkisiz position key'i yazılmaz; mevcut SVG source edit,
   explicit converter/bake veya açıklamalı read-only yolu kullanılır.
5. **Viewport'ta key çizme:** `Add Position Key` modu seçili nesne ve active
   timeline için canvas tıklamasını mevcut local playhead'de native x/y key'ine
   çevirir. İstenirse ayarlanabilir frame/ms aralığıyla playhead ilerletilip
   ardışık noktalar konur. Nokta tıklama sırası tek başına belirsiz timestamp
   üretmez; aynı zamanın update/insert politikası görünürdür.
6. **Draw Motion:** bütün rotayı çizme işlemi start/end time ve dağıtımı
   (eşit zaman veya mesafeye göre) preview'da gösterir; native position key'leri
   üretir. Mevcut animasyonu append/replace kapsamı açık seçilir. Freehand
   örnekleme/fit gerekiyorsa hata toleransı ve nokta sınırı vardır; gereksiz
   binlerce key üretilmez. Yeni serialized layer türü sırf bu overlay için gerekmez.
7. **Şekli koruma:** desteklenen sıradan track'e key insertion için
   [curveEditing](../../../src/lib/timeline/curveEditing.ts) kullanılır; support
   key'ler ve korunamayan durumlar raporlanır. Eğrinin değerini korumak için
   komşu leading key'in easing temsili değişebilir; bu affected-segment kapsamı
   preview'da gösterilir ve aynı undo'ya girer. İlgisiz key'ler korunur; bütün
   easing kayıtlarının byte-byte aynı kalacağı sözü verilmez. Mevcut numeric easing Bezier'leri
   zaman–değer eğrisidir; spatial tangent handle diye sunulmaz. Serbest spatial
   Bezier için path/spline source edit veya açık, kaybı belgelenmiş converter gerekir.
8. **Follow Path:** `Edit Path Source` geometriyi; `Edit Progress Timing`
   zamanlamayı açar. Shared yol değişikliği bütün follower'ları etkiliyorsa kapsam
   gösterilir. [PathSampler](../../../src/lib/path/PathSampler.ts) arc-length
   hesabının sahibidir; overlay kendi ikinci sampler'ını üretmez.
9. **Doğru görünüm ve lifecycle:** hold jump'lar yanlış continuous çizgiyle
   birleştirilmez; örnekleme adaptive ve bounded olur. Coincident key'lerde
   cycle/list ile doğru zaman seçilir. Sıfır-key controller yolunda E−1.5 read-only
   preview ve explicit bake kullanılır. Lock/frozen, snapping, axis lock ve tüm
   cancel/undo kuralları V1'le ortaktır; bağımsız window listener editörü kurulmaz.

### V4 — Duplicate, drag-copy ve bütün alt ağacı koruma

- Cmd/Ctrl+D, quick clone, modal ve drag-copy mevcut clone pipeline'ına bağlanır.
  Grup tam subtree ile çoğalır. Çoklu seçili parent+child iki ayrı kopya yaratmaz;
  child tek başına seçilmişse yalnız o subtree hedef olur. Özgün kaynak layer'lar
  ve subtree verileri değişmez; scene'e yalnız yeni kopyalar eklenir.
- Gesture için tek registry/resolver gerçek handler'ı da besler; yalnız yardım
  metni kaydı olmaz. **Önerilen eşleme:** Ctrl/Cmd+drag copy, Shift axis constraint;
  instance açık araç seçeneği veya çatışmayan atanabilir ayrı kombinasyon.
  Mevcut Shift=clone/Alt=instance yardım tutarsızlığı giderilir. Nihai mapping
  capability/help/settings ile birlikte yayımlanır; kullanıcı binding'i ezilmez.
- Pointer-down copy hazırlığıdır. Screen px cinsinden gerçek drag eşiği
  aşılmadan nesne yaratılmaz. Modifier davranışı başlangıçta görünür/pin'li olur;
  gesture ortasında yanlışlıkla copy↔instance değişmez. Release clone+move'u tek
  transaction yapar; Escape/no-op kaynak sahneyi aynen bırakır. Yeni ID'ler preview
  boyunca kararlı kalır, her pointermove'da yeniden subtree üretilmez.
- Copy bağımsız veri, instance paylaşılan source anlamına gelir; UI bunu açık
  seçtirir. Her kaynak türünün instance kapasitesi preflight edilir. Instance
  wrapper'ı veya gizli child kopyaları sıradan copy diye sunulmaz. Instance'tan
  bağımsız Copy istenirse source görseli desteklenen native veriye materialize
  edilir; `instanceOf` yanlışlıkla korunup linked kopya üretilmez. Mevcut
  reference/virtual clone modları destekleniyormuş gibi açılmaz.
  Görsel source paylaşımı ile canlı group topolojisi ayrıdır: mevcut child
  wrapper'ları source'a sonradan eklenen/silinen/reparent edilen çocukları
  kendiliğinden takip etmez. Bu destek açıkça gösterilir; canlı component tree
  olduğu iddia edilmez. Appearance güncellemesi/bağımsız transform, source
  silinmesi veya yokluğu ve instance chain/cycle davranışı test edilir.
- Tek clone-owned reference remapper: parent ve subtree içi mask/path/follow,
  repeater source ve particle emission source/path layer referansları yeni ID'ye
  gider; dış referanslar/ortak asset'ler varsayılan korunur.
  Çoklu kökler tek forest old→new ID map'ini paylaşır; kökler arası internal
  bağlantılar da korunur. Track target'ları ve key ID'leri eşlenir; binding/SM
  bağlantılarının kopyalanacak kapsamı açıkça tanımlanır. Desteksiz referans
  sessizce kaynakta bırakılmaz.
- Animasyon kopyalama ve **yerleşim ofseti** ayrı sözleşmedir. Absolute x/y
  key/controller source transform offset'ini ezerek kopyayı kaynağa sıçratmamalı.
  Yerleşimi animasyon local space'inden ayıran adapter/placement group veya
  kanıtlanmış lossless kanal dönüşümü kullanılır; bütün modifier/key'lere körlemesine
  sayı eklenmez. Yeni ortak UI eyleminde varsayılan kaynak subtree'yi hedefleyen
  bütün ilgili timeline track'lerini korumaktır; active-only/none daha dar açık
  seçeneklerdir. Mevcut tek-timeline API caller'ının anlamı sessizce değiştirilmez;
  aynı clone kontratı uyumlu seçenekle genişletilir. Membership ve time offset
  belirgindir. İlgisiz timeline/SM veya bütün runtime graph otomatik çoğalmaz.
- Semantik isim/parent yapısı korunur; yeni kökler anlaşılır ad alır. Attribution,
  clone/import policy'si E−1.2 ile ortak olur. Tek undo/redo bütün layer/key/ref
  eşlemesini atomik geri getirir; portable save/load yeni kopyayı çalıştırır.
  ID allocator loaded scene'deki kimliklerle çakışmaz. Mevcut dış hook map'indeki
  clone lineage metadata'sı kalıcı authoring kökeni değildir; yeni history/save
  sözleşmesi E−1.2 ile birlikte tamamlanır.

### V5 — Viewport ile bütünleşen çoklu Array aracı

- Mevcut Linear/Grid/Radial/Path solver, factory, modal ve repeater altyapısı
  geliştirilir. Source tek nesne, group/subtree veya seçili bağımsız kök kümesi
  olabilir; kümenin iç düzeni her occurrence'ta korunur.
- Canvas'ta aralık vektörü/ekseni, radial merkez/arc ve path source seçimi için
  handle/gizmo; aynı alanlar numeric panelde bulunur. `count`, step/total span,
  rotate/scale, Copy/Instance ve animation/time offset açık olur. Drag'den sonra
  count girerek çoklu üretme de aynı array command'ını kullanır.
- `count` için mevcut `sourcePolicy` korunur: include-source N toplam occurrence;
  clone-source-too N yeni occurrence. UI “kaç görünüm / kaç yeni layer / kaç key”
  ayrımını subtree maliyetiyle gösterir. Aynı source üstüne çıkan index 0 görünür
  bir karardır; count bir yerde N, başka yerde N+1 olmaz.
- World/parent/local koordinatları gerçek matrix adapter'larıyla uygulanır;
  sadece enum/etiket veya `console.warn` yeterli değildir. Uygulanmamış space açık
  disabled/diagnostic olur. Path array geometriyi dönme/scale/anchor/parent zinciriyle
  değerlendirir; yalnız path x/y'sini eklemekle doğru world sonucu iddia edilmez.
- Preview ve Apply tek solver sonucunu kullanır. Önizleme transient transform
  records/ghost çizimidir; source layer/undo'ya binlerce geçici clone yazmaz.
  Gösterilecek örnek sayısı, path örnekleme ve buffer/cache bütçesi sınırlıdır.
  Büyük count/subtree/key çarpımı allocation öncesinde preflight edilir;
  uygulamanın mevcut source limit/resource admission mekanizmaları kullanılır.
- Modal/preview source'u kalıcı eski Layer snapshot'ı yerine source ID'leri ve
  revision/epoch ile izler. Kullanıcı veya MCP source'u değiştirirse preview
  invalidate/refresh olur; eski plan yeni sahneye sessizce uygulanmaz. Apply
  current source/revision ile atomik preflight/commit yapar. Preview açıkken
  manual/MCP edit ve document değişimi ayrı kabul fixture'larıdır.
- Apply N kopyayı tek undo yapar; Cancel preview'ı temizler, scene'de yeni kopya
  bırakmaz ve özgün source'u değiştirmez. Repeater seçeneği ile
  gerçek editable copy/instance üretimi açık ayrılır. Repeater'ı expand/bake etmek
  gerekiyorsa native komut ve destek kapsamı kullanılır. Mevcut repeater
  Linear/Radial destekler; Grid/Path fiziksel array fallback'i açık gösterilir.
  Clone yerleşim/animasyon doğruluğu V4'ten gelir; array içinde ikinci kopyalama
  algoritması yazılmaz.
- UI, script ve MCP ortak array sözleşmesinin desteklenen alt kümesini kullanır.
  `buildArraySettings`/MCP'nin mevcut flat options'ında bulunmayan `space`,
  `sourcePolicy` veya timing alanları uydurulmaz. Genişletilirse schema,
  capabilities, canonical skill ve eski caller testleri birlikte güncellenir.

## 4. Kabul, kaynak sınırları ve bakım devri

V0 fixture matrisi: rect/text/group, legacy path ve spline; custom/off-center
pivot; parent rotation, reflection, nonuniform scale ve nested hierarchy; keyed
nesne/parent, iki farklı timeline; pan/zoom/DPR, transform gizmo/body; parent+child
ve farklı parent'lı çoklu seçim. Connected-point raporu bu geometri türlerinde
ayrı gözlenir; sırf rapordan topology corruption sonucu çıkarılmaz.

Zorunlu invariants:

- Görünen pivot sabitken rotation çizimi doğru döndürür; overlay handle ile gerçek
  point aynı yerde kalır. Seçili kökler world delta'yı bir kez alır; çocuk local
  yerleşimi ve source geometri bozulmaz. Preview ile release sonucu eşittir.
- Viewport key seçimi Timeline'da aynı ID/zamanı seçer. Edit yalnız amaçlanan
  timeline'ı değiştirir; parent animasyonunda key konumu doğru zamanda çözülür.
  Draw→key→edit→save/load animasyonu çalışır; easing/ID/timing dış kapsamı korunur.
- Copy/group/subtree ve array animasyonun farklı zamanlarında yerleşimi korur.
  Internal ref'ler doğru kopyaya, external ref/asset'ler policy'ye göre aynı
  kaynağa gider. Parent+child seçiminde duplicate subtree oluşmaz.
- Bir gesture/Apply tek undo; redo aynı ID'leri geri getirir. Escape, cancel,
  release-without-move, document/timeline değişimi ve listener cleanup source'u
  korur. Lock/frozen ve desteklenmeyen transform/signal durumları görünürdür.
- Gerçek editör pointer/keyboard ve görüntü testleri zorunludur. Pure math
  testinin geçmesi kullanıcıdaki bütün etkileşim sorununun düzeldiği sayılmaz.

Bakım sınırları: math ve gesture hazırlığı `src/lib/canvas/math`/geometry'de;
seçim `src/lib/selection` ve scene index'inde; trajectory modeli timeline/animation
domain'inde; reference remap clone'da; array math kendi feature'ında; React overlay
ve gesture adapter'ları mevcut canvas component/hook alanında kalır. Public
kontratlar küçük tutulur, açıklamalar coordinate/time/ownership/cancel/unsupported
durumlarını belgeler. Büyük SceneCanvas/useCanvasDrag ilgili sorumluluk değiştikçe
ayrıştırılır; yalnız 300 satır hedefi için rastgele forwarding dosyaları üretilmez.

Optimizasyon kabulü korunur: current-frame index/preparation paylaşılır, pointer
başına tüm sahne yeniden taranmaz; overlay örnekleri bounded olup serialized
scene/undo'ya dense veri eklemez. LOD source doğruluğunu değiştirmez. Final
kabulde aynı Four Seasons ve **512 MiB managed bütçe** kullanılır; managed/heap/
process bellek ayrımı korunarak idle ve tekrarlı araç kullanımında ölçülür.

Bu plan incelemesinde ilgili mevcut **15 test dosyası / 185 test** geçti; ilave
trajectory/world/curve incelemesinin 5 mevcut suite / 47 testi de geçti (örtüşen
testler olduğu için bu sayılar toplanmaz). MotionPathOverlay için doğrudan pointer
regresyon kapsamı eksiktir. Bu tur yalnız plan güncellendi; hiçbir runtime hata
düzeltmesi veya canlı viewport kabulü tamamlandı diye işaretlenmedi.

Yukarıdaki paragraf ilk plan incelemesinin tarihsel kaydıdır. Sonraki kullanıcı
isteğiyle pivot/seçim/drag ilk uygulaması ve multi-selection kutusu/aktif pivot/
toplu ölçek/keyboard movement eklendi. Sonuç ve sınırlar ana roadmap §12.40 ve
[uygulama sözleşmesinde](../viewport-transform-editing.md) kayıtlıdır. Hareket
çizgisinden key çizimi o ilk dilime dahil değildi. Ardından V3'te explicit
Timeline kapsamı, viewport'tan nokta ekle/seç/taşı/sil/retime/duplicate, click-to-place
rota önizleme/Apply ve Timeline/Curve seçimi eklendi. Gerçek destek ve sınırlar
[V3 sözleşmesindedir](../viewport-motion-keys.md); yeni clone/array özellikleri bekler.

Uygulama dilimlerinde AGENTS.md gereği full test, MCP build ve Next build
çalışır; build öncesi ilgili Next server durdurulur. API/workflow değişirse
canonical skill ve CLI bundle senkronlanır. Yeni testler gerçek invariants ve
adapter davranışını doğrular; yalnız aynı formülü ikinci kez hesaplayıp onaylamaz.
