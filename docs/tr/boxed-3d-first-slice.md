# Kutulu 3D — ilk model ve kamera dilimi

12 Kasım 2026. Kullanıcının daralttığı ilk teslim: GLB/glTF import, Properties
ayarları ve açık toggle ile fareden kamera kontrolü. Çalışma alanı hâlâ 2D'dir.
Bu belge ilk dilimin gerçek sözleşmesidir; tam 3D workspace/solver planı değildir.

## Kullanım

1. Layers → Add → **3D Objects → Import GLB / glTF** veya Project → Import File ile
   bir GLB 2 / kaynakları içine gömülü glTF 2 dosyası seçin.
2. İçe aktarılan `model3d` katmanı normal 2D kompozisyon içinde bir kutudur.
   Kamera aracı kapalıyken sürükleme dış kutunun X/Y konumunu değiştirir.
   Select modunda sekiz kenar/köşe tutamacı Width / Height değerlerini değiştirir;
   Properties → **2D Model Box · px** aynı boyutların sayısal alternatifidir.
   Kutu aspect/framing'ini değiştirmek iç model pose veya kamera verisini ezmez.
   Mouse boyutlandırması 4..4096 px aralığında, ortak resize/session/tek Undo
   akışıyla çalışır; source capability sınırında hata placeholder'ına geçmez.
3. Properties içindeki **3D Model** alanında iç XYZ konumu, XYZ dönüşü (derece)
   ve ölçek; **3D Camera** alanında yaw/pitch, mesafe, hedef XYZ ve FOV; **3D
   Lighting** alanında ambient/key ışık şiddetini düzenleyin.
4. Viewport'un mevcut pan/zoom araç grubunda seçili tek model için **3D camera** açın. Orbit, Pan veya
   Dolly seçip canvas üzerinde sürükleyin. Reset camera başlangıç kadrajına döner.
   Toggle kapatılınca normal 2D seçim/taşıma davranışı devam eder.
5. Kamera hareketi kaynakta saklanır ve çıktıya yansır; tek Undo ile geri alınır.
   Escape devam eden hareketi iptal eder. Numeric Properties, fare hareketinin
   klavye/sayısal alternatifidir. Genel viewport pan/zoom'u ayrı kalır.
6. Portable JSON ile kaydedin; raster görüntü/sequence çıktısı model hazırlığını
   bekler. Model hazır değilse finalde boş görüntü başarı sayılmaz.

Animasyonla/bağlantıyla sürülen bir kamerayı mouse veya Reset ile ezmeyiz:
Timeline anahtarları/controller'lar, paramBindings, property expression, Binding
ve etkin Wire varsa doğrudan kaynak işlemi açık uyarıyla reddedilir. Temel sabit
Properties kalır; iç 3D key düzenleme gelecek izole içerik ekranına aittir. Çoklu
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
- Ana Timeline mevcut milisaniye ve ortak evaluated-frame sözleşmesiyle yalnız
  dış 2D kutunun kanallarını yönetir. `model3d.*` iç kanalları burada keylenmez.
  Daha önce kaydedilmiş iç kanallar save/open ve eski değerlendirmede korunur;
  2D editöründe authorable/visible sayılmaz, otomatik silinmez veya taşınmaz.
  Bu dilim imported animation clip oynatmaz; GLTFLoader'da kullanılmayan animation
  kanallarının runtime buffer'a açılması da durdurulur.

## Sorumluluklar ve giriş noktaları

| Modül | Sahip olduğu sorumluluk |
| --- | --- |
| `src/lib/model3d/types.ts` | Versioned source ve dar prepared-resource sözleşmesi |
| `source/modelDefaults.ts`, `modelDefinition.ts` | Fresh defaults, sayısal doğrulama, sabit iç inspector ve dış 2D animation schema |
| `source/readModelDocument.ts` | GLB/glTF container, embedded dependency, node graph, texture-header ve workload admission |
| `source/cameraGesture.ts`, `cameraDrivers.ts` | DOM/Three bağımsız kamera hesabı ve mevcut animasyonu koruma |
| `source/modelCapabilities.ts` | Thin instance doğrulaması ve açık output capability sınırı |
| `src/lib/import/handlers/asset/ModelHandler.ts` | Mevcut import pipeline/creator source ownership ve atomik commit |
| `resources/ModelAssetService.ts` | Bounded reader, preparation queue, model lease/cache ve parser lifecycle |
| `render/ThreeModelBackend.ts` | Ortak WebGL2 context, framing/kamera/ışık, geometri/texture/bitmap dispose |
| `render/modelRendererPlugin.ts` | Hazır 3D yüzeyi mevcut 2D compositing hattına çizme |
| `src/components/canvas/model3d` | Geçici araç modu ve ortak EditorPointerSession üzerinden tek gesture/Undo |
| `src/lib/timeline/authoring/timelinePropertyScope.ts` | Registry'den feature-owned iç property sınırı; key authoring, navigation ve UI projection |

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
fazının bittiği iddia edilmez. Sonraki kullanıcı kararıyla sırada
[dar ortak detay/izolasyon DET0–DET1](plans/shared-item-detail-editor.md),
ardından Editable Poly 2D ve UV/görünüm işleri bulunur; ileri kutulu 3D ve son
genel optimizasyon sırası korunur.

12 Kasım sonraki kapsam kararı: 2D model kutusu standart bir 2D katmandır.
Temel iç model/kamera Properties sabit kalır; `model3d.*` keyleri 2D Timeline'a
karıştırılmaz. Çift tıkla açılan izole 3D detay + iç Timeline henüz uygulanmadı;
[ileri dilim planına](plans/boxed3d-isolated-editor.md) kaydedildi.

## Demo ve kutu boyutlandırma eki

`examples/3d/chorono-robot.glb` yaklaşık 20 KiB self-contained örnektir. Üç ortak
geometri, adlandırılmış gövde/baş/kol/bacak node'ları ve beş PBR materyal içerir.
`node scripts/model3d/create-demo-robot.mjs` mevcut Three primitive/exporter
uygulamasını kullanarak aynı dosyayı üretir; ağ veya external asset gerekmez.
Ürün scene JSON'u üretmez. [Kullanım](../../examples/3d/README.md).

Resize capability mevcut `calculateResize` fonksiyonunun optional `maxSize`
alanıdır; bu alanı vermeyen mevcut 2D çağrılar aynı davranışı korur. Kutunun
azami kenarı inspector/schema, serialized source validation, renderer ve mouse
adapter'ında aynı `MAX_MODEL_BOX_SIDE` sabitinden gelir. Üst sınırda aspect-lock
boyutları beraber azaltır. Parent world matrix, özel pivot, iç model payload'ı,
mevcut animation track'leri ve karşı köşe korunur.

Browser fixture masaüstü panel düzeni için en az 1200 CSS px içerik genişliği
kullanır; küçük browser penceresinde yatay kaydırılabilir. Bu fixture, ürünün
dar ekran kabulü veya tüm platformlarda performans ölçümü değildir.

Bu ekin doğrulaması: **373 dosya / 3014 test**, TypeScript kontrolü, MCP/CLI ve
Next üretim derlemeleri başarılı. Gerçek Add → 3D Objects dosya seçimiyle örnek
robot import edildi; Properties Width değişimi gözlendi. Gerçek browser'da
model kutusu için 6 DOM PointerEvent kabulü geçti: handle görünürlüğü, ilk
pointer-up commit, iç 3D/kamera/asset verisinin korunması, track'lerin korunması,
tek Undo ve Redo. Parent/ters matris/karşı köşe ve capability sınırı birim testinde
ayrıca doğrulandı. Bu altı kontrol OS mouse testi diye raporlanmaz.

Kamera kontrolü artık ayrı sol-alt panel değildir; mevcut viewport pan/zoom
kontrollerine bağlı gruptur. Bu bir inceleme kamerası değil, saklanan çıktı
kamerasıdır. Model pose anahtarları ile kamera anahtarları ayrı hedeflerdir;
yalnız model hareketi varsa kamera guard'ı yanlışlıkla devreye girmez. Kamera
hedefinde key/controller/binding varsa doğrudan mouse/Reset işlemi reddedilir.

GLB kliplerini ana Timeline'a veya kemik başına track'lere aktarma bu ekin
kapsamına alınmadı. Orijinal dosya klipleriyle korunur; bu dilim sabit pozu çizer.
Güncel ileri dilim kararı, kaynak klibi model içinde tutup izole 3D detayın kendi
Timeline'ından klip seçimi/başlangıç/hız/döngü kontrolü yapmak; kemik keylerine
açmayı açık bir ileri işlem olarak sunmaktır. Ayrı inceleme bakışı da sonraki
kamera authoring işidir; bugün mevcutmuş gibi sunulmaz.

Kontrol grubu taşındıktan sonra gerçek browser fixture'ında mevcut **11 kamera /
2D / tek Undo kontrolü** yeniden geçti. Menü, robot, kutu tutamaçları ve yeni
grup konumu gerçek çizilmiş görüntüde incelendi. Son tam koşu yine 3014 testtir.

## 2D key kapsamı — son kabul

12 Kasım kapsam düzeltmesi sonrası **374 dosya / 3020 test** geçti; TypeScript,
MCP/CLI ve Next üretim derlemeleri başarılı. `modelTimelineScope.test.ts`
static Properties + Auto Key, Set Key'nin tüm keyset'leri, explicit native/
script/MCP-adapter key/track girişleri, controller, mixed paste/delete
atomikliği, navigation, ortak Timeline/Curve/Dope projection, clear/undo ve
eski source save/open/değerlendirme eşliğini doğrular.

Gerçek browser'da üretim TimelinePanel ve PropertiesPanel ile robot üzerinde
**All supported channels → Set Key** yalnız altı dış kanal oluşturdu:
`transform.x`, `transform.y`, `transform.scaleX`, `transform.scaleY`,
`transform.rotationDeg`, `opacity`. Properties iç Z değeri `.25` yapılınca
aynı key kayıtları değişmeden kaldı. Bir Undo yalnız statik yerleşimi; sonraki
Undo key eklemeyi geri aldı; Redo aynı altı dış keyi geri getirdi. Görünür
Timeline'da bu altı satır ve Properties'te temel 3D alanları birlikte incelendi.
Browser fixture'da Auto Key'nin Properties bağlantısı taklit edilmez; static
Auto Key ayrımı gerçek domain API ve kaynak adapter testleriyle doğrulanır.

Eski iç keylerin görünümden ayrılması bir veri migrasyonu değildir. Ham source,
portable kayıt ve history snapshot'ları korunur. İzole 3D detay ekranı halen
plandır; 2D authoring korumasını aşan bir raw JSON import/restore çağrısı yeni
bir desteklenen 2D keyleme API'si sayılmaz.

Referanslar: [Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),
[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
