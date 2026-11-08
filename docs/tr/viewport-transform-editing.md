# Viewport transform düzenleme sözleşmesi

8 Kasım 2026. Kapsam: mevcut 2D/2.5D Select/Move/Rotate/Scale/Anchor ve
path/spline point araçlarının ilk doğruluk dilimi. Yeni motion-key çizimi,
subtree duplicate/array genişletmesi ve soft selection ayrı plan aşamalarıdır.

## Giriş noktaları ve veri akışı

| Sorumluluk | Sahibi |
| --- | --- |
| Atomik primary/çoklu seçim | `src/lib/selection/layerSelection.ts`, `src/app/page.tsx` |
| Güncel frame ile marquee/paint | `src/lib/selection/canvasShapes.ts`, `useSelectionTools` |
| Hover/click ortak group hedefi | `src/lib/selection/pickTarget.ts` |
| Evaluated root/matris/pivot snapshot | `src/lib/canvas/math/preparedTransforms.ts` |
| Seçim kutusu ölçek hesabı | `src/lib/canvas/math/selectionResize.ts` |
| Authored kaynağa yalnız değişen channel patch'i | `src/lib/canvas/math/sourceTransformChange.ts` |
| Pointer/capture/iptal yaşam döngüsü | `src/components/canvas/hooks/drag/CanvasDragSession.ts` |
| Pure transform / geometry preview | Aynı dizindeki `transformDragPreview.ts`, `geometryDragPreview.ts` |
| Source + key tek commit | `commitCanvasDrag.ts`, `src/lib/editor/viewportKeyframes.ts` |
| Seçili köklerde keyboard movement | `src/lib/editor/viewportNudge.ts`, merkezi `useKeyboard`/shortcut registry |
| Overlay ve başlangıç adapter'ı | `SceneCanvas`, `AffineSelectionFrame`, `PathEditOverlay`, `usePathEdit` |

Pointer-down → bağımsız seçili root'ları hazırla → gesture başlangıç snapshot'ı →
her move'u aynı başlangıçtan hesapla → scene preview + transient channel
overrides → son pointer-up örneğini hesapla → source ve gerekli key komutlarını
tek batch/undo olarak commit et → bütün listener/capture/override'ları bırak.

Parent ve child aynı anda seçilince yalnız root dönüştürülür; child'ın local
transform'u korunur. Child tek başına seçilince composition delta inverse parent
matrisiyle çevrilir. Farklı parent'lı root'lar aynı world hareketini alır.

## Koordinat ve pivot

Client/CSS px → canvas rect/pan/zoom → composition px → parent-local → layer-local
zinciri açık tutulur. DPR ayrıca ikinci kez çarpılmaz. Pan/layout değişirse
pointer'ın güncel world konumu okunur; geometri ilk snapshot'tan hesaplanır.

Single rotate görünür gerçek anchor'ı ve parent eksenlerini kullanır. Çoklu
rotate/axis-scale ortak world pivot kullanır; `Selection center` root pivot'larının
world bounding-box merkezidir, `Active object` aktif root'un pivot'udur. Görünen
ring/crosshair ve hesap aynı snapshot'ı paylaşır. Selection kutusu resize
tutamaçları karşı kenar/köşeyi pin'leyerek bütün root'ları ölçekler; tek nesnenin
size-resize'ı source size değiştirirken custom anchor'ı korur.

Sized layer çerçevesi tam affine quadrilateral'dir; parent rotation/nonuniform
scale/reflection hesaba katılır. Handle'lar screen px boyutunu korur. Group ve
vector sınırları canonical world bounds'tan gelir. Hover/click group promotion
aynıdır; deep-pick ayrıca yapılır. Primary seçili kümenin üyesi veya null'dır.

Legacy path anchor/handle'ları world koordinatta hit-test edilir, local koordinatta
değiştirilir. Yeni point eklemek custom pivot'u kendiliğinden merkezlemez.
Spline'ın var olan ID/topoloji/bağlı handle kuralları korunur.

## Animasyon ve history

Canvas bağlamında ok tuşları bütün seçili root'ları 1 composition px, Shift ile
10 px taşır. Timeline bağlamında Left/Right kare gezinmesi sürer. Keyboard edit
de aynı prepared transform/source-diff/key commit yolunu ve tek undo'yu kullanır;
input/select/IME, açık modal/menü, playback ve aktif drag authoring'i engeller.
Ortak seçim kutusunun tutamaçları bütün seçimi ölçekler; Shift/Ctrl/Meta uniform
ölçeği uygular. Source size'ları ve custom anchor'lar değiştirilmez.

Gesture sonucu evaluated başlangıçla karşılaştırılır. Değişmeyen animated
channel'ın görünen değeri authored fallback'e yazılmaz. `changedProperties`,
rendered 50 → authored 0 gibi source before/after eşitliğinin kaçıracağı kullanıcı
niyetini de taşır. History/source JSON'a runtime matris veya overlay buffer girmez.

Gerçek editör `buildLayerCommitCommands` ile transform source komutları ve key
komutlarını aynı transaction'a verir. Manual mevcut keyed kanalı günceller;
Auto yeni kanalı da key'ler. Mevcut key'in ID/easing/tangent/unknown metadata'sı
korunur. Yeni key linear'dır; diğer timestamp'ler/track'ler değiştirilmez.
Key zamanı evaluator'ın `computeLocalTime` fonksiyonuyla aynı saatten hesaplanır;
membership mevcut `ensureLayerInTimeline` üzerinden korunur.

Geometry-only ve Manual unkeyed source edit'i, sırf active timeline süresi sıfır
diye reddedilmez. Key yazılacaksa finite playhead ve pozitif süre gerekir.
Yakın ama farklı timestamp'li collision'da key silmek yerine işlem reddedilir.

Escape/pointercancel/lost capture/blur/unmount/scope değişimi preview'ı iptal
eder. Yanlış pointer ID'si source'u etkilemez. İkinci pointer-down yeni transaction
başlatamaz. Document değişince eski snapshot yeni sahnenin üstüne konmaz.
Araya source edit girdiyse `cancelTransaction({preserveScene:true})` yalnız stale
gesture'ı bırakır; yeni kullanıcı verisini geri almaz. No-op click history üretmez.

## Destek sınırları

- Legacy TRS'ye kayıpsız sığmayan world shear ve singular dönüşüm açık hata verir;
  yanlış bir yaklaşık transform commit edilmez.
- Controller/modifier/timewarp/follow-path/binding tarafından sürülen target pose
  input'a geri yazılmaz; ayrı Bake/Convert gerekir. Animated parent ve sıradan
  keyed transform desteklenir. Başka timeline'ın sürdürdüğü kanal sessizce yazılmaz.
- Static anchor'ı değiştirmek diğer animated pose'ları kaydırabilir. Tam animasyon
  compensation uygulanana kadar transform-key'li layer'da Anchor edit reddedilir;
  o anchor etrafında Rotate yapılabilir. Animated size için geometry-resize yerine
  ilgili timeline kanalı düzenlenir. Scale-to-zero resize transaction açmadan reddedilir.
- Copy/instance animasyon ve array davranışı bu doğruluk diliminde yeniden
  tanımlanmaz; önceki clone politikası ayrı V4/V5 işidir.
- Tam erişilebilirlik sertifikası veya bütün viewport backlog'unun kapanışı
  iddia edilmez. Klavye kapsamı, sayısal alternatifler ve çoklu seçim aynı
  sözleşmelere bağlı ilerletilir.

Etkileşim ölçütleri için [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/)
pointer kimliği/capture/cancel yaşam döngüsüne; [WCAG Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
ve [Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
klavye ve sürükleme gerektirmeyen alternatiflere referanstır. Editor pivot/selection
kuralları yukarıdaki ürün sözleşmesidir; test edilebilir invariant olarak korunur.

## Doğrulama ve tekrar çalıştırma

Unit/integration testleri ilgili math, selection, source/key transaction ve
gesture session sahipleri yanında tutulur. Gerçek tarayıcı fixture'ı
`src/components/canvas/render/__tests__/browser-viewport-interactions.tsx`, actual
`SceneCanvas`/editor/history/snap/evaluator kullanır; bağlı kullanıcı belgesine
ve yerel autosave projesine dokunmaz.

Next durdurulduktan sonra:

```sh
npm test
npm run mcp:build
npm run build
node scripts/perf/viewport-interactions.mjs
node scripts/perf/serve.mjs artifacts/performance/viewport-interactions-20261108/build 4329
```

Chrome'da `/viewport-interactions.html` açılıp `Run viewport checks` çalıştırılır.
Görünür rapor gerçek mounted handler sonuçlarını, source manifest/hash, DPR ve
scope'u kaydeder. Synthetic pointer dispatch, işletim sistemi düzeyinde mouse
girdisiyle aynı kapsam değildir; gerçek görüntü ve native drag ayrıca incelenir.
Build/QA dosyaları üretilen local artifact'tır, yeni production route değildir.

Bu dilim yeni Four Seasons 10-cycle performans kabulü değildir. Önceki 512 MiB
managed kaynak sınırı/heap/process ayrımı korunur; formal tam V6 ölçümü kendi
kabul aşamasında yapılır. Selected-frame index/bounds ve gesture snapshot'ı
yeniden kullanılır; move başına bütün scene JSON'ı deep-clone edilmez. Session
kapanınca source referansları, capture/listener ve transient previews bırakılır.

### Bu dilimin sonucu

- Full suite: **273 dosya / 2189 test** geçti. TypeScript no-emit, MCP build,
  CLI skill bundle ve Next production build geçti.
- Chrome kabulü: **13/13** mounted gerçek SceneCanvas etkileşim grubu geçti.
  Parent/child ve reflection/nonuniform parent; affine frame hizası; ortak/aktif
  pivot; keyed drag; bütün seçimi resize; keyboard root nudge; Shift toggle;
  cancel/ikinci pointer; singular resize/animated anchor ret; legacy path handle
  ve pivot koruması kapsandı. Bunlar bounded inline fixture'lardır.
- Aynı sayfada gerçek fareyle legacy path anchor'ı ayrıca taşındı: world bounds
  x=324→348, y=187→175; diğer anchor'lar ve bağlı handle hizası görselde korundu.
- Source manifest: **322 dosya**, test edilen bundle SHA-256
  `5bbb136641de368107bf4e0b9cefb4511e5352dadc46918e3225fafd2631de47`.
  Üretilen yerel kanıtlar `artifacts/performance/viewport-interactions-20261108/`
  altında `acceptance.json`, `acceptance.ax.txt`, `acceptance.png`,
  `native-drag.ax.txt`, `native-drag.png` ve build manifest'idir; script ile
  yeniden üretilebilir. Kullanıcının bağlı projesi bu testlere yüklenmedi.
