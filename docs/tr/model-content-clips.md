# 3D-T1 — model detayında private klip ve Timeline

> 14 Kasım güncellemesi: ilk teslimin tarihli kapsamı aşağıdadır. Node, kamera,
> material, native klip, çoklu model ve açık input'ların güncel sözleşmesi
> [3D0–3D6 model detay araçları](model-detail-3d-packages.md) belgesindedir.

14 Kasım 2026. Bu teslim mevcut kutulu modelin **sayısal yerleşim ve kamera
kanallarını** kendi detay ekranında key'lemeyi sağlar. Imported GLB/glTF bone,
skin, morph veya native animation clip verisini dönüştürmez. Shape/Path statik
detay akışı ve ana 2D Timeline korunur. Genel recursive komponent/3D workspace
kurulmadı. **3D-T2 ortak kabulü de tamamlandı:** [sonuç ve sınırlar](model-clip-acceptance.md).

## Kullanım

1. Modeli seç → sağ tık **Edit content** veya model üzerinde çift tık.
2. **+ Clip** ile açıkça yeni yerel klip oluştur. Ad, süre ve Loop ayarlanabilir.
3. Yerel zamanı seç; **Set Key** ile bütün model/kamera kanallarını veya seçili
   kanalı key'le. Klip seçiliyken Properties değişiklikleri o zamanda key yazar;
   lighting statik kalır. Henüz klip yoksa mevcut statik içerik düzenlenir.
4. **Timeline** seçili 3D nesnenin özet anahtarlarını gösterir. **Dope Sheet**
   aynı nesnenin özellik gruplarını ve X/Y/Z kanallarını açar; Shift ile çoklu
   seçim, sürükleme ve **Key properties** tablosunda zaman/değer/easing/silme
   kullanılabilir. **Curve Editor** seçili nesnenin sayısal eğrilerini ve
   Bézier kollarını açar. Renk ve görünürlük anahtarları Dope Sheet'te kalır.
5. Klip seçimi yalnız önizlemeyi değiştirir. **Use in scene** bir klibi kayıtlı
   aktif klip yapar; tekrar basılması onu pasifleştirir. Alternatifler karışmaz.
6. **Apply & return** bütün taslağı tek ana Undo ile uygular. Cancel/Back kirli
   taslakta Apply/Discard/Stay sunar. Yerel Undo/Redo yalnız bu taslağı değiştirir.

Ana sahne veya belge değişirse Apply kapanır; Discard araya giren elle
düzenlemeleri geri almaz. Devam eden pointer gesture tamamlanmadan Apply olmaz.
Ana dock detayın altında mounted/inert kalır; ana zaman/seçim/layout yeniden
kurulmaz. 3D animasyon panelinin yüksekliği kendi dock ayırıcısıyla ayarlanır.

## Kaynak ve sürüm

`Layer.model3d.version:1` değişmeden okunur. Sırf detayı açmak, statik alan
düzenlemek veya no-op Apply sürüm yükseltmez. İlk klip açıkça oluşturulunca
payload **version:2** olur; root `formatVersion:1.0.0` değişmez. Önceki v1 model
okuyucusu v2'yi reddeder; yeni animasyonu sessizce statik kabul etmez.

```json
{
  "version": 2,
  "assetId": "robot-source",
  "animation": {
    "version": 1,
    "activeClipId": "turn",
    "clips": [{
      "id": "turn", "name": "Turn", "durationMs": 1000,
      "autoplay": false, "loop": false, "layerIds": ["content"],
      "tracks": [{
        "target": "layers.content.model3d.rotation.y",
        "keyframes": [
          {"id":"a","timeMs":0,"value":0,"easing":{"type":"linear"}},
          {"id":"b","timeMs":1000,"value":90,"easing":{"type":"linear"}}
        ]
      }]
    }]
  }
}
```

Örnek yalnız ek alanları gösterir; gerçek model position/rotation/scale/camera/
lighting alanlarını da taşır. Private root `content` hiçbir sahne layer ID'sini
içermez. Düzenleme projection'ı bunu owner ID'ye, Apply geri `content`'e
`remapTrackTarget` ile çevirir. Copy/Array kayıtlı klipleri normal source copy
ile korur; ince live instance mevcut görsel kaynak çözümlemesini kullanır.
v2 son klip silinince v1'e sessizce düşürülmez. v1'in bilinmeyen `animation`
metadata'sı korunur ve private klip olarak yorumlanmaz; üstüne klip yaratılması
açık dönüşüm olmadan reddedilir.

İlk sınırlar: **16 klip, toplam 8192 key, klip başına 14 tam leaf kanal,
4 MiB / 100.000 JSON node**, süre 1..86.400.000 ms. Key zamanı kendi klibi
içindedir; ID'ler klip kaynağında benzersizdir. Yapı plain JSON'dur. Controller,
modifier, time warp, out-of-range sinyali, event, audio, SM, nested owner ve
imported pose authoring bu formatın ilk sürümünde kabul edilmez.

## Sahipler, veri akışı ve yaşam döngüsü

| Giriş noktası | Sorumluluk |
| --- | --- |
| `src/lib/model3d/animation/ModelContentAnimation.ts` | Sürümlü klip kaynağı ve bounded import/commit doğrulaması; normalize etmez. |
| `modelChannels.ts` | Registry, validation ve frame projection için tek 14-kanal listesi ve sayısal sınırlar. |
| `modelClipOwnership.ts` | Bütün kliplerin kanal birleşimi; root Timeline/driver çakışması ve dış source patch koruması. |
| `modelClipFrame.ts` | Ortak evaluator ile explicit composition ms → owner yerel ms → yalnız aktif klip override'ları. |
| `src/lib/editor/detail/ModelClipDraft.ts` | Tek owner'lı nötr projection; asset borrowed; scoped private source dönüşümü. |
| `ItemDetailSession.prepareClipApply` | Revision/document/owner/source CAS, izinli tek payload patch'i, tek ana Undo. Statik `prepareApply` korunur. |
| `src/components/detail/DetailWorkspaceShell.tsx` | Ortak Back/Apply/Cancel, odak, kirli çıkış ve yerel history ömrü. |
| `useModelClipEditor`, `ModelDetailWorkspace`, `ModelContentTimeline`, `ModelContentKeys` | Tek yerel transport, sampled inspector/Canvas ve mevcut key/Curve bileşenlerine adapter. |

Native key/Set Key/batch/collision/easing/curve split algoritmaları tekrar
yazılmadı. `TimelineAuthoringContext` yalnız host tarafından sağlanır. Curve
Editor ve pointer hook'larına optional context eklenmesi eski ana caller'ları
değiştirmez. Mevcut büyük Curve Editor dosyasından yalnız bu integration sınırı
genişletildi; ilgisiz renderer/curve algoritması yeniden yazılmadı.

Detay history politikası 20 adım / 16 MiB / 100.000 node'dur; mevcut scene'in
ve GPU'nun toplam RAM sınırı olduğu iddia edilmez. GPU/DOM/mixer/yoğun sample
buffer ve clock source/Undo'ya girmez. Yerel transport unmount'ta rAF bırakır;
asset cache mevcut managed lease sahibi üzerinden acquire/release yapar.

## Zaman ve koruma

Ana hareket composition ms'de sürer. İç klip zamanı
`max(0, compositionTimeMs - owner.startMs)` üzerinden mevcut `computeLocalTime`
loop/endpoint ve `evaluateTrack` interpolasyonu ile hesaplanır. Oynatma adına
her nesne yeni rAF/mixer başlatmaz. Yerel paused seek, loop son karesini de tam
gösterebilmek için seçili klibe explicit `externalTime` verir. Geri scrub source'u
yazmaz. Konum normalize model sunum birimleri, açılar derece; dış kutu hâlâ 2D px.

Kare üretim sırası root timeline/host base → private model klipleri → mevcut
parametre/binding/Wire/Expression hattıdır. Private kanala rakip root track,
Wire, binding veya Expression kabul edilmez. Legacy v1 iç root track'leri
taşınmaz/silinmez; bunları koruyarak sahiplik dönüşümü ayrı işlemdir. Bütün
kayıtlı klipler kanal sahipliğine katılır; pasif klip kanalı da dışarıdan ezilmez.

Kaydedilen key/easing değişmez; yalnız sampled frame, kamera/ölçek/pozisyon
aralıklarına sınırlandırılır. Böylece easing taşması kamera tekilliğine veya
negatif ölçeğe dönüşmez. Source ve frame doğrulaması ayrı tutulur; her GPU draw
bütün klip JSON'unu taramaz. Immutable source'a bağlı WeakMap sorguları eski
2D karede aynı taramayı tekrar yapmaz ve kapalı belgeleri güçlü referansla tutmaz.

MCP/script ana 2D key kapsamındadır; private klip authoring API'si açılmadı.
Generic layer patches v2 klip kaynağını veya sahipli base kanalı değiştiremez.
Sadece detail Apply açık internal owner yetkisini sağlar; actor/flag JSON'una
yazılmaz. Normal dış transform/opacity/box ve unowned statik alanlar korunur.

Prepared raster ve portable source ortak `evaluateSceneFrame` hattını kullanır.
Basic/native runtime ve standalone HTML, boxed 3D için mevcut açık ret davranışını
korur. Aynı-browser live/MCP/raster, copy/instance ve kaynak bırakma kabulü
[T2'de doğrulandı](model-clip-acceptance.md); büyük sahne/uzun stres kabulü ayrı kalır; native GLB klip/rig, yeni node/camera/material araçları daha sonra.

## Doğrulama

`ModelClipDraft.test.ts`, `modelContentAnimation.test.ts` ve mevcut context/Curve
testleri gerçek native komutlarla scope, kaydet/aç, source kimliği, tek Undo,
CAS, iptal, clone/instance, zaman/loop ve eski v1 korumasını denetler.

```sh
node scripts/detail/prepare-browser.mjs /private/tmp/chorono-3dt1-browser
node scripts/perf/serve.mjs /private/tmp/chorono-3dt1-browser 4335
```

Loopback fixture'da **Run model clip acceptance** gerçek React kontrollerini,
committed JSON ve history'yi denetler. Kullanıcının sahnesi, recovery deposu veya
MCP session'ı kullanılmaz. Sentetik DOM kabulü trusted fare testi yerine sunulmaz;
Curve Bézier kolu ve Keys sürüklemesi ayrıca gerçek tarayıcı girdisiyle kontrol edilir.


14 Kasım kabul sonucu: **379 test dosyası / 3.072 test** geçti. TypeScript,
MCP, CLI ve Next üretim derlemeleri tamamlandı; mevcut
`applicationBuildInfo.ts` JSON named-export uyarısı bu değişiklikte ele alınmadı.
Model klibi için altı React/DOM kabul akışı geçti; native fareyle ilk key
sürüklemesinde 0→100 ms commit, yerel Undo ve sayısal input blur→Cancel
onayı ayrıca gözlendi. Bézier kolunun tek gesture ile yerel history'ye commit'i
kontrol edildi. Kaynak ana key'i bu özel draft hareketi sırasında 0 ms kaldı.
Bu sonuç geniş T2 piksel/instance/resource kabulünün yerine geçmez.

Dokunulmamış v2 kliplerin optional membership alanı no-op aç/Apply ile
normalize edilmez; bu durum son portable round-trip regresyon testine dahildir.
