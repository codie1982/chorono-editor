# Import kuyruğu ve belgeye bağlı iptal — OPT26

## Giriş noktaları ve kapsam

- `src/lib/import/ImportManager.ts`: File, explicit-format File, URL, clipboard,
  preflight ve format tespiti için dış iş kabulü, transaction ve sonuç yayımı.
- `src/lib/import/resources/editorImportPreparation.ts`: editör realm'inde ortak
  **2 aktif / 128 bekleyen** dış kuyruk. Domain servisleri yalnız submit ve sayısal
  snapshot ödünç alır; başka sahibin işlerini cancelAll/dispose edemez.
- `src/lib/editor/lifecycle/EditorDocumentLifetime.ts`: sahne adından/revision'dan
  bağımsız runtime belge kimliği. `useEditorState.getDocumentSignal()` üzerinden
  okunur; `resetScene` eski kimliği senkron iptal eder.
- `src/lib/import/lifecycle/ImportActivity.ts`: hook'a ait request controller'ları,
  güncel ilerleme ve gerçekten bitmesi beklenen iptal kayıtları. Dosya/native
  kaynak tutmaz; en çok 130 tamamlanmamış UI action kaydı kabul eder.
- `src/app/hooks/useImport.ts`: belge/yerleşim yakalama, commit, source creator
  bırakma, kullanıcı bildirimi ve clipboard permission sonrasındaki stale kontrolü.
- `src/components/import/ImportActivityBar.tsx`: durum ve **Cancel imports**.
  Kaynak panelindeki **Import preparation**, mevcut **Shared media preparation**
  kuyruğundan ayrı sayılır. Yeni polling/timer eklenmez.

Scene/asset JSON, format seçenekleri ve undo kaydı değişmez. Yeni runtime
opsiyonlar optional'dır. Uygulama hook'a belge getter'ını verir; standalone host
bunu vermezse hook mount ömrü tek belge kabul edilir.

## Veri akışı ve kapasite

`UI action → dış import kuyruğu → bounded input / format handler → gerekiyorsa
native medya kuyruğu → transaction → son iptal kontrolü → commit/source adoption`.

Var olan BoundedJobQueue, withPreparationDeadline, BoundedBinaryReader,
ImportExecution ve importSources kullanılır. Yeni scheduler/cache algoritması
oluşturulmaz. Dış kuyruk bekleyen iş için fetch, magic-byte okuması veya handler
başlatmaz. URL/clipboard → File geçişi private routing kullanır; aynı kuyruğa
ikinci kez submit edilmez. Bu, concurrency=1 özel host'ta da deadlock'u önler.

Native medya servisleri dış import kuyruğunu beklemez. İki kuyruk aynı nesne
olsaydı import slotları inner preparation beklerken kilitlenebilirdi. **Dış ve
medya job sayıları örtüşür; toplanarak native concurrency/CPU ölçümü sayılamaz.**
Henüz taşınmamış metadata probe'ları için native allocation öncesi byte sınırı
bu değişiklikle tamamlanmış değildir.

Varsayılan manager deadline **60.000 ms**, kuyrukta beklemeyi içerir. Timeout/abort
bir Promise.race ile kaynağı bırakmış gibi davranmaz; aktif legacy/native işin
actual settlement'i beklenir. Hemen durmayan iş slotunu ve domain byte/source
owner'larını korur. Bekleyen iptal ise iş başlamadan kaldırılır. Kuyruk doluluğu,
bozuk veri ve timeout otomatik fallback/tekrar oluşturmaz. Preflight hatasından
sonra UI'nın eski doğrudan import retry yolu kaldırılmıştır.

## Belge kimliği ve UI sahipliği

`resetScene` yeni AbortController'ı eskiyi abort etmeden önce kurar; reentrant
getter yeni belgeyi görür. Aynı scene/composition ID ile açılan proje de yeni
kimlik alır. Normal command, transaction, undo ve redo belge kimliğini değiştirmez.
Gerçek unmount iptali bir microtask ertelenir; StrictMode'un senkron
setup/cleanup/setup tekrarı canlı belgeyi yanlışlıkla kapatmaz.

Her UI action belge sinyali, timeline ID ve startMs yerleşimini başlangıçta
bir kez yakalar. Çoklu File tek action'dır; belge değişince kalan dosyalar yeni
belgeye başlamaz. Clipboard permission/read sonucu geç gelirse manager'a verilmez.
Manager'a ulaşmış getType/legacy handler sonuçları da yayın öncesi kontrol edilir.
Generic File/Sprite picker ve preflight/URL/Sprite modal onayları yakalanmış belge
kimliğiyle doğrulanır; eski modal yeni projeye import başlatamaz.

Kullanıcı iptali borrowed belge sinyalini abort etmez. Başka bağımsız import
consumer'ları ve editör animasyonu etkilenmez. Eski action'ın progress/finally
callback'i yeni action'ın durumunu silemez. En son başlatılmış canlı action'ın
ilerlemesi gösterilir; iptal edilip henüz bitmeyen kayıtlar **settling** olarak
ayrılır. Başarıya yaklaşmış handler mesajı, manager handoff/commit bitene kadar
**Finalizing import…** olarak gösterilir.

## Sonuç ve source devri

Format conversion sahip olduğu creator source lease'lerini hata halinde bırakır.
Executor handoff sırasında abort kazanırsa executor discard hook'u source'u
bırakır. Handoff sonrasında veya complete progress callback'inde abort kazanırsa
manager bırakır; importComplete önceden yayımlanmaz. Yayın sonrası UI, canlı
belgeyi yeniden kontrol eder. Commit senkron `dispatchCommand` ile present/history
source owner'ına devreder; `finally releaseImportSources` creator'ı bırakır.
Stale/fatal sonuç ve throwing command aynı finally yolunu kullanır.

`importComplete`, yöneticiye ait senkron publication olayıdır; editor adoption
kanıtı değildir. Observer hataları import akışını bozmaz. Publication'dan sonra
iptal olan UI consumer'ı sonucu commit etmeden bırakabilir.

## Kullanım

```tsx
const editor = useEditorState(initialScene)
const imports = useImport({
  dispatchCommand: editor.dispatchCommand,
  getDocumentSignal: editor.getDocumentSignal,
  selectedTimelineId,
  currentTimeMs,
})
// Ayrı uygulama komutları:
void imports.importFiles(files)
imports.cancel() // yalnız bu hook'un işleri
editor.resetScene(nextScene) // önceki belgeye ait işler artık commit edilemez
```

Özel importer host'u `new ImportManager({ executor, inputReader, timeoutMs })`
kurabilir. Native medya executor'ıyla aynı dış executor'ı vermez. Raw manager
sonucunu alan caller commit/discard sonrası `releaseImportSources(result)` çağırır.
Runtime signal isteğe bağlı son execution argümanıdır; serialized options içine
konmaz. Deadline ve kuyruk signal'ları birleştiğinden handler'a ulaşan signal'ın
nesne kimliği caller signal'ıyla aynı olmak zorunda değildir; iptal anlamı korunur.

## Doğrulama ve kalan sınırlar

Unit kontrolleri dış admission/backpressure, URL/clipboard concurrency-one
routing, queued-read iptali, actual settlement, handoff/start-observer iptali,
deadline, document/StrictMode ve UI ilerleme sahipliğini kapsar. Native Chrome QA
actual StrictMode editor/import hook'larını, gerçek PNG handler'ını, original
source owner'ını ve gerçek Cancel imports düğmesini kullanır. Gate, native PNG
conversion **bittikten sonra** producer teslimini geciktirir; native decode hâlâ
çalışıyor iddiası değildir. Test private 512 MiB ledger kullanır; toplam browser
RAM'i veya native decoder tepe belleği ölçümü değildir.

Kalan gerekli File/text okumaları (SVG/scene JSON/açılış), native metadata/decode
ön kabulü ve yardımcı picker girişlerinin kapsam incelemesi ayrı sonraki iştir.
Sonra raster/sequence/offline-audio/portable output ownership ve uzun editor/player/
panel/heap-process/CPU kabulü tamamlanacaktır. Export E0 bu aşamada başlamaz.
