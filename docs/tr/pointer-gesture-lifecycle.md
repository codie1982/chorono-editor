# Viewport pointer bırakma yaşam döngüsü

9 Kasım 2026. Bu değişiklik, Pan sonrasında nesnenin ilk sürüklemede doğru
önizlenip mouse-up'ta eski konumuna dönmesini giderir. Source formatı, affine
hesapları, parent/child ve animasyon komutları değişmez.

## Üretilen hata

Eski `useZoomAndPan` yalnız window **bubble** pointer-up dinliyordu. Capture,
pointer kimliği, blur/cancel/unmount temizliği yoktu. Pan bırakışı alt UI'de
tüketilir veya sayfa dışında kaçırılırsa eski `panDragRef` ve hareket listener'ı
açık kalabiliyordu. Select'e dönülünce aynı pointermove hem tuvali pan ediyor
hem nesne/guide hesabını çalıştırıyordu. Son source delta, artık yer değiştirmiş
canvas DOM rect'inden hesaplanınca sıfıra dönebiliyordu. İlk nesne bırakışı eski
Pan'ı da kapattığından ikinci deneme çalışabiliyordu.

Kontrollü native-event testinde başlangıç **90/90**, doğru önizleme **190/145**,
ilk bırakış **90/90**, ikinci bırakış **190/145** oldu. Aynı koşul guide'ı
beklenen x=280 yerine x=130'a yerleştirdi. Ayrı trusted fare deneyinde event/frame
zamanlamasına bağlı kısmi sonuç **102.5/96.875** elde edildi; yeni kod aynı
hareketi **190/145**'te bitirdi ve canvas rect'i sabit kaldı. Bu kayıtlar belirli
bir olay zincirinin bildirilen belirtiyi ürettiğini kanıtlar; kullanıcının daha
önceki fiziksel olaylarının kaydı olarak sunulmaz.

## Sahiplik ve girişler

| Public giriş | Sorumluluk |
| --- | --- |
| `components/canvas/interactions/PointerGestureSession.ts` | Native capture, pointer/button kimliği, terminal event ve listener lifecycle |
| `EditorPointerSession.ts` | Immutable source baseline, transaction/document guard, tek commit veya rollback |
| `hooks/useZoomAndPan.ts` | View-only Pan; son pointer-up noktasını örnekleme, view pozunu koruyan iptal |
| `SceneCanvas.tsx` | Araç/Preview/Array/Motion geçişinde Pan sahipliğini kapatma |
| `inputs/ScrubInput.tsx` | Typed draft'ın dirty sahipliği; gereksiz/stale blur komutunu önleme |

`PointerGestureSession` mutable, tek kullanımlık bir browser adapter'ıdır.
React, scene, history, geometry veya persistence bilmez. Host `move`, `up`,
`cancel` ve isteğe bağlı `error` callback'lerini sağlar. Capture elementi
ödünçtür; kendisi elementi yaratmaz/kaldırmaz. Platform handle'ları, örnekler
ve listener'lar JSON/undo'ya girmez. Class ve kaynak sahibi ayrı kalır; aynı
native algoritma source araçları ve Pan için kopyalanmaz.

Minimal view-only kullanım:

```ts
const pointer = new PointerGestureSession({
  eventTarget: window,
  move: point => previewView(point.clientX, point.clientY),
  up: point => { previewView(point.clientX, point.clientY); finishView() },
  cancel: () => finishView(),
}, { pointerId: event.pointerId, currentTarget: viewport,
  button: event.button, pointerType: event.pointerType })
// Host unmount/araç değişiminde pointer.dispose() çağırır.
```

Client koordinatları CSS px'tir; Pan delta'sı CSS px olarak kalır. Source
adapter'ları mevcut canvas rect/backing-size eşlemesiyle composition px'e
çevirir. Orta düğme maskesi 4, primary 1, secondary 2'dir. Yabancı pointer
move/up/cancel yeni sahiplik başlatmaz. Başka bir pointer-down aktif Pan'ı
devralamaz. Eski başlatıcı düğmenin artık basılı olmadığı yeni down, önceki
gesture'ı hedef/React handler'larından önce güvenli biçimde bitirir.

Window down/move/up/cancel capture aşamasında izlenir. Normal up son gerçek
koordinatı örnekler. Gerçek up kaçarsa ve sonraki move düğmenin artık basılı
olmadığını bildirirse son **basılı** örnekle bitirilir; yeni hover noktasına
nesne atlatılmaz. Basılı hareket örneği yoksa iptal edilir; hayali click/clone
oluşturulmaz. Button mask'i olmayan legacy adapter'ların önceki davranışı
korunur. Başka bir düğme hâlâ basılıysa da başlatıcı düğmenin bırakılması
gesture'ı bitirir.

Capture kurulamazsa window listener'ları fallback olarak kalır. Escape, blur,
pointercancel ve bağlantısı kopmuş capture hedefi host'un iptal politikasına gider.
Bağlı hedefte capture kaybı window fallback'i açık tutar; aşağıdaki sonraki
düzeltme önceki blanket lost-capture iptal politikasının yerini alır. Her
terminal yol listener/capture'ı bir kez bırakır; geç up/lost-capture veya
reentrant callback ikinci commit üretemez. Source iptali baseline'a döner,
intervening source edit korunur; Pan iptali son görüntülenen view pozunu tutar.
Bu değişiklik bilinçli Escape/blur iptalini source commit'e çevirmez.

## Property blur

`ScrubInput` yalnız kullanıcının yazdığı metni dirty sayar. Dokunulmamış veya
mevcut sayıya eşit blur, viewport hareketinden sonra yeni bir source/undo
komutu üretmez. Enter tek commit yapar. Escape, blur tetiklenmeden önce draft
sahipliğini temizler. Dışarıdan controlled değer değişirse eski typed draft
geçersiz olur; sonraki blur yeni viewport/source değerini geri yazamaz.
Mevcut dış değerle text eşitleme politikası ve scrub hassasiyeti korunur.

## Doğrulama ve kapsam

`scripts/perf/pointer-release.mjs` gerçek SceneCanvas, editor, Pan, guide ve
PropertiesPanel adapter'larıyla izole QA üretir. **Run pointer release checks**
raporu tüm kontrolleri toplar; before sürümünde ilk hata sonrasında retry
sonucu da kaydedilir. Before **5/9**, after **14/14** geçti. After kapsamına
başarılı ilk Pan-sonrası hareketin tek Undo'su ve dört typed-input senaryosu
eklendi; bunlar aynı paydalı ölçüm olarak sunulmaz.

```sh
node scripts/perf/pointer-release.mjs artifacts/performance/pointer-release-audit-20261109/after
node scripts/perf/serve.mjs artifacts/performance/pointer-release-audit-20261109/after 4345
```

Pointer unit testleri identity/capture/cancel/cleanup, normal final örnek,
kaçan up, button chord, middle→primary geçişi, callback hatası ve reentrant
dispose'u kapsar. Source adapter testleri hover'ın eski preview'ı değiştirmeden
tek Undo'ya dönüşmesini ve küçük clone hareketinin hover ile eşiği aşmamasını
doğrular. Parent/animasyon korunması mevcut transform/clone/motion testlerinde
aynı source komutları üzerinden kontrol edilir.

Son doğrulama: `npm test` **299 dosya / 2359 test**, TypeScript kontrolü,
`npm run mcp:build` ve `npm run build` (51 sayfa) geçti. Native browser
regresyonları pointer **14/14**, clone **14/14**, Array **15/15**, motion-key
**12/12**, shape placement **21/21** geçti. Beş güncel QA bundle'ının kaynak,
bundle ve CSS hash'leri çalıştırılan sürümle eşleşti.

Açık kullanıcı projesi önce MCP ile portable dosyaya kaydedildi; eski sekme ve
undo geçmişi yeniden yüklenmedi. Güncel uygulamada açılan kopyada gerçek fareyle
Pan, Select ve ilk nesne sürüklemesi yapıldı. MCP source karşılaştırmasında
nesne **80 px sağa / 40 px aşağı** taşındı; sonraki basılı olmayan hareket
source veya revision değiştirmedi. Diğer nesne ve animasyonlar korundu. Tek Undo
başlangıç source'unu birebir geri getirdi. Taşıma ve geri alma sonrasında
`validate_scene` uyarısız geçti. Geri alınmış portable kopya
`projects/mouseup-fixed-project-20261109.chorono.json` olarak kaydedildi;
başlangıç yedeğiyle SHA-256 özeti aynıdır. MCP native pointer üretmediği için
fare etkileşimi CUA ile, source/revision/undo doğrulaması MCP ile yapıldı.

Bu dilim Pan ve `EditorPointerSession` kullanan transform/guide/motion-key/
native shape araçlarını kapsar. Runtime-preview drag, marquee ve spline-box
hook'larının kendi gesture politikaları bu değişiklikte yeniden yazılmaz.
Source/Preview event sözleşmeleri aynı kabul edilmez.

Yerel kanıtlar `artifacts/performance/pointer-release-audit-20261109/` altında
before/after bundle ve hash manifest'leri, `*-acceptance.json`, trusted AX/JSON
kayıtları ve ana editör/MCP karşılaştırmasıyla tutulur. Üretilen QA çıktıları
git'e eklenmez. Yeni subsystem idle polling veya sürekli frame loop oluşturmaz.

## Aralıklı iptaller için yerel tanı kaydı

Tek bir başarılı fiziksel test aralıklı hatanın çözüldüğünü göstermez. Resources
→ **Interaction** bölümündeki **Start recording** ile yerel hareket kaydı
başlatılır. Panel kapalıyken kayıt sürer. Sorun tekrarlandıktan sonra **Stop
recording** ve **Download JSON** kullanılır. İlk kullanımda kayıt kapalıdır;
etkinleştirilmiş kayıt ve olaylar aynı sekmenin yenilenmesinde sessionStorage
üzerinden korunur. Depolama engellenirse bellek içi kayıt çalışmaya devam eder.

Ortak kayıt sahibi ve public kullanım sözleşmesi
[`interactions/diagnostics/README.md`](../../src/components/canvas/interactions/diagnostics/README.md)
dosyasındadır. En fazla 300 olay tutulur; sahne JSON'u, medya ve undo snapshot'ı
kopyalanmaz. Otomatik ağ aktarımı veya polling yoktur. UI mevcut export kaynak
sahibini kullanarak JSON Blob'unu ve indirme URL'sini bırakır.

Nesne, guide, motion-key, shape placement ve Pan native sahipleri işaretlidir.
Viewport başlangıç kaydı aktif araç, seçim, pointer/button ve transaction
durumunu tutar. Native olaylar ilk hareket, son nokta, capture ve iptal nedenini;
source olayları ilk/final preview, commit ve guard nedenini tutar. İlk/final
nesne preview'ında uygulanan konum ve canvas rect'i, guide'da konum ve rect
kaydedilir. Ara hareketlerin tamamı loglanmaz. Source identity sayıları WeakMap
üzerinden üretilir; snapshot'ı bellekte tutmaz. Konumların CSS/composition
birimleri giriş sözleşmelerinde açıkça ayrılır.

Özellikle `source-cancel.details.reason` alanında `native:lostpointercapture`,
`native:blur`, `scope-change-or-unmount`, `source-changed`, `no-source-change`,
`no-pointer-movement` ve `below-drag-threshold` ayrımı incelenmelidir. Başlangıç
engellenmişse `start-rejected` veya viewport routing kaydı görülür. Başarılı
`source-commit` sonrasında source geri dönüyorsa bu önceki gesture iptalinden
farklı bir source yazıcısını işaret eder. Bu araç tanı sağlar; tek başına yeni
bir aralıklı hata nedeni bulunduğu veya giderildiği iddiası değildir.

Tanı eklemesinin kabulü: **302 dosya / 2382 test**, TypeScript, MCP ve Next
production build geçti. Açık kullanıcı editöründe toplam **7 nesne / 5 guide**
fiziksel taşıma denemesinde geri sıçrama gözlenmedi. Seçili olmayan nesneyi tek
mouse-down ile seçip taşıma, boş seçimden başlama, özellik input'undan çıkma,
Pan sonrası taşıma, iki yönde dikey guide ve yatay guide kapsandı. Bunların
ilk 3 taşıması tanı kaydı eklenmeden önce, sonraki 9 taşıması kayıt açıkken
yapıldı; geçici guide oluşturma tıklamaları taşıma sayısına dahil değildir.

UI'den indirilen `interaction-live-log.json` 163 olay içerir, eviction yoktur.
Kayıt açıkken yapılan 5 nesne ve 4 guide taşımasının `source-commit` olayları
MCP konumlarıyla eşleşir. Ayrıca 2 guide oluşturma commit'i ve bilerek yapılan
sürüklemesiz seçim tıklaması için bir `no-source-change` iptali vardır. Bilinen
bu click iptali, sürükleme hatası olarak sayılmaz. Commit yeni immutable source
ürettiği için commit olayında `expectedSourceCurrent=false` normaldir; bu alan
tek başına `current-rejected:source-changed` anlamına gelmez.

Test hareketleri ve geçici guide'lar tekil undo'larla kaldırıldı. Son MCP source
başlangıçla birebir aynı, `validate_scene` uyarısızdır. Portable
`projects/live-mouseup-diagnostics-restored-20261109.chorono.json` yedeğinin özeti
başlangıç yedeğiyle aynıdır. Test sonucu bildirilen aralıklı hatayı dışlamaz;
editörde kayıt açık bırakılmıştır. Yerel screenshot/log/MCP kanıtları önceki
`artifacts/performance/pointer-release-audit-20261109/` dizinindedir.

## İlk seçimde geri dönüş: gerçek capture kaybı düzeltmesi

Daha sonra alınan kullanıcı kaydı (`first-selection-lostcapture-20261109/reported-failures.json`)
173 olay içerir; eviction yoktur. **7 nesne taşıması ve 1 çizim**, basılı hareket
örneklerinden sonra `native:lostpointercapture` nedeniyle geri alınmıştır.
Hepsinde beklenen source hâlâ current, belge aynı ve transaction aktiftir.
Başarılı denemeler gerçek `native-up` ile bitmiştir. Bu veri önceki başarılı
testlerden farklı olarak kullanıcının gerçek başarısız olay zinciridir.

Eski kural capture kaybını doğrudan gesture iptali sayıyordu. Bağlı canvas'ta
capture kaybı artık yalnız element yakalamasının kaybıdır: pinned pointer/button
ve window capture listener'ları korunur. Yeni capture istenmez, başka bir
elementten capture geri çalınmaz. Kayıp olayının koordinatlarıyla commit yapılmaz;
gerçek `pointerup` veya mevcut son-basılı-örnek recovery'si beklenir. Bağlantısı
kopmuş element, `pointercancel`, blur, Escape, source/document/scope değişimi
eski güvenli iptal politikasını korur. Bu ayrım
[W3C lostpointercapture sözleşmesi](https://www.w3.org/TR/pointerevents3/#the-lostpointercapture-event)
ve mevcut window fallback sahipliğiyle uyumludur.

Çizimde önceki iptal `onClose(undefined)` yoluyla Add aracını da kapatıyordu.
Geçerli gesture artık final up'ta template ID ile tamamlanır; persistent Add
sonraki shape için açık kalır. Bu davranış shared owner ve shape adapter
regresyonlarında doğrulanır. `native-capture-lost` kaydı loss event'in button
maskesini son basılı örnekten ayrı tutar; fallback ile gerçek iptal ayırt edilir.

Kabul: **304 dosya / 2409 test**, TypeScript, MCP ve production build geçti.
Aynı native browser fixture eski source override ile **14/17**, düzeltmeyle
**17/17** geçti. `--pointer-source-ref=d0b548e` yalnız eski pointer owner'ı
derler; manifest override Git ref'ini ve gerçek içerik hash'ini ayrı kaydeder.
Fixture ayrıca gerçek fare sürüklemesinde canvas capture'ını isteyerek bırakır:
eski owner nesneyi **90/90**'a döndürürken, yeni owner gerçek up sonrası
**190/145** konumunda tek undo ile tamamlamıştır. İki koşuda da trusted
`lostpointercapture` olayının gerçekten oluştuğu kaydedilmiştir.

Yerel kullanıcı kaydı, before/after manifest ve native raporlar, trusted pointer
kayıtları `artifacts/performance/first-selection-lostcapture-20261109/` altında
tutulur. Fixture rapor satırları yalnız pointer-up sonrasında eklenir; gesture
sırasında canvas rect'ini değiştiren test yerleşimi gerçek koordinat sonucunu
bozmamalıdır. Tanı depolama adapter'ının 13 testi yenilemede opt-in durumunu,
olay/counter sürekliliğini, boyut sınırlarını ve kapalı storage fallback'ini kapsar.

### İçe alınan sahnede kalıcı çizim aracının kimlikleri

Canlı kabul sırasında ikinci bir bağımsız ret yolu bulundu: process-local
registry sayacı yeniden açılmış projedeki `rect_2` gibi kimliklere ulaşınca
sonraki template zaten source'a ait olabiliyordu. `ShapePlacementSession`
aynı kimliği yeniden eklemeyi doğru olarak reddediyor, fakat bu ret Add aracını
kapatıyordu. `src/lib/editor/placement/availableShapeTemplate.ts` mevcut registry
factory'sini güncel source kimliklerine karşı tekrar deneyerek kullanılmayan
template verir. Yeni bir kimlik formatı veya ikinci registry oluşturulmaz;
isimler, varsayılan geometri ve counter davranışı korunur. Hem ilk seçim hem her
commit sonrası hazırlık bu helper'ı kullanır. React hook'un `getScene` bağımlılığı
commit edilmiş son source'u okur; template source/history dışında kalır.

Dört regresyon testi yüklü, boşluklu counter kimliklerini, ardışık üretimi,
geometriyi ve bozuk factory davranışını kapsar. Aynı kullanıcı sahnesinde ilk
Rectangle `rect_1`, ikinci Rectangle `rect_7` olarak üretildi: **8 → 9 → 10**
katman; Add menüsü açık ve Rectangle etkin kaldı. İki işlem ayrı tek undo ile
geri alındı. İlk nesne sürüklemesi yeni konumunda kaldı; sonraki basılmamış
hareket source'u değiştirmedi. Canlı guide **747.015625 → 807.015625 px**
taşındı ve release sonrası sabit kaldı; geçici guide temizlendi.

Gerçek sayfa yenilemesinde kayıt açık durumu ve **27/300** olay korundu.
Son indirilen `live-fixed-interactions.json` **76** olay içerir; eviction ve
`source-cancel` yoktur. Bir nesne, iki guide işlemi ve üç shape commit'i içerir
(shape işlemlerinden biri kimlik düzeltmesinden önceki başarılı ilk çizimdir).
Kimlik çakışması constructor reddidir; bu yüzden source gesture iptali sayılmaz.
Son native bundle'ın 402 source hash'i güncel dosyalarla eşleşir; 17/17 kontrol
yeniden geçmiştir. Sonuçlar `verification.json` ve `final-after-acceptance.json`
dosyalarında yereldir.

Kullanıcının 8 katmanlı source'u test öncesiyle birebir aynı duruma getirildi;
`validate_scene` uyarısızdır. Portable
`projects/lostcapture-fixed-project-20261109.chorono.json` dosyasının SHA-256'sı
test öncesi yedekle aynıdır:
`95b7b4c40316c23a3b777d2d62ebe06035ad57b62af07966f905d828f5c4bf68`.
Güncel uygulama localhost'ta ve tanı kaydı açık bırakılmıştır.
