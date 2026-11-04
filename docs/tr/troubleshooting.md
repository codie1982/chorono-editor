# Kurulum ve MCP sorunlarını giderme

[Dokümantasyon](../README.md) · [English](../en/troubleshooting.md) · [Kurulum](installation.md) · [Ajan skill'leri](agent-skills.md)

Tanı komutunu editör checkout'undan çalıştırın. Setup sırasında kullandığınız `--project` ve `--agent` değerlerini koruyun:

```sh
npm run --silent chorono -- doctor --json
```

Doctor salt okunur çalışır ve hazır olana kadar çıkış kodu 1 döndürür. `checks`, `nextSteps` ve sunucunun `connectedEditors` sayısını inceleyin. Web sayfasının çalışması ve skill'in yüklenmesi tek başına sahne araçlarını kullanılabilir hale getirmez.

## Hangi adım eksik?

| Belirti veya bildirilen durum | Yapılacak işlem |
| --- | --- |
| `node`, `npm` veya `git` bulunamıyor | Gereksinimi kurup terminali yeniden açın; Chorono CLI Node.js 20+ ister |
| `Skill bundle missing` | Kaynak checkout'undan `npm run cli:build` çalıştırın |
| Bağımlılıklar veya derleme çıktıları eksik | Çalışan Next sunucusunu durdurun, sonra setup'ı yeniden çalıştırın |
| Setup dolu port nedeniyle derlemeyi reddediyor | Sunucuyu kendi terminalinden; CLI arka plan süreciyse CLI stop ile durdurun |
| Sunucu `offline` | `npm run chorono -- start --background --open` çalıştırın |
| Sunucu `disabled` veya `legacy-server` | Eski/elle başlatılmış sunucuyu durdurup MCP etkin CLI akışıyla başlatın |
| Sunucu `other-service`, `different-editor` veya `different-project` | Proje/editör/port seçimini kontrol edin; ilgisiz süreci sonlandırmayın |
| Sunucu `running`, `connectedEditors: 0` | Tarayıcıda **MCP → Connect this editor** seçin; her sayfa yenilemesinden sonra yeniden bağlanın |
| Sunucu `unpaired`, `unauthorized` veya `unreachable-bridge` | Yerel kurulumu, MCP etkin sunucuyu ve tarayıcı bağlantısını kontrol edin; nextSteps ve sunucu günlüğünü inceleyin |
| İstemci `stale` veya `unverified` | Mevcut Chorono kaydını üretilen ayar örneğiyle karşılaştırın; setup bu kaydı korur |
| Doctor hazır, fakat bu sohbette Chorono araçları yok | İstemcinin MCP bağlantılarını yeniden yükleyin veya yeni ajan oturumu açın; `list_sessions` kontrolü yapın |
| Skill `modified` veya `foreign` | Yerel değişiklikleri veya ilk kurulum aracını inceleyin; otomatik güncelleme kopyayı korur |

## Seçilen proje ve istemciyi kontrol edin

Yalnızca Codex kurduysanız sadece o istemciyi kontrol edin:

```sh
npm run --silent chorono -- doctor --project "../my-animation" --agent codex --json
```

Proje yolunu setup'ta kullandığınız yolla değiştirin. Doctor varsayılan olarak tüm istemcileri seçer; bu nedenle ayarlanmamış ek bir istemci, çalışan tek istemcili kurulumun hazır görünmesini engelleyebilir.

Setup, `<editör>/.chorono/client-configs/` altına `codex.toml`, `claude-code.json` ve `claude-desktop.json` örneklerini yazar. Chorono kaydındaki çalıştırılabilir dosya, köprü yolu, editör URL'si ve proje yolunu seçtiğiniz istemcinin ayarlarıyla karşılaştırın. İlgisiz kayıtları koruyun. Ayar konumları [kurulum rehberinde](installation.md) listelenir.

## Portu değiştirme

2000 portu başka servise aitse 1024–65535 arasında boş bir port seçin. Bu checkout'un yönetilen sunucusunu durdurduktan sonra:

```sh
npm run chorono -- setup --port 2345 --agent codex
npm run chorono -- start --port 2345 --background --open
npm run chorono -- doctor --port 2345 --agent codex
```

Port değişikliği mevcut istemci kaydını `stale` yapabilir. Yeniden üretilen ayar örneğiyle karşılaştırıp istemcinin MCP bağlantılarını yeniden yükleyin. Ayrı animasyon projesi için üç komuta da aynı `--project` yolunu ekleyin. Her checkout'un tek yönetilen sunucusu vardır; ikinci bağımsız sunucu için başka checkout kullanın.

## Kaynak değişikliğinden sonra yeniden derleme

Önce çalışan Next sunucusunu durdurun. CLI'nin yönettiği arka plan sunucusu için:

```sh
npm run chorono -- stop
npm run chorono -- setup --rebuild
npm run chorono -- start --background --open
```

Elle başlatılmış dev/production sunucusunu kendi terminalinden durdurun. Bağımlılıkların da yenilenmesi gerekiyorsa setup'a `--reinstall` ekleyin. Üretim yönergeleri değiştiyse setup veya skill güncellemesinden önce `npm run cli:build` ile skill paketini yeniden hazırlayın.

## Günlükler ve paylaşılabilecek tanı bilgileri

Arka plan sunucu günlüğü `<editör>/.chorono/editor.log` altındadır; başlatma hataları gerçek günlük yolunu da bildirir. Komutu, hatayı, seçilen proje/istemciyi, Node sürümünü, ilgili doctor durumlarını ve kısa ilgili günlük bölümünü paylaşın. `.chorono/mcp-token`, istemci ayar yedekleri ve ilgisiz kimlik bilgilerini gizli tutun.

npm komutu `@codie1982/chorono` paketini bulamıyorsa [GitHub checkout kurulumunu](installation.md) veya [dağıtım rehberindeki](skills.md) yerel CLI tarball'ını kullanın; yerel paketleme npm yayını oluşturmaz. Protokol kontrolleri ve araç sınırları için [MCP referansına](mcp.md) bakın.
