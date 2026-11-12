# Viewport — komşu mesafeleri, cetvel ve kalıcı guide'lar

8 Kasım 2026. V5 sonrası kullanıcının seçtiği sıradaki araç dilimi. Bağımsız
render, seçim veya undo motoru oluşturulmaz; mevcut geometri, transform,
keyframe ve editör komut sahipleri genişletilir. UI dili İngilizcedir.

9 Kasım güncellemesi: [ortak mouse-up düzeltmesi, sabit footer, fare noktası ve
kompozisyon dışı kesikli nesne sınırları](viewport-interaction-polish.md)
uygulandı. Aşağıdaki ilk kabul sonuçlarına ek doğrulama o belgededir.

## Komşu ölçüleri ve sayısal düzenleme

İki veya daha fazla nesne seçildiğinde yatay/dikey yakın komşuların kenar
boşlukları görünür. Yatay komşuların y aralıkları, dikey komşuların x aralıkları
örtüşmelidir. Köşe teması veya çapraz nesne çiftleri ölçü üretmez. Her nesne
her yönde en yakın uygun komşuyu seçer; aynı çift iki kez çizilmez. Üç nesneli
bir sırada iki aralık gösterilir. Solda üç üst üste ve orta sağda bir nesne
örneği iki düşey ve bir yatay aralık üretir.

Ölçü etiketi düğmedir. Tıklayın veya klavyeyle odaklanıp açın; **Gap (px)**
değerini girip **Apply** veya Enter kullanın. **Cancel/Escape** kaynak değişmeden
kapatır. Etiket, input ve düğmeler katman seçimini değiştirmez. Aktif nesne
çiftin içindeyse sabit kalır; değilse soldaki/üstteki sabittir. Panel **Fixed**
ve **Moving** adlarını gösterir. Yalnız karşı kök hareket eder; seçimin tamamına
zincir dağıtımı veya soft selection uygulanmaz.

Değerler composition pixel biriminde, seçili nesnelerin değerlendirilmiş,
eksenlere hizalı geometri sınırları arasındadır. Stroke, blur ve gölge taşması
ölçüye dahil değildir. Dönmüş/oval şekillerde en kısa polygon mesafesi olduğu
iddia edilmez. Eksi değer örtüşmedir ve etikette **overlap** görünür. Çiftin
merkez sırasını ters çevirecek bir değer reddedilir; önce doğrudan taşıyın.
**View → Show selection gaps** yalnız bu overlay'i gizler.

Parent+child aynı seçimdeyse ortak kök bir kez ölçülür ve taşınır. Delta,
`preparedTransforms` üzerinden ilgili parent inverse'i ile dönüştürülür.
`sourceTransformChange` yalnız değişen x/y kanallarını kaynak veriye yazar;
viewport'un `buildViewportKeyframeCommands` adapter'ı mevcut key kimliğini,
easing/tangent/diğer key'leri korur. Layer ve key komutları **Edit selection
gap** adlı tek undo'da uygulanır. Başka timeline'da animasyon, kilit/freeze,
driven channel veya singular parent aynı viewport tanılarıyla durur.

Input açıldığı kaynak scene, document signal, seçim ve playhead sabitlenir.
Arada elle değişiklik veya belge/zaman/seçim değişikliği olursa Apply devre dışı
kalır. İptal edip güncel etiketi açın; eski ölçü güncel sahne üstüne yazılmaz.
Input değişimi yalnız yerel UI state'idir; Apply öncesi kaynak preview'i yoktur.

## Cetvel ve guide kullanımı

Cetvel ve imleç çizgileri aynı canvas DOM rect/composition koordinatlarını
kullanır. Pan/zoom ve DPR değişiklikleri ikinci bir koordinat sistemi oluşturmaz.
İmleç viewport'tan ayrılınca geçici çizgiler kalkar. Idle'da sürekli animasyon
veya render döngüsü açılmaz; pointer ve resize olayları güncellemeyi tetikler.

Üstteki x cetveline tıklamak o x'te **dikey**, soldaki y cetveline tıklamak o
y'de **yatay** guide oluşturur. Cetvel sürüklemesi aynı eksenin konumunu
değiştirir. Bu eşleme cetvel başlıklarında yazılıdır. Sayısal guide kontrolleri
fare sürüklemeye alternatiftir. Guide seçimi, konum düzenleme, taşıma, kilit,
gizleme ve silme kaynak komutlarından geçer; katman seçimini değiştirmez.
**View → Show guides** görünürlüğü; **Snap → Guides** yakalamayı kontrol eder.

Guide'lar export edilen çizim değildir. Editor-only `scene.editorGuides`
metadata'sında `{version:1,guides:[{id,axis:'v'|'h',position,locked?,hidden?}]}`
olarak kalıcıdır. Konumlar composition pixel biriminde, sonlu ve negatif
olabilir; canvas dışına guide yerleştirmek geçerlidir. Mutlak konum sınırı
10.000.000 px, sahne başına sınır 1.000 guide'dır. Her ID benzersizdir.
Legacy sahnede alanın olmaması boş guide listesi anlamına gelir.

Portable/editable JSON guide kaynak verisini korur; parse ve MCP scene
doğrulaması sürüm/ID/axis/sonlu konumu kontrol eder. Runtime/nihai renderer
editor guide metadata'sını çizmez. MCP'de yeni guide authoring yöntemi
eklenmedi; `get_scene` kaynak verisini okuyan veya scene JSON'unu değiştiren
istemciler mevcut `editorGuides` alanını diğer manuel düzenlemeler gibi korur.

## Sorumluluklar ve yaşam döngüsü

| Public giriş / sahip | İş |
| --- | --- |
| `src/lib/selection/selectionRoots.ts` | Transform ve ölçüler için aynı parent+child kök normalizasyonu |
| `src/lib/geometry/layout/selectionNeighbors.ts` | Saf, kararlı, çiftleri tekilleştiren yakın komşu AABB hesabı |
| `src/lib/editor/selectionGaps.ts` | Bir frame'in ölçü planı, sabit/hareketli kök, source guard ve kaynak kanal niyeti |
| `src/components/canvas/layout/useSelectionMeasurements.ts` | Input scope, stale kontrolü, ortak layer/key komutları ve tek undo |
| `src/components/canvas/layout/SelectionMeasurementsOverlay.tsx` | Zoomed overlay, erişilebilir etiketler ve sayısal panel |
| `src/components/canvas/guides/CanvasGuideWorkspace.tsx` | Cetvel/guide etkileşiminin React adapter'ı |
| `src/lib/geometry/guides/` | Serializable guide verisi, doğrulama ve snap adapter'ı |
| `src/lib/editor/guides/` | Guide source değişiklikleri ve undo komutları |

```ts
import { prepareSelectionGaps } from '@/lib/editor/selectionGaps'

const source = editor.getScene()
const plan = prepareSelectionGaps(source, selectedIds, timeMs, overrides, activeId)
const gap = plan.gaps[0]
if (gap) {
  plan.assertCurrent(editor.getScene())
  const changes = plan.edit(gap.id, 24)
  // changes salt kaynak patch + kanal niyetidir. Viewport adapter'ı bunları
  // layer ve key komutlarıyla birleştirip tek undo olarak uygular.
}
```

Planlar ve DOM rect/preview bilgisi çalışma zamanına aittir; ordinary scene JSON
ve undo'ya yoğun frame/DOM/GPU nesnesi yazılmaz. Ölçü hesabı en fazla **256 bağımsız
kök**, overlay **128 kesin çift** kabul eder. Daha büyük kök seçimi yanlış bir
kısmi komşuluk üretmez; tanı gösterir. Çift sınırına ulaşıldığında hesaplanmış
sonuçların bir kısmı çizilmez ve bu görünürdür. Kaynak nesneler silinmez veya
LOD ile ölçüden çıkarılmaz. Küçük seçim için bounded O(n²) hesap kullanılır;
zamandan bağımsız sonsuz cache yoktur.

## Doğrulama

Domain testleri dört nesneli düzen, üçlü sıra, çapraz/köşe teması, örtüşme,
yansımalı/dönmüş/nonuniform parent, parent+child kökleri, lock/stale ve bounded
seçim davranışlarını kontrol eder. Mevcut viewport transform ve nudge testleri
ortak root helper değişikliğinde tekrar çalıştırılır. Native fixture gerçek
`SceneCanvas`, editor/history ve viewport key-command adapter'ını kullanır;
değerleri aynı solver'la tekrar hesaplayıp testin yerine koymaz.

Yerel tekrar girişleri `scripts/perf/layout-interactions.mjs` ve
`browser-layout-interactions.tsx`'tir. Bunlar bağlı kullanıcının belgesini
değiştirmeyen ayrı QA sayfası üretir. Sunucuyu durdurduktan sonra `npm test`,
`npm run mcp:build`, `npm run build` ve native fixture hazırlığı çalıştırılır.
Bu dilim tam V6, yeni Four Seasons benchmark'ı veya genel son optimizasyon
kabulü değildir.

Kabul sonucu: **293 test dosyası / 2301 test**, TypeScript, MCP ve production
build geçti. Chrome 156/DPR 1'de ölçü/guide **14/14**, son kaynaklarla Array
**15/15**, clone/ilk sürükleme/modifier **14/14**, eski viewport **13/13** geçti.
Ruler/guide konumu zoom/pan sonrasında yeni pointer olayı beklemeden doğrulandı.
Stale guide başlangıcı ve 3 CSS px geniş tıklama ofseti de gerçek pointer
transaction'larıyla kontrol edildi.

Gerçek UI'da boşluk 170→240 px yapıldı; dört seçili katman korundu, Undo/Redo
sağdaki nesnenin x'ini 420→350→420 getirdi. Cetvelden iki eksen guide üretildi;
dikey guide x=330 ve kilitli, yatay guide y=300 olarak düzenlendi. Bağlı
kullanıcının projesi değiştirilmedi. Kanıtlar yerel
`artifacts/performance/layout-interactions-20261108/` altında `verification.json`,
dört `*-acceptance.json`, raw AX kayıtları, source manifest kopyaları ve
`acceptance.png` olarak saklanır. Dört raporun source/bundle/CSS hash'leri diskteki
son kaynaklarla karşılaştırıldı; bu üretilen kanıtlar git tarafından ignore edilir.
