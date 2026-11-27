# Spline modifier Faz 1 — örnekleme, deformasyon ve çoğaltma

23 Kasım 2026. **Uygulandı:** Path Resample, Zig Zag, Pucker & Bloat, Repeater.
[İlk dört modifier](spline-static-modifiers.md) ile temel statik Faz 1 tamamdır.
Animasyonlu parametreler, eğrisel Zig Zag, per-copy paint/opacity ve
[Faz 2](plans/spline-modifier-phases-plan.md) ileri işleri bu kapsamda değildir.

## Kullanım ve sahiplik

Spline seç → Edit paneli → üstte **+ Add modifiers**. Edit moduna girmek gerekmez.
Satır eklemek geçerli varsayılanı yürütür; geçersiz varsayılan açıklamayla Off
eklenir. Sayı/menü/hedef değişikliği taslaktır; listenin altındaki **Execute stack**
veya satırın onay ikonu uygular. Her Add/Execute/sıra/toggle/silme/Bake ayrı Undo.

Boş `objectIds` o aşamanın bütün Object'leridir; açık hedefler her Object'in
bütün kontur/deliklerini kapsar. Form hedefleri modifier'ın gerçek prefix
girdisinden listeler. Geçici Edit seçimi kendiliğinden devralınmaz. Açık
**Use selection**/checkbox seçimi Execute'da topology signature yakalar;
upstream topoloji değişirse hedefler sessizce yeniden bağlanmaz.

Kaynak, layer TRS/origin, boya ve dış animasyonlar modifier kaydı dışında kalır.
Geometri sürücüleri/lock/instance/gesture/document guard'ları mevcut native
komutlardadır. Generated sonuç doğrudan edit edilmez; Bake sonucu benimser,
Undo orijinal stack'i geri getirir. Eski modifier type/default anlamları değişmez.

| UI / kayıt type | Ayarlar / varsayılan | Faz 1 sonucu |
| --- | --- | --- |
| Path Resample / `pathResample` | `spacingPx:20`, `tolerancePx:.25`, `objectIds:[]` | Kaynak Bézier üzerinde uzunluğa göre örneklenmiş **polyline**. |
| Zig Zag / `zigZag` | `amplitudePx:5`, `spacingPx:20`, `objectIds:[]` | Statik, keskin polyline tepeleri; zamana bağlı/random işlem yok. |
| Pucker & Bloat / `puckerBloat` | `amountPct:20`, `centerMode:'object'`, `centerX:0`, `centerY:0`, `objectIds:[]` | Aynı Object'teki noktalar/kollar için radyal kontrol kafesi deformasyonu. |
| Repeater / `splineRepeater` | `count:3`, `mode:'linear'`, `stepX:120`, `stepY:0`, `rotationStep:0`, `scaleStep:1`, `radius:100`, `startAngle:0`, `sweepAngle:360`, `orientToAngle:false`, `objectIds:[]` | Aynı spline içinde bağımsız Object/kontur kopyaları; ortak layer boyası. |

## Path Resample

Spacing 0.1–10.000 **yerel px**, Curve tolerance 0.01–10 yerel px. Her keskin
geometrik köşe, açık uç ve kapalı dikiş sabitlenir; ID/koordinatı korunur.
Sabitleme aralarına `ceil(uzunluk/spacing)` eşit nominal mesafe yerleştirilir.
Kapalı kontur en az üç vertex taşır. Pinned bir Bézier noktasının tipi çıktı
polyline'da Corner olur; curve handles kaldırılır. Seçilmemiş kayıtlar korunur.

Mevcut `bezierLengthTable` kontur başına toplam uzunluk hatasını tolerance/16
ile sınırlar; ters lookup sonrasında nokta **orijinal** line/Q/C üzerinde tam
polinomla değerlendirilir. Nominal spacing bu sayısal uzunluk toleransına tabidir.
Her çıktı kirişiyle örtüşen kaynak alt eğrilerin kontrol zarfları sonlu doğru
parçasına karşı sınanır. Hata büyükse aralık ikiye bölünür; tolerans kaynak
Object Interpolation ayarından gevşekse daha hassas Object tercihi geçerlidir.
Dolayısıyla tolerance ek vertex üretebilir; sabit vertex sayısı vaat edilmez.
Bu işlem exact eşit-parametre **Subdivide** değildir; kaynakta eğri fitting yapmaz.

## Zig Zag

Amplitude 0–10.000, Max peak spacing 0.1–10.000 yerel px. Aynı arc sampler,
köşe/uç/dikiş sabitlemesini kullanır. Her sabit span'de en az iki aralık vardır;
ara tepe kaynak yönünün sol normalinde `+amplitude`, sonra `-amplitude` şeklinde
ilerler. Sabit köşe/uç sıfır deplasmandadır; her span pozitif fazla yeniden başlar.
Delik yönü normalin yönünü belirler. Tepe aralığı span'e eşit dağıtılmış üst
sınırdır; kullanıcıya kesin dalga sayısı veya eğrisel geçiş sunulmaz.
Amplitude 0, kaynak kimliğini koruyan gerçek no-op'tur. Sonuç polyline'dır;
bu kasıtlı deformasyonda Resample'ın kaynak-silüet hata sözleşmesi vaat edilmez.
Self-crossing/delik temasları kontrollü reddedilir.

## Pucker & Bloat

Amount -100..100%. Pozitif değer dışa, negatif içe deforme eder. Object modu
her Object'in gerçek render bounds merkezini; Custom modu verilen ortak yerel
X/Y merkezini kullanır. Custom sayılar yalnız o modda etkindir. `R` Object'in
bounds yarı köşegeni, `r=|p-c|`, `a=amount/50` için ortak koordinat kuralı:

```
q = c + (p-c) * exp(a / (1 + r/R))
```

Nokta, bağlı handle ve explicit segment control aynı kuralla taşınır. Bu genel
kontrol kafesi deformasyonudur; layer scale veya başka ürünlerin aynı adlı
efektinin birebir taklidi değildir. Merkez sabit kalır; radyal alan aralıkta
monotondur. Kaynak Bézier derecesi/ID'leri korunur, nonlinear alan curve control
mapping ile temsil edilir; bütün eğrinin nonlinear map'inin exact eşiti değildir.
Eğer Smooth/bağlı Bézier kol bağı artık doğrulanmıyorsa yalnız o nokta Bézier
Corner'a çevrilir; kollar yeniden aynalanıp sonuç değiştirilmez. Amount 0 gerçek
no-op'tur. Bounds çökerse veya sonuç sınırları kesişirse atomik ret olur.

## Repeater

Count 1–32 **toplam instance**. Seçili Object seti tek motif olarak ele alınır;
dönüşler motifin ortak render-bounds merkezine göre yereldir.

- Linear: kaynak instance 0'dır; X/Y step, clockwise Rotation step ve uniform
  Scale step (0.1–10) `RepeaterResolver` matris zinciriyle uygulanır. Count 1 no-op.
- Polar: bütün instance'lar radius üzerindedir; 0° yukarıdır. Tam 360° yarı açık
  dağıtılır, ilk/son kopya çakıştırılmaz. Kısmi sweep iki ucu da kapsar. Orient
  to angle yalnız bu modda etkindir. Instance 0 kaynak ID'leriyle ilk açıya taşınır.

Lineer step ±10.000, polar radius 0–10.000 yerel px; rotation/start ±360°,
sweep 0.1–360°. Her kopya kendi Object/contour/point/handle/segment ID'lerini ve
delik sahipliğini taşır. İlk instance kaynak ID'lerini korur; yeniler ortak
`stableModifierSpline` ad alanına girer. `remapSplineData`, `appendSplineObjects`,
`transformSplineData` ve mevcut placement resolver kullanılır. Yeni scene layer,
bağımsız paint veya copy-opacity kaydı üretilmez. Ayrı Object/kopyaların birbirine
örtüşmesi kasıtlıdır; her Object'in kendi delik düzeni affine olarak korunur.

## Bütçeler, kayıt ve giriş noktaları

Kaynak seçimi mevcut whole-Object sözleşmesiyle en fazla 2.048 anchor / 64
contour'dur. Resample/Zig Zag en fazla 8.192 çıktı vertex'i, arc lookup toplam
262.144 length sample, chord refinement depth 16 kullanır. Ortak sınır tanıları
8.192 path command / 128 contour / 4.096 validation vertex sınırlarını sürdürür;
ilk tükenen bütçe açıklamayla reddedilir, hassasiyet sessizce düşürülmez.
Repeater ayrıca toplam 128 Object/128 contour/8.192 vertex'i üretimden önce
kontrol eder; singular scale zinciri ve ±1e7 dışına taşan koordinatları reddeder.
Point/handle lock'ları sonucun orijinal source kayıtlarıyla karşılaştırılır;
korunan kilitli pin değişmiyorsa işlem geçebilir.

`src/lib/modifiers/spline/*Modifier.ts` sınıfları settings/schema/validation sahibi;
`src/lib/spline/modeling/parametric/index.ts` geometri sözleşmesidir.
`SplineArcSampler` geçici curve/uzunluk tablolarına, polyline builder seçilmiş
kontur değişimine sahiptir. `mapSplineCoordinates` affine ve nonlinear yazımı
aynı normalized-record traversal'ında tutar. Runtime sınıfı/cache/DOM kaydı JSON'a
girmez. Var olan Modifier/Registry/Stack/komut/renderer/export runner'ları kullanılır.

Native TypeScript örneği (yeni MCP/scripting discriminant'ı değildir):

```ts
const plan = prepareAddModifier(scene, layerId, 'pathResample')
scene = plan.command.execute(scene)
scene = makeExecuteModifierStackCmd(scene, layerId, {
  [plan.modifierId]: { spacingPx: 8, tolerancePx: .1 },
}).execute(scene)
```

## Doğrulama

577 dosyada **4.147 test**; TypeScript, MCP/CLI ve Next production build.
Saf testler arc spacing/error, Q/C/closed/open, köşe/uçlar, delikler, scope,
kontrol kafesi, linear/polar kopyalar, lock/limit retlerini doğrular. Native
stack testleri sıra/ayar/toggle/remove/Bake, birebir Undo/Redo, source/TRS/paint,
clone, portable JSON, runtime projection ve Mesh dönüşümünü kontrol eder.

`node scripts/perf/spline-modifiers.mjs /tmp/chorono-spline-phase1-qa` gerçek panel,
SceneCanvas ve çıktı adapter'larını kullanır. `spline-modifiers.html?autorun`
**17 kabul grubu** çalıştırır: dört yeni form, eski modifier regresyonları,
birlikte kullanım, PNG farkı, actual portable reload ve static SVG. Test projesi
`phase1-project.chorono.json`, SVG `phase1-frame.svg`, ekran `viewport.png` kabul
artifact'larıdır; bağlı kullanıcı sahnesi okunmaz/değiştirilmez. Next,
hazırlama/test/build öncesinde durdurulur.
