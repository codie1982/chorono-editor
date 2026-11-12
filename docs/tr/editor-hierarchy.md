# Ortak editör hiyerarşisi — E−1.3

10 Kasım 2026. Uygulandı. Scene Explorer ve ana Timeline aynı source parent/child
projeksiyonunu kullanır. Mevcut isimler, kimlikler, parent bağları ve elle yazılmış
animasyonlar otomatik yeniden düzenlenmez. MCP protokolü 2.1.0 ve scene formatı
aynıdır; yeni UI durumu scene JSON'a veya undo snapshot'larına yazılmaz.

## Kullanım

- Her iki panelde **Find selected**, seçili katmanların üst yollarını gösterir
  ve birincil seçime kaydırır. Filtreler, solo ve timeline üyeliği değiştirilmez.
  **Restore filters** geçici gösterimi kaldırır. Yeni seçim de istisnayı kapatır.
- Explorer/Layers kendi seçimini görünür tutar. Timeline seçimi yalnız vurgular;
  otomatik açma/kaydırma yapmaz. Layers başlığındaki **▤ Timeline** veya Timeline
  **Find selected**, seçili dalları ve animasyon satırlarını açık bir eylemle açar.
  Sonradan elle kaydırma/katlama, kare veya render tick'iyle geri alınmaz.
- **Expand/Collapse subtree**, bütün seçili dalların yerel panel katlamasını
  değiştirir. Timeline'daki ilk ok alt katmanları, ikinci ok yalnız katmanın
  kendi property satırlarını açar/kapatır. Bunlar source görünürlüğü değildir.
- **Show/Hide subtree** ve **More subtree actions… → Lock/Unlock, Solo/Clear
  solo, Freeze/Unfreeze** seçili kökler ve bütün source çocukları için çalışır.
  Sayaç filtrelenmiş/DOM'da kurulu satır sayısı değil gerçek source kapsamıdır.
  Karma önceki değerler, undefined/false ayrımı ve köken kaydı tek undo ile döner.
  Normal satır bayrağı yalnız o katmana; açıkça subtree etiketli eylem çocuklara
  uygulanır. Kilit/freeze kaldırma eylemleri korunan dallara erişilebilir kalır.
- Timeline **Selected branches** ve Dope Sheet **Selected Only**, çoklu seçimin
  alt ağaç birleşimini gösterir. Curve Editor sayısal eğrileri aynı kapsamdan
  alır; birden çok owner varsa lejantta katman adı da görünür. Yapısal üst
  satırların kendi, seçilmemiş key'leri bu kapsama eklenmez.
- Odaklanmış katman satırında Up/Down gezinir; Left kapatır/parent'a gider,
  Right açar/child'a gider; Enter/Space seçer, Shift/Cmd/Ctrl ekler. Gezinme
  kendiliğinden seçim yapmaz, sanallaştırma sınırında satır kurulup odaklanır.
  Dış seçim kaydırırken klavye odağı çalınmaz; iç input/button native kalır.

Timeline üyeliği ve audio yönlendirmesi korunur. Üye olmayan parent veya Find
sonucu bağlam satırı olabilir; onun timing/property/audio düzenleyicisi açılmaz
ve Find üyelik yazmaz. Kaynak visibility/lock/solo bayraklarının normal eylemleri
scene genelindeki source alanları olarak kalır. Hidden/inactive katmanlar,
üyeyseler, key düzenleme amacıyla ulaşılabilir kalır. Pin yalnız root sırasını
öne alır; child kendi parent'ından koparılmaz. Inspector/info satırları salt okunur.

## Sahiplik, veri akışı ve yaşam döngüsü

- `src/lib/scene/LayerIndex.ts`: tek yetkili lookup, ancestor ve subtree yürüyüşü.
  Borrowed immutable source snapshot; visited guard ve iteratif yürüyüş. Eksik
  parent/döngü view'da incelenebilir, source sessizce onarılmaz.
- `src/lib/scene/hierarchy/editorLayerRows.ts`: ortak parent-first/depth/sibling
  sıralama, match ancestor bağlamı, collapse ve açık reveal projeksiyonu.
  Source'un flat array sırası değişmese de child parent'tan sonra görünür.
- `src/lib/sceneExplorer/sceneExplorerModel.ts`: facet/visibility/solo eşleşmesi
  kesişimini projeksiyona verir; yalnız sonra ancestor bağlamı eklenir.
- `src/lib/timeline/hierarchy/timelineLayerRows.ts`: timeline üyeliği/audio/solo,
  search ve seçili dal birleşimini aynı projeksiyona adapte eder. Track'ler
  mevcut `LayerTrackIndex`ten ödünç alınır; kimlik/zaman/easing değiştirilmez.
- `src/lib/dope-sheet/hierarchy-builder.ts` ve `rows.ts`: aynı modelin property
  grupları ve özet key satırları. Derin ağaçta recursion yoktur; özet maliyeti
  gerçekten döndürülen ancestor–track bağlantılarıyla büyür, global cache yoktur.
- `src/components/layerHierarchy/`: ortak seçim/reveal, branch toolbar ve keyboard
  adaptörleri. Panel-local Set'ler/source index'leri unmount'ta bırakılır. Timer,
  worker, GPU kaynağı, kalıcı dense UI graph veya oynatma polling'i eklenmez.
- `useRowWindow`: mevcut sanallaştırma/ResizeObserver/scroll RAF sahipliğini korur.
  Reveal güncel içerik ofsetini ölçer; uzun section'ın header'ını görünür tutar.
  Açık keyboard isteğinin satırı aynı commit'te kurulup paint öncesi odaklanır;
  sonraki hızlı tuşun eski satırdan tekrar başlaması önlenir. SSR DOM işi yapmaz.
- `src/lib/editor/branches/SubtreeCommands.ts`: güncel committed source'ta scope
  çözer, değişen bayraklar için tek mevcut bulk command döndürür; no-op null'dır.
  `useEditorState` normal attribution/history sınırı aynen kullanılır.

Eski `useSceneExplorerBranches`, toolbar ve reveal import yolları ince uyumluluk
adaptörleridir; ikinci traversal/flag implementation'ı tutmaz. Büyük mevcut panel
fayllarında yalnız ilgili bağlantılar değişti; yeni domain/UI sorumlulukları kendi
küçük modüllerine ayrıldı. Tam panel refactor'u bu işin kapsamı değildir.

## Güvenli hierarchy düzenleme

`HierarchyCommands.ts` UI drag/drop için mevcut native move/group komutlarını
kullanır. UI reparent artık script Explorer'ın `assertStaticTransform` ve anchored
TRS converter'ıyla ortak `WorldPlacement.ts` kontrollerine bağlıdır. Static root
ve eski/yeni parent zinciri, world matrix'i sabit tutularak yeniden parent edilir;
alt çocukların yerel animasyon key'leri aynen kalır. Konum parent-local px,
rotasyon derece; anchor ve mevcut affine convention korunur.

Animated transform/controller/path/binding zinciri, inherited/subtree lock veya
freeze, cycle/missing parent, group olmayan hedef, singular matris (det < 1e-9),
shear (reconstruction residual > 1e-6) açıklamalı reddedilir. Otomatik key bake
veya yaklaşık dönüşüm yapılmaz. Aynı parent içindeki reorder transform dönüşümü
istemez; sibling grouping identity group kullanır. Farklı parent'ları otomatik
gruplamak dönüştürme gerektirdiğinden reddedilir. Bu UI sınırı, script'in açık
`keepWorld:false` veya eski düşük seviyeli local-space komut sözleşmesini değiştirmez.
Ungroup'un mevcut algoritması bu teslimde yeniden yazılmamıştır.

Örnek, tek source komutu:

```ts
const command = makeSetSubtreeFlagCmd(editor.getScene(), ['clock', 'labels'], 'hidden', true)
if (command) editor.dispatchCommand(command)
```

Index/command çağrılarında DOM satır ID'leriyle daraltma yapılmaz. UI komutu
current source'ta hazırlanır; world-preserving move eski bir layer/timeline
snapshot'ına uygulanırsa açıklamalı reddedilir. Undo/redo hazır scene snapshot'ını
ve human/agent alan kayıtlarını aynen geri yükler; portable save/load aynı veriyle
çalışır. Bütün mevcut layer/key/point ID'leri authoritative kalır.

## Doğrulama ve sınırlar

339 dosya / 2.713 test; TypeScript, MCP ve production build. 5.000 derinlik,
serialization sırası, döngü/orphan, pinned child, filtre/üyelik/audio/solo,
çoklu dal, gizli çocuklar, karma bayraklar, world matrix eşliği ve tam history/
portable round-trip sınandı. Script Explorer'ın eski güvenlik testleri de korunur.

İzole Chrome'da gerçek üretim panelleri ve gerçek editor/history ile 505 katmanlı
8 kabul maddesi geçti. Ek olarak eski Layers/Explorer reveal fixture'ı kullanılır.
`node scripts/perf/editor-hierarchy.mjs <output>` ve `node scripts/perf/serve.mjs
<output> 2013` ile hazırlanır; **Run hierarchy checks** çalıştırılır. Next yalnız
çalışmayan checkout'ta build edilir. Test ana editörün source'unu kullanmaz.

Yeni Set Key/transport/collision politikası E−1.4'tür. Bu teslim key ID/upsert
semantiğini veya export/ikinci optimizasyon sırasını değiştirmez. Kanıt ve mevcut
build uyarıları `artifacts/validation/editor-hierarchy-20261110/` altındadır.

10 Kasım takip düzenlemesi: açık Timeline reveal ve geçici subtree isolation
[Layer focus sözleşmesinde](layer-focus.md) tanımlıdır. E−1.3 otomatik Timeline
reveal davranışı kullanıcının yeni tercihine göre düğmeye taşındı.
