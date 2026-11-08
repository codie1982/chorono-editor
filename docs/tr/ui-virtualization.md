# Editör listelerinde satır sanallaştırması

Bu dilim timeline, dope sheet, Scene Explorer, eski Layers paneli ve medya
envanterinin DOM çalışma kümesini sınırlar. Kaynak katman, track, keyframe, asset
ve undo verisi korunur. Render culling, LOD veya decoded medya eviction'ı değildir.

## Girişler ve sorumluluklar

- `src/lib/editor/virtualization/RowLayout.ts`: React/DOM bağımsız, immutable
  CSS-pixel prefix layout. Değişken/fixed yükseklikleri O(n) kurar, görünür aralığı
  O(log n) bulur. Bir Float64Array tutar; scene/DOM referansı tutmaz. Pozitif,
  finite yükseklik gerekir; geçersiz layout RangeError verir. Satırlar yarı açık
  aralıktır; fractional ölçüler desteklenir. Overscan varsayılan 168 CSS px'tir.
- `src/components/virtualization/useRowWindow.ts`: scroll/ResizeObserver olaylarını
  tek bekleyen RAF ile birleştirir. Content ref ruler/filter/padding başlangıcını
  ölçer. Sıfır yüksekliğe sahip viewport'ta normal satırlar oluşturulmaz.
  Focus, pointer gesture ve native drag sahibi satırlar ayrıca korunur. Bütün
  seçili satırlar istisna olarak oluşturulmaz; bu limitin etrafından dolaşmak olurdu.
- `WindowedRows.tsx`: boş aralıkları aria-hidden spacers ile değiştirir. Gerçek
  satırı ek bir element içine sarmaz; attrs satırın kendi elementine uygulanır.
  Stable key ve containing-block/sticky/drag geometrisi korunur. ul için li spacer
  kullanılır. İndeksler aynı layout'un `indices()` sonucundan gelmelidir.

Hook observer/listener/RAF sahipliğini unmount'ta bırakır. Tab, bir satırdaki son
kontrolden henüz oluşturulmamış sonraki satıra geçecekse o satırı oluşturup odağı
taşır. Normal mounted kontrollerin yerel Tab davranışı korunur; uygulama/system
shortcuts değiştirilmez. Dope sheet'in iki kolonu aynı satır kimliği ve pencereyi
paylaşır. Gizli/disabled kontroller klavye hedefi yapılmaz. Ayrı bir panelden
gelen Scene Explorer seçimi data index üzerinden reveal edilir; selected satırın
yeniden mount olması kullanıcının scroll'unu geri çekmez.

Minimal kullanım (mevcut sabit satır yüksekliği örneği):

```tsx
const layout = useMemo(() => RowLayout.fixed(rows.length, 28), [rows.length])
const keys = useMemo(() => rows.map(row => row.id), [rows])
const scroll = useRef<HTMLDivElement>(null)
const window = useRowWindow(layout, keys, scroll)
return <div ref={scroll} style={{ height: 300, overflow: 'auto' }}>
  <WindowedRows layout={layout} indices={window.indices} rowKey={i => keys[i]}
    renderRow={(i, attrs) => <div {...attrs} style={{ height: 28 }}>{rows[i].name}</div>} />
</div>
```

## Timeline ve seçimin korunması

`LayerTrackIndex` mevcut `parseTrackTarget` sözleşmesini kullanır; canonical layer
id için track araması expected O(1)'dir. Sıra/duplicate target ve keyframe kimliği
korunur. Dotted legacy layer id için eski prefix-filter geri dönüşü vardır. Track
üyeliği/target değişince yeniden kurulur. Timeline ve dope hierarchy builder aynı
indeksi kullanır; her layer için tüm track dizisi yeniden taranmaz.

Timeline section ve property satırı ayrı pencerelenir; tek katmanda 1000 track
olması aynı sayıda DOM kontrolü oluşturmaz. `timeline/layout/timelineRows.ts`
header (32/64), property (28/72), Add (28) ölçülerini hem çizim hem hit-test için
sağlar. İç pencereler dış bölümle kesişmiyorsa yalnız interaction owner tutulur.
Seçim/seek listeleri genişletmez ve key verisini silmez.

Alt+marquee artık `[data-kf-id]` DOM taraması yapmaz. Aynı section layout, graph
value range, drag preview zamanı ve native x clipping ile **tüm görünür veri
satırlarını** sorgular; DOM'dan çıkmış satır seçilebilir. Collapsed/filtrelenmiş
property satırları dahil edilmez. Audio gain anahtarları property filtresinden
bağımsız native clip aralığını ve sticky header yerini kullanır.
`audio/gainEnvelopeY.ts` çizim ve hit-test'in ortak CSS ordinate fonksiyonudur;
eski AudioClipTimeline export'u korunur. Zaman birimi composition milliseconds'tir.

Dope sheet mevcut data marquee fonksiyonunu kullanmaya devam eder. Label/key
sütunları tek `RowLayout` ile hizalanır. Grup/key hesapları track/preview girdisine
göre memoize edilir; zaman penceresi dışındaki segment DOM'u oluşturulmaz.

## Layer ve medya panelleri

Eski Layers paneli `LayerIndex` üzerinden guarded iterative reverse-z flatten
adapter'ını kullanır. Önceki strict undefined-parent/root ve orphan davranışı
korunur; collapse kaynak data'yı etkilemez. Leaf satır 32px + 2+2px margin, group
20px'tir; flex-column list margin collapse'ı önler. Scene Explorer mevcut model,
sort/filter, sub-info ve command callback'lerini kullanır.

Assets paneli mevcut iki sütunlu kare thumbnail düzenini korur. Panel ölçüsünden
satır yüksekliği hesaplanır; envanterin tüm medyası için element açılmaz. Bilgi
alanı 76 CSS px olarak ayrılır. `AssetThumbnail` yalnız element/istek sahibidir:
video unmount'ta pause, src detach ve load reset yapılır; kaynak URL revoke edilmez.
Asset silme/cleanup da undo'nun geri getireceği source URL'yi revoke etmez; bu panel
URL sahibi değildir ve mevcut editör oturumunun yaşam döngüsüne bırakır. Ortak
sahiplik/bütçe/lease yöneticisi sonraki aşamadır. Tam editör asset cache'i ve audio residency
bu değişiklikle demand-loading sistemine dönüşmüş sayılmaz.

## Doğrulama ve sınırlar

Next kapalıyken `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run mcp:build`,
`npm run build`; ardından `node scripts/perf/ui.mjs artifacts/performance/opt7-ui-20261107`
ve `npm run perf:serve -- artifacts/performance/opt7-ui-20261107 4323`.
`/ui-check.html` gerçek panel + editor command/history hook'larını izole origin'de
açar. Run checks sonucu ve source/CSS/bundle hash'leri artefakt klasöründedir.

3000 layer/asset, 1000-track tek layer, kolon hizası, offscreen focus/selection,
Tab, native drag kaynağının tutulması ve 10 switch/unmount döngüsü sınanır. Gerçek
işaretçiyle keyframe taşıma, inline rename, Curve görünümü ve undo/redo ayrıca
kontrol edilmiştir. Observer sayımı test-only native wrapper'dır; üretim constructor'ı
değişmez. Bu sayım bütün browser listener/driver/decoder belleğinin kanıtı değildir.

Yeni sınıflar 300 satır hedefinin altındadır. Büyük eski React dosyaları topluca
yeniden yazılmadı; hesaplama/indeks/layout sorumlulukları ilgili modüllere çıkarıldı.
Proje JSON'u, animasyon sırası ve runtime/export kabiliyeti değişmez. Tam editörün
uzun oynatma/RSS/panel overhead ve bütün input senaryolarının kabulü genel kaynak
kabulünde açık kalır. Yoğun tek-track görünümü aşağıdaki ikinci dilimde eklenmiştir.

## Yoğun keyframe görünümü

`src/lib/timeline/glyphs/KeyGlyphLayout.ts` row-local CSS koordinatlarından immutable
bir görünüm hazırlar. 256 görünür anahtara kadar yerel kontroller korunur. Daha yoğun
görünümde 8×8 CSS-pixel hücrelerin son authored anahtarı gösterilir; seçimsiz,
kısmen seçili ve tamamen seçili hücreler üç SVG path ile çizilir. Bu yalnız editör
temsilidir; timeline zamanı/değeri, animasyon renderer'ı ve export değişmez.
Geometry O(n) metadata tutar; SVG karmaşıklığı görünür alanla sınırlıdır. Dense
veriyi modelden veya undo'dan silmez; kaynak sıra temporal olarak yeniden sıralanmaz.

`src/components/timeline/glyphs/KeyGlyphLayer.tsx` browser adapter'ıdır. Dense
görünümde cursor/hover/pointer sahibi için en fazla üç native kontrol oluşturur;
select-all bütün native kontrolleri açmaz. Arrow/Home/End, görünür kaynak sırasındaki
her anahtara ulaşır; Browse keys'in 1-based ordinal girişi üst üste binmiş anahtarı
da seçilebilir kılar. Enter/Space mevcut seçim semantics'ini kullanır. Hücre hit
testi yalnız gösterilen temsilciyi hedefler; diğer üyeler ordinal/keyboard yolundadır.
Dope sheet'in mevcut exact-time summary grupları bu seviyede ayrıştırılmaz.

Adapter düzenleme, easing, silme ve sürüklemeyi mevcut sahip callback'lerine
devreder. TrackKeyframes, DopeSheetKeyframeRow ve AudioClipTimeline ortak adapter'ı
kullanır. Focus/pointer sahibi stable key ile korunur; pointerup/cancel listener'ları
unmount'ta kaldırılır. Canvas, GPU yüzeyi, worker veya kalıcı source cache'i yoktur.

Örnek: `<KeyGlyphLayer points={points} width={width} height={28} label={track.target}
selected={selected} renderKey={renderExistingKey} onPointerDown={beginExistingDrag}
onSelect={selectExistingKey} />`. Point kimliği/sourceIndex o anki immutable kaynağa,
x/y ise row-local CSS pixel'e aittir. Zaman projeksiyonu tüketicide kalır.

`artifacts/performance/opt8-glyphs-20261107/native-ui-final.json` 11/11 browser kontrolünü
kaydeder: 42.000 kaynak key için Timeline 1 native kontrol/110 hücre, Dope 4 ve audio
2 native kontrol. Coincident kaynak 1 hücrede kalır; Home/End, Shift seçimi ve 42.000
anahtarın toplu seçimi korunur. `interactive-glyphs.json`, ordinal 21001'in değerini
0→0,42, in/out easing'ini easeIn/easeOut olarak düzenleyip yeniden açmayı; ayrı
mevcut komutlar üzerinden undo/redo'yu; Cancel ile değerin korunmasını; gerçek pointer
ile 24001→26526 ms taşıma ve undo'yu kaydeder. Screenshot'lar aynı klasördedir.
180 dosya/1658 test, TypeScript, MCP ve Next build geçti. Bu izole UI kabulü tam
editör CPU/RSS, medya residency veya genel uzun oynatma kabulünün yerine geçmez.
Son compact görünüm düzeltmesi, odaklanan native anahtarı Browse HUD'un üstünde
tutar; 340px panelde ordinal 21001'in double-click düzenleyicisi ayrıca doğrulandı.
Son kaynakla 181 dosya/1661 test geçti; OPT9 aynı kaynak durumunun kontrollerini tutar.

## Solo alt ağaçları ve toplu işlemler — OPT31

8 Kasım 2026: Timeline ve Scene Explorer artık ortak `editorSoloScope` ile Solo
üst grubun çocuklarını korur. Tek ebeveyn veya çoklu seçim için recursive
aç/kapat/göster/gizle araçları eklendi. İşlemler tam kaynak indeksini kullanır;
sanallaştırılmış DOM listesi kapsamı daraltmaz. Ayrıntı ve güncel native kanıt
[editör alt ağaç işlemleri](editor-subtree-operations.md) belgesindedir.
