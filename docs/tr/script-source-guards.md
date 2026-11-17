# Script kaynak korumaları

Bu değişiklik ham `Layer.set` / `patch` çağrılarının ve statik kısa yolların yerel düzenleme korumalarını atlamasını önler. Script'in yazma kapsamı 2D'dir; yerel MCP araçları kendi domain yeteneklerini korur. İsim, koordinat, renk ve dizi değişiklikleri source üzerinde yapılır; oynatılmış/evaluate edilmiş kare kaynağa geri yazılmaz.

## Giriş noktaları ve sorumluluklar

| Modül | Sorumluluk |
| --- | --- |
| `src/lib/script/api/SceneAPI.ts` | Varsayılan script host'unu korumalı adapter ile oluşturur. `runSafeScript` ve manuel runner aynı facade'ı kullanır. |
| `src/lib/script/validation/ScriptPatchCommand.ts` | set/patch ve statik setter için kilit, identity, instance, driver, stale source ve ham spline korumaları. |
| `ScriptSourceHost.ts` | Komutu bir kez çalıştırır; yayınlamadan önce 2D kapsamını, değişen katman ve key değerlerini denetler. Native undo ve tembel authoring/copy hints korunur. Sahne veya runtime cache tutmaz. |
| `Script2DScope.ts` | İç 3D veri/track/referans değişikliklerini; ekleme, clone ve silme dahil engeller. |
| `ScriptLayerValues.ts`, `ScriptPaintValues.ts` | Registry tipi/aralığı, gerekli kayıtlar, 2D transform, paint, spline/path, particle ve expression veri doğrulaması. |
| `scriptData.ts`, `format/json` | Bütçeli plain-data admission; accessor/toJSON çalıştırmadan native nesne, çevrim, function, unsafe key ve non-finite veriyi reddetme. |

Sayısal işlerde yeni bir algoritma kopyalanmadı. Registry `PropertySchemaIndex`, `propertyPathsOverlap`, expression/native animation ownership, `writePropertyPath`, spline topology/locks ve particle validator yeniden kullanılır. Instance'ın kaynaktan aldığı görsel alanlar `InstanceResolver.INSTANCE_SOURCE_FIELDS` listesinden gelir; ayrı bir kopya liste tutulmaz.

## Veri ve zaman sözleşmesi

- `set` belirtilen üst alanları **sığ değiştirir**. `patch` kayıtları derin birleştirir, dizileri tümüyle değiştirir. İlgisiz sibling verisi patch ile korunur. Zorunlu transform/stroke/gradient alanlarını düşüren sığ değiştirme geçersizdir.
- Değişen yapraklar ve silinen alanlar birlikte denetlenir. Animasyonlu alt alanın üst nesnesini değiştirmek de ownership kontrolünden geçer. Tam aynı değerle yazma sahipliği değiştirmez.
- Tüm timeline'lar dikkate alınır; aktif veya mute durumu korumayı kaldırmaz. Key/controller, modifier/time remapping, binding/wire, followPath/motionPath ve formula sahipliği korunur. Statik yazma yerine açık key düzenleme kullanılır.
- Katman ve parent zincirindeki locked/frozen durumu eski kaynak üzerinden kontrol edilir. Ayrı, yalnızca bayrak içeren unlock serbesttir. Eksik/cyclic parent ve group olmayan yeni parent reddedilir.
- Katman id/type/mode/instance kaynağı ham patch ile değiştirilmez. Instance görsel verisi kaynağa aittir; instance'ın dış transform/opacity alanları kendi kaynağıdır.
- Komut patch argümanının bağımsız kopyasını alır. Çalıştırılırken mevcut katman yakalanan kaynakla karşılaştırılır; sonradan gelen manuel alan/driver/kilit değişikliği yeniden kontrol edilir. Undo tam önceki kaynağı geri verir.
- Koordinatlar yerel 2D composition px; rotation derece; key ve layer zamanı ms'dir. Negatif/mirror scale geçerlidir. UI adımı quantization yapılmaz. Opacity 0..1, paint opacity 0..100'dür.
- Sayısal/seçim alanları owning registry sözleşmesini kullanır. Particle alanlarında UI aralığı/seçenekleri domain'in tamamı değildir: uint32 seed, path/sourceLayer emitter ve sıfır alanlı point emitter mevcut particle validator ile korunur.
- Dokunulmayan eski out-of-range veya inactive payload normalize edilmez. Düzenlenen payload kendi gerekli yapısını sağlamalıdır. Özel plugin alanları için JSON güvenliği genel kapsamdadır; plugin'e özgü tam semantik doğrulama bu işin tamamlandığı anlamına gelmez.

## 2D ve 3D ayrımı

Script `model3d` / `model3dInputValues` içeriğini oluşturamaz, değiştiremez, kopyalayamaz veya silemez. Bunları içeren alt ağaçların copy/delete işlemleri de reddedilir. Mevcut iç track/reference kaydı salt okunur korunur; bir timeline'ın tamamını silmek bu korumayı aşmaz. Dış kutunun transform/size/opacity alanları normal 2D düzenleme ve key alır. Snapshot okumaları tam veri döndürmeye devam eder.

`mcp/actions.ts` içindeki trusted native adapter, `createSceneAPI` üçüncü argümanındaki **internal** `nativeCommandAdapter` seçeneğini kullanır. Bu seçenek QuickJS facade/schema üzerinde yoktur, script argümanı değildir. Böylece yerel create/replace araçlarının yayımlanmış 3D yeteneği kapanmaz. Native araçların script dışındaki eski ham patch politikasını bu değişiklik yeniden tanımlamaz.

Manuel Script Console facade'ında da aynı kurallar geçerlidir; Console'un genel JavaScript yürütmesi güvenlik sandbox'ı değildir. Ajan kodu yalnızca MCP QuickJS üzerinden çalıştırılır. Mevcut source revision / one-use readToken ve plan-bound token korumaları değişmedi.

## Kullanım

```js
const layer = scene.get('known-id');
if (!layer) throw new Error('Katman bulunamadı');
// Alanın manuel kaynağını okuyun; animated/driven ise statik değer yazmayın.
layer.patch({transform:{y:80}});
// Yalnızca amaçlanan key hedefini düzenleyin; diğer key'ler korunur.
scene.timeline('known-timeline').key(layer,'transform.x',250.5,120);
```

Yeni source hata verirse QuickJS çalışma kopyası uygulanmaz. Dry-run planı üretirse aynı plan commit edilir; tek Undo/Redo ve authoring ledger normal editor pipeline'ındadır. Kaydet/aç aynı serializable veriyle çalışır; runtime sınıfı veya dense frame cache eklenmez.

## Doğrulama ve kapsam sınırı

`ScriptSourceGuards.test.ts` doğrudan facade, tüm kayıtlı 2D varsayılanları, kilit/driver/instance, eksik container/gradient, stale komut, finite/plain-data, ham spline ve QuickJS rollback durumlarını kapsar. MCP `scriptSourceGuards.test.ts` gerçek broker, readToken/dry-run plan, tek Undo/Redo, source attribution, JSON kaydet/aç ve native 3D uyumluluğunu sınar. Kullanıcının açık sahnesi bu testlerde değiştirilmez.

Bu paket genel script kapsama envanterindeki diğer işleri tamamlamaz: Clone/Array'nin tüm timeline'lar için genişletilmesi, expression oluşturma/düzenleme akışının yeni API'si ve diğer prosedürel eğri davranışlarının revizyonu ayrı işlerdir. Mevcut kayıtlı animasyonlar otomatik taşınmaz veya bake edilmez.

16 Kasım 2026 doğrulaması: `npm test -- --maxWorkers=3` ile 379 dosyada 3.131 test; `npm run cli:test` ile 16 test geçti. `npm run mcp:build`, `npm run cli:build` ve `npm run build` başarılı. Read-only stdio katalog kontrolünde 40 standart / 77 legacy araç, 9 alias ve eksik parametre açıklaması bulunmaması doğrulandı. Production build mevcut `applicationBuildInfo.ts` JSON version named-export uyarısını bildiriyor; bu dosya değiştirilmedi.

17 Kasım 2026 commit öncesi yeniden doğrulama: bu çalışma ağacında 379 dosya / 3.131 test, TypeScript, MCP/CLI ve production build başarılı. Mevcut 21 kaynak/belge dosyası kontrol öncesinde yedeklendi; test/derleme bu dosyaları değiştirmedi. Bu kayıt kendi 3D geliştirme dalındadır; main entegrasyonu veya push anlamına gelmez.
