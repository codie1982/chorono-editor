# Chorono AI & Script — QA Test Raporu

**Tarih:** 2026-05-21
**Branch:** `feat/multi-mode-architecture-bl74`
**Test ortamı:** OpenAI `gpt-4o` (canlı), Next.js dev (port 3010), tarayıcı preview
**Kapsam:** Authoring Script (run_script) + AI Planner (multi-turn) + Otonom Checker
**Test türü:** Normal + uç senaryolar; alt sistem kapsam denetimi (SM / Particle / Wiring)

---

## 1. Yönetici Özeti

Sistem **temel katmanda sağlam ve AI bunu doğru kullanıyor**: layer oluşturma,
keyframe animasyonu, prosedürel (döngü/matematik) script ve metin. Multi-turn agent
loop ve otonom Checker beklendiği gibi çalışıyor.

**Kritik bulgu:** Üç güçlü alt sistem — **State Machine, Particle, Parameter Wiring**
— AI ve script API'sine **kapalı**. Bu sistemler için tool/API yok; AI istendiğinde
ya taklit ediyor (SM → timeline) ya da hata veriyor (particle).

| Alan | Durum |
|---|---|
| Temel animasyon (layer + keyframe) | ✅ Sağlam |
| Prosedürel script (loop/math) | ✅ Sağlam |
| Metin / isim | ✅ Çalışıyor (içerik kalitesi notu var) |
| Multi-turn agent loop | ✅ Çalışıyor |
| Otonom Checker | ✅ Sorunları yakalıyor |
| State Machine | ❌ AI/script kapsamı yok |
| Particle | ❌ AI/script kapsamı yok |
| Parameter Wiring | ❌ AI/script kapsamı yok |

---

## 2. Test Senaryoları ve Sonuçları

### TEST 1 — Script Console: loop + matematik + çok-layer
**Girdi:** `run_script` ile 16 daireyi radial dizip staggered scale+opacity animasyonu.
**Sonuç:** ✅ BAŞARILI
- 16 daire oluşturuldu (18 toplam layer)
- **160 komut tek undo adımında** birleştirildi
- Hata yok; hex renk hesabı, `Math.cos/sin`, döngü sorunsuz çalıştı

**Değerlendirme:** Script sisteminin güçlü yanı. Prosedürel/tekrarlı işlerde ideal.

---

### TEST 2 — AI: isim yaz + loop animasyon
**Girdi:** *"Sahneyi temizle ve ortaya 'Chorono' yazan başlık ekle, harfler sırayla
yukarıdan düşüp yerine otursun (loop)."*
**Sonuç:** ✅ BAŞARILI (yapısal)
- AI **run_script** seçti (doğru karar — prosedürel/tekrarlı)
- 7 text layer (Chorono = 7 harf), staggered düşme loop'u
- Otonom Checker: **Verdict: OK** — *"Well-timed staggered fall of text layers"*

**Not (içerik kalitesi):** Canvas beyaz göründü — harfler muhtemelen beyaz-üstüne-beyaz
veya o playhead anında üst kenarda. Yapısal doğru, görsel okunabilirlik iyileştirilebilir.

---

### TEST 3 — AI: 4-mevsim 4-durumlu State Machine
**Girdi:** *"4 mevsim için 4 durumlu state machine: kış/ilkbahar/yaz/sonbahar. Her
durumda arka plan + daire rengi değişsin."*
**Sonuç:** ⚠️ TAKLİT (gerçek SM değil)
- AI gerçek SM **oluşturamadı** (SM tool'u yok)
- Yerine: 2 layer (bg Rect + Circle) + **16s timeline** (4 mevsim × 4s) renk keyframe'leri
- Çalışırken bug: `⚠ No timeline exists — cannot add keyframe` (sıralama — Test bulgusu B1)
- Otonom Checker: **Verdict: Needs attention** — sorunları doğru yakaladı

**Değerlendirme:** "Durum tabanlı" istek timeline animasyonuna indirgeniyor. Gerçek
FSM (state + transition + guard) erişilemez.

---

### TEST 4 — AI: Particle (konfeti patlaması)
**Girdi:** *"Sahneyi temizle ve konfeti patlaması (particle efekti) oluştur."*
**Sonuç:** ❌ BAŞARISIZ
- AI `scene.add('particleEmitter')` deneyip emitter property'leri set etmeye çalıştı
- Hatalar: `Cannot set properties of undefined (reading 'area')`,
  `Cannot set properties of undefined (setting 'ratePerSecond')`
- Sonuç: **0 layer** (script tamamen patladı)
- AI yanıtı: *"configuring this particle emitter effect requires additional detailed
  insights to avoid the encountered errors."*

**Değerlendirme:** Particle emitter'ın script API'si yok. AI doğru niyetlendi ama
LayerHandle particle konfigürasyonunu desteklemiyor.

---

## 3. Çalışan Yetenekler (Doğrulanmış)

- **Layer CRUD** — add/update/delete, transform, opacity, fill, size
- **Keyframe animasyonu** — `handle.key(prop, ms, value)`, easing
- **Prosedürel script** — JS host: döngü, matematik, koşul; tek undo'da batch
- **Metin** — text layer (içerik `.set({text})` ile)
- **Multi-turn agent loop** — query → mutate → verify → continue (MAX_TURNS=5)
- **Read tool'lar** — list_layers, describe_layer/timeline, evaluate_at_time, get_scene_json
- **Otonom Checker** — planner sonrası otomatik review, Verdict + Findings, salt-okunur
- **Hibrit tool seçimi** — AI basit işte granular, prosedürelde run_script seçiyor

---

## 4. Kapsam Boşlukları (Gap)

| Sistem | Mevcut | Gereken |
|---|---|---|
| **State Machine** | Tool/API yok → timeline taklidi | `create_state_machine` + `scene.addStateMachine()` |
| **Particle** | Tool/API yok → runtime error | `add_particle_emitter` + `LayerHandle.asParticleEmitter()` |
| **Parameter Wiring** | Tool/API yok | `add_parameter_wire` + `scene.wire()` |

> Mevcut AI tool seti: `clear_scene, update_composition, add_layer, update_layer,
> delete_layer, create_timeline, add_keyframes, run_script` + 5 read tool.
> SceneAPI: `add/find/get/remove/layers/log` + LayerHandle (pos/opacity/rotation/
> scale/size/fill/set/key). **SM/particle/wiring bunların hiçbirinde yok.**

---

## 5. Bulunan Bug'lar

| # | Bug | Şiddet | Durum |
|---|---|---|---|
| B1 | `handle.key()` timeline'dan önce çağrılınca tüm script patlıyor | Yüksek | ✅ DÜZELTİLDİ — otomatik 'main' timeline |
| B2 | Renk keyframe'leri interpolate etmiyor (snap) | Orta | ⬜ Açık (BL-78/E) |
| B3 | LayerHandle'da `.text` setter yok; beyaz-üstüne-beyaz riski | Düşük | ⬜ Açık |

**B1 detayı:** AI bazen `run_script`'i `create_timeline`'dan önce sıralıyordu;
`key()` "No timeline exists" fırlatıp tüm batch'i iptal ediyordu. Artık `key()`
gerektiğinde deterministik 'main' timeline'ı (keyframe süresini kapsayan duration ile)
otomatik oluşturuyor. +1 test, 819 test geçiyor.

---

## 6. Öneriler (Öncelik Sırası)

1. **C — State Machine tool+API** (L): En yüksek değer. 4-mevsim/interaktif senaryolar,
   kullanıcının SM vurgusu. `commands-statemachine.ts` zaten var; AI tool + SceneAPI sarması.
2. **B — Particle tool+API** (M): Daha hızlı kazanım. `add_particle_emitter` + preset'ler.
3. **D — Parameter Wiring tool+API** (M): Expression-based, BL-05 sarması.
4. **E — Color interpolation** (S): `interpolateColor(hexA,hexB,t)` ~40 satır — B2'yi çözer.

**Konvansiyon hatırlatması** (`arch_scripting_event_system`): Her yeni sistem hem
script API'sine hem AI tool setine eklenmeli. Mevcut SM/particle/wiring bu kurala
henüz uyarlanmamış — bu rapor o boşluğu belgeliyor (backlog BL-78).

---

## 7. Test Metrikleri

- **Senaryo sayısı:** 4 ana (script×1, AI×3) + onlarca unit test
- **Otomatik test:** 819 geçiyor, `tsc` temiz
- **Canlı LLM:** OpenAI gpt-4o, multi-turn (her istek 2-5 LLM çağrısı)
- **Maliyet:** ~$0.43 / 230K token (tüm oturum) — multi-turn'e rağmen ekonomik
- **Regression:** Yok

---

*Rapor: kapsamlı QA oturumu, BL-78 backlog kalemi ile ilişkili.*
