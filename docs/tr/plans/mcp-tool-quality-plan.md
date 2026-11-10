# E−1.Q — MCP araç açıklığı, şema doğruluğu ve uyumlu sadeleştirme

10 Kasım 2026. **E−1.Q uygulandı ve yerel kabulü tamamlandı.** MCP protokolü
1.1.0; standard 40 / legacy 77 keşif profili, dokuz uyumlu alias, doğru typed
şemalar/açıklamalar ve hafif/tek-şema keşfi var. Eski 77 ad çağrılabilir kalır.
[Gerçek kullanım ve geçiş](../../en/mcp.md),
[modül sahipliği](../../../src/lib/mcp/tools/README.md).
Sırada E−1.1 güvenli okuma sözleşmesinin runtime zorunluluğu ve kalan ortak
düzenleme işleri var. Mevcut revision/drag/undo/retry kontrolleri bütün adlarda
ortaktır; zorunlu read lease veya provenance bu teslimde uygulanmış sayılmaz.

## Doğrulanan başlangıç

[Glama Schema raporu](https://glama.ai/mcp/servers/codie1982/chorono-editor/schema)
7 Kasım 2026 10:30 tarihli 65 araç için TDQS C, 2,7/5 gösteriyor. Ayrıştırma
2/5, adlandırma 3/5, araç sayısı uygunluğu 1/5 ve kapsam 4/5. Bunlar araç
tanımı/katalog değerlendirmesidir. Rapor bugünkü yerel kataloğun yeniden
puanlandığı anlamına gelmez. [TDQS ölçütleri](https://tdqs.dev/) açıklık,
kullanım rehberi, davranış, parametre anlamı ve sunucu tutarlılığını inceler.

D2'de doğrulanan kaynak snapshot'ının MCP bundle'ına SDK üzerinden yalnız
`tools/list` gönderildi; editöre/sahneye çağrı yapılmadı. Sonuç:

- **77 benzersiz araç**; 30 native AI + 23 MCP eylemi + 25 özel araç, özel
  `run_script` tanımı aynı adlı native tanımın yerini aldığından toplam 77.
- İç içe `properties` alanları dahil 644 parametre alanının **364'ünde açıklama
  yok**. Bu sayım ortak session/revision/request alanlarını da içerir; TDQS
  puanı veya bağımsız sorun sayısı değildir. `items` ve iç `properties`
  dolaşılmıştır; tam bir JSON Schema kalite ölçümü olduğu iddia edilmez.
- Hiçbir tanım hem `destructiveHint` hem `idempotentHint` yayımlamıyor. Mevcut
  `readOnlyHint/openWorldHint` tek başına kaynak, dosya ve runtime etkisini
  anlatmıyor. İpuçları gerçek davranışa göre tek tek değerlendirilir.
- Kanıt: `artifacts/validation/mcp-quality-20261110/catalog.json` ve
  `inventory.json`. Bu bir listeleme kontrolüdür; uygulama/regresyon testi
  veya yeni Glama puanı değildir.

Sahipler: `src/lib/mcp/catalog.ts`, `actions.ts`, `protocol.ts`,
`src/lib/ai/ActionRegistry.ts`, `src/lib/ai/actions/`, `src/mcp/server.ts`.
Mevcut ActionRegistry/domain komutları kullanılır; paralel sahne, undo veya
ikinci şema/komut motoru kurulmaz. Transport kataloğu için ayrı sunum/adaptör
sorumluluğu, editörün dahili eylem kimliklerini değiştirmeyi gerektirmez.

## İlk incelemede saptanan örtüşmeler ve isim adayları

Aşağıdaki tablo ilk inceleme önerilerini kaydeder; gerçek uygulanan adlar ve
sınırlar üstte bağlı kullanım belgesindedir. İki aracın aynı konuya dokunması aynı semantiğe
sahip olduğu anlamına gelmez; yeni ad seçilmeden önce input/output, varsayılan,
zaman, retry ve mutation davranışı karşılaştırılır.

| Mevcut aile | Ayırt edilmesi gereken davranış | Önerilen yön |
| --- | --- | --- |
| `get_scene` / `get_scene_json` | Revision/bağlam zarfı ve yalnız JSON farklıdır. | `get_scene` ana okuma yolu; eski JSON çağrısı kendi çıktısını koruyan legacy adaptör. Aynı iş için ikinci yeni ana ad ekleme. |
| `evaluate_frame` / `evaluate_at_time` | Tam bindings/runtime değerlendirmesi ve timeline-only sorgu farklıdır. | `evaluate_frame` ana değerlendirme; eski özel sorgu için `evaluate_timeline_values` gibi kapsamı açık ad değerlendir. |
| `add_layer` / `create_object` / uzman yaratma araçları | Flat alanlar, registry payload'ı, spline/path kimliği ve preset kurulumu farklıdır. | Genel yaratmada `create_layer` adayı; uzman araç yalnız gerekçesi/iş akışı varsa yayımlansın. Her payload'ı kabul eden sınırsız tek araç üretme. |
| `update_layer` / `patch_object` | Flat alan güncellemesi ile nested alanın tümünü değiştirme farklıdır. | Leaf/deep patch ile replace açık ayrılsın. `patch_layer` yeni güvenli sözleşme adayıdır; eski shallow patch bu ad altında sessizce değiştirilmez. |
| `add_keyframes` / `set_keyframes` / `update_track` | Upsert, auto-create/adresleme ve tüm track alanlarını değiştirme ayrıdır. | `upsert_keyframes` ana aday; tam track yapılandırması ayrı amaç. Legacy key ID/easing davranışının korunması veya migration'ı açık olmalı. |
| `edit_entity` / parameter-trigger-binding-state-machine araçları | Genel collection değişimi ile doğrulanmış uzman komut aynı değildir. | Yaygın işler açık domain araçları; genel araç ileri kullanım/uyum yolu. Serbest object yazarak domain korumalarını geçme. |
| `add_sm_state` / `add_sm_transition` / `set_initial_state` | `sm` ve hangi initial state olduğu belirsizdir. | `create_state_machine_state`, `create_state_machine_transition`, `set_state_machine_initial_state` adayları. |

İsim ilkeleri: tekil okuma `get_`, liste `list_`, yeni varlık `create_`,
kısmi güncelleme `update_`/açık patch, tümünü değiştirme `replace_`, key ekle veya
güncelle `upsert_`; silme ailesi tutarlı olmalı. İsim için sırf bütün araçları
yeniden adlandırma yapılmaz. Açıklama ilk cümlede amacı, ardından seçim kuralı,
yan etki/undo, girdi birimi/koordinat, sonuç ve önemli sınırı anlatır.

## Uygulama planı ve kabul koşulları

### Q1 — Gerçek sözleşme hatalarını düzelt

- `src/lib/ai/actions/keyframe.ts`: `add_keyframes.value` şeması number iken
  açıklama renk öneriyor; renk geçişinin snap olduğu açıklaması güncel typed
  evaluator ile çelişiyor. Desteklenen tipler/renk/easing ve tek key olasılığı
  domain helper/şemalarla doğrulanıp açıklama ve gerçek input eşitlenir.
- `src/lib/ai/actions/introspect.ts`: `list_assets` içindeki upload yokluğu
  açıklaması `import_asset` ile uyumlu hale getirilir; uzak URL/local file
  erişimi sağlanıyormuş izlenimi verilmez.
- `patch`, `config`, `modifier`, key value/easing gibi payload'lar mevcut model,
  registry ve converter'lardan türetilen şema/ayrıntı keşfiyle açıklanır. Dinamik
  map ile sınırsız object aynı sayılmaz. Bir şemayı elle ikinci kez kopyalama.
- Ortak `sessionId`, `expectedRevision`, `requestId` açıklanır; her araca uygun
  etkiler/çıktılar ve boş/eksik/yanlış girdi davranışı belirtilir. Salt okuma,
  source mutasyonu, runtime/transport ve dosya işlemleri ayrılır. Audio preview
  gibi dosya üreten işlemlerin yan etkileri de açıklanır.

### Q2 — Canonical katalog ve uyum tasarımı

- Her aile için bir ana kullanım yolu ve gerekiyorsa farklı amacı olan uzman
  araç seçilir. Gereksiz alternatifler varsayılan keşif yüzeyini büyütmemeli.
  Sayısal araç hedefi uğruna çalışma akışı veya domain doğrulaması kaldırılmaz.
- **Yayımlanan katalog ile çağrı çözümleme ayrılır.** Şu anda
  `validateToolCall` yayımlanan listede isim arıyor; bir adı gizlemek çağrıyı da
  bozabilir. Legacy adların giriş/çıkış/varsayılanları ayrı adaptörde korunur;
  aynı domain uygulamasına yönlenir, yalnız yazı benzerliğiyle alias yapılmaz.
- Dar/legacy katalog profili değerlendirilebilir. Varsayılan değiştirmek bir
  protokol geçişidir: mevcut istemci ve aktif oturumlar korunur; capability,
  sürüm ve açık geçiş notu olmadan tool gizleme/çıkarma yapılmaz. Yalnız sayıyı
  düşük göstermek için farklı bir Glama kataloğu sunulmaz.
- Legacy adları yeni adlarıyla birlikte sürekli varsayılan listede tutmak
  karışıklığı artırır. Geçiş süresi ve eski istemci yolu somut planlanır.
- `run_script`/`batch_actions` alternatiflerinin ne zaman seçileceği açık olur;
  native araçları kaldırıp bütün işi doğrulanmamış kod yazmaya yükleme yapılmaz.

### Q3 — E−1.1 ile birlikte güvenlik ve belge eşliği

Canonical ve legacy mutasyonların tamamı aynı taze okuma/revision kontrolünden
geçer; eski ad üzerinden koruma atlanamaz. Script dry-run/commit, request retry,
aktif drag engeli ve tek undo sözleşmesi korunur. Yeni isimlerin source
işlemleri ile transport/file/read sınıfları bu kontrole doğru bağlanır.

Canonical `skills/chorono`, MCP EN/TR belgeleri, prompt, scripting resource,
capabilities ve örnekler aynı gerçek kataloğu anlatır. Skill değişiklikleri
paket kaynağında yapılır; generated `packages/cli/skills` elle düzenlenmez.
Skill/API değişiminde paket build/test/pack kabulü ilgili kapsamda çalıştırılır.

### Q4 — Ölçüm ve kabul

- Benzersiz ad, tutarlı fiil ailesi, parametre açıklaması ve input/output
  sözleşmesi için anlamlı katalog kontrolleri; whitespace/benzerlik metriği
  tek başına eşdeğer araç kararı değildir.
- Eski-yeni adaptör sonuçları, kaynak koruması, nested update/replace farkı,
  typed key/renk/easing, boş değer, timeline bağlamı ve red durumları test edilir.
- Gerçek görev matrisi: mevcut nesnenin yalnız rengini düzelt, yeni spline
  oluştur, key ekle, tam frame değerini sorgula, canlı runtime'ı oku, preview
  al ve kaydet. Seçilecek ana araç ve sonuç açık olmalı; eski çağrılar da denenir.
- Uygulamada `npm test`, `npm run mcp:build`, `npm run build`; build yapılan
  checkout'un Next sunucusu önce durdurulur. Skill/paket değişiminde CLI
  kontrolleri de eklenir. Mevcut açık sahneye test mutasyonu yapılmaz.
- Başlangıç ve son `tools/list` karşılaştırılır. TDQS'nin yerel lint ve uygun
  yeniden değerlendirmesi düşünülebilir; hosted skor için gerekli hesap/anahtar
  veya dış aktarım varsayılmaz. Glama yeniden incelemesi gerçekleşmeden puan
  arttı denmez; puan, gerçek görev başarısı ve geriye uyumla birlikte izlenir.

Bu dilim mevcut insan–ajan işinin önüne alınan MCP kalite kontrolüdür.
[E−1 planı](human-agent-editing-timeline-plan.md) ve
[3D/Poly teslim sırası](geometry-material-boxed3d-sequence.md) korunur;
export/final kalite ve ikinci genel optimizasyon sona taşınmış durumdadır.

## Teslim ve doğrulama — 10 Kasım 2026

Canonical adlar `create_layer`, `get_layer`, `get_timeline`, `upsert_keyframes`,
`replace_layer_fields`, `evaluate_timeline_values` ve üç açık state-machine
adıdır. Alias yalnız aynı payload/sonuçlu mevcut uygulamaya yönlenir. Deep patch
eklenmedi; get_layer biçimlendirilmiş alt kümedir, tam nested kaynak değildir.
Native/script key ID ve easing koruma geliştirmeleri sonraki E−1.4 kapsamındadır.

MCP ölçümleri: standard 40 araç/440 açıklamalı property; legacy 77 araç/1.103
açıklamalı property; iki profilde eksik property açıklaması sıfır. Baseline ile
sayımın veri kümesi değiştiğinden bu oran TDQS puanı olarak yorumlanmaz.
summary yaklaşık 4 KiB, tam uyumluluk capabilities yaklaşık 326 KiB; mevcut
tam yanıt uyumu korunurken hafif keşif ayrı açık seçenek olmuştur.

İlgisiz viewport WIP dışlanmış kaynak snapshot'ında 327 dosya / **2.655 test**,
TypeScript, MCP ve production build; CLI'nin 16 testi, CLI build/pack ve gerçek
tarball'dan skill kur/check kabulü geçti. Son belge/açıklama düzeltmeleri ilgili
hedef test/derleme ve paket kabulünden geçirildi. Gerçek STDIO iki profil,
dokuz alias şema eşliği ve capabilities modlarını doğruladı. İzole Chrome
editöründe renk değişirken 09:05 korunması, native spline + alias key batch,
tek undo/redo, retry, değerlendirme, PNG ve portable save/load geçti.
Kanıtlar `artifacts/validation/mcp-quality-20261110/after/` altındadır.

Ana kullanıcı sahnesi test için kullanılmadı. Public yayın veya yeni Glama
puanlaması yapılmadı; yerel kalite kabulü dış puan artışı olarak sunulmaz.
