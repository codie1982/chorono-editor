# State Machine — V2 Plan (Üretim Kullanımına Kadar)

> **Bağlam:** BL-09 State Machine'in Sprint 1–4'ü tamamlandı (`feat/state-machine-sprint1`):
> FSM çekirdeği + SVG node-graph editör + runtime (guard/resolver/blend) + Test Modu + JSON export.
> 757 test yeşil, production build temiz, tarayıcıda canlı doğrulandı (Like butonu örneği).
>
> Bu belge **kalan işi** kapsar: editör-içi prototipten **gerçek uygulamalarda kullanılabilir**
> bir özelliğe taşımak. Canlı testte tespit edilen UX bulguları + "uygulamada nasıl oynatılır"
> runtime katmanı.
>
> Son güncelleme: 2026-05-20

---

## Mevcut durum — ne çalışıyor

| Katman | Durum |
|--------|-------|
| **Veri modeli** — `statemachine-base.ts` (platform-agnostik FSM) + `statemachine-chorono.ts` (timeline-bağlı) | ✅ |
| **Komutlar** — 9 undoable EditorCommand (`commands-statemachine.ts`) | ✅ |
| **Runtime çekirdeği** — `guard.ts` / `resolver.ts` / `blend.ts` / `StateMachineRuntime.ts` (saf, React'siz) | ✅ |
| **React entegrasyonu** — `useSMRuntime` + `useInteractiveRuntime` SM-aware `evaluateFrame` | ✅ |
| **Editör UI** — SVG node-graph, drag-to-connect, detay editörleri, Test Modu + blend progress | ✅ |
| **Dock navigation** — Canvas / State Machine sekmeleri + `Cmd+Shift+M`; üstteki tekrar eden seçici 11 Kasım'da kaldırıldı. [UI sözleşmesi](toolbar-and-spline-editing.md). | ✅ |
| **Export** — `RuntimeScene.stateMachines` (editor x/y stripli) | ✅ |

## Mevcut durum — ne eksik

1. **Editör UX cilası** — canlı testte takıldığımız noktalar (connect handle tek kenarda, initial değişince reset gerekmesi, pan/zoom yok).
2. **Runtime player** — export edilen JSON'ı **gerçek bir uygulamada oynatacak** motor yok. Bugün authoring + Test Modu var, ama "ship" edilemez.
3. **Authoring derinliği** — state'lerin görsel olarak farklı olması için her state'in timeline'ını ayrı düzenleme akışı net değil (canlı testte timeline'lar boştu, canvas'ta fark görünmedi).
4. **Platform genişlemesi** — Android/SDK köprüleri.

---

## İş Kolu A — Editör UX Cilası · S (2-3 gün)

Canlı testte (Like butonu) bizzat karşılaşılan sürtünmeler.

| # | İş | Dosya(lar) | Açıklama |
|---|-----|-----------|----------|
| A1 | Connect handle **sol+sağ kenarda** + fallback **"+ Transition"** butonu (from/to dropdown) | `StateMachinePanel.tsx`, `statemachine/graphLayout.ts` | Sağdan-sola (liked→idle) bağlantı çizmek zordu; handle yalnız sağdaydı |
| A2 | Initial state değişince Test Modu'nda **otomatik reset** | `app/hooks/useSMRuntime.ts` veya `StateMachineRuntime.sync()` | Şu an "Reset" tıklamak gerekiyor; initial değişimi currentState'i takip etmeli |
| A3 | Graph ergonomisi: **pan/zoom**, çoklu node seçimi, **Delete** tuşu ile silme | `StateMachinePanel.tsx` | Çok state'li makineler için |
| A4 | **Parallel-edge offset** (aynı çift arası iki kenar üst üste binmesin) + self-loop çizim akışı | `statemachine/graphLayout.ts` | Görsel netlik; saf geometri → unit-testlenebilir |

**Çıktı:** Otomasyon olmadan elle akıcı authoring. Yeni geometri saf fonksiyon olarak `graphLayout.ts`'te kalır (test edilebilir).

**A2 tasarım notu:** `sync()` içinde, eğer `currentStateId` artık geçerli değilse zaten initial'a düşüyor. Ek kural: initial değiştiğinde ve makine henüz "dokunulmamış" (currentState == eski initial) ise yeni initial'a taşı. Aktif test oturumunu bozmamak için yalnızca currentState eski initial'a eşitse uygula.

---

## İş Kolu B — Runtime Player · L (5-7 gün)  ← asıl "uygulamada kullanma"

Bugünkü en büyük boşluk. Export edilen `RuntimeScene` JSON'ını yükleyip oynatan, host uygulamanın olaylarını dinleyen motor.

| # | İş | Dosya(lar) | Açıklama |
|---|-----|-----------|----------|
| B1 | **Web runtime player** — JSON yükle, SM'i çalıştır, canvas/DOM'a render et | `src/lib/player/ChronoPlayer.ts` (yeni) | **Saf çekirdeği aynen kullanır:** `statemachine/*` + `evaluator` + `blendOverrides`. Base/Chrono tip ayrımı tam bunun için yapıldı |
| B2 | Public API | aynı | `dispatch(event)`, `setParam(name,val)`, `on(event,cb)`, `play()/pause()`. Editördeki `dispatchSMEvent` / `setParamOverride` ile birebir aynı semantik |
| B3 | **Interactive HTML export** — player + JSON tek bağımsız dosyada | `src/lib/export/htmlExport.ts` (yeni) | BACKLOG'daki "SM runtime'ı JS'e derle" maddesi |
| B4 | Player testleri | `src/lib/player/__tests__` | dispatch→state geçişi, guard filtresi, blend ilerlemesi, setParam→guard |

**Mimari ilke:** Editör ve player **tek motoru** paylaşır — `StateMachineRuntime` + `evaluator` her ikisinde de çalışır. Kod tekrarı yok, davranış farkı yok. Editördeki Test Modu = küçültülmüş bir player.

**Player iskelet API:**
```ts
const player = new ChronoPlayer(runtimeSceneJson, canvasEl)
player.play()
player.dispatch('like')                 // event tabanlı geçiş
player.setParam('progress', 0.7)        // guard tabanlı + blend
player.on('animationComplete', () => …) // host'a geri bildirim
```

**Host entegrasyon örneği (Like butonu):**
```js
heartButton.addEventListener('click', () => player.dispatch('like'))
```

---

## İş Kolu C — Authoring Derinliği · M (3-4 gün)

State'lerin görsel olarak anlamlı olması için. (Canlı testte idle ve liked aynı görünüyordu çünkü timeline'lar boştu.)

| # | İş | Dosya(lar) | Açıklama |
|---|-----|-----------|----------|
| C1 | State seçilince **timeline panel o state'in timeline'ını** göstersin/düzenlesin | `app/page.tsx`, `TimelinePanel` | "idle" vs "liked"i ayrı keyframe'leyebilmek için kritik |
| C2 | **Duplicate state** (state + timeline'ını birlikte klonla) | `lib/editor/commands-statemachine.ts` | Varyant (hover/pressed/disabled) üretimini hızlandırır |
| C3 | Scene Explorer'da **state listesi** (`idle · 2.4s`) | `components/sceneExplorer/SceneExplorerPanel` | BACKLOG notu |
| C4 | **StateTrack visualizer** (read-only) | `lib/timeline/tracks.ts` | BACKLOG notu; timeline üzerinde aktif state göstergesi |

---

## İş Kolu D — Android / SDK · XL (sonraki faz)

Daha önce tasarımı konuşulan platform genişlemesi. Saf FSM çekirdeği (resolver/guard/blend) Kotlin'e port edilebilir çünkü 2D-editör'e özel hiçbir şey içermiyor.

| # | İş | Açıklama |
|---|-----|----------|
| D1 | `ChronoRuntime.kt` — evaluator + SM çekirdeğinin Kotlin portu | Saf mantık taşınır |
| D2 | `AndroidEventBridge.kt` — `MotionEvent` → `dispatch(SMEvent)` | hover/click/drag eşlemesi |
| D3 | Jetpack Compose `ChronoPlayer` composable | JSON yükle + oynat |
| D4 | Evrensel protokol: 3 komut — `fireEvent()`, `setParamOverride()`, `on(eventName, handler)` | Web ↔ Android ortak yüzey |

---

## Test planı

- [ ] A1 — her iki kenardan da transition çizilebiliyor; "+ Transition" butonu from/to ile çalışıyor
- [ ] A2 — initial state değişince Test Modu otomatik doğru state'i gösteriyor (Reset gerekmiyor)
- [ ] A3 — pan/zoom, çoklu seçim, Delete çalışıyor
- [ ] A4 — aynı çift arası iki kenar üst üste binmiyor
- [ ] B1 — `new ChronoPlayer(json)` JSON'ı yüklüyor, initial state'in timeline'ı oynuyor
- [ ] B2 — `dispatch('like')` doğru geçişi tetikliyor; `setParam` guard'ı besliyor
- [ ] B2 — `blendMs` süresince iki timeline ağırlıklı birleşiyor (player'da da)
- [ ] B3 — HTML export tek dosya, tarayıcıda gömülü çalışıyor
- [ ] B4 — player unit testleri (editör çekirdeğiyle aynı sonuç)
- [ ] C1 — state seçince timeline paneli o state'in timeline'ını düzenliyor
- [ ] C2 — duplicate state + timeline klonu undo/redo ile geri alınabiliyor

---

## Önerilen sıra (MVP yolu)

1. **A1 + A2** (~yarım gün) — canlı testte takıldığımız iki şey; hızlı kazanım, düşük risk
2. **B1–B4** (runtime player) — "uygulamada kullanma"yı asıl açan adım; en yüksek değer
3. **C1** (state-timeline authoring) — state'leri görsel anlamlı kılan parça
4. Kalan A/C cilası → sonra **D** (Android, ayrı faz)

**Tahmini efor:** A+B+C ≈ 2–2.5 hafta · D ayrı XL faz.

---

## Etkilenen / yeni dosyalar (özet)

| Dosya | İş Kolu | Değişim |
|-------|---------|---------|
| `components/panels/StateMachinePanel.tsx` | A1, A3 | iki-kenar handle, +Transition, pan/zoom, delete |
| `components/panels/statemachine/graphLayout.ts` | A1, A4 | handle konumları, parallel-edge offset |
| `app/hooks/useSMRuntime.ts` | A2 | initial değişiminde reset |
| `lib/statemachine/StateMachineRuntime.ts` | A2 | sync() reset kuralı |
| `lib/player/ChronoPlayer.ts` | B1, B2 | **YENİ** — runtime player |
| `lib/player/__tests__/*` | B4 | **YENİ** — player testleri |
| `lib/export/htmlExport.ts` | B3 | **YENİ** — interaktif HTML export |
| `app/page.tsx`, `TimelinePanel` | C1 | state seçince state-timeline düzenleme |
| `lib/editor/commands-statemachine.ts` | C2 | duplicate state komutu |
| `components/sceneExplorer/SceneExplorerPanel` | C3 | state listesi |
| `lib/timeline/tracks.ts` | C4 | StateTrack visualizer |
