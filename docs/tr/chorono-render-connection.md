# 3D Render çalışma alanı ve yerel Chorono Render

## Uygulanan sınır

3D detay editörünün **Render** alanı, sahneye kaydedilen `Model3DData.render` ayarları üzerinden yerel `chorono-render` CLI'ya **tek kare** gönderir. GPU/CPU, PBR/Toon, standart/yüksek AA, CPU örnek/iş parçacığı, GPU PBR profil ve dört stüdyo ışık parametresi, GPU Toon profili, çözünürlük ve PNG/JPEG/WebP seçilebilir. Sonuç önizleme ve dosya indirmesi olarak görünür. Bu sürüm sonucu ana 2D sahneye katman olarak eklemez; sıra, animasyon/video ihracı ve materyal düzeyinde özel Toon ramp düzenlemesi ayrıca ele alınacaktır.

`chorono-render` deposunun mevcut genel HTTP köprüsü CPU ile sınırlıdır. GPU PBR ve Toon için bu çalışmada render uygulamasının sahip olduğu ikinci bir **yerel editör servisi** eklendi: `127.0.0.1:43872`. Masaüstü Chorono Render açılınca servis de başlar. Editörün Next sunucusu yalnız bu servise bağlanır; artık render executable'ını bulmaz veya başlatmaz. Servis GPU/CPU işlerini kendi yüksek seviye CLI'sına yönlendirir. Geliştirmede masaüstü uygulaması olmadan `npm run serve:editor` aynı servisi açabilir. Bu yerel iş akışı hesap/bulut render bağlantısı değildir.

## Veri akışı

1. `ModelRenderPanel`, `/api/model3d/render` üzerinden yerel servisin durumunu ve kabiliyetlerini okur. Servis kapalıysa `Not running` ve **Check connection** görünür; tarayıcı odağı geri geldiğinde durum yeniden kontrol edilir. Ayar değişikliği normal detay taslağına girer; Apply/Cancel ve Undo tarafından yönetilir. Eski sahnelerde `render` alanı yoktur ve varsayılanlar kullanılır. `assertModelRenderSettings` kayıt ve istek sınırında tam anahtar kümesi ile sayısal aralıkları doğrular.
2. `Model3DResource.exportGlb` mevcut çıktı pozunu, primitive geometriyi, glTF materyal/dokularını, ana ışığı ve **Chorono Output** adlı kayıtlı çıktı kamerasını GLB'ye dönüştürür. Grid, seçim konturu ve gizmolar bu sahneye eklenmez. Geometri/materyal klonları asenkron export sırasında sonraki editör değişikliklerinden ayrılır; kaynak doku görüntüsü hazırlanan kaynak lease'i çözülene kadar ödünç alınır.
3. Aynı kökenden gelen, en çok 16 MiB GLB editörün Next API'sine ulaşır. API, render uygulamasının `~/.chorono-render/editor-service.json` keşif kaydını okur; bu dosya servis açılışında 0600 izinle oluşturulur, kapanışta silinir. Kayıttaki örnek kimliği sağlık yanıtıyla doğrulanmadan bearer anahtarı gönderilmez. Anahtar yalnız yerel sunucu süreçleri arasında kalır. Renderer servisi yalnız loopback Host'u, bearer anahtarını, tam ayar şemasını ve boyutu kabul eder; CORS açmaz. Sabit seçeneklerle CLI'yı shell açmadan çalıştırır, `--camera "Chorono Output"` ile açı seçer, tek kareyi okur ve geçici dizini temizler. İstek iptali ve beş dakikalık sınır child process'e SIGTERM gönderir. İçe alma uyarıları sonuçla birlikte görünür.
4. Sonuç yalnız geçici tarayıcı `blob:` URL'sidir. Panel kapanınca URL serbest bırakılır; kayıtlı kaynak/Undo içinde görüntü byte'ı tutulmaz. Kullanıcı dosyayı indirebilir.

`chorono-render` CLI giriş sözleşmesi ve PBR/Toon profil anlamı için renderer deposundaki `docs/CLI.md`, `docs/RENDER_SETTINGS.md` ve `docs/CHORONO_BRIDGE.md` kaynak kabul edilir. CPU ile GPU aydınlatma matematiği aynı pikseli garanti etmez. Doğrudan GLB içe alımı, editördeki ambient/environment renklerini renderer'ın kanonik sahne ışıklarına eşlemez; kaynak GLB yönlü ışığı taşır ama sonuç cihaz ve shader'a göre değişebilir. HDRI, materyal bazlı Toon ramp/outline kayıtları ve renderer uygulamasındaki kuyruk/video ayarları bu arayüzde çalışan seçenek gibi sunulmaz. Daha kapsamlı paket/animasyon aktarımı ve ana sahneye sonuç sahipliği ayrı sözleşme gerektirir.

## Yerel kullanım

```sh
# Terminal 1: chorono-render deposunda, derlenmiş CLI/native motor ile
npm run serve:editor
# Terminal 2: chorono-editor deposunda
npm run chorono -- start --background --port 2012
```

3D sahnenin detay editöründe **Render** alanına geçin. `Ready` durumunda ayarları seçip **Render frame** düğmesine basın; sonuç panelde indirme bağlantısıyla görünür. `Not running` durumunda Chorono Render'ı açıp **Check connection** seçin. Kaynağı kalıcı yapmak için detay editöründeki **Apply & return** kullanılır. Dağıtım paketi, ilk kurulum ve uygulama açma bağlantısının son kullanıcı kabulü release işidir; geliştirici komutu normal kullanıcı arayüzünde gösterilmez.
