# V5 — Çoklu seçim ve alt ağaçlarla Array

8 Kasım 2026. V5'in uygulama ve bakım sözleşmesi. Çalışma dalı
`codex/viewport-v4-duplicate-drag-copy`; bağımsız 3D modu veya yeni simülasyon yoktur.

## Kullanım ve davranış

Nesneleri seçip **Array** açın (Cmd/Ctrl+Shift+A veya mevcut Array menüsü).
Seçim parent+child içerirse parent'ın ağacı yalnız bir kez çoğalır. Bağımsız
kökler her occurrence'ta aynı küme olarak taşınır; her child ayrı occurrence
sayılmaz. Kaynak nesneler, parent'ları ve key kayıtları korunur.

- **Linear/Grid/Radial/Path:** mevcut çözücüler ortak frame adapter'ıyla kullanılır.
- **Source policy:** Include source için N toplam görünüm ve N−1 yeni occurrence;
  Clone source too için N yeni occurrence. İkinci politikada index0 kaynakla
  aynı yerde bir kopya oluşturabilir; bu açık tercihtir.
- **Space:** World, aktif kökün Parent'ı veya Local'i. **Pivot:** selection center
  veya active root pivot. Seçilmiş child'ın aktif kökü normalizasyonla bulunur.
- **Linear** step/total move, rotation ve scale; **Grid** iki spacing/stagger;
  **Radial** center/radius/arc/orientation; **Path** Bezier path/offset/normal ve
  tangent seçenekleri bulunur. Sayısal alanlar handle'larla aynı ayarları değiştirir.
- Viewport'ta Linear move, Grid row/column ve Radial center handle'ları vardır;
  ok tuşları 1px, Shift+oklar10px; pointer Shift eksen kilidi. Path kaynağı seçiciden
  alınır. Path'te spline/shape türleri bu sürümde destekleniyormuş gibi sunulmaz.
- Kontroller açıkken pan/zoom mümkündür. Önizleme kaynak/history'yi değiştirmeyen
  sınırlı wireframe sınır çizgileridir; tam raster/efekt önizlemesi değildir.
- **Apply** hesaplanmış planın tek cached komutunu uygular, yeni kökleri birlikte
  seçer ve tek undo oluşturur. Undo/redo aynı layer/key ID'lerini korur.
- **Cancel/Escape/dışarı tıklama** preview'ı bırakır; sahnede geçici kopya kalmaz.
  Stale kaynak veya geçersiz ayarda Apply kapanmaz/çalışmaz, açıklama görünür.

Özet paneli seçili kök, subtree layer, occurrence, gerçek yeni layer ve key
sayılarını ayrı gösterir. Rotation/scale için gereken Placement grupları layer
maliyetine dahildir. Preview kesilmişse Apply'ın tüm kabul edilmiş occurrence'ları
uygulayacağı belirtilir; kaynak veya nihai kopya sayısı sessizce azaltılmaz.

## Public giriş ve sorumluluklar

| Sahip | Sözleşme |
| --- | --- |
| `src/lib/editor/commands-array-forest.ts` | `prepareArrayForest`, preflight, kaynak guard, özet ve lazy command |
| `src/lib/array/ArrayForestMath.ts` | Dört solver için ortak pivot/world/parent/local matrix adapter'ı |
| `src/lib/array/ArrayForestPreview.ts` | Ötelenmiş source frame ve bounded root outlines |
| `src/lib/editor/commands-clone-forest.ts` | V4'ün aynı authoritative forest/ID/ref/undo sahibi; yeni `atPlacements` |
| `src/lib/clone/CloneForestTiming.ts` | Key/clip zaman ofseti ve kayıpsız aralık kontrolü |
| `src/lib/clone/CloneCapabilities.ts` | V4/V5 ortak Instance preflight; yeni ID/clone ayırmadan destek kontrolü |
| `src/lib/clone/CloneWorkload.ts` | Ortak source expansion; wrapper'lar için exact total maliyeti |
| `src/components/array/useArrayAuthoring.ts` | Source/document/time/selection scope ve Apply/Cancel sahipliği |
| `src/components/array/` | Alanlar, özet/miniature, viewport overlay ve transient handle adapter'ı |
| `src/components/modals/ArrayModal.tsx` | Viewport'la beraber çalışan floating kontroller ve odak/dismissal |

```ts
import { prepareArrayForest } from '@/lib/editor/commands-array-forest'
import { defaultLinearArraySettings } from '@/lib/array/ArrayTypes'

const plan = prepareArrayForest(editor.getScene(), {
  sourceIds: selectedIds, primaryId: activeId, timeMs: playheadMs,
  settings: { ...defaultLinearArraySettings(), count: 3 },
})
// plan.preview ve plan.summary salt okunur düzenleme verisidir.
plan.assertCurrent(editor.getScene())
editor.dispatchCommand(plan.buildCommand())
```

Plan bir immutable source snapshot'ını ödünç alır. Solver kayıtları ve sınırlı
outline'lar geçicidir. Gerçek clone source payload'ları ve ID'ler yalnız
`buildCommand()` çağrısında V4 üzerinden hazırlanır; tekrar çağrı aynı komutu döner.
Cancel plan referansını bırakır. Binlerce clone editör preview/history'sine yazılmaz.
Yeni kopyalama algoritması, ikinci evaluator veya ayrı undo sistemi oluşturulmadı.

## Koordinat ve animasyon kuralları

World/Parent/Local, araç açıldığı authoring frame'inde sabitlenen referans
matrisleridir. Bütün köklere tek occurrence dönüşümü uygulanır; her kökün parent
inverse'i ile mevcut parent-space'e çevrilir. Sonraki animasyon kendi parent
uzayında devam eder; ileride hareket eden parent'ı sürekli dengeleyen world
constraint olduğu iddia edilmez.

Sıradan translation V4'ün root-only numeric x/y key kaydırmasını kullanır.
Rotation/scale animated source kanallarını değiştirmek yerine açık Placement
parent'ları kullanır. Yeni bir placement nonuniform parent altında shear
gerektiriyorsa mevcut TRS bunu kayıpsız temsil edemediği için Apply reddedilir.
Singular/nonfinite matrisler ve aşırı hierarchy için de diagnostic verilir.

Path Array kaynağı authoring zamanında materialize edilir; anchors ve absolute
Bezier handle'ları full parent/rotation/scale/anchor matrisiyle seçilen referans
uzayına çevrilir. Arc length ve normal offset o uzayın birimlerindedir. Ortak
`transformBezierPath` eski viewport path edit adapter'ıyla da paylaşılır; geometri
flatten edilmez veya zoom değişince yeniden kaynak topoloji oluşturulmaz.

Animasyon açıksa bütün ilgili timeline'lar ve membership, key metadata'sı ve iç
parent/mask/follow/repeater/particle/baked-trail referansları V4 üzerinden korunur.
Her occurrence için `index*timeOffsetMs` key ve açık clip sınırlarına eklenir.
Timeline/composition süresini aşarsa key/clip kesilmez, süre otomatik uzatılmaz;
kullanıcı süreyi artırmalı veya ofseti azaltmalıdır. Zaman bağımlı controller,
modifier/time-warp clock'larını yalnız key zamanını kaydırmakla aynı şekilde
ötelemek mümkün olmadığından bu durumda explicit Bake diagnostic'i verilir.

Zaman ofsetli preview, clone ayırmadan seçili source track'lerinin ötelenmiş
frame'ini canonical evaluator ile örnekler; dış parent track'leri normal saatinde
kalır. Animasyon kopyalama kapalıysa kaynak fallback değerleri kullanılır;
mevcut görünen pose'un otomatik bake edildiği iddia edilmez.

Kaynak/parent/path/timeline/ilgili composition veya document/time/selection
değişiminde plan stale olur. UI değişikliği saklayıp eski planı yeni kaynak üstüne
uygulamaz. Kayıt/undo/redo kaynak command sahibi üzerindedir; yoğun frame buffer,
DOM ve GPU nesneleri scene JSON'a girmez.

## Bütçe, destek ve uyumluluk

Kabul edilen kaynak sınırları ortak 5000 layer/50000 key bütçesidir. Her subtree,
occurrence ve exact Placement group toplamı allocation öncesi sayılır; Execute
güncel bütçeyi/ID çakışmasını tekrar kontrol eder. Preview en fazla128 occurrence,
2048 root outline ve 200k shifted source-key ziyaret bütçesine sahiptir.

Binding/wire kaynakları, dış Follow Path placement bağımlılıkları, desteklenmeyen
Instance iç referansları ve kayıplı transform'lar V4 diagnostic'lerini korur.
Bu araç gerçek editable Copy/Instance forest üretir. Procedural Repeater
dönüşümü burada açıkça kapalıdır; fiziksel preview gösterip başka recipe uygulamaz.
Legacy tek-kaynak Repeater/domain/MCP desteği değişmedi. Eski `makeArrayCmd` ve
script/MCP flat options'ın tek-timeline anlamı bu sürümde değiştirilmedi;
bu UI'ya eklenen seçenekler yeni MCP yöntemi varmış gibi belgelenmez.

## Aynı turdaki sürükleme düzeltmeleri

Alt+sürükleme kayıtlı Copy alias'ı olarak eklendi; Cmd/Ctrl Copy ve Cmd/Ctrl+Shift
Instance korundu. Mode yalnız pointer-down'da sabitlenir; tuşun mouse-up'tan
önce bırakılması gerekmez. Body drag browser default davranışını önler.
Zaten seçili bir child'ın üstünden body drag/hover, onu üst gruba yükseltmez;
aynı seçim subtree'si korunur. Yeni seçimden ilk sürükleme ve ayrı timeline'da
animated parent durumları gerçek key-command adapter'ıyla test edilir.

Ölçü etiketi düzenleme ve ruler/guide araçları [kullanıcının seçtiği sonraki
iştir](plans/viewport-layout-measurement-plan.md); bu teslimle uygulanmış sayılmaz.

## Doğrulama ve tekrar

Unit testler dört pattern/space/pivot/count, forest/animasyon/reference, exact
preview frame, kaynak guard, kapasiteler, time offset, controller ve shear
reddi, tek undo/redo ve portable round-trip invariant'larını kontrol eder.
Native fixture gerçek ArrayModal/useArrayAuthoring/SceneCanvas kullanır.

```sh
npm run chorono -- stop --json
npm test
npm run mcp:build
npm run build
node scripts/perf/array-interactions.mjs
node scripts/perf/serve.mjs artifacts/performance/array-interactions-20261108/build 4333
```

Chrome'da `/array-interactions.html` ve **Run array checks** kullanılır. Actual
native pointer/keyboard, programatik UI event ve tam editör kaynağının ölçümü
ayrı kanıtlardır. Bağlı kullanıcı belgesi değiştirilmez. Bu dilim yeni Four
Seasons/512MiB benchmark'ı veya tam V6 değildir.

Kabul: **289 dosya/2281 test**, whole-project TypeScript, MCP ve production
Next build geçti. Chrome156/DPR1'de Array15/15, clone/ilk-drag/modifier14/14 ve
viewport13/13 kontrolü geçti. Üç bundle'ın 382/375/363 source hash'i ve görünür
raporların bundle hash'i doğrulandı. Gerçek fareyle move handle `(140,0)`'dan
`(164,12)`'ye değişti; Apply6→12 layer ve7→17 key üretti, Undo6/7'ye döndü,
Redo12/17'yi ve aynı parent/ID düzenini geri getirdi.

Yerel kanıt dizini `artifacts/performance/array-interactions-20261108/` altında
`verification.json`, `array-acceptance.json`, `clone-acceptance.json`,
`viewport-acceptance.json`, ham AX raporları, `real-handle/apply/undo/redo.ax.txt`,
`preview.png`, `acceptance.png` ve `build/` source manifest'leridir. Bu dosyalar
üretilen yerel kanıttır ve git tarafından ignore edilir.
