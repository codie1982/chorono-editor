# Claude ve Codex için Chorono MCP

MCP 2.1.0: varsayılan `standard` keşif kataloğu 40 ortak aracı yayımlar.
Eski 77 araç adı çağrılabilir kalır; domain payload/çıktı davranışları korunur. Source mutasyonları artık aşağıdaki zorunlu okuma alanlarını taşır.
Güncel adlar, keşif ve geçiş aşağıdadır. [English catalog guide](../en/mcp.md).

Chorono MCP, STDIO üzerinden standart MCP konuşan yerel bir sunucudur. Claude Desktop, Claude Code ve Codex aynı editör bağlantısını kullanabilir. Ayrıca bir model API anahtarı gerekmez: model istemcide çalışır, MCP editörde araçları yürütür.

## Kurulum

CLI ile kurulum ve başlatma:

```sh
npm ci
npm run cli:build
npm run chorono -- setup
npm run chorono -- start --background --open
npm run chorono -- doctor
```

CLI editörü bulur veya indirir, eksik bağımlılık/derlemeleri ve istemci ayarlarını hazırlar. `doctor`, çalışan sunucu ile gerçekten bağlı editör sekmesini ayrı kontrol eder. Ayrıntılı proje/istemci seçimi, skill dağıtımı ve npm yayın durumu için [kurulum rehberine](skills.md) bakın. Aşağıdaki komutlar manuel kurulum alternatifi olarak kullanılabilir.

Node.js 20 veya üzeri kullanın. Proje kökünde:

```sh
npm ci
npm run mcp:build
npm run build
npm run mcp:setup
npm run start:mcp
```

Geliştirirken üretim sunucusunu durdurup `npm run dev:mcp` kullanabilirsiniz. Next build ile dev sunucusunu aynı anda çalıştırmayın.

`http://127.0.0.1:2000` adresini açın. Üst araç çubuğundaki **MCP → Connect this editor** bağlantısını etkinleştirin. Sayfa yenilenirse tekrar bağlayın.

`mcp:setup`, bu bilgisayar için doğru Node ve dosya yollarıyla `.chorono/client-configs/` altında Claude Desktop JSON, Claude Code JSON ve Codex TOML üretir. `npm run mcp:setup -- --install`, mevcut ayarları yedekleyip koruyarak Claude Desktop ve Codex kullanıcı ayarlarına, Claude Code için de proje `.mcp.json` dosyasına `chorono` ekler; mevcut bir `chorono` kaydını değiştirmez. İstemciyi yeniden başlatın veya MCP bağlantılarını yeniden yükleyin.

Claude Code için üretilen JSON'u proje `.mcp.json` dosyanıza birleştirin veya `claude mcp add --transport stdio chorono -- /tam/node/yolu /tam/proje/yolu/dist/mcp/server.cjs` kullanın. Codex kaydı `[mcp_servers.chorono]` bölümünde `command`, `args`, `startup_timeout_sec` ve `tool_timeout_sec` içerir.

## Araç kapsamı

Claude Code ve Codex için araç kullanım iş akışları ayrıca `skills/` altında dağıtılır. Skill kurulum CLI'si, yerel deneme ve npm paketleme için [skill rehberini](skills.md) okuyun. Skill kurulumu bu MCP bağlantısının yerine geçmez.

Sunucu aynı ActionRegistry/domain komutlarını kullanır. Varsayılan STDIO
`tools/list` yüzeyi sık kullanılan 40 aracı gösterir; uzman eylemler tekil şema
keşfi ve `batch_actions` ile kullanılabilir. Bu ayrım katman/kompozisyon,
keyframe/timeline, clone/array, spline/path, particle ve state-machine
kabiliyetlerini kaldırmaz. Yeni istemciler aşağıdaki tercih edilen adları kullanır:

| Alan | Araçlar |
| --- | --- |
| Keşif | `list_sessions`, `get_capabilities`, `get_scene`, `list_layers`, `get_layer`, `list_timelines`, `get_timeline`, `list_assets`, `validate_scene` |
| Nesneler | `create_layer`, `update_layer`, `delete_layer`, `clone_layer`, `array_layer`, `group_layers`, `ungroup_layer`, `update_composition`, `import_asset` |
| Animasyon | `create_timeline`, `update_timeline`, `upsert_keyframes` |
| Script | `run_script`, `apply_script_plan`, `batch_actions` |
| İzleme | `render_preview`, `evaluate_frame`, `control_playback`, `control_runtime`, `get_runtime`, `undo`, `redo` |
| Dosyalar | `save_project`, `list_projects`, `load_project`, `export_runtime`, `export_svg`, `export_sequence` |
| Ses | `get_audio_state`, `render_audio_preview`, `export_audio` |

### Keşif ve uzman araçlar

İlk keşifte `get_capabilities({summary:true})` kullanın. Bu hafif yanıt sürüm,
katalog metadatası, tür adları, preset'ler, limitler ve çıktı kapsamını verir;
bütün araç/özellik şemalarını ve script yardımını taşımaz. Authoring için
`chorono://scripting` kaynağını okuyun. Tek bir native şema gerektiğinde
`get_capabilities({toolName:'configure_particles'})` isteyin; `toolName` ve
`summary:true` aynı çağrıda kullanılmaz.

Tek araç sonucu tam şemayı, implementation/canonical adı, yayımlanma bilgisini
ve `callableInBatch` değerini verir. Değer true ise adı ve argümanları
`batch_actions` içine koyun. Keşif istemcinin araç listesine dinamik araç eklemez.
Salt okuma, dosya ve playback/runtime taşıma araçları mutasyon batch'ine giremez.
`add_spline`, `configure_particles`, `update_track`, `bake_track` ve native ses
klibi düzenlemeleri bu uzman mutasyon yolunu kullanabilir; scriptte aynı domain
işlemleri de vardır.

`get_capabilities({})` eski kapsamlı yanıtı korur: `tools` eski 77 aracın
uyum envanteridir; bütün katman property şemaları ve script API'si de döner.
Bu listeyi istemcinin güncel doğrudan tool listesi sanmayın. Katalog bilgisi
`catalog: {version:1,profile,advertisedToolNames,aliases}` alanındadır;
alias girdileri `{name,implementationName}` biçimindedir. `chorono://capabilities`
ve `chorono://sessions` kaynakları ile `animate_scene` istemi de vardır.

### Adlar ve geriye uyum

| Tercih edilen ad | Eski implementation adı | Korunan anlam |
| --- | --- | --- |
| `create_layer` | `create_object` | Registry `kind` ve isteğe bağlı Layer patch'i. |
| `get_layer` | `describe_layer` | Tek katmanın biçimlendirilmiş özeti; tam nested model değildir. |
| `get_timeline` | `describe_timeline` | Tek timeline'ın track/key ayrıntıları. |
| `upsert_keyframes` | `set_keyframes` | Açık timeline/layer/property adresinde key ekle/güncelle; tüm track'i değiştirmez. |
| `replace_layer_fields` | `patch_object` | Verilen nested nesneyi tümüyle değiştiren shallow işlem. Deep merge değildir. |
| `evaluate_timeline_values` | `evaluate_at_time` | Yalnız timeline değerlendirmesi; `evaluate_frame` ile aynı kapsam değildir. |
| `create_state_machine_state` | `add_sm_state` | State ekleme. |
| `create_state_machine_transition` | `add_sm_transition` | Transition ekleme. |
| `set_state_machine_initial_state` | `set_initial_state` | Makinenin ilk state'ini seçme. |

Yeni adların hepsi varsayılan doğrudan listede değildir; uzman şeması üzerinden
batch desteği kontrol edilir. `get_scene` revision/bağlamlı ana okuma yoludur;
eski `get_scene_json` yalnız JSON döndürmeye devam eder. `add_keyframes` eski
target adresi ve timeline auto-create davranışını korur; `upsert_keyframes`
ile aynı input değildir. E−1.4 ile aynı zamandaki upsert mevcut key ID, tangent,
segment ayarları ve belirtilmeyen easing'i korur. Explicit easing onu değiştirir;
yeni key varsayılanı linear'dır. Eşitlik toleransı `1e-6 ms`; yakın fractional
key'ler ayrı kalır, belirsiz çakışık key'ler reddedilir. Bu işlem driven kanalı
bake etmez; editördeki Set Key ayrı bir MCP aracı değildir.

Efekt, maske, particle veya spline verisini koruyarak değiştirmeden önce tam
`get_scene` snapshot'ını veya script `layer.data` kaydını okuyun. `get_layer`
özeti bu nested verinin tümünü içermez; ondan tam bir kayıt yeniden kurulmaz.

Doğrudan eski araç listesini bekleyen istemcide STDIO sunucusunun ortamına
`CHORONO_MCP_TOOL_PROFILE=legacy` verin ve MCP bağlantısını yeniden yükleyin.
`legacy`, iyileştirilmiş açıklama/şemalarla eski 77 adı yayımlar; `standard`
varsayılandır. Geçersiz profil başlangıç hatasıdır. Tarayıcı/Next ortamını
değiştirmek tek başına STDIO istemci kataloğunu değiştirmez. Daha önce açık
bağlantılar yeni build/profili görmek için yeniden bağlanmalıdır.

Eski adlar her iki profilde de sunucuda çözümlenir; payload, çıktı ve eski
varsayılanları korunur. Aynı retry'da araç adı, argüman ve `requestId` aynı
kalmalıdır. Yeni ad seçmek eski belirsiz isteğin tekrarı sayılmaz. Profil
daraltılması mevcut source revision/aktif drag/dry-run/tek undo korumalarını
atlayan bir yol oluşturmaz. **2.0.0 ile source düzenleme çağrıları bilinçli
olarak değişmiştir:** editörü yeniden derleyip başlatın ve STDIO istemcisini yeniden
bağlayın. Eski ad/profil zorunlu yetkilendirmeyi atlayamaz; scene JSON değişmez.

Her source mutasyonundan önce aynı MCP bağlantısı ve editörde `get_scene` okuyun.
Dönen `revision` değerini `expectedRevision`, tek kullanımlık `readToken` değerini
aynı adlı alana koyun. Token beş dakika geçerlidir; gerçek istemci bağlantısı,
editör session, document epoch ve revision'a bağlıdır. `get_layer` gibi kısmi
okumalar yetki vermez. İşlem başarılı olsa da sonraki yazma için yeniden okuyun.
Çakışmada mevcut elle değişiklikleri okuyup isteği uyarlayın; eski tam sahne
payload'una yalnızca yeni revision yazıp göndermeyin.

`batch_actions` dış çağrısı tek `expectedRevision`/`readToken`/`requestId` taşır.
Alt işlemler için `get_capabilities({toolName})` içindeki `batchInputSchema`
kullanılır. `run_script` dry-run normal okuma token'ını tüketir; yeni plan-bound
`readToken`, `revision` ve `planId` döndürür. `apply_script_plan` bunları kullanır,
script yeniden çalıştırılmaz. Sonraki okumalar ayrılmış plan yetkisini bozmaz;
araya source değişikliği veya belge değiştirme girerse plan reddedilir.

Aynı bağlantıda transport tekrarında aynı araç adı, **aynı token dahil aynı
argümanlar** ve sabit `requestId` kullanılır. Editör başına en fazla 64 sonuç
saklanır; istemciler kimlikle ayrılır. Bağlantı yenilendiyse önce sahneyi okuyup
sonucu kontrol edin. Token'ları sahne JSON'una, kalıcı kayda veya loglara yazmayın.
Eksik/eski/kullanılmış okuma, document değişimi ve aktif drag durumları
`code/message/recovery` içeren yapılandırılmış hatalar döndürür. Son browser CAS
kontrolü, broker kabulünden sonra araya giren elle düzenlemeyi de korur.

Native source komutları, script, project load, import, normalize ve undo/redo
bu kapsamdadır. Okuma, runtime/playback, preview/export ve dosyaya kaydetme source
yazmaz; token gerekmez. Commit yanıtı sınırlı `changeSummary` döndürür;
`truncated:true` tam liste olmadığını belirtir. E−1.2 attribution artık uygulanmıştır; aşağıdaki kaynak kökeni sözleşmesine bakın.

`normalize_audio_clip` native batch eylemi değildir (`callableInBatch:false`);
legacy katalogda doğrudan çağrılır. Script API eşdeğer peak ölçümü sağlamaz.

Script ile sahne tasarımı için `scene.snapshot()` tam sahneyi; `layer.data` katmanın tamamını; `layer.get(path)` tek alanı bağımsız veri kopyası olarak okur. `layer.patch(partial)` iç içe ayarları birleştirir; `Layer.set` eski nesne değiştirme davranışını korur. `scene.useTimeline(id)` hem Layer.key hem clone/array animasyon kopyalarının hedefini belirler. Mevcut state machine ve etkileşim kayıtlarının CRUD metotları ile native ses klibi yardımcıları da script içinde kullanılabilir. Renk kanalları ve Vec2 interpolate edilir; metin/boolean key sınırında değişir. Çizim öncesi uygulanan animasyon verisi particle, repeater, shape, tipografi, efekt ve maskeleri kapsar. Kesin imzalar, örnekler ve sınırlar için [betikleme rehberini](scripting.md) okuyun; IO, önizleme ve kayıt ayrı MCP araçlarıdır.

`replace_layer_fields` (eski `patch_object`) ile Layer modelinin effects, masks,
typography, geometry, repeater ve diğer alanlarına erişilir. İç içe nesneler
değiştirilir; kısmi iç içe güncellemelerde mevcut alanları koruyun. Recursive
merge için script `layer.patch` kullanın. Uzman `update_track`
easing/timeWarp/multiplier eğrilerini, outOfRange davranışını, modifier listesini
ve waveform/noise controller'ı yönetir.

## Güvenli ve tutarlı düzenleme

- Editörde bağlantı açıkça etkinleştirilir. Yerel servis yalnızca loopback arayüzünde çalışır; Host, Origin, JSON içerik türü ve token doğrulanır. Köprü normal başlangıçta kapalıdır.
- Scriptler QuickJS WASM içinde çalışır. Node, require, ağ, DOM ve dosya erişimi verilmez. Süre, bellek, komut, nesne ve keyframe sınırları vardır. Hata halinde sahne uygulanmaz.
- `run_script({code,dryRun:true,expectedRevision,readToken})`, beş dakika geçerli `planId`, yeni plan-bound `readToken` ve `revision` üretir. `apply_script_plan` aynı sahneyi tekrar script çalıştırmadan uygular. Üretilen nesne kimlikleri korunur.
- Mutasyonlar bir geri alma adımıdır. `batch_actions` içindeki hata tüm grubu iptal eder. Batch içine script veya dosya/köprü araçları konulamaz.
- İstemciler aynı sekmedeki kuyruğu paylaşır. `get_scene` sonucundaki `revision` ve `readToken` değerlerini bir sonraki source çağrısına `expectedRevision` ve `readToken` olarak verin; her yeni yazma öncesi yeniden okuyun. Elle düzenleme veya başka istemciyle çakışma sessizce üzerine yazılmaz. Yeniden denenecek mutasyonlar için sabit `requestId` kullanın; farklı içerikle aynı id reddedilir.
- Kaynak sahnede isteğe bağlı `editorGuides` (version 1) varsa mevcut cetvel/guide düzenini koruyun. Portable JSON bu editör verisini saklar; final render/runtime çizimine katılmaz. Scene JSON değiştirme işlemleri sürüm, benzersiz ID, eksen ve sonlu konum doğrulamasından geçer. Bu alan için yeni bir MCP authoring metodu eklenmemiştir; [viewport guide sözleşmesine](viewport-layout-editing.md) bakın.
- Birden fazla sekme açıksa `list_sessions` ile `sessionId` seçilir. Sürükleme işlemi devam ederken MCP mutasyonları reddedilir.

## Çoklu timeline script örneği

```js
scene.composition({width:1080,height:1920,durationMs:5000});
const intro = scene.createTimeline({id:'intro',durationMs:2000});
const ball = scene.add('circle');
ball.set({name:'Hero'});
ball.pos = [100,400];
intro.key(ball,'transform.x',0,100,'easeOut');
intro.key(ball,'transform.x',1800,800);

const idle = scene.cloneTimeline('intro','idle');
idle.set({loop:true});
scene.useTimeline('idle');
ball.key('opacity',0,0).key('opacity',800,1);
idle.modifier('layers.'+ball.id+'.transform.y',{
  type:'sine',parameters:{amplitude:30,frequency:1}
});
```

`Layer.key` seçilmiş timeline'a, seçim yoksa ilk timeline'a yazar. `Timeline.key` açıkça o timeline'a yazar. Easing başlangıç keyframe'ine uygulanır; customBezier nesnesi desteklenir. `scene.useTimeline`, editörde seçilmiş sekmeden bağımsız, script içindeki hedefi belirler.

`cloneTimeline`, nesneleri paylaşırken keyframe'lere yeni kimlikler verir; kopyadaki düzenleme kaynak animasyonun keyframe'lerini değiştirmez. Tekil keyframe kimlikleriyle işlem yapmadan önce kopyalanan timeline'ı yeniden okuyun. State machine tarafından kullanılan timeline silinmeden önce state bağlantıları başka bir timeline'a taşınmalıdır.

`control_playback` içindeki `timelineIds` canlı görüntüde animasyonları izole eder; boş dizi bütün timeline'ları geri getirir. `render_preview` ve `evaluate_frame` de bir veya birden fazla timeline alabilir. Parametre ve state machine olayları `control_runtime` ile kontrol edilir.

State machine içeren sahnelerde `render_preview` zaman/parametre argümanı verilmezse mevcut canlı durumu yakalar. Belirli bir zamanı veya farklı parametreleri deterministik sınamak için `timelineIds` belirtin; böylece önizleme state machine'i yanlışlıkla başlangıç durumuna döndürmez.

## Kayıt ve çıktı sınırları

Projeler varsayılan `projects/` altında `.chorono.json` olarak atomik kaydedilir. Yerel blob medyası gömülür; bir dosya 16 MB, sahne yaklaşık 32 MB ile sınırlıdır. Mevcut proje üzerine yazmak için `overwrite:true` gerekir. `CHORONO_MCP_PROJECT_DIR` ile proje kökü değiştirilebilir. Keyfi dosya yolları, traversal ve proje dosyası symlink'leri kabul edilmez.

Çıktılar `projects/exports/` içine yazılır. Önizleme temiz PNG'dir. SVG mevcut vektör dışa aktarıcının uyarılarını döndürür. Kare dizisi ZIP çağrı başına en fazla 300 kare / 4 MP / 24 MB'dır ve ses içermez. MP4/GIF/WebM kodlayıcıları bu MCP sürümünün kapsamında değildir.

Bu yerel servis internet yayını veya çok makineli dağıtım için yapılandırılmamıştır. Token `.chorono/mcp-token`, denetim metadatası `.chorono/audit.jsonl` içinde tutulur; bu klasör Git'e eklenmez. Denetim kaydı script veya medya içeriğini yazmaz.

## Doğrulama

```sh
npm test
npm run mcp:build
npm run build
npm run mcp:smoke
```

Gerçek bağlı editörde oluşturma, çoklu timeline, script izolasyonu, PNG, medya paketleme, kaydetme/yükleme ve dışa aktarmayı sınamak için `npm run mcp:smoke -- --write` kullanın. Test önce mevcut sahneyi yedekler, sonunda geri yükler. `--keep-demo` örnek sahneyi editörde bırakır. Sonuçlar `.chorono/smoke/` altındadır.
# Ses klipleri

`import_asset` ses dosyasını aktif/seçilen timeline'a, belirtilen `startMs` veya playhead konumuna tek undo işlemiyle ekler. `add_audio_clip` mevcut bir ses kaynağını yeniden kullanır. Ses katmanı bir kliptir: `startMs/endMs` timeline aralığı, `audio.startOffsetMs` kaynak girişidir.

`move_audio_clip`, `trim_audio_clip`, `split_audio_clip`, `set_audio_gain`, `set_audio_fades` ve `patch_audio_clip` editördeki aynı yerel komutları kullanır. Sol kırpma kaynak girişini ilerletir; taşıma kaynak girişini korur; bölme kaynak dosyasını paylaşır ve ses zarfını korur. Ses kırpmak için genel animasyon esnetme komutu kullanılmaz.

`audio.volume` lineer kazançtır (0–4); dB için `set_audio_gain` kullanılır: 0 dB = 1, yaklaşık −6,02 dB = 0,5. Mute ayrı saklanır. Fade süreleri ses otomasyonuyla çarpılır; pan −1…1 aralığındadır. Timeline klonları görsel nesnelerde olduğu gibi mevcut ses klibini paylaşır; bağımsız düzenleme için klip çoğaltılır.

`get_audio_state` canlı kaynakları, decode hatalarını ve metreleri okur. `render_audio_preview` en fazla 10 saniyelik gerçek WAV üretir; `export_audio` en fazla 120 saniye/24 MB stereo WAV kaydeder. Kazanç, fade, otomasyon, pan ve master ayarı aynı değerlendirme hattını kullanır. State machine sahnelerinde deterministik çıktı için `timelineIds` açık verilmelidir. PNG ve frame değerleri ses doğrulaması değildir. Runtime JSON veya görüntü dizisi karıştırılmış ses içermez; WAV ayrıca üretilmelidir.

`normalize_audio_clip` kırpılmış kaynak aralığının peak seviyesini ölçerek statik kazancı ayarlar (varsayılan −1 dBFS). Kazanç otomasyonu varsa önce kaldırılmalıdır. `set_audio_master` master dB/mute ayarını projeye kaydeder. Dışa aktarım uyarıları sessiz aralığı, kazanç sınırını veya clipping'i bildirir.

## Kaynak kökeni — MCP 2.1.0

Optional `scene.authoring` version 1; ilk oluşturanı, son yerel değiştireni ve
alan yazanlarını ayırır. Browser commit insan, MCP/planner commit ajan, merge
import içeriği import olarak kaydedilir. Eksik/eski/elenmiş bilgi `unknown`
olur; Hermès/ajan parametresinin olmaması insan kökeni kanıtlamaz. `get_layer`
kendi katkısını ve group/spline için alt ağaç katkısını ayrı bildirir. Tam kayıtlar
`get_scene` içindedir; adres ve alan anahtarları JSON string tuple biçimindedir.
Kopyanın yeni oluşturucusu ile devraldığı içerik kökeni ayrıdır.

Yalnız commit damgalanır. Undo/redo ve tam proje açma özgün metadata'yı geri
getirir; portable save saklar, iki runtime exporter kök ledger'ı açıkça çıkarır.
Kullanıcıya ait authoring/hermes animasyon verileri korunur. Kayıt sınırlıdır;
`truncated:true` eksik kapsamı bildirir. Bu bilgi kimlik doğrulama, sahiplik veya
istenmeyen değişiklik izni değildir. Genel key upsert semantiği değişmedi.
2.1.0 için editör/STDIO birlikte yeniden başlatılıp bağlanır; source argümanları
2.0.0 ile aynıdır. [Bakım sözleşmesi](../../src/lib/editor/authoring/README.md).
