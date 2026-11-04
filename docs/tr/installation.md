# Chorono'yu bilgisayara kurma

[Dokümantasyon](../README.md) · [English](../en/installation.md) · [Ajan skill'leri](agent-skills.md) · [Sorun giderme](troubleshooting.md)

Bu rehber tarayıcı editörünü, yerel MCP köprüsünü ve ajanın düzenlenebilir animasyonlar oluşturmasını sağlayan skill'leri kurar. Komutlar GitHub kaynak kodundan çalışır; Chorono CLI paketinin npm'de yayımlanmış olmasını gerektirmez.

## Gereksinimler

- **Node.js 20 veya üzeri** ve npm. `node --version` ve `npm --version` ile kontrol edin.
- Git. `git --version` ile kontrol edin.
- Güncel bir tarayıcı. WebGL2, GPU çizimini etkinleştirir.
- Ajanla kullanım için Codex, Claude Code veya Claude Desktop. Seçtiğiniz istemciyi ayrıca kurun.
- İlk kaynak kodu ve npm bağımlılığı indirmeleri için internet bağlantısı.

macOS/Linux'ta Terminal, Windows'ta PowerShell kullanın. Aşağıdaki komutlar her iki kabukta da çalışır. Boşluk içeren yolları tırnak içine alın. Harici ajanın MCP akışı için editöre sağlayıcı API anahtarı eklemek gerekmez; editörün kendi AI paneli ayrı, isteğe bağlı sağlayıcı ayarları kullanır.

## 1. Editörü indirin ve hazırlayın

Kaynak kodunu tutacağınız klasörde çalıştırın:

```sh
git clone https://github.com/codie1982/chorono-editor.git
cd chorono-editor
npm ci
npm run cli:build
npm run chorono -- setup
```

`cli:build`, asıl `skills/` dizininden CLI'nin skill paketini hazırlar. `setup` eksik MCP/editör çıktılarını derler, yerel köprü kimlik bilgilerini oluşturur, MCP istemcilerini ayarlar ve skill'leri kurar. Mevcut checkout ve istemci kayıtlarını korur. Bir istemci `stale` veya `unverified` görünüyorsa [sorun giderme](troubleshooting.md) rehberinden ilgili kaydı inceleyin.

Varsayılan kurulum üç MCP istemcisini de seçer. Tek istemci için yukarıdaki setup komutunun yerine şu alternatiflerden birini kullanın:

```sh
npm run chorono -- setup --agent codex
npm run chorono -- setup --agent claude-code
npm run chorono -- setup --agent claude-desktop
```

Yalnızca kullandığınız istemciye ait alternatifi çalıştırın. Codex ve Claude Code'a dosya tabanlı skill'ler kurulur. Claude Desktop'a MCP ayarı eklenir; skill içe aktarması kendi desteklediği yöntemle yapılır.

## 2. Başlatın ve bağlayın

```sh
npm run chorono -- start --background --open
```

Komutun yazdırdığı URL'yi açın; varsayılan adres `http://127.0.0.1:2000` olur. Editörde **MCP → Connect this editor** seçin. Kurulum istemci ayarlarını değiştirdiyse ajanın MCP bağlantılarını yeniden yükleyin veya yeni ajan oturumu açın. Tarayıcı sekmesini yenilediğinizde yeniden bağlanın.

```sh
npm run chorono -- doctor
```

Doctor; bağımlılıkları, derlemeleri, seçilen istemci ayarlarını, sunucu kimliğini ve bağlı editör sayısını kontrol eder. Hazır olana kadar çıkış kodu 1 döndürür. Tek istemci kurduysanız aynı seçimi kullanın; örneğin `npm run chorono -- doctor --agent codex`.

Ajandan `list_sessions`, `get_capabilities` ve `get_scene` araçlarını kontrol etmesini isteyin. HTTP sunucusunun çalışması, tarayıcının veya bu sohbetin bağlı olduğunu tek başına göstermez. Birden çok editör varsa doğru `sessionId` seçilmelidir.

## 3. İlk animasyonu oluşturun

Ajan istemcisinde şu isteği kullanabilirsiniz:

> Chorono ile 1920 × 1080 sahnede bir başlık ve üç daire oluştur. Ayrı giriş, döngü ve çıkış animasyonları ekle. Temsilî zamanlarda önizleme görsellerini kontrol et, sahneyi doğrula ve taşınabilir düzenlenebilir projeyi kaydet. Kaydedilen dosyanın yolunu bildir.

Ajan bağlantı işleri için `chorono-setup`, sahne üretimi için `chorono` skill'ini kullanır. Kaydedilen projeler `<animasyon-projesi>/projects/`, dışa aktarmalar `projects/exports/` altına gider. Sonradan düzenlemek için taşınabilir projeyi saklayın.

## Ayrı bir animasyon projesi kullanın

Yukarıdaki komutlar checkout'u animasyon projesi olarak da kullanır. Çalışmaları başka yerde tutmak için editör checkout'undan aşağıdaki komutları çalıştırın ve örnek yolu istediğiniz klasörle değiştirin:

```sh
npm run chorono -- setup --project "../my-animation" --agent codex
npm run chorono -- start --project "../my-animation" --background --open
npm run chorono -- doctor --project "../my-animation" --agent codex
```

Setup gerekirse proje klasörünü oluşturur; editör yolunu ve portunu `.chorono/installation.json` içinde hatırlar. Start, doctor ve stop komutlarına aynı proje yolunu verin. `--editor PATH` mevcut checkout'u açıkça seçer. Checkout bulunamazsa setup, `<proje>/.chorono/editor` altına editörü indirebilir; `--repo URL --ref BRANCH_OR_TAG` yeni indirmenin kaynağını seçer. Mevcut checkout'a otomatik pull/reset yapılmaz.

## Dosyalar nereye kurulur?

| Öğe | Varsayılan konum |
| --- | --- |
| Codex proje skill'leri | `<proje>/.agents/skills/` |
| Claude Code proje skill'leri | `<proje>/.claude/skills/` |
| Claude Code MCP ayarı | `<proje>/.mcp.json` |
| Codex MCP ayarı | `~/.codex/config.toml` veya ayarlanan `CODEX_HOME` |
| macOS Claude Desktop ayarı | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows Claude Desktop ayarı | `%APPDATA%/Claude/claude_desktop_config.json` |
| Linux için üretilen Claude Desktop ayar yolu | `~/.config/Claude/claude_desktop_config.json` |
| Üretilen MCP ayar örnekleri | `<editör>/.chorono/client-configs/` |
| Arka plan sunucu günlüğü | `<editör>/.chorono/editor.log` |

Bunlar CLI'nin ayar hedefleridir; ajan istemcisinin kendisini kurmazlar. Token ve ayar yedekleri `.chorono/` altındaki özel yerel dosyalardır; Git'e veya paylaşılan raporlara eklemeyin.

## Durdurma, yeniden başlatma ve derleme

```sh
npm run chorono -- stop
npm run chorono -- start --background --open
```

Stop yalnızca bu CLI'nin arka planda başlattığı, kimliği eşleşen süreci yönetir. Elle başlatılan Next sunucusunu kendi terminalinden durdurun. **Bağımlılık kurmadan veya derlemeden önce Next sunucusunu durdurun.** Ardından gerektiğinde:

```sh
npm run chorono -- setup --rebuild
```

Bağımlılıkların da yenilenmesi gerekiyorsa setup'a `--reinstall` ekleyin. Ayrı proje kullanıyorsanız `--project` yolunu da verin. CLI eşleşen sunucuyu yeniden kullanır; dolu porttaki başka bir servisin yerine geçmez.

Otomatik tanı için `npm run --silent chorono -- doctor --json` kullanın; npm'in silent seçeneği JSON çıktısına npm başlığı eklenmesini önler. Kurulu CLI ve yerel tarball kullanımı için [CLI paketine](../../packages/cli/README.md), paketleme için [dağıtım rehberine](skills.md) bakın.
