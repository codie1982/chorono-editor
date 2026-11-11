# Sayısal input formülleri — E−1.5A / A1

11 Kasım 2026. A1, kayıtlı **sabit sayısal formül** düzenlemesidir. Formül
Apply anında hesaplanır; her karede çalışan yeni bir driver değildir. Canlı
zaman/kaynak bağımlılıkları A2, boolean A3 ve diğer input adapter'ları A4'tür.
[Teslim sırası](plans/input-expression-plan.md) ve ilk kutulu 3D önceliği korunur.

## Kullanım ve kapsam

Properties'te transform, anchor, opacity, shape boyutları ve açıkça kaynak
yolu taşıyan WireableField sayısal kontrollerinde **fx** veya çift tıklama
düzenleyiciyi açar. SchemaPanel'ın number/angle/percent alanları da aynı
sözleşmeyi kullanır. Genel `ScrubInput`, kayıtlı bir kaynak alanı yoksa eski
değer girişi olarak kalır; ses/Array/key/guide/renk ve kalan özel formlar bu
dilimde taşınmadı. Kayıtlı olmayan veya desteklenmeyen alanlarda yeni capability
varmış gibi davranılmaz. Audio inspector bu dilimin dışındadır.

Örnek: Rectangle'ın Width alanında fx → `1920 / 2` → Apply formula.
Input `960` gösterir; tekrar fx ile açıldığında `1920 / 2` korunur. Enter Apply,
Escape/Cancel iptaldir. Geçersiz taslak önceki sayıyı değiştirmez. Düz giriş
tam decimal/scientific sayı ister; `10+20` sessizce `10` kabul edilmez ve fx'e
taşınabilir. Saved formülde doğrudan scrub/typing kapalıdır; **Convert to value**
formülü kaldırır ve o anki source değerini tutar. Opacity slider'ı/viewport/MCP
gibi başka bir yoldan değiştirilen source sayı kazanır; formül kendiliğinden
yeniden uygulanmaz ve farklı sonuç için uyarı gösterilir.

`pi`, `e`, `+ - * / % ^`, parantez ve mevcut whitelist fonksiyonları kullanılır;
örneğin `sin(pi/2)*15`. Trigonometri radyan, rotation alanının sonucu derecedir.
Formül sonuçları input'un kaynak birimindedir: layer opacity `0..1`, fill opacity
`0..100`; otomatik yüzde/angle dönüşümü yapılmaz. Schema/UI sınırlarının kesişimi
uygulanır, geçersiz sonuç kırpılarak gizlenmez. `timeSec`, `source`, nesne
referansları, boolean/JS/property erişimi bu A1 bağlamında desteklenmez.

## Sahipler, veri akışı ve korumalar

- `src/lib/editor/inputExpressions/NumericInputExpression.ts`: versioned veri,
  tam sayı doğrulama, ortak `core/expression/expressionEvaluator.ts` adapter'ı.
- `NumericExpressionCommand.ts`: capability/driver kontrolü ve tek atomik editor
  komutu. Formül ve finite sayı birlikte yazılır, tek Undo/Redo adımıdır. Mevcut
  attribution ve bounded history/session persistence yolu aynen kullanılır.
- `src/components/inputs/expressions/NumericPropertyContext.tsx`: inspector'dan
  açık layer/path/label ve senkron source/transaction getter'ı taşır. Bir layer
  lookup bütün input'larca paylaşılır; DOM'dan kaynak yolu tahmin edilmez.
- `PropertyFormulaEditor.tsx` ve `ScrubInput.tsx`: yerel taslak, native modal focus,
  Enter/Escape, preview ve fx/düz değer geçişi. Hedef değişince eski taslak kapanır.
- `src/lib/scene/properties/writePropertyPath.ts`: SchemaPanel'ın özel writer'ı
  yerine ortak immutable yazma; array topolojisi ve eski source referansları
  korunur. Safe-path reader bütün segmentlerde prototype anahtarlarını reddeder.

Modal açıldığı source kimliğini yakalar. Arada herhangi bir source değişirse
Apply/Convert engellenir; **Review current source** taslağı koruyarak yeni source'u
kabul eder. Komut final sınırında tekrar aynı kimliği doğrular. Etkin gesture
bitmeden commit olmaz. Bütün timeline'lardaki key/controller'lar, Wire/binding/
path driver'ları, locked/frozen layer ve bağlı instance düzenlemesi denetlenir.
Çakışma key/driver silmez; A1 formül uygulamasını açık tanıyla durdurur.

Layer'ın optional `inputExpressions: { version: 1, fields: { "size.width":
{ formula: "1920 / 2", value: 960 } } }` kaydı editor tarifidir; `size.width`
halen finite `960` sayısıdır. Eski proje alan olmadan açılır. Portable JSON,
recovery ve geçmiş snapshot'ları kayıtları doğrular; açılışta formül çalıştırılmaz.
Clone mevcut deep-copy sözleşmesiyle tarifi bağımsız kopyalar. Sabit tarifte
remap edilecek kaynak referansı yoktur. Clone/drag başka source değerini
değiştirirse aynı eski-tarif uyarısı geçerlidir.

Her layer en fazla 128 kayıt, yol en fazla 256 ve formül 4096 karakterdir;
ortak parser'ın token/depth limitleri de geçerlidir. Input başına timer/RAF,
AST cache, worker, GPU veya dense frame buffer yoktur. Taslak modal/input ile
yaşar ve kapanınca bırakılır; sahne/geçmiş mevcut kaynak bütçelerinin sahibidir.

Renderer, player ve raster çıktı sayısal source'u kullanır. İki runtime export
yolu editor tarifini çıkarır ve hesaplanan sayıyı taşır; bu bir formül runtime
API'si değildir. MCP/script'e yeni bir public metot eklenmedi. Dinamik expression
capability, dependency graph ve runtime/bake sözleşmesi [A2'de ayrıca geliştirildi](property-expressions.md).

## Doğrulama ve sınırlar

Domain testleri strict literal/finite/sınır, ortak parser, stale/driver reddi,
atomik komut, authoring/history, portable/runtime, clone ve safe immutable path
invariant'larını sınar. `scripts/perf/numeric-expression.mjs` gerçek inspector,
EditorSessionBoundary/useEditorState, SchemaPanel, renderer ve recovery kullanan
ayrı origin/IndexedDB kabul sayfasını üretir. Kullanıcının açık sahnesini değiştirmez.
UI kabulünde fx/çift tıklama, Enter+blur tek commit, Escape, invalid draft,
eşzamanlı source/hedef değişimi, Undo/Redo ve project/reload round-trip izlenir.

İlk teslim kontrolü: temiz staged snapshot'ta 358 dosya / 2875 test ve
TypeScript geçti; `npm run mcp:build` ile `npm run build` geçti. Next sunucusu
build sırasında durduruldu, ardından port 2000'de yeniden başlatıldı. Mevcut
büyük PropertiesPanel'a yalnız provider/path adapter'ı eklendi; yeni formül
doğrulama, komut ve modal sorumlulukları ayrı modüllerde tutuldu.

A1 hiçbir per-frame evaluator eklemediği için Four Seasons için yeni bir FPS/
bellek kazanımı iddia edilmez. A2/A5 canlı değerlendirme kabulünde aynı 512 MiB
managed bütçe ve eski ölçüm fixture'ları tekrar kullanılacaktır. Tüm input'ların
expression desteği veya E−1.5A'nın bütünü bu teslimle tamamlanmış sayılmaz.
