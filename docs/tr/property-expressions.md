# Canlı sayısal özellik ifadeleri — E−1.5A / A2

11 Kasım 2026. A2; source'ta saklanan, açık timeline saatinde hesaplanan
sayısal özellik driver'ıdır. A1 sabit formülleri ve eski dosyalar korunur.
A3 boolean/koşul, A4 diğer türler/adapter'lar ve A5 birleşik kabul ayrıca kalır.
Bu teslim 3D geliştirmesini başlatmaz.

## Kullanım

Kayıtlı sayısal alanın fx/çift tıklama düzenleyicisinde **Live on timeline**
seçilir. Timeline ve adlandırılmış kaynaklar seçilip Apply formula uygulanır.
Input o karenin sonucunu gösterir; kaynak sayı authored fallback olarak kalır.
`timeMs`, `timeSec`, `timeNormalized` seçilen timeline'ın local saatidir; pi/e
sabittir, trigonometrik girişler radyan, sonuç hedef alanın kaynak birimindedir.
Loop/ping-pong ve açık segment/authoring clock adapter'ı ortak evaluator'dan gelir.

**Convert to value** incelenen karenin geçerli sayısını source'a yazar.
**Keep authored value** canlı tarifi kaldırıp eski authored sayıyı tutar.
When applied moduna geçip Apply yapmak, canlı tarifi sabit formülle tek Undo'da
değiştirir. Kaynak değişirse taslak korunur fakat Apply/Convert engellenir;
Review current source gerekir. Hedef değişince eski taslak başka nesneye taşınmaz.

Source hatası, çevrim, eksik timeline, tür/bounds/finite hatası input'ta görünür;
target pre-driver değeri korunur. Bağımlı ifadeler hatalı upstream sonucunu
geçerliymiş gibi kullanmaz. Key/controller/binding/path/Wire target'ları
sessizce silinmez veya ezilmez. Mevcut keyed kanala yeni driver eklemek yerine
ayrı alan veya açık bake/convert kullanılır. Viewport'ta canlı transform driver'ı
doğrudan source pozisyonu gibi sürüklenmez; önce bake/convert gerekir.

## Source API ve MCP

Yeni bir araç veya `layer.expression()` metodu eklenmedi. `get_capabilities`
canlı özellik verisini ve `replace_layer_fields` patch şemasını açıklar.
Fresh `get_scene` revision/readToken sonrası `run_script` içinde mevcut
`Layer.set/patch` kullanılır. Aşağıdaki örnek, okunan mevcut Hero card ve intro
timeline'ında width'in boş/uygun olduğunu doğruladıktan sonra uygulanır:

```js
const hero = scene.find('Hero card');
if (!hero) throw new Error('Hero card not found');
const clock = scene.timeline('intro');
const data = hero.data;
hero.set({propertyExpressions:{version:1,fields:{
  ...(data.propertyExpressions ? data.propertyExpressions.fields : {}),
  'size.width':{resultType:'number',formula:'height+20*sin(2*timeSec)',
    timelineId:clock.id,sources:{height:{layerId:hero.id,
      propertyPath:'size.height',valueType:'number'}}}
}}});
```

Her kaynak stable layerId + layer-local propertyPath veya layerId olmadan
scene parameter ID'sidir. Değişken adları identifier'dır; clock/constants ve
prototype isimleri ayrılmıştır. Kaynaklar finite **number** verir; numeric
string veya boolean bu yeni sayısal bağlamda otomatik çevrilmez. Legacy Wire'ın
scene-parameter coercion davranışı korunur. Scriptler hâlâ isolated QuickJS'de
çalışır; formül host JS, dosya/network erişimi veya per-frame script değildir.

Optional `Layer.propertyExpressions: {version:1,fields:{[path]:definition}}`
yalnız formül/ref/clock/bounds bilgisini saklar. A1 `inputExpressions` ayrı
sabit tariftir. İkisi aynı target'ta birlikteyse açık conflict tanısı vardır.
Generic native/script commit, import ve history decode payload şeklini/bütçesini
denetler; açılışta formül yürütülmez. Eksik referans silinmez, tanıyla korunur.

## Sahipler ve kare akışı

- `src/lib/core/expression/ExpressionProgramCache.ts`: kaynak/context tutmayan,
  512 programlık LRU; mevcut güvenli parser Wire ve live için ortaktır.
- `src/lib/core/graph/dependencyOrder.ts`: Wire validator ve live graph'ın tek
  iterative cycle/downstream helper'ı, O(V+E).
- `src/lib/expression/properties`: versioned DTO/validation, numeric schema
  capability, weak source plan, birlikte driver değerlendirmesi ve bake sampler.
- `src/lib/runtime/evaluateSceneFrame.ts`: timeline/host base → parameter
  bindings → linear bindings → Wire/live driver graph. Saat ilerletmez ve olay
  kuyruğunu tick etmez. Stateful host kendi base/param frame'ini sağlar.
- `src/lib/editor/inputExpressions`: CAS komutları; source tarifi/fallback,
  Convert/Remove ve native-key bake birer atomik Undo/Redo adımıdır.
- `src/components/inputs/expressions`: gerçek frame paylaşımı, kaynak picker'ı,
  açık preview ve bake review. Input başına timer/RAF/evaluator kurulmaz.

Legacy Wire→Wire pre-wire snapshot anlamı korunur. Yeni expression→Wire ve
Wire→expression bağımlılıkları ortak sırada çözülür; karşılıklı çevrim/failure
fallback verir. Frame haritası source değildir. SDK player, editör, renderer,
static SVG ve motion-blur alt kareleri aynı deterministic adapter'ı kullanır.
SM-owned timeline'lar inactive/active/blend katkısı taşır; ayrı implicit saat
oluşturulmaz. Editör lock/frozen bayrağı çalışan bir ifadeyi durdurmaz.

Planlar immutable scene identity ile weak cache'tedir; eski scene/history
sadece cache nedeniyle tutulmaz. Program cache yalnız metin/AST/hata tutar,
source/DOM/GPU/context tutmaz. En fazla 512 live driver/scene, 128/layer,
16 named source/driver, 4096 formül karakteri; canonical parser 1024 token/adım
ve 64 derinlik sınırı uygulanır. Clone/Array genişlemesi allocation öncesi bu
bütçeyi de kontrol eder. Yoğun frame çıktıları JSON/Undo'ya girmez.

## Clone, bake ve çıktı

Native Copy/Array internal named layer refs'i ortak forest map'iyle remap eder;
external layer/parameter/timeline kimlikleri korunur. Transform driver'ında
yerleşim parent'ı kullanılır, formüle rastgele ofset eklenmez. Array delay local
saat eşlemesinden sonra bir kez uygulanır. Animation scope dışındaki tarifler
kopyalanmaz; instance bağımsız animasyonu için mevcut resolved source adapter'ı
kullanılır. Linked appearance ile animasyonun bağımsızlığı aynı eski sözleşmedir.

Saved live formülde **Bake to keyframes → Preview bake → Apply bake**, açık
composition-ms aralığında mevcut FPS/tolerans algoritmasını kullanır. Yeni
non-looping timeline farklı source timeline saatlerini proje zamanında doğru
örnekler. Diğer timeline/key/source sayılar korunur. Parametreler Preview anında
yakalanır. En fazla 20.000 sample, iki milyon muhafazakâr expression işi ve
mevcut simplification bütçesi vardır. Cancel/stale/invalid sample atomiktir.
Sampler hedefin expression/Wire/binding kaynak zincirini bir kez çıkarır;
ilgisiz katman ve native track'leri her sample'da yeniden değerlendirmez.
Bu özel scope source/Undo'ya yazılmaz ve mevcut timeline saatlerini korur.
Aralık dışında ilk/son baked değer tutulur; live driver tüm aralıklar için
kaldırılır. Rapor sample/midpoint hatasını gösterir; sürekli matematiksel eşlik garantisi
vermez. SM geçişlerini koruyamayan global-time bake açıkça reddedilir; bunun için
ayrı state recording gerekir. Bu ret raster/SDK canlı playback desteğini kapatmaz.

Full-scene Web SDK canlı veriyi değerlendirir. Modern runtime paketinde tarif
korunur ve runtime gereksinimi uyarısı döner; basic/native runtime export ve
animated SVG, explicit native-key bake ister. Static SVG seçilen zamanı, raster
çıktı gerçek kareleri hesaplar. Desteksiz format canlı tarifi sessizce düşürmez.
SDK/runtime bundle asset hazırlığı dar entegrasyon kapısında ayrıca doğrulanır.

Domain/adaptör testleri local clock, named source sırası, eski Wire anlamı,
ortak cycle/fallback, SDK/SM, render/SVG, clone/Array/ref/instance, bounded cache,
atomic Convert/bake, source validation ve portable/history round-trip'i kapsar.
Gerçek UI fixture'ı `scripts/perf/numeric-expression.mjs` ile üretilir; kullanıcı
oturumundan ayrı origin/IndexedDB'de test edilir. Four Seasons/512 MiB ve bütün
input/viewport kapsamı A5/V6 kabulündedir; A2 bu kapıları tamamlandı saymaz.
