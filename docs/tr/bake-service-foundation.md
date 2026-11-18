# Typed BakeService temeli

Bu belge BAKE0 ortak kontrol düzleminin gerçek uygulama sözleşmesini tanımlar.
İlk çalışan adapter sayısal Track Bake'tir. BAKE1 sabit topolojili Mesh2D
deformasyonunu, BAKE2 ilk rectangle rigid-body simülasyonunu aynı yaşam
döngüsüne ekler. Fracture, particle/grid/surface ve raster sonuçları daha sonra kendi typed
recipe/payload adapter'larıyla eklenir. Bu temel 2D üretim sırasına aittir; 3D
workspace, 3D renderer veya Character/IK payload'ı açmaz.

## Giriş noktaları ve sorumluluklar

- `src/lib/bake/BakeService.ts`: sınırlı job kuyruğunun ve aktif runtime
  handle'larının ömrünü yönetir. Scene, worker algoritması veya asset sahibi
  değildir.
- `src/lib/bake/BakeJob.ts`: tek job için
  `idle → queued → running → preview-ready → committing → completed` akışını;
  `cancelled`, `stale` ve `failed` uçlarını uygular.
- `src/lib/bake/BakeContracts.ts`: adapter, source identity, progress, snapshot
  ve handle sözleşmeleridir. Preview payload runtime verisidir; sıradan scene
  JSON'una veya undo snapshot'ına yazılmaz.
- `src/lib/bake/adapters/TrackBakeAdapter.ts`: mevcut bounded numeric baker'ı
  kullanır. Yeni bir evaluator veya simplification algoritması kurmaz.
- `src/lib/bake/adapters/MeshDeformationBakeAdapter.ts`: solver'ın örneklediği
  sabit topolojili vertex pozisyonlarını mevcut clip/codec runtime'ına bağlar.
- `src/lib/bake/adapters/RigidBodyBakeAdapter.ts`: ortak integer-tick saati ve
  Matter backend'i ile pose preview üretir; sonucu normal transform track'lerine
  derler. Engine ömrü yalnız prepare aşamasıdır.
- `src/components/timeline/baking/useTrackBakeJob.ts`: canlı editör track'i,
  document lifetime ve var olan tek-undo komutu arasındaki UI adapter'ıdır.

`BakeService` domain algoritmasını bilmez. Değişebilen hesaplar
`BakeAdapter<TRecipe, TPreview>` arkasındadır. Ağır native/worker işleri daha
sonra aynı servise `JobExecutor` ile bağlanabilir; kuyruk kapasitesi işi worker'a
taşıdığı anlamına gelmez.

## Veri akışı

1. Feature adapter'ı serializable recipe ve kaynak kimliği oluşturur.
2. UI/host, canlı kaynağı salt-okunur karşılaştıran `isSourceCurrent` predicate'i
   ile bir job oluşturur.
3. `start()` bounded executor'a kabul ister. Adapter `AbortSignal` alır ve
   normalize edilmiş ilerleme yayınlar.
4. Hazırlanan typed preview yalnız job snapshot'ında tutulur. Track adapter'ında
   bu veri yeni `Track` ve kalite raporudur; dense sample buffer saklanmaz.
5. Kaynak belge/track değişirse job `stale` olur ve preview bırakılır.
6. Kullanıcı açıkça Apply dediğinde servis kaynağı tekrar kontrol eder ve
   caller'ın atomik komutunu bir kez çağırır. Track komutu ayrıca tam source
   equality, timeline sınırı ve undo snapshot'ını doğrular.

Commit callback'i synchronous tek source transaction'ıdır. Dosya, worker veya
native cache hazırlığı commit içinde bekletilmez; bunlar preview aşamasında
tamamlanır ve commit yalnız hazırlanmış sahipliği sahneye bağlar.

```ts
const service = new BakeService({ concurrency: 1 })
const adapter = new TrackBakeAdapter(sourceTrack)
const job = service.createJob({
  kind: adapter.kind,
  label: 'Bake position',
  source: recipe.source,
  isSourceCurrent: () => isSameTrackBakeSource(sourceTrack, readLiveTrack()),
  prepare: context => adapter.prepare(recipe, context),
})

await job.start()
await job.commit(preview => dispatch(makeApplyTrackBakeCmd(
  recipe.timelineId, recipe.target, sourceTrack, preview.track, options,
)))
job.dispose()
service.dispose()
```

## Yaşam döngüsü, iptal ve stale davranışı

Job instance'ı tek kullanımlıdır. Re-preview yeni job oluşturur; önceki handle
dispose edilir. Cancel, sırada bekleyen işi çıkarır veya çalışan işe abort
gönderir. Abort'u dikkate almayan native iş slotu gerçek settlement'a kadar
meşgul kalır ve geç sonuç preview olarak yayınlanmaz. Document reset eski işi
`cancelled` değil `stale` yapar; çünkü sorun kullanıcı iptalinden ziyade kaynak
kimliğinin artık geçersiz olmasıdır.

Progress 0..1 aralığındadır ve aynı job içinde geriye gitmez. Phase/message
adapter'a özgü olabilir. UI tek atomik `role=status` mesajı, yüzde ve yalnız
aktifken progressbar gösterir; loading sırasında Preview devre dışı kalır ve
ayrı **Cancel bake** eylemi görünür. Renk tek durum göstergesi değildir.

Track hesabı bugün bounded ve synchronous'tur. Kuyruk ve abort sözleşmesine
uyar, fakat main-thread hesabının ortasında pointer olayı işlenemez. Bu kısa
hesap için kabul edilen sınırdır. Uzun mesh/simulation/raster adapter'ları
cooperative chunk veya worker kullanmalı; yalnız Promise ile sarmalanmış uzun
synchronous döngü iptal edilebilir sayılmaz.

## Zaman, koordinat ve determinism

Track recipe zamanları seçili timeline'a yerel milisaniye; `fps` saniyedeki
örnek sayısıdır. Aralık inclusive terminal sample üretir. Track değerinin birimi
hedef property'nin birimidir; adapter koordinat dönüşümü yapmaz. Aynı source,
recipe ve evaluator sürümü aynı key kimliklerini üretir. Source identity içindeki
revision bir runtime sürümüdür, kriptografik hash değildir; Track commit tam
structural equality ile korunur.

Kalıcı mesh/particle/raster cache adapter'ları bu runtime revision'a güvenemez.
Onlar source/recipe content hash, payload schema/decoder sürümü, zaman ve uzay
sözleşmesi, byte bütçesi ve sahiplik kaydını kalıcı manifestte taşımalıdır.

## Undo, sahiplik ve sınırlar

Preview source'u değiştirmez ve undo girdisi üretmez. Commit'in tek transaction
olması feature komutunun sorumluluğudur. BAKE0 Track adapter'ı mevcut
`makeApplyTrackBakeCmd` komutunu kullanır; bu komut yalnız hedef track'i
değiştirir, bağımsız scene düzenlemelerini korur ve undo'da önceki timeline'ı
geri getirir.

BAKE0–BAKE2 henüz şunları sağlamaz:

- generated-asset garbage collection,
- physics simulation worker'ı, checkpoint veya tam re-bake ownership eşlemesi
  (rigid track ownership manifesti persist edilir, replacement akışı henüz yoktur),
- ortak Jobs & Bake paneli veya MCP async job araçları,
- Character/IK ve 3D payload adapter'ları.

Sabit topolojili Mesh2D preview/cache adapter'ının kaynak, bütçe, sahiplik ve
solver-free playback sözleşmesi
[`mesh-deformation-bake-adapter.md`](mesh-deformation-bake-adapter.md) içinde
belgelenmiştir. İlk rigid-body sözleşmesi
[`rigid-body-bake-foundation.md`](rigid-body-bake-foundation.md) içindedir. Ana
sıradaki fizik dilimi Voronoi source geometry + cluster/fracture adapter'ıdır;
değişken topolojili Blob/sıvı yüzeyi ayrı cache biçimi kullanır.

## Doğrulama

`src/lib/bake/__tests__/BakeService.test.ts` başarı, tek commit, iptal edilen geç
sonuç, source/document stale ve commit yarışı invariant'larını kapsar.
`TrackBakeAdapter.test.ts` source immutability, bounded recipe, cancellation ve
mevcut baker kullanımını doğrular. Render/UI değişiklikleri gerçek Bake
penceresinde normal, running/cancelled, ready, stale ve failed durumlarıyla
incelenmelidir. Rigid adapter/commit testleri gerçek Matter collision sonucu,
budget release, portable save/load, runtime-export track'leri ve exact undo'yu
kapsar.
