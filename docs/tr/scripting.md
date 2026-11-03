# Betikleme

Chorono scriptleri düz JavaScript ile düzenlenebilir katmanlar ve timeline/keyframe verisi üretir. Kod her video karesinde tekrar çalışmaz; oluşan animasyonu ortak oynatıcı değerlendirir.

Claude ve Codex için güvenli çalıştırma yolu MCP `run_script` aracıdır. Bu kod QuickJS içinde süre ve bellek sınırlarıyla çalışır; Node, DOM, ağ, import veya dosya erişimi verilmez. Yerel Script Console, kullanıcının güvendiği kod için eski doğrudan çalıştırma yoludur.

## Gerçek API

Tek doğruluk kaynağı `src/lib/script/api/SceneAPI.ts`, `LayerHandle.ts`, `TimelineHandle.ts` ve `StateMachineHandle.ts` dosyalarıdır. MCP üzerinden `chorono://scripting` kaynağını veya `get_capabilities` aracını okuyun.

```js
scene.composition({width:1080,height:1920,durationMs:5000});
const intro=scene.createTimeline({id:'intro',durationMs:2000});
const card=scene.add('rect');
card.set({name:'Hero card'});
card.pos=[100,400];
card.size=[800,300];
card.fill='#2563eb';
card.cornerRadius=24;
intro.key(card,'opacity',0,0,'easeOut');
intro.key(card,'opacity',700,1);
intro.key(card,'transform.y',0,500,'easeOut');
intro.key(card,'transform.y',1500,400);
const idle=scene.cloneTimeline('intro','idle');
idle.set({loop:true});
scene.useTimeline('idle');
card.key('transform.rotationDeg',0,0).key('transform.rotationDeg',2000,3);
scene.log(card.id,scene.timelines.length);
```

## Katmanlar

`scene.add(kind)` bir handle döndürür. Desteklenen türler `get_capabilities` ile keşfedilir. `scene.get(id)`, `scene.find(name)`, `scene.layers` ve `scene.remove(handle)` mevcut nesneleri yönetir.

Handle alanları: `id`, `name`, `type` okunur; `pos`, `size`, `opacity`, `rotation`, `scale`, `fill`, `text`, `cornerRadius`, `blendMode` değiştirilebilir. Yeniden adlandırma dahil genel değişiklik `handle.set(Partial<Layer>)` ile yapılır. İç içe nesneler değiştirilir; önceki alanları koruyun.

Metotlar: `font`, `stroke`, `shapeParam`, `parent`, `interactive`, `followPath`, `configureParticles`, `key`.

## Timeline ve ileri hareket

`scene.createTimeline`, `scene.timeline`, `scene.useTimeline`, `scene.cloneTimeline`, `scene.deleteTimeline` ve `scene.timelines` çoklu animasyonu yönetir. Layer.key seçili script timeline'ına, seçim yoksa ilk timeline'a yazar. Timeline.key açıkça o timeline'ı hedefler.

Timeline handle: `data`, `set`, `key`, `track`, `removeTrack`, `modifier`, `bake`. Track patch'i outOfRange, easeCurve, timeWarp, multiplierCurve, controller ve modifier listesini kapsar. Easing başlangıç keyframe'ine uygulanır: linear, hold, easeIn, easeOut, easeInOut veya customBezier nesnesi.

## Diğer yetenekler

`scene.clone`, `scene.array`, `scene.addPath`, `scene.addSpline`, `scene.addEmitter`, `scene.addParam`, `scene.addTrigger`, `scene.wire`, `scene.addStateMachine` desteklenir. State machine handle `addState`, `addTransition`, `setInitial` sunar.

Scriptler eşzamanlıdır. `scene.on`, `scene.update`, `scene.addModifier`, `scene.beginUndoGroup` gibi eski belgelerde geçen metotlar bu API'nin parçası değildir. Başarılı bir script zaten tek geri alma adımıdır; hata durumunda sahne uygulanmaz. Oynatma olayları script dinleyicileriyle değil, scene trigger/binding/state machine verisiyle tanımlanır.

Kurulum, önizleme, kayıt, güvenlik ve tüm araçlar için [MCP rehberini](mcp.md) okuyun.
