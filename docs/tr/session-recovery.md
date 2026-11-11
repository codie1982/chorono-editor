# Yerel otomatik kayıt ve oturum kurtarma

11 Kasım 2026. Bu belge uygulanan yerel editör davranışını tanımlar.

## Kullanıcı akışı

- Klasör seçmeden de tamamlanmış sahne düzenlemeleri bu tarayıcıya kaydedilir.
  Konum, geometri, keyframe, guide, timeline, parametre ve insan/ajan köken
  kayıtları aynı kaynak JSON'uyla geri gelir. Yerel Blob medya baytları da saklanır.
- Yenilemede kayıt okunmadan editör ve MCP köprüsü açılmaz. Kurtarılan çalışma
  doğrudan gösterilir; demo sahneyle eski kaydın üzerine yazılmaz. İlk açılışta
  veya hiç kayıt yoksa karşılama ekranı tercihi uygulanır. Menüden Welcome yine
  açılabilir. Kaydedilmiş çalışma yerine yeni proje başlatmak onay gerektirir.
- Project yanında **Saving locally…**, **Saved locally**, **Local recovery ready**
  veya **Local save failed / Retry** görünür. Yerel kayıt sunucuya gönderilmez.
- Sürükleme/Array önizlemeleri kaydedilmez. Commit, belge açma/yeni belge,
  Undo ve Redo güncel kurtarma kaynağını değiştirir. İptal edilen hareket yenilemede
  geri gelmez. Açık oturumdaki Undo/Redo çalışır; geçmiş yığını yeniden açılışta
  taşınmaz. Playhead/seçim, clone yardımcı metadata'sı ve runtime önbellekleri bu
  kurtarma kaydının parçası değildir. Aktif timeline ilk mevcut timeline olur.
- Küçük, kendi içinde yeterli sahne için senkron kurtarma journal'ı, son commit
  ile arka plan yazması arasındaki yenileme aralığını kapatır. Büyük veya Blob
  medya içeren sahnede native veritabanı yazması tamamlanana kadar ayrılma
  koruması açıktır. Kullanıcı tarayıcının ayrılma uyarısını zorla geçerse henüz
  tamamlanmamış değişiklikler garanti edilemez.
- Aynı tarayıcı profili ve aynı origin kullanılır. `localhost`, `127.0.0.1`, farklı
  portlar/profiller ayrı depolardır. Yeni sekme son çalışma kaydını bağımsız bir
  alana alır; çoğaltılmış sekmede kopyalanan sessionStorage, Web Locks ile ayrılır.
  Başlangıç kopyası ilk düzenlemeden önce kendi alanına kaydedilir; bir sekmenin
  düzenlemeleri diğerinin geri yükleme kaydını değiştirmez.
- **Choose Save Folder / Save Version** harici dosya sürümleri için çalışmaya
  devam eder. Bu akış da artık geçici preview yerine committed kaynağı alır.
  **Save Scene JSON** taşınabilir proje yedeği için ayrıca kullanılabilir.

## Sahiplik ve veri akışı

1. `src/app/hooks/useEditorState.ts`, `CommittedScene` aracılığıyla
   `getCommittedScene`, `committedScene` ve `subscribeCommitted` sağlar. Bildirim
   başarılı değişikliğin sonunda, React render'ını beklemeden eşzamanlıdır.
2. `useSceneSessionRecovery` bu bildirime abone olur; `SceneSessionRecovery`
   senkron journal ve mevcut `SceneAutoSaveCoordinator` ile tek aktif + tek son
   bekleyen snapshot'ı yönetir. Debounce 250 ms, sürekli değişiklik için en geç
   1000 ms; sonlu retry ve source pin sahipliği ortak koordinatörden gelir.
3. `SessionCheckpointIO` mevcut output bütçesi, `outputJson`,
   `BoundedBinaryReader` ve `assetSourcePool` sözleşmelerini kullanır. Native
   asset URL'leri iş tamamlanana kadar korunur. Base64 üretilmez; orijinal Blob
   baytları IndexedDB'ye gider. Mevcut medya URL'si tekrar indirilmeyebilir.
4. `IndexedDbSessionStore` kaynak, yeni medya, bu sekmenin kullanılmayan eski
   medyasının temizliği ve son çalışma işaretini aynı transaction'da tamamlar.
   Hata/abort/kota durumunda önceki sağlam kayıt korunur. Başka sekmelerin
   kayıtları veya medyası otomatik silinmez. Eski gecikmiş yazma yeni çalışma
   işaretini geriye taşıyamaz.
5. `EditorSessionBoundary` bir kez okur; StrictMode replay aynı yükleme/lock
   sahibini kullanır. Journal ve IDB arasında aynı sekmede yüksek sequence,
   yeni sekme adayları arasında yeni timestamp kazanır. Bozuk kayıt atlanır ve
   hata görünür kalır; otomatik demo yazması yoktur. Başarılı restore'da scene
   ID'leri aynıdır; sadece süresi dolmuş Blob URL'leri yeni handle'lara çevrilir.
6. URL creator lease'leri editor source owner'a devredildikten sonra bırakılır.
   Sınır kapanınca DB bağlantısı, transaction'lar ve browser lock bırakılır;
   hook kapanınca timer/subscriber/lifecycle listener'ları temizlenir.

Kaynak formatı değişmedi. Kurtarma zarfı v1; scene JSON, tab ID, sequence,
timestamp ve Blob URL manifesti içerir. Scene/undo içine DB, DOM, timer,
controller, renderer veya decoded-media nesnesi yazılmaz. `sceneSourceData`,
portable export ve kurtarmanın ortak runtime ayıklama görünümüdür.

Örnek abonelik (kaydı UI bileşeninden elle çoğaltmayın):

```ts
const stop = editor.subscribeCommitted(scene => recovery.request(scene))
// source değiştirme örneği: editor.dispatchCommand(command)
// bileşen kapanırken:
stop()
recovery.dispose()
```

## Sınırlar ve doğrulama

Journal en çok 512 Ki UTF-16 karakterlik küçük kaynaklara uygulanır. IDB kaynağı
en çok 32 Mi karakter / 64 MiB JSON, en çok 500 asset; yeni medya 64 MiB/asset ve
256 MiB/checkpoint sınırındadır. Hazırlama mevcut output/host bellek bütçesini de
paylaşır. Limit/kota/depolama engeli görünür hata üretir ve önceki kaydı korur;
başarısız yazma için **Saved locally** iddiası yapılmaz. Geçerli küçük journal
varsa IDB hatasına rağmen kaynak yerel olarak kurtarılabilir.

Tarayıcı verisinin kullanıcı tarafından silinmesi, özel oturumun kapanması,
profil kaybı veya disk bozulması harici proje yedeği gerektirir. Yeni sekmelerin
kurtarma alanları bilerek korunur; bu teslim bir proje arşivi/silme paneli eklemez.

Saf koordinatör/journal/commit olay testleri Vitest'tedir. Gerçek IndexedDB,
StrictMode, yerel medya, mouse preview, Undo/Redo ve reload kabul sayfası:

```sh
# Next sunucusu kapalıyken derle:
node scripts/perf/session-recovery.mjs
node scripts/perf/serve.mjs artifacts/session-recovery 2018
```

Kabul sayfası ayrı origin/veritabanı kullanır; gerçek kullanıcı sahnesine veya
MCP oturumuna bağlanmaz. `Run storage checks` native atomiklik/abort/medya
temizliği sınırlarını test eder. Son kontrolde gerçek editörün önce/sonra
JSON'ları eşit karşılaştırılır; yerel medyanın taze Blob URL'si farkı beklenir.
