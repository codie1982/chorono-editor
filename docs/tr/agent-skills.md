# Chorono ajan skill'leri

[Dokümantasyon](../README.md) · [English](../en/agent-skills.md) · [Kurulum](installation.md) · [Sorun giderme](troubleshooting.md)

Skill, ajanın bir görev için yükleyebildiği yönerge ve başvuru dosyaları klasörüdür. Chorono iki skill sunar. Canlı editör araçlarını MCP sağlar; yerel yazılımı CLI kurar ve başlatır.

## İki skill'in görevi

| Skill | Kullanım amacı | Ana yönergeler |
| --- | --- | --- |
| `chorono-setup` | Kurulum, başlatma/durdurma, MCP istemci ayarları, hazırlık kontrolü ve skill yönetimi | [SKILL.md](../../skills/chorono-setup/SKILL.md) |
| `chorono` | Düzenlenebilir 2D sahneler, katmanlar, keyframe'ler, çoklu animasyon, parçacıklar, etkileşim, önizleme ve proje kaydı | [SKILL.md](../../skills/chorono/SKILL.md) |

Tam akış için ikisini birlikte kurun. Editör zaten bağlıysa ajan doğrudan üretim skill'ini kullanabilir.

## Kaynak yapısı

```text
skills/
├── chorono-setup/
│   ├── SKILL.md
│   └── agents/openai.yaml
└── chorono/
    ├── SKILL.md
    ├── agents/openai.yaml
    └── references/
        ├── connection.md
        ├── animation.md
        ├── interaction.md
        └── media-and-output.md
```

`SKILL.md`; skill adını, açıklamasını ve çalışma yönergelerini taşır. `agents/openai.yaml` istemciye yönelik üst verileri sağlar. Üretim skill'inin referansları [bağlantı](../../skills/chorono/references/connection.md), [animasyon](../../skills/chorono/references/animation.md), [etkileşim](../../skills/chorono/references/interaction.md) ve [medya/çıktı](../../skills/chorono/references/media-and-output.md) konularını ayırır; ajan göreve uygun ayrıntıyı okur.

Asıl düzenlenebilir kaynaklar `skills/` altındadır. `npm run cli:build` bunları `packages/cli/skills/` içine kopyalar ve dağıtım için SHA-256 manifesti üretir. Üretilen klasör elle düzenlenmez.

## Chorono CLI ile kurulum

[Tam kurulum](installation.md), seçilen Codex/Claude Code istemcileri için skill'leri zaten kurar. Yalnızca skill kurmak için checkout içinden:

```sh
npm run cli:build
npm run skills -- list
npm run skills -- install --dry-run
npm run skills -- install
npm run skills -- check
```

Bu skill komutları yerel paketi kullanır; npm veya GitHub'dan daha yeni kopya indirmez. `--dry-run`, kurulum yapmadan planlanan değişiklikleri gösterir.

| Kapsam | Codex | Claude Code |
| --- | --- | --- |
| Proje, varsayılan | `<proje>/.agents/skills/` | `<proje>/.claude/skills/` |
| Kullanıcı, `--global` | `~/.agents/skills/` | `~/.claude/skills/` |

Bir istemci, mevcut proje veya belirli skill seçebilirsiniz:

```sh
npm run skills -- install --agent codex
npm run skills -- install --project "../my-animation" --agent claude-code
npm run skills -- install --global --agent codex --skill chorono --skill chorono-setup
```

İki dosya tabanlı istemci için `--agent all` kullanın. `--global` ve `--project` birlikte kullanılamaz. `skills install` mevcut bir proje klasörü ister; tam `setup --project` bu klasörü oluşturabilir. Claude Desktop'ın MCP ayarı, bu dosya tabanlı skill dizinlerini yüklediği anlamına gelmez.

## Alternatif: yönergeleri GitHub'dan kurma

Üçüncü taraf [skills CLI](https://github.com/vercel-labs/skills) ve Node.js 22.20+ ile animasyon projenizin içinde çalıştırın:

```sh
npx skills add codie1982/chorono-editor --skill chorono --skill chorono-setup -a claude-code -a codex --copy
```

Kullanıcı genelinde kurulum için `-g` ekleyin. `--copy`, dosyaların kopyalanmasını seçer. Aracın [kurulum seçeneklerine](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) bakabilirsiniz. Bu yöntem yönergeleri kurar; sahne araçlarını kullanmak için [editör ve MCP kurulumunu](installation.md) da tamamlayın.

Belirli bir kopyayı hangi araç kurduysa onunla yönetmeye devam edin. Chorono CLI, `.chorono-skill.json` üst verisi bulunmayan kopyaları, başka araçla kurulmuş olanlar dahil, `foreign` sayar ve korur. Chorono CLI sembolik bağlantı hedeflerine yazmayı reddeder.

## Güncelleme ve durum kontrolü

İstenen kaynak sürümünü edindikten sonra paketi yeniden üretip güncelleyin:

```sh
npm run cli:build
npm run skills -- check
npm run skills -- update --dry-run
npm run skills -- update
```

| Durum | Anlamı / sonraki adım |
| --- | --- |
| `current` | Bu CLI paketindeki içerikle eşleşir |
| `missing` | Skill'i kurun |
| `different` | Başka paket sürümünden, değiştirilmemiş yönetilen kopya; update kullanın |
| `modified` | Yerel değişiklik var; inceleyin ve koruyun |
| `foreign` | Bu CLI'nin yönetmediği kopya; kurulum kaynağını inceleyin |

`check`, çalışan paketin manifestiyle karşılaştırır; npm latest sorgulamaz. `update`, değiştirilmiş veya başka araçtan gelen kopyaları korur. Belirli çakışmayı inceledikten sonra install/update üzerinde `--force` kullanılırsa değiştirilen klasör `<kapsam>/.chorono/skill-backups/` altına yedeklenir. İlgisiz skill'ler silinmez.

Kurulum veya güncellemeden sonra yeni ajan oturumu açın. İstemcinin skill'leri ve MCP araçlarını yüklediğini doğrulayın; bir skill klasörü tek başına açık sohbete araç kaydedemez.

## Skill'leri kullanma

Kurulum için “chorono-setup kullanarak bu animasyon projesini hazırla, editörü başlat ve MCP bağlantısını kontrol et” diyebilirsiniz. Üretim için “chorono kullanarak bir başlık ve şekilleri hareketlendir, önizleme karelerini incele ve düzenlenebilir projeyi kaydet” isteğini verin.

Üretim akışı sahneyi ve yetenekleri okur, ilgisiz içeriği korur, revision kontrolü uygular, dry-run script planını yeniden çalıştırmadan commit eder, gerçek önizleme görsellerini inceler, doğrular ve kaydeder. Script'ler izole MCP köprüsünde çalışır. Teknik ayrıntılar için [MCP referansına](mcp.md) ve [bakımcı dağıtım rehberine](skills.md) bakın.
