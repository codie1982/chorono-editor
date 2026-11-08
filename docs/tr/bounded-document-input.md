# Sınırlı belge girdisi ve proje açılışı — OPT27

## Sahipler ve veri akışı

`File/Blob → BoundedBinaryReader → BoundedTextReader → format conversion →
owned result → import transaction veya project reset`.

- `src/lib/resources/io/BoundedTextReader.ts`: actual UTF-8 girdi ve UTF-16 metin
  tahmininin callback sonuna kadar sahibi. `TextInputReader` dar porttur.
- SVG/Chorono document handler'ları ve Lottie metadata reader aynı metin
  implementasyonunu kullanır. Lottie'nin eski private UTF-16 rezervasyonu kaldırıldı.
- `src/lib/format/scene/SceneJsonConverter.ts`: mevcut merge-source tanımasını
  ortaklaştırır; proje açılışında editörün doğrudan tükettiği array'leri de ister.
  Unknown alanlar/ID'ler korunur; URL/asset/geometry normalizasyonu yapılmaz.
  Bu derin bir scene validator değildir. MCP'nin daha sıkı transport boyut/depth/
  ID/geometry kontrolleri ayrı sözleşmedir ve bu değişiklikte taşınmamıştır.
- `src/lib/editor/document/SceneDocumentLoader.ts`: IO kabulü ve parse. Editör
  state/history tutmaz; `SceneDocumentSource` yalnız load portudur.
- `src/app/hooks/useImport.ts`: merge dışında `openScene` action'ını da mevcut
  ImportActivity ile yönetir. UI callback'i hazır projeyi senkron benimser.
- `src/components/import/DocumentFilePicker.ts`: generic, SVG/sprite, layer-panel
  image/video/audio ve proje açılışı seçicilerinin tek DOM yaşam döngüsü sahibi.

Yeni cache, scheduler algoritması veya serialized scene alanı yoktur. Mevcut
BoundedBinaryReader, ResourceBudget/Group, BoundedJobQueue, deadline, ImportActivity,
source owner ve SVG sanitizer/converter tekrar kullanılır. Büyük page/LayerPanel
sadece ilgili IO sınırında değiştirilmiştir; sınıflar 300 implementation satırının
altındadır. SVG preflight sayımı artık match-array'leri tutmadan tek regex tarar.

## Sınırlar ve ölçüm anlamı

| Tüketici | Actual input cap | Metin politikası |
|---|---:|---|
| Genel text reader / scene JSON / proje açılışı |64 MiB|2×actual byte UTF-16|
| SVG |16 MiB|Preflight 2×; sanitizer/conversion 4 eşzamanlı UTF-16 gösterimi, toplam 8×|
| Lottie plain/ZIP metadata |Mevcut 128 MiB original; ZIP entry 64 MiB|Mevcut2×UTF-16, ortak implementasyon üzerinden|

Her text reader **256 MiB / 8192 kayıt** yerel politikaya sahiptir; uygulama
**aynı 512 MiB** host ledger'ına bağlar. Yerel/host/reader kapsamları örtüşür,
toplanmaz. Girdi buffer'ı metinle birlikte yaşar: scene JSON için 3×, SVG sanitizer
scope'u için 9×actual input politikası. Büyüme/compaction old+new peak'i mevcut
binary reader admit eder. String kopya sayısı 1–16 safe integer olabilir.

File.size sadece erken ret ipucudur. Production reader gerçek stream byte'larını
sayar; sahte metadata actual cap'i aşamaz. Injected binary adapter kendi actual
cap'ini uygulamalıdır; dönen byte sayısı decode öncesinde ayrıca kontrol edilir.
İnput buffer/UTF-16 tahminleri tam JavaScript heap veya native RAM ölçümü değildir.
Parsed JSON/DOM/layer nesneleri, TextDecoder iç kopyaları, sanitizer regex motoru,
Blob encoding/storage ve GC/fiziksel RAM bu transient tahminin dışında kalır.
Parsed scene alanlarının motor içi string paylaşımı da kesin RAM muhasebesi değildir.
SVG'nin mevcut 50.000 converted-layer sınırı korunur; DOM allocation'ı için bir
hard heap limit olduğu iddia edilmez.

## İptal, hata ve devir

`withBlob` File.text kullanmaz; File.stream → sınırlı reader kullanır. Pre-abort,
known oversize ve geçersiz kopya politikası IO başlamadan reddedilir. Metin budget
reddi TextDecoder/sanitizer/JSON.parse öncesindedir. BOM ve bozuk UTF-8 replacement
anlamı Blob.text ile aynıdır. Raw metin veya borrowed byte view callback dışında
saklanmaz. Independently owned parsed/source sonuçlar çıkabilir.

Asenkron callback durdurulamıyorsa input/text charge actual settlement'e kadar
korunur. Reader, dispose edemeyeceği owned sonucu sonradan abort diyerek kaybetmez;
final cancellation/discard/publication tüketicinin işidir. Manager ve scene-loader
executor handoff kontrolleri bu sınırı sağlar. SVG source helper'ın içindeki
progress-triggered abort creator lease'i bırakır. Budget/IO/abort/timeout boş
metadata, warning veya unbounded fallback'e çevrilmez. Scene JSON syntax hatası
preflight'ta mevcut warning anlamını korur; resource hataları fatal kalır.

Proje açılışı ortak dış import kuyruğunu kullanır (**2 aktif / 128 bekleyen**),
medya kuyruğuna yeniden submit etmez. 60s deadline queue dahil actual settlement'i
bekler. Bir önceki open action yalnız kendine ait cancel operation'ıyla iptal
edilir: **son açma isteği kazanır**. Başarısız yeni open mevcut projeyi değiştirmez.
Başarılı `onOpen` senkron `resetScene` yapar; yeni document identity eski importları
iptal eder. Böylece eski open sonucu/başarısızlık bildirimi yeni belgeye taşmaz.

Picker başlarken document signal yakalar. Hidden native input seçim bitene kadar
DOM'a eklenir; selection, cancel, reset veya click hatasında callback/listener ve
DOM node temizlenir. Detached kontrol ilk native otomasyon denemesinde backend
node bulunamamasıyla başarısız oldu. DOM owner eklendikten sonra aynı gerçek
FileChooser akışı geçti; extension izinleri değiştirilmedi. Dosyanın yanlış projeye
başlamasını önlemek için teslim anında identity/abort tekrar kontrol edilir.
Birden çok preflight yarışında yalnız en son seçim preview modal'ı açabilir.

## Kullanım

```ts
const reader = new BoundedTextReader({ budget: editorResourceBudget })
const scene = await reader.withBlob(file, text => parseSceneJson(text, true), { signal })
// scene kendi parsed verisine sahiptir; transient text/input scope'u bitmiştir.
```

UI'da doğrudan reader yerine lifecycle/capacity adapter'ı kullanılır:

```tsx
const editor = useEditorState(initialScene)
const files = useImport({
  dispatchCommand: editor.dispatchCommand,
  getDocumentSignal: editor.getDocumentSignal,
})
void files.openScene(file, scene => editor.resetScene(scene))
// onOpen senkron olmalıdır. files.cancel() devam eden open/merge action'larını iptal eder.
```

Özel host `SceneDocumentLoader({reader, executor, timeoutMs})` enjekte edebilir.
Loader source data hazırlar; reset, toast, selection ve kalıcı dosya kaydı UI sahibidir.

## Doğrulama ve kalan işler

Unit kontrolleri actual/dishonest byte cap, UTF-8/BOM/replacement, input+text+sanitizer
kopya admission'ı, throw/abort/actual settlement, owned-result handoff, scene merge/
open, picker DOM/listener cleanup ve document identity'yi kapsar. Native test
immutable eski SVG handler'ıyla exact production-renderer RGBA ve dolu red/blue
kareleri, source sanitization, gerçek StrictMode hook'ları, latest-open/reset/user
cancel ve gerçek Four Seasons native FileChooser/load akışını kontrol eder.
QA gate, text decode sonrası consumer teslimindedir; JSON.parse hâlâ çalışıyor diye
gösterilmez. Canvas QA evidence surface'ları private input ledger'a dahil değildir.

Native metadata/decode ön kabulü (image/sprite/video/audio/font, yardımcı sprite
preview), font-outline binary input, sonra raster/sequence/offline-audio/portable
output sahipliği ve uzun bütün-editor/player/panel/heap-process/CPU kabulü kalır.
PortableScene/MCP binary-base64 kopyaları output dilimine aittir; AI provider error
response text'i medya/import yolunun tamamlandığı iddiasına dahil değildir.
Export E0 başlamamıştır; 37 GB process büyümesinin kökü bu testlerle kanıtlanmamıştır.
