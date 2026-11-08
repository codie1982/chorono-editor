# GPU çalışma kümesi sahipliği

2D blur/glow/shadow, accumulation motion blur ve instanced particle backend'leri
aynı admission ve boşta bırakma sözleşmesini kullanır. Bu çalışma tam VRAM/işlem
RAM muhasebesi veya Export E0 değildir. Font/native decode/output peak ve uzun
bütün-editör kabulü ayrı kalır.

## Giriş noktaları ve sorumluluklar

| Modül | Sahip olduğu sorumluluk |
| --- | --- |
| `render/gpu/resources/GpuStorageOwner.ts` | Tek mutable workspace'in pending/resident charge'ı, senkron borrow koruması, streaming pass pin'i ve idle cleanup. |
| `render/gpu/resources/index.ts` | GPU-local **192 MiB / 64 kayıt** bütçesini editor-wide **512 MiB / 4096 kayıt** ile ResourceBudgetGroup üzerinden birleştirir. |
| `render/gpu/resources/buildWebGLProgram.ts` | Shader compile/link ve geçici shader/başarısız program cleanup'ı. |
| `render/gpu/effects/GpuEffectBackend.ts` | İki texture, FBO, quad ve default canvas; context loss/restore ve sayısal tanı. |
| `GPUImageEffects.ts`, `GPUMotionBlur.ts` | Blur/accumulation çizim algoritmaları, kendi program/uniform'ları. |
| `render/gpu/particles/WebGLParticleResources.ts` | Packer staging, VBO/VAO/program ve particle storage ownership. |
| `WebGLInstancedQuadBackend.ts` | Draw/blend/projection, native events ve isteğe bağlı timer query. |
| `render/renderMotionBlurAccumulated.ts` | Sabit kompozisyon zamanlarından örnekleme; tek leased CanvasSurfacePool sample ve GPU pass için try/finally. |

Yeni LRU/FIFO algoritması yoktur: ResourceBudget/ResourceBudgetGroup yeniden
kullanılır. ResidentResourceCache immutable/retired decoded değerler için kalır;
aynı GL workspace'ini yerinde boyutlandırmanın transaction/borrow sözleşmesi
farklı olduğundan GPU owner ayrı, dar bir yaşam döngüsü adaptörüdür. Mevcut
ParticleBufferPacker serileştirme ve 1,5× headroom kuralı korunur.

## Veri akışı ve tahmin birimleri

1. Backend backing-pixel boyutlarını ve gerekecek staging/VBO kapasitesini hesaplar.
2. Aynı storage kullanılıyorsa owner yalnız korur. Değişecekse **eski + tam yeni
   çalışma kümesi** birlikte bütçeye sığmadan native allocate/resize çalışmaz.
3. Başarılı native mutation sonrası yeni ticket commit edilir, eski tahmin bırakılır.
4. Çağıran GPU canvas'ını aynı senkron çağrı zincirinde kopyalar/composite eder.
5. İlk queued microtask'ta job koruması bırakılır; pass pin'i yoksa storage global
   pressure için reclaimable olur. Son kullanımdan yaklaşık **2.000 ms** sonra
   tek idle timer native depoları bırakır. Timer browser throttling'e tabidir.

RGBA8 tahminleri:

- Effect workspace: `width × height × 4 × 3 + 48` byte. Üç color store: source
  texture, intermediate texture, default canvas. FBO aynı attachment'ı tekrar
  saymaz; ek pixel allocation değildir.
- Particle workspace: `width × height × 4 + 48 + VBO capacity + staging capacity`.
  Önceden 50.000 parçacık için store açılmaz; ilk gerçek talep kadar büyür.
- Texture'lar sadece boyut değişiminde allocate edilir. Aynı boyuttaki kaynak
  pikselleri premultiplied/flip-Y ayarlarıyla `texSubImage2D` üzerinden yüklenir.
- Sabit MAX_TEXTURE_SIZE limiti context başına bir kez alınır; restoration'da
  yenilenir. Her blur çağrısında senkron capability sorgusu yapılmaz.

Bu sayılar driver kopyalarını, shader binary'lerini, browser swapchain/decode
overhead'ini veya deferred deletion'ın fiziksel tepe değerini ölçmez. Bootstrap
context/capability probe ve bounded shader/handle metadata için kesin byte yoktur;
workspace yokken backend canvas'ı sıfır boyuttadır. OS RAM/VRAM'in aynı anda sıfıra
indiği iddia edilmez. Yerel ve ortak ledger birbirleriyle toplanmaz.

## Borrow, pass ve failure sözleşmesi

Mevcut `gpuImageEffects.blur`, `gpuMotionBlur.begin/addSample/finish` ve particle
`draw/canvas` girişleri korunur. Sonuç GPU canvas'ı caller-owned değildir;
**aynı senkron çağrı zincirinde**, başka backend çağrısı veya await öncesinde
tüketilir. Asenkron iş kendi Canvas2D kopyasını/lease'ini edinmelidir.

Motion blur `begin` bir pass pin'i alır; `finish`, `cancel`, native failure ve
context loss onu bırakır. Beklenen örnek sayısı tamamlanmadan veya yanlış boyutlu
native sample sonrasında başarılı kısmi görüntü yayınlanmaz. Orchestrator sample
surface admission/nested render/composite hatalarında da sample ve pass'i bırakır.

`GpuAdmissionError` RangeError alt türüdür. Donanım yokluğu için mevcut CPU/CSS
fallback korunur; bütçe reddi sessiz bir backend/kalite değişimine dönüştürülmez.
Render/export/MCP çağıranları bu hatayı normal failure akışında ele almalıdır.
Native allocation/FBO completeness ve shader hataları ayrı failure yoludur.
GpuBackendUnavailableError kalıcı shader/capability eksikliğini işaretler.
Parçacıklarda geçici upload/allocation hatasından sonra sonraki valid frame tekrar
denenir; sıfır boyutlu backing backend'i kalıcı devre dışı bırakmaz.

Cleanup başarısız olursa eski/yeni tahmin korunur ve owner tekrar kullanılmaz.
Timer veya polling retry döngüsü oluşturmaz. Backend tanısında
`cleanupFailed` ve panelde **Cleanup failed · still charged** görünür. Explicit
**Release unused resources** owner'ın `clearIdle` işlemini çağırıp cleanup'ı
yeniden dener. Canlı job/pass borrower'ları korunur. Dispose sırasında başarısız
owner tanı registry'sinde tutulur; başarılı retry sonrası unregister edilir.

Context loss mevcut borrowed sonuçları geçersizleştirir ve storage'ı temizler.
Restoration eager texture/VBO yaratmaz; sonraki draw yine preflight'tan geçer.
Dispose listener'ları kaldırır; disposed backend restore ile dirilmez.

## Kaynak paneli

GpuWorkSnapshot'ın `drawKind`, `textureBytes`, `cleanupFailed` alanları optional'dır;
legacy tanı kaynakları derlenmeye devam eder. GpuWorkRegistry `clearIdle` yeteneği
de optional source operation'dır. Polling/observe kaynak yaratmaz/temizlemez.

ProjectResourceMonitor texture byte'larını **bir kez** known-resource toplamına
ekler. Default WebGL canvas CanvasMemoryTracker'dan, VBO/staging kendi sayaçlarından
zaten gelir; shared budget yeniden eklenmez. Eski raporlar texture'ları içermediği
için raw known peak artışı doğrudan native bellek artışı diye yorumlanmaz.
Panel effect pass ile instanced draw/instance sayısını ayrı etiketler; unavailable
texture/timer ölçümü sıfır gibi sunulmaz. Sistem GPU yüzdesi halen bilinmiyor.

## Küçük kullanım örneği

Backend'lerin üretim composition'ı varsayılan ortak allocator'ı kullanır. İzole
bir job/test kendi ResourceAllocator'ını constructor'ın optional parametresinde
verebilir. Örneğin mutable native workspace sahibi:

```ts
const owner = new GpuStorageOwner(allocator, () => destroyNativeStores())
owner.prepare(estimatedBytes, () => allocateOrResizeNativeStores())
consumeSynchronously()
// Streaming iş varsa bağımsız pin:
const releasePass = owner.hold()
try { await completeStreamingPass() } finally { releasePass() }
// Shutdown/context loss: borrowed sonuçlar artık geçerli değildir.
owner.clear()
```

Owner buffer üretmez; `allocateOrResizeNativeStores` ve destructor aynı native
depoları kapsamalıdır. Update/destruction senkron çalışır. Production sahne JSON,
undo, portable save/load veya scripting şemasına runtime class/handle eklenmez.

## Doğrulama

Owner testleri preflight, old+new peak, current-job borrows, streaming pins,
idle pressure/grace, generation invalidation ve cleanup quarantine'ı kapsar.
Shader testleri ikinci shader ve link failure dahil ownership cleanup'ını doğrular.
Orchestrator testleri nested render ve sample admission failure'ında finally'yi
kontrol eder. Panel/monitor testleri texture accounting ve etiket ayrımını kapsar.

`scripts/perf/gpu.mjs` immutable pre-change algorithm snapshot'larıyla standalone
native fixture hazırlar. Native test browser GPU'sunda exact RGBA, admission,
reclaim/rebuild, blur/particle/motion context loss/restore ve gerçek paneli doğrular.
MCP authoring/remote upload yoktur. [Ham kanıt](../../artifacts/performance/opt18-gpu-ownership-20261107/README.md)
bu küçük fixture'ı Four Seasons CPU ve bütün-editör kabulünden ayrı tutar.
