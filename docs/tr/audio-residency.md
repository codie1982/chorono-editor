# Ses PCM sahipliği ve zaman penceresi talebi

Bu katman editörün tuttuğu decoded PCM'i lease ve byte admission ile yönetir.
Ekran dışındaki görsel nesnelerden bağımsızdır: işitilebilir klip devam eder.
Kaynak dosya/Blob URL, ordinary scene JSON ve undo değiştirilmez. Tam tarayıcı
RAM'i, native decoder iç belleği veya bütün medya residency sistemi değildir.

OPT23 güncellemesi: encoded response artık ortak
[sınırlı binary reader](bounded-binary-input.md) üzerinden okunur ve gerçek native
decode bitene kadar input lease korunur. Bu geçici girdi sınırı, decoded PCM
tepesinin metadata ile önceden kontrolünü veya native decoder belleğinin kesin
ölçümünü tamamlamaz; aşağıdaki tarihsel ölçümler kendi teslim kapsamını korur.

OPT28 güncellemesi: desteklenen PCM/IEEE-float WAV dosyalarında actual RIFF chunk
sınırları kontrol edilir ve Float32 output, gerçek AudioContext sample rate'iyle
decode öncesinde reserve edilir. Opaque codec/extensible/RF64/RIFX hâlâ açık
estimate politikasını kullanır; native scratch/copies için RAM garantisi verilmez.
[Native metadata ve kabul sözleşmesi](native-media-admission.md).

## Girişler ve veri akışı

- `src/lib/audio/AudioAssetService.ts`: shared context, URL dedupe, bounded
  fetch/decode ve consumer teslimi. Yeni consumer `acquire/acquireUrl` kullanır.
- `src/lib/audio/AudioPcmCache.ts`: retained PCM, delivery/consumer pin, warm
  grace, retired entry ve yerel bütçeyi ortak ResidentResourceCache'e adapte eder.
  Pin/retire/timer tek implementation'dır; audio buffer API'si korunur.
- SharedPreparationQueue in-flight dedupe/consumer cancellation/delivery
  workflow'unu AudioAssetService ve VisualAssetService için ortak yürütür;
  BoundedJobQueue hâlâ FIFO/native concurrency sahibidir.
- `src/lib/resources/budget/ResourceBudgetGroup.ts`: aynı allocation'ı yerel ve
  global limitlere bağlar; mevcut ResourceBudget LRU/admission algoritmasını
  yeniden kullanır. İki limitin muhasebesi örtüşür, toplanmaz.
- `src/lib/audio/AudioDemandResolver.ts`: mevcut audibleAudioLayers ve
  resolveAudioClipWindow kurallarıyla saf zaman penceresi talebi/index cache'i.
- `AudioEngine.prepareForTime` ve `useAudioEngine`: yalnız talep edilen asset'leri
  hazırlar, eski consumer'ları iptal/bırakır ve hazır olunca en güncel transport'u
  tekrar reconcile eder. Aynı ID/URL kümesi için yeni completion döngüsü oluşmaz.
- Waveform overview/detail, normalize ve mevcut offline mix aynı lease API'sini
  kullanır. Input lease'leri offline render bitene kadar korunur.
- Pending hazırlık orijinal Blob URL'yi kuyruk submission'ından gerçek native
  settlement'e kadar borrowed tutar. [Source owner](asset-source-lifetime.md)
  document/history lifetime'ını yönetir; PCM eviction orijinal URL'yi revoke etmez.

```ts
import { acquireAudioBuffer } from '@/lib/audio/AudioAssetService'

const lease = await acquireAudioBuffer(asset, { signal })
try {
  if (signal.aborted) return // finally still releases a late result
  const peaks = downsampleAudioBuffer(lease.buffer, 512)
  usePeaks(peaks) // peaks contain reduced values, not the PCM buffer
} finally {
  lease.release()
}
```

`asset`, `signal`, reducer ve `usePeaks` consumer'ın girdileridir; yeni public
authoring/MCP API'si değildir. Bir native source PCM'i async kullanacaksa kendi
`lease.retain()` pin'ini alır ve stop/ended/dispose sonunda bırakır. `buffer` veya
`retain()` released lease üzerinde hata verir; duplicate release zararsızdır.
Caller release sonrasında raw AudioBuffer referansı tutmaz. PCM sıfırlanmaz;
son owner referansını bırakır, gerçek GC/RSS zamanı tarayıcıya aittir.

## Admission, pin ve invalidation

Editor singleton'ın PCM owner'ı aynı **512 MiB global ledger**'a bağlıdır.
Yerel önceki 256 MiB cache sınırı artık pending + resident + retired consumer'ları
da kapsar; en fazla 128 allocation kaydı vardır. Bu, plandaki önerilen 64 MiB
audio dağılımının uygulanmış optimum olduğu anlamına gelmez. Profil ayarı ileride
ölçümle değiştirilecektir; şu anda ayrı ikinci 512 MiB cache oluşturulmaz.

Fetch/decode başlamadan önce varsayılan **64 MiB tahmini PCM rezervasyonu** alınır
(private local limit daha küçükse ona kadar). Gerçek decoder sonucu bilindiğinde
`length × channels × 4` ile charge küçülür/büyür. Büyüme limitlere sığmıyorsa yeni
leased consumer RangeError alır; untracked başarılı fallback verilmez. Bu tahmin
decoder-internal geçici kopyaların veya oversize native decode peak'inin kesin
üst sınırı değildir. OPT28, supported WAV output tahminini decode öncesinde
yeniden boyutlandırır; diğer codec'ler tahminle devam eder. Offline output admission
ayrı kalan iştir.

Pending ve pinned PCM global/yerel pressure ile çıkarılamaz. URL başına bir decode
yürür; protected delivery lease'i bütün bekleyen consumer'lar kendi pin'ini alana
kadar tutulur. Son consumer iptali native decode'u durduramıyorsa rezervasyon ve
queue slot'u gerçek settlement'e kadar kalır. Çıkan eski sonuç cache'i diriltemez.

`clear()` lookup'ları invalid eder; aktif PCM retired olur ve son pin'e kadar
charged kalır. Eski caller sonucu alabilir fakat eski generation lookup'a yazılmaz.
`cancelPending()` yeni generation'a geçerek hazırlanmakta olan işleri de iptal
eder. `clearIdle()` yalnız kullanılmayan PCM'i bırakır. Source URL revoke edilmez.
Retired PCM kaynak kimliği yalnız sayısal asset inventory eşlemesi için saklanır;
cache acquire ile tekrar verilmez. Panel onu yanlışlıkla Not resident diye saymaz.

Son pin bırakılınca kaynak 2 saniyeye kadar warm tutulur; tek timer kullanılır.
Global/yerel pressure grace beklemeden idle PCM'i çıkarabilir. Aktif pin veya
pending reservation bulunan kayıtlar clear sırasında kapasiteden düşürülmez.
ResourceBudgetGroup kısmi admission/growth reddinde kendi charge'larını geri alır;
cleanup hatası iki scope'u da protected bırakır.

## Zaman, kapsam ve kaynak paylaşımı

Talep authored composition ms aralığındadır: şu an + ileri yönde **500 ms wall
time × pozitif playback rate**. Paused/unsupported reverse rate için preload
rate 1 kullanılır; native node oynatma davranışı eski sync sözleşmesiyle kalır.
Native node saatleri AudioContext saniyesidir. Seek/offset/loop/fade/pan/gain
değerlendirmesi aynı audio evaluator üzerinden devam eder.

Hidden parent, audio solo ve timeline clone üyeliği mevcut audibleAudioLayers
kurallarıdır. Transform/pan/viewport görsel culling'i kullanılmaz. Static mute
hariç tutulur; gain-zero automation, ileride ses açabileceği için cull edilmez.
Sıfır uzunluklu klip talep üretmez. Source duration metadata'sı erken bitiş için
kullanılmaz; yanlış/kısa metadata'da authored aralık konservatif tutulur. Çok kısa
bir kaynak bu nedenle authored klibin daha uzun aralığında resident kalabilir.

Resolver yalnız mevcut assets/layers/timelines kimliklerini ve küçük scope
kopyasını tutar; eski scene/history biriktirmez. Audio hierarchy/asset index'leri
her kare yeniden kurulmaz. Yeni source/demand gelince metadata karşılaştırılır;
tam scene/URL JSON serialization ile dirty key üretilmez.

Native source kendi pin'ini tuttuğu için cache clear, asset buffer replacement
veya bir başka consumer'ın iptali oynayan source'u bozamaz. Source stop/ended
yolunda buffer null yapılır, node'lar ayrılır ve source lease'i bırakılır. Null
ataması [Web Audio buffer sözleşmesinde](https://www.w3.org/TR/webaudio-1.1/#dom-audiobuffersourcenode-buffer)
desteklenir. Setup/start hatası partial graph ve alınmış pin'i temizler.

## Uyumluluk ve panel

`load/loadUrl/loadAudioBuffer*` raw borrowed dönüşleri deprecated compatibility
yoludur; opaque sonuçlarda büyük uncached eski sonucu döndürme davranışı korunur.
Supported WAV PCM aşımı hem leased hem legacy caller'da decode öncesi reddedilir;
eski raw fallback bu kontrolü atlatmaz. Bu dış raw
referansların evict sonrası belleği takip edilemez. Uygulamanın playback,
waveform, normalize ve offline input caller'ları yeni lease yoluna taşındı.
`AudioEngine.setAssets` explicit preload API'si olarak kalır; ana hook onu bütün
scene assets'i için çağırmaz. Save/load JSON, timeline ve MCP tool şeması değişmez.

Media paneli resident/loading/not-resident/untracked durumlarını ayırır. Kapsam
sağlamayan eski audio adapter'ında bilinmeyen durum loading veya 0 tüketim diye
uydurulmaz. Numeric snapshot LRU/grace'i yenilemez. Yerel PCM charge, pending
estimate ve protected/reclaimable global budget ile örtüşür; known kaynak/heap
toplamına tekrar eklenmez. Release unused resources idle PCM/scratch/LOD'yi
temizleyebilir; original medya, pinned consumer ve undo korunur.

## Kanıt ve kalan kapsam

[OPT13 native raporu](../../artifacts/performance/opt13-audio-residency-20261107/README.md):
14/14 kontrol. 3.002 valid URL kaydıyla yalnız mevcut klibin decode'u; 10 hızlı seek
boyunca iki decode / sabit 38.400 byte PCM; spatial offscreen loop offset'i;
scratch basıncında idle PCM eviction; native graph/hook/detail waveform release;
son private/shared PCM charge 0. Private context 48 kHz, uygulama context'i bu
cihazda 44,1 kHz ölçüldü; byte eşliği gerçek sample rate ile hesaplanır.

Bu kısa fixture uzun bütün-editör/OS RAM kabulünün veya sound-device/acoustic
ölçümün yerine geçmez. Master sessizdir; PCM değerleri ve schedule kontrol edilir.
Source/history URL sahipliği ayrı OPT14 diliminde uygulandı ve doğrulandı.
Image/video/GPU residency, compressed/output preflight, kalan ağır worker/IO
integration ve uzun tam-editör kabulü açıktır.
Export E0 başlamadı; mevcut offline mix yalnız input sahipliği için adapte edildi.

OPT15'te ortak sahiplik çıkarımı sonrası aynı 14 native kontrol tekrar geçti:
PCM değerleri, private 48 kHz/application 44,1 kHz ölçümü, hook/waveform ve final
charge 0 korundu. Visual servis core'u hazırdır; viewport demand/player/export
entegrasyonu henüz yapılmamıştır. [Görsel servis sözleşmesi](visual-media-residency.md).
