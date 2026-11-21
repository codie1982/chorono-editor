# Chorono Game Engine Mode — ana geliştirme yol haritası

Tarih: 19 Kasım 2026. Durum: ana plan; uygulama veya çalışan oyun modu teslimi
değildir. Dört mode ve planlar arası sıra için
[dört ana mod planı](product-mode-master-plan.md); teknik 2D ve 3D
altyapıları için sırasıyla [2D uygulama planı](production-2d-roadmap.md) ve
[3D uygulama planı](production-3d-roadmap.md) esas alınır.

Bu belge eski `plan/GAME_ENGINE_ROADMAP.md` içindeki yararlı fikirleri güncel
repository kanıtıyla yeniden değerlendirir. Eski belgedeki bağımlılık durumu,
önerilen sınıf adları ve “kilitli” teknoloji kararları güncel gerçek veya
uygulama talimatı sayılmaz.

Game, `ChoronoProject` içindeki dört eş düzey ana moddan biridir ve ürün
navigasyonunda öne çıkarılır. [2D Mode](2d-graphics-roadmap.md)
görsel/sprite/UI kaynağını, [3D Mode](3d-modeling-roadmap.md)
mesh/material/rig-ready kaynağını, [Render Mode](render-mode-roadmap.md)
clip/controller/cutscene kaynağını üretir. Game bu asset'leri scene, prefab,
behavior, canlı runtime ve platform build ile birleştirir; proje kökü olmaz ve
diğer üç modun kaynak araçlarını kopyalamaz.

## 1. Ürün tanımı ve ilk sınır

Game Engine Mode, Chorono içindeki **2D, 3D, Game ve Render** adlı dört eş düzey
ana moddan biridir. Etkileşimli 2D ve 3D oyun üretmek, gerçek zamanda önizlemek
ve Web/desktop/mobile hedeflerine paketlemek için kullanılır. `Game 2D` ve
`Game 3D`, uygulama düzeyinde yeni ana modlar veya iki ayrı motor değil; Game ana
modunun boyuta özel dünya profilleridir. İlk ürün hedefi AAA/genel amaçlı motor
değil; mevcut
2D animasyon, state machine, asset, 3D model/malzeme ve script kabiliyetlerini
tek bir güvenilir oyun üretim akışında birleştiren küçük-orta ölçekli motor ve
editördür.

İlk sürümün hedef örneği:

- iki level ve yükleme geçişi,
- klavye/gamepad/touch ile hareket eden bir karakter,
- sabit-adım fizik, collider/trigger ve kamera,
- sprite veya 3D karakter ile Animator Controller,
- prefab/instance, HUD, ses, save/load,
- bir Visual Code script'i ve eşdeğer Code Node graph'ı,
- Web ile en az bir desktop ve bir mobile debug paketi.

İlk sürüm; açık dünya MMO, tam ağ replikasyonu, ileri hacimsel fizik, genel
render pipeline editörü, konsol platformları, marketplace veya kaynak koddan
native C++ oyun derleyicisi vaat etmez. Bunlar gerçek tüketici ve ayrı karar
gerektirir.

## 2. Repository'de doğrulanan başlangıç

19 Kasım 2026 itibarıyla:

- `EditorMode` içinde `game-engine` discriminant'ı, `ModeDescriptor`,
  `ModeRegistry`, `IScene`, `ISceneObject`, `IRenderer` ve `IExporter` temel
  sözleşmeleri vardır.
- Bootstrap yalnız `Animation2DDescriptor` kaydeder; çalışan Game Engine
  descriptor, scene, viewport veya runtime yoktur.
- State machine, parameter/wiring, timeline, asset, audio ve runtime export
  parçaları yeniden kullanım adaylarıdır; oyun ürün sözleşmeleri değildir.
- `matter-js@0.20.0`, 2D deterministic bake backend'i olarak kullanılır.
  Runtime canlı oyun dünyası, collision event köprüsü ve Play Mode fiziği
  uygulanmış sayılmaz.
- QuickJS, MCP authoring script'lerini izole ve sınırlı çalıştırır. Runtime
  component script lifecycle'ı ve debugger yoktur.
- Three.js, Capacitor, Tauri, Electron, Monaco veya bir node-graph framework'ü
  paket bağımlılığı olarak mevcut değildir. Seçim teknik spike ve bundle/cihaz
  ölçümü olmadan kilitlenmez.
- Kutulu 3D/model üretim planı ayrı `3D4` programındadır. Oyun modu aynı asset
  çıktılarını tüketebilir; modelleme komutlarını kendi içinde kopyalamaz.

Bu başlangıç nedeniyle ilk iş yeni paneller eklemek değil, kaynak proje ile
runtime artifact arasındaki sözleşmeyi ve Edit/Simulate/Play sahipliğini
kanıtlamaktır.

## 3. Mimari sınırlar ve veri modeli

### 3.1. Kaynak proje, scene ve runtime artifact

```text
ChoronoProject (shared project root)
  ├─ AssetGraph / shared source assets
  └─ GameDocument
      ├─ GameScene[]
      │   └─ Entity[] → Component[]
      ├─ Prefab[] / Variant[]
      ├─ ScriptModule[] / GraphAsset[]
      ├─ InputMap / BuildProfile[]
      └─ GameSettings
          │ validate + compile
          ▼
RuntimeArtifact
  ├─ versioned scene/prefab tables
  ├─ compiled scripts/graphs/shaders
  ├─ packed assets and dependency manifest
  └─ capability, platform and integrity metadata
```

Authoring scene; seçili nesne, panel yerleşimi, gizmo, undo geçmişi, kaynak
dosya yolu ve derleyici tanısı gibi editör verisi taşıyabilir. Runtime artifact
yalnız oyunun ihtiyaç duyduğu sürümlü veriyi taşır. DOM, WebGL/Three/Matter
handle'ları, açık file handle'ları ve yoğun geçici buffer'lar ikisine de
serialize edilmez.

### 3.2. Game 2D ve Game 3D dünya profilleri

Her `GameScene`, kaynak şemasında zorunlu bir `worldProfile` taşır:

- `game2d`: XY/affine uzay, `Transform2D`, `Camera2D`, 2D render/culling,
  `Physics2DWorld` ve 2D spatial query,
- `game3d`: XYZ/TRS/quaternion uzay, `Transform3D`, `Camera3D`, 3D
  render/culling/light, `Physics3DWorld` ve 3D spatial query.

Profil, platform build hedefi değildir; aynı proje ve aynı runtime artifact
birden çok 2D/3D scene taşıyabilir. Scene geçişi runtime'ın ilgili adapter
set'ini acquire/release etmesiyle yapılır. Ortak `GameRuntime` şu akışı ve
sözleşmeleri paylaşır:

```text
input → script/graph → animation → dimension runtime → audio → presentation
                                  ├─ Game2D adapters
                                  └─ Game3D adapters
```

Paylaşılan çekirdek clock/fixed-step, entity lifecycle, event bus, input,
script ABI, node IR, animator, audio, save ve scene loading'dir. Boyuta özel
küçük sözleşmeler transform, renderer, physics, camera, visibility ve spatial
query'dir. 2D ve 3D backend'lerin aynı kütüphane veya GPU API'sini kullanması
zorunlu değildir; Liskov sözleşmesini karşılayamadıkları capability'yi açıkça
reddederler.

3D world üzerine 2D HUD/overlay standart composition'dır. 2D world içinde 3D
prop ancak camera + render-surface/projection adapter'ıyla yer alır. Bir world
root aynı anda hem 2D hem 3D fizik uzayı sayılmaz; cross-dimension raycast,
collision veya parent transform örtük cast ile yapılmaz.

“2.5D” üçüncü bir world profile değildir. Game 2D veya Game 3D üzerine kurulan
camera, layer, billboard ya da render-surface composition preset'idir; hangi
fizik/transform uzayının authoritative olduğu yine açıktır.

### 3.3. Entity/component ve sistem sınırı

İlk model sade composition kullanır; büyük ölçekli data-oriented ECS peşinen
zorunlu değildir. Bir entity stable ID, ad/tag, parent/child ve transform ile
component referansları taşır. İlk component aileleri:

- Transform 2D/3D, renderable sprite/mesh, camera ve light,
- collider, rigid body ve trigger,
- animator, audio source/listener,
- script/graph behavior,
- UI document/widget binding,
- navigation agent/obstacle,
- save identity ve replication-ready identity (networking uygulanmadan).

2D affine ve 3D TRS/quaternion birbirine cast edilmez. Ortak entity,
dimension'a özel transform component'ini açıkça seçer. System sözleşmeleri
input → gameplay/script → animation → physics → transform result → audio →
render gibi kararlı bir sıra ve olay teslim politikası tanımlar.

### 3.4. Prefab, variant ve instance

Prefab; entity alt ağacı, component değerleri ve asset referanslarını sürümlü
bir kaynak olarak taşır. Instance yalnız override farklarını tutar. Nested
prefab, variant, cycle reddi, source update, orphan override, unpack ve
reconnect davranışları ilk veri modeliyle tanımlanır. Scene copy/paste ile
prefab instance aynı işlem değildir.

### 3.5. Ortak command yüzeyi

Scene Editor, Properties, Visual Code, Code Node, MCP ve agent eylemleri aynı
domain command/validator'larına gider. UI veya script doğrudan React state,
renderer handle ya da fizik dünyası mutate etmez.

```text
UI / Visual Code / Code Node / MCP
             │
      typed command API
             │
 validate → transaction → event/change-set → undo/redo
             │
 authoring model → runtime incremental compile/hot reload
```

Runtime davranış API'si authoring command API'sinden ayrıdır. Oyunda
`spawn`, `destroy`, input, physics query, event, audio ve scene geçişi gibi
izinli işlemler vardır; editor dosya/undo işlemleri yoktur.

## 4. Realtime viewport ve çalışma durumları

### 4.1. Edit, Simulate ve Play

| Durum | Kaynak sahipliği | Runtime | Çıkış davranışı |
| --- | --- | --- | --- |
| Edit | Authoring scene doğrudan düzenlenir | Renderer yalnız deterministic preview üretir | Değişiklikler normal command/undo ile kalır |
| Simulate | Geçici runtime snapshot/clone | Input isteğe bağlı; fizik, animasyon ve script çalışır | Varsayılan olarak kaynak scene değişmez; seçili değerler açık “Apply” ile command olur |
| Play | Derlenmiş runtime artifact veya onun debug varyantı | Gerçek game loop, input ve scene lifecycle | Stop kaynak projeyi tam eski authoring durumuna döndürür |
| Remote Play | Cihazdaki debug runtime | Editör bağlantısı log/profiler/hot reload taşır | Cihaz state'i kaynağa otomatik yazılmaz |

Pause, single-step, fixed-step sayacı, time scale, frame advance, input capture,
runtime entity seçimi ve Edit/Play kamera ayrımı görünür UI durumlarıdır. Play
Mode'da source scene'e kaçak mutation kabul edilmez.

### 4.2. Viewport UI

- scene `worldProfile` seçimi/göstergesi; `Game 2D` ve `Game 3D` template'i,
- 2D, perspective, orthographic ve kamera görünümü; tek/dörtlü layout,
- translate/rotate/scale, local/world, pivot/snap ve ölçü birimi,
- entity/prefab seçimi, hierarchy breadcrumb ve isolation,
- collider, trigger, nav, light, audio zone, bounds ve overdraw debug overlay,
- device safe-area, aspect/resolution ve touch emulation,
- render scale/quality profili ve CPU/GPU/frame-time göstergesi,
- gizmo ve debug çizimlerinin final build'e girmediği açık ayrım,
- viewport input odağı ile editör kısayollarının çakışmasını önleyen capture.

Viewport ortak transport, selection, debug ve profiler kabuğunu kullanır;
Game 2D ile Game 3D için boyuta özel renderer adapter'ını seçer. Ürün seçimine
göre Canvas/WebGL/WebGPU kullanılabilir; tek bir backend'in iki profili de
sağladığı varsayılmaz. Context/device loss, asset hazırlığı ve shader compile
tanıları kullanıcıya görünür olur.

### 4.3. 2D Animation'dan realtime Game Preview'a geçiş

2D/Render Animation workspace'indeki `Game Preview` viewport rolü şu akışı
uygular:

1. Seçili 2D document/component ve clip revision'ını okur.
2. Var olan `game2d` GameScene binding'ini seçer veya açık kullanıcı komutuyla
   bir GameScene/prefab instance oluşturur.
3. Kaynak 2D asset'i kopyalamadan referanslar; Animator/Script/Input gibi Game
   component'lerini binding/override olarak ekler.
4. Runtime artifact'ın debug varyantını incremental compile eder ve viewport'ta
   Edit/Simulate/Play durumlarından biriyle çalıştırır.
5. Stop sırasında runtime state'i atar; yalnız açık `Apply as Authoring Command`
   işlemleri kaynak modele geri döner.

Viewport rolünü değiştirmek mode, document ownership veya serializer tipini
değiştirmez. `Open in Game Mode`, aynı GameScene binding'ini Scene/Hierarchy,
Inspector, Visual Code/Node ve Debug panelleriyle açan UI mode değişimidir.

### 4.4. 3D scene'i aynı görünüm alanına ekleme

Bir `game2d` scene içinde realtime 3D görünüm gerektiğinde `SceneSurface3D`
component'i başka bir `game3d` scene/camera çıktısını texture/surface olarak
kompozite eder. Bir `game3d` scene içindeki 2D içerik `Overlay2D`, HUD veya
world-space UI adapter'ıyla bağlanır.

Gerçek eşzamanlı düzenleme için aynı panel alanında iki viewport instance'ı
`Split View` kullanır. Her instance kendi world, renderer, physics, camera,
selection, gizmo, debug ve input-focus context'ine sahiptir. `Composite Preview`
bu çıktıları tek frame'de gösterebilir fakat cross-world collision/raycast veya
parent transform üretmez. World'ler arası veri geçişi gerekiyorsa typed event,
shared gameplay state veya ileride tanımlanacak açık interaction bridge
üzerinden yapılır.

## 5. Visual Code, Code Node ve scripting

### 5.1. Dört farklı programlama yüzeyi

| Yüzey | Amaç | Çalışma zamanı | Güvenlik/çıktı |
| --- | --- | --- | --- |
| Authoring Script | Toplu scene/asset üretme ve düzenleme | İzole QuickJS plan/commit | Typed authoring API, bütçe, atomic undo |
| Visual Code Editor | Runtime davranış modüllerini metinle yazma | Oyun sandbox/runtime | Source map, diagnostics, lifecycle API, build artifact |
| Code Node Editor | Aynı runtime davranışını görsel graph ile kurma | Graph → typed IR → runtime module | Port/type doğrulama, cycle politikası, debug trace |
| Material/Shader Graph | Render materyali ve shader varyantı | Graph → shader IR/backend code | Backend capability, compile cache ve fallback tanısı |

“Visual Code” çalışma alanı VS Code benzeri deneyimi ifade eder; editor
bileşeni seçimi değildir. Monaco, CodeMirror veya başka aday; bundle boyutu,
mobile kullanılabilirlik, worker/CSP, TypeScript diagnostics, diff, search ve
source-map debugger spike'ıyla seçilir.

### 5.2. Visual Code Editor gereksinimleri

- project tree, sekme, split, search/replace ve symbol navigation,
- format, lint, type diagnostics ve hızlı düzeltme,
- runtime API autocomplete ve versioned type definitions,
- breakpoint, pause, step, call stack, watch, log ve entity context,
- source map ile runtime hatasından gerçek dosya/satıra dönüş,
- rename/delete sırasında asset/script referans güvenliği,
- file watcher/hot reload; syntax/type hatasında son başarılı modülün korunması,
- izin/capability manifest'i; ağ, dosya, native API ve dynamic code varsayılan
  olarak kapalı,
- sonsuz döngü, süre/bellek/event fırtınası bütçesi ve iptal.

İlk runtime dili TypeScript/JavaScript olabilir; public lifecycle sözleşmesi
backend'den bağımsız tutulur. `onCreate`, `onStart`, fixed update, update,
event/collision ve dispose sırası; hangi callback'in mutate edebildiği ve
determinism sınırı belgelenir. Authoring QuickJS ile runtime script aynı
global yüzeyi kullanmaz.

Visual Code tek editördür ve iki profilde aynı temel lifecycle/type paketini
kullanır. Dimension-specific API'ler capability modülleridir: örneğin
`game2d.physics.raycast(Vec2, ...)` yalnız `game2d`; `game3d.physics.raycast`
ise `Vec3` ve yalnız `game3d` bağlamında geçerlidir. Ortak gameplay modülü
boyuta özel capability istemiyorsa iki profilde de çalışabilir. Derleyici,
yanlış profile ait import/node kullanımını build'den önce açık tanıyla
reddeder; Vec2/Vec3 arasında örtük dönüşüm yapmaz.

### 5.3. Code Node Editor gereksinimleri

- versioned node definition, typed input/output port, default ve validation,
- event, flow, value, async/job ve state node'larının görsel olarak ayrılması,
- graph subroutine/function, local variable, comment/group ve reusable macro,
- cycle ve recursion politikası; deterministic execution order,
- compile öncesi type/capability kontrolü ve source location eşlemesi,
- canlı port değerleri, breakpoint, step, execution trace ve profiler,
- copy/paste, diff/merge için stable node/edge ID,
- eksik plugin/node durumunda veriyi koruyan placeholder ve migration,
- graph'ın doğrudan renderer/React state'e değil aynı runtime API/IR'ına
  derlenmesi.

Node kataloğunda ortak node'lar ile `Game 2D`/`Game 3D` capability node'ları
görsel olarak ayrılır. Graph asset'i desteklediği `worldProfile` listesini
taşır; profile uyumsuz node placeholder'a sessizce çevrilmez.

Metin ve node script'leri bire bir kaynak dönüşümü vaat etmez. İkisi aynı
runtime API ve davranış testlerine sahip olabilir; graph → generated code
tek yönlü inceleme çıktısı olarak sunulabilir. Round-trip ancak kayıpsızlığı
kanıtlanan alt kümede açılır.

### 5.4. Her editörün script bağlantısı

Scene, Character, Material, Animation, Video/Cutscene, UI, Audio ve VFX
editörleri için üç seviye aranır:

1. typed read/query API,
2. doğrulanmış undoable authoring command API,
3. gerekiyorsa runtime component/event API.

Bir paneldeki her düşük seviye sürükleme ayrı public script metodu olmaz.
Domain anlamı olan işlemler (`createPrefab`, `assignMaterial`, `bindClip`,
`compileGraph`, `buildTarget`) contract olur; UI ve MCP bunları paylaşır.

## 6. Üretim editörleri ve araç alanları

### 6.1. Project, Scene ve Level Editor

- proje oluştur/aç, template, settings ve build profile,
- multi-scene, startup scene, additive load ve transition,
- hierarchy, collections/layers/tags, visibility/lock ve search,
- prefab/variant browser, placement, instance override ve dependency view,
- tilemap/grid/terrain ihtiyacına göre 2D level araçları,
- trigger, spawn, checkpoint, camera/audio/nav zone,
- world partition/chunk/streaming sonraki genişleme,
- scene validation, missing reference, circular dependency ve budget raporu.

### 6.2. Character Prefab ve Gameplay Setup

Game Mode kaynak karakter üretmez; 2D/3D görünüm ve Render clip/controller
asset'lerini prefab üzerinde birleştirir:

- visual/skeleton/clip referansları ve revision durumu,
- Animator component ve parameter override,
- equipment/socket binding, collision capsule, hitbox/hurtbox,
- gameplay tags, controller/script ve save identity,
- LOD/quality/runtime material profile,
- prefab publish ve dependency manifest,
- `Edit Source in 2D`, `Edit Source in 3D`, `Edit Motion in Render`.

### 6.3. Material Runtime Profile

- source material referansı, instance ve gameplay override ayrımı,
- platform quality/keyword/variant seçimi,
- runtime parameter binding ve live viewport bağlantısı,
- shader variant/permutation bütçesi, compile cache ve platform preflight,
- transparency/depth/shadow/render queue policy,
- unsupported node/backend için açık diagnostic/fallback,
- texture compression/import profili ve memory tahmini.

Material graph ve texture kaynağı 2D/3D Mode'da kalır; Game yalnız runtime
profile, binding, platform variant ve budget adapter'ını düzenler.

### 6.4. Animation binding, Gameplay State ve Cutscene instance

- Render Mode'dan AnimationClip/AnimationController ve event marker referansı,
- Game'e ait GameplayStateMachine ve input/authority davranışı,
- Render Mode'dan cutscene/shot/sequence instance'ı,
- cutscene'den gameplay'e state/input/camera devri,
- `Edit Motion/Cutscene in Render` ve runtime/offline capability farkı.

Video, proxy, trim, compositing ve offline encoder Render Mode'a aittir. Game
Mode yalnız runtime cutscene instance'ı ve gameplay handoff'unu yönetir.

### 6.5. UI, Audio, VFX ve Debug

- responsive HUD/menu, safe area, navigation/focus, localization ve
  accessibility metadata,
- audio mixer/bus, music/SFX, spatial source/listener, zone, ducking ve
  platform autoplay/focus davranışı,
- particle/VFX graph, pooling, seed ve platform quality tiers,
- console, structured logs, scene/entity inspector, input monitor, physics
  debug, render profiler, memory/resource monitor ve build diagnostic.

## 7. Runtime alt sistemleri

| Sistem | İlk teslim | Sonraki genişleme |
| --- | --- | --- |
| Clock/loop | Sabit simulation step, ayrı render interpolation, pause/step/time scale, spiral guard | Replay, rollback araştırması |
| Input | Keyboard/mouse, gamepad, touch; action map/context/rebind | Haptics, device-specific glyph |
| Physics | 2D canlı adapter, collider/trigger/query/event, layer/mask | 3D adapter ayrı backend spike'ı; ortak lifecycle, ayrı shape/query sözleşmesi; joints/CCD kapsamı ölçülür |
| Animation | Clip, controller, transition, event, instance isolation | Blend tree, retarget/root motion |
| Rendering | Ortak realtime loop üzerinde Game 2D sprite/vector/UI ve Game 3D mesh/material/light adapter'ları; camera, batching/culling | Platform backend, ileri post/VFX ve profile-specific quality tiers |
| Scene | Load/unload, additive scene, spawn/destroy, prefab | Chunk streaming/world partition |
| Gameplay | Typed event bus, parameter/binding, tags, timer | Ability/quest/dialogue packages |
| Navigation/AI | Nav grid ve state/script tabanlı davranış | Navmesh, behavior tree ancak gerçek ihtiyaçla |
| Persistence | Versioned save schema, slot, checkpoint, migration | Cloud sync adapter |
| UI | HUD/menu/input focus, data binding | Editor/runtime UI authoring genişlemesi |
| Audio | Mixer, event playback, pause/focus lifecycle | Spatial zones ve platform codec profilleri |
| Networking | İlk sürümde yalnız stable identity ve serializable state sınırı | Transport, replication, authority ayrı ürün kararı |

Canlı fizik 2D bake'inden farklı lifecycle'a sahiptir; backend paylaşılacaksa
scene compiler/snapshot ve solver adapter sözleşmesi korunur. Matter handle'ı
domain component'e veya save dosyasına sızmaz. 3D fizik, 2D Matter gövdesine z
eklenerek yapılmaz.

## 8. Build, paketleme ve hedef platformlar

### 8.1. Derleme katmanları

1. Kaynak projeyi validate et ve runtime artifact'a compile et.
2. Script/graph/shader'ları hedef capability profiline göre derle.
3. Asset import/compress/dedupe/pack işlemini reproducible manifest ile yap.
4. Web runtime bundle ve boot HTML/asset paketini üret.
5. Hedef shell'e kopyala; native config/ikon/izinleri uygula.
6. Platform SDK ile debug/release build üret.
7. İmzala/notarize et; cihaz smoke/performance testini çalıştır.
8. Artifact hash, source revision, toolchain ve third-party notice ile yayınla.

### 8.2. Hedef matrisi

| Hedef | İlk artifact | Host/toolchain gerçeği | Plan kararı |
| --- | --- | --- | --- |
| Web/PWA | Static HTML/JS/WASM/assets | Browser matrix, CSP, offline cache ve storage kotası | Her platform shell'inin kanonik runtime girdisi |
| Windows | Installer + portable debug build | Windows imzalama, WebView/runtime seçimi ve GPU matrisi | Tauri ile Electron spike'ı; boyut, startup, native plugin ve debugger ölçülür |
| macOS | `.app` + DMG veya store artifact | Code signing ve notarization gerekir | Desktop spike sonucuyla aynı shell ailesi tercih edilir |
| Android | AAB; debug için APK | Android SDK/Gradle, signing, WebView/GPU ve lifecycle | Capacitor ile Tauri mobile spike'ı; cihaz matrisiyle seçilir |
| iOS/iPadOS | Archive/IPA/TestFlight | macOS + Xcode, provisioning/signing ve WKWebView/device testi | Android ile aynı runtime artifact; shell seçimi spike sonrası |

Capacitor resmi olarak Web, Android ve iOS'u hedefler; desktop çözümü değildir.
Electron Windows/macOS/Linux desktop'a odaklanır. Tauri 2 desktop ve mobile
build/distribution yolları sunar. Bu nedenle “tek paketleyici bütün hedefleri
çözer” varsayımı kilitlenmez. İki olası başlangıç:

- **düşük entegrasyon riski:** Electron desktop + Capacitor mobile,
- **tek shell ailesi adayı:** Tauri 2 desktop + mobile.

Karar; boş shell değil gerçek oyun fixture'ıyla bundle boyutu, cold start,
frame pacing, input/audio, file/save, debugger/hot reload, native plugin,
CI/cache, signing ve bakım maliyeti ölçülerek verilir. iOS build ve dağıtımı
macOS/Xcode koşulunu; platformların çoğu release signing gereksinimini planın
parçası olarak taşır.

### 8.3. Build Profile ve Build Center UI

- target, debug/release, orientation, resolution/quality tier,
- app ID, version/build number, icon/splash ve izin manifest'i,
- asset/script stripping, compression ve source map politikası,
- keystore/certificate referansı; secret hiçbir zaman proje JSON'una yazılmaz,
- local/remote builder capability ve toolchain preflight,
- job progress/cancel/log, artifact listesi ve “open/reveal”,
- imzasız debug ile signed release arasındaki görünür ayrım,
- reproducibility metadata, SBOM/third-party notice ve license çıktısı.

## 9. Unutulmaması gereken ürün alanları

İlk listelerde sık atlanan fakat motoru üretimde belirleyen konular:

- schema migration ve eski proje/save uyumluluğu,
- plugin/package API, sürüm/capability ve güven sınırı,
- asset dependency, reimport, hot reload ve missing source davranışı,
- localization, accessibility, safe area ve input remapping,
- deterministic test/replay, crash recovery ve autosave,
- profiler, memory/GPU bütçesi, device quality tiers ve thermal/background
  lifecycle,
- security: untrusted script/asset, path traversal, CSP, native bridge izinleri,
- source control: text-friendly manifest, stable ID, graph/prefab diff ve merge,
- licensing/SBOM, third-party notice, codec/font/model lisansları,
- CI, signed build secrets, store metadata ve release channel/update/rollback,
- tutorial/template/sample project ve offline documentation,
- telemetry/crash reporting yalnız açık kullanıcı onayı ve veri minimizasyonu,
- testing: unit, contract, migration, golden frame, device, package install,
  suspend/resume, offline ve corrupted-save senaryoları.

Multiplayer/networking, marketplace, collaborative live editing, consoles,
cloud build ve modding önemli adaylardır; ilk oyun üretim eşiğini bloke etmez.
Her biri authority, güvenlik, maliyet ve destek modeliyle ayrı ürün kararı alır.

## 10. Uygulama sırası ve kabul kapıları

| Aşama | Teslim | Kabul kanıtı |
| --- | --- | --- |
| GE0 — karar ve teknik spike | `ChoronoProject` içindeki GameDocument/RuntimeArtifact ADR'ı; renderer, code editor ve shell aday ölçümleri; cihaz/toolchain matrisi | Eski 2D proje açılır; gerçek fixture ile bundle/startup/frame/debug/build raporu vardır; teknoloji seçimi ve reddedilen adaylar kaydedilir |
| GE1 — mode ve kaynak model | `GameEngineDescriptor`, boş GameDocument/GameScene, entity/component, serializer/migration, command ve portable round-trip | Oluştur/düzenle/undo/redo/save/reopen; mode değişiminde 2D scene ve layout korunur |
| GE2 — runtime çekirdeği | Runtime compile, fixed-step loop, event bus, input map, Edit/Simulate/Play ve debug overlay | Stop tam authoring state'e döner; aynı input kaydı aynı state hash'ini verir; pause/step çalışır |
| GE3A — Game 2D teknik MVP | 2D karakter, canlı render/fizik/trigger, Camera2D, ortak Visual Code/Node lifecycle, animator/state, audio ve offline Web artifact | Editor Play ile Web build davranışı eşleşir; klavye/gamepad/touch profili ve save checkpoint doğrulanır |
| GE3B — Game 3D teknik MVP | 3D character/prop, mesh/material/light, Camera3D, Physics3D spike/adapter ve GE3A ile aynı script/node davranışı | Aynı davranış contract fixture'ı 2D ve 3D scene'de; Vec2/Vec3 capability hataları build öncesi; frame/resource ölçümü kayıtlıdır |
| GE4 — scene/prefab üretimi | 2D/3D multi-scene, prefab/variant, level araçları, spawn/checkpoint, HUD ve world-profile değiştirebilen scene transition | Küçük oyun 2D ve 3D scene arasında geçer; kapanıp açılır; instance override/source update ve missing asset tanıları geçer |
| GE5 — Visual Code | Runtime module API, diagnostics, hot reload, debugger ve sandbox bütçeleri | Hata gerçek dosya/satıra döner; syntax hatasında son iyi modül korunur; sonsuz döngü runtime'ı kilitlemez |
| GE6 — Code Node | Typed graph/IR, compiler, debug trace, reusable subgraph ve migration | Metin ve graph ile yazılan eşdeğer davranış aynı contract testini geçer; cycle/type/node eksikliği açık tanıdır |
| GE7 — Character/Material/Render binding | 2D/3D character prefab bağlantısı, material runtime profile, animation controller ve cutscene devirleri | 2D ve 3D asset ayrı fixture'larda; gameplay-cutscene-camera/input geçişi; platform shader preflight |
| GE8 — platform build beta | Build Center; Web, Windows, macOS, Android ve iOS profilleri; local/remote capability | En az bir gerçek cihaz/hostta her hedef için build/install/launch kaydı; signing eksikliği preflight'ta anlaşılır |
| GE9 — performans ve yaşam döngüsü | Resource budgets, pooling/culling, background/resume, context loss, save migration, profiler | Hedef cihaz p50/p95 frame, memory, load ve battery/thermal gözlemi; corrupted save ve GPU loss recovery |
| GE10 — üretim sistemleri | Navigation/AI, streaming, localization/accessibility, package/plugin temeli | Temsilî oyun baştan sona oynanır; cold start, level load, save upgrade ve package disable güvenlidir |
| GE11 — release candidate | Store/release metadata, SBOM/licenses, signed artifacts, update/rollback ve dokümantasyon | Temiz makinaya/cihaza kurulum, offline oyun, crash recovery, release checklist ve bilinen sınırlar |

Sıra: **GE0 → GE1 → GE2 → GE3A** ilk oynanabilir 2D ürün eşiğidir.
**GE3B → GE4** ortak runtime üzerinde çift dünya profilli ürün eşiğidir.
GE5 ve GE6, GE2 runtime API'si sabitlendikten sonra kısmen paralel ilerleyebilir;
ikisi GE7'den önce en az bir gerçek component üzerinde kabul edilmelidir. GE8,
kanonik Web artifact ve cihaz bütçesi olmadan başlamaz. GE9–GE11 beta
sertleştirmesidir.

## 11. İlk dikey dilim ve ölçüm

İlk kabul fixture'ı aynı gameplay davranışını kullanan iki kardeş scene'den
oluşan “iki odalı platform/keşif örneği” olur:

- 1280×720 referans görünüm; responsive/safe-area profili,
- Game 2D scene'de sprite karakter, Camera2D ve Physics2D zemin,
- Game 3D scene'de mesh karakter/prop, Camera3D, light ve Physics3D zemin,
- iki scene'de de hareketli platform, trigger kapı ve checkpoint,
- idle/run/jump state'leri, kamera takip ve kısa cutscene,
- HUD, iki ses olayı, save/load,
- iki profile ortak bir text script/node graph ile boyuta özel raycast örnekleri,
- Play Mode, offline Web ve en az bir cihaz debug build.

Kabul raporu source revision, runtime artifact hash, platform/toolchain,
cihaz/GPU/OS, cold start, scene load, frame p50/p95/worst, CPU/GPU ayrımı
mümkünse, memory, package boyutu, input latency gözlemi ve suspend/resume
sonucunu kaydeder. Ölçüm yapılmadan sabit FPS veya cihaz desteği vaat edilmez.

## 12. Test, dokümantasyon ve devir

- Domain sözleşmeleri unit/contract; serializer ve save migration fixture;
  renderer golden frame; runtime recorded-input/state-hash; package gerçek
  install/launch testleriyle doğrulanır.
- Runtime API, node kataloğu, component lifecycle, coordinate/unit/time,
  threading/worker, asset ownership ve platform capability belgelenir.
- Public UI, MCP ve script yolları aynı command'ı kullandığını test eder.
- Yeni MCP/script API'lerinde `skills/chorono/`, public doküman ve capability
  şemaları aynı değişiklikte güncellenir.
- Uygulama değişikliklerinde repository kuralına göre `npm test`,
  `npm run mcp:build` ve `npm run build` çalıştırılır; build öncesi Next server
  durdurulur. Platform build'leri ilgili host/device CI ve signing preflight'ı
  ile ayrıca doğrulanır.
- Bir milestone yalnız registry/panel/şema eklenmesiyle tamamlanmaz. Default,
  command/undo, property UI, selection/bounds, clone/instance, renderer,
  portable kayıt, runtime compile, desteklenen build ve gerçek görsel/cihaz
  kabulü birlikte gerekir.

## 13. Teknoloji karar kayıtları için ilk ADR listesi

1. `ChoronoProject` içindeki GameDocument ve RuntimeArtifact format/sürüm sınırı.
2. Game 2D/Game 3D renderer adapter'ları, composition tabanlı 2.5D ve capability
   profilleri.
3. Canlı 2D fizik adapter'ı; 3D fizik gereksinim ve seçim kapısı.
4. Runtime script sandbox, lifecycle, determinism ve debugger protokolü.
5. Visual Code editor bileşeni seçimi.
6. Code Node IR, compiler ve migration formatı.
7. Material Graph IR ve backend shader compiler sınırı.
8. Desktop shell: Tauri/Electron ölçüm kararı.
9. Mobile shell: Tauri/Capacitor ölçüm kararı.
10. Save schema/migration ve build-time asset paket formatı.
11. Plugin/package güven, izin ve sürümleme modeli.
12. Remote Play/hot reload/debug transport'u ve cihaz yetkilendirmesi.

ADR sonucu çıkmadan önerilen sınıf/paket adı public contract sayılmaz. Seçilen
araç sürümü lockfile ve build manifest'inde sabitlenir; yükseltme migration ve
cihaz regresyonuyla yapılır.

## 14. Resmî platform kaynakları

- Tauri 2 build ve dağıtım: <https://v2.tauri.app/distribute/>
- Tauri App Store/macOS–iOS koşulları: <https://v2.tauri.app/distribute/app-store/>
- Capacitor desteklenen ortamlar: <https://capacitorjs.com/docs/getting-started/environment-setup>
- Capacitor proje/platform kurulumu: <https://capacitorjs.com/docs/getting-started>
- Electron desktop ve dağıtım: <https://www.electronjs.org/docs/latest/tutorial/distribution-overview>
- Apple Xcode command-line araçları: <https://developer.apple.com/documentation/xcode/installing-the-command-line-tools>
