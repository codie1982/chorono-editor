# Spline Offset / Outline — S2D-5B

16 Kasım 2026. Bu teslim aynı spline katmanına paralel, düzenlenebilir yeni
Object ekler. Kaynak noktaları, eğrileri, konturları, Fill/Stroke, parent ve
mevcut Timeline key'leri korunur. Bu bir canlı modifier/offset recipe değildir;
Apply anında üretilen normal spline geometrisidir. Yeni layer/JSON türü yoktur.

## Kullanım

1. Spline & Boolean panelinde Edge veya Object moduna geçip seçim yapın.
2. **Offset / Outline → Preview Offset** açın. Edge seçimi, seçili edge'in tüm
   sahip konturunu hedefler; bu kapsam panelde yazılır. Object delikleriyle gelir.
3. Açık kontur: **Left / Right / Both**. Kapalı kontur: **Inside / Outside**.
   Mesafe, tolerance ve miter limit ayarlarını seçin. Sol/sağ, çizimin ilerleme
   yönüne göredir; Y aşağı olan kompozisyonda sol normal `(dy,-dx)/length`.
4. Sarı kesikli overlay yalnız yeni sınırları gösterir. **Cancel Offset** source
   veya history yazmaz. **Apply Offset** yeni Object'leri tek Undo olarak ekler
   ve Object seçimini onlara taşır. Aynı çıktı Redo ile aynı ID'lerle geri gelir.

Örnek: Circle'dan bir çeyrek edge silin → kalan açık kontura içe giden Left/Right
yönünde Offset verin → Add Line ve Spline Vertices snap ile iki uç çiftini
bağlayın. Sonuç tek kapalı/dolgulu kontur olur. Açık bir yayın “içi” otomatik
tahmin edilmez; önizlemede uygun sol/sağ yönünü seçin. Both iki ayrı açık Object
üretir; bunlara otomatik uç kapağı eklenmez.

## Sorumluluklar ve veri akışı

- `src/components/splineEdit/outline/useSplineOutline.ts`: page-owned transient
  session. Aynı controller mevcut dock ve SceneCanvas'a verilir. Kaynak, seçim,
  mod, zaman, document veya paused/edit bağlamı değişirse preview anında geçersiz
  olur. Ayar değişimi eski işi abort eder; geç sonuç Apply izni vermez.
- `src/lib/editor/spline/outline/outlinePlan.ts`: tam kontur seçimi, native
  source/ancestor/key/lock doğrulaması ve kompozisyona affine dönüşüm. Apply taze
  kaynak referansını yeniden kontrol eder; append ve normal history komutunu
  kullanır. Katman ve parent dış transform animasyonları korunur; keyed/bound/
  expression-driven spline koordinatlarını evaluated pose ile ezmez.
- `src/lib/spline/outline`: seri hale getirilebilir request/result sözleşmeleri,
  CPU backend, bounded worker adapter ve `outlineToSpline` konverteri. Worker
  sonuçlarında source point ID'si yoktur. Mevcut `buildSplineData`,
  `transformSplineData`, `appendSplineObjects` ve `splineEditCommand` tekrar
  kullanılır. Konverter her yeni record'a taze ID verir, kaynakları değiştirmez.
- `src/lib/geometry/flattenPathContours.ts`: ortak adaptif M/L/Q/C/Z örnekleme.
  Eski `flattenClosedPath` kapalı Boolean sözleşmesi için uyum adapter'ıdır.
  Robust ring/segment matematiği `geometry/planar` sahibine çıkarılmıştır;
  eski `geometry/boolean/rings` import'ları uyum export'larıdır.
- `resources/jobs/OneShotWorkerClient`: Boolean'dan çıkarılan tek yetkili worker
  transport/lifecycle. Boolean API ve hata/iptal sözleşmesi korunur. Offset,
  ortak `BoundedJobQueue` ile realm başına bir aktif, en çok iki bekleyen iş
  kabul eder. Her sonuç/hata/abort/deadline worker'ı sonlandırır ve listener/timer
  sahipliğini bırakır. Sahneye runtime instance, dense cache veya worker handle
  eklenmez. Ana iş parçacığında sessiz CPU fallback yoktur.
- `SplineOutlineOverlay`: kompozisyon-space, sabit CSS stroke'lu yalnız editör
  overlay'i. Renderer/export bunu tüketmez. Apply sonrası çıktı normal renderer,
  clone/selection/portable save ve mevcut runtime/export spline yollarını izler.

## Geometri ve tolerans

Mesafe mevcut karede **kompozisyon px** olarak hesaplanır; CSS zoom/DPR/FPS'den
bağımsızdır. Tam displayed parent matrix önce world'e, Apply'da tam inverse
yeniden layer-local'e çevirir. Singular matrix reddedilir. Sonuç normal statik
geometridir: daha sonra parent scale animasyonu iki spline'ı birlikte ölçekler;
her kare yeniden dünya mesafesi çözen bir modifier teslim edilmemiştir.

Bézier paraleli genel olarak aynı dereceli tek Bézier değildir. Çıktı adaptif
polygonal spline'dır. Varsayılan tolerance **0.25 px**; aralık **0.05–5 px**.
Sampler, source chord/hull hatası ve `distance × normal farkı` için tolerance'ın
dörtte birini kullanır. Offset büyüdükçe normal çözünürlüğü de artar. Round join
chord sagitta'sı ayrıca tolerance/4 ile sınırlıdır. Bu, kaydedilmiş Bézier'in
yaklaşımıdır; primitive'in varsayımsal analitik dairesine dair exact iddia yoktur.
Köşelerde mesafe, join politikasına göre yorumlanır:

- **Miter:** shifted edge kesişimi; limit aşılırsa açıkça sayılan **bevel fallback**.
- **Bevel:** dış köşede düz bağlantı.
- **Round:** dış köşede offset mesafesi yarıçaplı yay yaklaşımı.
- İç köşeler kesişimle kırpılır. Her shifted edge eski ilerleme yönünü korumalı;
  dar bölgenin çökmesi/tersine dönmesi reddedilir.

Join terimleri için [Clipper2 birincil dokümanı](https://www.angusj.com/clipper2/Docs/Units/Clipper/Types/JoinType.htm)
referans alınır. Backend Clipper kullanmaz; burada açık konturun tek paraleli
hesaplanır, açık çizginin kapalı stroke-buffer polygon'u üretilmez.

Closed Inside/Outside, fillRule ve nesting/winding ile materyal sınırı olarak
çözülür: Inside dış sınırı küçültürken deliği büyütür. Kaynak ve sonuç yönü,
parent-hole sahipliği ve kontur sırası korunur. Çakışan/dokunan kapalı konturlar,
self-contact, cusp, sıfır uzunluk ve redundant nonzero sınırlar açıklamayla
reddedilir. Karma açık/kapalı seçim bir işte desteklenmez. Otomatik clipping,
budama, winding düzeltme veya eski geometriyi sessizce yeniden eşleme yapılmaz.

## İş ve sahiplik sınırları

İş başına en çok 8 Object, 32 bağlam konturu, 2.048 source path command,
4.096 örnek source vertex ve 8.192 output vertex; worker deadline 5 saniye.
Aşımda düşük kaliteli/kısmi sonuç uygulanmaz. Daha büyük offset veya daha küçük
tolerance daha çok örnek isteyebilir; kullanıcı mesafeyi/tolerance'ı düzenleyebilir.
Yeni ve mevcut geometri birlikte normal spline record bütçesine de uymalıdır.

Kilitli/frozen/hidden ancestor, instance ve generated Boolean result doğrudan
düzenlenmez. Canlı spline coordinate key/driver'ları için önce açık dönüşüm/bake
işlemi gerekir; bu teslim onları kaldırmaz. Katman transform/style animasyonu,
diğer katmanlar, elle yapılmış key easing/ID/time değerleri korunur. Önizleme
toggle/ayar/iptal source edit değildir. Ayrı [Fillet nokta aracı](spline-fillet.md) S2D-5D kapsamında uygulandı.

## Doğrulama girişleri

- `src/lib/spline/outline/outline.test.ts`: açık sol/sağ/both; daire yayı; miter,
  bevel, round; hole role/winding; collapse, self-contact ve budget.
- `src/lib/editor/spline/outline/outlinePlan.test.ts`: nonuniform/rotated/reflected
  parent altında gerçek world Bézier normal mesafesi; source/ID/key koruması,
  portable round-trip, stale/kilit/driver ret ve tek Undo/Redo.
- `OutlineWorkerClient.test.ts` + mevcut `BooleanWorkerClient.test.ts`: bounded
  admission, kuyruk iptali ve paylaşılan transport'un terminal sahiplik yolları.
- `node scripts/perf/spline-outline.mjs <output>`: gerçek CPU Worker, gerçek
  SceneCanvas/dock ve native editor/history ile bağımsız origin kabul sayfası.
  Cut circle → Offset → iki çizerek Connect senaryosu; preview/export pixel
  eşliği, Cancel, Apply, invalid input ve time-change invalidation. Kullanıcının
  açık sahnesine veya recovery/history storage'ına yazmaz.

Üretim derlemesi aynı source'un sunucusuz izole kopyasında yapılabilir; kaynak
digest karşılaştırması derlemenin hangi kodu doğruladığını kaydeder. Çalışan
editörün `.next` dizini derleme sırasında değiştirilmez.

Chamfer artık Point modunda ayrıca kullanılabilir: [S2D-5C](spline-chamfer.md).
