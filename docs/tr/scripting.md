# Betikleme

Chorono scriptleri JavaScript ile düzenlenebilir katmanlar, timeline'lar ve etkileşimler üretir. Kod üretim sırasında bir kez çalışır; oynatıcı oluşan animasyonu her karede değerlendirir.

Claude ve Codex için MCP `run_script` kullanılır. Kod izole QuickJS içinde eşzamanlı çalışır; Node, DOM, ağ, import ve dosya erişimi yoktur. Dış veriyi ajanın normal araçlarıyla hazırlayıp JSON olarak koda ekleyin; dosyaları MCP ile içe aktarın. Editördeki manuel Script Console eski tarayıcı çalıştırıcısını kullanır; MCP'nin izolasyon ve süre/bellek sınırlarına sahip değildir.

## Keşif ve çalıştırma

Önce `list_sessions`, `get_capabilities`, `chorono://scripting` ve `get_scene` okuyun. Birden fazla editör varsa `sessionId` seçin. Bağlı sürümün nesne türleri, özellik şemaları, particle presetleri ve sınırları capabilities içinde bulunur.

1. Sahneyi ve revision'ı okuyun; ilgisiz çalışmayı koruyun.
2. `run_script({code,dryRun:true,expectedRevision,requestId})` çağırın.
3. Dönen nesne/timeline özetini, logları ve `planId` değerini inceleyin.
4. Aynı çalışan MCP sunucusunda `apply_script_plan({planId,expectedRevision,requestId})` ile planı uygulayın. Kodu tekrar çalıştırmayın; plan üretilmiş kimlikleri korur. Plan beş dakika sonra, sahne değiştiğinde veya sunucu yeniden başladığında geçersizleşir; ayrı kısa ömürlü stdio süreçleri plan paylaşmaz.
5. Gerçek `render_preview` görüntülerini inceleyin; doğrulayıp `save_project` ile kaydedin.

Hata durumunda çalışma sahnesi uygulanmaz. Başarılı uygulama tek geri alma adımıdır. Import, oynatma, çalışma zamanı olayları, önizleme, kayıt ve export ayrı MCP araçlarıdır; script içinde tarayıcı/dosya API'si açmazlar.

## Tam veri okuma ve güvenli düzenleme

`scene.snapshot()` tüm sahnenin bağımsız veri kopyasını döndürür. `scene.assets`, `assetCollections`, `parameters`, `triggers`, `bindings`, `parameterWires`, `stateMachines` ve `initialState` bağımsız veriler sunar. `scene.composition()` ve `scene.timelines` da kopya döndürür.

`scene.get(id)` ve `scene.find(name)` katman handle'ı döndürür; `scene.layers` handle listesidir. `layer.data` katmanın tüm verisini, `layer.get(path)` iç içe bir alanını okur.

```js
const hero = scene.find('Hero card');
if (!hero) throw new Error('Hero card bulunamadı');
scene.log(hero.data, hero.get('style.fill.color'));
hero.patch({style:{stroke:{color:'#ffffff',width:2}}});
scene.log(scene.snapshot().layers.length, scene.assets.length);
```

`layer.patch(partial)` nesneleri özyinelemeli birleştirir, dizileri değiştirir; belirtilmeyen alt alanları korur. `layer.set(partial)` eski davranışını korur: `audio`, `style`, `transform` gibi iç içe bir nesne verildiğinde o nesnenin tamamını değiştirir. Okunan kopyayı değiştirmek sahneyi değiştirmez; düzenleme için handle/entity komutlarını kullanın. Katmanın kimliği patch ile değiştirilemez.

## Kod ile birden fazla animasyon

Mevcut projede boyutları ve kimlikleri uyarlayın. Süreler milisaniye, açılar derecedir.

```js
scene.composition({width:960,height:540,durationMs:4000,frameRate:30,backgroundColor:'#0b1220'});
const intro = scene.createTimeline({id:'intro',durationMs:2000});
const idle = scene.createTimeline({id:'idle',durationMs:Math.PI*1000,loop:true});
const hero = scene.add('rect');
hero.set({name:'Hero card'});
hero.pos = [90,160];
hero.size = [300,180];
hero.fill = '#2563eb';
hero.cornerRadius = 24;
intro.key(hero,'transform.x',0,90,'easeOut').key(hero,'transform.x',1800,480);
intro.key(hero,'style.fill.color',0,'#2563eb').key(hero,'style.fill.color',1800,'#f97316');
idle.track('layers.'+hero.id+'.transform.y',{
  controller:{type:'waveform',waveform:{shape:'sine',amplitude:12,frequency:1/Math.PI,phase:0,offset:160,duty:0.5}}
});
scene.log(hero.id,intro.data,idle.data);
```

Timeline isimleri animasyonları sıraya koymaz. Kesintisiz film için tek master timeline'da mutlak zamanlar; etkileşimli geçişler için açık state machine durumları kullanın. Aynı alanı etkileyen animasyonların birleşimini önizleyin; değerlerin toplandığını varsaymayın.

`scene.useTimeline(id)`, sonraki `Layer.key`, `scene.clone` ve `scene.array` çağrılarının hedefini seçer. Script seçim yapmadıysa ilk timeline kullanılır; editörde seçili sekme script hedefini belirlemez. `Timeline.key` her zaman kendi timeline'ına yazar. Clone/array açık timeline seçimi de kabul eder; güncel imzaları scripting kaynağından okuyun. `scene.cloneTimeline(id,newId)` aynı nesneleri kullanan bağımsız track'ler ve yeni keyframe kimlikleri üretir.

## Görünüm ve animasyon değerleri

`scene.add(kind)` için capabilities içindeki gerçek türleri kullanın. Handle alanları: `pos`, `size`, `opacity`, `rotation`, `scale`, `fill`, `text`, `cornerRadius`, `blendMode`. Yardımcılar: `font`, `stroke`, `shapeParam`, `parent`, `interactive`, `followPath`, `configureParticles`, `key`.

Kare değerlendirmesi animasyon değerlerini çizimden önce katman verisine uygular. Shape parametreleri, tipografi, efektler, maskeler, repeater ve particle ayarları bu akışa dahildir. Değerler gerçek özellik şemasına uymalıdır; rastgele alan ismi yazmak yeni bir çizim özelliği oluşturmaz.

Aynı zamandaki key güncellemesi mevcut ID, tangent, segment ayarları ve belirtilmeyen easing’i korur; easing değiştirmek için açıkça verin. Yeni key varsayılanı linear’dır. Eşitlik `1e-6 ms`; yakın fractional key’ler ayrı kalır, belirsiz çakışık key’ler reddedilir. Ara değeri örnekleyerek key eklemek bütün nonlinear segmenti aynen koruma sözü vermez. Driven controller/binding için explicit bake/düzenleme akışını kullanın.

Sayılar easing ile; renk alanları kanallar üzerinden; Vec2 değerleri bileşenleri üzerinden interpolate edilir. Diğer metin ve boolean değerleri keyframe sınırında değişir. Controller/modifier'lar sayısaldır. Mevcut path/spline noktaları ve handle'ları aynı topoloji korunarak sayısal koordinat yollarıyla hareket ettirilebilir; bütün geometri nesnesini veya topolojiyi keyframe ile değiştiren genel morph sistemi yoktur.

Easing başlangıç keyframe'ine aittir: `linear`, `hold`, `easeIn`, `easeOut`, `easeInOut` veya `{type:'customBezier',bezier:{cx1:0.2,cy1:0,cx2:0.3,cy2:1}}`.

`Timeline.data` tam timeline'ı okur. `set`, `key`, `track`, `removeTrack`, `modifier`, `bake` düzenleme yapar. `key` için `transform.x` gibi katman içi yol; track metotları için `layers.<id>.transform.x` gibi tam hedef verilir. Track patch'i outOfRange, controller, timeWarp, multiplierCurve ve modifier listelerini kapsar. Sayısal track'leri örneklenmiş keyframe'e dönüştürmek için bake kullanın.

## Path, particle ve etkileşim

`scene.addPath(points,{role:'motion',name:...})` veya `scene.addSpline(kind,params,options)` ile yol oluşturun. `layer.followPath(path.id,{orientToPath:true})` bağlayıp `followPath.progress` değerini 0'dan 1'e animate edin. Spline trim/style ve particle/repeater verisinde capabilities şemalarını kullanın.

`scene.addEmitter(preset,options)` ve `configureParticles` yerel particle animasyonu üretir. Gerçek preset seçip anlamlı kareleri inceleyin. Animasyonlu emitter ayarları istenen kare için deterministik değerlendirilir; script particle callback'i kaydetmez.

## Particle, spline ve Scene Explorer erişimi

| Arayüz | Kod ile yapılan işlemler |
| --- | --- |
| `scene.particlePresets`, `layer.particles` | Bağımsız config/preset okuma; doğrulanan derin ayar birleştirme; emission, visual, animation, random ve rendering bölümleri; sayı/metin ile deterministik seed; scale/opacity/color yaşam key'leri; yerel hareket modifier'larını ekleme/düzenleme/silme |
| `layer.spline` | Tam geometri ve yerel bounds okuma; primitive/contour ekleme; nokta/handle düzenleme ve kilitleme; line/cubic/quadratic segment düzenleme/bölme; contour kapatma/ters çevirme; sub-shape silme/adlandırma; affine geometri dönüşümü |
| `scene.explorer` | Ağaç/nesne/ilişki okuma; alanlı arama; gruplama, gruptan çıkarma ve parent değiştirme; kardeşlerin çizim sırası; adlandırma ve toplu görünürlük/kilit/solo/pin bayrakları |

Yapısal düzenlemelerde domain komutlarını ve dönen kimlikleri kullanın. Spline koordinatları katmana yereldir; transform, parent ve pivot korunur. Silinen spline elemanlarının animasyon track'leri de aynı geri alınabilir işlemde temizlenir. Instance verisi okunabilir; düzenlemek için kaynak katmanı açıkça açın. Nokta/handle kilitleri ile etkilenen hiyerarşinin kilit/frozen durumu korunur.

Particle yaşam key'leri 0..1 aralığındadır; easing **hedef stop'a** aittir. `life('color',stops)` desteklenen CSS renklerini veya 0..255 RGBA verisini kabul eder. Yerel hareket türleri `noiseDrift`, `sineWave`, `spiral` şeklindedir; silme sonrası modifier indekslerini yeniden okuyun. Path/source-layer emitter mevcut geometriyi `area.pathLayerId` / `area.sourceLayerId` ile kullanır. Circle/rectangle `emitFromEdge` ve modifier phase yerel motor tarafından değerlendirilir. Flow graph ve ek `burstMarkers` henüz uygulanmadığından particle API bunları reddeder.

Explorer varsayılan olarak sahnenin kayıtlı sırasını ve script'in seçtiği (veya ilk) timeline'ı zaman 0'da okur. `node(id,{timelineId,timeMs})` tam katman verisi içerir; `nodes`, `tree`, `query` metadata döndürür. `query({search:'type:spline',includeAncestors:true})` panelle aynı arama dilini kullanır. Children/ancestors/descendants sonuçları kimlik listeleridir. Panel seçimi, collapse, sütunlar ve geçici sıralama/filtre durumu ayrıdır. Reparent/ungroup varsayılan `keepWorld:true` ile dünya konumunu korur; animasyonlu/bağlı transform, shear, tekil dönüşüm veya kayıplı grup birleşimi varsa önce bake ya da açık yerel koordinat taşıması gerekir.

Metot imzaları, dönen kimlikler ve çalışan kod düzeni için [domain API referansı ve path-emitter örneğine](../../skills/chorono/references/domains.md) bakın.

## Etkileşim tanımları

`scene.addParam`, `scene.addTrigger`, `scene.wire`, `scene.addBinding`, `scene.addStateMachine` etkileşim tanımlar. Mevcut verileri düzenlemeden önce okuyun. `scene.stateMachine(id)` mevcut makineyi açar. Machine handle bağımsız `data`, metadata/durum/geçiş düzenleme ve `setInitial` sunar. Scene entity komutları parametre, trigger, wire ve binding kayıtlarını düzenler/siler. Kesin imzalar için `chorono://scripting` okuyun.

Olayları ve çalışma zamanı parametrelerini `control_runtime` ile uygulayıp `get_runtime` ve canlı önizlemeyle doğrulayın. Authoring script'inde `scene.on`, `scene.update`, async olay dinleyicisi, makro kaydı veya her kare callback'i bulunmaz.

## Ses ve dosyalar

`scene.audioClip(assetId,{timelineId,startMs,name})` içe aktarılmış ses asset'ini kullanır. Dönen handle `audioGain`, `audioFades`, `moveAudio`, `trimAudio`, `splitAudio` sunar; bunlar editörün yerel tahribatsız ses komutlarıyla aynıdır. `splitAudio` sağ klibi döndürür. Animasyonlu gain değiştirirken key zamanı belirtin. Ham katman zamanlarını değiştirmek ses kırpma davranışını uygulamaz.

Yeni dosyaları MCP `import_asset` ile alın. `render_preview` PNG; ses önizleme/export WAV üretir. Doğrulama sonrasında `save_project` ile taşınabilir proje kaydedip gerçek yolu ve uyarıları raporlayın. Three.js/modelleme API'si bu script yüzeyinin dışındadır.

## Sınırlar

Güncel MCP sınırları: script başına 128 KiB kod, 2 saniye, 32 MiB QuickJS belleği ve 20.000 komut; sahne toplamında 5.000 katman, 100 timeline ve 50.000 keyframe. Bağlı sürümün kesin sınırlarını capabilities'ten okuyun. Bunlar işlem kotalarıdır, oynatma FPS garantisi değildir.

Kurulum ve tüm araçlar için [MCP rehberine](mcp.md), ajan akışı için [authoring skill'ine](../../skills/chorono/SKILL.md) bakın.


## Prosedürel eğri, expression ve bake

Yukarıdaki waveform `160 + 12*sin(2*tSec)` üretir; frekans Hz, phase radyandır. Katmana ait `Timeline.track` üyeliği de tamamlar. Sıfır key'li numeric controller Curve Editor'da hesaplanmış aralık ve sınırlı sayıda graph örneğiyle görünür; bunlar source key değildir. Track'in **Bake…** düğmesi kaynak/bake eğrisini ve sample/midpoint hatalarını önizletir; Apply tek undo olur.

`timeline.bake(target,60,0.005,{startMs:0,endMs:1000})` ve native `bake_track` optional `startMs`/`endMs` timeline-local ms kullanır; bounds atlanırsa tam timeline seçilir. FPS pozitif ve en fazla 240, örnek sayısı en fazla 20.000, tolerance 0..1 örneklerde normalize dikey sadeleştirme hatasıdır. Pencere dışı eski key'ler ve ilgisiz metadata korunur; controller/OOR/modifier/time remapping global olarak kaldırılır. Dışarıda kalan key'ler/constant uçlar çalışır. Örnekleme hatası FPS'e bağlıdır; tolerance sürekli matematiksel eşlik garantisi değildir. Geçersiz/non-finite/stale kaynak reddedilir; Cancel source değiştirmez.

Wire önizlemesi ve runtime aynı güvenli parser/evaluator'ı kullanır. `source`/`s` o anki pre-wire evaluated input'tur; örtük zaman/çarpma yoktur. `2+3`, scientific notation ve açık çarpma çalışır; `^` sağdan birleşir ve unary işaretten önceliklidir (`-2^2=-4`, `(-2)^2=4`). Yanlış argüman sayısı, bilinmeyen isim, non-finite/domain hatası ve çevrim açıklanır; hedefin pre-wire değeri korunur. Wires aynı input frame'i okur; iterative feedback yapmaz. Katman kaynakları numeric scalar, scene parametreleri legacy boolean/numeric-string dönüşümü kullanır. Sınırlar 4096 karakter, 1024 token/node ve 64 nesting seviyesidir. Serbest zaman expression controller'ı ayrı özelliktir.
