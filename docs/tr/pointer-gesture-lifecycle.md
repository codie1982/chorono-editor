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
pointercancel ve gerçek lost-capture host'un iptal politikasına gider. Her
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
