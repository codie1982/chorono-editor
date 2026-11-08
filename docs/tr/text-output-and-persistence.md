# Metin çıktısı ve kayıt sahipliği — OPT29

Bu bölüm `output-resource-ownership.md` altyapısının production entegrasyonunu
tamamlar. Export kalite/tutarlılık geliştirmesi değildir. Editor JSON, iki mevcut
runtime JSON şeması, HTML ve SVG biçimleri eski davranışlarıyla korunur.

## Girişler ve veri akışı

`src/lib/export/text` public girişleri:

- `acquireSceneText(scene, kind, options, execution)` önizleme/clipboard için
  bağımsız pinli metin verir. kind: editor-json, runtime-json (package),
  legacy-runtime-json (JsonModal/bake), html veya svg.
- `acquireTextDownload` metin + native Blob overlap'ini önceden kabul eder;
  tüketiciye yalnız Blob/filename/warnings döner, büyük metni ayrıca tutmaz.
- `sceneTextInScope` başka bir output işi içinden çağrılan adımdır. Aynı kuyruğa
  recursive iş açılmaz. options ilgili HTML/SVG/runtime seçeneğini taşır.

`OutputResources` ve source URL pinleri bekleme, üretim ve gerçek cleanup boyunca
korunur. Normal metin çıkışı actual 64 MiB UTF-8 ile sınırlıdır; büyük source name
512 UTF-16 birimden önce reddedilir. UTF-8 byte/line sayımı split array veya Blob
ölçüm kopyası üretmez. Bu sınırlar native/JS-engine/process RAM hard cap'i değildir.

`consumeOutput(lease, consumer, {signal,resources})`, hazır sonucu native async
tüketim boyunca aynı sınırlı output kuyruğuna alır. Üretim slotunun bitmesi
clipboard gibi bir tüketicinin sınırsız concurrency ile devam etmesini sağlamaz.
Bağımsız pin queue wait ve actual settlement boyunca tutulur. Caller kendi pinini
bırakabilir; consumer void döner ve borrowed backing'i sonradan saklayamaz.
Composed iş içinde bu helper yeniden çağrılmaz; mevcut scope içinde await edilir.

```ts
const text=await acquireSceneText(scene,'editor-json',{}, {signal})
try {
  await consumeOutput(text,async(value,nativeSignal)=>{
    await clipboard.writeText(value.text)
    if(!nativeSignal.aborted) publishSuccess()
  },{signal})
} finally { text.release() }
```

UI'da `useOutputOperation` stable callbacks, double-click/document/unmount guard
ve actual consumer settlement'i bekleyen busy state sağlar. Await sonrası toast
gibi yayınlar için `context.isCurrent()` kullanılır; deadline'in kendi abort'u da
bu guard'a dahildir. File-menu JSON/HTML/runtime, raster/sequence/SVG ve WAV
kontrolleri bu sınırı kullanır. Download bağımsız beş saniyelik handoff pinini
tutar; bu süre tek başına disk tamamlanma kanıtı değildir.

`useSceneTextPreview` JsonModal'in hazır metin pinini mode/document/unmount sonuna
kadar taşır. UI en fazla 200000 UTF-16 birim gösterir; copy/download tam metni
kullanır. Eski her render'daki `split('\n')` ve `new Blob([json]).size` kopyaları
kaldırıldı. Geç sonuçlar yeni mode veya yeni document adına yayımlanmaz.

## HTML, runtime ve SVG sınırları

HTML raw `exportHTML` ile owned yol aynı `renderHTMLDocument` template'ini
kullanır. `measureJson.scriptEscapes`, literal `<`/`>` sayısını serialization
oluşturmadan sayar; ordinary projelerde gereksiz 6× tam JSON rezervasyonu yoktur.
JSON, iki replacement overlap'i ve final template ayrı kabul edilir. Optional
başlık/URL/background metinleri 4096 birim ile sınırlıdır. Script escaping ve
eski source-URL/CDN politikası korunur; bu aşama portable HTML'e geçiş değildir.

`runtimePackageInScope`, mevcut RuntimeExporter'ın metadata/sort working-set
politikasını; `legacyRuntimeInScope` mevcut ikinci runtime şemasının bake/sort
politikasını uygular. Ortak `usesSignalSystem` predicate'i kullanılır. Dense bake
sample cap'i conversion öncesinde track başına 20000, toplam 100000; fps 1–240.
Sampling/tolerance/order sessizce değiştirilmez. İki şema Export E0 öncesi
birleştirilmedi; mevcut schema kayıpları kaynak güvenliğiyle çözülmüş sayılmaz.

SVG'de `ShapeToPathConverter.estimateCommandCount` converter'ın aynı subdivision
helper'larını kullanır. Polygon/star/arc sayılarını düşük detaylı çizime çevirmek
yerine aşırı geometri conversion öncesi reddedilir. Bounds: 100000 aggregate
command, 32 MiB UTF-16 construction policy, 5000 layer ve 64 parent depth.
Style/uppercase/XML/SMIL genişlemeleri conservative upper-bound hesabındadır;
actual SVG daha küçük olsa da hazırlık policy'si reddedebilir. Precision 0–12.

`SVGExporter` değerlendirilmiş layer verisini preflight eder. Var olan LayerIndex
authored sibling sırasını korur. `BoundedTextBuilder`, iç içe grup metnini her
ancestor'da yeniden birleştirmek yerine tek ordered fragment akışı üretir.
Shape/path/style/SMIL converter'ları korunur. `svgInScope` evaluation metadata,
dense commands, fragments/flattening ve result için allocation öncesi policy
kabul eder. Native object/string/rope boyutu kesin ölçüm değildir.

## Dosya kayıtları

`src/lib/editor/persistence/SceneFileWriter`, seçili klasörün current/snapshot
yazılarını mevcut BoundedJobQueue ile seri işler: bir aktif, iki bekleyen. Her IO
ayrıca ortak output queue/budget'e girer. Local wait, paneldeki global output
queued sayısına dahil değildir. `open()` yalnız metin admission başarılı olduktan
sonra çağrılır; quota hatası dosyayı oluşturmaz/truncate etmez.

`OwnedSceneFileWrite` soğuk resource owner'dır. Özel, aynı allocator'ı kullanan
metin scope'u parent kapanınca erken bırakılmaz. Native write/close/abort actual
settlement'i await edilir. İptal edilmiş yazı tamamlanınca stale commit yerine
abort edilir. Native abort da başarısızsa writable ve metin charge'ıyla quarantine
kalır. Explicit `clearIdle()` bir async retry başlatır; pending retry hâlâ
charged/protected'tır. Başarılı actual abort final cleanup yapar; hata otomatik
busy loop veya timer üretmez. Native filesystem/kernel kopyaları opaque'tir.

`useFileVersioning`, typed `SceneDirectory` portuyla picker UI'sını IO'dan ayırır.
Picker ilk current+version yazıları tamamlanınca resolve olur. Current save'ler
coalesce edilir; timestamp snapshot'ları seri dosya queue'sunu kullanır. Native
handle'lar scene/undo'ya girmez. Source JSON/blob-URL politikası bu aşamada
değişmez; portable projeler için mevcut MCP save_project yolu kullanılabilir.

## Otomatik kayıt / server

`SceneAutoSaveCoordinator` tek aktif ve tek latest-pending scene tutar. Yeni
pending, önceki pending source pinini bırakır. Retain-before-release aktarımı
sırasında geçici üç source pin olabilir; source bytes kopyalanmaz. Aktif CAS
yazısı sıradan edit yüzünden iptal edilmez. Undo ile aktif/önceden saved sahneye
dönüş eski pending'i yanlışlıkla tekrar yazmaz. Son saved identity weak'tir.

Debounce ve ilk dirty request'ten hesaplanan fallback tek timer paylaşır. Retry
en çok üç kez, tek pending slot/timer üzerinden 2/4/8 saniye backoff ile yapılır.
Eski scene retry closure'ları büyümez. Conflict ve quota hatası o request için
terminaldir. Offline state source pinini bırakır; online/manual request yeniden
başlatabilir. Observer exception'ları IO/source cleanup'ını kesmez. Dispose
pending/timer'ları kapatır; aktif source actual save settlement'e kadar kalır.
Yeni aktif/pending iş, eski saved→idle timer'ını temizler.

`SceneServerSave` aynı PATCH/CAS payload'ını output admission altında serialize
eder. Actual response 64 KiB bounded reader üzerinden alınır. Fetch platform
receiver'ına bind edilir; geç abort response body cancellation'ını da await eder.
409 `SceneSaveConflictError` verir. Eski initial version=0 ve server load/version
negotiation davranışı değiştirilmedi. React adapter `useAutoSave`, target/document
ve unmount'ta eski callback'leri geçersiz kılar; bağımsız retry timer'ı tutmaz.

## Doğrulama ve kapsam

Release: 260 dosya /2079 test; TypeScript, MCP ve Next build başarılı. Native
Chrome 21/21: frozen SVG/HTML/runtime text, native SVG exact RGBA, Four Seasons
4079 layer tam JSON/HTML, actual OPFS write/abort, StrictMode folder hook 50 edit,
bounded JSON DOM, async consumer queue/cancel/unmount ve native download handoff.
Son shared/output/source charge ve işler sıfır. Peak policy 226949017 B /216,44 MiB.
Four Seasons JSON 14287707 B, HTML 6905594 B; observed heap 768 MiB guard'ın
altında. Bu bir renderer timing veya bütün process RSS benchmark'ı değildir.

Native SVG testinin ilk direct ImageBitmap yolu decode hatası verdi. QA, aynı
iki SVG'yi DOM XML doğrulaması + normal Image.decode üzerinden karşılaştırdı;
production çizim değiştirilmedi. İlk hata raporu saklandı. Native write gate'i
tamamlanmış write ile commit arasında bekler; unfinished native IO diye sunulmaz.
Input/reference/evidence canvas kopyaları policy dışında açık etiketlidir.

Production editörde ayrıca MCP preview, portable save, SVG/runtime/ZIP/WAV HTTP
aktarımı doğrulandı. Gerçek dosya receipt'lerinde hash/byte/CRC/WAV sözleşmeleri
geçti; demo scene/revision değişmedi. WAV bu fixture'da silence'tır; non-silent A/V
senkronu kanıtı değildir. Native browser download dosyasının disk hash'i de
expected içerikle eşleşti. Console warning/error kayıtları boş.

Legacy raw handoff API'leri ve kullanılmayan mode-registry placeholder'ları dış
caller compatibility yoludur; dış caller'ın raw backing'i sonradan tutması
editor managed lifetime değildir. Production UI/kayıt/MCP yolları owned sınırları
kullanır. Full-editor uzun oynatma/heap-process plateau, panel overhead, native
player A/V ve açık CPU p95 kontrolü sonraki kabul bloğudur; Export E0 başlamadı.
