# Typed input ve hesaplama sözleşmesi — A4

12 Kasım 2026. A1–A3'ün ortak parser, kaynak koruma ve canlı kare akışını
renk, metin, select ve Vec2 ile genişletir. 3D, Poly/UV, scene Input/Slider
bileşenleri, CFX ve final export motoru bu teslimde uygulanmaz.

## Üç açık yaşam döngüsü

- **When applied:** `Layer.inputExpressions` v1 formülü ve son typed sonucu
  saklar. Normal kaynak alanı authoritative kalır. İnsan alanı değiştirdiğinde
  eski formül kendiliğinden çalışmaz; inspector uyumsuz sonucu bildirir.
- **Live on timeline:** `Layer.propertyExpressions` v1, açık timeline ID ve
  named stable refs ile ortak kare evaluator'ında çalışır. Kaynak yaprakları
  fallback'tir. Her input ayrı timer/RAF açmaz. Job/asset lifecycle alanları
  canlı işlem başlatamaz; capability bunu açıkça reddeder.
- **Calculate once:** Array/ses/guide/key zamanı/bake/export/konfigürasyon
  alanlarının fx penceresi yalnız sonucu mevcut sahibin callback'ine verir.
  UI formülün saklanmadığını ve kare başına çalışmadığını açıkça söyler.
  Draft formunda sonuç önce draft'a girer; mevcut Apply/Cancel kaynak commit'ini
  yönetmeye devam eder. Parametre kontrolleri de bu açık tek seferlik yolu kullanır.

Literal textbox tam taslağı blur/Enter'da bir kez uygular; Escape iptal eder.
Multiline text'te Ctrl/Cmd+Enter uygular. Native select/picker/checkbox tek
literal işlemini korur; fx ayrı düğmedir. Hatalı renk literal'i kaynak rengi
bozmaz. Seçim/hedef değişimi eski draft'ı yeni nesneye yazmaz. Formula draft'ı
concurrent source değişiminde korunur ve yeniden review ister; editör komutu
son senkron source/gesture kontrolünü yapar. Saved/live alanlar explicit
Convert yapılmadan literal olarak değiştirilmez.

## Türler ve birimler

`number`, `boolean`, `string`, `color`, `vec2` strict ailelerdir. Sayı finite,
metin en fazla 4096 karakterdir. Select string'i canonical schema seçeneklerinden
biri olmalıdır. Font weight/style ve blend mode seçenekleri schema/inspector
arasında aynı domain tablolarından gelir. Font family serbest string'dir;
önerilen aileler fontun kurulu olduğuna dair garanti değildir.

- `vec2(x,y)`, `x(vector)`, `y(vector)`; spline için layer-local px.
- `rgb(r,g,b)`, `rgba(r,g,b,a)`, `color(css)`; r/g/b 0–255,
  `rgba` alpha 0–1; kanonik kayıtta alpha dahil RGBA 0–255.
- `red/green/blue/alpha(color)`; alpha accessor 0–1 döner.
- `concat(strings...)`, `str(scalar)`, `fixed(number,digits)`; digits integer
  0–12. Implicit string/numeric/boolean coercion, member access veya host code yoktur.
- Önceki numeric whitelist, strict koşul/kısa devre, pi/e ve live saatler korunur.

Sabit v1 recipe'de eski number kayıtlarının `resultType` alanı yoktur; bunun
anlamı number kalır. Yeni türler `resultType` yazar. Vec2/color data-only record'dur;
AST, runtime class, dense frame cache veya DOM/GPU nesnesi JSON'a girmez.

## Alan ve adapter matrisi

| Alan / sahip | Uygulanan yol | Korunan sınır |
| --- | --- | --- |
| Properties/Schema `ScrubInput` | Kaynak numeric recipe/live; unscoped ayarda Calculate once | Source units/bounds, key/binding/Wire sahipliği, tam literal doğrulama |
| `TextInput`, `BooleanInput`, `ColorInput` | Schema-backed kaynaklarda typed recipe/live; kaynak host'u olmayan ayarda explicit calculation | Native toggle/picker ayrı; enum doğrulaması; text/color Enter/blur tek commit |
| Spline `Vector2Input` | Stable point/handle ID ile Vec2 recipe/live; x/y literal veya calculation | Constant point hareketi bağlı handle'ları taşır; handle coupling domain'de. Live yalnız ilan edilen koordinatı yazar. Keyed/live geometri source drag/topology ile ezilmez |
| Gradient editor | Açık Calculate once, mevcut gradient/stop callback'leri | Positional stop index'i kalıcı live ID gibi kaydedilmez; dış source scope'u miras almaz |
| `ArrayFields`, clone/stagger ve selection ayarları | Calculate once → tool draft/preview | Count/integer/forest/reference doğrulaması ve tek Apply/Undo kendi tool sahibinde |
| `AudioNumberField`, mute/loop | Calculate once → mevcut audio clip/key komutu | ms/dB/pan birimleri, locked klip, gain automation ve clip trim doğrulaması |
| Guide inspector ve selection gap | Calculate once → sayısal draft → mevcut Apply | Composition px; zoom/pointer capture/source transaction ayrı |
| Key inspector/spreadsheet, motion key/drawing/glyph, Timeline süre/transport ayarları | Calculate once → key/time sahibi | ID/easing/diğer key'ler; tam sayı parse; Enter+blur tek commit. Spreadsheet'in nonnumeric hücreleri salt okunur; typed key değeri inspector fx ile değişir |
| Parameters/Runtime Preview | Numeric/string/color/boolean Calculate once | Asset/image kimliği serbest expression olmaz; param override source recipe değildir |
| Curve/controller/modifier/Wire numeric ayarları | Calculate once | Mevcut scalar signal semantics ve controller taslağı korunur |
| Composition, sprite import, export/quality, snap/ghost ve bake ayarları | `CalculationNumberInput`/`CalculationRangeInput` | İşlem kendi Apply/Cancel, validation, cancellation ve resource sahibinde; per-frame job yaratılmaz |
| Dosya/URL/asset/source/timeline kimliği, topology türü, search/filter, seçim/consent/action kontrolleri | Native literal/command | Çalışan bir domain sözleşmesi olmadan otomatik formula veya sahte property path yaratılmaz |

Bütün numeric/range konfigürasyon tanımları ortak calculation adapter'ındadır;
Properties opacity slider'ının yanında zaten kaynak-bound numeric alan vardır.
Saved/live opacity'de slider da kilitlenir. Native enum/action kontrolleri
kendi mevcut workflow'larını korur; supported source select alanları schema
capability üzerinden typed string alır. Desteklenmeyen alanı `as any` ile
live gösterme veya işlem başlatma yoktur.

## Kaynak, geometri ve bake sahipleri

`core/expression/ExpressionValue`, `ValueExpressionFunctions` ve bounded
interpreter pure hesaplamayı yapar. `color/ColorValue` mevcut color parser'ın
tek sahibidir; `animation/typedValues` eski public import'ları reexport eder.
`registry/PropertySchemaIndex` renderer ve expression capability'nin ortak
schema lookup'ıdır. Dynamic schema provider her sorguda günceldir; static
cache weak'tir ve provider değişince invalid olur.

`expression/properties` source types/defaults, dependency/parent-child overlap,
clock, fallback ve scoped bake işini yönetir. `editor/inputExpressions` typed
constant/live komutlarını, CAS ve ownership guard'larını yönetir. Source ref
picker yeni typed katalog kullanır; legacy Wire numeric kataloğu değiştirilmez.
Wire'ın eski scalar coercion/preset davranışı kendi adapter'ında kalır.

`geometry/CoordinateSystem.isVec2`, `spline/animation/splineCoordinateAddress`
ve domain spline mutation helper'ları tekrar kullanılır. Constant point hareketi
ile runtime deformasyon/capture ayrıdır. Whole-point native key sadece x/y
saklar; point id/type/coupling metadata'sı source'ta kalır.

`animation/baking` tek örnek zamanlaması, ID/metadata dönüşümü ve numeric bake'i
paylaşır. Typed bake:

- Number mevcut numeric bake'i kullanır; color/Vec2 kanal başına RDP seçimlerini
  birleştirir. Tolerance 0–1 arasında örneklenmiş kanal aralığının payıdır.
  İki kat hata payını önlemek için her kanal yarım tolerance ile sadeleşir.
- Color/Vec2 linear, string/boolean yalnız değişimlerde hold key üretir; exact end
  korunur. Rapor source-unit/RGBA 0–255 farkını veya discrete 0/1 uyuşmazlığı verir.
- Sample/midpoint ölçümü sürekli eşliği kanıtlamaz. FPS discontinuity zamanını
  sınırlar. Scoped job, tüm named parent/child/native bağımlılıklarını ve açık
  timeline saatlerini korur. Parametreler freeze edilir; SM global-time bake
  reddi, 20k sample ve 2M work/simplification sınırları korunur.
- Preview kaynak/history yazmaz. Cancel sampled data'yı bırakır. Apply tek
  command ile yalnız ilgili live driver'ı kaldırır; stable key/timeline IDs,
  unrelated manual keys ve exact Undo/Redo korunur.

SDK full-scene player, raster, static SVG ve viewport aynı frame sonuçlarını
kullanır. Basic runtime/animated SVG için explicit native-key bake gerekir;
unsupported çıktı sessizce driver atlamaz. Bu teslim final export parity aşaması değildir.

## MCP örneği ve bakım

Fresh get_scene/readToken/revision sonrası, mevcut Hero card üzerinde ilgili
alanın boş/sahipsiz olduğu doğrulandıktan sonra QuickJS'de uygulanabilir:

```js
const hero = scene.find('Hero card');
if (!hero) throw new Error('Hero card not found');
const clock = scene.timeline('intro');
const data = hero.data;
hero.set({propertyExpressions:{version:1,fields:{
  ...(data.propertyExpressions ? data.propertyExpressions.fields : {}),
  'style.fill.color':{resultType:'color',formula:'rgba(40+20*timeSec,100,200,0.8)',
    timelineId:clock.id,sources:{}}
}}});
```

MCP capability/schema all five type'ı bildirir; Layer.set/patch mevcut yoludur.
Yeni invented scripting metodu yoktur. Canonical skill `skills/chorono/references/animation.md`
aynı dili/sınırları anlatır; distributable CLI skill build ile üretilir.

Kabul: typed kernel/driver/bake invariants, eski Wire/portable/controller testleri;
gerçek StrictMode inspector/config UI. Array 2+3 → 5, renk/metin/enum/point canlı
sonuçları, invalid enum/gain reddi, coupled handle constant hareketi, 73→3 color
bake + tek Undo; 73→9 vector bake preview; reload'da 5 history adımı ve tarifler
korundu. Yerel kanıt: `artifacts/validation/property-expression-a4-20261112/`.
Reproduce: `node scripts/perf/numeric-expression.mjs <output>` ve loopback
`node scripts/perf/serve.mjs <output> <port>`. Gerçek kullanıcı sahnesi değiştirilmez.
A5 / Four Seasons 512 MiB / V6 / E−1.7 ve dar entegrasyon ayrı kapılardır.
