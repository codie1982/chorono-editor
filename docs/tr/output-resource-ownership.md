# Çıktı kaynaklarının sahipliği — OPT29

Bu dilim mevcut raster, kare dizisi/ZIP, offline WAV ve MCP paketlemesinin
kaynak yaşam döngüsünü sınırlar. Yeni format veya yüksek kaliteli renderer
eklemez. Ana girişler `src/lib/export/resources`, `export/portable`,
`export/raster`, `export/sequence`, `audio/render` ve `mcp/output` altındadır.
Genel optimizasyon hedefi ve Export E0 geçişi henüz tamamlanmamıştır.

## Bütçe, kuyruk ve sahiplik

`editorOutputResources`, mevcut `editorResourceBudget` ile aynı 512 MiB oturum
bütçesini kullanır. Ayrı bir global bütçe oluşturmaz. Kendi alt sınırı 448 MiB /
4096 kayıttır. İki aktif iş, sekiz bekleyen iş ve bekleme dahil on dakikalık
deadline vardır. Bu sınırlar allocation/admission politikasıdır; browser/native
codec, OfflineAudioContext, sürücü, network, GC veya toplam process RAM sınırı
değildir. Alt/üst bütçeler birbiriyle veya bilinen kaynak toplamıyla toplanmaz.

- `OutputResources.run`: dış iş ve sonuç için bağımsız `ResourceLease` verir.
  Son tüketici `release()` çağırmalıdır. `retain()` bağımsız pin oluşturur.
- `OutputScope`: işin geçici/kalıcı borrow'larını ve child scope'larını tutar.
  Scope handle'ları `retain` sunmaz; dışarı kaçırılamaz. Child scope aynı
  allocator'ı paylaşır; kare başına yeni dış kuyruk işi oluşturulmaz.
- `own` native/senkron factory'den önce reserve eder. Factory kısmen
  oluşturduktan sonra hata atıyorsa kısmi kurulumun temizliğini kendisi yapar.
- `prepare` actual native promise'ı bekler. Timeout/abort sonucu erken bırakmaz.
  Abort edilen aktif iş ve backing, native işlem gerçekten bitene kadar kalır.
  Bekleyen iptal edilmiş iş factory'yi çalıştırmaz.
- Scope kapanırken pending native child parent backing'i kullanıyorsa parent
  temizliği ertelenir. Native disposer hatası kaydı ve charge'ı quarantine'de
  tutar. `clearIdle()` bir kez açık retry yapar; otomatik tekrar döngüsü yoktur.
- `ResidentResourceCache.tryReserve` mevcut katı `reserve` sözleşmesini koruyan
  nullable kapasite portudur. Bounded reader kendi ticket'ını commit/release
  eder; output ve input aynı alt/üst ledger'dan geçer.

`downloadOutput` sonuç pinini ve `assetSourcePool` Blob URL pinini beş saniyelik
sonlu handoff süresince korur. Setup/click hatası ikisini de temizler. Bu süre
disk yazımının bittiğine dair platform sinyali değildir. Consumer kendi pinini
hemen bırakabilir. Serbest kalan JS/native RAM'in anında düştüğü iddia edilmez.

## Raster ve kare dizisi

`acquireRasterImage` output işi açar; `renderRasterFrame` aynı işin iç adımıdır.
`acquireOutputCanvas` mevcut RGBA hesaplama ve CanvasMemoryTracker'ı kullanır.
Boyut doğrulama/admission DOM backing'den önce yapılır. Release piksel backing'i
sıfırlar. Her yüzey en fazla 128 MiB ve eksen başına 16384 pikseldir.
`encodeOutputCanvas` yüzey + encode working-set politikası + encoded Blob için
overlap kabul eder. Actual Blob cap'i ayrıca doğrulanır. Native encoder'ın iç
peak belleği ölçülmez. Mask/efekt/backend limitleri mevcut renderer'a aittir.

Mevcut çözünürlük davranışı korunur: önce kompozisyon boyutunda çizim, ardından
bitmap upscale. Vektörü hedef çözünürlükte yeniden çizmek Export E0 sonrası
kalite işidir. JPEG şeffaf zemin uyarısı, sampling ve renk davranışı korunur.

`acquireSequence` tek dış iş ve tek job-owned VisualMediaSession kullanır.
Her karenin child scope'u ZIP devraldıktan sonra kapanır. Varsayılan cap'ler
4096 kare, 256 karakter pattern, 128 MiB ZIP ve 4096 ZIP girdisidir. Bunlar
üst sınırdır; aynı anda tutulan record/byte bütçesi daha önce reddedebilir.
Sampling hâlâ `i*1000/fps`, kare sayısı eski rounded hesaplamadır.

`ZipWriter` eski STORE ZIP32 header/CRC/order algoritmasını `ZipRecords` ile
korur; CRC'nin tek sahibi mevcut `format/checksum` modülüdür. Byte-array add
immutable Blob kopyası oluşturur. `addBlob` actual-byte bounded read ile CRC
hesaplar; frame başına kalıcı büyük Uint8Array tutmaz. Input + final Blob
overlap construction öncesi bütçelenir. `finishOwned` writer'ı tüketir.
`dispose` pending read'in gerçek cleanup'ını bekler. Legacy `finish` tekrar
çağrılabilir; döndürdüğü raw Blob'un sonraki ömrü dış caller'a aittir.

## Offline ses

`acquireAudioMix` sonucu pinlidir; `renderAudioMixInScope` composed MCP adımıdır.
`OfflineAudioGraph` native context/node ve source PCM pinlerinin sahibidir.
Soğuk graph kabul edildikten sonra context açılır; kısmi setup state'i temizleme
için saklanır. Native render actual settlement'e kadar await edilir. Graph
metadata/context PCM tahmini, returned Float32 PCM ve exact WAV allocation
birbirinden ayrı kabul edilir. `wavByteLength` mevcut encoder'ın exact limit ve
boyut hesabının ortak sahibidir. Beklenmeyen native boyut/rate açık hata verir.

Node buffer/disconnect temizliği başarılmadan source PCM pinleri bırakılmaz.
Başarısız detach, graph'ı charge'ıyla karantinada tutar; kardeş clip'ler yine
temizlenir. OfflineAudioContext'in close API'si yoktur; bitişte native referanslar
bırakılır. Native audio zaman birimi saniye, authored timeline zamanı ms olarak
kalır; eski schedule, gain/pan automation, frame count ve PCM16 encoding korunur.

## Portable proje, JSON/base64 ve MCP

`acquirePortableScene` dış owned API, `portableSceneInScope` composed adımdır.
Kaynak URL'leri gerçek IO boyunca pinlenir. Asset `runtime` alanı clone'dan önce
çıkarılır; DOM/decoder nesnesi clone edilmez. 500 asset, 32 MiB UTF-16 serialized
scene ve 16 MiB actual embedded-file sınırları vardır. `BoundedBinaryReader`
response body'yi aynı output allocator üzerinden okur; `response.blob()` veya
geç kontrol edilen unbounded arrayBuffer kullanılmaz. MIME header 1024 UTF-16
birim ile sınırlıdır. Unknown plain source fields ve stable ID'ler korunur.

`format/json/measureJson` tam string oluşturmadan native JSON.stringify uzunluğunu
UTF-16 ve UTF-8 için hesaplar. Escape, lone surrogate, array hole, undefined
omission, null/nonfinite JSON karşılığı ve 0/2-space indent kuralları kapsanır.
Cycle, accessor, toJSON ve native instance açık reddir; normal plain JSON source
verisi hedeflenir. Protocol ayrıca nonfinite/unsafe alan doğrulamasını sürdürür.
`assertScene` artık büyük stringify oluşturmadan boyut/structure preflight yapar.

`outputBase64` mevcut btoa çıktısını korur; bounded chunk/binary-string/flatten
politikası ve sonuç UTF-16 string'i native dönüşümden önce kabul edilir.
`outputUtf8` exact encoder byte sayısını önceden sayar. `outputJson` string kopya
ve fetch-body politikasını serialization öncesi kabul eder. Bunlar engine'in
gerçek object/rope/native copy boyutu ölçümleri değildir.

`withEditorReply` browser bridge'in production girişidir: native output,
serialized reply ve kaynaklar actual `fetch` settlement'e kadar aynı işin
sahipliğinde kalır. Disconnect stale yanıtı yayımlamaz; delivery hatası mutasyonu
yeniden çalıştırmaz. Wire şeması değişmez. Preview bounded canvas/toBlob yolu ile
aynı downscale/frame'i üretir. Sequence archive 24 MiB transport cap'ini writer
başından itibaren uygular. Runtime optimizer, source-node metadata politikası
altında eski şemasını üretir. Runtime schema kayıpları bu optimizasyonda çözülmez.

Legacy `exportRasterImage`, `exportSequence`, `renderAudioMix`, `portableScene`
ve `executeEditorJob` bounded construction + raw handoff adapter'larıdır. Returned
raw değerin sonradan caller'da tutulması managed sahiplik değildir. Production
raster/sequence/WAV kontrolleri ve MCP bridge pinli/in-scope API'lere taşındı.

## UI ve panel

`useOutputOperation` double-click guard, document abort, unmount, cancel ve stale
progress/result denetiminin ortak sahibidir. Busy actual producer settlement'e
kadar kalır; geç sonuç download/toast oluşturmaz. Raster/sequence/WAV alanları
bu hook'u kullanır. Product UI İngilizcedir.

Resources → Media, Output preparation satırlarında active/queued/denied/cancelled,
overlapping output policy charge, pending/protected ve failed cleanup gösterilir.
Yeni poller yoktur. Output charge'ları `knownBytes` RAM toplamına eklenmez;
canvas'lar zaten tracker'da sayılır. `ProjectResourceMonitor.clearIdle` output
ve daha önce eksik olan visual owner explicit retry'sını da çağırır. Aktif
pinler korunur; işler iptal edilmez.

## Minimal kullanım

```ts
import {acquireRasterImage} from '@/lib/export'
const result=await acquireRasterImage(scene,assets,{format:'png',timeMs:500},{signal})
try {
  await consume(result.value.blob) // gerçek tüketim bitene kadar pin tutulur
} finally {
  result.release()
}
```

Private host, `OutputResources({budget:hostBudget})` verir. İç iş başka
`run()` çağırmaz; `scope.child()` ve in-scope kernel kullanır. Output → media
kuyruğu yönü vardır; media → output ters bekleme eklenmemelidir.

## Kanıt ve açık kalanlar

OPT29 mevcut kontrol noktası: 253 dosya / 2055 test; TypeScript, MCP ve Next
build geçti. Gerçek Chrome 25/25: altı raster codec/scale RGBA eşliği ve
metadata/uyarıları, iki ZIP frame eşliği, archive cap cleanup, native WAV exact
byte eşliği, portable source, gerçek development StrictMode hook/panel/cancel,
stale unmount ve final zero-owner kontrolü. Fixture'nın gate'i tamamlanmış native
sonucun teslimini tutar; devam eden native encoder diye etiketlenmez. Unit
testleri ayrıca bekleyen native callback/render/read/transport iptalini sınar.
Ham kanıt `artifacts/performance/opt29-output-ownership-20261108` altındadır.

Bu tarihsel kontrol noktası tek başına §12.28 satır 3'ü kapatmıyordu. Ana sayfadaki eski raw
JSON/HTML/runtime save/download, SVG dialog/builder ve diğer persistence
serialization yollarının admission/tüketim ömrü denetimi sürer. MCP SVG'nin
UTF-8/base64/reply kopyaları bağlıdır; SVG string builder'ın allocation öncesi
preflight'ı açık kalır. Browser'ın gerçek MCP reply teslimi ve download handoff
entegrasyonu ayrıca doğrulanacaktır. Four Seasons bu kontrol noktasında yeniden
ölçülmedi; CPU/bellek iyileşmesi iddiası yoktur.

Bu kalan entegrasyon ve doğrulama [metin çıktısı ve kayıt sahipliği](text-output-and-persistence.md)
ile tamamlandı; güncel durum roadmap §12.35'tedir. Bu bölümün yukarıdaki
253/2055 ve native 25/25 sayıları ilk checkpoint'e aittir.

Sonra satır 4: 10×48 sn, seek/pan/zoom, 50 undo-redo/project switch, panel
overhead, heap/process plateau ve native A/V senkronu. Önceki CPU p95 gerilemesi
açıktır; bu yeni output testleri CPU kabulü yerine geçmez. Ardından Export E0.
