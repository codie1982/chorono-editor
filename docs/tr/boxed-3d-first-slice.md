# Kutulu 3D — ilk model ve kamera dilimi

12 Kasım 2026. Kullanıcının daralttığı ilk teslim: GLB/glTF import, Properties
ayarları ve açık toggle ile fareden kamera kontrolü. Çalışma alanı hâlâ 2D'dir.
Bu belge ilk dilimin gerçek sözleşmesidir; tam 3D workspace/solver planı değildir.

## Kullanım

1. Layers → Add → Media → **3D Model (GLB/glTF)** veya Project → Import File ile
   bir GLB 2 / kaynakları içine gömülü glTF 2 dosyası seçin.
2. İçe aktarılan `model3d` katmanı normal 2D kompozisyon içinde bir kutudur.
   Kamera aracı kapalıyken sürükleme dış kutunun X/Y konumunu değiştirir.
3. Properties içindeki **3D Model** alanında iç XYZ konumu, XYZ dönüşü (derece)
   ve ölçek; **3D Camera** alanında yaw/pitch, mesafe, hedef XYZ ve FOV; **3D
   Lighting** alanında ambient/key ışık şiddetini düzenleyin.
4. Viewport'ta seçili tek model için **Edit 3D camera** açın. Orbit, Pan veya
   Dolly seçip canvas üzerinde sürükleyin. Reset camera başlangıç kadrajına döner.
   Toggle kapatılınca normal 2D seçim/taşıma davranışı devam eder.
5. Kamera hareketi kaynakta saklanır ve çıktıya yansır; tek Undo ile geri alınır.
   Escape devam eden hareketi iptal eder. Numeric Properties, fare hareketinin
   klavye/sayısal alternatifidir. Genel viewport pan/zoom'u ayrı kalır.
6. Portable JSON ile kaydedin; raster görüntü/sequence çıktısı model hazırlığını
   bekler. Model hazır değilse finalde boş görüntü başarı sayılmaz.

Animasyonla/bağlantıyla sürülen bir kamerayı mouse veya Reset ile ezmeyiz:
Timeline anahtarları/controller'lar, paramBindings, property expression, Binding
ve etkin Wire varsa doğrudan kaynak işlemi açık uyarıyla reddedilir. Numeric
Properties ve mevcut Timeline akışı üzerinden düzenleme yapılabilir. Çoklu
seçimde veya thin instance üzerinde kamera aracı açılmaz; source model düzenlenir.

## Koordinatlar ve veri modeli

`Layer.type = 'model3d'`, `Asset.type = 'model3d'`. `Layer.model3d.version = 1`.

- Dış `Layer.transform` değişmez: parent-local 2D piksel, derece ve affine.
- İç modelin `position`, derece cinsinden `rotation` ve scalar `scale` değerleri
  ayrı source payload'ıdır; legacy 2D transform'a z eklenmez.
- Görüntüleme için kaynak modelin bounding-sphere merkezi orijine, yarıçapı bire
  getirilir. Bu dönüşüm ayrı runtime framing group'undadır; vertex, node
  hiyerarşisi, pivot/transform veya dosya içeriği yeniden yazılmaz.
- İç konum ve kamera hedef/mesafesi bu normalize sunum birimlerini kullanır.
  Bu bir fizik dünyası/metre birimi değildir. Source asset her zaman özgün kalır.
- Kamera perspective'tir: yaw/pitch derece, pitch −89..89, distance .1..1000,
  FOV 5..150. Orthographic, roll ve imported camera seçimi ileri dilimdedir.
- Timeline mevcut milisaniye ve ortak evaluated-frame sözleşmesini kullanır.
  `model3d.rotation.y` gibi numeric kanallar aynı source değerlendirmesinden geçer.
  Bu dilim imported animation clip oynatmaz; GLTFLoader'da kullanılmayan animation
  kanallarının runtime buffer'a açılması da durdurulur.

## Sorumluluklar ve giriş noktaları

| Modül | Sahip olduğu sorumluluk |
| --- | --- |
| `src/lib/model3d/types.ts` | Versioned source ve dar prepared-resource sözleşmesi |
| `source/modelDefaults.ts`, `modelDefinition.ts` | Fresh defaults, sayısal doğrulama ve inspector/animation schema |
| `source/readModelDocument.ts` | GLB/glTF container, embedded dependency, node graph, texture-header ve workload admission |
| `source/cameraGesture.ts`, `cameraDrivers.ts` | DOM/Three bağımsız kamera hesabı ve mevcut animasyonu koruma |
| `source/modelCapabilities.ts` | Thin instance doğrulaması ve açık output capability sınırı |
| `src/lib/import/handlers/asset/ModelHandler.ts` | Mevcut import pipeline/creator source ownership ve atomik commit |
| `resources/ModelAssetService.ts` | Bounded reader, preparation queue, model lease/cache ve parser lifecycle |
| `render/ThreeModelBackend.ts` | Ortak WebGL2 context, framing/kamera/ışık, geometri/texture/bitmap dispose |
| `render/modelRendererPlugin.ts` | Hazır 3D yüzeyi mevcut 2D compositing hattına çizme |
| `src/components/canvas/model3d` | Geçici araç modu ve ortak EditorPointerSession üzerinden tek gesture/Undo |

Veri akışı:

```text
File → mevcut ImportManager → ModelHandler → model asset + model layer → tek Undo
Evaluated frame → VisualDemandResolver → VisualMediaSession → ModelAssetService lease
→ ortak ThreeModelBackend → şeffaf yüzey → mevcut 2D affine/mask/effect/compositor
Portable output → aynı source asset bytes + versioned payload
```

`AssetElementMap.modelForAsset` yalnız consumer pin'i yaşarken geçerlidir. Eski
snapshot, aynı asset id'ye sonradan yüklenen kaynakla sessizce eşleşmez. Native
Three sınıfları, WebGL context'i, texture ve yoğun buffer'lar source JSON,
Undo/Redo veya editor session verisine girmez. Copy payload'ı bağımsız kopyalar;
live instance mevcut InstanceResolver üzerinden source'un görsel verisini alır.
AssetIndex ve asset silme/referans akışları yeni model referanslarını da izler.

## Kaynak sahipliği ve sınırlar

- Dosya başına 16 MiB; embedded glTF JSON için 12 MiB sınırı.
- En fazla 8 glTF scene; metadata dizilerinde 1024 kayıt; model graph derinliği
  128, mesh başına 64 primitive, toplam 2048 draw object ve 2 milyon accessor
  elemanı. Çözülecek iş encoded dosya boyutuyla tek başına sınırlandırılmaz.
- Native image decode öncesi PNG/JPEG/WebP header/dimension admission. Texture
  kenarı en fazla 4096 px; toplam model hazırlığı için 96 MiB konservatif tahmin.
- Mevcut `BoundedBinaryReader`, `SharedPreparationQueue` ve
  `ResidentResourceCache` kullanılır. 3D hazırlığı: 1 active / 32 queued; cache
  128 MiB / 8 entry ve mevcut global 512 MiB bütçesi altında çalışır.
- Geometri/input/decoded texture için policy estimate kullanılır; fiziksel RAM,
  bütün driver kopyaları veya gerçek toplam GPU belleği iddiası yoktur.
- Her modele ayrı context açılmaz. Aynı service'in modelleri tek lazy WebGL2
  context'i paylaşır. Surface uzun kenarı 2048 px; back buffers için 16 byte/pixel
  managed reservation kullanılır. Bu bir yüksek kaliteli final renderer değildir.
- Son consumer pin bırakılınca cache'in mevcut kısa idle grace/reclaim politikası
  uygulanır. Son prepared model disposal context'i de kapatır. Geometri,
  materyal, texture ve ImageBitmap temizliği uncharge'dan önce yapılır.
- Parser root hatasında diğer native dependency promise'leri gerçekten
  sonuçlanmadan slot/rezervasyon bırakılmaz. Partial parser association'ları da
  temizlenir; abort/stale sonuç kaynak olarak yayımlanmaz.
- GLTFLoader'ın eksik dokuyu null ile değiştirme davranışı import başarısı
  sayılmaz. LoadingManager hatası izlenir; başarılı diğer decode'lar sonuçlandıktan
  sonra kısmi kaynaklar/bitmap'ler/texture Blob URL'leri temizlenip hata döndürülür.
- WebGL2 yoksa veya context kaybolursa viewport açık placeholder gösterir,
  final raster işi hata verir; başarılı boş çıktı üretilmez.

## Desteklenen ve sonraya kalanlar

İlk dilim: self-contained GLB/glTF, default-pose model hiyerarşisi ve imported
materyaller/textures, sunum transform'u, perspective kamera, iki başlangıç ışığı,
2D kompozisyon ve portable/raster akışı.

External `.bin`/texture companion dosyaları, DRACO/Meshopt/KTX2 codec'leri,
imported camera/clip/rig kontrolü, node bazlı editör ağacı, material override UI,
ortografik kamera, modelleme/IK, 3D fizik/particle/kumaş/sıvı bu dilimde yoktur.
Desteklenmeyen required extension/dependency sessizce atlanmaz. OBJ/MTL, FBX ve
3DS ileride ayrı import adapter/kabul işleri olarak eklenebilir.

SVG exporter model katmanı için mevcut unsupported-layer warning'ini verir.
Basic/native runtime ve yayımlanmış standalone HTML hedefleri model katmanını
atlamaz; açık hata verir. Full SDK 3D teslimi bu kabulün kapsamı değildir. Raster
ve portable source ilk dilimin desteklenen teslim yollarıdır.

## MCP örneği

Önce normal `import_asset` çağrısıyla dosya bytes'ını içe aktarın ve dönen gerçek
id'leri kullanın. Her source değişiminden önce `get_scene` + revision/readToken
zorunludur. Gerçek schema `get_capabilities` ile keşfedilir:

```js
// run_script gövdesi; dış çağrının güncel source authorization alanları ayrıdır.
const model = scene.get('RETURNED_MODEL_LAYER_ID');
model.patch({ model3d: { rotation: { y: 30 } } });
```

`Layer.patch` mevcut model camera/asset/diğer rotation alanlarını korur.
`Layer.set` ve `replace_layer_fields` nested replacement yapar; güncel nesnenin
kardeş alanlarını korumak çağıranın sorumluluğudur.

## Doğrulama

Birim testleri `src/lib/model3d/model3d.test.ts`, gerçek GLTFLoader ve başarısız
native decode sahiplik testi `src/lib/model3d/ModelAssetService.test.ts` içindedir.
İkinci test yalnız Node ortamında bulunmayan bitmap decoder'ı kontrollü promise
ile değiştirir; loader/queue/cache/budget gerçektir. BIN chunk ve dönüştürülmüş
parent içeren GLB ayrıca gerçek yükleyicide hazırlanır. Gerçek browser/GPU fixture'ı:

```sh
node scripts/model3d/prepare-browser.mjs
node scripts/perf/serve.mjs /private/tmp/chorono-model3d-browser 4330
```

Ayrı sekmede Run acceptance checks ve Run camera checks düğmelerini kullanın.
Üretim SceneCanvas/Properties/editor/import/renderer bileşenleri çalışır; bağlı
kullanıcı editörünün sahnesi veya session storage'ı kullanılmaz. Browser raporu
hem gerçek WebGL/RGBA/texture/portable import akışını hem DOM pointer event kabulünü
ayırır. Native trusted mouse kontrolleri ayrıca Orbit → Undo → toggle-off 2D move
akışında gözlenir. Tek fixture bütün cihazların hız/bellek kabulü değildir.

Ana kontroller: `npm test`, `npx tsc --noEmit`, `npm run mcp:build`, `npm run build`.
Hedef checkout'un Next sunucusu install/build sırasında kapalı olmalıdır.

12 Kasım 2026 ilk dilim kabulü:

- `npm test`: **373 dosya / 3011 test**; yeni 3D alanında 16 test.
- `npx tsc --noEmit`, `npm run mcp:build`, `npm run build`: başarılı.
  Next build'de mevcut `applicationBuildInfo.ts` JSON named-import uyarısı devam
  eder; bu dilimde o modül veya davranışı değiştirilmedi.
- `npm run cli:build`: dağıtılan skill kopyaları yeniden üretildi;
  `npm run cli:test`: **16/16**. Yerel port açan testler sandbox dışı çalıştırıldı.
- Ayrı gerçek browser fixture'ında **11 render/import/portable/texture kontrolü**
  ve **11 kamera/2D/tek Undo kontrolü** geçti. Kamera kontrol suite'i gerçek DOM
  bileşenlerine PointerEvent gönderir; işletim sistemi mouse testi sayılmaz.
- Ayrıca Chrome'un gerçek mouse akışında ilk 2D drag, Orbit, tek Undo ve
  toggle-off sonrası ilk 2D drag gözlendi. Properties Z sayısal değişimi yalnız
  iç konumu değiştirdi; Undo geri getirdi. Bağlı kullanıcı sahnesi değiştirilmedi.

Tam ürün/çok cihaz/uzun süreli 3D performans kabulü veya export kalite/parity
fazının bittiği iddia edilmez. Sırada onaylı Editable Poly 2D ve UV/görünüm
işleri bulunur; ileri kutulu 3D ve son genel optimizasyon sırası korunur.

Referanslar: [Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),
[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
