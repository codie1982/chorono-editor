# 2D rigid-body bake temeli

Bu belge ilk çalışan Simulation Core / rigid-body dikey diliminin gerçek
sözleşmesini tanımlar. Kapsam bir dinamik dikdörtgen, statik dikdörtgen
collider'lar, sabit adımlı Matter.js simülasyonu ve sonucu sıradan timeline
track'lerine bake etmektir. Voronoi kırılma, cluster/secondary destruction,
polygon collider, ortak panel ve worker bu dilimin devam işleridir.

## Giriş noktaları ve sorumluluklar

- `src/lib/simulation/SimulationClock.ts`: integer tick tabanlı ortak saat;
  solver adımı, output örnekleme aralığı ve kesin terminal sample'ı üretir.
- `src/lib/physics/RigidBodySceneCompiler.ts`: desteklenen rectangle layer'ları,
  fizik ayarlarını ve görsel pivotu immutable `RigidBodyBakeRecipe` içine alır;
  source/recipe hash üretir. Solver oluşturmaz.
- `src/lib/physics/PhysicsBackend.ts`: adapter'ın kullandığı küçük solver
  sözleşmesidir. `MatterPhysicsBackend` bunun ilk implementasyonudur.
- `src/lib/bake/adapters/RigidBodyBakeAdapter.ts`: fixed-step simülasyonu
  çalıştırır, dense `RigidPoseClip` preview'su üretir, resource budget uygular ve
  sonucu `RigidPoseTrackCompiler` ile normal `x`, `y`, `rotationDeg` track'lerine
  dönüştürür. Sahneyi değiştirmez.
- `src/lib/editor/commands-rigid-body-bake.ts`: source'u commit anında yeniden
  doğrular; track'leri ve `physics.rigidBakes` sahiplik kaydını tek undo
  transaction'ında ekler.
- `src/lib/physics/PhysicsSceneValidation.ts`: portable proje açılırken bounded
  physics manifestini doğrular. Engine/cache oluşturmaz.

## Veri ve yaşam döngüsü

1. UI/host dinamik ve statik layer rollerini, material/velocity değerlerini ve
   timeline aralığını `RigidBodySceneCompiler`'a verir.
2. Compiler unsupported hierarchy, instance, motion/follow path, non-uniform
   scale ve transform'u zaten süren track/expression/binding/wire durumlarını
   reddeder. İlk dilim yalnız rectangle collider kabul eder.
3. Adapter peak preview bütçesini allocation öncesi ayırır. Matter engine'i
   yalnız hazırlık süresince yaşar ve başarı, hata veya iptalde `finally` ile
   dispose edilir.
4. Tick sıfır dahil olmak üzere örnekler dense runtime clip'e yazılır. Adapter
   her tick'te abort kontrol eder ve sınırlı aralıklarla event loop'a döner.
5. Preview clip, normal track'ler ve budget reservation'ı birlikte sahiplenir.
   `release()` idempotenttir. Dense clip scene JSON/undo içine girmez.
6. Commit yalnız normal track'leri ve küçük recipe/ownership manifestini
   persist eder. Playback, export ve final render mevcut evaluator/renderer
   yolunu kullanır; Matter.js tekrar çalışmaz.

## Zaman, koordinat ve birimler

- Scene koordinatı kompozisyon pikseli, `+Y` aşağıdır.
- Açılar ekran uzayında saat yönünde ve derece cinsindedir. Dense clip açıyı
  wrap etmez; tam dönüşler lineer track'e korunur.
- UI yerçekimi metre/saniye², hız piksel/saniye, açısal hız derece/saniyedir.
  `pixelsPerMeter` SI-facing değerlerle piksel sahnesi arasındaki açık ölçektir.
- İlk varsayılan solver saati 120 Hz, output örneklemesi 30 fps'tir. Output hızı
  solver hızını tam bölmeli ve süre integer tick'e oturmalıdır.
- Layer `x/y` görsel yerleşimi ile solver'ın kütle merkezi ayrıdır. Off-centre
  anchor dönüşümü iki yönde uygulanır; bake başında pivot sıçramaz.

Matter `Runner` veya Matter renderer kullanılmaz. Adapter her adımı
`Engine.update(engine, 1000 / stepHz)` ile açıkça ilerletir. Kullanıcı yerçekimi
değeri `pixelsPerMeter` üzerinden Matter gravity alanına çevrilir; engine runtime
nesneleri serializable veri değildir.

## Kısa kullanım örneği

```ts
const recipe = new RigidBodySceneCompiler().compile(scene, {
  timelineId: 'main', startTimeMs: 0, durationMs: 3000,
  stepHz: 120, sampleFps: 30, pixelsPerMeter: 100,
  gravityMetersPerSecondSquared: { x: 0, y: 9.81 },
  bodies: [dynamicBox, staticFloor],
})

const adapter = new RigidBodyBakeAdapter()
const job = bakeService.createJob({
  kind: adapter.kind,
  label: 'Bake falling box',
  source: recipe.source,
  isSourceCurrent: () => isRigidBodyBakeSourceCurrent(recipe, readScene()),
  prepare: context => adapter.prepare(recipe, context),
  discardPreview: preview => preview.release(),
})

await job.start()
await job.commit(preview => dispatch(makeApplyRigidBodyBakeCmd({
  recipe, tracks: preview.tracks, sampleCount: preview.report.sampleCount,
})))
```

## Bütçe, determinism ve bilinen sınırlar

Varsayılan retained preview limiti 64 MiB'dir. Adapter dense time/pose
buffer'ları, kopya peak'i, tahmini JS key/track maliyeti ve 64 KiB çalışma payını
`preview` kategorisinde bütçeler. Aynı source, recipe, Matter sürümü ve fixed
tick sırası aynı kimlikleri üretir. Hash'ler browser-portable change detector'dır;
kriptografik dosya integrity checksum'ı değildir.

Bu ilk dilim uzun işi cooperative chunk'larla iptal edilebilir tutar; dedicated
simulation worker ve checkpoint henüz yoktur. Ayrıca track simplification
yapılmaz: her output sample lineer keyframe olur. İlk doğruluk referansı
korunduktan sonra simplification ayrı politika olarak eklenmelidir.

Sıradaki fizik dilimi aynı `SimulationClock`, recipe, backend ve bake yaşam
döngüsünü kullanarak Voronoi source geometry + cluster ownership üretir. Fixed
topology mesh deformation ile değişken topolojili fracture parçaları aynı cache
biçimine zorlanmaz.

## Doğrulama

`SimulationClock.test.ts` kesin tick/sample invariant'larını;
`RigidBodySceneCompiler.test.ts` pivot round-trip ve unsupported source
reddini; `RigidBodyBakeAdapter.test.ts` gerçek Matter düşme/collision sonucunu,
bütçe ve iptali; `RigidBodyBakeCommit.test.ts` portable save/load, runtime
export, solver-free playback ve exact undo'yu doğrular. Renderer değişmediği
için canlı kabul testi normal track'lerin başlangıç, düşüş ve zeminde durma
karelerini `render_preview` ile karşılaştırmalıdır.
