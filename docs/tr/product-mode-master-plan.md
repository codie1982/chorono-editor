# Chorono dört ana mod — ürün mimarisi ve teslim sırası

Tarih: 21 Kasım 2026. Durum: bağlayıcı ürün/mimari kararı; tek başına
uygulama teslimi değildir.

## 0. Bağlayıcı ürün kararı

Chorono projesinin tek kökü **`ChoronoProject`** olur. Game Engine proje kökü
değildir; projenin öne çıkarılan dört eş düzey ana modundan biridir:

1. [2D Mode](2d-graphics-roadmap.md)
2. [3D Mode](3d-modeling-roadmap.md)
3. [Game Mode](game-engine-mode-roadmap.md)
4. [Render Mode](render-mode-roadmap.md)

Her mod aynı proje içindeki ana asset graph'ına ve izin verilen ortak
özelliklere erişir. Modlar birbirinden veri alır ve birbirine veri verir; fakat
asset ownership, koordinat uzayı, runtime state ve renderer handle'ları
birbirine karıştırılmaz. “Erişebilir olmak”, başka modun kaynak verisini kendi
şemasına kopyalamak veya sahiplenmek anlamına gelmez.

Game Mode ürün navigasyonunda ve geliştirme programında öne alınır. Bu öncelik
Game'i proje kökü yapmaz; 2D, 3D ve Render modlarının bağımsız üretim değerini
ve asset ownership'ini azaltmaz.

## 1. Proje kökü ve ortak asset graph'ı

```text
ChoronoProject
  ├─ ProjectManifest / schemaVersion / settings
  ├─ AssetGraph
  │   ├─ 2D: vector, image, text style, sprite, UI component
  │   ├─ 3D: mesh, material, texture, skeleton, morph, environment
  │   ├─ Motion: clip, controller, camera shot, VFX, sequence
  │   ├─ Game: game scene, prefab, input map, script/graph, save schema
  │   └─ Media: audio, video, font and generated artifacts
  ├─ Documents
  │   ├─ TwoDDocument[]
  │   ├─ ThreeDDocument[]
  │   ├─ GameDocument[]
  │   └─ RenderDocument[]
  ├─ ModeWorkspaces / user layout state
  └─ BuildAndRenderProfiles
```

`ChoronoProject` stable project ID, schema migration, ortak asset registry,
dependency graph, global settings ve portable package manifest'inin sahibidir.
Bir `GameDocument` yalnız Game Mode scene/prefab/input/build verisini taşır;
2D ve 3D kaynak asset'lerin proje kökü değildir.

Her asset:

- stable ID, type, schema/capability sürümü ve content revision/hash taşır,
- kaynak sahibi modu ve onu kullanan document/asset referanslarını bildirir,
- kopya yerine varsayılan olarak referansla paylaşılır,
- açık `Duplicate`, `Detach` veya `Make Local` işlemi olmadan snapshot'a
  dönüşmez,
- source değişince tüketicide `compatible`, `review required`, `stale` veya
  `broken` durumlarından birini üretir,
- DOM, GPU, physics engine, decoder veya açık dosya handle'ı serialize etmez.

## 2. Dört modun sorumluluğu

| Mod | Kullanıcı amacı | Kaynak sahipliği | Başlıca çıktılar |
| --- | --- | --- | --- |
| **2D Mode** | XY düzleminde grafik, çizim, tipografi, sprite, UI ve 2D component üretmek | Vector/path, image composition, text/style, sprite, 2D layout/component | SVG/PNG/WebP, 2D component, sprite/UI asset, Render/Game referansı |
| **3D Mode** | XYZ uzayında model, UV, texture, material, skeleton ve rig-ready asset üretmek | Mesh/topology, 3D material, UV/texture, bind/rest skeleton, morph/corrective | Portable 3D asset, GLB, material/skeleton, Render/Game referansı |
| **Game Mode** | 2D/3D asset'lerle canlı etkileşimli scene, prefab, davranış ve platform paketi üretmek | Game scene, entity/component, prefab, input, gameplay state/script, save/build profile | Web/Windows/macOS/Android/iOS runtime artifact |
| **Render Mode** | 2D/3D/Game verisini zamanlamak, canlandırmak, kompozit etmek ve final çıktı üretmek | Clip/controller, timeline/sequence, shot/camera choreography, compositing/VFX ve render job/profile | Animation clip/controller, cutscene, image sequence, video ve final frame |

### 2.1. Access ve ownership kuralı

Her mod Project Browser üzerinden bütün proje asset'lerini görebilir, preview
edebilir ve kendi domain'inde referanslayabilir. Kaynak asset düzenlemesi için:

- Game'deki mesh için `Edit Source in 3D`,
- Render'daki vector için `Edit Source in 2D`,
- Game'deki clip/cutscene için `Edit Source in Render`,
- Render'daki Game scene çekimi için `Open Source in Game`

eylemleri kullanılır. İlgili mod aynı document/asset kimliğiyle açılır ve dönüş
breadcrumb'i korunur. Modlar ortak typed command API üzerinden işbirliği yapar;
bir mod diğer modun React state'ine, renderer handle'ına veya private domain
modeline doğrudan yazmaz.

## 3. Koordinat, transform ve hesaplama sözleşmesi

### 3.1. 2D Mode: X ve Y

- Kaynak uzay `Vec2`, affine `Mat3`, x/y position, rotation ve scaleX/scaleY
  kullanır.
- Layout, image/video graphic, sprite, UI ve 2D compositing hesapları XY
  düzlemindedir.
- Birimler belge türüne göre açıkça pixel, point veya normalized olabilir;
  metadata'da kaydedilir.
- Legacy 2D transform'a genel kullanım için `z` eklenmez.

### 3.2. 3D Mode: X, Y ve Z

- Kaynak uzay `Vec3`, quaternion, scaleXYZ ve `Mat4` kullanır.
- Kamera/projection, normal/tangent, depth, ışık, skeleton bind/rest ve
  fiziksel material hesapları XYZ uzayındadır.
- World unit, up-axis, handedness ve import scale asset metadata'sında açıkça
  tutulur; pixel ile world unit kendiliğinden eşit sayılmaz.

### 3.3. Game Mode: açık 2D veya 3D component

Uygulama düzeyindeki ana mod sayısı dört kalır: **2D, 3D, Game ve Render**.
Game, bu dört eş düzey ana moddan yalnızca biridir ve hem 2D hem 3D oyun üretir.
`Game 2D` ile `Game 3D` yeni ana modlar değil, Game ana modu içindeki açık dünya
profilleridir. Yeni scene oluştururken `Game 2D` veya `Game 3D` template'i
seçilir; seçim scene'in koordinat, kamera, render, fizik ve spatial-query
capability set'ini belirler. Ortak scene/entity/prefab, input, script, node
graph, audio, save, debug ve build altyapısı iki profilde de kullanılır.

| Game dünya profili | Uzay ve görünüm | Realtime adapter'ları | Visual Code / Node yüzeyi |
| --- | --- | --- | --- |
| **Game 2D** | XY, affine transform, 2D/orthographic camera | Sprite/vector/UI renderer, Physics2D, 2D query/culling | Ortak lifecycle + `game2d` capability API/node'ları |
| **Game 3D** | XYZ, TRS/quaternion, perspective/orthographic camera | Mesh/material/light renderer, Physics3D, 3D query/culling | Ortak lifecycle + `game3d` capability API/node'ları |

Game entity tek, belirsiz bir transform taşımaz. Entity açıkça `Transform2D`
veya `Transform3D` component'i kullanır. Bir scene'in ana world profili
homojendir; başka boyuttaki içerik adapter/composition boundary üzerinden
bağlanır:

- 2D UI/HUD ve sprite world → XY,
- 3D world/character/prop → XYZ,
- billboard, decal, world-space UI veya render texture → named projection/
  placement adapter.

2D physics gövdesine z eklenerek 3D physics yapılmaz; 3D transform da cast ile
2D affine sayılmaz. 3D world üzerindeki 2D HUD normal ve desteklenen bir
composition'dır; aynı entity'yi eşzamanlı olarak hem Physics2D hem Physics3D
world'üne bağlamak desteklenen varsayılan değildir.

### 3.4. Render Mode: kompozisyon ve projection

Render Mode final output canvas'ını XY kompozisyon uzayında kurabilir; 3D
scene'i seçili kamera/projection ile bir render surface/depth payload olarak
kompozite eder. Render document şunları birlikte zamanlayabilir:

- native 2D layer ve video graphic,
- 3D scene/camera referansı,
- Game Mode'dan deterministic replay/capture veya açık runtime shot,
- audio, VFX, mask, color ve output profile.

3D node'lar sahte 2D layer'a çevrilmez. 2D/3D değerlerinin dönüşümü named
converter ve kaydedilmiş projection/camera sözleşmesiyle yapılır.

## 4. Modlar arası veri alışverişi

| Kaynak → hedef | Verilen veri | Hedefteki kullanım | Geri yazma sınırı |
| --- | --- | --- | --- |
| 2D → 3D | Texture, decal, profile/spline, mask, UI image | Material texture, extrude/lathe profili, reference image | 3D sonucu 2D source'u değiştirmez |
| 3D → 2D | Rendered view, depth/normal pass, projected outline | Layout, paint-over, poster/UI veya image asset | Kaynak mesh ayrı revision olarak korunur |
| 2D → Game | Sprite, tile, HUD/component, font/style | 2D entity, UI, texture ve prefab görünümü | Gameplay override kaynak grafiği sahiplenmez |
| 3D → Game | Mesh, material, skeleton, collider source adayı | 3D entity/prefab ve runtime render | Runtime collider/material profile ayrı adapter'dır |
| 2D → Render | Vector/image/text/component | Motion graphics, compositing ve video | Timeline source görünümü referanslar |
| 3D → Render | Scene/model, camera, skeleton, material | 3D shot, pose/clip ve final render | Clip, mesh topology kaynağını sahiplenmez |
| Render → Game | Clip/controller, cutscene, baked VFX/media | Animator, cutscene player ve runtime presentation | Gameplay state ayrı kalır |
| Game → Render | Scene snapshot, deterministic replay, camera/event track | Trailer, cinematic, benchmark ve final capture | Capture Game source state'ine geri yazmaz |

Cross-mode conversion; source ID/revision, converter sürümü, birim/eksen,
ayarlar, kayıp/fallback tanısı ve çıktı hash'i taşıyan bir manifest üretir.
Kayıplı dönüşüm kullanıcı onayı olmadan source'un yerine geçmez.

## 5. Ortak özellikler ve mod adapter'ları

| Ortak platform sözleşmesi | Ortak bölüm | Mod adapter'ı |
| --- | --- | --- |
| Project/asset | Stable ID, dependency, revision, import/reimport, acquire/release | 2D component, 3D mesh/material, Game prefab, Render sequence |
| Command/history | Validate → atomic command → event/change-set → undo/redo | Her modun domain validator ve command'ı |
| Job | Snapshot, progress/cancel, stale, resumable artifact | Bake, shader compile, simulation, render, platform build |
| Time | Explicit clock, range, deterministic sampling ve event policy | 2D property time, 3D clip, Game fixed step, Render sequence |
| Script | Authoring read/command API, permission, budget ve diagnostics | Game runtime script, Render expression/graph, mod-specific handle |
| Resource | Admission, lease, cache invalidation, dispose ve context loss | Canvas/bitmap, GPU mesh/texture, physics world, encoder surface |
| Capability/output | Preflight, unsupported/fallback ve artifact manifest | SVG/raster, GLB, game package, image sequence/video |

Ortak platform hiçbir renderer, React panel, Three.js, Matter.js, encoder veya
platform SDK'sine doğrudan bağımlı olmaz. Paylaşım ancak iki gerçek mod aynı
input/output, birim, ownership, mutation ve failure anlamlarını taşıdığında
küçük contract'a yükseltilir.

## 6. Kullanıcı navigasyonu

Project Hub dört mode kartı gösterir. Game Mode ilk/öne çıkarılmış karttır;
son kullanılan proje ve mod da doğrudan açılabilir.

| Mod | İlk workspace'ler |
| --- | --- |
| 2D | Draw, Vector, Typography, Layout, Image/Compositing, Components |
| 3D | Model, Sculpt, UV, Texture, Material, Rig Setup, Preview |
| Game | Project, Scene/Level, Prefab, Inspector, Play, Code/Node, Debug, Build |
| Render | Timeline, Curve/Dope, 2D/3D Animation, Camera/Shot, Compositing, Video, Queue |

Breadcrumb `Project → Mode → Workspace → Document/Asset` yolunu gösterir.
Workspace değiştirmek source asset tipini veya mode ownership'ini değiştirmez.
Her mod kendi panel layout'unu, viewport state'ini ve selection context'ini
saklar. Play/Simulate/Render Preview geçici runtime state'i source'a kaçak
mutation yapmaz.

### 6.1. Mode, workspace, document, viewport ve runtime ayrımı

UI çakışmasını önlemek için aşağıdaki beş eksen birbirinin yerine kullanılmaz:

| Eksen | Cevapladığı soru | Örnek |
| --- | --- | --- |
| **Mode** | Kullanıcı hangi ürün amacıyla çalışıyor? | 2D, 3D, Game, Render |
| **Workspace** | Şu anda hangi işi yapıyor? | 2D Animation, Game Level, Material, Compositing |
| **Document / world profile** | Authoritative veri modeli nedir? | TwoDDocument, GameScene `game2d`, GameScene `game3d` |
| **Viewport role** | Veri nasıl gösteriliyor? | Source, Game Preview, Camera, Composite, Output Preview |
| **Runtime state** | Veri çalışıyor mu? | Edit, Simulate, Play, Paused |

Bu nedenle 2D Animation workspace'indeki viewport'un `Game Preview` yapılması,
2D source document'i sessizce Game document'e dönüştürmez. Viewport, mevcut
veya yeni oluşturulan `game2d` GameScene binding'ini realtime gösterir. Kullanıcı
Game araçlarına ihtiyaç duyarsa `Open in Game Mode` aynı binding'i Game Mode'un
panel düzeninde açar. Kaynak asset ID'leri referans olarak korunur.

### 6.2. Aynı ekranda 2D ve 3D viewport politikası

Bir viewport instance'ının tek bir authoritative world context'i vardır. Aynı
panel alanında 2D ve 3D içerik için üç açık sunum biçimi desteklenir:

1. **Split View:** Game 2D ve Game 3D iki ayrı viewport instance'ında yan yana
   çalışır; camera, selection, physics debug ve input focus ayrıdır.
2. **Embedded Surface:** Game 2D world içine `SceneSurface3D`, Game 3D world
   üzerine `Overlay2D`/HUD eklenir. Alt scene kendi renderer/camera/runtime
   context'ini korur; ana viewport yalnız çıktıyı kompozite eder.
3. **Composite Preview:** Render Mode veya Game presentation katmanı iki world
   çıktısını tek final frame'de birleştirir; bu görünüm source ownership'i ya da
   fizik authority'sini birleştirmez.

İlk sürümde tek viewport içinde iki authoritative physics world'ün araçlarını
aynı anda doğrudan düzenleyen belirsiz “Hybrid Edit” modu açılmaz. Gerekirse
ileride ayrı capability ve interaction-bridge sözleşmesiyle değerlendirilir.

### 6.3. Viewport başlığı ve input odağı

Her viewport başlığı en az şu kimlikleri görünür taşır:

`[Owner Mode] [Document/Scene] [2D|3D] [Source|Game Preview|Composite] [Edit|Simulate|Play]`

Örneğin `2D · Hero Animation · 2D · Game Preview · Play` veya
`Game · Level 01 · 3D · Camera · Simulate`. Aktif input yalnız odaklanmış
viewport'a gider. Selection, gizmo, camera ve debug overlay viewport context'i
içinde tutulur; ortak global React state ile 2D/3D arasında paylaşılmaz.

## 7. Teknik mode kimlikleri ve geriye uyumluluk

Hedef public mode kimlikleri `2d`, `3d`, `game`, `render` olarak ele alınır.
Mevcut kodda bulunan `2danimation`, `3d-modeling`, `game-engine` ve
`video-editor` değerleri uygulama gelene kadar korunur; serializer migration,
route alias ve eski proje fixture'ı olmadan yeniden adlandırılmaz.

Önerilen uyumluluk:

| Legacy kimlik | Hedef bağlam |
| --- | --- |
| `2danimation` | Kaynağı 2D Mode'da, timeline/animasyon görünümü Render Mode'da açabilen compatibility document |
| `3d-modeling` | `3d` |
| `game-engine` | `game` |
| `video-editor` | `render` içindeki Video/Sequencer workspace |

Legacy `2danimation` projesi sessizce parçalanmaz. İlk migration sürümü aynı
document'i compatibility adapter ile açar; source/sequence ayrıştırması ancak
round-trip ve kullanıcı onayıyla yapılır.

## 8. Öncelik ve uygulama sırası

Game Mode öne alınır, fakat önce minimum ortak proje/asset omurgası gerekir:

| Program | Teslim | Geçiş kapısı |
| --- | --- | --- |
| M0 — ortak proje çekirdeği | `ChoronoProject`, AssetGraph, document registry, dört mode manifest'i, legacy adapter | Aynı proje dört mode'da açılır; asset ID/revision korunur |
| M1 — Game 2D teknik dikeyi | Ortak runtime, Game 2D scene/entity/component, Edit/Simulate/Play, Visual Code/Node temeli, input, canlı 2D render/fizik ve Web runtime | 2D placeholder/sprite ve script ile oynanabilir teknik MVP |
| M2 — 2D kaynak dikeyi | Draw/vector/layout/component ve Game/Render handoff | Aynı sprite/UI asset'i Game ve Render'da referanslanır |
| M3 — 3D kaynak ve Game 3D dikeyi | Model/UV/material/rig-ready asset; Game 3D render/camera/physics adapter'ı; ortak Visual Code/Node ve Game/Render handoff | Aynı mesh/material Game ve Render'da referanslanır; script'li 3D fixture realtime çalışır |
| M4 — Render dikeyi | 2D/3D clip, timeline/shot, compositing, Game capture ve image/video output | Game cutscene/clip ve final video round-trip |
| M5 — Game üretim araçları | Prefab, Code/Node, UI/audio/VFX binding, save, platform build | İki scene'li dağıtılabilir beta |
| M6 — ortak sertleştirme | Migration, profiler, resource budget, accessibility/localization, security, CI/release | Dört modlu release candidate |

M0 kapsamı küçük tutulur ve mevcut 2D/3D domain işlerini durduracak genel bir
yeniden yazıma dönüşmez. M1, 3D4'ün tamamını beklemeden mevcut 2D placeholder
ve import asset'lerle ilerleyebilir. M3'te Game 3D adapter'ı aynı runtime loop,
script ABI ve artifact compiler'ı kullanır; ayrı ikinci motor kurulmaz. M2–M4
paralel dikeylerdir ve Game'de gerçek kullanıcı değeri üreten asset/shot
gereksinimlerine göre önceliklenir.

## 9. Ortak kabul projesi

Tek `ChoronoProject` içinde:

- 2D Mode'da UI, sprite, decal ve bir extrude profile,
- 3D Mode'da profile'dan üretilmiş prop, material ve rig-ready karakter,
- Game Mode'da en az bir Game 2D ve bir Game 3D scene; prefab, input, kendi
  boyutuna uygun fizik/kamera, ortak Visual Code/Node davranışı, HUD ve
  save/load,
- Render Mode'da 2D/3D clip, Game replay/camera shot, compositing, ses ve kısa
  final video bulunur.

Kabul; modlar arası `Open Source`, source revision update/review, undo/redo,
portable save/open, legacy migration, missing asset/capability, random seek,
Play stop restore, Render cancel/stale ve en az Web + bir cihaz build'ini
kapsar. Bir registry veya panel kaydı tamamlanmış mode sayılmaz.

## 10. Belge sahipliği

- Dört mod, proje kökü, koordinat ve cross-mode ownership için bu belge
  otoritedir.
- [2D Mode planı](2d-graphics-roadmap.md),
  [3D Mode planı](3d-modeling-roadmap.md),
  [Game Mode planı](game-engine-mode-roadmap.md) ve
  [Render Mode planı](render-mode-roadmap.md) ürün teslimlerini ayrıntılandırır.
- [2D teknik planı](production-2d-roadmap.md) ve
  [3D teknik planı](production-3d-roadmap.md) domain implementation sırasını
  izler; proje kökü veya dört mode kararını yeniden tanımlamaz.
- [Animasyon alt planı](animation-roadmap.md), Render Mode içindeki 2D/3D
  animation sözleşmesinin sahibidir.
