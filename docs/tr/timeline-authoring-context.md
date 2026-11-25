# 3D-T0 — ana ve iç Timeline authoring bağlamı

14 Kasım 2026. **T0, T1 ve T2 uygulandı; [T2'nin ölçülen kapsamı](model-clip-acceptance.md).**
T0'ın geçici authoring bağlamı aşağıda açıklanır. T1 mevcut detay host'una
private model kliplerini ve yerel Keys/Curve düzenlemesini ekler; source sürümü,
commit ve zaman sözleşmesi [3D içerik kliplerinde](model-content-clips.md).

## Giriş noktaları ve sorumluluklar

| Sahip | Gerçek sözleşme |
| --- | --- |
| `src/lib/timeline/authoring/TimelineAuthoringContext.ts` | Readonly scene/content host bağlamı, mevcut owner/Timeline doğrulaması ve dar borrowed source kontratı. |
| `timelinePropertyScope.ts` | Aynı hedef sorgusu hem root hem içerik için; `assertTimelineEditTarget` Timeline bağını da doğrular. |
| `src/lib/registry/LayerDefinition.ts` | `timelineExcludedPaths` ana editörün dışladığı kökler; yeni `contentTimelinePaths` iç host'un izinli tam leaf kanallarıdır. |
| `src/lib/model3d/source/modelDefinition.ts` | Şimdiki iç hedef listesi: 3D position/rotation XYZ, scale; camera yaw/pitch/distance/fov/target XYZ. Ana Properties hâlâ statik, ana Timeline iç kanallara kapalıdır. |
| Native key/track ve authoring komutları | Optional host context; belirtilmezse scene. Scope guard execute öncesi çalışır; inverse snapshot restore eski kaydı korur. |
| Hierarchy/Curve/Dope Sheet projection | Aynı context-aware track sorgusu ve hiyerarşi; structural ancestor görünmesi ona key edit yetkisi vermez. |
| Script host adapter'ı | Optional internal `ApiContext.timelineContext`. Public MCP/QuickJS host'ları bunu sağlamaz; yeni bir tool/script context parametresi açılmadı. |

## İki açık bağlam

`SCENE_TIMELINE_CONTEXT` mevcut bütün caller'ların varsayılanıdır. Normal
2D transform/opacity ve eski custom kanal davranışı korunur. Modelin iç
`model3d.*` track'leri ana Timeline'da düzenlenemez. Static Properties'in iç
konum/kamera güncellemesi Auto Key açıkken iç key yaratmaz.

`contentTimelineContext(draft, ownerLayerId, timelineId)` yalnız mevcut,
yeteneği tanımlı owner ve mevcut draft Timeline için immutable bağlam üretir.
Kaynak yaratmaz, clone etmez, sahiplik migrate etmez. Komut çalışırken güncel
draft'ta owner/Timeline tekrar kontrol edilir. Farklı Timeline, başka model,
dış root transform, bilinmeyen namespace/owner, asset/version/structural yol,
parent nesne yazısı ve listelenmemiş iç kanal reddedilir. Aynı asset'i kullanan
iki model, layer kimliği farklı olduğu için birbirinin iç hedefine yazamaz.

İç hedefin tam leaf olması gerekir: `model3d.camera.yaw` izinliyken
`model3d.camera`, `model3d` ve `model3d.assetId` izinli değildir. Ayrıca ilan
edilen iç leaf ana editörün excluded kökü altında olmalıdır. Lighting, rig,
node veya başka türün keyleri yalnız metadata ekleyerek teslim edilmiş sayılmaz;
ilgili domain capability/authoring kabulü gerekir.

## Minimal internal kullanım

Aşağıdaki örnek repo içindeki **izole draft host'u** içindir; MCP veya QuickJS
script metodu değildir. Host draft, revision, iptal ve main Apply yetkisini
ayrıca sahiplenir. Salt context oluşturmak ana sahneye commit izni vermez.

```ts
import { contentTimelineContext } from '@/lib/timeline/authoring/TimelineAuthoringContext'
import { prepareSetKey } from '@/lib/timeline/authoring/setKey'

// Owner ve Timeline bu draft'ta zaten bulunmalı; yeni klip oluşturulmaz.
const context = contentTimelineContext(draftScene, modelId, draftTimelineId)
const plan = prepareSetKey(draftScene, {
  timelineId: draftTimelineId,
  layerIds: [modelId],
  timeMs: 250,
  keyset: 'selected',
  selectedTargets: new Set([`layers.${modelId}.model3d.camera.yaw`]),
  context,
})
const nextDraft = plan.command?.execute(draftScene) ?? draftScene
```

Context taşıyan native komutlar: ekle/sil/taşı/value/easing, paste/batch,
snapshot/Set Key/clear, controller/modifier/curve/out-of-range/bake ve Auto Key.
Set Key diagnostics korunan/seçilemeyen kanalları listeler; kesin hedefli karma
paste/delete/move işlemi geçersiz hedef içeriyorsa bütün forward edit reddedilir.
Readonly projection ve key gezinmesi aynı owner filtresini kullanır.

Zaman girdisi ilgili Timeline'ın **yerel milisaniyesidir**. Set Key/batch
mevcut key-time bounds/collision helper'larını yeniden kullanır; yeni loop,
clock veya duvar saati hesabı eklenmez. Oynatma/evaluation source'u değiştirmez.
Context ne JSON/Undo payload'ına ne runtime key değerlerine yazılır.

## Kaynak koruması ve sınırlar

- Root çağrılar için yeni format/migration veya kaynak normalizasyonu yoktur.
  Save/open, clone ve Undo, eski gizli iç keyleri/ID/easing/tangent'ları korur.
  Source projection track'leri filtreler; kayıttan silmez.
- Eski ince `instanceOf`, parametrik component'e çevrilmez. Genel property
  bağlama/Expression politikası veya model asset import desteği değiştirilmez.
- İç context host tarafından sağlanır; layer üstüne actor/context flag'i koymak
  veya MCP patch'ine böyle bir alan eklemek yetki kazandırmaz.
- `TimelineHandle.set` iç host bağlamında clip lifecycle edit'i yapamaz; T1'in
  scoped klip host'u kullanılır. Public scene handle davranışı korunur.
- Statik `ItemDetailSession.prepareApply` sözleşmesi korunur. T1'in ayrı
  `prepareClipApply` metodu private projection'ı tek model payload'ına çevirir;
  root Timeline değiştirme izni vermez.
- T1 native GLB clip/rig oynatımı değildir. İlk numeric klip sampling'i aynı
  `evaluateSceneFrame` hattında çalışır; geniş preview/MCP/raster/instance kabulü
  T2'nin ayrı teslimidir.

## Doğrulama

Yeni `TimelineAuthoringContext.test.ts` gerçek native komut ve script adapter'ları
üzerinden scope ayrımı, parent/structural/foreign hedef reddi, karma edit'in
atomikliği, yerel key sınırı, kaynak/key metadata koruması, Undo ve projection
eşliğini kontrol eder. Mevcut model Timeline scope, key authoring ve history
regresyonları da korunur. Son test/build sonuçları ana plan §3.2.1'de kaydedilir.
