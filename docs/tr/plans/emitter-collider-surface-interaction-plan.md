# Emitter, collider ve yüzey hedefleri — 2D sahne geometrisi etkileşim planı

**Tarih:** 17 Kasım 2026
**Durum:** Uygulama öncesi ana alt plan
**Kapsam:** 2D partikül, rigid fizik, sıvı, duman/ateş ve sahne geometrisi arasındaki kaynak, çarpışma ve yüzey takibi ilişkileri

Bu belge şu ürün sorularını tek bir mimari karar altında toplar:

- Bir emitter sahnedeki yazı, spline, shape veya `Mesh2D` nesnesini kaynak olarak seçebilir mi?
- Partiküller seçilen bir yüzeyin üzerinde veya konturu boyunca hareket edebilir mi?
- Yazının üzerinde alev, duman ya da sıvı üretilebilir mi?
- Yazı, spline veya mesh collider olarak kullanılıp üstünde top yığını oluşturulabilir mi?
- Sıvının görünen dış yüzeyi parçacıklar yaklaşınca birleşip uzaklaşınca ayrılabilir mi?

Kısa cevap: **Evet; ancak bunlar tek bir “emitter target” seçeneği değildir.** Kaynak üretimi, çarpışma ve yüzey boyunca hareket üç ayrı ilişki ve üç ayrı sözleşme olarak kurulmalıdır.

## 1. Ürün kararı: üç açık ilişki

Her simülasyon tarifi aşağıdaki ilişkilerden yalnızca ihtiyaç duyduklarını kullanır:

| İlişki | Kullanıcı anlamı | Sistem sorumluluğu |
|---|---|---|
| **Emit From** | Parçacıklar veya gövdeler nereden doğacak? | Geometriden deterministik konum, teğet, normal ve ağırlık örnekler. |
| **Collide With** | Hareket hangi nesnelere çarpacak veya hangi engellerden geçemeyecek? | Collider, segment, bileşik şekil, maske veya signed-distance sorgusu üretir. |
| **Follow Surface** | Hareket hangi kontura/yüzeye yapışacak ya da onun boyunca akacak? | En yakın nokta, teğet, normal, yüzey koordinatı ve ayrılma koşulunu verir. |

Aynı sahne katmanı birden fazla rolde seçilebilir; roller kullanıcı tarafından ayrı ayrı atanır. Bir katmanın görünür olması onu otomatik collider yapmaz. “Sahnedeki her görünür katmanla otomatik çarpış” davranışı ilk sürümde bulunmaz.

Bu plan yeni bir “2D Poly modelleme” nesnesi veya topoloji düzenleme modu eklemez. `Mesh2D`, spline/shape'ten türetilen sabit topolojili 2D deformasyon ve render yüzeyidir; 3D Poly/modelleme sistemi ayrı 3D planında kalır.

Bu ayrım aşağıdaki hataları önler:

- yazıyı emitter seçince istemeden katı engel haline gelmesi,
- collider seçilen şeklin otomatik olarak yüzey boyunca sürükleme uygulaması,
- sıvı yüzeyi ile sabit topolojili `Mesh2D` deformasyonunun aynı veri yapısına zorlanması,
- görsel partikül ile rigid gövde üretiminin aynı solver davranışı sanılması.

## 2. Hedeflenen kullanım örnekleri

| Örnek | Emit From | Collide With | Follow Surface | Solver / görünüm |
|---|---|---|---|---|
| Yazının üstünde alev | Glyph dış hattı veya yukarı bakan glyph kenarları | İsteğe bağlı aynı yazı | İsteğe bağlı kısa süreli kontur takibi | Stilize fire partikülü; daha sonra grid fire/smoke |
| Yazıdan çıkan duman | Glyph dolgu alanı veya dış hat | Yazı ya da başka engeller | Genellikle gerekmez | Density/temperature grid veya görsel partikül |
| Yazının üzerinden akan sıvı | Ayrı emitter, glyph alanı veya kontur | Yazı glyph collider'ı | İsteğe bağlı adhesion/tangent flow | Sıvı partikülleri + Blob Surface |
| Yazının üzerinde top yığını | Yazının üstündeki alan/ayrı emitter | Yazı glyph collider'ı | Gerekmez | Rigid circle body üretimi |
| Spline boyunca kıvılcım | Spline/path | İsteğe bağlı engeller | Aynı spline | Görsel partikül veya hafif fizik |
| `Mesh2D` yüzeyinden parçacık | Vertex, edge veya triangle area | `Mesh2D` sınırı/yüzeyi | Edge veya triangle yüzeyi | Partikül, sıvı veya efekt tarifi |

“Yukarı bakan kenar”, yalnızca ekranın küçük `y` değeri değildir. Seçilen yerçekimi, buoyancy veya emitter yönüne göre normal yönü test edilir. Böylece döndürülmüş yazı ve nesnelerde davranış korunur.

## 3. Mimari sınır ve önerilen sözleşmeler

Bu adlar uygulama öncesi öneridir; gerçek public API uygulama sırasında mevcut modüller aranıp uyumlu sözleşmeler genişletilerek kesinleştirilir.

### 3.1 Kalıcı referans

`SceneGeometryRef`, simülasyon tarifinin sahne nesnesine olan kalıcı ve sürümlenebilir referansıdır:

- kararlı `layerId`,
- geometri rolü ve örnekleme modu,
- ilgili timeline/instance kapsamı,
- kaynak revizyonu veya varlık sürümü,
- koordinat uzayı,
- gerekli kalite/çözünürlük profili.

Sahne JSON'u yalnızca bu kaynak veriyi ve parametreleri saklar. DOM, Canvas, GPU handle'ı, solver gövdesi ve yoğun frame buffer'ları normal scene JSON/undo snapshot içine girmez.

### 3.2 Ayrık sorgu sözleşmeleri

- `EmissionGeometryQuery`: seed ve örnek indeksinden konum, teğet, normal, ağırlık ve kaynak alt-kimliği üretir.
- `CollisionGeometryQuery`: mesafe/temas, temas normali, collider materyali ve hareketli sınır hızını sağlar.
- `SurfaceGeometryQuery`: en yakın nokta, teğet, normal, arc-length veya barycentric yüzey koordinatı ve geçerlilik bilgisini sağlar.
- `GeometrySourceCompiler`: sahne katmanını solver'dan bağımsız, salt okunur sorgu verisine dönüştürür.

Arayüz ayrımı zorunludur. Sadece emission kullanan bir efekt collision ya da surface API'sine bağımlı olmaz. Solver'lar React bileşenlerini, sahnenin büyük `Layer` union'ını veya renderer handle'larını import etmez; kompozisyon katmanı uygun adapter'ı sağlar.

### 3.3 Adapter sahipliği

İlk adapter aileleri:

- shape ve polygon,
- spline/path,
- text glyph geometrisi,
- `Mesh2D`,
- açıkça seçilmiş group/collection alt nesneleri,
- yalnızca açık fallback olarak raster alpha/SDF.

Adapter'lar aynı topology cache biçimine zorlanmaz. Sabit topolojili `Mesh2D`, değişken topolojili Blob/fluid surface ve grid obstacle maskesi kendi uygun payload'larını korur; ortaklaşan kontur, triangulation, signed-distance ve örnekleme hesapları sözleşmeler üzerinden paylaşılır.

## 4. Geometri yetenekleri ve seçim modları

| Kaynak türü | Emit From seçenekleri | Collide With seçenekleri | Follow Surface seçenekleri |
|---|---|---|---|
| Point/null | Nokta, bounds | Yok | Yok |
| Shape/polygon | Merkez, perimeter, fill | Segment, convex/compound, SDF | Kontur, kenar |
| Spline/path | Path, eşit arc-length, control points | Kalınlaştırılmış path/segment | Path, teğet yönü |
| Text | Glyph fill, outline, üst/yönlü kenarlar | Glyph outline, compound collider, SDF | Glyph konturu |
| `Mesh2D` | Vertex, edge, triangle area | Sınır, triangle/compound veya SDF | Edge, triangle + barycentric |
| Group/collection | Açıkça dahil edilen alt nesnelerin birleşimi | Seçilen alt collider'lar | Seçilen alt yüzeyler |
| Image/raster | Alpha-weighted alan | Alpha/SDF fallback | Kontur fallback |
| Blob/fluid surface | Dondurulmuş frame snapshot, ileri aşama | Dondurulmuş frame snapshot, ileri aşama | İlk sürüm dışında |

Group seçimi “tüm gelecekteki çocuklar otomatik dahil” anlamına gelmez. Dahil edilen çocuk kimlikleri veya açık bir query politikası sürümlenerek saklanır. Böylece dosya yeniden açıldığında aynı sonuç elde edilir.

## 5. Text geometrisi için doğruluk sözleşmesi

Text üzerinde alev, sıvı ve top yığını güvenilir olmak için gerçek glyph geometrisini kullanmalıdır.

- Font hazır olmadan collider/emitter derlenmez; iş `waiting-for-asset` veya açık hata durumuna geçer.
- Font dosyası/sürümü, shaping ve layout sonucu, satır kırımı, harf aralığı ve glyph transformları cache anahtarına girer.
- `measureText` rectangle'ları glyph collider yerine kullanılamaz.
- `A`, `O`, `8` gibi glyph delikleri korunur; bütün yazıyı tek convex hull'a çevirmek kabul edilmez.
- Rigid solver için segmentler veya convex decomposition ile compound collider üretilir.
- Sıvı/grid solver için çözünürlüğü açık bir SDF/obstacle maskesi üretilebilir.
- Surface follow için kontur, arc-length, teğet ve normal bilgisi korunur.
- Exact outline yolu desteklenmiyorsa katman uyumsuz gösterilir; raster alpha/SDF fallback ancak kullanıcı açıkça seçerse ve hedef çözünürlük kaydedilirse kullanılır.

Text içeriği, font, layout veya glyph animasyonu değiştiğinde derlenmiş geometri stale olur. İlk sürüm affine transform animasyonunu ucuzca destekler; her frame değişen text veya glyph başına deformasyon ayrı performans bütçesi ve bake ister.

## 6. Solver davranışları

| Sistem | Geometriyi nasıl kullanır? | İlk hedef |
|---|---|---|
| Görsel partikül | Kaynaktan örnekler; yaklaşık collider ve surface constraint uygular | Kıvılcım, stilize alev, çizgi/yüzey akışı |
| Rigid fizik | Daire/polygon gövdeler üretir; compound collider ile temas çözer | Yazı üstünde top yığını |
| Sıvı partikül solver'ı | Boundary/SDF ile sızıntıyı sınırlar; adhesion/slip uygular | Yazı/shape üzerinde akan sıvı |
| Blob Surface | Sıvı partiküllerinden görünen birleşen/ayrılan konturu üretir | Damlaların birleşmesi ve kopması |
| Grid smoke/fire | Density/fuel/temperature enjekte eder; obstacle maskesi ve boundary velocity kullanır | Yazıdan duman/alev ve engel etrafı akış |
| Cloth | Ortak collider sorgusunu kullanabilir | Kumaşın seçili 2D engellerle çarpışması |

Sıvının görünür yüzeyindeki damlaların yaklaşınca birleşip uzaklaşınca ayrılması **Blob Surface / metaball surface reconstruction** başlığıdır. Bu, rigid partiküllerin birbirine kaynaklanması değildir; partikül solver hareketi hesaplar, Blob Surface değişken topolojili görünür konturu yeniden kurar.

Duman ve ateş aynı UI ailesinde “simulation/effects” olarak bulunabilir, fakat sıvı yüzeyiyle aynı solver değildir:

- ilk aşamada alev görsel partikül + flow field ile stilize edilir,
- ileri aşamada duman/ateş grid üzerinde density, fuel, temperature ve buoyancy alanlarıyla çözülür,
- tam kimyasal combustion ve genel amaçlı Navier–Stokes ürünü ilk kapsamda değildir.

## 7. Collision ile surface follow arasındaki davranış farkı

`Collide With` penetrasyonu önleme, sürtünme, restitution, slip ve obstacle sınır koşullarını yönetir. `Follow Surface` ise parçacığı seçilen kontura/yüzeye projekte eder veya yakınında tutar; tangent hız, offset, adhesion ve detach threshold uygular.

“Sıvı yazının üzerinde aksın” hedefi birkaç seviyeye ayrılır:

1. Yazı collider'dır; yerçekimiyle sıvı harflerin üstünden ve arasından akar.
2. Adhesion, contact angle veya basitleştirilmiş stick/slip ile yüzeye tutunma eklenir.
3. Surface follow ile stilize, kontrollü kontur boyunca akış elde edilir.
4. Gerçek ince film/wetting, kalıntı ve kuruma haritası ileri kapsamdır.

Surface follow çarpışmanın yerine geçmez. Güvenilir sonuç gereken tariflerde iki ilişki birlikte seçilebilir.

## 8. Hareketli ve deforme olan hedefler

- Statik yerel geometri bir kez derlenir ve paylaşılır.
- Yalnızca affine transformu değişen kaynak/collider, yerel geometriyi korur; sabit simülasyon adımında dünya transformu ve sınır hızı örneklenir.
- `Mesh2D` vertex deformasyonu, glyph başına animasyon veya değişken topoloji frame'e özgü sorgu verisi gerektirir; stale/cache/bake maliyeti açıkça raporlanır.
- İlk sürüm statik ve affine hareketli hedefleri kapsar. Canlı değişken topoloji ve yoğun deformasyon daha sonraki aşamaya bırakılır.
- İlk sürüm etkileşim tek yönlüdür: text/shape/`Mesh2D` simülasyonu etkiler; partiküller hedef geometrisini deforme etmez. İki yönlü coupling ayrı bir özellik ve bütçedir.

## 9. UI sözleşmesi

Emitter veya simülasyon paneli üç görünür bölüm taşır:

```text
Source
  Emit From       [ Layer picker… ]
  Sampling Mode   [ Glyph top edges ▾ ]
  Rate / Seed / Normal Offset

Collision
  Collide With    [ + Add layer ]
  WATER / Text    Glyph outline   [Reveal] [Remove]
  Ground / Shape  Compound        [Reveal] [Remove]

Surface
  Follow Surface  [ Optional layer… ]
  Mode             [ Tangent flow ▾ ]
  Offset / Adhesion / Direction / Detach
```

### 9.1 Layer picker

- Scene Explorer üzerinden aranabilir, klavye ile kullanılabilir çoklu seçim sunar.
- Uyumlu nesneleri öne çıkarır; uyumsuz nesneleri gizlemek yerine gerekçesiyle disabled gösterebilir.
- Her seçili satırda ad, nesne türü, geometri modu, yetenek durumu, `Reveal/Select` ve `Remove` bulunur.
- Silinmiş, eksik fontlu, desteklenmeyen veya stale hedef satır içinde hata verir; kullanıcı sorunun hangi hedefte olduğunu görür.
- Hata alanı için yer ayrılır; mesaj görünürken panel düzeni zıplamaz.
- Birden fazla hata olduğunda odaklanabilir kısa özet, ilgili satıra geçiş sağlar.
- Yalnızca hover ile görünen silme/ayar kontrolü kullanılmaz.

### 9.2 Canvas araçları ve overlay

- Emitter kaynağı, collider ve follow surface farklı çizgi biçimi, ikon/etiket ve desenle gösterilir; sadece renge güvenilmez.
- `Emit From` örnek noktaları ve normal yönleri; `Collide With` sınır kalınlığı/SDF bandı; `Follow Surface` tangent okları ve detach bölgesi ayrı overlay'lerdir.
- Overlay'ler final render/export'a girmez.
- Canvas'tan nesne seçme geçici bir picker modudur; seçim bitince önceki araç güvenli biçimde geri gelir.
- Aynı katman farklı rollerdeyse overlay etiketleri rolü açıkça belirtir.

### 9.3 Parametre görünürlüğü

Panel yalnızca seçilen solver ve geometri modunun desteklediği alanları gösterir. Örneğin rigid ball emitter'da restitution görünürken grid smoke emitter'da density, temperature ve fuel görünür. Desteklenmeyen seçenek sessizce yok sayılmaz; capability açıklaması ve gerekçesi gösterilir.

## 10. Cache, stale ve yaşam döngüsü

Derlenmiş geometri cache anahtarı en az şunları içerir:

- kararlı layer/asset kimliği ve source revision,
- timeline ve değerlendirilen frame/zaman,
- geometri rolü ve örnekleme modu,
- koordinat uzayı ve transform sürümü,
- topology/vertex sürümü,
- font/layout/shaping sürümü,
- SDF, mask veya tessellation kalite/çözünürlüğü,
- adapter algoritma sürümü.

Kurallar:

- kaynak değişirse devam eden iş `stale` olur; eski sonuç sessizce güncelmiş gibi kullanılmaz,
- layer silinirse referans otomatik olarak başka nesneye bağlanmaz,
- clone/instance işlemi referansları açık remap politikasıyla taşır,
- undo/redo source parametrelerini geri alır; runtime cache yeniden üretilebilir,
- bake çıktıları source hash ve adapter sürümünü manifestte taşır,
- aynı seed + aynı fixed-step + aynı source snapshot aynı örneklemeyi üretir.

## 11. Uygulama aşamaları

| Aşama | Çıktı | Kabul ölçütü |
|---|---|---|
| **GEOINT-0 — sözleşmeler** | Ayrık emission/collision/surface arayüzleri, `SceneGeometryRef`, capability tablosu, diagnostics | Solver katmanı React/renderer'a bağımlı değildir; eksik capability açık raporlanır. |
| **GEOINT-1 — statik kaynaklar** | Shape, spline, text outline ve `Mesh2D` emission adapter'ları; layer picker | Spline kıvılcımı ve text üst kenarlarından stilize alev deterministik üretilir. |
| **GEOINT-2 — rigid collision** | Text/shape/spline/`Mesh2D` compound collider adapter'ları | `A8` testinde glyph delikleri korunur; toplar yazının üzerinde yığılır, convex hull hatası oluşmaz. |
| **GEOINT-3 — sıvı ve Blob** | Boundary/SDF, adhesion/slip, optional surface follow, Blob Surface | `WATER` üstünde akış ayrılır/birleşir; kütle ve sızıntı toleransları raporlanır. |
| **GEOINT-4 — smoke/fire grid** | Obstacle mask, boundary velocity, density/fuel/temperature injection | Yazıdan duman/alev çıkar; seçili engeller çevresindeki akış taşınır. |
| **GEOINT-5 — hareketli hedefler** | Affine hareketli kaynak/collider; sınırlı deformasyon bake yolu | Dönen `Mesh2D` kaynağı/collider'ı fixed-step seek ve export'ta tutarlıdır. |

Bu sıra ilgili solver'ların ana plan aşamalarıyla birlikte yürütülür; ayrı ve paralel bir ürün motoru oluşturmaz.

## 12. Zorunlu test sahneleri

1. **Text holes:** `A8O` glyph'lerinde collider delikleri ve iç/dış politikası doğrulanır.
2. **Ball pile on text:** farklı boyutta rigid daireler text compound collider üzerinde kararlı yığılır.
3. **Liquid over WATER:** damlalar harflerde bölünür, yakınlaşınca Blob Surface ile birleşir, uzaklaşınca ayrılır.
4. **Fire from FIRE:** kaynak yalnızca seçilen yönle uyumlu glyph kenarlarından doğar; yazının collider olması ayrı toggle'dır.
5. **Spline sparks:** eşit arc-length örnekleme ve tangent yönü, spline düzenlenince stale davranışı doğrulanır.
6. **Mesh source/collider:** vertex, edge ve triangle-area örnekleme ile affine hareketli collider test edilir.
7. **Lifecycle:** layer silme, clone, instance remap, font eksikliği, save/load, undo/redo ve cache invalidation.
8. **Determinism:** aynı recipe/seed/snapshot ile seek, preview, bake ve export frame karşılaştırması.
9. **UI/accessibility:** yalnız klavye ile picker, hata özeti, reveal/remove ve overlay ayırımı.
10. **Render hygiene:** editör overlay'lerinin final render ve portable export'a sızmaması.

## 13. İlk kapsamın dışında

- partiküllerin text/shape/`Mesh2D` geometrisini fiziksel olarak deforme ettiği iki yönlü coupling,
- tam thin-film sıvı, gerçek wetting/contact-angle çözümü, kalıntı ve kuruma haritaları,
- canlı değişken topolojili yüzeylerin genel amaçlı emitter/collider olarak kullanılması,
- genel amaçlı yüksek doğrulukta combustion/CFD ürünü,
- sınırsız glyph başına animasyonun her frame canlı collider'a çevrilmesi,
- otomatik olarak bütün görünür sahne nesneleriyle çarpışma,
- 3D hacim, depth collider ve 3D oyun motoru davranışları.

## 14. Bağlı planlar

- [2D ana geliştirme planı](../production-2d-roadmap.md)
- [2D simülasyon çekirdeği mimarisi](simulation-core-2d-architecture.md)
- [Sıvı, akış, yüzey ve bake planı](fluid-liquid-simulation-bake-plan.md)
- [Fizik, kırılma ve bake planı](physics-fracture-bake-plan.md)
- [2D UI sözleşmeleri](../production-2d-ui-contracts.md)
- [2D/3D ortak temeller](../shared-2d-3d-foundations.md)
