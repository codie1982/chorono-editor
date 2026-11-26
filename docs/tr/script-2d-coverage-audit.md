# 2D Script API — özellik bazında kapsam incelemesi

Tarih: 16 Kasım 2026. İncelenen geliştirme dalı: `codex/boxed3d-first-slice`.
Kapsam: mevcut **2D sahne üretimi ve düzenlemesi**. 3D modelleme, kamera,
materyal, rig ve iç 3D Timeline yetenekleri bu incelemenin dışında tutuldu.
Yalnız scriptin 2D sınırını aşıp aşmadığı ayrıca denetlendi.

## 26 Kasım 2026 ek kontrol

Bu bölüm ana planın §9A, §12.65–82 ve §12.90–102 teslimlerini, Mesh2D araçlarını ve Link & IK güncellemesini kapsar. Aşağıdaki 16 Kasım envanteri tarihsel kayıttır.

| Alan | Doğrulanan giriş | Sınır veya açık iş |
| --- | --- | --- |
| Pivot link, iki parçalı IK ve IK/FK | Dokuz MCP aracı ve `layer.rig2d(action, options)`. Bind, limit, bükülme, ağırlık, Match, tanı ve pozu koruyarak ayırma aynı editör komutlarını kullanır. | MCP görünen kareyi okur. Script kendi taslağındaki seçili timeline’ı örnekler. Canlı State Machine, fare hareketi ve geçici hedef sürüklemesi script girdisi değildir. |
| Spline Point / Edge / Object | `layer.spline.edit` ve `prepare_spline_edit` içinde `topology` eylemleri Break, Fuse, Reset/Paste Tangents, Split, Trim, Extend, Add Vertex, Divide, Simplify, Smooth, Subdivide ve Interpolation sunar. `getPoint/getHandle` ile tangent okunabilir. | Etkileşimli clipboard ve seçim oturumu editörde kalır. Script açık kimlik, koordinat ve tangent verisi kullanır. |
| Spline Boolean ve Outline | Union/Subtract/Intersect/XOR önizlemesi mevcut prepare/apply işidir. `resolve_spline_boolean` Merge veya Separate uygular. `edit_2d_modifier_stack` içinde `liveOutline` kaynak değişiklikleriyle yeniden hesaplanır. | Yeni Boolean çözümü ve native Offset/Chamfer/Fillet önizlemesi için MCP planı gerekir. Eski `outlineContour` paralel kontur üretir. |
| Mesh2D modelleme | `layer.geometry2d` ve MCP aynı şemaları kullanır. Aynı katmanda dönüşüm, Split/Flip Edge, Delete Face, Fill Hole, seçili vertex dönüşümü, Smooth, Delaunay/Grid ve stack düzenleme kullanılabilir. | Edge/Face dönüşümünde köşe kimlikleri verilir. Panelin geçici edit modu ve ghost görünümü headless girdiler arasında bulunmaz. |
| Mesh2D görünüm ve kaynak | Bağımsız kaynak mesh oluşturma/yenileme, texture atama ve yerleşim, pin ve deformasyon asset bağlama aynı girişte yer alır. | Texture yerleşimi geometri UV’lerini değiştirmez. İleri UV kanal düzenleme ayrı planlanır. |
| Rigid body / Voronoi / bake | Native MCP prepare, inspect, preview, commit, cancel, clear ve re-bake akışları. Script dönen kaynak katman ve anahtarları okuyabilir. | Worker, iş ömrü, iptal ve çıktı dosyaları host tarafından yönetilir. |
| Diğer source düzenlemeleri | Scene/Timeline/Explorer/Particle yüzeyi mevcut. Ham alan yazımında sahiplik ve 2D kapsam denetimleri güncellendi. | Timeline bar retime/split, asset koleksiyonu ve reusable component authoring için özel SceneAPI girişi eksik. Geometri modifier ayarlarının animasyonu ve ileri karakter/IK özellikleri ileri fazda. |

`get_capabilities({summary:true}).scriptAuthoring` güncel `rig2d` ve `geometry2d` işlem adlarını listeler. `get_capabilities({toolName:'edit_2d_modifier_stack'})` modifier alanlarını, birimlerini ve seçeneklerini döndürür. [Güncel script sözleşmesi](scripting.md) · [Ham kaynak korumaları](script-source-guards.md) · [MCP ve QuickJS kabul testleri](../../src/lib/mcp/__tests__/rigGeometryScript.test.ts)

### Kabul sonuçları

- 2001 portunda ayrı bir üretim editörü oturumunda 600 ms’de IK ağırlığı %40’a getirildi. FK ve IK yönlerinde Match sonrasında omuz, dirsek, uç ve iki eklem açısı korundu. Her yönde doğrudan MCP ve QuickJS planının ürettiği PNG baytları eşleşti. Dry run sahneyi değiştirmedi ve her Apply tek Undo ile başlangıca döndü. IK’ye geçişte hedef seçilen pozun ucuna taşındı.
- Aynı editörde bir dikdörtgen aynı katmanda Spline ve Mesh2D’ye dönüştürüldü. Smooth eklenip ayarı değiştirildi. Bir vertex hareketi geri alındı. Script üzerinden Delaunay Subdivision ve Execute sonrasında mesh 98 üçgen içeriyordu.
- Otomatik kabulde delik açma/doldurma, Boolean sahibine Merge, Separate, geçersiz topoloji kimliği, Auto Key ve iki yönlü poz eşliği sınandı. Tam test paketi 596 dosyada 4.281 testi geçti.

## Sonuç ve kanıtın sınırı

**Script, uygulamadaki bütün 2D işlemleri karşılamıyor.** Kaynak alanlarına
erişim geniş; özellikleri arayüzle aynı doğrulama, sahiplik ve yan etkilerle
çalıştıran komut kapsamı daha dar. `patch` ile bir JSON kaydı yazılabilmesi,
ilgili editör aracının script API'sinde tamamlandığı anlamına gelmez.

- Registry'deki **33 ayrı 2D katman türü** QuickJS ile tek tek oluşturuldu.
- Bu türlerin **833 inspector şema kaydı / 121 farklı property yolu** tek tek
  genel `patch` ile yazılıp `get` ile geri okundu. Koşullu inspector alanları da
  envantere dahil. Bu test **kaynak kayıt eşliğidir**; 833 render veya native
  işlem eşliği testi değildir. Medya örneklerinde gerçek dosya decode edilmedi.
- Önceki metot eşliği testi Scene/Layer/Timeline/SM/Particle/Spline/Explorer
  public yüzeylerinin gerçek QuickJS proxy'de bulunduğunu doğruluyor. Aynı
  isimlerin varlığı tek başına tüm UI işlemlerinin desteklendiğini kanıtlamaz.
- Yeni kapsam testleriyle birlikte iki dosyada **883 test geçti**. Bunların
  bir bölümü bilinen açıkları **mevcut hatalı davranış olarak** tekrar üretir;
  yeşil test sonucu aşağıdaki açıkların düzeltildiği anlamına gelmez.
- Genişletilmiş script/MCP kontrolünde **33 dosyada 1.067 test** ve TypeScript
  kontrolü geçti. Üretim kaynakları değişmediği için bu tur yeni build/render
  eşliği iddia edilmiyor; görsel kalite bu source audit'inin kapsamı değildir.
- Bu tur üretim davranışı değiştirilmedi. Rapor, kaynak envanteri ve izole
  karakterizasyon testleri eklendi; kullanıcının açık sahnesine dokunulmadı.

Tekrar üretme:

```sh
npx vitest run --maxWorkers=3 src/lib/script/__tests__/coverage2d.audit.test.ts src/lib/mcp/__tests__/scriptCompatibility.test.ts
```

[Test kaynağı](../../src/lib/script/__tests__/coverage2d.audit.test.ts),
[metot eşliği](../../src/lib/mcp/__tests__/scriptCompatibility.test.ts).
Oluşan kanıtlar `artifacts/script-2d-audit-20261116/evidence.json` ve
`property-coverage.csv` içindedir. CSV'nin her satırı bir katman/property
kombinasyonudur; tekrar eden ortak alanlar hangi katmanda denendiğini korur.

## Durum anahtarı

| Kod | Anlam |
| --- | --- |
| **D** | İlgili source işlemi için özel script/domain girişi var. Belirtilen sınırlar geçerli. |
| **G** | Yalnız genel `patch/set/track/set` ile kayıt erişimi var; native işlem eşliği/odaklı komut eksik. |
| **M** | Uygulamada/MCP host'ta var, senkron `scene` script API'sinde yok. Host sınırı olabilir. |
| **X** | Mevcut 2D editör işleminin güvenli script karşılığı eksik. |
| **U** | Editöre ait geçici UI/oturum ayarı; source scriptinden ayrı tutulması uygun. |
| **B** | Testle tekrar üretilen davranış/sınır problemi. |
| **N** | Uygulamanın mevcut 2D sürümünde tamamlanmış özellik değil; script açığı olarak sayılmaz. |

Bir satırın D olması tüm parametrelerinin sınırsız olduğu anlamına gelmez.
Örneğin scalar bake color/string bake yerine geçmez. G satırları “tam destek”
olarak sayılmamalıdır. M ve U satırlarının tamamını `scene` içine taşımak da
doğru değildir: async iş, dosya ve UI sahipliği kendi host'unda kalmalıdır.

## Öncelikli bulgular

| Öncelik / ID | Tekrar üretilen durum | Etki ve önerilen sınır |
| --- | --- | --- |
| P1 / **B1 — Genel patch korumaları** | Kilitli spline üzerinde `pos` değişikliği kabul edildi; `set({spline:...})` ile bir point silinip onu kullanan segmentler bırakıldığında QuickJS sonucu kabul edildi. Aynı veri native `assertSplineTopology` kontrolünden geçmiyor. | Özel SplineHandle korumaları raw setter yolunu kapatmıyor. Kaynak patch'lerini native layer/geometry/driver korumalarıyla denetlemek ve bozuk topolojiyi commit öncesi reddetmek gerekir. Kilit kuralını aşmak gerekiyorsa bu açık bir yetenek olmalı. |
| P1 / **B2 — Clone / Array eski yol** | İki Timeline'da X/Y animasyonu olan katman `scene.clone(...,{timelineId:'first'})` ile çoğaltıldığında kopyanın ikinci Timeline track'i yok. | Script `makeCloneCmd`/`makeArrayCmd` tek kaynak/tek Timeline adaptörlerini kullanıyor; yeni viewport V4/V5 forest sözleşmesini tam kullanmıyor. Çoklu kökler, bütün ilgili Timeline'lar ve graph referansları ortak forest komutuna bağlanmalı. Clone kaybı doğrudan test edildi; Array'nin aynı tek-Timeline sınırı kaynak kodunda doğrulandı. |
| P1 / **B3 — 2D kapsam sınırı** | Public script `scene.add('model3d')` ve statik `model3d.rotation` patch'ini kabul ediyor. | “Script yalnız 2D alanlarını kontrol eder” koşulu şu an genel olarak uygulanmıyor. 3D iç key'lerini engelleyen Timeline guard tek başına yeterli değil. Açık script kapsam politikası gerekir; mevcut 3D kaynağı silmeden/bozmadan korumalıdır. |
| P1 / **B4 — timeWarp açıklama/işlev uyuşmazlığı** | Registry'de `timeWarp` modifier yok; buna rağmen `.modifier({type:'timeWarp'})` kabul ediliyor. 0→100 track'in 500 ms'deki 50 değeri varsayılan add blend ile **100** oluyor. | “Eski tür no-op” açıklaması doğru değil. Bilinmeyen modifier `currentValue` döndürüyor, pipeline tekrar ekliyor. Türü reddetmek veya bilinmeyeni blend öncesi gerçekten atlamak gerekir. Gerçek zaman remap alanı `track.timeWarp`. |
| P1 / **B5 — Expression review eksikliği** | Genel patch ile `notAFunction(1)` formülü kaynakta kabul ediliyor; hata ancak frame değerlendirmesinde görülüyor. | Persisted kaynak validasyonu kasıtlı olarak formülleri çalıştırmıyor. Authoring tarafında UI'nın Set/Review komutu gerekir; dosya açılışında tüm formülleri çalıştırmak çözüm değildir. |
| P1 / **B6 — Inspector sınırları** | `opacity=2` ve `size=[-10,0]` source setter'larından kabul edildi. Inspector şemasında opacity 0–1, en/boy en az 1. | Global finite sayı/scene bütçesi kontrolü bütün property şeması doğrulamasını karşılamıyor. Source authoring, ilgili registry sınırlarını ve özel domain kurallarını uygulamalı. |
| P2 / **F1 — Parent anlamı** | `layer.parent(group)` world X'i 20'den 120'ye taşıyor; `scene.explorer.reparent(...,{keepWorld:true})` 20'yi koruyor. | Raw parent local ilişkidir, world koruma değildir. Eksik işlem sanılmamalı; doğru yöntem Explorer reparent. Kısa yolun farkı belirgin belgelenmeli. |
| P2 / **F2 — Source / pose farkı** | X key'leri 0→100 iken `.pos=[500,0]` base X'i 500 yapıyor; 500 ms render değeri 50 kalıyor. | Setter source fallback yazar. UI'daki manual/auto-key pose düzenleme iş akışına eşdeğer değildir. Zaman bağlamlı güvenli pose komutu eksik; bugün açık `.key` kullanılmalı. |

Bu bulguların çözümü adına bu tur keyler silinmedi, formüller bake edilmedi,
raw patch kapatılmadı veya eski çağrıların davranışı değiştirilmedi.
B4 yalnız proxy'de değil, ortak modifier pipeline'ındadır; çözümü de ortak
katmanda yapılmalıdır. Ayrıca manuel Console `ScriptRunner` yerel
`new Function` kullanır, QuickJS sandbox'ı değildir. Katı bir 2D script yetki
sınırı tasarlanırken yalnız MCP proxy'sini filtrelemek yeterli sayılmamalıdır.

## 1. Katman türleri — her kayıt ayrı kontrol edildi

| Registry kind | Durum / script girişi | Sınır |
| --- | --- | --- |
| `rect` | D — `scene.add('rect')` | Temel dikdörtgen; kaynak property'leri erişilebilir. |
| `roundedRect` | D — add | Corner radius kaynakta. |
| `circle` | D — add | Editable Poly mesh değildir. |
| `ellipse` | D — add | Ölçüler kaynakta. |
| `line` | D — add / shapeParam | Parametrik shape çizgisi; normalized spline değil. |
| `arrow` | D — add / shapeParam | Uç/baş ölçüleri kaynakta. |
| `polygon` | D — add / shapeParam | Kenar sayısı/roundness; vertex/edge mesh edit değildir. |
| `star` | D — add / shapeParam | İç/dış yarıçap, point sayısı. |
| `ring` | D — add / shapeParam | Açılar/iç yarıçap. |
| `arc` | D — add / shapeParam | Başlangıç/bitiş açısı. |
| `capsule` | D — add | Temel shape. |
| `spiral` | D — add / shapeParam | Parametrik shape; SplineGenerator spiral API'si olduğu anlamına gelmez. |
| `wave` | D — add / shapeParam | Amplitude/frequency/phase. |
| `blob` | D — add / shapeParam | Parametrik kontur; birleşen akışkan/metaball simülasyonu değildir. |
| `splineCircle` | D — add / `addSpline('circle',...)` | Normalized point/handle verisi. |
| `splineLine` | D — add / addSpline line | Aynı ayrım geçerli. |
| `splineRect` | D — add / addSpline rectangle | Aynı ayrım geçerli. |
| `splineEllipse` | D — add / addSpline ellipse | Aynı ayrım geçerli. |
| `splineArc` | D — add / addSpline arc | Aynı ayrım geçerli. |
| `splineDonut` | D — add / addSpline donut | Çok konturlu normalized source. |
| `splineNGon` | D — add / addSpline ngon | Aynı ayrım geçerli. |
| `splineStar` | D — add / addSpline star | Aynı ayrım geçerli. |
| `pathStroke` | D oluşturma, G ayrıntılar | `pathStroke.path/stroke/trim` kaydı. |
| `bezierPath` | D — add / `addPath` | Noktadan çizim var; Pen edit komutlarının hepsi yok. |
| `motionPath` | D — add / `addPath(...,{role:'motion'})` | Source path ve Follow Path ayrıdır. |
| `text` | D — add / `.text/.font` | Tam tipografi G ile; font import async host'ta. |
| `image` | D placeholder, M import | Add tek başına gerçek asset yüklemez. |
| `video` | D placeholder, M import | Aynı sınır; video edit CFX kapsamıyla karıştırılmaz. |
| `audio` | D placeholder / `scene.audioClip(existingAssetId,...)` | Yeni dosya import'u host'ta. |
| `frameSequence` | D placeholder, G sprite ayarları, M import | Gerçek atlas/GIF çözümleme ayrı. |
| `group` | D — add / Explorer.group | Güvenli gruplama için Explorer yolunu tercih et. |
| `repeater` | D oluşturma, G config | Convert/Bake özel script komutu yok. |
| `particleEmitter` | D — add / addEmitter / ParticleHandle | Gerçek akışkan/cloth solver değildir. |

Kaynak: `src/lib/registry/bootstrap.ts`, `definitions/*`, `SceneAPI.add`.
Model3D bu tabloya dahil edilmedi.

## 2. Sahne, hiyerarşi, transform ve çoğaltma

| Özellik | Durum / erişim | Eksik veya önemli fark |
| --- | --- | --- |
| Tam sahne, katman ve koleksiyon okuma | D — snapshot/get/find/layers/data/get | Detached kopyalar. Kopyayı değiştirmek source yazmaz. |
| Kompozisyon en/boy, süre/FPS | D — composition | Süre eşleme için açık `{timelineId}`; FPS ms keylerini retime etmez. |
| Solid/gradient/image/none arka plan | D/G — composition modern paint | Gerçek yeni image import'u M. |
| Arka plan export görünürlüğü | D — composition.backgroundInExport | Kaynak tercihi var; export host'ta. |
| Katman ekleme / tek kök silme | D — add/remove | Remove subtree ve Timeline track temizliğini native komutla yapar. |
| Çok köklü tek delete çağrısı | X | Döngüyle remove mümkün; tek odaklı multi-root komut yok. |
| X/Y, rotation, scale, opacity, size | D — özel setter'lar | Statik source; pose key düzenlemesi değil (F2). |
| Pivot/anchor değiştirme | G — transform.anchorX/Y | Görüntüyü koruyan pivot taşıma/Center Anchor komutu X. |
| Flip / 90° dönüş | G — transform | Native layerTransforms işlemlerine özel giriş X. |
| Align / Distribute | X | Koordinatları elle hesaplamak ortak bounds/parent/animation politikasına eşdeğer değil. |
| Fit Parent | X | `buildFitParentCommand` var; script adaptörü yok. |
| Komşu mesafesi ölçme/düzenleme | X | `prepareSelectionGaps` var; script adaptörü yok. |
| Group / Ungroup | D — Explorer.group/ungroup | Statik/world/compositing güvenlik sınırları açıkça reddedilir. |
| Parent / reparent | D — parent / Explorer.reparent | Parent local, Explorer keepWorld (F1). |
| Ön/arka, kardeş sırası | D — Explorer.reorder/moveBefore/moveAfter | UI pin sırasından bağımsız authored sıra. |
| Alt ağaç okuma | D — children/ancestors/descendants/tree/query | Panel collapse/selection değildir. |
| Hidden/locked/solo/pinned | D/G — Explorer.setFlags | Alt ağaç hedeflerini descendants ile açık genişletmek gerekir. |
| Frozen / color label / internal grid | G — layer.patch | Native genel editability guard her raw yazmada uygulanmıyor (B1). |
| Tek kök Copy/Instance | D ama sınırlı — clone | B2; referans/virtual tür adlarının varlığı tam destek demek değil. |
| Çoklu seçim V4 forest duplicate | X | Script yalnız tek handle alıyor. |
| Clone & Align | X | Viewport'ta makeCloneAlignCmd bağlantısı var; SceneAPI'de hedef listeli karşılığı yok. |
| Linear/Grid/Radial/Path Array | D ama sınırlı — array | Flat eski adaptör; tüm V5 seçenekleri yok. |
| V5 world/parent/local, source policy, time offset, multi-root | X | `prepareArrayForest` ile script akışı birleştirilmeli. |
| Array preview / Apply / Cancel | X | Genel script dryRun başka şeydir; V5 native önizleme geometrisini sunmaz. |
| Repeater linear/polar source | G — repeater payload | Bake UI'da bağlı ama özel script komutu X; Convert backend komutunun UI bağlantısı bulunmadı. |
| Instance Make Unique | X | Yeni kaynak/ilişki dönüşümü için odaklı API yok. |

Kaynak: `SceneAPI`, `LayerHandle`, `ExplorerAPI`, `commands-clone`,
`commands-clone-forest`, `commands-array-forest`, `fitParent`, `selectionGaps`,
`commands-repeater`. Legacy açıklama yorumları yerine aktif çağrı yolu esas alındı.

## 3. Fill/Stroke, metin, path ve spline

| Özellik | Durum / erişim | Eksik veya önemli fark |
| --- | --- | --- |
| Fill color | D — `.fill` | Solid moda geçer. `undefined` atamak None yapmaz. |
| Fill None / gradient / image / opacity | G — tam style.fill; spline için D paint | Genel Shape için odaklı paint API'si eksik. |
| Resim Cover/Contain/Stretch, offset/scale/rotation | G — style.fill.image | Native `fill` enum'u UI Stretch'tir; video fill yok. |
| Yeni resmi yalnız dolguya import et | M/X | UI atomik `makeImportImagePaintCmd` var. MCP import_asset normal katman ekler; aynı işlem değildir. |
| Stroke color/width/opacity | D — `.stroke` kısa yolu | Mevcut mode'u değiştirmez. |
| Stroke None / gradient / alignment / cap / join / dash | G; spline için D tam paint | Stroke record'unu ve ilgisiz alanları korumak çağırana kalır. |
| Stroke trim / moving segment | G — style.stroke.trim | Topolojiyi değiştirmez. |
| Text value/font/size/weight/style/align/spacing/case/underline | D — text/font | `.font` bütün TextStyle alanlarını kapsamıyor. |
| Text gradient/texture/direction/line-height/stroke/shadow | G — text payload | Özel tipografi komutları eksik. |
| Text → glyph spline | X | Native async textToSplineData akışı var; script/MCP giriş yok. |
| Shape → editable path dönüşümü | X — backend komut kapsamı | Yerelde convert komutu var; mevcut Canvas action bağlantısı `undefined`, yani bu satır çalışan bir UI menüsü iddiası değildir. Script adaptörü de yok. Metadata kind değiştirmek conversion değildir. |
| Path oluşturma | D — addPath | Nokta listesi; varsayılan line anchors. |
| Path anchor/handle/pointType, close/reverse/refine | G — path.anchors/closed | `pathOps`/Pen komutlarına özel PathHandle yok. SplineHandle farklı veri modelidir. |
| PathStroke geometri/glow/trim | G — pathStroke payload | Özel handle yok. |
| Follow Path | D — followPath | progress key'lenebilir; native assign_motion_path kısa yolu ile aynı otomatik key kurulumunu yapmaz. |
| Spline read/get elements/bounds | D — SplineHandle | Layer-local geometry. |
| Point move/type/lock, handle move/type/lock | D — SplineHandle | Özel native guard'lı yol; raw patch aynı güvenceyi vermiyor. |
| Point/Edge/Object açık seçimi | D — spline.edit selection | Geçici viewport edit mode'u değil. |
| Append / Continue / Auto Close | D — appendPrimitive / edit | Açık endpoint ID'leri, yeni yerel anchors. Global tercih değişmez. |
| Connect / Weld | D — edit topology | Native açık uç/topoloji kuralları; script basit edit'i t=0 kullanır. Başka zamanda world-space tolerans için MCP prepare timeMs gerekir. |
| Refine / Divide / delete / close / open / reverse | D — edit topology | Native mode, ID ve driver sınırları. |
| Alt Object copy/transform | D — edit | Dış transform değil, yerel geometry işlemi. |
| Attach / Detach | D — edit | Unsafe animation/reference geçişini reddeder. |
| Offset / Outline | M — prepare_spline_edit | Async worker; senkron script metodu yok. |
| Chamfer | M — aynı plan akışı | Aynı sınır. |
| Fillet | M — aynı plan akışı | Aynı sınır. |
| Boolean union/subtract/intersect / re-edit recipe | M — aynı plan akışı | combineMode yazmak solver çalıştırmaz. |
| Mouse vertex snap / çizim gesture'ı | U; uç ID'siyle D | Headless çizimde mouse taklidi gerekmez. |

Kaynak: `LayerHandle`, `SplineHandle`, `editor/spline/operations`,
`path/pathOps`, `commands-convert`, `commands-image-paint`, `page.tsx`
text-to-spline callback'i. Ağır spline işlemleri için [MCP sözleşmesi](mcp-spline-editing.md).

## 4. Timeline, keyframe, curve ve motion path

| Özellik | Durum / erişim | Eksik veya önemli fark |
| --- | --- | --- |
| Timeline oluştur/aç/seç/sil/clone | D — SceneAPI timeline metotları | Script useTimeline, UI sekme seçimi değildir. |
| Katman membership | G — Timeline.set({layerIds}) + key'de D | Listeyi odaklı add/remove eden method yok. |
| Süre/loop/pingPong/count/autoplay/work area | D/G — Timeline.set | Tam kayıt alanları; süre büyürse kompozisyon genişler. |
| Key range playback tercihi | G — playKeyRange | Editör transport tercihi, export trim değildir. |
| Marker / segment / event CRUD | G — Timeline.set arrays | Stable-ID odaklı ekle/sil/taşı method'ları X. |
| Number/color/vec2/string/bool key | D — Layer.key / Timeline.key | Family semantiği; string/bool hold. |
| Exact-time upsert / ID/easing koruma | D — key | 1e-6 ms tolerans; yakın bağımsız keyler korunur. |
| Easing/customBezier | D — key argümanı | Başlangıç key'inin temporal easing'i. |
| Tek key'i ID ile taşı/sil/duplicate | X | Track keyframes dizisini değiştirmek G; native collision/identity komutu değildir. |
| Toplu taşı/kopyala/sil, frame slide | X | `commands-keyframe` bulk araçları var; script adaptörü yok. |
| Toplu easing/tangent düzenleme | G tam key array; odaklı X | Tam record'u koruma/collision sorumluluğu çağıranda. |
| Set Key keyset / snapshot-all-supported | X | UI keyset ve `makeKeyframeLayerSnapshotCmd` scriptte yok. |
| Stagger / scale-time / mirror / reverse-values / align-to-frame | X | Native bulk hesaplamalar scriptin tek authoritative yolu değil. |
| X/Y spatial route / Draw Motion / key insert | X/G | Normal X/Y key yazımı var; viewport route/tangent komutları yok. |
| motionTangentMode / segmentModifiers kayıtları | G — track({keyframes}) | UI seçili key/curve manipülasyonu değildir. |
| Out-of-range altı davranış | G — track.outOfRange | constant/cycle/loop/pingPong/linear/relativeRepeat kaynakları. |
| Waveform controller altı dalga | G — track.controller | Sine/cosine/square/triangle/saw/reverseSaw; özel controller helper yok. |
| Noise controller | G — track.controller | Numeric formula kaydı. |
| Track easeCurve/timeWarp/multiplier | G — track | Gerçek remap alanı var; modifier timeWarp ile karıştırılmaz. |
| 15 kayıtlı scalar modifier ekleme | D — Timeline.modifier | sine/pulse/quantize/offset/scale/clamp/noise/fractalNoise/jitter/wave/overshoot/elastic/bounce/decay/spring. Blend mode açık seçilmeli. |
| Modifier update/remove/reorder / segment scope | G — tam arrays | Native stable-ID scope komutlarına özel giriş X. |
| Bilinmeyen / legacy timeWarp modifier | B4 | Beklenen no-op açıklamasıyla çelişiyor. |
| Scalar track bake / pencere / tolerance | D — Timeline.bake | İşlem controller/OOR/modifier/time-map'i kaldırır; key array kapsamı sözleşmesine bakılmalı. |
| Live property expression bake | X | Timeline.bake aynı operasyon değildir; native preparePropertyExpressionBake/Apply adaptörü gerekli. |
| Ana/iç key hedefi ayrımı | D — mevcut scope guard | Bu, bütün source scriptini 2D ile sınırlamaz (B3). |

Kaynak: `TimelineHandle`, `LayerHandle.key`, `timeline/keyframeOps`,
`commands-keyframe`, `commands-track`, `viewportKeyframes`,
`animation/modifiers/*`, `PropertyExpressionBakeCommand`.

## 5. Efektler, maskeler, medya ve parçacıklar

| Özellik | Durum / erişim | Eksik veya önemli fark |
| --- | --- | --- |
| Legacy blur | G — effects.blur | Yerleşik source/evaluation yolu. |
| Brightness | G — effects.brightness | Aynı. |
| Contrast | G — effects.contrast | Aynı. |
| Saturate | G — effects.saturate | Aynı. |
| Plugin Blur | G — effectsChain type blur | Ekle/sil/reorder/param guard için özel EffectHandle yok. |
| Glow | G — type glow | Aynı; radius/intensity native parametrelerdir. |
| Shadow | G — type shadow | Aynı. |
| Inner Shadow | G — type innerShadow | Aynı. |
| Inner Glow | G — type innerGlow | Aynı. |
| Tint | G — type tint | Aynı. |
| Vignette | G — type vignette | Aynı. |
| Layer/group mask Add/Subtract/Intersect | G — masks array | Native ID/reference düzenleme helper'ı eksik. |
| Mask invert/feather/opacity | G — masks record | Tam listeyi elle değiştirmek odaklı command değildir. |
| Mask/efekt cache/ROI/LOD ayarı | U — render kaynak politikası | Source scripti geçici tampon/GPU handle tutmamalı. |
| Motion blur canlı ayarlar | G — motionBlur | Source alanı var. |
| Motion blur Bake/Unbake | N — tamamlanmamış | Backend komut dosyası var ama UI Bake disabled/coming soon. Çalışan UI özelliği veya yalnız script açığı sayılmadı. |
| Image fit/asset değiştirme | G — image | Asset decode/import M. |
| Video loop/mute/volume/source-in | G — video | Yeni video editör modu açıldığı anlamına gelmez. |
| Çoklu video katmanı | D/G — birden çok layer/asset | Render/media host yürütür; cache politikası script işi değil. |
| Sprite atlas rows/columns/count/FPS/loop/fit | G — frameSequence | 833 property kontrolüne dahil. |
| Genel layer bar trim | G — startMs/endMs | Timeline UI bar taşımasının key retiming yan etkisini yapmaz. |
| Layer split / shift / rescale ve key retime | X | Native Timeline bar komutlarına adaptör yok. |
| Audio clip mevcut asset'ten ekleme | D — scene.audioClip | Membership/yerleşim/süre ortak command. |
| Audio gain / fades / move / trim / split | D — audio helpers | Explicit time ve owner Timeline kuralları. |
| Audio pan/mute/loop/source-in | G — audio | Native patch_audio_clip MCP'de; özel script audio.patch yok. |
| Master audio gain/mute | D/G — composition linear gain | dB normalize/mix ölçümü host'ta. |
| Audio normalize / WAV preview / WAV export | M | Async ölçüm/encode; scene scriptinde yok. |
| Particle preset keşfi/oluştur/uygula | D — particlePresets/addEmitter/particles | Gerçek registered preset listesi. |
| Emitter point/line/circle/rectangle/path/sourceLayer | D — emission | Geometri referansları kaynakta olmalı. |
| Continuous/burst, rate/count/max, loop/delay | D — emission | Native particle validation. |
| Particle shape/size/color/palette/stroke | D — visual | Vec/Color family sınırları. |
| Lifetime, position offset, rotation velocity | D — animation | Genel fizik solver değildir. |
| Life scale/opacity/color eğrileri | D — life/lifeKey/remove/clear | Normalized lifetime t; destination stop easing. |
| Seed/randomness | D — seed/random | Deterministik seed, uint32 destekli. |
| Motion noiseDrift/sineWave/spiral | D — motion modifier CRUD | Sayısal particle motion. |
| Particle render quality/blend/glow/blur | D — rendering | Uygulamanın mevcut rendering ayarları. |
| Burst markers | N — source tipi ayrılmış | ParticleHandle boş olmayan burstMarkers listesini açıkça reddediyor; çalışan marker sistemi sayılmaz. Continuous/burst emitter modu ayrı ve destekli. |
| Particle Flow graph | N — `v3-stub` | Alanı yazmak çalışan node graph oluşturmaz. |

Kaynak: `types/effects/mask/media`, `effects/index`, `commands-motionblur`,
`commands-layer`, `commands-audio`, `ParticleHandle`, `particles/types/*`.

## 6. Expression, wire, interactivity ve state machine

| Özellik | Durum / erişim | Eksik veya önemli fark |
| --- | --- | --- |
| Parametre number/bool/string/color/image | D — addParam / update / remove | Source parameter; runtime canlı değer ayrı. |
| ParamBindings map | G — layer.paramBindings | Odaklı native binding incelemesi helper'ı eksik. |
| Binding source/target/range/reverse/clamp | D — addBinding/update/remove | Full typed record. |
| Wire oluştur/güncelle/sil | D — wire/updateWire/removeWire | Source/target/valueType/expression; shorthand bütün ref alanlarını almaz. |
| Wire modifierId / clamp gibi gelişmiş alanlar | G — updateWire full record | Güvenli ref-picker/driver conflict iş akışı tam sunulmuyor. |
| Constant numeric/typed input formula | G — inputExpressions + source value | UI makeInputExpressionCommand'in hesaplama/sahiplik/atomik yazma API'si X. |
| Live typed property expression | G — propertyExpressions | Number/bool/string/color/vec2 runtime var; odaklı Set/Remove/Convert/Review X, B5. |
| Live expression → native keys bake | X | Numeric Track.bake ile eşdeğer değil. |
| Tap/drag/followCursor/setsParameter/scrub config | D — interactive | Runtime hit test/transport host'ta. |
| Trigger basit oluştur/güncelle/sil | D — addTrigger/update/remove | Condition/multiple actions/segment/frame alanları için tam record güncelleme gerekir (G). |
| State machine oluştur/aç/sil | D — SceneAPI + Machine | Timeline referansları doğrulanır. |
| State CRUD, initial state, transition CRUD/guard/blend/priority | D — Machine | Kayıt editörü; UI graph node sürükleme değildir. |
| initialState kaydı | D — setInitialState | Runtime canlı parametre yazımı değildir. |
| Oynat/pause/seek/speed/runtime param/event | M — control_playback/control_runtime | Senkron authoring API'sinde yok; host sınırı uygun. |
| Scene.on / per-frame callback / key callback | N | Expression ve trigger var; keyframe array'e JS callback konmaz. |

Kaynak: `SceneAPI`, `entityCommands`, `StateMachineHandle`,
`InputExpressionCommand`, `PropertyExpressionCommand`, `mcp/extraTools`.

## 7. Asset, dosya, çıktı ve editör araçları

| Özellik | Durum / erişim | Eksik veya önemli fark |
| --- | --- | --- |
| Assets/collections listeleme | D — detached getters | Kaynakları import etmez. |
| Yeni asset import / SVG/GIF/sprite/font/media parse | M — import_asset/import host | Dosya, decode ve iptal sahipliği senkron script dışında kalmalı. |
| Asset rename/delete/replace, collection CRUD/membership | X | SceneAPI koleksiyonları read-only; editEntity bu koleksiyonları kabul etmiyor. Yerelde commands-import var. |
| Portable proje kaydet/aç/listele | M | MCP/file host; source scriptinde async IO yok. |
| Raster preview / frame evaluate | M | evaluateSceneFrame değerleri PNG kalite incelemesi değildir. |
| SVG / PNG sequence / runtime / WAV çıktısı | M | Yalnız desteklenen formatlar; SceneAPI içinde export fonksiyonu yok. |
| Undo/Redo | M — host/history | Script source işi tek Undo'da commit edilir; içinden history oynatılmaz. |
| Otomatik kayıt / sessionId / recovery / Undo persistence | U — editor host | Source scripti session/localStorage yönetmemeli. |
| Guide oluştur/taşı/kilitle/gizle/sil | X/U | Kalıcı editorGuides source var ama SceneAPI root setter yok. Otomasyon gerekiyorsa ayrı editor capability uygun. |
| Viewport grid/pan/zoom/snap/rotate-step/scale-step | U | UI tercihi; render source alanı değil. |
| Seçim/marquee/lasso/inside/touching/find selected | U | Headless API açık ID setleriyle işlemeli. |
| Isolation / edit mode / panel dock / ruler / shortcuts | U | Geçici editör bağlamı; layer.hidden veya solo yazmak izolasyonla aynı değil. |
| Resource panel / FPS/heap / LOD / cache eviction | U | Ölçüm ve kaynak yaşam döngüsü; ordinary scene JSON/undo içine taşınmamalı. |
| Telemetry onayı / diagnostic yönetimi / version check | U | 2D animasyon source API'si kapsamına dahil edilmedi. |

## 8. Henüz tamamlanmamış 2D plan özellikleri

| Plan alanı | Durum |
| --- | --- |
| Editable Poly vertex/edge/face, UV/vertex color | N — parametrik polygon shape ile aynı değil. |
| Voronoi fracture + rigid body solver/bake | N — spring/bounce sinyal modifier'ları bu motor değildir. |
| Kumaş / sıvı / birleşen Blob yüzeyi / ortak sim bake | N — mevcut parametric Blob ve particle motion ile aynı değil. |
| Character rig / bones / IK / reusable animated 2D components | N — genel 2D source API'si bu iş akışlarını sunmuyor. |
| CFX chroma key / despill / edge cleanup / tracker | N — mevcut yedi efekt listesinde bu işlevler yok. |
| Çalışan private 2D component clip authoring | N — mevcut isolated 3D detay Timeline'ı 2D component sistemi olarak sayılmadı. |

Bu alanlar “UI'da var ama scriptte unutulmuş” eksikleriyle karıştırılmamalı.

## Önerilen tamamlama sırası

1. **Source sınırı ve doğrulama:** B1/B3/B6; raw patch ile native komutun izin
   farkını kapat. 2D script, var olan boxed nesnenin dış 2D transformunu
   düzenleyebilse bile iç model/camera/clip kaynağına geçmemeli. Önce davranış
   ve migration sözleşmesi açık yazılmalı; mixed sahne kaynağı asla silinmemeli.
2. **Animasyon bütünlüğü:** B2; Clone/Array public adaptörlerini V4/V5 forest
   komutlarına geçir. Sonra key ID tabanlı toplu düzenleme ve Set Key keyset.
3. **Signal/expression eşliği:** B4/B5; bilinmeyen modifier davranışı, native
   expression Set/Remove/Convert/Review ve ayrı property-expression bake.
4. **Odaklı 2D araçlar:** Bounds/align/distribute/Fit Parent/gaps/pivot, Path
   edit ve conversion, effect/mask CRUD, repeater conversion/bake, layer retime.
5. **Host sınırları:** Asset/guide otomasyonu gerekiyorsa ayrı capability;
   import/export/transport/UI/resource sahipliğini senkron `scene` içine yığma.

Bu bir inceleme ve tamamlama önerisidir; ana geliştirme sırasına kullanıcı
kararı olmadan yeni uygulama paketi eklenmedi. Önceki daha dar
[uyumluluk raporu](script-api-compatibility-audit.md) metot eşliği ve spline
entegrasyonunu anlatır; bu rapor bütün mevcut 2D alanlar için üst kapsamdır.
