# Chorono ajan kurulumu ve skill dağıtımı

Kullanıcı rehberleri: [Bilgisayara kurulum](installation.md) · [Skill yapısı ve kurulumu](agent-skills.md) · [Sorun giderme](troubleshooting.md) · [Tüm dokümantasyon](../README.md). Bu sayfa CLI yaşam döngüsü ve bakımcı dağıtım ayrıntılarını da içerir.

Chorono'nun editörü, MCP sunucusu, skill kaynakları ve CLI'si aynı repoda yönetilir. Kök Next.js paketi `private:true` kalır; `packages/cli` altındaki `@codie1982/chorono` bağımsız yayımlanır. Güncel yerel paket sürümü `0.2.0`'dır. npm hesabının bu scope üzerindeki yetkisi yayın öncesinde doğrulanmalıdır.

## Bir ajandan kurulum ve animasyon üretimi

Node.js 20+ kullanın. Sıfırdan editör indirmek için Git de gerekir. Kaynak repo içinden:

```sh
npm ci
npm run cli:build
npm run chorono -- setup
npm run chorono -- start --background --open
npm run chorono -- doctor
```

Tarayıcıda dönen URL'yi açın ve **MCP → Connect this editor** seçin. İstemcinin MCP bağlantılarını yeniden yükleyin veya yeni ajan oturumu açın. Sonra örneğin:

> Chorono ile yazı ve dairelerden bir sahne oluştur. Giriş, döngü ve çıkış animasyonlarını ekle. Önizlemeleri kontrol edip düzenlenebilir projeyi kaydet.

Skill, ajana bu akışı nasıl yürüteceğini öğretir; terminal kurulum/başlatmayı, MCP araçları sahne işlemlerini yapar. Skill dosyalarını kurmak tek başına sunucu başlatmaz veya açık sohbete yeni araç yüklemez.

## CLI komutları

| Komut | Davranış |
| --- | --- |
| `setup` | Editörü bulur/indirir, eksik bağımlılıkları kurar, eksik çıktıları derler, istemci ayarlarını ve skill'leri hazırlar |
| `start --background --open` | Editörü yerel adreste arka planda çalıştırır ve tarayıcıyı açar |
| `doctor --json` | Kurulum, derleme, istemci ayarları, sunucu kimliği ve bağlı editör sayısını salt okunur kontrol eder |
| `stop` | Yalnızca CLI'nın arka planda başlattığı ve kimliği doğrulanan süreci durdurur |
| `skills list/install/update/check` | Paketteki sürümlenmiş skill'leri yönetir |

Kurulum varsayılan olarak çalışma klasörünü animasyon projesi kabul eder. `--project /tam/yol` başka bir projeyi seçer; setup gerekirse klasörü oluşturur. Editör yolu önce `--editor`, sonra kaydedilmiş proje ayarından, ardından üst dizinlerdeki mevcut checkout'tan bulunur. Hiçbiri yoksa `<proje>/.chorono/editor` altına klonlanır. Proje bu editör yolunu ve portu `.chorono/installation.json` içinde hatırlar. Mevcut checkout'a otomatik pull/reset yapılmaz.

```sh
# Mevcut editörü başka bir animasyon projesinde kullan
npm run chorono -- setup --editor /tam/yol/chorono-editor --project /tam/yol/video --agent claude-code
npm run chorono -- start --project /tam/yol/video --background --open
npm run chorono -- doctor --project /tam/yol/video --agent claude-code --json
```

`--port 2345`, 1024–65535 arasında farklı bir loopback portu seçer; istemci ayarları da aynı URL ile üretilir. Başka bir servis veya farklı editör o portu kullanıyorsa üzerine geçilmez. Editörün sağlıklı HTTP yanıtı vermesi, bir sekmenin MCP'ye bağlandığı anlamına gelmez. Doctor, araçlar için hazır olana kadar çıkış kodu 1 döndürür ve eksik adımı açıklar; sahneyi değiştirmez.

`start` varsayılan ön planda çalışır. Ajanlar terminali meşgul etmemek ve JSON almak için `start --background --json` kullanmalıdır. JSON stdout'a, kurulum/derleme ilerlemesi stderr'e yazılır. npm scripti üzerinden JSON okurken npm başlığını kaldırmak için `npm run --silent chorono -- doctor --json` kullanın. Her checkout için bir yönetilen sunucu tutulur; port/proje değiştirirken önce durdurun veya ayrı checkout kullanın. Arka plan sunucu kaydı `.chorono/server.json`, günlük `.chorono/editor.log` altında tutulur. Stop yalnızca bu kayıt, çalışan PID ve editör kimliği eşleşirse sinyal gönderir; elle başlatılan sunucu kendi terminalinden durdurulur.

Derleme ve bağımlılık yenilemeden önce Next sunucusunu durdurun:

```sh
npm run chorono -- stop
npm run chorono -- setup --rebuild
# Gerektiğinde bağımlılıkları da yeniden kur
npm run chorono -- setup --reinstall
```

## İstemciler ve dosyalar

`setup --agent codex|claude-code|claude-desktop|all` istemci seçer; varsayılan `all` üç MCP istemcisini kapsar. Claude Code için proje `.mcp.json`, Codex ve Claude Desktop için kullanıcı ayarları hazırlanır. İlgisiz ayarlar korunur ve ekleme yapılmadan önce mevcut dosya özel bir yedeğe alınır. Var olan `chorono` kaydı değiştirilmez; `stale` veya `unverified` ise üretilen snippet ile gözden geçirilmelidir. `--no-clients` yalnızca snippet üretir; `--no-skills` skill kurulumunu atlar.

Skill'ler Codex için proje `.agents/skills`, Claude Code için `.claude/skills` altına kurulur. Claude Desktop MCP desteği, bu klasörlerden skill yüklediği anlamına gelmez. Desktop/Cowork için desteklenen skill/plugin içe aktarması ayrıca uygulanır. Kaynaklar: [Codex skill konumları](https://learn.chatgpt.com/docs/build-skills), [Claude Code skill konumları](https://code.claude.com/docs/en/skills).

Kaydedilen taşınabilir projeler seçilen animasyon projesinin `projects/` dizinine, çıktılar `projects/exports/` altına gider. Token, istemci ayar yedekleri ve kurulum durumu `.chorono/` altında kalır; Git'e/npm'e eklenmez. Yerel MCP için model sağlayıcı API anahtarı gerekmez. Ayrıntılı araç kapsamı ve sınırlar için [MCP rehberine](mcp.md) bakın.

## Dağıtım

Skill kaynakları `skills/`, npm CLI'si `packages/cli` altındadır. Böylece MCP API'si ve onu kullanan skill aynı değişiklikte güncellenebilir. Başka bir Git reposu gerekmez.

Yalnızca skill kurmak için Chorono npm paketinin yayımlanması gerekmez. Üçüncü taraf [skills CLI](https://github.com/vercel-labs/skills) güncel sürümünde Node.js 22.20+ ister:

```sh
npx skills add codie1982/chorono-editor --skill chorono --skill chorono-setup -a claude-code -a codex --copy
```

Skill içindeki ajan kurulum adımlarını mevcut checkout, yerel CLI tarball'ı veya yayımlanmış npm paketiyle yürütebilir. Paket henüz npm'de yoksa registry komutları kullanılamaz. Taze editör klonunun MCP/CLI değişikliklerini içeren GitHub branch/tag'inden gelmesi gerekir; farklı bir kaynak için `--repo URL --ref BRANCH_OR_TAG` kullanın. Eski MCP'siz checkout açık hata verir. Başka araçla kurulmuş skill kopyaları Chorono CLI tarafından `foreign` olarak korunur; aynı kopyayı ilk kuran araçla yönetmeye devam edin.

npm yayını sonrası:

```sh
npx --package @codie1982/chorono@latest chorono setup --project ./video
npx --package @codie1982/chorono@latest chorono start --project ./video --background --open
npx --package @codie1982/chorono@latest chorono doctor --project ./video
```

## Skill güncellemeleri

`chorono` sahne ve animasyon üretimini, `chorono-setup` kurulum ve bağlantıyı öğretir. Kaynaklar `skills/` içindedir; `packages/cli/skills` üretilen kopyadır.

```sh
npm run skills -- list
npm run skills -- install --dry-run
npm run skills -- install
npm run skills -- check
npm run skills -- update
```

Skill komutlarında `--global` kullanıcı ev dizinini, `--project` başka bir mevcut projeyi, `--agent codex|claude-code|all` ajanları, tekrarlanabilen `--skill NAME` skill'leri seçer. `--json` makine çıktısı verir.

`install` mevcut kopyaları korur. `update` bu yayıncıdan gelen değiştirilmemiş kopyaları yeniler; kurulum akışındaki setup da bu yöntemi kullanır. `check`, kurulu dosyaları çalışan paket sürümünün SHA-256 manifestiyle karşılaştırır; npm latest kontrolü yapmaz. `--dry-run` hiçbir dosya yazmaz. Değiştirilmiş/yabancı skill varsa yazma öncesi tüm seçim kontrol edilir ve çakışma raporlanır. `--force` ancak içeriği inceledikten sonra kullanılmalıdır; değiştirilen klasörler önce `.chorono/skill-backups/` altına yedeklenir. Başka skill'ler silinmez ve symlink hedeflere yazılmaz.

Skill kurulum komutları ağdan içerik çekmez; skill'ler paketle birlikte gelir. `setup` ise gerekirse Git'ten editör ve npm'den editör bağımlılıklarını indirir. Yeni skill içeriği için daha yeni CLI paketi veya kaynak checkout gerekir.

## Bakımcı doğrulaması ve paketleme

```sh
npm run cli:build
npm run cli:test
npm test
npm run mcp:build
# Çalışan Next sunucusunu durdurduktan sonra
npm run build
npm run cli:pack
```

Tarball `.chorono/packages/codie1982-chorono-0.2.0.tgz` altında üretilir. CLI, skill'ler, manifest, README ve MIT lisansı npm `files` izin listesiyle paketlenir. Editör kaynakları, `.env`, projeler, token, yerel ayarlar ve `node_modules` pakete girmez.

Yerel tarball ile:

```sh
npx --package /tam/yol/codie1982-chorono-0.2.0.tgz chorono setup --editor /tam/yol/chorono-editor --project /tam/yol/video
```

Sürüm `packages/cli/package.json` içinde artırılır; kök kilit dosyası `npm install --package-lock-only --ignore-scripts` ile güncellenir. Yayın hesabı ve paket adı doğrulandıktan sonra, npm yayını ayrıca istenmişse:

```sh
npm publish --workspace @codie1982/chorono --access public
```

Yerel paketleme npm'de herkese açık sürüm oluşturmaz.
