# Boolean ve koşullu ifadeler — E−1.5A / A3


12 Kasım: [A4 typed input/adapter ve bake genişletmesi](typed-input-expressions.md) uygulandı. Aşağıdaki A1/A2/A3 açıklamaları kendi teslim sınırlarını kaydeder; güncel diğer türler ve input matrisi A4 belgesindedir.
11 Kasım 2026. Ortak dil artık finite number ve gerçek boolean sonuçları
hesaplar. A1 numeric girişlerinin dönüş türü değişmez; `evaluateExpression`
hâlâ number döndürür veya hata verir. Yeni `evaluateTypedExpression` aynı
parser/program cache üzerinden number/boolean döndürür. Host JS çalıştırılmaz.

## Kullanım ve kapsam

Properties veya SchemaPanel'de **Uppercase / Underline / Closed** yanındaki
**fx**, canlı boolean formülünü açar. Desteklenen source yolları
`text.uppercase`, `text.underline`, `path.closed`'dur. Checkbox normal
tıklama/Space ile düz değeri değiştirir; formül açmak için checkbox'a çift
tıklama yapılmaz. Canlı tarif varken checkbox kare sonucunu gösterir ve literal
toggle kilitlenir. Apply tek Undo; Escape/Cancel source'u değiştirmez.

Formül, seçilen timeline'ın açık local saatini ve adlandırılmış number/boolean
kaynakları kullanır. **Keep authored value** eski fallback'i tutar;
**Convert to value** incelenen kareyi gerçek boolean olarak source'a yazar.
Formül, typed refs, clone ve session/Undo portable kaydı v1 DTO içinde kalır.
Boolean numeric clamp/min/max almaz. Boolean bake ve diğer lifecycle/input
adapter'ları A4'tür; sayısal bake booleanı 0/1'e çevirmez. Desteksiz runtime
çıktıları mevcut açık export uyarısı/reddi üzerinden Convert/bake ister.

Güncel `get_capabilities` sonrasında fresh revision/readToken ile mevcut
`Layer.set/patch` kullanılır. Örnekte `label` ve `intro` önceden okunmuş olmalıdır;
`gate` mevcut boolean scene parameter ID'sidir. Diğer alan tarifleri korunur:

```js
const label = scene.get('label');
const clock = scene.timeline('intro');
const current = label.data.propertyExpressions;
label.set({propertyExpressions:{version:1,fields:{
  ...(current ? current.fields : {}),
  'text.uppercase':{resultType:'boolean',formula:'gate && timeMs>=500',
    timelineId:clock.id,sources:{gate:{propertyPath:'gate',valueType:'boolean'}}}
}}});
```

## Dil ve türler

| İşlem | Sözleşme |
| --- | --- |
| `+ - * / % ^`, numeric fonksiyonlar | Yalnız finite number; önceki öncelik, radyan ve sağ ilişkili power korunur. |
| `< <= > >=` | İki number karşılaştırılır, boolean döner. |
| `== === != !==` | Aynı scalar türler karşılaştırılır; `true == 1` hata verir. |
| `! && \|\|` | Gerçek boolean ister; `&&` ve `\|\|` kısa devrelidir. |
| `test ? a : b`, `if(test,a,b)` | Boolean test; yalnız seçilen dal çalışır. Seçilen sonuç hedef türüyle eşleşmelidir. |
| `true`, `false` | Boolean sabitler. V1'de bu isimlerle açıkça kaydedilmiş own named ref varsa eski ref anlamı korunur. |

Örnek: `timeSec < 1 ? 100 : 200` numeric; `gate && timeMs >= 500`
boolean; `if(false, 1/0, 12)` geçerli numeric sonuç verir. Skipped dallar
missing named ref veya domain hatasını çalıştırmaz. Dependency graph yine
statiktir: tüm ilan edilmiş kaynaklarla cycle/downstream kontrolü yapar;
koşula bağlı bir çevrim kendiliğinden izinli sayılmaz.

Named refs lazy getter üzerinden, yürütülen identifier'da okunur. Mevcut
katmanın eksik optional alanı schema default'unu kullanabilir; eksik katman
default ile icat edilmez. Source ve result türleri ayrı ayrı doğrulanır.
Hata, yanlış tür veya cycle sırasında pre-driver/authored fallback korunur;
booleana numeric truthiness uygulanmaz. Parser'ın 4096 karakter/1024 token,
64 derinlik ve interpreter'ın 1024 executed-node bütçeleri sürer.

## Adapter'lar ve sahiplik

- `core/expression/ExpressionSyntax.ts`: bounded tokenizer/parser ve AST.
- `ExpressionInterpreter.ts`: strict scalar işlemler, lazy koşullar.
- `ExpressionFunctions.ts`: tek numeric whitelist/arity sahibi.
- `expressionEvaluator.ts`: eski numeric API ve yeni typed API girişleri.
- `expression/properties/PropertyExpressionSources.ts`: exact typed ref/default
  çözümü; `PropertyExpressionCapability.ts`: açık target capability.
- Ortak `evaluateSceneFrame`: editör, SDK, raster ve static SVG aynı typed
  kareyi kullanır. Boolean SM blend, mevcut discrete interpolation gibi
  geçiş tamamlanana kadar leading fallback'i tutar.
- `BooleanInput` ayrı fx ve native checkbox kullanır; `PropertyFormulaEditor`
  numeric/boolean modal/freshness/Undo akışının tek sahibidir. Tarihsel
  `NumericPropertyContext` export'ları aynı host/frame'i paylaşır.
- `selectionGeometry` canlı text layout'u ölçer; glyph boyutu değişirken seçim
  çerçevesi authored size'a takılmaz. Kaynağın pivot/size'ı değişmez.

Yeni hedef formatı veya medya/solver toggle'ı eklemek yalnız checkbox göstermeyi
değil ilgili renderer/runtime lifecycle'ı da doğrulamayı gerektirir. Destek
matrisinin kalan tür ve alanları A4'tür; bu teslim onları tamamlandı saymaz.

## Wire uyumluluğu ve kabul

Boolean preset'ler açık `source != 0 ? ... : ...` kullanır. Önceden kaydedilmiş
`source ? a : b` Wire'ları, yalnız Wire interpreter adapter'ındaki explicit
numeric-condition uyumluluğuyla çalışır. Yeni property formülleri bu opsiyonu
almaz. Wire boolean layer source'ları açık `valueType:'boolean'` ile 0/1 scalar
girişe uyarlanır; boolean target ise gerçek boolean alır. Numeric Wire target'ı
boolean sonucu sessizce kabul etmez. Wire→Wire snapshot sırası korunur.

Unit/adaptör kabulü tür/short-circuit/security/bütçe, eski numeric parser,
Boolean preset/legacy Wire, schema/default/ref, SDK/frame/static SVG, clone,
Convert/Undo ve portable veriyi kapsar. Gerçek StrictMode UI'da checkbox
normal toggle, ayrı fx, named boolean parameter, 0/500 ms case değişimi,
invalid numeric-result reddi, SchemaPanel, session reload ve Convert/tek Undo
doğrulandı. Kanıt: `artifacts/validation/property-expression-a3-20261111/`.
Four Seasons 512 MiB ve genel viewport kabulü A5/V6 kapılarında kalır.
