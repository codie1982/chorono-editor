# V4 — Alt ağaç, animasyon ve referans koruyan çoğaltma

8 Kasım 2026. Bu belge editor Duplicate/Clone ve viewport drag-copy'nin gerçek
sözleşmesidir. Çoklu Array V5, clipboard paste ve authoring provenance ayrı işlerdir.

## Kullanıcı davranışı

- **Cmd/Ctrl+D**, Quick Clone, Layers/Explorer duplicate ve Clone ayarları aynı
  forest komutunu kullanır. Seçili parent ve child iki kez çoğalmaz. Grup olmayan
  bir layer'ın çocukları da dahil edilir. Yeni kökler birlikte seçilir.
- Duplicate varsayılanı parent-local `(20,20)` yerleşim farkıdır. Önceki gizli
  `+100ms` zaman kaydırması kaldırıldı; key/range zamanları aynen kalır.
- **Cmd/Ctrl+drag** Copy, **Cmd/Ctrl+Shift+drag** Instance'dır. Runtime ve yardım
  aynı gesture registry'sini kullanır. Shift tek başına eksen kilidi, Alt tek
  başına deep-pick'tir. Copy/Instance kararı pointer-down'da sabitlenir;
  sürüklerken Shift bırakılması Instance kararını değiştirmez.
- Üç CSS pikselden küçük hareket veya tıklama kopya/history oluşturmaz. Hareket
  eşiğinden sonra kaynak yerinde kalır, gerçek yeni subtree önizlemede çizilir.
  Bırakıldığında aynı ID'li önizleme komutu tek undo olarak uygulanır.
- Kaynak parent/transform/key kayıtları değiştirilmez. Bir child tek başına
  kopyalanırsa kopya aynı dış parent altında kalır. Parent kopyalandığında yeni
  child parent'ları yeni parent ID'sine gider.
- Animasyon varsayılanı kaynak forest'ı hedefleyen **bütün timeline'lar**dır.
  Clone ayarlarında animasyon kopyalama kapatılabilir. Timeline seçimi implicit
  olarak diğer timeline'lardaki animasyonları düşürmez.
- Clone modal kaynak değişmişse Apply'ı reddeder ve açık kalır. Sayısal
  count/offset alanları sürükleme dışındaki doğrudan kullanım alternatifidir.

Instance mevcut görünüm paylaşımını kullanır; source'a sonradan eklenen/silinen
çocukları otomatik takip eden canlı component ağacı değildir. Eksik/cyclic
instance kaynakları veya iç mask/path/repeater bağlantılarının bu thin-instance
temsiliyle korunamadığı durumlar reddedilir. Bağımsız Copy, instance'ın native
görünümünü materialize eder; eski `instanceOf` bağlantısını korumaz.

## Sahipler ve API

| Modül | Sorumluluk |
| --- | --- |
| `src/lib/editor/commands-clone-forest.ts` | Public prepare/one-shot command ve atomik uygulama/undo |
| `src/lib/clone/CloneForestSource.ts` | Seçili kökler, bütün descendants ve stale source guard |
| `src/lib/clone/CloneForestPreparation.ts` | Bir kez kaynak şablonu/ID/track hazırlama; instance materialization |
| `src/lib/clone/CloneForestPlacement.ts` | Parent-local yerleşim ve lossless track translation / placement group |
| `src/lib/clone/CloneReferenceRemapper.ts` | Tek typed layer-reference remapper |
| `src/lib/clone/CloneWorkload.ts` | Editor ve MCP için ortak layer/key expansion bütçesi |
| `src/components/canvas/hooks/drag/cloneDragPreview.ts` | Normal move/snap sonucu → kopya sahnesi; kaynak override'larını atma |
| `src/lib/shortcuts/cloneDragGesture.ts` | Kaydedilmiş gesture binding'inden mode çözümü |
| `src/app/page.tsx` | Duplicate/quick/modal/context menü adapter'ları ve atomik seçim |

```ts
import { prepareCloneForest } from '@/lib/editor/commands-clone-forest'

const plan = prepareCloneForest(editor.getScene(), {
  sourceIds: selectedIds, mode: 'copy', duplicateAnimation: true,
})
const command = plan.atOffsets(Object.fromEntries(
  plan.sourceRootIds.map(id => [id, { x: 20, y: 20 }]),
))
editor.dispatchCommand(command)
```

`makeCloneForestCmd(scene, optionsWithOffsets)` aynı işin one-shot yüzeyidir.
`timelineIds` verilmezse tüm kaynak timeline'ları; boş liste verilirse hiçbir
timeline kopyalanmaz. `count` yeni occurrence sayısıdır. Her occurrence aynı
forest'ı kopyalar; `(i+1)*offset` yalnız köklere uygulanır.

Plan immutable source kayıtlarını ödünç alır, serializable clone şablonları ve
ayrılmış ID'leri tutar. Her move'da yeniden ID üretmez; commit/cancel/unmount
sonrasında plan referansı bırakılır. DOM/GPU/cache buffer'ları JSON veya history'ye
girmez. `EditorPointerSession` ortak transaction/capture/blur/Escape/pointercancel
ve kaynak conflict yaşam döngüsünü yönetir.

## Koordinat, zaman ve koruma

Normal viewport move/snap math'i dünya delta'sını her kökün parent inverse'iyle
çevirir. Copy adapter ofseti **yeni evaluated x/y − başlangıç evaluated x/y**
olarak bulur. Önceki hata evaluated pose'dan source fallback'i çıkartarak
animasyon farkını ikinci kez ekliyordu. Önizlemenin eski kaynak-ID override'ları
atılır; hem kaynak hem kopya renderer'da doğru yerde kalır.

Sıradan numeric x/y track'leri sabit parent-local farkla çevrilir. Key kimlikleri
kopya için yenidir; zaman, easing, tangent, modifier ve diğer metadata korunur.
Descendant kanallara kök farkı tekrar eklenmez. Reflected/nonuniform/animasyonlu
parent desteklenir. Sonraki zamanlarda fark aynı parent-local uzayda kalır;
hareket eden parent'a rağmen sabit world farkı olduğu iddia edilmez.

Procedural/modifier/multiplier/inline-motion kökü için controller input'una
sayı eklenmez. Sayısal Clone gerektiğinde adı görünür **Placement** parent'ı
oluşturur; kopyalanan kök onun altına girer, kaynak dış parent'ı korunur. Normal
key'li root'ta bu ek parent yoktur. Singular veya driven pose'un viewport'tan
drag'i mevcut transform capability diagnostic'iyle reddedilebilir.

Follow Path world-space path'i izlediği için dış path'e bağlı bir follower'ın
placement parent'ı hareketi iptal edebilir. Bu yüzden çevrilmiş kopya için
follower ve path aynı seçili subtree içinde olmalıdır; aksi halde tanıyla durur.
Sıfır ofset Copy kaynak bağlantısını koruyabilir. Global binding/parameter-wire
hedefi olan kaynaklar graph'ı sessizce düşürmek yerine reddedilir. Embedded
parametre referansları paylaşılır; scene trigger/state-machine ağları otomatik
çoğaltılmaz ve diagnostic ile bildirilir.

Typed remapper parent, mask, follow-path, repeater, particle area source/path ve
baked motion-trail group referanslarını tek forest old→new map'iyle çevirir.
Seçili kökler arası bağlantılar da iç referanstır. Forest dışı kaynaklar ve
asset/parameter ID'leri paylaşılır; arbitrary plugin string'leri ID sanılmaz.
Gelecekte yeni layer-reference alanı eklenirse remapper ve test genişletilmelidir.

Kaynak değişirse plan yeniden hazırlanır. Guard kaynak/instance-chain/ilgili
parent kayıtlarını, seçili timeline track/membership/saatlerini ve graph'ı izler;
yeni child veya ilgili timeline eski plana sessizce dahil edilmez. Execute reserved
ID çakışmasını ve güncel kaynak bütçesini tekrar denetler. Loaded proje ID'leriyle
çakışan sayaç değerleri atlanır. Undo yalnız yeni kayıtları çıkarır; redo aynı
ID'leri kullanır. Nonfinite sonuç, aşırı hierarchy ve expansion erken reddedilir.

Mevcut `makeCloneCmd` / `makeArrayCmd` tek-timeline public çağrı anlamı bu dilimde
değiştirilmedi. Legacy `CloneTreeResolver` aynı reference remapper'ı kullanır ve
BFS sırasını korur; cyclic ağaçta sonsuz döngüye girmez. V5 Array yeni forest
sözleşmesine ayrı geçiş yapacaktır. Yeni Copy API'si legacy clipboard paste'in
onarılmış olduğu anlamına gelmez. Editor dışındaki clone-lineage metadata'sı
kalıcı human/agent provenance değildir; E−1.2 ayrı kalır.

Mevcut büyük `page.tsx`/`SceneCanvas` dosyalarında yalnız entegrasyon değişti;
domain, gesture ve source sahipleri küçük feature modüllerindedir. Yeni tam
katman/renderer veya bağımlılık kurulmadı.

## Doğrulama

Unit kontrolleri forest/membership/ref/instance, farklı timeline'lardaki
key metadata'sı, root-only hareket, stable preview ID, undo/redo, stale kaynak,
finite/depth/workload ve portable save/load invariant'larını denetler.
Native fixture gerçek SceneCanvas/editor/history/keyboard/snap adapter'larını
kullanır; kullanıcının bağlı belgesini değiştirmez.

Tekrar:

```sh
npm run chorono -- stop --json
npm test
npm run mcp:build
npm run build
node scripts/perf/clone-interactions.mjs
node scripts/perf/serve.mjs artifacts/performance/clone-interactions-20261108/build 4332
```

Chrome'da `/clone-interactions.html` ve **Run clone checks**. Görünen rapor
source manifest/bundle hash içerir. **Open editable fixture** gerçek Cmd/Ctrl+D
kontrolü için layer/key sayısı ve parent haritası gösterir. Bu fixture tam
`page.tsx` dock'unu mount etmez; gerçek keyboard hook ve aynı public clone komutunu
kullanır. Önceki viewport ve motion-key kontrolleri ayrı regresyonlardır.

8 Kasım kabulü: **284 dosya/2261 test**, whole-project TypeScript, MCP ve Next
production build geçti. Chrome156/DPR1 yeni clone fixture **9/9**, önceki normal
viewport/pivot/path fixture **13/13** geçti. Gerçek Cmd+D ile key'li child subtree
3→5 layer, 7→12 key oldu; kaynak ve yeni child aynı `parent` altında, yeni
grandchild yeni child altında kaldı. Eski kaynaklar değişmedi. 367/356 source
hash'i ve görünür rapordaki bundle hash'leri diskle doğrulandı.

Yerel kanıt: `artifacts/performance/clone-interactions-20261108/verification.json`,
`clone-acceptance.json`, `viewport-acceptance.json`, `acceptance.ax.txt`,
`viewport-regression.ax.txt`, `real-keyboard.ax.txt`, `acceptance.png` ve `build/`.
Bu kabul yeni Four Seasons/512MiB genel ölçümü veya tam V6 değildir.

Çalışma dalı `codex/viewport-v4-duplicate-drag-copy`'dır. Bu dal, önceki turlardan
commit edilmemiş viewport/plan değişikliklerini de korur; main'e merge/push
yapılmış olduğu iddia edilmez. Main'deki mevcut yayımlanmış temel v0.2.0'dır.
