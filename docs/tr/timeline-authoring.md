# Set Key ve Timeline authoring — E−1.4

10 Kasım 2026. Bu belge uygulanan editör davranışını ve bakım sınırlarını tanımlar.

## Kullanım

Timeline'daki büyük **◆ Set Key** düğmesi veya **K**, seçili katmanlara tek undo
ile key ekler. Varsayılan **All supported channels**; **Transform + opacity**,
**Existing animated channels** ve **Selected key channels** daha dar keyset'lerdir.
Son seçenek seçili key'lerin kanallarını kullanır. Bir parent seçmek otomatik
olarak bütün çocukların her alanını key'lemez; Set Key açık katman seçimini kullanır.

Sayısal değer, renk, metin, boolean ve typed Vec2 desteklenir. Eksik optional
payload, bütün geometri/topoloji ve kaynak kimlikleri üretilmez/key'lenmez.
Kilitli/dondurulmuş parent zinciri korunur. Controller, modifier, timewarp,
binding/wire ve path tarafından sürülen transform kanalları açıklanır. Kısmi
uygulama önce review gösterir; **Set supported keys** ile açıkça uygulanır,
**Cancel** hiçbir source değişikliği yapmaz. Bake mevcut ayrı işlemdir.

Sıradan animasyon kanalında playhead anındaki source interpolasyonu örneklenir;
untracked alanda typed kaynak kullanılır. World/screen transform sonucu tekrar
input'a yazılmaz. Ara key eklemek bütün nonlinear eğriyi aynen koruyan bir eğri
bölme işlemi değildir. Aynı zamandaki güncelleme ID, tangent, segment modifier ve
belirtilmeyen easing'i korur. Yeni key linear'dır. Script/native key API'lerinde
explicit easing onu değiştirir; atlanan easing mevcut key'de korunur.

## Zaman, gezinme ve toplu düzenleme

- Edit zamanı etkin timeline'ın **yerel milisaniyesidir**. Oynarken global zaman
  mevcut `computeLocalTime` üzerinden loop/ping-pong/count kurallarıyla çözülür.
  Duraklatılmış manuel gezinme `0..durationMs` içinde kalır; loop ve work area
  timeline son karesine ulaşmayı engellemez. Runtime/segment zamanı önceliği ve
  export değerlendirmesi değiştirilmedi.
- Görünür transport: başlangıç/son, önceki/sonraki frame, önceki/sonraki key,
  ilk/son key ve Play. Key kapsamı seçili dalların birleşimi; seçim yoksa etkin
  timeline'dır. Explicit membership ve başka timeline'a bağlı sesler hesaba katılır.
- **Left/Right** frame; **Shift+Left/Right** 10 frame; **comma/period** önceki/sonraki
  key; **Home/End** timeline sınırı; **Shift+Home/End** ilk/son key. **J** önceki key
  uyumluluk kısayoludur. K yeni Set Key varsayılanıdır. Registry'de önceden kayıtlı
  özel K ataması ezilmez; Set Key düğmesi kullanılabilir. Kalıcı kullanıcı shortcut
  ayarı bu teslimin yeni bir özelliği değildir.
- Input/select/contenteditable/IME, görünür modal/menu, aktif transaction ve native
  düğme Space/Enter kendi girdisini yönetir. K auto-repeat ikinci history üretmez.
  Marker/bookmark aksiyonları aynı merkezi listener'dan görünür panel scope'una
  yönelir; Timeline hover listener'ı yoktur.
- Move, slide, scale, stagger, paste, mirror, frame-align ve spreadsheet aynı
  commit politikasını kullanır. Eşitlik `1e-6 ms`; fractional key'ler birbirinden
  bağımsızdır. Varsayılan çakışmada **bütün işlem reddedilir**. **Overwrite
  collisions** yalnız hedefteki dokunulmamış key'leri değiştirir; seçili iki key'in
  aynı track/zamanda birleşmesine izin vermez. Seçim eşzamanlı taşınır; swap mümkündür.
  Sınır aşan üyeler ayrı ayrı clamp edilerek grup aralığı bozulmaz.
- Drag ortak delta ile sınırlanır; scale kolları ayrıca Arrow ile %1 ölçeklenir.
  Escape/cancel/timeline değişimi preview'ı geri alır. Spreadsheet Escape sonrası
  blur commit yapmaz. Reddedilen transaction kaynak baseline'ını ve attribution'ı
  geri getirip kapanır; undo yalnız başarılı edit için oluşur.

## Sahiplik ve veri akışı

`src/lib/timeline/authoring/` sayısal/source kurallarının sahibidir:
`keyTimePolicy.ts`, `keyableChannels.ts`, `setKey.ts`, `keyframeBatch.ts` ve
`timelineNavigation.ts`. React, browser veya transport bağımlılığı yoktur.
`LayerIndex`, `LayerTrackIndex`, property registry, typed value doğrulaması,
`evaluateTrack` ve `computeLocalTime` yeniden kullanılır. Ortak borrowed source
okuması `src/lib/scene/properties/readPropertyPath.ts`; script adapter'ı sonucu
kendi sınırında detach eder.

`src/components/timeline/authoring/useTimelineAuthoring.ts` UI keyset, collision
tercihi ve review planını tutar. Page tek owner'ı Timeline, Curve, Dope ve merkezi
keyboard'a bağlar; standalone panel tüketicileri yerel fallback kullanabilir.
`SetKeyControls`, `TimelineTransport`, `BulkEditPolicyControl` yalnız sunumdur.
Registry default'ları ve `src/lib/shortcuts/scopedActions.ts` context çözümünü
paylaşır; panel disposal scope'u kaldırır, yeni timer/polling eklenmez.

Komutlar immutable serializable scene döndürür; runtime sınıfı/DOM handle'ı JSON'a
girmez. `prepareSetKey` ID'leri hazırlıkta sabitler; kaynak ref'leri değişmiş plan
commit edilmez. Komut track/membership snapshot'ını tutar. Domain hata atar; UI
görünür notice/toast gösterir. `useEditorState` attribution'ı bir başarılı commit'te
damgalar; exact undo/redo/portable save eski kayıtları korur. Key paste copy kökenini
korur. Bellek sahipliği mevcut history/source owner'ında kalır.

```ts
import { prepareSetKey } from '@/lib/timeline/authoring/setKey'

const plan = prepareSetKey(editor.getScene(), {
  timelineId: 'intro', layerIds: ['hero'], timeMs: 500, keyset: 'animated',
})
// UI diagnostics varsa kullanıcıya kapsamı gösterir; onaydan önce commit etmez.
if (!plan.diagnostics.length && plan.command) editor.dispatchCommand(plan.command)
```

`commands-keyframe.ts` mevcut public komutları ortak batch'e adapte eder; yeni
optional collision seçeneği default reject'tir. `keyframeOps` düşük seviyeli
preview writer'ları validation yapmaz; commit için batch/Set Key kullanılır.
Curve insert'in mevcut ergonomik ±1 ms eklemeyi reddetmesi durur; bu kaynakta
yakın key'leri silen upsert davranışı değildir. Legacy büyük TimelinePanel,
page ve LayerHandle yalnız değişen sorumlulukta aşamalı güncellendi; genel dosya
bölme yapılmadı. Yeni domain/UI owner'ları ayrı küçük modüllerdir.

## Kabul ve sınırlar

`scripts/perf/timeline-authoring.mjs <output>` durmuş/izole checkout'ta gerçek
Canvas, Timeline ve Curve Editor panellerini paketler. Loop/work area'lı 51
katmanlı fixture, manuel 09:05 saat ve eski key ID/easing/tangent/source kökeni
kullanır; ana editörü, MCP oturumunu veya kullanıcı sahnesini değiştirmez.
Run authoring checks: 10 senaryo — interpolation, 50 katman tek undo/membership,
driven review/cancel, collision/overwrite, grup aralığı, fractional spreadsheet,
paste, rejected gesture, terminal pose ve klavye sahipliği. Unit testler typed
keyset, frozen zincir, sub-ms/ambiguous/stale key, local playback mapping ve
script adapter undo'yu da denetler. Kanıt ve komut sonuçları
`artifacts/validation/timeline-authoring-20261110/` altında tutulur.

MCP araç adları/protokol 2.1.0 ve scene formatı değişmedi; source key güncelleme
semantiği iyileşti. Canlı eski editor/STDIO bundle'ına otomatik yükseltme iddiası
yoktur. Prosedürel eğri/parser/controller görünümü **E−1.5**'tir; yeni bir bake,
soft selection, export veya genel performans turu bu teslimde açılmaz.
