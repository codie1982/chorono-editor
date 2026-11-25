# Mesh2D deformasyon Bake adapter'ı

Bu belge BAKE1 sabit topolojili Mesh2D deformasyon dikey diliminin çalışan
sözleşmesini tanımlar. Dilim bir cloth/physics solver'ı kurmaz; solver veya
prosedürel üreticinin hazırladığı dense vertex örneklerini mevcut
`CHMD2D01` runtime biçimine dönüştürür, bütçeler ve tek undo işlemiyle sahneye
bağlar. Değişken topolojili Blob/sıvı yüzeyleri bu sözleşmenin dışındadır.

## Giriş noktaları ve sorumluluklar

- `src/lib/bake/adapters/MeshDeformationBakeAdapter.ts`: portable recipe'yi,
  rest geometri kimliğini ve sample-major `Float32Array` pozisyonlarını doğrular;
  mevcut `MeshDeformationClip` ve codec üzerinden preview üretir.
- `src/lib/bake/meshDeformation/MeshDeformationBakeAsset.ts`: hazırlanmış
  byte'ları Blob-backed `meshDeformation` asset'ine dönüştürür. Dönen `release`
  callback'i geçici creator ownership'ini idempotent olarak bırakır.
- `src/lib/editor/commands-mesh-deformation-bake.ts`: kaynak geometrisini commit
  anında yeniden doğrular; asset kaydı ile layer playback bağlantısını tek
  undo/redo transaction'ında uygular.
- `src/lib/mesh2d/deformation`: clip, binary codec ve zaman örnekleme
  sözleşmesinin tek yetkili uygulamasıdır. Bake adapter'ı bunları kopyalamaz.
- `src/lib/asset/meshDeformation/MeshDeformationAssetService.ts`: commit sonrası
  asset'i bounded olarak decode/cache eder; renderer solver olmadan bu clip'i
  oynatır.

## Veri akışı ve sahiplik

1. Üretici sabit vertex sıralamasındaki örnekleri
   `[sample][vertex][component]` düzeninde hazırlar.
2. `createMeshDeformationBakeRecipe` rest pozisyonları ile connectivity
   kimliğini hash'ler. Transform, ad ve appearance bu kimliğe girmez; commit
   sırasında yapılmış bağımsız görsel düzenlemeler korunur.
3. `MeshDeformationBakeAdapter.prepare` boyutları, topology hash'ini, zamanları,
   provenance alanlarını ve byte sınırını allocation öncesi doğrular.
4. Preview, clip'i, encoded byte'ları ve resource reservation'ı birlikte sahiplenir.
   `BakeJob` iptal, stale, başarısız commit, başarılı commit veya dispose halinde
   `discardPreview` callback'iyle bu sahipliği bırakır.
5. Commit callback'i encoded byte'ları senkron olarak Blob asset'e kopyalar ve
   `makeApplyMeshDeformationBakeCmd` ile asset + layer binding'i atomik ekler.
   Komut başarılı olduktan sonra asset source pool kalıcı sahipliği taşır.
6. Asset service dosyayı decode eder; mevcut Mesh2D renderer, bounds ve hit-test
   resolver'ları aynı clip snapshot'ını kullanır. Playback sırasında solver
   gerekmez.

Commit synchronous source-write sınırıdır. Worker, solver, encode veya dosya
hazırlığı commit içine taşınmaz. Asset factory çağrısındaki geçici sahiplik,
komut başarısız olsa bile `finally` içinde bırakılmalıdır.

## Zaman, koordinat, kimlik ve bütçe

Sample zamanları clip-local milisaniye ve kesin artandır. Pozisyonlar
layer-local kompozisyon pikselidir. İki veya üç component desteklenir; 2D
renderer x/y'yi kullanır ve üçüncü component'i dosyada korur.

Kaynak revision, topology hash ile rest pozisyonlarının canonical hash'idir.
`sourceRecipeHash` ayrıca solver sürümünü, dış `sourceVersion` değerini, component
sayısını ve örnek zamanlarını kapsar. Pin, field, collider ve solver ayarlarını
özetleyen kararlı `sourceVersion` değerini üretmek çağıranın sorumluluğudur.

Varsayılan ham payload sınırı 64 MiB'dir. Adapter geçici çalışma için
`3 × payload + 64 KiB`, tamamlanmış preview için clip + encoded byte kadar
`preview` bütçesi ayırır. Abort allocation öncesi, clip oluşturulduktan sonra ve
encode sonrasında denetlenir. Source buffer ödünç alınır, değiştirilmez.

## Kısa kullanım örneği

```ts
const recipe = createMeshDeformationBakeRecipe({
  layerId: layer.id,
  geometry: layer.mesh2d.geometry,
  componentCount: 2,
  sampleTimesMs: [0, 40, 80],
  solverVersion: 'cloth-v1',
  sourceVersion: clothInputsHash,
})
const adapter = new MeshDeformationBakeAdapter(
  layer.mesh2d.geometry,
  sampledPositions,
)
const job = bakeService.createJob({
  kind: adapter.kind,
  label: 'Bake mesh deformation',
  source: recipe.source,
  isSourceCurrent: () => isMeshDeformationBakeSourceCurrent(recipe, readLayer()),
  prepare: context => adapter.prepare(recipe, context),
  discardPreview: preview => preview.release(),
})

await job.start()
await job.commit(preview => {
  const prepared = createMeshDeformationBakeAsset(preview, { assetId, name })
  try {
    dispatch(makeApplyMeshDeformationBakeCmd({ recipe, asset: prepared.asset }))
  } finally {
    prepared.release()
  }
})
```

## Doğrulama ve bilinen sınırlar

Adapter testleri binary round-trip, provenance, solver-free playback, kaynak
immutability, byte bütçesi, abort/stale ve reservation leak invariant'larını
kapsar. Commit testleri bağımsız layer düzenlemelerini koruma, asset collision,
undo ve rest-geometri stale reddini doğrular.

Bu dilim persisted `BakeRecord`, generated-asset garbage collection, re-bake
ownership eşlemesi, solver worker/checkpoint, compression veya ortak Jobs & Bake
paneli sağlamaz. Bunlar Simulation Core ve ilgili fizik adapter'larıyla ayrı
dilimlerde eklenmelidir.
