# 3D desteğine geçiş — uygulama ve kabul takibi

11 Kasım 2026. Kullanıcı hedefi: **3D desteğine kadar olan planı tamamla.**
Kullanıcı sınırı netleştirdi: **3D geliştirmesine başlamadan önceki işleri tamamla.**
Bu dosya [onaylı sıranın](geometry-material-boxed3d-sequence.md) takip kaydıdır;
kapsamı veya teslim koşullarını azaltmaz. 3D öncesi kapılar aşağıda ayrı izlenir.

| Kapı | Gerekli kanıt | Durum |
| --- | --- | --- |
| A1 | Formül/değer, fx, undo/portable, gerçek input kabulü | `b223981`; uygulandı |
| A2 | Named stable refs, local clock, cycle/fallback, ortak frame, clone/remap, runtime/bake, UI ve kaynak bütçesi | `e5551a6`; uygulandı |
| A3 | Gerçek boolean, karşılaştırma/mantık/koşul ve kısa devre; eski Wire preset uyumu | Uygulandı; kabul kaydı aşağıda |
| A4 — uygulandı | Sayı/açı/yüzde, renk/vektör/metin/select; Array/audio/spline/key/guide/parametre/efekt/config input kapsam matrisi ve adapter testleri | Uygulandı; aşağıdaki A4 kabulü |
| A5 | Pointer/klavye, eski veri, driver/Undo/portable/player/raster ve Four Seasons 512 MiB kabulü | Bekliyor |
| V6 / E−1.7 | Native viewport birleşik akışı, 09:05 elle düzenleme → ajan devamı, büyük sahne/regresyon | Bekliyor |
| Dar entegrasyon | Stable asset/source kimliği, kesin yerel/frame saati, hedef boyut/alpha/renk, kaynak hazırlığı/sahipliği, açık capability ve fallback | Bekliyor |
| İlk kutulu 3D | Kullanıcı açıklaması: bu hedef 3D geliştirmesi başlamadan önce kapanır. İlk 3D dikey dilim onaylı sonraki iştir. | Bu hedefin dışında; başlanmayacak |

Her kapı, kaynak giriş noktaları, anlamlı unit/adaptör testleri, gerçek UI/render
kanıtı ve gerekiyorsa aynı 512 MiB regresyonuyla kapanır. `npm test`,
`npm run mcp:build`, `npm run build`; build öncesi Next stop, sonrası restart.
Bir dosyanın veya registry kaydının varlığı teslim sayılmaz. CFX, export/final
kalite ve ikinci genel optimizasyon onaylı sonraki sıralarında kalır.

## A2 uygulama ve kabul

Editor, SDK player, renderer/static SVG ve motion-blur alt kareleri ortak
`evaluateSceneFrame` kullanır. Wire→Wire pre-wire snapshot anlamı korunur;
yeni live driver'lar joint graph, stable named refs ve explicit timeline-local
saat kullanır. Kahn cycle/downstream hesabı ile bounded parser/cache ortaktır.
Source tarifleri, authored fallback, program ve kare map'i ayrıdır.
[Sözleşme, giriş noktaları ve sınırlar](../property-expressions.md).

Doğrulama: temiz commit snapshot'ında 361 dosyada 2.898 test ve TypeScript;
çalışma alanında diğer düzenlemelerle 2.899 test; MCP build; CLI build ve 16 CLI testi;
production build geçti. Gerçek StrictMode UI'da named parameter + zaman,
invalid/stale draft, Convert, clone, session/Undo restore ve native-key bake
kontrol edildi. Bake 73 sample → 18 key; tek Undo canlı tarifi geri getirir.
Canlı width değişiminde çizim, picking ve seçim çerçevesinin aynı 100 px sınırı
kullandığı doğrulandı. UI kanıtı: `artifacts/validation/property-expression-a2-20261111/`.
Bu sayılar A3–A5 veya Four Seasons kabulünü kapsamaz.

## A3 uygulama ve kabul

Tek bounded parser/interpreter number/boolean dilini paylaşır. Eski numeric
API number sözleşmesini tutar; koşul/mantık short-circuit ve actual boolean
kullanır. Wire preset ve kaydedilmiş numeric ternary uyumluluğu adapter'dadır.
Properties/Schema checkbox fx, typed refs/defaults, Convert, session/Undo,
SDK/raster/static SVG ve text selection geometry doğrulandı.
[Gerçek alanlar, yaşam döngüsü ve sınırlar](../boolean-expressions.md).

Çalışma alanı: 364 dosyada 2.937 test; MCP ve production build geçti. Canonical
skill/şema örnekleri gerçek QuickJS'de ayrıca sınandı. UI'da 0/500 ms case
değişimi, boolean source, invalid number reddi, reload/history ve tek Undo
görüldü. Kullanıcının test sekmesindeki sonraki elle düzenlemeleri korunarak
son kanıt ayrı origin'de alındı: `artifacts/validation/property-expression-a3-20261111/`.
A4 lifecycle/input matrisi, typed discrete bake ve A5/V6 kabulü hâlâ bekler.
Diğer çalışma değişikliklerinden ayrılmış temiz commit snapshot'ında 364 dosya,
2.936 test ve TypeScript geçti. CLI build ile 16 CLI testi de geçti.


## A4 uygulama ve kabul

Typed string/color/vec2 ve strict select; ortak schema/default/source katalogları,
constant/live ownership, stable-ID spline/handle mutation ve typed native bake
uygulandı. Özel numeric/range formlar explicit Calculate once adapter'ına bağlandı;
asset/identity/filter/action sınırları [alan matrisinde](../typed-input-expressions.md).
Gerçek UI'da config/result, live string/color/select/Vec2, invalid enum/gain,
coupled handles, color bake/Undo ve reload/history doğrulandı. Kanıtlar:
`artifacts/validation/property-expression-a4-20261112/`. A5/Four Seasons/V6 ve dar
entegrasyon hâlâ bekliyor; 3D geliştirmesi başlamadı.

A4 doğrulaması: çalışma alanında 367 dosya / 2.979 test; diğer mevcut çalışma
farklarından ayrılmış temiz test kopyasında 367 dosya / 2.978 test ve TypeScript
geçti. MCP/CLI build, 16 CLI testi ve temiz production build geçti. Kaynak/UI
kabulü A4 matrisindeki kapsamla sınırlıdır; sonraki kapıları tamamlandı saymaz.
