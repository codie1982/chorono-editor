# Mesh2D görünüm ve deformasyon runtime'ı

Bu belge, MESH2'nin ilk çalışan dikey diliminin gerçek kaynak sözleşmesini
tanımlar. Genel Poly 2D modelleme, kumaş solver'ı ve GPU mesh backend'i bu
dilimin parçası değildir.

## Giriş noktaları ve sorumluluklar

- `src/lib/types/mesh2d.ts`: portable appearance, pin ve deformasyon asset
  bağlantıları. Dense sample buffer burada veya normal timeline keyframe'lerinde
  tutulmaz.
- `src/lib/mesh2d/Mesh2DAuthoring.ts`: texture, pin preset'i ve deformation
  bağlantısını saf/undo-uygun tam layer snapshot'ı olarak üretir.
- `src/lib/mesh2d/deformation/MeshDeformationClip.ts`: doğrulanmış runtime clip
  ve zamana göre x/y interpolasyonu.
- `src/lib/mesh2d/deformation/MeshDeformationBinaryCodec.ts`: ham binary
  serializer/decoder.
- `src/lib/asset/meshDeformation/MeshDeformationAssetService.ts`: bounded fetch,
  decode, cache, iptal ve pin/release sahipliği.
- `src/lib/render/renderers/Mesh2DRendererPlugin.ts`: media demand, clip playback,
  UV texture ve rest-mesh fallback'i.
- `src/components/PropertiesPanel/Mesh2DSourcePanel.tsx`: asset seçimi, playback
  zamanı/hızı/loop, pin preset'leri ve eksik kaynak tanısı.

## Veri akışı ve yaşam döngüsü

Katman yalnız `textureAssetId`, pin vertex kimlikleri/topology hash'i ve küçük
bir deformation playback kaydı saklar. Renderer frame talebi image ve
`meshDeformation` asset'lerini mevcut media closure'a ekler. Binary loader,
fetch input'u ile decoded typed buffer'ı dönüşüm sırasında ayrı ayrı bütçeye
alır; başarılı clip cache pin'i bırakılana kadar kullanılabilir. Eski frame
snapshot'ı pin bırakıldıktan sonra clip'i döndürmez.

Clip topology hash'i ve vertex sayısı rest mesh ile eşleşmeden hiçbir dense
buffer kullanılmaz. Asset soğuk, eksik, bozuk veya stale ise renderer bütün
rest mesh'i çizer. Texture hazır değilse ya da bir UV triangle dejenereyse
bütün mesh solid fill'e düşer; kısmi texture/boş üçgen üretilmez. Final render
media hazırlığı eksik asset'i başarı kabul etmez.

## Koordinat ve zaman sözleşmesi

Pozisyonlar layer-local kompozisyon pikselidir. Clip 2 veya 3 component
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

Texture renderer şu anda doğrulanmış Canvas triangle fallback'idir. WebGL
offscreen mesh pass'i ve GPU→Canvas2D compositing adapter'ı sonraki MESH2
dilimidir. Deforme frame dinamik bounds/hit-test'e henüz yansıtılmaz; seçim
bounds'u rest mesh'tir. Pin authoring şu anda top edge, corners ve boundary
preset'leri sunar; tekil vertex canvas seçimi ayrı UI dilimidir. Bu sınırlar
native GPU/deformasyon parity'si varmış gibi raporlanmamalıdır.
