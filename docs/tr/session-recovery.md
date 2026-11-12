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
  geri gelmez. Undo/Redo yığınları yeniden açılışta aynı sırayla geri gelir. Yeni bir
  düzenleme, açık oturumdaki gibi bekleyen Redo dalını temizler. Playhead/seçim, clone yardımcı metadata'sı ve runtime önbellekleri bu
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
   `getCommittedScene`, `committedScene` ve `subscribeCommitted` sağlar.
   Geçmiş sahibi ayrıca `getCommittedHistory`, `committedHistory`,
   `subscribeHistory` ve atomik `resetHistory` sunar. Bildirim
   başarılı değişikliğin sonunda, React render'ını beklemeden eşzamanlıdır.
2. `useSceneSessionRecovery` geçmiş bildirimine abone olur; `SceneSessionRecovery`
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

Kaynak formatı değişmedi. Kurtarma zarfı v2; kaynak JSON, mantıksal sessionId, özel sekme slotId,
sequence, timestamp, Blob URL manifesti ve sürümlü geçmiş grafiği içerir.
Eski v1 kayıtları kaynak korunarak okunur; geçmişleri boş başlar. Scene/undo içine DB, DOM, timer,
controller, renderer veya decoded-media nesnesi yazılmaz. `sceneSourceData`,
portable export ve kurtarmanın ortak runtime ayıklama görünümüdür.

Örnek abonelik (kaydı UI bileşeninden elle çoğaltmayın):

```ts
const stop = editor.subscribeHistory(history => recovery.requestHistory(history))
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

## Oturum kimliği, dosyalar ve bellek sınırı

`src/lib/editor/session` mantıksal proje kimliğini ve taşınabilir zarfı;
`src/lib/editor/history` ise salt kaynak görünümünü, bütçeyi ve grafiği yönetir.
`SessionOutputProvider` UI/export sınırında kimliği sağlar. Yeni belge UUID alır;
dosyadan açılan çalışma dosyanın sessionId'sini benimser. Aynı projenin iki
sekmesi aynı mantıksal kimliği korur, bağımsız özel slotlara yazar.

- IDB anahtarı `sessionId__slotId`; sessionStorage bu anahtarı ve özel slotu
  tutar. localStorage'da `chorono.sessions.v1.<sessionId>` manifesti ve küçük
  kaynak/geçmiş için sınırlı journal bulunur. Büyük kaynak ve medya IDB'dedir;
  localStorage'a büyük proje kopyaları yazılmaz.
- İndirilen JSON ve diğer kullanıcı çıktıları `__session_<sessionId>` eki taşır.
  Kaynak JSON'un üst düzey `editorSession` v1 alanı kimlik, geçmiş grafiği ve
  gerekirse tarihsel medya tablosunu içerir. Alan normal sahneden ve Undo
  snapshot'larından ayrılır; tekrar kaydetmede iç içe geçmiş oluşturmaz.
  Runtime/SDK protokolleri değişmez. JSON inspector/Copy yalnızca kaynak gösterir;
  **Save Scene JSON** oturum/geçmiş içeren taşınabilir dosyayı yazar.
- Seçilen klasörde `sessions/<sessionId>/scene.json` ve aynı dizinde zaman damgalı
  sürümler yazılır. Alt dizin sağlamayan host adapter'ı sessionId'li düz ad kullanır.
- Geçmiş toplam 50 Undo+Redo adımı, yaklaşık 64 MiB paylaşılan kaynak ve
  300.000 ziyaret düğümüyle sınırlıdır. En yakın kesintisiz adımlar tutulur;
  önce uzak adımlar düşer. Güncel kaynak tek başına sınırı aşsa bile korunur.
  Bunlar işlem RAM'i ölçümü değildir; decoded medya/DOM/GPU önbellekleri ayrı
  bütçelere aittir. Bilinen Blob baytları bir kez sayılır.
- DAG codec'i güncel kaynağın değişmeyen alt ağaçlarına referans verir; değişmiş
  tarihsel düğümleri ve uzun metinleri paylaşır. Grafik 16 MiB ile sınırlıdır.
  Aynı sınırlama canlı ve kalıcı geçmişe uygulanır. JSON her frame'de değil,
  commit/restore sınırında hazırlanır. Küçük acil journal daha dar grafik sınırı
  kullanabilir; bu durumda tam IDB yazması bitmeden güvenli ayrılma bildirilmez.
- Mevcut sahneden silinmiş ama Undo/Redo'da gereken yerel medya da korunur.
  IDB orijinal Blob'u, taşınabilir dosya bir kez gömülen veri URL'sini saklar.
  Hata/sınır aşımı dosya açmayı/yazmayı atomik olarak reddeder; başarısız açma
  mevcut çalışmayı veya kimliğini değiştirmez.

Minimal dosya akışı (React bağlamı kimliği senkron benimser):

```ts
const opened = readSessionProject(parseSceneJson(json))
identity.adopt(opened.sessionId ?? crypto.randomUUID())
editor.resetHistory(opened.history)
// Dosya output işi: acquireSceneText(history.present, 'editor-json',
//   { session: { sessionId: identity.id, history } })
```

İlk açılış fallback'i `demo/createChoronoDemo.ts` içindeki 800×450, altı saniyelik
yerel şekil/yazı demosudur. Marka, tipografi, hareket ve timeline grupları ayrı
düzenlenir; ilk kare görünürdür, Play ile oynatılır. Dış asset/font istemez.
Kurtarılmış çalışma varsa bu örnek üretilmez ve kullanıcının sahnesi değiştirilmez.
