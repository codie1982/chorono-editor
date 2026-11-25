# Chorono documentation / Dokümantasyon

[Repository home](../README.md) · [CLI package](../packages/cli/README.md)

## Releases / Sürümler

- [v0.4.0 release notes](releases/v0.4.0.md) / [Türkçe sürüm notları](tr/releases/v0.4.0.md)
- [v0.4.0 validation and limitations](releases/v0.4.0-validation.md)
- [v0.3.0 release notes](releases/v0.3.0.md) / [Türkçe sürüm notları](tr/releases/v0.3.0.md)
- [v0.3.0 validation and limitations](releases/v0.3.0-validation.md)
- [v0.2.0 release notes](releases/v0.2.0.md) / [Türkçe sürüm notları](tr/releases/v0.2.0.md)
- [v0.2.0 validation and measurement scope](releases/v0.2.0-validation.md)
- [Changelog](../CHANGELOG.md)
- [Current 2D development roadmap](tr/production-2d-roadmap.md)
- [2D UI contracts and visual layout plan](tr/production-2d-ui-contracts.md)
- [Current 3D development roadmap](tr/production-3d-roadmap.md)
- [Shared 2D–3D foundations and strict boundaries](tr/shared-2d-3d-foundations.md)
- [3D4: detailed model and poseable character production plan](tr/plans/model-production-quality-plan.md)
- [2D emitter, collider and surface-target interaction plan](tr/plans/emitter-collider-surface-interaction-plan.md)

## Install on your computer / Bilgisayarınıza kurun

| Task / Konu | English | Türkçe |
| --- | --- | --- |
| Install the editor and connect your agent | [Installation](en/installation.md) | [Bilgisayara kurulum](tr/installation.md) |
| Understand, install and update skills | [Agent skills](en/agent-skills.md) | [Ajan skill'leri](tr/agent-skills.md) |
| Diagnose installation and MCP problems | [Troubleshooting](en/troubleshooting.md) | [Sorun giderme](tr/troubleshooting.md) |

For agent control, complete installation, start the editor, choose **MCP → Connect this editor** in the browser, reload your agent's MCP connections, and check `doctor`. Skill installation alone does not connect an editor.

Ajanla kullanım için kurulumu tamamlayın, editörü başlatın, tarayıcıda **MCP → Connect this editor** seçin, ajanın MCP bağlantılarını yeniden yükleyin ve `doctor` sonucunu kontrol edin. Yalnızca skill kurmak editörü bağlamaz.

## Learn the editor / Editörü öğrenin

| Topic / Konu | English | Türkçe |
| --- | --- | --- |
| First animation / İlk animasyon | [Getting started](en/getting-started.md) | [Başlangıç](tr/getting-started.md) |
| Layers / Katmanlar | [Layers](en/layers.md) | [Katmanlar](tr/layers.md) |
| Timeline / Zaman çizelgesi | [Timeline](en/timeline.md) | [Zaman çizelgesi](tr/timeline.md) |
| AI panel / AI paneli | [AI animation](en/ai-animation.md) | [AI animasyon](tr/ai-animation.md) |
| Particles / Parçacıklar | [Particle effects](en/particle-effects.md) | [Parçacık efektleri](tr/particle-effects.md) |
| GPU rendering / GPU çizimi | [GPU rendering](en/gpu-rendering.md) | [GPU çizimi](tr/gpu-rendering.md) |
| State machines / Durum makineleri | [State machines](en/state-machines.md) | [Durum makineleri](tr/state-machines.md) |
| Parameter wiring / Parametre bağlama | [Parameter wiring](en/parameter-wiring.md) | [Parametre bağlama](tr/parameter-wiring.md) |
| JavaScript authoring / Betik yazımı | [Scripting](en/scripting.md) | [Betik yazımı](tr/scripting.md) |
| Script source guards / Kaynak korumaları | — | [Teknik sözleşme](tr/script-source-guards.md) |
| SDKs / SDK'lar | [SDKs](en/sdks.md) | [SDK'lar](tr/sdks.md) |

## Technical references / Teknik kaynaklar

Local evidence linked under `artifacts/` (benchmark reports, recordings and renders) is intentionally ignored by Git and is not included in a fresh clone. The benchmark protocol and harness are versioned; reproducing measurements requires the portable fixtures described in the protocol. `outputs/` and `design-mockups/` are also local-only; curated distributable examples live in `examples/`.

`artifacts/` bağlantılarındaki yerel kanıtlar (ölçüm raporları, kayıtlar ve render çıktıları) Git dışında tutulur; yeni klonlarda bulunmaz. Ölçüm protokolü ve araçları sürümlenir; tekrar ölçüm için protokolde açıklanan portable sahneler gerekir. `outputs/` ve `design-mockups/` da yereldir; dağıtılabilir örnekler `examples/` altında tutulur.

- [Software engineering standards: SOLID, modules, reuse, documentation and handoff](../AGENTS.md#software-engineering-standards)
- [Render resource ownership, shared mask/effect scratch pipeline and native regression checks](tr/render-resource-management.md)
- [S2D-4 Boolean operations: preserved source, Apply/Cancel, Edit Operation and bounded derived geometry](tr/boolean-operation.md)
- [S2D-3 Boolean preview: closed Shape/Spline/Object inputs, worker budgets, fill rules and source preservation](tr/boolean-preview.md)
- [S2D-5C Spline Chamfer: Point-mode bevels, exact curve trimming, preview and one Undo](tr/spline-chamfer.md)
- [S2D-5D Spline Fillet: radius-based tangent corners, bounded curve solving and one Undo](tr/spline-fillet.md)
- [OPT0 renderer baseline protocol, reproducible browser harness and measured results](tr/performance-baseline.md)
- [Frame layer indexing: snapshot ownership, renderer adapters and comparison protocol](tr/layer-indexing.md)
- MCP catalog and compatibility: [English](en/mcp.md) / [Türkçe setup, tools, limits and smoke tests](tr/mcp.md)
- [CLI lifecycle, skill distribution and maintainer packaging](tr/skills.md)
- [CLI commands and package README](../packages/cli/README.md)
- [Canonical authoring skill](../skills/chorono/SKILL.md)
- [Canonical setup skill](../skills/chorono-setup/SKILL.md)

- [Kutulu 3D ilk model/kamera dilimi: kullanım, mimari ve sınırlar](tr/boxed-3d-first-slice.md)
- [3D Render çalışma alanı ve yerel Chorono Render bağlantısı](tr/chorono-render-connection.md)
- [Ortak 3D İçerik Editörü: model kutusu, iç Timeline, 2D asset ve gelecek oyun runtime sınırı](tr/plans/boxed3d-isolated-editor.md)
- [Ortak öğe detay host'u: Shape/Poly, image/texture, video ve 3D adapter'ları; gelecek mod sınırları](tr/plans/shared-item-detail-editor.md)
- [Çalışan DET0–DET1: Shape/Path/model detay, taslak, revision, tek Undo ve kabul](tr/item-detail-editor.md)
- [Çalışan 3D-T0: ana/iç Timeline authoring context, exact key hedefleri, native/script/projection sözleşmesi](tr/timeline-authoring-context.md)
- [Çalışan 3D-T1: model detayında private klip, Keys/Curve, scoped Apply/Cancel ve tek Undo](tr/model-content-clips.md)
- [3D-T2 kabulü: dış kutu/iç klip, bağımsız örnekleme, scrub/loop ve gerçek PNG piksel eşliği](tr/model-clip-acceptance.md)
- [İç animasyon risk incelemesi: mevcut sınır, önceki plan ve bağımsız oynatma kabul kapısı](tr/plans/internal-animation-risk-review.md)
- [Animasyonlu komponent ve tür bazlı detay koordinasyon planı: izolasyon, iç klip, parametreli örnekler ve IA0–IA4 teslimi](tr/plans/item-owned-animation-plan.md)

- [3D0–3D6 model detay araçları: kaynak, UI, native klip, instance input ve kaynak ömrü](tr/model-detail-3d-packages.md)

- [MCP spline operations](tr/mcp-spline-editing.md): shared native plans, script scope and resource ownership.
- [Script API compatibility audit](tr/script-api-compatibility-audit.md): verified parity, fixes and intentional UI-only boundaries.
- [Complete 2D script coverage audit](tr/script-2d-coverage-audit.md): feature-by-feature source/API/host comparison, reproduced gaps and per-property evidence.
