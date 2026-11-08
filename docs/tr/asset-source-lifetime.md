# Orijinal medya kaynaklarının sahipliği

`src/lib/asset/sources` orijinal Blob URL eşlemesinin yaşam süresini yönetir.
Bu URL, decoded piksel/PCM, GPU texture veya kaynak dosyanın byte muhasebesi
değildir. Orijinal kaynak undo ya da kayıt için korunurken decoded veri ayrı bir
owner tarafından boşaltılabilir. Bu ayrım dinamik görsel medya residency'sinin
ön koşuludur; bu teslim tek başına resim/video residency uygulamaz.

## Girişler ve bağımlılıklar

- Public giriş `@/lib/asset/sources`: `AssetSourcePool`, `AssetSourceOwner`,
  `AssetSourceLease` ve uygulama composition root'u `assetSourcePool`.
- Pool yalnız asset tiplerine ve enjekte edilebilir URL platformuna bağımlıdır;
  React, editor history, decoder ve filesystem bağımlılığı yoktur.
- `useEditorState` current/past/future ve aktif transaction base asset array'lerini
  owner'a verir. `resetScene` transaction'ı da kapatır. History limiti değişmez.
- `src/lib/import/resources/importSources.ts` import sonucuna ait creator
  lease'lerini WeakMap içinde tutar; sonuç/command JSON'una runtime handle eklemez.
- `AssetRegistry.deleteAsset` explicit disposal'ı pool'a yönlendirir. Mantıksal
  silme başka bir document/history/job tüketicisinin kaynağını hemen revoke etmez.
  `revokeUrl:false` hem primary hem runtime alias için geçerlidir.
- Kaynak paneli owned/borrowed/pending/failed ve referans sayılarını gösterir;
  URL değerlerini, byte veya toplam RAM tahminini bu snapshot'a koymaz.

## Üretim, devir ve bırakma

`create(blob)` tek native object URL ve creator lease üretir; Blob'u kopyalamaz.
Başarılı import document'e geçtiğinde document önce kendi lease'ini alır, sonra
creator otomatik tüketilir. Caller'ın daha sonra tekrar release etmesi zararsızdır.
Başarısız veya kullanılmayan import sonucu da creator'ını bırakmalıdır.

```ts
import { withImportSource, releaseImportSources } from '@/lib/import/resources/importSources'

// Built-in handler içinde; buildResult gerçek ImportResult döndürür.
const result = await withImportSource(file, url => buildResult(url))
try {
  commitToEditor(result) // useEditorState document sahipliğini devralır
} finally {
  releaseImportSources(result)
}
```

`file`, `buildResult` ve `commitToEditor` caller'ın girdileridir; örnek yeni bir
MCP/authoring API'si değildir. `withImportSource` sync ve async builder destekler,
construction hatasında creator'ı bırakır. Built-in image, video, audio,
sprite-sheet, font, SVG document, Lottie ve GIF sheet/static yolları bunu kullanır.
ImportManager'ın handler sonucu sonrası hata yolu, React import commit/discard
ve MCP import sonucu da release yapar. Helper kullanmayan third-party handler
kendi oluşturduğu URL'lerin hata/iptal temizliğinden sorumlu olmaya devam eder.

`retainAssets` primary Blob URL'leri borrowed tutar. `runtime.objectUrl` açık
application ownership işaretidir. Yalnız `blob:` biçimini görmek ownership
devri sayılmaz; foreign borrowed URL son release'te revoke edilmez. Remote/data
URL için object-URL lease gerekmez. `requestRevoke` explicit legacy disposal
isteğidir; outstanding referanslar varken bekler, yokken sync revoke yapar.

## History ve immutable veri

Owner yeni array'leri eskileri bırakmadan önce acquire eder. Aynı immutable
asset-array kimliği farklı history state'lerinde veya iç içe işlerde paylaşılsa
da tek tarama ve tek underlying kaynak grubu kullanılır. Son tüketici bırakana
kadar grup yaşar. WeakMap asset/scene history biriktirmez; decoder handle tutmaz.
Array veya descriptor'ı yerinde değiştirmek desteklenmez; editör immutable
güncelleme sözleşmesini kullanır. Kaynak referansları serialized scene'e yazılmaz.

Undo/redo, redo dalının düşmesi, 50 adımlık history pruning ve transaction
base/preview ayrı korunur. Asset içermeyen preview base kaynağını kaybettirmez.
Cancel geçici preview'ı bırakır; reset eski transaction'ın sonradan geri
getirilmesini önler. Final sıfır referans bir microtask gecikmeyle toplanır;
StrictMode cleanup/setup ve aynı-task owner transferi kaynağı tekrar alabilir.

`stop` kaynak lease'lerini bırakır; aynı hook lifecycle replay için yalnız mevcut
metadata'yı korur. Pool kaynak byte'larını veya geçmiş snapshot'larını saklamaz.
Bağımsız async iş, document kapanmadan kendi lease'ini almalıdır.

## Async iş sözleşmesi

```ts
import { assetSourcePool } from '@/lib/asset/sources'

const output = await assetSourcePool.withAssets(scene.assets, async () => {
  return packageOrRenderSnapshot(scene)
})
```

`packageOrRenderSnapshot` işi temsil eder. Lease başarı/hata settlement'inde
finally bırakılır; ayrı işler bağımsızdır, global async-current-job bağlamı yoktur.
İç içe sequence/raster aynı immutable array'i coalesce eder, her frame bütün
source listesi yeniden taranmaz. `portableScene` kopyalama/fetch öncesi pin alır;
mevcut MCP job, raster/sequence, offline audio mix/normalize, autosave ve file
versioning async scope'ları kaynak lifetime'ını korur. AudioAssetService kuyruğa
giren URL'yi native hazırlığın gerçek settlement'ine kadar borrowed tutar.
PCM hazır olduktan sonra kaynak URL bırakılabilir; oynayan PCM ayrı lease'tedir.

Bu pin decoded DOM/GPU handle'larına sahiplik vermez, eksik medyayı hazırlamaz
ve job'ı iptal etmez. Raw JSON kaydında Blob URL string'inin yazılması dosyayı
portable yapmaz. Mevcut portableScene bytes/embed davranışı ve limitleri korunur;
save/export dayanıklılığı ve export parity E0 kapsamıdır.

## Hata ve ölçüm sınırı

Release idempotent'tir. Platform revoke hata verirse kayıt failed olarak izlenir;
başarılı temizlenmiş gibi sayılmaz ve sonsuz microtask retry başlatılmaz.
Sonraki explicit revoke veya yeni retain/release retry yapabilir. Pool snapshot
sampling kaynakları warm tutmaz; URL listesini dışarı vermez. `references` alttaki
source grupları/URL borrow'larını sayar; her iç içe consumer'ı ayrı saymaz.

Native revoke browser URL eşlemesini kaldırır; File/Blob'u başka bir caller
tutuyorsa o veriyi yok etmez. Decoder kopyaları, GC zamanı ve fiziksel RSS azalması
bu sayaçlardan çıkarılamaz. Font decode/registration, decoded image/video/GPU
eviction, compressed/output byte preflight ve genel stale-job iptali açık işlerdir.
`useAssetCache` bu aşamada hâlâ bütün visual scene asset'lerini eager yükler.

## Doğrulama ve devir

[OPT14 artefaktları](../../artifacts/performance/opt14-source-lifetime-20261107/README.md):
gerçek StrictMode editor/import/cache hook'ları, built-in PNG handler, native
Canvas decode, history, transaction ve gated portable save ile **16/16** kontrol.
Undo ve decoder reload exact RGBA eşliği korundu. History sıfırken bekleyen save
bir kaynak/tek referans tuttu; settlement sonunda owned/borrowed/references ve
failed 0 oldu. Fixture özel test belgesidir; kullanıcının açık projesi değiştirilmez.

195 dosya / 1.735 test, TypeScript, MCP build ve Next build geçti. Bu kısa source
fixture Four Seasons CPU karşılaştırması veya bütün editörün RAM kabulü değildir.
Sonraki sahiplik katmanı decoded image/video/GPU demand ve ortak admission;
ardından kalan ağır iş preflight/backpressure/cancel ve uzun editör kabulüdür.
Export E0 başlamamıştır.
