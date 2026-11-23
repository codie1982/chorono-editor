# Statik 2D spline modifier'ları — ilk paket

23 Kasım 2026. **Uygulandı:** Offset Path, Round Corners, Path Simplify ve Path
Smoothing. Native Edit araçları kaynak değiştiren Apply akışını sürdürür;
parametrik modifier'lar orijinal kaynağı koruyarak sırayla sonuç hesaplar.
Animasyonlu modifier parametreleri ve [faz planındaki](plans/spline-modifier-phases-plan.md)
ileri işlemler bu teslimde bulunmaz.

## Kullanım

Spline seç → Edit paneli → Spline modifiers → + Add modifiers. Edit moduna
girmek gerekmez; Mesh modifier'ları da aynı şekilde kullanılabilir. Seçilen
işlem bağımsız bir stack satırı olarak eklenir; geçerli varsayılan hemen uygulanır.
Yeni satır bütün uygun girdiyi hedefler; Point/Edge/Object seçimini otomatik
devralmaz. Kısıtlı hedef ancak açık **Use selection** veya hedef listesi ile
seçilir ve Execute ile kaydedilir. Panelde ayrı Enter/Exit edit mode butonu
yoktur; sağ tık menüsü veya 1/2/3 düzenleme modunu açar.
Geçersiz varsayılan, örneğin Circle üzerinde Round Corners, açıklamayla devre dışı
eklenir. Kaynağın yerini geçersiz/boş bir sonuç almaz.

Her satır kendi ayarlarını sunar. Sayı, yön veya Object hedefi değiştirmek taslaktır;
**Execute stack** bütün taslakları tek komutta uygular. Satırdaki onay ikonu yalnız
o satırın taslağını tüm pipeline üzerinden uygular. Her Add, Execute, aç/kapat,
sıralama, silme ve Bake kendi Undo/Redo adımıdır. Hatalı yürütme kaynak ve geçmişte
iz bırakmaz; Source satırı her seferinde başlangıçtır, eski sonuç tekrar girdi olmaz.

| Etiket / kayıt türü | Ayarlar ve hedef | Sonuç |
| --- | --- | --- |
| Offset Path / `offsetPath` | Mesafe (varsayılan 1), yön, join, miter limit, tolerans (.25), tam contour ID'leri. Açıkta Left/Right/Both; kapalıda Inside/Outside. | Paralel, toleransla örneklenmiş konturlar. Eski Object kimliği/adı/interpolation ve seçilmemiş sibling/delikler korunur. |
| Round Corners / `roundCorners` | Mutlak yarıçap (varsayılan 1), Corner / Bézier Corner point hedefleri. | Keskin köşeleri yuvarlatır; düz kenarlar arasındaki mevcut dairesel köşe yayını aynı Fillet çözücüsüyle yeni yarıçapta yeniden kurar. Smooth / bağlı Bézier noktaları otomatik hedef değildir. |
| Path Simplify / `pathSimplify` | Tolerans (varsayılan .5), Object hedefleri. | Native Simplify ile orijinal eğriye karşı kontrollü nokta azaltma; endpoint, keskin köşe ve delik sahipliği korunur. |
| Path Smoothing / `pathSmoothing` | Object hedefleri. | Native Smooth ile anchor koordinatlarını koruyup komşu anchor'lara göre Smooth tangent'ler üretme. |

Mesafeler kaynak-layer **yerel px** cinsindedir; zoom, parent transform ve layer
TRS/origin hesabın dışındadır. Point/contour/Object hedef listesi boşsa o aşamanın
bütün uygun girdileri seçilir; geçersiz açık ID sessizce tüm girdiye genişlemez.
İlk iki işlem eski sınıfların sayı/yön sınırlarını, son ikisi native Object edit
bütçelerini kullanır. Round Corners için en fazla 64 köşe; Offset için mevcut
8 Object / 32 contour / 2.048 path-command / 4.096 input ve 8.192 output vertex
sınırları geçerlidir. Simplify/Smooth korumacı topoloji tanılarını sürdürür.

Modern SplineModifier değerlendirmesi native `assertSplineLocks` kuralını da
uygular: kilitli point/handle kaydı değişecek veya silinecekse sonuç reddedilir.
Seçilmemiş kilitli kayıtlar korunur. Uyumluluk descriptor'ları eski kilit
davranışını sürdürür; kayıt açılırken yeni kurala sessizce dönüştürülmez.

Round Corners önce nokta tipine bakar: Corner / Bézier Corner uygundur; Smooth
ve bağlı Bézier otomatik hedef değildir. Yarıçapın 1 px olması gibi bir uygunluk
eşiği yoktur. Uygun noktalarda keskin birleşim veya düz kenarlar arasındaki
mevcut dairesel Bézier köşe zinciri işlenir. **Radius mevcut değere eklenmez;
yeni mutlak yarıçaptır.** Kaynağa işlenmiş köşe de büyütülebilir/küçültülebilir.
Seçili bir zincirin herhangi bir Corner noktası bütün o köşeyi hedefler.

Çözücü gerçek vertex/handle kayıtlarını kullanır; eski generator parametreleri
geometrinin yerine geçmez. Desteklenen dairesel zincir 32 cubic parçaya kadar,
180°'den küçük ve iki düz kenarla teğettir; contour dikişinden geçen zincirler,
konkav köşeler ve delikler dahildir. Standart çeyrek daire cubic'i ve onun tam
subdivision'ları, bağıl radyal hata 0.0003 + mutlak taban 1e-7 yerel px ile
tanınır; Bernstein kontrol zarfı bütün eğriyi doğrular (en fazla 8.192 kontrol).
Sanal keskin köşe yalnız özel hesap verisinde kurulur; mevcut Fillet solver/splice
yeni yayı üretir. Sonuç yeniden kaynakla karşılaştırılır; kaynak, layer TRS ve
origin değişmez. Sığmayan yarıçap/örtüşme/delik değişimi atomik reddedilir.
Eğri yan kenarlar arasında kaynak geçmişi olmayan yuvarlatma, elips/deforme yay,
yarım/tam daire güvenle çıkarılamaz; genel bir eğri yeniden biçimlendirme işlemi
olarak sunulmaz. Keskin köşelerde mevcut line/Q/C Fillet desteği sürer.

Eski sürümde kapalı eklenmiş bir Round Corners satırı dosya açılırken otomatik
etkinleşmez. Satırı açıp Radius/Execute kullanılabilir. Eski `fillet` ve
`chamfer` kayıtlarının seçim/değerlendirme davranışı korunur.

## Object seçimi ve edit oturumu

Path Simplify/Smoothing formunda Object'ler, seçili modifier'ın **kendi girdisinden**
adlarıyla listelenir. Sonuç generated/read-only olsa da buradan hedef değiştirilebilir.
Use selection mevcut Object seçim bankasını alır; All boş-listeli genel hedefe
döner. En az bir explicit Object tutulur. Hedefler Execute sırasında prefix
girdisinde doğrulanır, topology signature yakalanır. Upstream topoloji değişirse
eski seçim farklı elemana sessizce bağlanmaz; açıkça yeniden hedef seçmek gerekir.

Etkin geometri modifier'larının ürettiği noktalar doğrudan düzenlenmez. Son etkin
işlem kapatılınca/silinince veya Bake yapılınca panel açık kalır. Edit zaten
aktifse Object moduna döner; kapalıysa modifier işlemleri edit modunu açmaz.
Nokta/kenar/nesne araçları yalnız Edit aktifken gösterilir. Moda girip çıkmak
modifier satırı seçimini ve Execute bekleyen ayar taslaklarını korur.
Bake sonucu düzenlenebilir spline'a sabitler; Undo tam stack'i geri
getirir. Seçim, layer türü veya belge değişimi oturumu temizler; açık Exit/Esc
akışı kapanış davranışını korur. Yeni/modern stack normal frame'de görünür;
yalnız eski spline modeling kayıtlarını içeren stack kapalı Source / History
drawer'ında erişilebilir kalır.

## Sahiplik ve ortak hesaplar

- Genel Modifier/Registry/Stack korunur; bu paketin runner veya worker sistemi yoktur.
  Mevcut bounded senkron evaluator çalışır; native Edit'in iptal edilebilir worker
  önizlemesi ayrı akışını sürdürür.
- `modifiers/spline/OffsetPathModifier.ts`, Offset'in doğrulama/solver adapter'ını
  paylaşır; `spline/outline/offsetSplineContours.ts` hazırlanma ve materyalizasyon
  hesabının tek sahibidir. `replaceOffsetContours.ts` native Edit ve modern stack
  için ortak Object-ownership dönüştürücüsüdür. Eski editor import'u uyum re-export'udur.
- `RoundCornersModifier.ts`, FilletModifier'ın settings/validation akışını
  paylaşır; `spline/fillet/roundSplineCorners.ts` modern hedef ve yarıçap değiştirme
  adapter'ıdır. `roundedCorners.ts` kaynak dairesel zinciri tanır; ortak
  `corners/sharpCorners.ts` eski keskin köşe sorgusunun aynı hesabını korur.
  `circularBezierRadialError` mevcut circular-cubic Bernstein sınırını geneller;
  Fillet üretimi ve tanıma aynı matematik altyapısını kullanır.
- `PathSimplifyModifier.ts` ve `PathSmoothingModifier.ts`, mevcut saf
  `simplifySplineObjects` / `smoothSplineObjects` fonksiyonlarını çağırır.
  `objectTargets.ts` açık Object ID / all-stage-input politikasını paylaşır.
- Genel `ModifierField.kind:'objects'`, settings formuna hedef UI sözleşmesidir.
  `prepareAddModifier(..., selection.objectIds)` ve settings patch `objectIds`
  additive native TypeScript API genişletmeleridir. Runtime sınıfı/DOM/GPU nesnesi
  scene veya Undo kaydına girmez.

Native host örneği (MCP scripting API'si değildir):

```ts
const prepared = prepareAddModifier(editor.getScene(), layerId, 'pathSimplify', {
  objectIds: selectedObjectIds,
})
editor.dispatchCommand(prepared.command)
editor.dispatchCommand(makeExecuteModifierStackCmd(editor.getScene(), layerId, {
  [prepared.modifierId]: { tolerancePx: .1 },
}))
```

`Layer.modifierStack` v1 biçimi değişmez. Yeni type kimlikleri yukarıdadır; eski
`offset`, `outline`, `chamfer`, `fillet` kayıtları/default'ları/değerlendirmeleri
korunur ve chooser'da yeni kayıt olarak sunulmaz. Özellikle eski Offset yeni
Object oluşturma davranışını, modern Offset Path Object kimliğini koruma
davranışını sürdürür. Save/load otomatik bake veya type yeniden adlandırması yapmaz.

## Doğrulama

Native testler deterministik output ID'leri, non-cumulative ayar yürütmesi,
Object/delik hedefleri, kaynak/TRS/paint koruması, geçersiz varsayılan, batch
Execute, stale source/target reddi, sıra/toggle/remove/Bake, portable kayıt,
bağımsız clone, render/runtime flattening ve Mesh dönüşümünü kapsar.

`scripts/perf/spline-modifiers.mjs /tmp/chorono-static-spline-modifiers-qa` gerçek
Edit dock + SceneCanvas + renderer kullanan ayrı kabul sayfasını hazırlar.
`spline-modifiers.html?autorun` on iki grupta chooser, dört form, PNG farkı,
Undo/Redo, kaynak dönüşü, scoped stage-input hedefler ve legacy drawer'ı doğrular.
Spline/Mesh için edit modu dışında Add/Execute/Bake ve kapalı edit oturumunun
korunması da gerçek panelde kontrol edilir.
Butonsuz 1/2/3 ile giriş/Escape ile çıkış ve modifier eklemede geçici seçimin
otomatik hedef olmaması da doğrulanır.
Kaynağa işlenmiş Bézier Corner yarıçapının panelden büyütülmesi/küçültülmesi,
kapalı satırın yeniden açılması, PNG farkı ve her Execute için Undo da dahildir.
Bağlı kullanıcı sahnesi kullanılmaz. Hazırlama/test/build sırasında Next durdurulur.

Teslim kontrolü: 575 dosyada 4.129 test, TypeScript kontrolü ve MCP/CLI/production
build geçti. Gerçek tarayıcıda on iki kabul grubu başarılıdır. Kilitli kaydı
değiştiren modern işlemler ayrıca reddetme/disabled varsayılan testleriyle doğrulanır.
