# FRACTURE4 — damage deformation devralma ve TODO kaydı

- **Kayıt tarihi:** 22 Kasım 2026
- **Branch:** `codex/mesh2d-mesh0`
- **Durum:** Faz 2 TODO; v0.5.0 Faz 1 release blocker'ı değil
- **Başlangıç tabanı:** FRACTURE3 kabulü `acc68a08`'e kadar kayıtlıdır; yeniden
  başlarken branch HEAD ve bu belgeden sonraki migration'lar ayrıca doğrulanır.

Bu belge FRACTURE4'e yeniden dönüldüğünde yarım prototipin tamamlanmış özellik
sanılmasını, aynı sorumlulukların tekrar dağınık biçimde kurulmasını ve
FRACTURE5 kapsamının yanlışlıkla içeri alınmasını önler.

## 1. Gerçek durum ve temizleme kaydı

22 Kasım'da kısa, commitlenmemiş bir domain prototipi başlatıldı. Şu kararları
araştırdı:

- dent, bend ve shear deformasyon niyetleri;
- `visual-only` ve kırılma anında örneklenen collider politikaları;
- fracture girdisi olarak rest veya deformed snapshot seçimi;
- rest topology, deformation provenance ve fracture generation için ayrı
  stale/hash nedenleri;
- foldover, bozuk üçgen ve self-intersection reddi.

Prototip tamamlanmadı, test edilmedi, UI/MCP/portable entegrasyonu almadı ve
commitlenmedi. Ara tipler `src/lib/types/fracture.ts` içindeki mevcut union
sınırına yanlış konumda eklenerek TypeScript yapısını bozmuştu. Bu yarım kaynak
Faz 1 ağacından kaldırıldı; `src/lib/types/fracture.ts` ile
`src/lib/fracture/index.ts` FRACTURE3'ün geçerli haline geri getirildi.

Sonuç olarak:

- cherry-pick edilecek veya “tamamlanacak” bir FRACTURE4 commit'i yoktur;
- mevcut source tree'de FRACTURE4 public tipi, compiler'ı, UI'ı veya MCP aracı
  bulunmaz;
- silinen prototip Git'ten geri alınabilecek bir teslim değildir;
- aşağıdaki sözleşme, yeniden uygulamanın başlangıç kaydıdır.

## 2. FRACTURE4'ün kesin kapsamı

FRACTURE4 yalnız **sabit topolojili Mesh2D hasar deformasyonu ile kırılma
girdisinin bağlanmasıdır**:

1. Dent: etki merkezi, yarıçap, yön/derinlik ve falloff ile yerel displacement.
2. Bend: seçili eksen/hat çevresinde bounded yerel bükülme.
3. Shear: açık eksen ve ağırlık alanı üzerinden bounded kayma.
4. Görsel sonuç: mevcut `meshDeformation` clip/asset ve BakeService yolunda
   solver kapalıyken oynatılabilir fixed-topology pozisyonlar.
5. Fracture snapshot: recipe açıkça `rest` veya event zamanındaki `deformed`
   geometriyi seçer.
6. Collider policy:
   - varsayılan `visual-only`: rigid collider rest kaynağında kalır;
   - isteğe bağlı `event-sampled`: collider yalnız fracture event tick'inde
     doğrulanmış deformed snapshot'tan yeniden derlenir;
   - her kare deform olan dinamik collider bu dilimde yoktur.

FRACTURE4'e dahil olmayanlar:

- plastik FEM, sürekli adaptive remesh veya crack propagation;
- topology değiştiren deformation;
- her kare cloth/soft-body solver;
- on-demand recursive generation;
- `fractureEventSequence`, checkpoint/seek ve ileri replay. Bunlar FRACTURE5
  veya daha sonraki araştırmadır.

## 3. Değişmez teknik sözleşmeler

### 3.1. Veri ve sahiplik

- Rest `Mesh2DGeometry` immutable kaynaktır; dent/bend/shear onu yerinde
  değiştirmez.
- Yoğun sample buffer'ları scene JSON, undo snapshot veya fracture manifest'e
  yazılmaz; mevcut binary `meshDeformation` asset yolu kullanılır.
- Runtime solver/GPU/DOM nesneleri portable kayda girmez.
- Apply/Re-bake/Clear tek sahiplik sınırı ve tek undoable command kullanır;
  kullanıcıya ait layer, asset veya manuel düzenleme sessizce silinmez.

### 3.2. Ayrı hash ve stale nedenleri

En az üç kimlik ayrı tutulur:

1. **Rest geometry identity:** mevcut `topologyHash` ve
   `hashMeshDeformationBakeGeometry`.
2. **Deformation provenance:** işlem sırası, parametreler, pin/field girdileri,
   solver/compiler version, sample zamanları ve üretilen clip'in
   `sourceRecipeHash` değeri.
3. **Fracture identity:** mevcut generation `topologyHash`, hierarchy/bond
   hash'leri ve source revision.

Rest topology değişikliği deformation bake'i ve ona bağlı deformed fracture
snapshot'ını stale yapar. Yalnız deformation parametresi değişikliği rest
topology hash'ini değiştirmez; deformation provenance ve ondan türeyen fracture
snapshot/generation değişir. Bir hash diğerinin yerine kullanılmaz.

### 3.3. Geometri doğrulaması

- Vertex sayısı ve connectivity sabit kalır; clip topology hash'i rest mesh ile
  tam eşleşir.
- Bütün pozisyonlar finite olmalı; duplicate/collapsed triangle ve epsilon
  altı alan reddedilmelidir.
- Triangle orientation flip/foldover ve boundary self-intersection açık tanıyla
  reddedilir. Sessiz clamp yalnız belgelenmiş parametre limiti için yapılır.
- Deformed snapshot'tan fracture boundary/region üretilirken mevcut
  `FractureSourceBoundaryCompiler` veya `FractureSourceRegionCompiler`
  sözleşmesi adapter üzerinden yeniden kullanılır; clipping kopyalanmaz.
- Coordinate space source-layer local pixel, zaman fixed-tick/millisecond
  sözleşmesidir. Parent/world transform deforme pozisyonlara ikinci kez
  uygulanmaz.

## 4. Yeniden kullanılacak mevcut modüller

| Sorumluluk | Yeniden kullanılacak kaynak |
| --- | --- |
| Fixed-topology clip ve codec | `src/lib/mesh2d/deformation/` |
| Binary asset/cache/lease | `src/lib/asset/meshDeformation/` |
| Bake recipe, bütçe ve preview | `src/lib/bake/adapters/MeshDeformationBakeAdapter.ts` |
| Atomik apply/undo ve stale kontrolü | `src/lib/editor/commands-mesh-deformation-bake.ts` |
| Deformed frame çözümleme | `src/lib/mesh2d/deformation/resolveMesh2DDeformation.ts` |
| Rest mesh doğrulama | `src/lib/geometry/mesh2d/Mesh2DTopologyValidator.ts` |
| Fracture source derleme | `src/lib/fracture/FractureSourceBoundaryCompiler.ts`, `FractureSourceRegionCompiler.ts` |
| FRACTURE0–3 recipe | `FractureRigidRecipeCompiler.ts`, `FractureRecursiveRecipeCompiler.ts` |
| Ortak job yaşam döngüsü | `src/lib/bake/` ve mevcut Physics/Jobs & Bake controller'ları |

Yeni bir ikinci deformation asset formatı, ikinci bake service veya kopya
fracture clipper açılmaz.

## 5. Önerilen sorumluluk sınırları

Aşağıdaki adlar **öneridir; uygulanmış API değildir**:

- `FractureDamageDeformationCompiler`: immutable rest geometry + ordered hasar
  işlemleri → sampled fixed-topology positions. Fracture/React/MCP bilmez.
- `FractureDeformedSnapshotValidator`: finite, area, orientation, foldover,
  self-intersection ve bütçe doğrulaması. Solver orchestration yapmaz.
- `FractureSnapshotAdapter`: seçilen event sample'ını mevcut boundary/region
  compiler girişine çevirir; generation üretmez.
- `FractureDamageRecipeCompiler`: rest/deformed snapshot seçimini ve collider
  politikasını mevcut rigid/recursive recipe'ye bağlar; renderer import etmez.

Tipler union'ın içine rastgele eklenmemeli; `src/lib/types/fractureDamage.ts`
gibi feature-owned bir dosyada başlayıp yalnız kararlı public kayıtlar
`src/lib/types` barrel'ından açılmalıdır. Mevcut serialized format additive ve
versioned kalmalıdır.

## 6. Uygulama sırası

### F4-0 — sözleşme ve fixture

- Tek quad/grid dent, bend ve shear için küçük deterministic fixture yaz.
- Unit, coordinate/time, epsilon, max displacement ve budget değerlerini
  sabitle.
- Rest/deformed ve visual-only/event-sampled capability matrisini belge/teste
  çevir.

### F4-1 — domain işlemleri ve validator

- Her deformasyon işlemini ayrı strateji/modülde uygula.
- Sıralı işlem listesi deterministik olmalı; input ve rest geometry mutate
  edilmemeli.
- Finite/collapse/foldover/self-intersection negatif testlerini kapat.

### F4-2 — mevcut MeshDeformation bake yoluna bağlama

- Sampled positions'ı `MeshDeformationBakeAdapter` ile hazırlayıp mevcut binary
  asset/lease/budget formatını kullan.
- Preview, cancel, stale, Apply, Undo/Redo, Re-bake ve Clear davranışlarını
  kanıtla.
- Solver çalışmadan player ve final renderer playback'ini doğrula.

### F4-3 — fracture snapshot ve collider policy

- Rest snapshot'ın mevcut FRACTURE0–3 sonucunu değiştirmediğini regression
  testiyle kanıtla.
- Deformed snapshot'ı yalnız event tick'inde çöz ve doğrula; source owner,
  local space, UV ve topology kimliğini koru.
- `event-sampled` collider'ı aynı snapshot'tan üret; validation başarısızsa işi
  atomik olarak durdur, rest'e sessiz fallback yapma.

### F4-4 — persistence, commands ve migration

- Versioned portable recipe/provenance ekle; runtime clip buffer'ını JSON'a
  gömme.
- Clone/instance, save/load, undo/redo, ownership ve legacy missing-field
  default'larını test et.
- FRACTURE3 manifest/hierarchy formatını geriye dönük bozma.

### F4-5 — UI ve MCP

- Physics/Fracture panelinde Damage Deformation bölümü: ordered operation,
  parametreler, snapshot ve collider policy, estimated budget, warning/error.
- Canvas preview rest/deformed ve collider farkını ayırt edilebilir gösterir;
  overlay final render'a girmez.
- MCP native job akışı config/validate → prepare/simulate → status/cancel →
  preview → commit kullanır. Canonical skill ve rehber aynı commit grubunda
  güncellenir.

### F4-6 — parity ve canlı kabul

- Scrub, player, viewport, built-in final render, portable reopen ve MCP aynı
  event sample'ını gösterir.
- Chorono Render varsa aynı source frame'i tüketir; yoksa built-in fallback
  sonucu dürüstçe raporlanır.
- Temiz 2010 oturumunda gerçek UI/MCP sahnesi oluşturulur, validator ve browser
  console kontrol edilir, portable fixture ve representative PNG'ler saklanır.

## 7. Zorunlu test matrisi

- Aynı input/seed/operation sırası aynı positions ve provenance hash'ini verir.
- Operation sırası değişince deformation provenance değişir.
- Rest pozisyonu veya topology değişince bake stale olur.
- Dent merkez dışında falloff ile sıfıra yaklaşır; bend/shear limitleri aşılmaz.
- Zero radius, NaN/Infinity, aşırı displacement, collapsed triangle, foldover
  ve boundary self-intersection açık hata verir.
- `rest` snapshot mevcut generation hash/fragment davranışını korur.
- `deformed` snapshot görünür contour/fragment kaynağıyla eşleşir ve UV'ler
  kaynak görünümünü korur.
- `visual-only` collider'ın rest olduğunu UI/Inspector açık gösterir.
- `event-sampled` render–collider farkı tolerans içinde ölçülür.
- Apply/Undo/Redo/Re-bake/Clear, save/load, clone ve portable round-trip geçer.
- Cancel/stale/budget failure sahneye yarım asset, generation veya body bırakmaz.
- FRACTURE0–3, bond action ve recursive hierarchy regresyonları geçer.

## 8. Tamamlanma tanımı

FRACTURE4 ancak domain + validator + mevcut BakeService/asset yolu + fracture
snapshot + UI + MCP + portable + player/render parity + gerçek canlı kabul
birlikte tamamlandığında “yapıldı” olarak işaretlenir. Yalnız type/registry,
yalnız deformasyon matematiği veya yalnız görsel preview teslim sayılmaz.

FRACTURE4 tamamlanınca bu belgede her F4 diliminin commit aralığı, fixture yolu,
test sayısı, bilinen sınırlar ve canlı kabul ölçümleri yazılmalıdır. Ardından
FRACTURE5 ayrı plan/branch kararıyla açılır; FRACTURE4 commit grubuna
event-sequence/checkpoint kapsamı karıştırılmaz.

## 9. Yeniden başlama kontrol listesi

1. `git status --short` ile yarım FRACTURE4 source olmadığını doğrula.
2. `rg "Damage|Deformation|snapshot|collider" src/lib/fracture src/lib/types`
   ile sonraki değişiklikleri incele; bu belgeyi körlemesine uygulama.
3. MeshDeformation ve fracture README/public contract'larını yeniden oku.
4. F4-0 fixture ve negatif testleri önce yaz; type union'larını test olmadan
   genişletme.
5. Her dikey dilimi ayrı, çalışan commit grubunda kapat; kaynak kırıkken UI/MCP
   aşamasına geçme.
6. Faz 1 branch'i release'e hazırlanıyorsa FRACTURE4'e aynı branch'te yeniden
   başlanacağı varsayılmaz; önce açık branch/kapsam kararı kaydedilir.
