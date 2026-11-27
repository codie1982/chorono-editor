# Chorono Render Mode — 2D / 3D animasyon alt planı

Tarih: 19 Kasım 2026. Mode kararı: 21 Kasım 2026. Durum: Render Mode teknik
alt planı; uygulama teslimi değildir. Ana Render teslimleri için
[Render Mode planı](render-mode-roadmap.md), dört mode mimarisi için
[dört ana mod planı](product-mode-master-plan.md); teknik 2D ve 3D
altyapıları için [2D uygulama planı](production-2d-roadmap.md),
[3D uygulama planı](production-3d-roadmap.md) ve
[Character Motion planı](character-motion-plan.md) esas alınır.

## 1. Kullanıcı amacı

Bu alt plan; 2D görsel veya 3D modele Render Mode içinde zaman, hareket, kamera, ses ve anlatı
kazandırmak isteyen kullanıcı içindir. Motion graphics, character animation,
cutscene, compositing ve video/sequencer aynı mode içindedir; 2D ve 3D
domain verileri tek tipe zorlanmaz.

Başlangıç seçenekleri:

- 2D motion graphic,
- 2D character/sprite animation,
- 3D object veya character animation,
- mixed 2D + kutulu 3D composition,
- cutscene / video sequence,
- mevcut asset veya clip'i açma.

## 2. Workspace'ler

| Workspace | Sorumluluk |
| --- | --- |
| Timeline | Track/key/segment, marker, clip ve transport |
| Dope Sheet / Curve | Timing, easing, tangent, modifier ve channel düzenleme |
| 2D Rig | Bone/sprite, IK, deformasyon ve pose |
| 3D Pose | Skeleton, IK/look-at, morph, retarget ve root motion policy |
| Character Motion | Clip, blend, state/transition ve animation event |
| Camera | 2D/3D camera, path, shot ve transition |
| Compositing / VFX | Layer, mask, effect, particle, tracking ve color |
| Video / Sequencer | Media clip, trim, proxy, dialogue, audio ve cutscene |
| Export | Frame/video, clip/controller ve Game Engine handoff |

## 3. 2D ve 3D'nin ortak ve ayrı bölümleri

Ortak: timeline transport, clip kimliği, marker/event, explicit zaman,
state/controller, job/bake yaşam döngüsü, audio sync ve export capability.

Ayrı: 2D affine/anchor ile 3D TRS/quaternion; 2D sprite rig ile 3D
skeleton/skin; Canvas compositor ile 3D depth/camera/material. Ortak UI aynı
contract'ları gösterebilir fakat solver ve payload'ları cast ederek
birleştirmez.

Render Mode kaynak 2D shape veya 3D mesh'i sahiplenmez. Değişiklik
gerektiğinde `Edit Source in 2D Graphics` veya `Edit Source in 3D Modeling`
eylemiyle doğru category/workspace açılır ve kullanıcı aynı animation
bağlamına geri döner.

## 4. Video Editor sınırı

İlk ürün içinde Video, Render Mode'un `Video / Sequencer`
workspace'idir. Kaynak medya, proxy, trim, audio, transition, compositing ve
encoder job'larını kullanır. Aşağıdaki şartlar oluşursa ayrı ürün kararı
yeniden değerlendirilir; bugünkü dört mode kararında Video, Render içindedir:

- sequence/track/clip formatı animation scene'den bağımsızlaşırsa,
- medya proxy/cache ve encoder lifecycle ana ürün yükü olursa,
- çok kameralı/uzun-form kurgu ayrı kullanıcı navigasyonu gerektirirse,
- mode'a özel history, renderer ve exporter gerçek tüketicilerle kanıtlanırsa.

## 5. Aşamalar

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| AN0 — Render animation workspace | Başlangıç template'leri ve asset handoff | 2D/3D kaynak doğru workspace'te açılır; stable ID korunur |
| AN1 — ortak zaman çekirdeği | Timeline/clip/marker/event, curve/dope sheet ve deterministic seek | 2D ve 3D fixture reverse/random seek'te aynı sonucu verir |
| AN2 — 2D motion | Shape/text/sprite motion, path, 2D rig ve compositing | Kaydet/aç, editor/export parity ve gerçek video/frame çıktısı |
| AN3 — 3D motion | Object/camera/skeleton/morph clip ve pose workspace | Bind/topology revision, instance isolation ve render parity |
| AN4 — character/controller | Clip library, blend/state/controller ve event | Aynı controller iki karakterde bağımsız çalışır |
| AN5 — sequencer/video | Shot, media/audio/dialogue, cutscene ve gameplay devir sözleşmesi | Frame-accurate seek; Game Engine input/camera state'i güvenli devralır |
| AN6 — üretim paketi | Reusable clip/controller, offline film ve Game Engine handoff | Asset/clip dependency, portable kayıt ve target capability doğrulanır |

## 6. İlk kabul projesi

Aynı 8–10 saniyelik sekans içinde 2D başlık, sprite karakter, rig-ready 3D
karakter/prop, iki kamera shot'ı, ses ve particle/VFX kullanılır. Sekans video
olarak alınır; character clip ve kısa cutscene Game Engine projesinde yeniden
kullanılır. Kaynak 2D ve 3D asset düzenlemeleri review/stale politikasıyla
sekansa yansır; kullanıcı emeği sessizce silinmez.
