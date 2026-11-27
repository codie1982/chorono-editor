# Uygulama script API uyumluluk incelemesi — 16 Kasım 2026

Bu ilk rapor metot/proxy eşliği ve spline entegrasyonuna odaklanır. Bütün mevcut
2D özelliklerinin tek tek karşılaştırıldığı üst kapsam için
[2D kapsam raporuna](script-2d-coverage-audit.md) bakın. Yeni inceleme raw patch
koruması, Clone/Array Timeline kapsamı, genel 2D sınırı, expression review ve
legacy timeWarp davranışı gibi ek açıklar doğrulamıştır; metot eşliği tam UI
işlev eşliği anlamına gelmez.

İnceleme manuel Script Console'un kullandığı `createSceneAPI`, katman/domain
handle'ları, MCP QuickJS proxy/host geçidi, native command'ler, capability ve
skill belgelerini kapsar. Amaç mevcut UI özelliklerinin scriptte varmış gibi
gösterilmesini önlemek, ortak davranışı korumak ve eksikleri açık yazmaktır.

## Bulgular ve yapılan değişiklikler

| Alan | Bulgu / güncel durum |
| --- | --- |
| Spline destructive edit | Eski removePoint/Contour/SubShape yolu silinen elemanları hedefleyen track'leri otomatik temizliyordu. Native geometry/driver/reference korumasına bağlandı; artık işlem atomik reddedilir, insan keyleri korunur. |
| Nokta/handle yazarlığı | Koordinat değişiklikleri, yeni handle'ın mevcut noktaya etkisi ve topoloji değişiklikleri native writer guard ile denetlenir. Append yanında ilgisiz koordinat animasyonu korunabilir. |
| Point/Edge/Object işlemleri | Yeni `.spline.edit(operation)` basit topology/append/draw/transform/paint/Attach/Detach işlemlerini aynı native planner ve sıkı şema ile sunar. Eski imzalar korunur. |
| CPU spline işlemleri | Offset/Chamfer/Fillet/Boolean artık MCP prepare/apply/discard ile çalışır; senkron Console/QuickJS metodu değildir. Worker, gerçek PNG, revision ve tek Undo kullanılır. |
| Proxy eşliği | Spline proxy ve host kabul listeleri tekrar ediyordu. `SPLINE_SCRIPT_SURFACE` ortaklaştırıldı. Gerçek QuickJS üzerinde Scene/Layer/Timeline/SM/Particle/Spline/Explorer public fonksiyon/getter eşliği test edilir. |
| Kompozisyon | Script ortak UI validation komutunu kullanmıyordu. Aynı command'e bağlandı. `scene.composition(patch,{timelineId})` açık Timeline süresini eşler; ikinci argüman yoksa eski metadata-only davranış korunur. FPS keyleri yeniden zamanlamaz. |
| Belgeler | Silinen keylerin temizlenmesi, Boolean'ın MCP'de olmaması ve Properties'e gömülü edit alanı ifadeleri güncellendi. Capability/skill/scripting resource aynı gerçek API'yi anlatır. |

## Korunan farklılıklar ve henüz bulunmayan API'ler

| Özellik | Gerçek sözleşme / eksik |
| --- | --- |
| `Layer.set` / `.patch` | Set verilen nested kaydı sığ değiştirir; patch nesneleri recursive birleştirir, dizileri değiştirir. İkisi eşanlamlı değildir. Raw patch domain doğrulaması yerine geçmez. |
| `Layer.fill` | Renk kısa yoludur; solid moda geçer. Image/Gradient/None için tam fill kaydıyla focused paint veya `.patch` gerekir. |
| `Layer.stroke` | color/width/opacity kısa yoludur; tam Stroke modu/gradient/trim API'si değildir. Mevcut none/gradient modunu keyfi değiştirmez. Tam kayıt için native paint/.patch kullanılır. |
| Seçim/panel/vertex snap | Geçici UI durumu script kaynağı değildir. Script açık ID ve uç koordinatlarıyla çalışır; mouse veya panel açma metodu yoktur. |
| Animasyon zamanlaması | Keyler ms olarak saklanır; FPS örnekleme adımını belirler. 0→1000 değerini 1000 ms'de veren eğri FPS değişince aynı sürede tamamlanır. |
| Ana/iç Timeline | Ana 2D key hedefleri guard'lıdır. Private 3D clip/rig/primitive yapısal düzenleme için public ScriptHandle yoktur; native detay editörü kullanılır. Boxed modelin statik sunumu `update_model3d` / izinli patch ile mümkündür. |
| Poly/UV/rig/solver | Gelecekteki plan özellikleri mevcut script fonksiyonu değildir. Genel patch bu algoritmaları otomatik oluşturmaz. |
| Expression | Wire/property/input expression kaynakları mevcut tipli, kısıtlı runtime dilindedir; Script Console JavaScript'i veya frame callback değildir. |
| Manuel Console | `ScriptRunner` yerel `new Function` yoludur, sandbox değildir ve senkrondur. MCP kodu burada çalıştırılmaz. Bu inceleme Console'u yeni bir sandbox'a dönüştürmez. |
| MCP script | QuickJS; senkron source authoring, 2 sn / 32 MiB / 128 KiB sınırları. Browser/Node/network/filesystem ve async solver API'si yoktur. |

## Giriş noktaları ve doğrulama

`src/lib/script/api/SceneAPI.ts` ve handle'lar ortak source facade'dır.
`src/lib/mcp/sandbox.ts` bu facade'a kotalı QuickJS geçididir.
`src/lib/editor/spline/operations` ortak source edit doğrulaması/komutlarıdır.
Transport/PNG ve ağır solver yaşam döngüsü `src/lib/mcp/spline` içindedir.

Testler gerçek QuickJS ile proxy eşliğini ve yeni basit operasyonları çalıştırır;
Console eşliği aynı `createSceneAPI`'ye doğrudan çağrılarla test edilir. Model kodu
Node/eval/manual Console'da çalıştırılmaz. Gerçek broker/editor pump testleri
hazırlamanın kaynak değiştirmemesini, yeni token/ID eşliğini, stale/foreign plan
reddini ve Undo/Redo'yu doğrular. Saf CPU adapter'ları Node testlerinde enjekte
edilir; tarayıcı kabulü gerçek worker ve PNG yolunu ayrıca çalıştırır.

Bu rapor eksik bütün UI özelliklerinin script'e eklendiği iddiası değildir.
Private 3D içerik/rig/klip ve gelecekteki Poly/UV API'leri ayrı plan kapsamındadır.
