# S2D-3 — kaynakları koruyan Boolean önizleme

S2D-3 önizleme sözleşmesi aşağıdadır. 15 Kasım 2026 tarihli S2D-4, bu akışı
[kalıcı recipe + Apply/Cancel ve Edit Operation](boolean-operation.md) ile
genişletir. Önizleme yine geçicidir; yalnız Apply kaynak komutu oluşturur.
Editable path bake ve yeni Boolean MCP araçları bu kapsamda değildir.

## Kullanım

2–8 Basic Shape veya Spline katmanı seçin. Alternatif olarak bir spline'ın
Object modunda 2–8 alt obje seçin; donut dış konturu ve deliğiyle tek girdidir.
**Spline & Boolean → Boolean preview → Preview Boolean** veya viewport sağ tık →
**Boolean preview…** kullanılır. Sağ tık ayrı Spline & Boolean dock panelini öne
getirir. Genel Properties panelinde edit/Boolean kontrolleri bulunmaz.

- Union ve Intersect bütün seçili girdiler üzerinde çalışır.
- Subtract'ta **A** aktif katmandır; Object modunda ilk seçili alt objedir.
  **B** kalan girdilerin birleşimidir. A−B / B−A açıkça seçilir.
- Mor dolgu ve sınır hesaplanan alanı gösterir; kaynaklar görünür kalır.
  Bu görünüm kaynak paint, maske, stroke kalınlığı veya efekt bileşkesi değildir.
- Tolerans 0,01–10 **kompozisyon pikseli**, varsayılan 0,25 px'dir.
  Zoom/FPS toleransı değiştirmez. Analitik daire önce mevcut shape-to-path
  converter'ın Bézier yaklaşımından geçer; tolerans o eğriye göredir.
- Close preview hiçbir editor komutu üretmez. Seçim, zaman, kaynak, belge veya
  playback/detail bağlamı değişince eski sonuç anında gizlenir; yeniden Preview
  gerekir. Operation/order/tolerance açık önizlemeyi yeniden hesaplar.

Preview source/manuel key, Undo/Redo, clipboard ve session recovery'ye yazılmaz;
viewport export renderer'ına eklenmez. Kalıcı Boolean sonucu isteyen kullanıcı
bu aşamada Apply yapamaz; yalnız önizlemeye bakarak tamamlandı denmemelidir.

## Sınırlar ve doğrulama

Girdiler açık stroke konturu içeremez. Eksik/çevrimli parent, instance,
bozuk spline connectivity, sonlu olmayan/aşırı koordinat, tekil transform,
sıfır alan ve kendiyle kesişen/temas eden kontur açıklamayla reddedilir.
Geometri değerlendirilmiş kareden alınır; mevcut animasyonlar değiştirilmez.
Farklı animasyonları birleştirip tek dış transform'a indirme yoktur.

`evenodd` kontur alanlarının XOR'udur; iç içe delik/adalar ve çakışma korunur.
`nonzero` aynı yönlü çakışmaları destekler. Karışık yönlü konturlar iç içe veya
ayrık olmalıdır; aralarında kesişme/temas varsa açıklamalı ret uygulanır.
İç içe winding 2−1 hâlâ doludur; pozitif birleşimden negatif birleşimi çıkaran
yanlış kısayol kullanılmaz. Girdiler **arasında** teğet/ortak kenar desteklenir.
Boş Intersect/Subtract geçerli sonuçtur; sıfır alan için hayalî path üretilmez.
Full Basic Shape ring'in renderer'daki geri izlenen radial seam'i sadece alan
önizlemesinde iki kontura ayrılır; stroke seam davranışı değiştirilmez.

İş başına en fazla 8 girdi, toplam 2.048 path komutu, 2.048 düzleştirilmiş vertex,
64 kontur, 4.096 kenar teması ve 8.192 çıktı vertex'i kabul edilir. Aşım kaliteyi
sessiz düşürmez. Koordinat sınırı ±10 milyon px; ihmal edilebilir alan eşiği
1e−10 px², tekil transform determinant eşiği 1e−9'dur. Bunlar kaynakları weld
eden veya birbirine yaklaştıran toleranslar değildir.

## Teknik sahiplik ve veri akışı

1. `src/lib/editor/boolean/prepareBooleanOperands.ts`: seçim → source/frame
   geometrisi. Mevcut `ShapeToPathConverter`, `splineToPathDefinition`, spline
   validation/SubShape görünümü, override projection ve ortak world matrix
   resolver'ı kullanır. ID'ler sonuç vertex'lerine taşınmaz.
2. `src/lib/geometry/transformPathDefinition.ts`: absolute M/L/Q/C/Z koordinat ve
   kontrollerini affine matrisle dönüştürür. İleride world → hedef local dönüşümü
   aynı yardımcıyla yapılabilir; bu dilim world-space overlay döndürür.
3. `src/lib/geometry/flattenClosedPath.ts`: hata sınırlı adaptive de Casteljau.
   Kontrol hull'ünün sonlu chord segmentine uzaklığı kullanılır; collinear
   overshoot tek doğruya indirgenmez. En fazla 24 subdivision derinliği.
4. `src/lib/geometry/boolean/PolygonClippingBackend.ts`: saf hesap adaptörü.
   [polygon-clipping 0.15.7](https://github.com/mfogel/polygon-clipping) MIT
   çözücüsü Union/Difference/Intersection/XOR'u yapar. Genel clipping algoritması
   yeniden yazılmadı. [robust-predicates](https://github.com/mourner/robust-predicates)
   orientation işaretleri self-contact validation'ında kullanılır. Selection'ın
   eski `segmentsIntersect` yardımcısı paralel temasları false saydığı için onun
   sözleşmesi değiştirilmedi; kapalı segment predicate'i geometri alanındadır.
5. `BooleanWorkerClient` dar `BooleanExecutor` sözleşmesini uygular. Tek iş/worker,
   5 saniye deadline; abort/error/timeout/success timer/listener/handler temizler
   ve worker'ı terminate eder. Main-thread solver fallback yoktur. Worker'a
   yalnız sınırlı path DTO'ları kopyalanır; büyük scene veya medya gönderilmez.
   Terminate, işletim sisteminde RAM'in anında azalacağı vaadi değildir.
6. `src/components/booleanPreview/useBooleanPreview.ts`: UI-only iş sahibi.
   Yeni kaynak/selection/time/document geldiğinde önceki cevap eşleşmez.
   İptali görmezden gelen bir backend'in geç sonucu da gösterilmez. Tek iş ve
   tek sonuç tutulur; kapatınca sonuç bırakılır. Spline & Boolean/overlay bu durumu
   paylaşır. `SplineToolsPanel` bunları ayrı dock tabında gösterir; mod menüsü ve
   panel aynı `useSplineEditSelection` sahibini kullanır. `page.tsx` izolasyon kapsamını geçirir; `SceneCanvas` yalnız editör
   katmanını çizer, export pipeline'a dokunmaz.

Saf hesap örneği (production UI aynı işi worker üzerinden çağırır):

```ts
import { PolygonClippingBackend } from '@/lib/geometry/boolean'
import { ShapeToPathConverter } from '@/lib/geometry'
const box = ShapeToPathConverter.convert('rect', { width: 100, height: 100 })
const result = new PolygonClippingBackend().compute({
  operation: 'union', reverse: false, tolerancePx: 0.25,
  operands: [
    { label: 'A', path: box, fillRule: 'nonzero' },
    { label: 'B', path: box, fillRule: 'nonzero' },
  ],
})
// result.path: new polygonal M/L/Z data; inputs remain untouched.
```

## Kabul ve test girişleri

- `src/lib/geometry/boolean/*.test.ts`: alan invariants, sıra/empty, holes,
  evenodd/nonzero winding, affine/reflection, Q/C subdivision ve ret sınırları;
  worker pre-abort/abort/late reply/timeout/post-error temizliği.
- `src/lib/editor/boolean/prepareBooleanOperands.test.ts`: eski shape/spline
  adaptörleri, parent/evaluated geometry, full ring, key/source değişmezliği.
- `node scripts/perf/boolean-preview.mjs artifacts/boolean-preview` ardından
  `node scripts/perf/serve.mjs artifacts/boolean-preview 4359`:
  `boolean-preview.html` gerçek worker + production kontroller + viewport kullanır.
  Ayrı origin ve disposable source; insanın açık sahnesine yazmaz.
  Native test PNG byte eşliği, Undo/Redo, source/key/history eşliği, alt obje
  deliği, açık kontur reddi, scrub/edit/document iptali ve stale reply sınar.
- Önceki `spline-topology` kabulü değişmeyen topoloji işlemlerini de doğrular.

Derleme veya native fixture hazırlamadan önce Next durdurulur. Zorunlu paket
kontrolleri: `npm test`, `npm run mcp:build`, `npm run build`.

15 Kasım kabulü: **415 test dosyası / 3.284 test**, TypeScript, MCP ve production
build başarılı. Native Boolean 8, önceki topoloji 9, gerçek EditorPage 15 kabul
grubu geçti. Next production worker ve sağ tık → Properties bağlantısı ayrıca
doğrulandı. Preview açık/kapalı final PNG byte eşliği sağlandı. Açık insan
oturumundaki dört katman, aynı session ve 50 Undo / 0 Redo korundu. Yerel kanıtlar
`artifacts/spline-s2d3-20261115/` altındadır; Git'e eklenmez. Build'de önceden
bulunan `applicationBuildInfo` named `version` import uyarısı sürer.
