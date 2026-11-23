# Canlı Outline — uygulanan kaynak düzenleme sözleşmesi

23 Kasım 2026. `liveOutline` kayıt türü, kaynak çizgiyi koruyan Outline'dır.
Eski `outline` ve `strokeToPath` kayıtlarının kalıcı/geometri üretme anlamı
korunur. Dosya açılırken otomatik tür değiştirme veya bake yapılmaz.

## Kullanıcı akışı

- Tek spline seçin. Edit dışında **+ Add modifiers → Outline** veya Edit'te
  **Object / bütün Object kenarları → Outline · Live → Preview → Apply Outline**.
  Native Apply bir canlı kayıt ekler veya mevcut kaydı güncelleyip etkinleştirir;
  kaynak kenarlarını silmez, ayrı bir Line/Object/layer oluşturmaz.
- Kaynak point/handle/segment/Object kimlikleri korunur. `1`/`2`/`3` kaynak
  geometrisini düzenler. Nokta/kol taşıma, Edit transformu ve Refine/Add Vertex
  mevcut native komut/transaction yolunu kullanır; sonuç bant otomatik hesaplanır.
  Her hareket kendi Undo adımıdır. Layer TRS ve gerçek origin aynı kalır.
- Edit'te **Show source line** güncel kaynak kılavuzunu açıp kapatır. Bu UI
  tercihi source/paint/Undo'ya yazılmaz ve PNG/SVG'ye girmez. Point kontrolleri
  kullanılabilir kalır. Kaynak kılavuzu mevcut sabit edit-başlangıcı ghost'u
  değildir; ghost sürükleme sırasında değişmez. Bant sınırı ayrıca hafif turuncu
  çizilir. Edit dışındaki normal seçim çerçevesi değerlendirilen bandı kapsar.
- **Outline enabled** kalıcı aç/kapat ayarıdır. Off, aynı orijinal kaynak çizgiyi
  normal görünümüne döndürür; On güncel kaynak üzerinden bandı tekrar oluşturur.
- **Bake Outline / Stroke to Path** veya **Bake stack** açık kalıcı dönüşümdür.
  Ancak bu komut bant sınırlarını gerçek edit vertex'leri yapar. Tek Undo eski
  kaynak+ayarları geri getirir. Genel Bake artık authoring kaynağını değil,
  değerlendirilmiş son geometriyi materialize eder.
- Fill/Stroke/gradient/pattern/alpha Properties'te kalır. Live bant boya hedefi
  aynı kaynak Object ID'sidir. `splinePaintOverrides` kaynak noktalarını değiştirmeden
  bağımsız bant boyasını taşır; kaynak stroke'u varsayılan band fill'idir.
- Native Apply seçim gerektirir; boş seçim bütün layer'a genişlemez. Daha önceki
  hedefler native Apply ile korunur; tek kaydın sayısal ayarları hedefler arasında
  ortaktır. Modifier chooser'ın varsayılanı bütün uygun stage-input Objects'tir.

## Kaynak ile frame sonucu

`ModifierStackService.execute` authoring komut adaptörüdür: önce bütün stack'i
hesaplar/doğrular; kabul edilmiş `sourceEditing:'inputSpline'` sahibi varsa
kaydedilen Layer.spline alanında o adımın INPUT spline'ını tutar. Dense bant
sınırları bu yeni authoring katmanına veya her Undo kaydına yazılmaz.

`projectModifierLayer` / `withGeometry` mevcut frame/output adaptörüdür:
stack'ten son bandı üretir, normal render geometry alanlarına yerleştirir ve
frame'de stack metadata'sını kaldırır. Renderer, world bounds/picking, instance
çözümü, runtime compiler ve SVG/PNG aynı değerlendirilmiş sonucu kullanır.
Layer ve logical Object sayısı değişmez; üretilmiş boundary point/contour ID'leri
mevcut `stableModifierSpline` namespace sözleşmesini kullanır.

`sourceEditing` mevcut `preservesSourceEditing` ile aynı değildir. İkinci alan
sonuç vertex'lerinin kaynakla aynı kimlikte olduğunu söyler; Outline'ın kaynak
vertex'leri ve generated boundary vertex'leri farklıdır.

`src/lib/modifiers/sourceEditing.ts` tek admission sahibidir:

- bir stack'te tek input-editing sahibi;
- etkin sahibi takip eden başka etkin geometri adımı yok;
- yalnız source-preserving Convert Spline prefix'i veya doğrudan Spline source;
- devre dışı diğer satırlar mevcut düzenleme bağını bozmaz;
- başka etkin topology modifier'ı varsa genel readonly politikası sürer.

Bu nedenle üretilmiş ara noktalar kaynağa aitmiş gibi düzenlenmez. Yeni Outline
başka bir üretici arkasında eklense bile belirsiz kaynak Edit izni kazanmaz.
Sıralama/toggle/çıkarma normal stack değerlendirmesini kullanır.

## Native komutlar ve topoloji

`reconcileModifierLayerPatch` uygun source editlerini `withEditedInputSpline`
ile base Spline'a veya son Convert Spline authored override'ına yazar; türetilmiş
bandı source'a geri kaydetmez. Önceden Spline olan bir base'de de varsa conversion
`edited` sahibi güncellenir. Kilit/driver/ancestor/transaction kontrolleri korunur.

`prepareLiveSplineOutline` mevcut worker preview ve CAS modifier komutlarını
birleştirir. Worker sonucu yalnız geçici overlay'dir; Apply kaynağa geometri
kopyalamaz. Settings ile enable tek komutta güncellenir. API genişletmeleri:

- `prepareAddModifier(..., initialSettings?)`: ilk ayarları atomik kurar;
- `makeExecuteModifierStackCmd(..., options?:{enableIds?})`: yalnız açıkça
  belirtilmiş sahipleri aynı Undo'da etkinleştirir;
- eski argümanlar ve varsayılan Execute enabled davranışı değişmez;
- eski `prepareSplineBand` kalıcı dönüşüm API'si korunur; yeni native panel
  source-following `prepareLiveSplineOutline` kullanır.

Object hedefleri hareket/Refine sırasında eski topology hash'i ile kilitlenmez;
aynı stable Object ID izlenir. Silinen hedef kimliği başka objeye veya tüm source'a
bağlanmaz. Genel geometry-reference guard, saklanan stack source ve conversion
control override'larını dış okuyucu sanmaz. Live-owned Object hedefleri ve paint
map'i yönetilen sahipliktir; gerçek wire/expression/controller ve diğer modifier
hedef referansları hâlâ kaldırılan geometriyi korur.

Portable load, authoring Layer.spline ile gerçek editable input'un eşleşmesini
kontrol eder; eski evaluated snapshot'ı source gibi açmaz. Eski formatların
önceki snapshot kuralları değiştirilmez. Clone source/recipe'yi korur; runtime
compiler yalnız değerlendirilen normal bandı taşır.

## Hesap, yaşam döngüsü ve sınırlar

`LiveOutlineModifier` aynı `SplineBandBackend`, arc sampler, offset joins ve
Boolean temizliğini kullanır. Yeni solver/runner yoktur. Yerel px, sabit toplam
width, açıkta Center/Left/Right, kapalıda Inside/Outside, cap/join/dash/delik ve
bounded polyline sınırları [bant sözleşmesindeki](spline-outline-band.md) gibidir.
Bézier fitting ve modifier-parametre animasyonu bu teslimin kapsamı değildir.

Native ayar önizlemesi mevcut `SplineBandWorkerClient` / abort/deadline kuyruğunu
kullanır. Seçim/mod/zaman/source/document değişimi geç sonucu iptal eder. Kaynak
sürüklemesinin değerlendirmesi mevcut statik stack'in bounded senkron yoludur;
az önceki bandın snapshot'ı kaynak diye kullanılmaz. Frame geometry cache'i
mevcut 8 weak-source / 16 MiB sınırını korur; ek per-frame history oluşturulmaz.
Kaynak düzenlemesi geçersiz band oluşturursa mevcut atomik komut tanıyla reddeder;
önceki geçerli source/edit durumu kalır. Animasyonla sürülen spline koordinatları
static modifier admission kapsamı dışında kalır; outer paint/TRS animasyonu aynı.

Canlı native Edge hedefi ilk teslimde **her seçili Object'in bütün contour'larını**
gerektirir. Kısmi zincirin split/delete hedef remap'i tamamlanmadı; panel/menü
nedenini gösterip devre dışı bırakır. Source Object ID'sini değiştiren toplu
replace/import işlemleri açık yeniden hedefleme ister; sessiz kapsam genişletme
olmaz. Eski baked/bağımsız bantlardan merkez çizgisi tahmin edilmez; bu kayıtlar
eski sözleşmesinde kalır.

## Giriş noktaları ve doğrulama

- Saf evaluated strateji: `src/lib/modifiers/spline/LiveOutlineModifier.ts`.
- Admission/source writer: `src/lib/modifiers/sourceEditing.ts`.
- Native plan: `src/lib/editor/spline/band/liveOutlinePlan.ts`.
- Panel/session: `useSplineBand`, `SplineLiveOutlineControls`.
- Overlay: SceneCanvas source Layer'ını `SplineEditOverlay`'e, evaluated Layer'ı
  `GeometryEditGhost`/render'a verir. Source guide görünürlüğü controller UI state'idir.

Minimal mevcut komut kullanımı:

```ts
const plan = prepareAddModifier(scene, layer.id, 'liveOutline', undefined,
  { ...defaultBandDraft(), widthPx: 20 })
const authored = plan.command.execute(scene) // aynı kaynak noktaları
const display = projectModifierLayer(authored.layers[0], true) // kapalı bant
```

11 domain integration testi source kimlikleri, point/handle edit, conversion
owner'ı, Refine/delete scope, readonly sınırı, driver/kilit, stale portable data,
paint/clone/runtime/SVG ve atomik native recipe güncellemesini kapsar. Gerçek
Chrome'da 10 kabul grubu; pointer point/Bezier drag, sabit ghost, guide toggle,
Off/On, Bake/Undo, Edge Add Vertex, partial-chain admission, context menu,
Edit dışı modifier ve dışa aktarılmış PNG/SVG görsel kontrol edildi.

```sh
node scripts/perf/spline-band.mjs /tmp/chorono-live-outline-qa
node scripts/perf/serve.mjs /tmp/chorono-live-outline-qa 2021
# spline-band.html?autorun
```
