# Mesh2D görünüm ve deformasyon runtime'ı

Bu belge, MESH2'nin çalışan görünüm, playback, seçim ve GPU/Canvas render
dikey diliminin gerçek kaynak sözleşmesini tanımlar. Genel Poly 2D modelleme ve
kumaş solver'ı bu dilimin parçası değildir.

## Giriş noktaları ve sorumluluklar

- `src/lib/types/mesh2d.ts`: portable appearance, pin ve deformasyon asset
  bağlantıları. Dense sample buffer burada veya normal timeline keyframe'lerinde
  tutulmaz.
- `src/lib/mesh2d/Mesh2DAuthoring.ts`: texture, portable texture yerleşimi,
  pin preset'i ve deformation bağlantısını saf/undo-uygun tam layer snapshot'ı
  olarak üretir.
- `src/lib/mesh2d/Mesh2DTextureMapping.ts`: renderer ve canvas tutamaçlarının
  ortak fit/offset/scale/rotation/pivot/flip matrisini üretir.
- `src/lib/mesh2d/deformation/MeshDeformationClip.ts`: doğrulanmış runtime clip
  ve zamana göre x/y interpolasyonu.
- `src/lib/mesh2d/deformation/MeshDeformationBinaryCodec.ts`: ham binary
  serializer/decoder.
- `src/lib/asset/meshDeformation/MeshDeformationAssetService.ts`: bounded fetch,
  decode, cache, iptal ve pin/release sahipliği. Platform `fetch` çağrısı gerçek
  browser receiver'ına bağlıdır; Blob URL yüklemesi Chrome/WebKit'te aynı
  sözleşmeyi kullanır.
- `src/lib/import/handlers/asset/MeshDeformationHandler.ts`: `.chmd2d` magic,
  boyut ve codec doğrulamasını import sırasında yapar; portable Blob kaynağı ve
  scalar metadata üretir, sahneye kendiliğinden layer eklemez.
- `src/lib/render/renderers/Mesh2DRendererPlugin.ts`: media demand, clip playback,
  UV texture, GPU dispatch ve rest-mesh/Canvas fallback'i.
- `src/lib/render/gpu/mesh2d`: portable geometriyi de-index edilmiş GPU vertex
  akışına dönüştürür; WebGL1/2 kaynaklarını bütçeler ve transparan tam-backing
  sonucu mevcut Canvas2D kompozitörüne aktarır.
- `src/lib/geometry/resolveLayerWorldBounds.ts` ve `src/lib/renderer.ts`:
  hazır deformation clip'i varsa render ile aynı frame pozisyonlarını bounds ve
  triangle hit-test için kullanır.
- `src/components/PropertiesPanel/Mesh2DSourcePanel.tsx`: asset seçimi, playback
  zamanı/hızı/loop, pin preset'leri ve eksik kaynak tanısı.
- `src/components/PropertiesPanel/Mesh2DTextureControls.tsx`: Stretch, Contain,
  Cover, Fit X/Y, Original fit seçenekleri ile sayısal texture yerleşimi.
- `src/components/canvas/mesh2d/Mesh2DTextureOverlay.tsx`: `T` aracıyla move,
  uniform scale ve rotation tutamaçları; işlem başına tek undo kaydı.

## Veri akışı ve yaşam döngüsü

Katman `textureAssetId` yanında küçük bir `textureTransform` kaydı, pin vertex
kimlikleri/topology hash'i ve küçük bir deformation playback kaydı saklar.
Transform yokluğu eski projelerin tam-bounds Stretch davranışıdır. Texture
yerleşimi geometri, UV, topology hash, pin veya deformasyon clip'ini değiştirmez.
Renderer frame talebi image ve
`meshDeformation` asset'lerini mevcut media closure'a ekler. Binary loader,
fetch input'u ile decoded typed buffer'ı dönüşüm sırasında ayrı ayrı bütçeye
alır; başarılı clip cache pin'i bırakılana kadar kullanılabilir. Eski frame
snapshot'ı pin bırakıldıktan sonra clip'i döndürmez.

Clip topology hash'i ve vertex sayısı rest mesh ile eşleşmeden hiçbir dense
buffer kullanılmaz. Asset soğuk, eksik, bozuk veya stale ise renderer bütün
rest mesh'i çizer. Texture hazır değilse ya da bir UV triangle dejenereyse
bütün mesh solid fill'e düşer; kısmi texture/boş üçgen üretilmez. Final render
media hazırlığı eksik asset'i başarı kabul etmez.

Bounds, point picking, marquee/paint seçimi, selection gizmo, Fit Selection ve
sürükleme başlangıç bounds'u aynı borrowed `MeshDeformationBindings` snapshot'ı
üzerinden aynı clip resolver'ını çağırır. Bu snapshot yoksa veya clip stale ise
hepsi rest mesh'e döner. Deformation'ın zamana/asset'e bağlı bounds'u mevcut
statik paint capability sözleşmesinden güvenle hesaplanamadığı için viewport
culling bu katmanlarda kapatılır; rest bounds ile yanlışlıkla görünür bir frame'i
elemek yerine çizim korunur.

Texture ve UV yerleşimi doğrulandığında WebGL backend deforme x/y pozisyonları
ile kaynak-normalize UV'leri tek triangle stream'e çevirir. Güncel Canvas affine
matrisi parent/repeater/zoom/backing ölçeklerini GPU clip-space'e taşır; layer ve
fill opacity GPU pass'ine bir kez uygulanır. Transparan WebGL canvas identity
transform ile mevcut Canvas2D hedefe kompozitlenir; böylece scene blend, mask ve
effect-chain orkestrasyonu tek renderer girişinde kalır. WebGL yokluğu/context
loss, max texture sınırı, invalid UV/placement, hazır olmayan texture veya legacy
Canvas filter durumunda katmanın tamamı mevcut triangle Canvas2D yoluyla çizilir.
GPU bütçe admission hatası kaliteyi sessizce değiştirmez ve açık hata olarak
yükselir.

## Koordinat ve zaman sözleşmesi

Pozisyonlar ve texture offset'leri layer-local kompozisyon pikselidir. Texture
scale değerleri boyutsuz ve pozitiftir; yansıtma ayrı `flipX/Y` bayraklarıyla
saklanır. Rotation x-sağ/y-aşağı ekran uzayında saat yönündedir. Pivot kaynak
görselin normalize `u/v` uzayındadır. Fit sözleşmeleri şunlardır:

- `stretch`: mesh bounds'unu iki eksende doldurur (legacy varsayılan);
- `contain`: oranı koruyarak bütünü gösterir;
- `cover`: oranı koruyarak bounds'u kaplar, taşan bölüm mesh tarafından kırpılır;
- `fitX` / `fitY`: oranı koruyup seçilen ekseni eşler;
- `original`: bir kaynak pikselini bir layer-local kompozisyon pikseli kabul eder.

Clip 2 veya 3 component
saklayabilir; Canvas2D yolu x/y'yi kullanır, z verisini korur fakat çizmez.
Sample zamanları sıfırdan başlayan, kesin artan yerel milisaniyelerdir.
Katman `startTimeMs`, pozitif `playbackRate` ve `loop` ile kompozisyon zamanını
clip zamanına dönüştürür. Örnekler arasında doğrusal vertex interpolasyonu
yapılır.

## Binary biçim

Ham v1 dosyası şu sıradadır:

1. sekiz byte `CHMD2D01` magic;
2. little-endian `uint32` JSON header uzunluğu;
3. UTF-8 header (`topologyHash`, vertex/component/sample sayısı ve provenance);
4. little-endian `Float64` sample zamanları;
5. little-endian `Float32` sample-major vertex pozisyonları.

Decoder desteklenmeyen sürümü, taşan boyutu, trailing/truncated byte'ı,
non-finite pozisyonu ve yanlış buffer uzunluğunu reddeder. Compression ve
key-pose azaltma ayrı codec sürümü gerektirir; v1 anlamı sessizce değiştirilmez.
`application/x-chorono-mesh-deformation` MIME türü veya `.chmd2d` uzantısı genel
import pipeline'ından geçer. Import yalnız asset kaydını üretir; hedef Mesh2D
katmanına bağlama, topology hash doğrulamasını koruyan ayrı bir authoring
işlemidir.

## Kısa kullanım örneği

```ts
const clip = new MeshDeformationClip({
  topologyHash: mesh.geometry.topology.topologyHash,
  vertexCount: mesh.geometry.topology.vertexIds.length,
  componentCount: 2,
  sampleTimesMs: Float64Array.from([0, 100]),
  positions: packedPositions,
})
const bytes = new MeshDeformationBinaryCodec().encode(clip)
```

Bu byte'lar `type: 'meshDeformation'` asset olarak proje paketi/asset storage'a
yazılır; layer'a dense array yerine asset kimliği bağlanır.

## Bilinen sınırlar

Canvas tutamaçları offset, uniform scale ve rotation sunar; eksenleri ayrı
ölçekleme, pivot, flip ve kesin değerler inspector'dadır. Texture crop maskesi
Mesh2D triangle yüzeyidir; ayrı editable crop-rect veya UV vertex boyama bu
dilimde yoktur. GPU yolu yalnız texture görünümünü hızlandırır; solid/gradient,
legacy Canvas filter ve başarısız doğrulama Canvas2D'de kalır. Deforme layer için
frame-aware konservatif paint bounds sözleşmesi eklenene kadar viewport culling
bilinçli olarak devre dışıdır. Pin authoring şu anda top edge, corners ve
boundary preset'leri sunar; tekil vertex canvas seçimi ayrı UI dilimidir.
