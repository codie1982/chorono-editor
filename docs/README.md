# Chorono documentation / Dokümantasyon

[Repository home](../README.md) · [CLI package](../packages/cli/README.md)

## Releases / Sürümler

- [v0.2.0 release notes](releases/v0.2.0.md) / [Türkçe sürüm notları](tr/releases/v0.2.0.md)
- [v0.2.0 validation and measurement scope](releases/v0.2.0-validation.md)
- [Changelog](../CHANGELOG.md)
- [Current 2D / 2.5D roadmap](tr/production-2d-roadmap.md)

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
| SDKs / SDK'lar | [SDKs](en/sdks.md) | [SDK'lar](tr/sdks.md) |

## Technical references / Teknik kaynaklar

Local evidence linked under `artifacts/` (benchmark reports, recordings and renders) is intentionally ignored by Git and is not included in a fresh clone. The benchmark protocol and harness are versioned; reproducing measurements requires the portable fixtures described in the protocol. `outputs/` and `design-mockups/` are also local-only; curated distributable examples live in `examples/`.

`artifacts/` bağlantılarındaki yerel kanıtlar (ölçüm raporları, kayıtlar ve render çıktıları) Git dışında tutulur; yeni klonlarda bulunmaz. Ölçüm protokolü ve araçları sürümlenir; tekrar ölçüm için protokolde açıklanan portable sahneler gerekir. `outputs/` ve `design-mockups/` da yereldir; dağıtılabilir örnekler `examples/` altında tutulur.

- [Software engineering standards: SOLID, modules, reuse, documentation and handoff](../AGENTS.md#software-engineering-standards)
- [Render resource ownership, shared mask/effect scratch pipeline and native regression checks](tr/render-resource-management.md)
- [OPT0 renderer baseline protocol, reproducible browser harness and measured results](tr/performance-baseline.md)
- [Frame layer indexing: snapshot ownership, renderer adapters and comparison protocol](tr/layer-indexing.md)
- MCP catalog and compatibility: [English](en/mcp.md) / [Türkçe setup, tools, limits and smoke tests](tr/mcp.md)
- [CLI lifecycle, skill distribution and maintainer packaging](tr/skills.md)
- [CLI commands and package README](../packages/cli/README.md)
- [Canonical authoring skill](../skills/chorono/SKILL.md)
- [Canonical setup skill](../skills/chorono-setup/SKILL.md)
