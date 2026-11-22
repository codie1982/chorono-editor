# 3D-T2 — dış kutu ve iç klip ortak kabulü

14 Kasım 2026. **3D-T2 tamamlandı.** Mevcut T1 sayısal model/kamera klipleri
için dış 2D animasyon, bağımsız örnekleme, scrub/loop, portable/history ve
viewport/MCP/raster eşliği doğrulandı. Yeni kaynak formatı, import formatı veya
3D araç eklenmedi; mevcut ortak hesaplama/çizim hattını değiştirmeyi gerektiren
bir üretim hatası bulunmadı. Ana planın sonraki işi **3D0: kaynak/parça ağacı,
seçim ve XYZ gizmo**; bu kabulde onun geliştirmesine başlanmadı.

## Kabul sahnesi ve sözleşme

`src/lib/model3d/__tests__/clipAcceptanceScene.ts` tek bir gerçek, gömülü BIN
chunk'lı GLB kullanır. Modelin ithal parent dönüşümü korunur. Test sahnesi:

- Dış x, dönüş ve kutu genişliği animasyonlu orijinal model; iç klibi 1000 ms
  periyotla döner.
- Aynı asset'i paylaşan bağımsız copy; farklı aktif klip, kamera/FOV/hedef,
  ışık, boyut ve opaklık; 250 ms başlangıç, klip sonunda Hold.
- Aynı kaynak tanımını paylaşan ince live instance; 400 ms başlangıç, kendi
  yerel klip zamanı ve hareketli/dönüşlü 2D parent altında kendi dış transform'u.
- Kaynak koruması için ayrıca elle düzenlenmiş 2D katman/key sentinel'leri.

İç model dönüşü/kamera yaw lineer, ölçek custom Bézier, kamera pitch Hold'dur.
Bir **copy** içerik tanımı bağımsızdır; kaynak klip edit'i onu değiştirmez.
Bir **live instance** mevcut sözleşme gereği tanımı paylaşır: kaynak klip edit'i
ona da yansır, fakat onun 400 ms gecikmeli saati orijinalin pozu ile ezilmez.
GPU geometri/material hazırlığı ortak olsa da her çizim model, kamera ve ışık
değerlerini kendi değerlendirilmiş payload'ından alır. Bu, bağımsız rig/mixer
veya parametrik komponent override sistemi eklendiği anlamına gelmez.

Kaynak `startMs` composition ms'dir; iç zaman
`max(0, globalTimeMs - owner.startMs)` üzerinden mevcut `computeLocalTime` ile
hesaplanır. Alternatif kliplerden yalnız aktif olan örneklenir. İç klip root
Timeline'a kopyalanmaz ve her model yeni rAF/clock başlatmaz.

Detay editörünün paused terminal-key görünümü explicit yerel zamanı tutabilir.
Main/player/render loop sınırında ise klip kendi başlangıcına döner. Yerel
authoring endpoint'i ile global loop frame'i farklı zaman bağlamlarıdır;
karşılaştırmalar aynı composition zamanı ve aynı aktif klip politikasıyladır.

## Gerçek veri ve görüntü kontrolleri

`src/lib/model3d/animation/modelClipIntegration.test.ts`:

- Dış hareket + iç poz/kamera birlikte materialize edilir; parent bağı ve
  kopya/live instance kaynak çözümlemesi korunur. Instance, orijinalin ayrı
  değerlendirilmiş kutu genişliğini yanlışlıkla miras almaz.
- Başlangıçlar, loop sınırları, hold sonu ve geri scrub; player ve explicit
  frame servisi aynı değerleri verir. Hazır override renderer'a verildiğinde
  iç klip ikinci kez örneklenmez.
- Gerçek in-memory MCP broker → browser dispatcher `evaluate_frame` yolu
  aynı sonuçları verir; revision, JSON source ve history değişmez.
- Portable parse, detayda bir key değişimi, diğer copy'nin korunması, live
  instance'a paylaşılan tanımın yansıması ve tek ana Undo/Redo denetlenir.
- Explicit sampling sırasında `requestAnimationFrame` çağrısı oluşmadığı
  ve kaynakta yeni bir clock/state yazılmadığı doğrulanır.

`browser-clip-frames.tsx` gerçek `useEditorState`, `useInteractiveRuntime`,
`useAssetCache` ve mounted `SceneCanvas` kullanır. `checkClipFrames.ts`,
gerçek GLTFLoader/WebGL2/Canvas2D ve native PNG encoder çıktısını ölçer:

1. Composition zamanları: **0, 400, 500, 999, 1000, 1250, 1400, 1500,
   2400, tekrar 500, tekrar 0 ms**. Orijinal loop, copy terminal Hold ve
   gecikmeli instance'ın kendi loop dönüşü ayrı ayrı kapsanır.
2. Gerçek editor hook'u, `ChronoPlayer`, MCP live `evaluate_frame` ve explicit
   `evaluate_frame` değerleri karşılaştırılır.
3. Üretim `drawViewportFrame` adapter'ı, MCP `render_preview` dispatcher'ının
   PNG çıktısı ve `acquireRasterImage` PNG'si decode edilir. **480×320×4 RGBA
   kanalının tamamı** karşılaştırılır; birkaç piksel/checksum yeterli sayılmaz.
4. Mounted `SceneCanvas`'ın gerçek canvas pikselleri de 500 ms'deki adapter
   çıktısına eşittir. Temiz preview: grid/selection/ghost yoktur. Doğrudan
   viewport adapter'ında düşük zoom LOD açıkken hareketli model donmaz.
5. Raster kareleri job'a ait tek `VisualMediaSession` ile yeniden kullanılır;
   sıralı render ve geriye seek farklı eski frame'e veya başka örneğin pozuna
   bağlanmaz.
6. Aynı hazırlanmış kaynakta **A→B→A** çizilir. Kamera/poz/ışığı farklı B,
   A'nın sonraki piksellerini değiştirmez; A ve B gerçekten farklı görüntüdür.
7. Portable source gerçek model byte'larını korur; açılan sahne aynı görüntüyü
   üretir. Okuma/render source'u veya manuel key metadata'sını değiştirmez.
8. İptal edilmiş render stale sonuç üretmez. Viewport/job pinleri bırakılır;
   eski media snapshot'ının model erişimi kapanır. Idle cache temizliğinden
   sonra model/output job'ları ve yönetilen GPU/derived/scratch rezervasyonları
   sıfıra döner.

MCP testleri Node'da gerçek broker'ın in-memory transport'unu ve tarayıcıda
üretim browser dispatcher'ını kullanır. Kullanıcının açık editor session'ına
bağlanıp sahnesini değiştirmez; WebSocket/ağ gecikmesi ölçümü değildir.

## Tekrar çalıştırma ve sahiplik

```sh
npx vitest run src/lib/model3d/animation/modelClipIntegration.test.ts
node scripts/model3d/prepare-clip-browser.mjs
node scripts/perf/serve.mjs /private/tmp/chorono-3dt2-browser 4336
```

Next dev/production server'ı build öncesi durdurun. Test sayfasında **Run T2
acceptance** üretim servislerini çağırır; sonuç ve üç gerçek görüntü gösterilir.
Source/recovery/MCP kullanıcı projesi kullanılmaz. Tekrar çalıştırma eski
viewport'u yeniden kurar. Test kodu owning model3d `__tests__` alanındadır;
production'a ikinci evaluator, asset cache veya PNG encoder eklemez.

Test byte kopyaları ve kanıt canvas'ları QA'ya aittir. Her native bitmap kapatılır;
geçici canvas backing'i sıfırlanır. Output lease'leri encode/okuma bitince bırakılır.
Kullanılan viewport ve sequence/job media sahipleri ayrı kalır. Son temizleme
`finally` içinde çalışır; kaynak veri, GPU/mixer handle veya yoğun kare tamponu
scene JSON/Undo'ya yazılmaz.

## Ölçüm kapsamı

Kabul aynı Chrome/WebGL2 bağlamında, composition çözünürlüğünde, Canvas2D
RGBA8/default renk politikasıyla yapılır. Başka GPU/tarayıcı/işletim sistemi
arasında bit düzeyinde eşlik iddiası değildir. Native GLB skeleton/morph klip
oynatımı, tam rig editörü, ileri compositing, 4K vektör çizimi/FP16/renk yönetimi
ve tam Export E0 kapısı bu teslimin kapsamına girmez. Basic/native runtime ve
standalone HTML'in boxed 3D için mevcut açık ret davranışı korunur.

Yönetilen bütçe **512 MiB**'dir. GPU ve native kaynakların bu ledger'daki
değerleri politika tahminidir; tüm process RAM'i, decoder/driver kopyaları veya
fiziksel belleğin anında düşmesi ölçülmez. Küçük sahne kabulü büyük sahne/uzun
süreli stres benchmark'ı olarak sunulmaz.


## 14 Kasım kabul sonucu

- Tam suite: **380 dosya / 3.089 test**; yeni T2 dosyasında 17 entegrasyon testi.
- Native tarayıcı kabulü: **58 kontrol / 11 kare**. Bütün viewport/MCP PNG ve
  viewport/raster RGBA karşılaştırmalarında değişen kanal **0**, en büyük
  mutlak fark **0**. Raster uyarısı oluşmadı.
- 512 MiB yönetilen bütçede ölçülen tepe: **2.937.857 byte (yaklaşık 2,80 MiB)**;
  kontrollü son temizleme: **0 resident/reserved/protected byte**, 0 kayıt ve
  0 admission reddi. Bu yalnız bu küçük fixture'ın yönetilen kaynak ölçümüdür.
- Source revision **0**, Undo **0** ve kaynak JSON aynı kaldı. Native slider
  End → 2400 ms ve Home → 0 ms ile ayrıca kontrol edildi.
- TypeScript, `npm run mcp:build` ve `npm run build` başarılı. Next'in mevcut
  `applicationBuildInfo.ts` JSON named-export uyarısı sürüyor.

Kullanılan yeni kontrol yalnız QA/test ve belgeleri genişletir. Üretimdeki
`evaluateSceneFrame` açıklaması private klip sırasını içerecek şekilde düzeltildi;
çalışan interpolasyon, renderer, kaynak şeması veya command davranışı değişmedi.
Aynı dalda önceden mevcut diğer geliştirmeler korunmuştur.
