# Chorono AI Planner — Revised Plan (V2)

> OpenClaude'un agent loop mimarisini inceleyip Chorono'ya uyarladık.
> V1 (mevcut implementasyon) ile tam uyumlu — sadece üstüne yeni katmanlar ekler.

---

## Karşılaştırma: Bizim Sistem vs OpenClaude

| Boyut | V1 (mevcut) | OpenClaude | V2 hedefi |
|---|---|---|---|
| **Loop** | Single-shot tool emission | `while (true)` continuation-passing | ✅ Multi-turn agent loop |
| **Tool keşfi** | Tüm tool'lar her request'te | Defer + `ToolSearchTool` | ✅ Capability domain + lazy load |
| **Read/Write ayrımı** | Yok | Runtime `isReadOnly(input)` | ✅ Eklenecek |
| **Concurrency** | Yok | Read-only batch paralel | ✅ Tools paralel çalışsın |
| **Context memoization** | Her turn'de yeniden hesap | Memoized (conversation-level) | ✅ |
| **Settings exposure** | Hard-coded prompt | `tool.prompt()` dinamik | ✅ Capability'lere dinamik prompt |
| **Dynamic discovery** | LayerRegistry → düz liste | searchHint + keyword search | ✅ Domain bazlı |
| **Error recovery** | UI'a hata göster, dur | Loop devam, retry, replan | ✅ Loop içinde |

---

## V2 Mimarisi

```
KULLANICI
   ↓
AIPanel.send(text)
   ↓
useAIPlanner ──── POST /api/ai ─────────────────────────┐
                                                         │
                            SERVER-SIDE AGENT LOOP       │
                            ┌─────────────────────────┐  │
                            │ for turn in 0..MAX:     │  │
                            │   1. capabilities =     │  │
                            │      CapabilityCatalog  │  │
                            │      .selectForContext()│  │
                            │   2. response =         │  │
                            │      callAIProvider()   │  │
                            │   3. if no toolCalls:   │  │
                            │      break              │  │
                            │   4. exec = execute(    │  │
                            │      toolCalls, scene)  │  │
                            │      → partition RO/RW  │  │
                            │      → parallel batch   │  │
                            │   5. scene = next       │  │
                            │   6. messages.append(   │  │
                            │      assistant, tools)  │  │
                            └─────────────────────────┘  │
                                       ↓                  │
                            { messages, scenePatches }   │
                                       ↓ ──────────────── ┘
client uygular: dispatchCommand × N
```

---

## Yeni Modül: CapabilityCatalog

V1'in `ActionRegistry`'sini sarmalayan **hiyerarşik organizasyon katmanı**.

### Tasarım

```typescript
// src/lib/ai/CapabilityCatalog.ts (YENİ)

export type CapabilityDomain =
  | 'scene'        // composition, clear, undo/redo
  | 'layer'        // add/update/delete layers (shape, text, group)
  | 'timeline'    // create/delete timelines, segments, markers
  | 'keyframe'    // add/move/delete keyframes, easing
  | 'style'        // fills, strokes, gradients, corner radius
  | 'effect'      // blur, glow, shadow, plugin effects
  | 'transform'    // x/y/scale/rotation, anchor, motion paths
  | 'interactive'  // triggers, parameters, bindings, state machine
  | 'media'        // assets (image/video/audio), import
  | 'layout'      // groups, alignment, distribution, repeater
  | 'preview'      // play, pause, seek, segment playback
  | 'export'      // runtime JSON, optimization
  | 'inspection'   // READ-ONLY: get_scene, describe_layer, list_keyframes

export interface Capability<P = Record<string, unknown>> extends ActionDef<P> {
  /** Domain bucket — organizes UI, search, and defer behavior. */
  domain: CapabilityDomain

  /** Comma-separated search keywords. ToolSearch matches against these. */
  searchHint?: string

  /** True if this tool does NOT mutate the scene (safe to parallelize). */
  isReadOnly?: (params: P) => boolean

  /** True for destructive ops (deletes, clears) — UI may warn before exec. */
  isDestructive?: (params: P) => boolean

  /**
   * Defer policy:
   *   'always'  → in initial tool list always
   *   'auto'    → defer if total tool count > THRESHOLD (default 30)
   *   'lazy'    → never in initial list, only via ToolSearch
   *
   * Use 'always' for core ops (add_layer, add_keyframes).
   * Use 'lazy' for rare ops (export, advanced effects).
   */
  defer?: 'always' | 'auto' | 'lazy'

  /**
   * Dynamic prompt fragment — generated per-request with current scene
   * state. Lets capabilities embed live data (e.g. "Current FPS is 30,
   * use multiples of 33ms for keyframes").
   */
  buildPromptFragment?: (scene: ChronoScene) => string | null
}
```

### Domain bucket örnekleri

| Domain | İçerdiği aksiyonlar | Defer policy |
|---|---|---|
| `scene` | `clear_scene`, `update_composition` | `always` |
| `layer` | `add_layer`, `update_layer`, `delete_layer`, `duplicate_layer` | `always` |
| `timeline` | `create_timeline`, `delete_timeline`, `add_segment`, `add_marker` | `always` |
| `keyframe` | `add_keyframes`, `move_keyframe`, `delete_keyframes`, `set_easing` | `always` |
| `style` | `apply_gradient`, `update_stroke`, `set_corner_radius` | `auto` |
| `effect` | `add_effect`, `update_effect_params` | `auto` |
| `interactive` | `add_trigger`, `add_parameter`, `add_binding` | `auto` |
| `layout` | `group_layers`, `ungroup`, `align`, `distribute` | `auto` |
| `media` | `add_image_layer`, `add_video_layer` | `lazy` (client-only) |
| `export` | `export_runtime_json`, `validate_runtime` | `lazy` |
| `inspection` | `get_scene`, `describe_layer`, `list_keyframes`, `evaluate_at` | `always` (read-only) |

### Tool yükleme mantığı

```typescript
// CapabilityCatalog.toAITools(scene, options)

function selectForContext(scene, options): AITool[] {
  const all = capabilities.getAll()
  const total = all.length
  const result: AITool[] = []

  for (const cap of all) {
    const policy = cap.defer ?? 'auto'

    if (policy === 'always') {
      result.push(toAITool(cap))
      continue
    }
    if (policy === 'lazy') {
      continue  // ToolSearch ile bulunsun
    }
    // 'auto'
    if (total <= AUTO_DEFER_THRESHOLD) {
      result.push(toAITool(cap))
    }
    // else: defer, ToolSearch ile bulunsun
  }

  // ToolSearch capability'sini her zaman ekle
  if (hasDeferred) result.push(toolSearchAITool())

  return result
}
```

---

## Settings/Ayarlar Sorusu

> "uygulamanın içinde birçok ayar var hepsi için özellik çıkarımı yapmamız mı gerekli?"

### Cevap: Hayır, **filtrele**

Chorono'daki ayarları 3 kategoriye ayır:

#### Kategori A — Animasyon-ilgili (tool olur)
LLM doğrudan değiştirebilir, geri alınabilir, sahneyi etkiler.
- ✅ Composition (width, height, fps, duration, bg)
- ✅ Timeline ayarları (loop, pingPong, loopCount, autoplay)
- ✅ Layer visibility window (startMs, endMs)
- ✅ Auto-keyframe modu (timelineSettings)
- ✅ Snap settings (sahne render'ını etkiler)

→ `actions/settings.ts` altında `update_composition_settings`, `update_timeline_settings`, vb. olarak ekle.

#### Kategori B — App-level preferences (NE TOOL NE PROMPT)
Kullanıcı kişisel tercihi, AI'ı ilgilendirmiyor.
- ❌ Theme (dark/light)
- ❌ Klavye kısayolları
- ❌ Dock layout
- ❌ Panel pozisyonları
- ❌ Recent files

→ Hiç dahil etme, prompt'u şişirme.

#### Kategori C — Read-only state (prompt context)
AI bilmeli ama değiştirmeyecek. SceneSerializer'a inject et.
- ℹ️ Current playhead time (zaten var)
- ℹ️ Selected layer/timeline (zaten var)
- ℹ️ Current zoom level
- ℹ️ Viewport visible area
- ℹ️ Active tool mode (select/pan/pen)
- ℹ️ Preview mode on/off

→ `SerializeOptions`'ı genişlet, `SceneSerializer` her serileştirmede embed etsin.

### Capability extraction prensibi

```
Settings × {okunmalı?} × {AI değiştirebilir?} × {kritik?}
   ↓
   A (kritik + değiştirilebilir)   → TOOL
   B (kritik DEĞİL)                → IGNORE
   C (okunmalı + değiştirilemez)   → SYSTEM PROMPT CONTEXT
```

### Pratik check-list

Bir ayarın AI tool'u olması için:
1. ✅ Sahneye direkt etkisi var mı? (animasyona dönüşür mü?)
2. ✅ Undo/redo ile geri alınabilir mi?
3. ✅ Doğal dil ile söylenmesi mantıklı mı? ("60fps yap" mantıklı, "tema koyu" mantıksız)
4. ✅ Diğer kullanıcılarla paylaşılan dosyaya yazılır mı? (export edilir)

3+ evet → tool yap.

---

## V2 Implementasyon Sırası

### Sprint A: CapabilityCatalog katmanı (2-3 gün)
Mevcut sistemi bozmadan üstüne ekler.

| # | Dosya | İş |
|---|---|---|
| 1 | `src/lib/ai/CapabilityCatalog.ts` | YENİ — `Capability` interface, `selectForContext()`, defer/search mantığı |
| 2 | `src/lib/ai/actions/*.ts` (5 dosya) | Her `reg.register()`'a `domain`, `searchHint`, `isReadOnly`, `defer` alanları ekle |
| 3 | `src/lib/ai/ActionRegistry.ts` | `toAITools()` artık `CapabilityCatalog.selectForContext()` çağırır |
| 4 | `src/lib/ai/CapabilityContext.ts` | Domain-bazlı grupla, prompt'ta daha okunaklı yap |
| 5 | `src/app/api/ai/route.ts` | Scene parametresini selectForContext'e geçir |
| 6 | Test | Mevcut MVP scenario'yu bozmadığını doğrula |

### Sprint B: ToolSearch capability (1-2 gün)
Tool sayısı > 30 olunca devreye girer.

| # | Dosya | İş |
|---|---|---|
| 1 | `src/lib/ai/actions/inspection.ts` | YENİ — `tool_search` aksiyonu, keyword bazlı |
| 2 | OpenClaude'daki `searchToolsWithKeywords` algoritmasını adapt et | `searchHint` + tool name + description üzerinde |
| 3 | API route iki-aşamalı: 1) light tool list 2) ToolSearch sonucu yeni request | |

### Sprint C: Read-only inspection tools (1 gün)
Multi-turn loop için lazım.

| # | Dosya | İş |
|---|---|---|
| 1 | `src/lib/ai/actions/inspection.ts` | `get_scene`, `describe_layer`, `list_keyframes`, `evaluate_at_time` |
| 2 | Her biri `isReadOnly: true` + `defer: 'always'` | |
| 3 | `Capability.read()` callback eklenir (toCommand yerine) | |

### Sprint D: Multi-turn agent loop (2-3 gün) — PHASE2_AGENT_LOOP.md
OpenClaude pattern'ini birebir adapt et.

| # | Dosya | İş |
|---|---|---|
| 1 | `src/app/api/ai/route.ts` | `while` loop, max turn=5, max total tools=30 |
| 2 | `tool_use_id` round-trip — Anthropic/OpenAI/Custom için providers.ts'de | |
| 3 | Server-side scene replay (read tool'lar için canlı state) | |
| 4 | Loop budget, abort signal, telemetry | |
| 5 | useAIPlanner UI: turn'leri ayrı bubble olarak göster | |

### Sprint E: Concurrency-safe execution (1 gün)
OpenClaude'un partition + parallel batch pattern'i.

| # | Dosya | İş |
|---|---|---|
| 1 | `PlannerExecutor.partitionToolCalls()` | RO/RW gruplara böl |
| 2 | RO grupları `Promise.all` ile paralel çalıştır | |
| 3 | RW grupları sıralı (commit_order korunsun) | |

### Sprint F: Memoization + context optimization (1 gün)
Pricing ve hız optimizasyonu.

| # | Dosya | İş |
|---|---|---|
| 1 | `CapabilityContext.buildCapabilityContext()` — memoize per session | |
| 2 | `serializeScene` — dirty bit ile cache, sahne değişince invalidate | |
| 3 | Token usage tracking, telemetry | |

**Toplam: ~10 gün**, ama Sprint A tek başına %50 değer veriyor (capability organizasyonu + temiz prompt).

---

## Karar Verilmesi Gerekenler

1. **Defer threshold:** 30 tool mu, 50 mi? Mevcut 7 tool'da defer'a gerek yok. Yeni capability'ler ekledikçe izle.

2. **Server-side scene state:** Multi-turn için iki seçenek:
   - **(A) Client uygular, server replay** — read tool çağrılınca server tüm prev commands'i sahneye uygular (deterministik ama yavaş)
   - **(B) Snapshot transfer** — client her round için güncel sahneyi gönderir (basit ama bandwidth)
   - **Öneri: B** — sahneler küçük (KB), trade-off basitlik lehine.

3. **ToolSearch zorunlu mu?** Eğer Chorono'da capability sayısı her zaman <50 kalacaksa ToolSearch eklemeye gerek yok. Domain-based grouping yeterli.

4. **Read tool'lar gerçekten lazım mı?** Multi-turn loop'ta LLM "ne yaptım, sonuç ne" sorusunu sorabilir. Eğer sahneyi her turn snapshot olarak gönderirsek read tool gereksiz olabilir.

---

## V1'den V2'ye Migration Yolu

**Hiçbir breaking change yok.** Sprint A bittiğinde:
- Mevcut 7 action otomatik olarak `domain` + `searchHint` kazanır
- AIPanel aynı çalışır
- MVP scenario aynı sonucu verir
- Sadece daha temiz prompt + daha az token

Sprint D (multi-turn) opsiyonel kalır — single-shot mode çalışmaya devam eder.

---

## Özet

| Soru | Cevap |
|---|---|
| Capability yapısı lazım mı? | **Evet** — `CapabilityCatalog` domain-based organizasyon + defer policy |
| Tüm ayarlar tool olmalı mı? | **Hayır** — A (animasyon-ilgili) tool, B (kişisel) ignore, C (read-only state) prompt context |
| Multi-turn loop gerekli mi? | **Evet ama opsiyonel** — Sprint D, sahne karmaşıklaşınca devreye |
| ToolSearch lazım mı? | **Tool sayısı 30+ olunca** — şimdilik 7 var, prematür optimizasyon |
| OpenClaude pattern'i ne kadar adapte? | **%70** — multi-turn, RO/RW, memoization, defer + ToolSearch |
| Ne adapte etmeyelim? | OpenClaude'un dosya/bash tooling'i + Ink UI (alakasız) |

**Sonraki adım:** Sprint A (CapabilityCatalog) — `feature/ai-capability-catalog` branch'inde başla.
