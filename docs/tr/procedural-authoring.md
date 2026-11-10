# E−1.5 — Prosedürel eğri, Wire doğrulama ve numeric bake

10 Kasım 2026. E−1.5'in zorunlu 1–4 dilimi uygulanmıştır. Bu belge gerçek
giriş noktalarını ve bakım sözleşmesini açıklar. Serbest `timeSec` expression
controller'ı eklenmedi; mevcut waveform ve QuickJS örneklenmiş key yolları vardır.
MCP protokolü 2.1.0, scene formatı ve eski üç argümanlı `Timeline.bake` korunur.

## Kullanım

Curve Editor, sıfır key'li waveform/noise kanallarını da gösterir. Controller
grafiği görüntüleme amaçlıdır; synthetic key'ler source/history'ye yazılmaz.
Kanalın **Bake…** eylemi veya Timeline track menüsü aralık/FPS/tolerans panelini
açar. **Preview bake** kaynak ve baked eğriyi aynı eksende gösterir; **Apply
bake** tek undo ile dönüştürür. **Cancel**, seçenek değiştirme ve belge değiştirme
hazırlanmış sonucu bırakır. Eski revision'daki preview uygulanamaz.

Connected editörde taze `get_scene` sonrası `run_script` içinde:

```js
const hero = scene.find('Hero card'); // Önceki okumada bulunan mevcut isim
if (!hero) throw new Error('Hero card not found');
// Önceki okumada bu timeline ID'sinin boş olduğunu doğrulayın.
const motion = scene.createTimeline({ id: 'sine-motion', durationMs: 3000 });
motion.track('layers.' + hero.id + '.transform.x', { controller: {
  type: 'waveform', waveform: { shape: 'sine', amplitude: 50,
    frequency: 1 / Math.PI, phase: 0, offset: 100, duty: 0.5 }
} });
// İstenirse ayrı sonraki düzenlemede:
// motion.bake('layers.' + hero.id + '.transform.x', 60, 0.001,
//   { startMs: 0, endMs: 3000 });
```

Bu waveform `100 + 50*sin(2*tSec)` üretir. Zaman timeline-local **ms**,
frequency Hz, phase radyan; transform rotation değerleri degree'dir.
`Timeline.track` mevcut layer'ı timeline üyeliğine ekler. Wire ifadesinde
`source` ve `s` aynı scalar kaynaktır; `time`, `t`, örtük `2x` yoktur.
Tam API örnekleri [canonical referanstadır](../../skills/chorono/references/animation.md).

## Sahipler ve veri akışı

| Sorumluluk | Yetkili giriş noktası |
| --- | --- |
| Güvenli grammar/evaluation | `src/lib/core/expression/expressionEvaluator.ts`: `parseExpression`, `evaluateExpression`, `inspectExpression` |
| Wire kaynak/bağımlılık/clamp | `src/lib/wiring/WireSource.ts`, `WireValidation.ts`, `WirePreview.ts` |
| Playback Wire adapter'ı | `src/lib/runtime/parameterWireEvaluator.ts`: quiet/verbose aynı pipeline |
| Scalar frame örnekleme | `src/lib/evaluator.ts`: `evaluateNumericTrack`, `createNumericTrackSampler` |
| Display-only curve range | `src/lib/timeline/curveSignalPreview.ts`, mevcut `curveMath.ts` |
| Pure numeric dönüşüm | `src/lib/animation/baking/bake.ts`: `prepareBake`, `bakeTrack` |
| Basitleştirme | Mevcut `simplifyRDP`; bake için normalized vertical error stratejisi |
| Atomik commit/history | `src/lib/editor/commands-track.ts`: `makeApplyTrackBakeCmd` |
| Review UI | `src/components/timeline/baking/TrackBakeDialog.tsx` |
| Script/native adapter | `TimelineHandle.track/bake`, `src/lib/mcp/actions.ts` içindeki `bake_track` |

Runtime önce bindings'i değerlendirir; bu pre-wire override/param frame'i hem
Wire preview'e hem playback'e gider. Wire'lar aynı pre-wire frame'i okur;
aynı pass'te birbirinin yeni çıktısını okumaz. Quiet adapter, verbose adapter'a
delege eder; ikinci parser veya UI'ya özel hesaplama yoktur. UI mevcut enabled
target'a ikinci driver eklemeyi reddeder; eski kaynak verisi otomatik silinmez.

## Expression ve Wire sözleşmesi

- Decimal/scientific literal (`.5`, `1e-3`), binary/unary işaret ve sağ birleşen
  power desteklenir. `2+3=5`, `-2^2=-4`, `2^-2=.25`; bu precedence eski belirsiz
  davranışa güvenen ifadelerin sonucunu değiştirebilir.
- Fonksiyon adı/arity, değişken varlığı, her ara sonuç ve nihai sonuç kontrol
  edilir. Prototype zincirindeki isimler kaynak/fonksiyon sayılmaz. `eval`,
  `new Function` veya host callback yürütülmez.
- Sınırlar: 4.096 karakter, 1.024 token/AST değerlendirme adımı, 64 derinlik;
  runtime AST cache'i en fazla 512 girişlidir. Hata exception/diagnostic veya
  safe API'de null olur; NaN/Infinity bir property'ye commit edilmez.
- Layer kaynakları finite **number** olmalıdır; `"120"` gibi text kanalları
  sayıya çevrilmez. Scene parameter için mevcut boolean/numeric-string scalar
  dönüşümü korunur. Actual evaluated override önceliklidir; bulunmazsa explicit
  static layer/default parameter değeri kullanılır. Modifier ancak frame'de
  gerçekten üretilmiş scalar değer varsa okunur.
- Enabled graph'ta cycle ve ona bağımlı Wire'lar iterative O(V+E) kontrolüyle
  engellenir; iterasyon/feedback solver yoktur. Eksik kaynak, ifade/clamp hatası
  veya cycle halinde target pre-wire değerini korur; panel nedenini gösterir.
- Wire modalı açıldığı revision'a bağlıdır; Apply güncel kaynakta tekrar
  doğrular. Inline ExpressionEditor Enter/blur ile yalnız geçerli sonucu bir
  kez yazar; Escape iptal eder, eşzamanlı prop değişimi eski draft'ı yazmaz.

## Graph, bake doğruluğu ve kaynak ömrü

Graph range'i görünür zaman penceresinde 129 probe ile bulunur; path örnekleri
en fazla 2.049 noktadır. Bu display yaklaşımı çok dar extrema'yı kaçırabilir.
Prepared sampler immutable track'i ödünç alır, sıralı key array'ini bir kez
üretir; her probe playback'in aynı pipeline'ını kullanır. Kaynak değişince
closure bırakılır. Global dense frame cache veya polling eklenmez.

Bake aralığı `0 ≤ startMs ≤ endMs ≤ timeline.durationMs`; FPS `(0,240]`, tolerans
`[0,1]` olmalıdır. En fazla 20.000 sample ve 2.000.000 simplification karşılaştırması
vardır. Fractional FPS/ms desteklenir; son sample tam endMs'dir. Kaynak ve baked
interpolation/sample/midpoint değerleri finite scalar olmalıdır. Color/vector/
discrete kanallar numeric bake'e zorlanmaz. Ön kontrolde veya herhangi bir
örneklemede hata tüm dönüşümü reddeder; source'a kısmi yazma yoktur.

Tolerans sample'lardaki değer aralığına normalize edilmiş **dikey** linear
interpolation hatasıdır. Preview sample ve midpoint maksimum hatalarını property
biriminde ayrıca bildirir. Bunlar sürekli eşitlik garantisi değildir; yüksek
frekans/discontinuity/aliasing için FPS ve görsel değerlendirme gerekir.

Controller, track modifiers, OOR, ease/timeWarp/multiplier alanları track'ten
kaldırılır. Pencere içindeki sample key'leri linear olur; exact-time authored ID
ve ilgisiz metadata korunur, bu key'lerde segment modifier kaldırılır. Pencere
dışındaki authored key/segment metadata aynen korunur; fakat kaldırılan track
processor artık dışarıda da çalışmaz. Diğer track'ler ve elle yapılan isim/
property/key değişiklikleri korunur. Yeni key ID'leri timeline/target/time ile
namespace edilir ve undo/redo'da sabit kalır.

`prepareBake` geçici array/track/report döndürür; çağıran bunların sahibidir.
Hesap sınırlı ve synchronous'tur; Cancel review sonucunu bırakır, çalışan bir
worker'ı kesme iddiası yoktur. Transient abort signal scene/undo'ya girmez.
Commit revision/document/track eşliğini ve active gesture'ı denetler; editor
membership + track değişimi bir undo'dur. Portable JSON gerçek linear key'leri
saklar, örnekleme iş tamponlarını saklamaz.

## Doğrulama ve sınırlar

Domain testleri whitespace/exponent/precedence/arity/prototype/finite/budget,
prepared sampler–playback eşliği, zero-key graph, bake doğruluğu, fractional
son sample, cancellation/limit, stale commit, ID/metadata/undo ve gerçek QuickJS
örneklerini kapsar. Browser kabulü gerçek Canvas/Timeline/Curve/Wire panellerini
synthetic ayrı belgede kullanır: sıfır-key görünümü, invalid options,
preview/Cancel, Apply/undo/redo/portable, stale ret, actual-source Wire,
cycle/fallback ve inline Enter/Escape. Kullanıcının açık projesine yazılmaz.

Tekrarlanabilir browser fixture: `node scripts/perf/procedural-authoring.mjs
<output-dir>`; oluşan dizini mevcut `scripts/perf/serve.mjs` ile sunup **Run
checks** düğmesini kullanın. Kanıtlar `artifacts/validation/procedural-authoring-20261110/`
altındadır. Tam uygulama doğrulaması ve sonraki sıra
[roadmap §12.58](production-2d-roadmap.md#1258-e15-prosedürel-eğri-wire-ve-bake--10-kasım-2026)
içindedir. Legacy büyük entegrasyon dosyaları ilgili adapter/akışla sınırlı
değişti; yeni numerical/UI sorumlulukları ayrı küçük modüllerdedir.
