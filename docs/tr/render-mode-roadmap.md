# Chorono Render Mode — ana geliştirme yol haritası

Tarih: 21 Kasım 2026. Durum: ana mode planı; uygulama teslimi değildir. Dört
modun ortak proje, koordinat ve ownership kararı
[dört ana mod planında](product-mode-master-plan.md) tutulur.

## 1. Ürün sorumluluğu

Render Mode; 2D, 3D ve Game Mode kaynaklarını zamanlamak, canlandırmak,
kompozit etmek, önizlemek ve final artifact üretmek için kullanılır. Proje kökü
veya kaynak modelleme modu değildir.

Render Mode'un sahibi olduğu kaynaklar:

- timeline, clip ve animation controller,
- sequence, shot, camera choreography ve cutscene,
- compositing graph/layer, mask, color ve VFX bağları,
- render/output profile, queue ve job manifest'i,
- Game capture/replay referansı ve presentation event track'i.

2D shape/image/text kaynağı 2D Mode'da; mesh/material/skeleton kaynağı 3D
Mode'da; gameplay scene/state/input Game Mode'da kalır.

## 2. Workspace'ler

| Workspace | Sorumluluk |
| --- | --- |
| Timeline | Track, key, marker, segment, transport ve clip instance |
| Curve / Dope | Easing, tangent, channel, timing ve modifier |
| 2D Animation | XY transform, sprite/rig, text/shape motion |
| 3D Animation | XYZ/quaternion pose, skeleton/morph, camera ve object clip |
| Character Motion | Clip, animation controller, blend ve animation event |
| Camera / Shot | 2D/3D camera, shot, transition ve framing |
| Compositing / VFX | 2D layers, 3D surfaces/passes, mask, effect, particle ve color |
| Video / Sequencer | Media, trim, proxy, audio, dialogue ve cutscene |
| Render Queue | Frame/image sequence/video, profile, job, progress/cancel |

## 3. Girdi ve çıktı

| Girdi | Kullanım | Çıktı |
| --- | --- | --- |
| 2D asset/component | Motion graphics, UI animation, title ve compositing | Clip, image sequence, video, Game animation asset |
| 3D model/scene/skeleton | Pose, camera shot, material render ve character motion | 3D clip/controller, passes, video, Game animation asset |
| Game scene/replay | Cutscene, trailer, camera capture ve benchmark | Runtime cutscene asset veya offline final media |
| Audio/video/media | Sync, dialogue, edit ve final mix reference | Sequence ve encoded artifact |

Render Mode kaynak asset'i varsayılan olarak referanslar. Bake/proxy/cache,
source'un yerine geçmez; source ID/revision, zaman aralığı, FPS, resolution,
camera/projection, converter/renderer sürümü ve stale durumu manifest'te kalır.

## 4. Koordinat ve kare üretimi

Final composition çoğunlukla XY output canvas kullanır. Native 2D layer XY
olarak değerlendirilir. 3D content XYZ uzayında kendi camera/projection ve
depth sözleşmesiyle render edilir; color/depth/normal gibi açık pass'lerle
composition'a girer. Game capture, recorded input/event/replay veya açık
runtime snapshot olmadan deterministik kabul edilmez.

Render evaluator bağımsız duvar saatiyle ilerlemez. Explicit time, timeline
scope, parameter/event snapshot ve gerektiğinde deterministic replay kullanır.
Editor preview, random seek, reverse, render queue ve Game cutscene playback
aynı desteklenen clip/sequence sözleşmesini kullanır.

## 5. Game Mode ile sınır

- `AnimationController` clip/pose/presentation sahibidir; Render Mode'da
  author edilir.
- `GameplayStateMachine` davranış, authority ve input sahibidir; Game Mode'da
  author edilir.
- Game Animator component'i Render asset'ini referanslar ve param override
  taşır; clip verisini kopyalamaz.
- Game camera follow/zone runtime davranışıdır; cinematic shot/camera path
  Render kaynağıdır. Cutscene handoff input ve camera authority devrini açıkça
  tanımlar.
- Runtime VFX/audio emitter Game component'idir; VFX/media kaynağı ve zamanlı
  presentation Render asset'i olabilir.

## 6. Aşamalar

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| R0 — mode/document temeli | `RenderDocument`, timeline/sequence registry, source refs ve portable round-trip | Aynı proje 2D/3D/Game asset'lerini stable ID ile açar |
| R1 — canonical time/frame | Explicit time, clip/marker/event, deterministic seek ve frame request | 2D ve 3D fixture reverse/random seek'te aynı sonucu verir |
| R2 — 2D/3D animation | XY/XYZ clip adapter'ları, curve/dope ve camera/pose workspace | Source revision, instance isolation ve editor/output parity |
| R3 — compositing/VFX | 2D layer, 3D passes, mask/effect/color ve resource budget | Gerçek karma sahnede alpha/color/depth ve cancel/stale kabulü |
| R4 — Game handoff | AnimationController, cutscene, replay/capture ve authority handoff | Game ↔ Render clip/camera/input devri kayıpsız ve test edilebilir |
| R5 — video/queue | Media/proxy/audio, render profiles, queue ve encoder job'ları | Frame-accurate seek, progress/cancel ve gerçek artifact |
| R6 — üretim paketi | Preset, multi-format, batch/variant, resume ve diagnostics | Portable proje, cihaz/codec capability ve reproducible output |

2D/3D animation ayrıntısı [animasyon alt planındadır](animation-roadmap.md).
Video/Sequencer başlangıçta Render Mode workspace'idir; ayrı beşinci mode
değildir.

## 7. İlk kabul projesi

8–10 saniyelik sequence; 2D title/UI, 3D character/prop, Game replay camera,
iki shot, audio ve VFX içerir. Aynı project içinde clip Game Animator'a,
cutscene Game scene'e bağlanır; ayrıca image sequence ve video artifact alınır.
Source asset değişiklikleri compatible/review/stale politikasıyla görünür olur.
