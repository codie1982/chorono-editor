# Chorono AI Agent — openClaude Port Plan (V3)

> **V3 V2'yi geçersiz kılar.** OpenClaude'un agent loop mimarisini birebir
> port ediyoruz — kendi soyutlamalarımızı eklemiyoruz.
> "Pattern'leri öğret, hatırla, kopyala" prensibi.

---

## Felsefe değişikliği (V2 → V3)

| V2 yaklaşımı | V3 yaklaşımı |
|---|---|
| `CapabilityCatalog` (bizim ürettiğimiz soyutlama) | `Tool` interface (openClaude'un) — birebir |
| `domain` bucket'lar (bizim grouplama) | `searchHint` + `shouldDefer` (openClaude'un) |
| `selectForContext()` (kendi defer mantığımız) | `prepareToolsForAPI` (openClaude'un) |
| `buildPromptFragment(scene)` (bizim) | `tool.prompt(options)` (openClaude'un) |
| `actions/*.ts → ActionDef` (mevcut V1) | `tools/*.ts → Tool` (openClaude convention) |

V1'i tutuyoruz ama yeni `Tool` interface'i altında bridge yazıyoruz. Breaking change yok.

---

## 8 OpenClaude Pattern'i ve Chorono Adresleri

### Pattern 1: `queryLoop` — sürekli akış agent loop'u
**Kaynak:** `/openclaude/src/query.ts:307-1734`
**Chorono adres:** `src/lib/ai/queryLoop.ts` (YENİ)

`while (true)` generator. Her iterasyonda:
1. Model çağrısı → AssistantMessage akar
2. `tool_use` blok varsa → orchestrator çalışır
3. `tool_result`'lar messages'a eklenir → loop devam
4. Stop reason `'tool_use'` değilse → çık

**Minimum state:** `{ messages, sceneContext, turnCount }`. Telemetri, compaction, recovery yok.

### Pattern 2: `Tool` interface — capability deklarasyonu
**Kaynak:** `/openclaude/src/Tool.ts:370-650`
**Chorono adres:** `src/lib/ai/Tool.ts` (YENİ)

```typescript
interface Tool<Input, Output> {
  // ZORUNLU
  name: string
  description: string
  inputSchema: JSONSchema | ZodSchema
  call(args, ctx): Promise<ToolResult>
  isConcurrencySafe(input): boolean
  isReadOnly(input): boolean

  // OPSİYONEL ama güçlü
  searchHint?: string                          // ToolSearch için
  shouldDefer?: boolean                        // lazy load
  alwaysLoad?: boolean                         // defer olsa bile her zaman
  isDestructive?(input): boolean              // UI uyarısı için
  prompt?(options): Promise<string>            // dinamik prompt fragment
  mapToolResultToToolResultBlockParam(out, id) // Anthropic format
}
```

V1'deki `ActionDef`'leri `Tool` adapter ile sarmalıyoruz — kod yazmadan upgrade.

### Pattern 3: `SceneContext` — paylaşılan state
**Kaynak:** `/openclaude/src/Tool.ts:158-308` (ToolUseContext)
**Chorono adres:** `src/lib/ai/SceneContext.ts` (YENİ)

OpenClaude'un `ToolUseContext`'i bizde `SceneContext`:
- `scene: ChronoScene` (mevcut)
- `availableTools: Tool[]` (registry'den)
- `abortSignal: AbortSignal`
- `updateScene(updater)` — tools sahneyi mutate eder
- `onToolProgress?(progress)` — UI'a stream

OpenClaude'da olan ama bizde olmayan: fileReadingLimits, mcpClients, readFileState, hooks, agentId.

### Pattern 4: `orchestrateTools` — partition + paralel batch
**Kaynak:** `/openclaude/src/services/tools/toolOrchestration.ts:19-189`
**Chorono adres:** `src/lib/ai/toolOrchestration.ts` (YENİ)

```
partitionToolCalls(blocks, ctx) → [
  { isSafe: true,  blocks: [readA, readB, readC] },  // PARALEL
  { isSafe: false, blocks: [writeA] },                // SIRALI
  { isSafe: true,  blocks: [readD] },                 // PARALEL
  { isSafe: false, blocks: [writeB, writeC] },        // SIRALI
]
```

**Algoritma:** Ardışık RO tool'lar batch'lenir, herhangi bir WR tool batch'i böler.
**Sonuç:** Chorono'da örneğin `get_scene + describe_layer + list_keyframes` paralel çalışır, `add_layer + add_keyframes` sıralı çalışır.

### Pattern 5: Deferred tools + `ToolSearch`
**Kaynak:** `/openclaude/src/tools/ToolSearchTool/ToolSearchTool.ts:186-302`
**Chorono adres:** `src/lib/ai/toolSearch.ts` + `src/lib/ai/tools/ToolSearchTool.ts` (YENİ)

```
prepareToolsForAPI(allTools) → {
  tools:           [light list — shouldDefer:false olanlar],
  deferredNames:   [defer edilenlerin ismi],
}
```

Model `ToolSearch(query="rotate layer")` çağırır → keyword skoru:
- name match: +10
- searchHint match: +5
- description word match: +2

Top 5 dönüyor. Model sonra o tool'ları doğrudan çağırır.

**Bizim için ne zaman aktif:** Tool sayısı > 30 olunca. Şu an 7 var → erteleyebiliriz.

### Pattern 6: Memoized context
**Kaynak:** `/openclaude/src/context.ts:116-189`
**Chorono adres:** `src/lib/ai/contextCache.ts` (YENİ)

`memoize` ile `getSystemContext()`, `getSceneContext()` cache'lenir. Konuşma boyunca aynı kalır, sadece `clearContextCache()` ile temizlenir (örn. yeni session, scene reset).

### Pattern 7: Dynamic `tool.prompt()`
**Kaynak:** `/openclaude/src/tools/BashTool/prompt.ts:27-250`
**Chorono adres:** Her tool dosyasında `prompt()` metodu

Tool prompt'unu **runtime'da** sahneye bakarak üretir:
```typescript
async prompt(options) {
  const scene = options.sceneContext.scene
  return `## ${this.name}

Current canvas: ${scene.composition.width}×${scene.composition.height}
Selected layer: ${scene.selectedLayerId ?? 'none'}
Recently animated: ${scene.recentlyEditedLayers.join(', ')}

Use this tool when...`
}
```

**Bu pattern settings sorusunun cevabı** (aşağıda).

### Pattern 8: Tool result formatı
**Kaynak:** `/openclaude/src/Tool.ts:565-568` + `/services/api/openaiShim.ts`
**Chorono adres:** `src/lib/ai/messageFormat.ts` (YENİ) + her tool'da `mapToolResultToToolResultBlockParam`

Tool sonucu Anthropic'in `tool_result` content block formatında geri döner — provider'a göre OpenAI'a translate edilir. `tool_use_id` round-trip kritik (multi-turn için).

---

## Settings/Ayarlar Sorusu — V3 Cevabı

> "uygulamanın içinde birçok ayar var hepsi için özellik çıkarımı yapmamız mı gerekli?"

**Hayır. OpenClaude pattern'i:** Ayarları **`tool.prompt()` içine dinamik gömeriyoruz**, ayrı tool yapmıyoruz.

### Örnek — `add_keyframes` tool'unun prompt'u:

```typescript
async prompt({ sceneContext }) {
  const { scene } = sceneContext
  const fps = scene.composition.frameRate
  const frameMs = 1000 / fps
  const selectedTimeline = scene.timelines.find(t => t.id === scene.selectedTimelineId)
  const snapMs = scene.timelineSettings.snapToFrame ? frameMs : null
  const autoKey = scene.timelineSettings.autoKeyframe

  return `## add_keyframes

Add keyframes to animate a layer property.

**Current settings (read these — they constrain valid values):**
- Frame rate: ${fps}fps (frame = ${frameMs.toFixed(2)}ms)
- Active timeline: ${selectedTimeline?.id ?? 'none'} (${selectedTimeline?.durationMs ?? '?'}ms)
${snapMs ? `- Snap: keyframe times will round to multiples of ${snapMs.toFixed(2)}ms` : '- Snap: off'}
- Auto-keyframe: ${autoKey ? 'on (modifying properties creates keyframes automatically)' : 'off'}

**Track target format:** layers.{layerId}.{property}
${listAvailableProperties()}`
}
```

LLM `add_keyframes`'i kullanmaya hazırlanırken **mevcut ayarları görüyor**. Ayrı `get_settings` çağrısı yapmasına gerek yok, tool kendisi açıklıyor.

### Settings kategorileri (V2'den taşındı, hala geçerli)

| Kategori | Örnek | Nasıl ele al |
|---|---|---|
| **A — Animasyon-ilgili** | composition, timeline ayarları, layer visibility | Tool ✅ (`update_composition`, `update_timeline_settings`) |
| **B — App-level pref** | tema, kısayollar, dock layout | **HİÇ EXPOSE ETME** |
| **C — Read-only state** | playhead, selection, zoom, snap mode | **`tool.prompt()` içinde dinamik göster** |

**Pratik kural:** Eğer ayar bir tool'un nasıl çalışacağını etkiliyorsa, o tool'un `prompt()`'una göm. Tool'un kendisi yapma.

---

## Migration: V1 → V3

### Mevcut V1 dosyaları (KORUNUR)

```
src/lib/ai/
├── types.ts                    ✅ Tut
├── providers.ts                ✅ Tut (callAIProvider ana giriş)
├── ActionRegistry.ts            ✅ Tut (Tool adapter buradan üretir)
├── PlannerExecutor.ts          ⚠ Faz değiştir: queryLoop'un client tarafı oldu
├── actions/*.ts (5 dosya)      ✅ Tut (her biri Tool olarak adapter'lanır)
├── SceneSerializer.ts          ✅ Tut (sceneContext fragment'i için)
├── tools.ts (buildSystemPrompt) ⚠ Refactor: tool.prompt()'lar toplanır
├── CapabilityContext.ts         ⚠ tool.prompt() pattern'ine eridi
```

### Yeni V3 dosyaları (EKLENİR)

```
src/lib/ai/
├── Tool.ts                     ← Pattern 2: interface
├── SceneContext.ts             ← Pattern 3: shared state
├── queryLoop.ts                ← Pattern 1: while(true) generator
├── toolOrchestration.ts        ← Pattern 4: partition + parallel batch
├── toolSearch.ts               ← Pattern 5: keyword search (deferred)
├── contextCache.ts             ← Pattern 6: memoization
├── messageFormat.ts            ← Pattern 8: tool_result format
├── actionToTool.ts             ← ADAPTER: ActionDef → Tool
├── pendingSessions.ts          ← Sprint G: ask_user pending state store
└── tools/
    ├── ToolSearchTool.ts       ← Built-in deferred discovery
    ├── GetSceneTool.ts         ← Read tool (inspection)
    ├── DescribeLayerTool.ts    ← Read tool (inspection)
    └── AskUserTool.ts          ← Sprint G: clarification turn

src/components/ai/
└── QuestionBubble.tsx          ← Sprint G: soru UI

src/app/api/ai/
├── route.ts                    ← genişletildi (awaiting_user response)
└── answer/
    └── route.ts                ← Sprint G: cevap endpoint'i
```

### Adapter mantığı: V1 ActionDef → V3 Tool

```typescript
// src/lib/ai/actionToTool.ts
export function actionToTool(action: ActionDef): Tool {
  return {
    name: action.toolName,
    description: action.description,
    inputJSONSchema: { type: 'object', ...action.parameters },

    // V1'de yoktu, default değerler:
    isConcurrencySafe: () => false,  // Mevcut action'lar hep WR
    isReadOnly:        () => false,
    shouldDefer:       false,
    searchHint:        action.id.replace(/\./g, ' '),

    async call(input, ctx) {
      const cmd = action.toCommand(input, ctx.scene)
      if (!cmd) return { data: { applied: false } }
      // Server-side: command'i execute et, yeni sahneyi context'e yaz
      const nextScene = cmd.execute(ctx.scene)
      ctx.updateScene(() => nextScene)
      return { data: { applied: true, label: cmd.label } }
    },

    mapToolResultToToolResultBlockParam(out, id) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: out.applied ? `Applied: ${out.label}` : 'No-op',
        is_error: !out.applied,
      }
    },
  }
}
```

5 mevcut action otomatik olarak 5 Tool olur. Yeni read tool'lar elle yazılır.

---

## 6 Sprintlik Yol Haritası (Sprint G dahil)

| Sprint | İçerik | Çıktı | Süre | Bağımlılık |
|---|---|---|---|---|
| **A** | Pattern 2 + 3 + 8 + adapter | `Tool`, `SceneContext`, `messageFormat`, `actionToTool` — mevcut sistem yeni interface altında çalışır | 1-2 gün | — |
| **B** | Pattern 1 + 4 — queryLoop + orchestration | Server-side multi-turn loop, RO/RW partition. API route refactor. | 2 gün | A |
| **C** | Read tools (inspection) | `GetSceneTool`, `DescribeLayerTool`, `ListKeyframesTool`. Loop artık AI'ın "ne yaptım?" sorabilmesini sağlar. | 1 gün | B |
| **D** | Pattern 6 + 7 — memoize + dynamic prompts | `contextCache`, her tool'a `prompt()` metodu. Settings buraya gömülür. | 1 gün | A |
| **E** | Pattern 5 — ToolSearch (gerekirse) | Tool sayısı 30+ olunca aktive edilir. Şu an opsiyonel. | 1-2 gün | A |
| **G** | `ask_user` — clarification turn | AI belirsizlikte sana soru sorabilir, cevabınla devam eder. UI'da soru baloncuğu. | 1-1.5 gün | B |

**Toplam minimum (A+B+C+D+G): 6-7.5 gün** — sorular sorabilen, gerçek diyalog yapan agent.

---

## Sprint G — `ask_user` Clarification Turn (Detay)

> Agent loop'un üstüne oturan **soru-cevap katmanı**. AI belirsizlik gördüğünde
> tahmin yapmak yerine kullanıcıya sorar, cevabı bekler, sonra devam eder.

### Akış

```
SEN:    "sahnedeki mavi şeylere fade-in ekle"

TUR 1
  Planner → GetSceneTool({}) — sahneyi oku
         → 3 mavi layer var: card_bg, header, button
         → Belirsiz! Hangisi? Tahmin etmemeli.
  Planner → ask_user({
              question: "3 mavi layer buldum. Hangisine fade-in ekleyeyim?",
              type: "choice",
              options: [
                { id: "all",    label: "Hepsi (3)" },
                { id: "header", label: "Sadece header" },
                { id: "button", label: "Sadece button" },
                { id: "cancel", label: "İptal" },
              ]
            })

  → Loop PENDING durumuna geçer, server response döner:
    { status: "awaiting_user", questionId: "q_abc123", question: {...} }

[UI'da soru baloncuğu açılır, butonlar render olur]

SEN     → "Hepsi (3)" tıklarsın
[POST /api/ai/answer { questionId: "q_abc123", answer: "all" }]

TUR 2 (loop devam eder, server'da kaldığı yerden)
  → tool_result(ask_user, "all") → messages'a eklenir
  Planner → add_keyframes × 3 (card_bg, header, button için)
  Stop reason: end_turn
  → "3 mavi katmana 500ms fade-in ekledim."
```

### `ask_user` Tool Şeması

```typescript
// src/lib/ai/tools/AskUserTool.ts
export const AskUserTool: Tool<AskUserInput, AskUserOutput> = {
  name: 'ask_user',
  description: 'Ask the user a clarification question when intent is ambiguous, ' +
               'before a destructive operation, or when a critical numeric value ' +
               'is missing. NEVER use this for trivial preferences.',
  searchHint: 'ask question clarify confirm choice',

  inputJSONSchema: {
    type: 'object',
    required: ['question', 'type'],
    properties: {
      question: { type: 'string', description: 'Question shown to user' },
      type: {
        type: 'string',
        enum: ['choice', 'text', 'number', 'confirm'],
        description: 'UI widget type',
      },
      // For 'choice'
      options: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string', description: 'Optional explanation' },
          },
        },
      },
      // For 'number'
      min: { type: 'number' },
      max: { type: 'number' },
      defaultValue: { description: 'Pre-filled value' },
      // For 'text'
      placeholder: { type: 'string' },
      // For all
      urgency: {
        type: 'string',
        enum: ['info', 'warning', 'danger'],
        description: 'danger = destructive op, shows red warning UI',
      },
    },
  },

  isConcurrencySafe: () => false,  // pauses entire loop
  isReadOnly:        () => true,   // doesn't mutate scene
  isDestructive:     () => false,

  async call(input, ctx) {
    // SPECIAL: doesn't execute immediately. Server marks loop as PENDING
    // and returns control to HTTP handler with the question payload.
    // Resumed when client POSTs answer via /api/ai/answer.
    throw new PendingAskUserSignal(input)  // Caught by queryLoop, surfaces to handler
  },

  mapToolResultToToolResultBlockParam(answer, toolUseId) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify(answer),  // { id: "all" } or { value: "yes" } etc.
    }
  },
}

interface AskUserInput {
  question: string
  type: 'choice' | 'text' | 'number' | 'confirm'
  options?: Array<{ id: string; label: string; description?: string }>
  min?: number; max?: number; defaultValue?: unknown
  placeholder?: string
  urgency?: 'info' | 'warning' | 'danger'
}

interface AskUserOutput {
  id?: string        // for 'choice' — selected option id
  value?: unknown    // for 'text' / 'number' / 'confirm'
  cancelled?: true   // user clicked Cancel or closed
}
```

### Server-side Pending State

```typescript
// src/lib/ai/pendingSessions.ts
// In-memory only (per-process). For multi-user prod: Redis.
// Single user app → in-memory yeterli.

interface PendingSession {
  sessionId: string
  questionId: string
  question: AskUserInput
  toolUseId: string           // tool_use_id round-trip için
  loopState: QueryState        // loop'un kaldığı yer
  createdAt: number
}

const PENDING_TIMEOUT_MS = 5 * 60 * 1000  // 5 dakika

class PendingSessionStore {
  private sessions = new Map<string, PendingSession>()

  create(sessionId: string, question: AskUserInput, toolUseId: string, state: QueryState): string {
    const questionId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    this.sessions.set(questionId, {
      sessionId, questionId, question, toolUseId,
      loopState: state, createdAt: Date.now(),
    })
    this.scheduleTimeout(questionId)
    return questionId
  }

  consume(questionId: string): PendingSession | null {
    const session = this.sessions.get(questionId)
    if (!session) return null
    this.sessions.delete(questionId)
    return session
  }

  private scheduleTimeout(questionId: string) {
    setTimeout(() => {
      if (this.sessions.has(questionId)) {
        this.sessions.delete(questionId)
        // Optionally emit a "question expired" event to client
      }
    }, PENDING_TIMEOUT_MS)
  }
}

export const pendingSessions = new PendingSessionStore()
```

### HTTP API

İki endpoint:

```
POST /api/ai
  Body: { userMessage, scene, history, mode }
  Response (normal completion):
    { status: 'completed', messages: [...], appliedLabels: [...] }
  Response (pending question):
    { status: 'awaiting_user', questionId: 'q_abc123', question: {...},
      partialMessages: [...], partialAppliedLabels: [...] }

POST /api/ai/answer
  Body: { questionId: 'q_abc123', answer: { id: 'all' } | { value: '...' } | { cancelled: true } }
  Response: aynı yukarıdaki — loop devam etmiş halde
```

### UI: `QuestionBubble` Komponenti

```typescript
// src/components/ai/QuestionBubble.tsx
interface QuestionBubbleProps {
  question: AskUserInput
  questionId: string
  onAnswer: (questionId: string, answer: AskUserOutput) => void
  onCancel: (questionId: string) => void
}

export function QuestionBubble({ question, questionId, onAnswer, onCancel }: QuestionBubbleProps) {
  const isDanger = question.urgency === 'danger'

  return (
    <div className={`rounded-lg p-3 border ${
      isDanger
        ? 'bg-red-900/40 border-red-700'
        : 'bg-amber-900/30 border-amber-700'
    }`}>
      <div className="flex gap-2 mb-2">
        <span>{isDanger ? '⚠' : '🤔'}</span>
        <p className="text-xs whitespace-pre-wrap">{question.question}</p>
      </div>

      {question.type === 'choice' && question.options && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map(opt => (
            <button
              key={opt.id}
              onClick={() => onAnswer(questionId, { id: opt.id })}
              title={opt.description}
              className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700"
            >{opt.label}</button>
          ))}
        </div>
      )}

      {question.type === 'confirm' && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onAnswer(questionId, { value: true })}
            className={`text-[10px] px-3 py-1 rounded ${
              isDanger ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-700 hover:bg-emerald-600'
            }`}
          >Evet</button>
          <button
            onClick={() => onCancel(questionId)}
            className="text-[10px] px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >İptal</button>
        </div>
      )}

      {(question.type === 'text' || question.type === 'number') && (
        <NumericOrTextInput
          type={question.type}
          min={question.min} max={question.max}
          placeholder={question.placeholder}
          defaultValue={question.defaultValue}
          onSubmit={(value) => onAnswer(questionId, { value })}
        />
      )}
    </div>
  )
}
```

### Hook Genişlemesi

`useAIPlanner`'a ek state:

```typescript
interface UseAIPlannerReturn {
  // ... mevcutlar ...
  pendingQuestion: { questionId: string; question: AskUserInput } | null
  answerQuestion: (questionId: string, answer: AskUserOutput) => Promise<void>
  cancelQuestion: (questionId: string) => Promise<void>
}

// answerQuestion implementasyonu:
async function answerQuestion(questionId, answer) {
  setPendingQuestion(null)
  // Aynı loading UX'i göster
  const res = await fetch('/api/ai/answer', {
    method: 'POST',
    body: JSON.stringify({ questionId, answer }),
  })
  const data = await res.json()

  if (data.status === 'awaiting_user') {
    // AI bir soru daha sordu — yeni pending state
    setPendingQuestion({ questionId: data.questionId, question: data.question })
  } else {
    // Loop tamamlandı, mesajları append et, komutları dispatch et
    // ... (mevcut completion handling)
  }
}
```

### 3 Etkileşim Modu

AIPanel header'ına dropdown:

```
🤖 AI Planner   [Asistan ▼]
                 ├─ Pilot     — Hiç sormaz, her şeyi kararlaştırır
                 ├─ Asistan   — Belirsizlik + yıkıcı işlemde sorar (varsayılan)
                 └─ Stajyer   — Her küçük kararı sorar
```

Sistem prompt'una mod-spesifik talimat eklenir:

```typescript
// buildSystemPrompt — mod parametresi alır
function buildAskUserGuidance(mode: 'pilot' | 'assistant' | 'intern'): string {
  if (mode === 'pilot') {
    return 'NEVER call ask_user. Make reasonable assumptions and proceed. ' +
           'Only stop on incoherent requests.'
  }
  if (mode === 'intern') {
    return 'Call ask_user FREQUENTLY. Confirm intent before any mutation. ' +
           'When >1 layer matches a description, always ask which.'
  }
  // assistant (default)
  return `Call ask_user when:
- Multiple layers match an ambiguous reference (e.g. "the blue one" but 3 exist)
- About to delete or clear (always confirm destructive ops)
- A critical numeric value is missing (duration, color, count)
- Two equally valid approaches exist (fade vs slide)

Do NOT call ask_user for:
- Trivial cosmetic preferences (default easing, default fps)
- Decisions you can make from scene context alone
- Confirmations the user clearly granted already`
}
```

### Edge Case Tablosu

| Senaryo | Davranış |
|---|---|
| Kullanıcı pencereyi kapatırsa | 5dk timeout, sonra session silinir, loop iptal |
| Kullanıcı yeni mesaj yazarsa (soru beklerken) | Yeni mesaj soru session'ını iptal eder, loop baştan başlar |
| AI üst üste 3 kez soru sorarsa | Loop'u zorla durdur, "Talep çok belirsiz, daha net tarif eder misin?" döner |
| Kullanıcı "İptal" derse | `ask_user` `{ cancelled: true }` döner, AI ya devam yolu seçer ya da kibarca biter |
| Tek HTTP request'te birden fazla soru ihtiyacı | Her seferinde tek soru — loop pause/resume şeklinde |
| Pending state'in TTL'i dolarsa | Client polling yapıyorsa "expired" event'i alır; yoksa sessizce kaybolur |
| Server restart (dev sırasında) | In-memory pending session'lar kaybolur; client "session expired" hatası gösterir |
| Kullanıcı geri butonu / undo basarsa | Pending state korunur (sahne değişse bile soru hala geçerli olabilir) |

### Tool Use ID Round-Trip Notu

`ask_user` özel — `call()` immediate olarak result dönmüyor. queryLoop bunu nasıl ele alır:

```typescript
// queryLoop içinde — PendingAskUserSignal throw'unu yakala
try {
  const result = await tool.call(input, ctx)
  // ... normal handling
} catch (err) {
  if (err instanceof PendingAskUserSignal) {
    const questionId = pendingSessions.create(
      sessionId, err.input, toolUseBlock.id, state,
    )
    return {
      status: 'awaiting_user',
      questionId,
      question: err.input,
      partialMessages: messagesSoFar,
    }
  }
  throw err  // başka hata — yukarı fırlat
}
```

`/api/ai/answer` cevap geldiğinde:

```typescript
const session = pendingSessions.consume(questionId)
if (!session) return error('Question expired or already answered')

// tool_result mesajı oluştur, loop'a inject et
const toolResultMsg = {
  role: 'user',
  content: [{
    type: 'tool_result',
    tool_use_id: session.toolUseId,
    content: JSON.stringify(answer),
  }],
}

// Loop'u kaldığı yerden devam ettir
const updatedState = {
  ...session.loopState,
  messages: [...session.loopState.messages, toolResultMsg],
}
return await continueQueryLoop(updatedState)
```

### Mod Defaults — Yıkıcı İşlem Koruması

Mod ne olursa olsun, **`isDestructive: true` olan tool'lar Asistan/Stajyer modunda otomatik olarak `ask_user` öncesi confirm** ister. Sistem prompt'a wrap edici talimat:

```
Before calling any tool with isDestructive=true (clear_scene, delete_layer, etc.),
you MUST first call ask_user with type='confirm', urgency='danger' UNLESS the
user's last message explicitly authorized it (e.g. "tüm layerları sil").
```

### Hata Yönetimi

| Hata | Davranış |
|---|---|
| `ask_user` schema'sı eksik (örn. options yok ama type=choice) | Tool error: "ask_user invalid: choice requires options". Loop devam, AI tekrar denesin. |
| Client `/api/ai/answer` yanıtı server'a ulaşmıyor | Frontend retry × 2, sonra "bağlantı koptu" göster, pending state UI'da kalsın. |
| Aynı questionId'ye iki cevap | İlki kazanır, ikinciye "already answered" döner. |

---

## MVP Test Senaryoları (V3 sonrası)

### Senaryo 1 — Tek mavi (sorgu gereksiz)

Kullanıcı: **"Sahnedeki mavi şeye fade-in ekle"** (sahnede 1 mavi var)

```
Turn 1: GetSceneTool({}) → "red_box, blue_circle, green_text"
Turn 2: add_keyframes(target=layers.blue_circle.opacity, ...) → Applied
Turn 3: "Mavi daireye 500ms fade-in ekledim." (end_turn)
```

### Senaryo 2 — 3 mavi (sorgu devreye girer — Sprint G)

Kullanıcı: **"Mavi şeylere fade-in ekle"** (sahnede 3 mavi var)

```
Turn 1: GetSceneTool({}) → "card_bg #3B82F6, header #2563EB, button #60A5FA"
Turn 2: ask_user({
          question: "3 mavi layer var. Hangisine?",
          type: "choice",
          options: [{id:"all",label:"Hepsi"}, {id:"header",label:"Header"}, ...]
        })
        → LOOP PENDING, HTTP response: awaiting_user

[UI'da soru baloncuğu → kullanıcı "Hepsi" tıklar → POST /api/ai/answer]

Turn 2 devam: tool_result(ask_user, {id:"all"}) loop'a inject
Turn 3: add_keyframes × 3 (card_bg, header, button)
Turn 4: "3 mavi layer'a 500ms fade-in ekledim." (end_turn)
```

### Senaryo 3 — Yıkıcı işlem (otomatik confirm)

Kullanıcı: **"sahneyi temizle"**

```
Turn 1: ask_user({
          question: "Sahneyi temizleyecek — 5 layer, 2 timeline silinecek. Emin misin?",
          type: "confirm", urgency: "danger"
        })
        → PENDING

[Kırmızı uyarı baloncuğu → kullanıcı "Evet" tıklar]

Turn 2: clear_scene({}) → Applied
Turn 3: "Sahne temizlendi." (end_turn)
```

V1'de Senaryo 2 ve 3 imkansız: AI ya tahmin yapıyor (yanlış layer'a animasyon, sahneyi sormadan temizleyiş) ya da çuvallıyor.

---

---

# EK: BOŞLUK DOLGULARI (openClaude'dan port)

Bu bölüm PLAN_V3'ün eksik kalan teknik detaylarını openClaude kaynak kodundan
port edilen örneklerle doldurur. Her bölüm bir gap'i kapatır.

---

## DOLGU 1 — `queryLoop` Tam Kodu

**Kaynak:** `/openclaude/src/query.ts:241-1735`

### State tanımı
```typescript
// src/lib/ai/queryLoop.ts
import type { ChronoScene } from '@/lib/types'
import type { Tool } from './Tool'
import type { SceneContext } from './SceneContext'
import type { Message, AssistantMessage, ToolUseBlock } from './messageTypes'

export interface QueryState {
  messages: Message[]
  sceneContext: SceneContext  // scene + tools + abortSignal
  turnCount: number
  transition?: { reason: string }
}

export interface QueryParams {
  initialMessages: Message[]
  sceneContext: SceneContext
  systemPrompt: string
  /** undefined = no limit. Önerilen: 15. */
  maxTurns?: number
  /** Provider seçimi + model + key */
  providerConfig: AIProviderConfig
}

export type Terminal =
  | { reason: 'completed'; turnCount: number }
  | { reason: 'aborted_streaming' }
  | { reason: 'aborted_tools' }
  | { reason: 'max_turns'; turnCount: number }
  | { reason: 'model_error'; error: Error }
  | { reason: 'awaiting_user'; questionId: string; question: AskUserInput }  // Sprint G

export type StreamEvent =
  | { type: 'stream_request_start'; turnCount: number }
  | { type: 'assistant'; message: AssistantMessage }
  | { type: 'tool_result'; message: Message; label: string }
  | { type: 'attachment'; attachment: { type: 'max_turns_reached'; turnCount: number } }
  | { type: 'error'; error: string }
```

### Ana loop
```typescript
export async function* queryLoop(
  params: QueryParams,
): AsyncGenerator<StreamEvent, Terminal> {
  const { systemPrompt, providerConfig, maxTurns = 15 } = params

  let state: QueryState = {
    messages:     params.initialMessages,
    sceneContext: params.sceneContext,
    turnCount:    1,
    transition:   undefined,
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let { sceneContext } = state
    const { messages, turnCount } = state

    yield { type: 'stream_request_start', turnCount }

    // ─── ABORT CHECK (tur başı) ────────────────────────────────────────
    if (sceneContext.abortSignal.aborted) {
      return { reason: 'aborted_streaming' }
    }

    // ─── MODEL ÇAĞRISI ─────────────────────────────────────────────────
    const assistantMessages: AssistantMessage[] = []
    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false

    try {
      const tools = prepareToolsForAPI(sceneContext.availableTools, sceneContext.scene)
      const fullSystem = await buildSystemPromptWithDynamic(systemPrompt, sceneContext)

      const response = await callAIProvider(
        providerConfig, messages, tools, fullSystem,
        sceneContext.abortSignal,
      )

      // Tek mesaj döner (streaming yoksa); streaming'de chunk'lar
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content: [
          ...(response.message ? [{ type: 'text' as const, text: response.message }] : []),
          ...response.toolCalls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id, name: tc.name, input: tc.input,
          })),
        ],
        stop_reason: response.toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      }
      assistantMessages.push(assistantMsg)
      yield { type: 'assistant', message: assistantMsg }

      if (response.toolCalls.length > 0) {
        toolUseBlocks.push(...assistantMsg.content
          .filter((c): c is ToolUseBlock => c.type === 'tool_use'))
        needsFollowUp = true
      }
    } catch (error) {
      const err = error as Error
      yield { type: 'error', error: err.message }
      return { reason: 'model_error', error: err }
    }

    // ─── ABORT CHECK (model çağrısı sonrası) ───────────────────────────
    if (sceneContext.abortSignal.aborted) {
      return { reason: 'aborted_streaming' }
    }

    // ─── TERMINATION: tool çağırmadı → bitti ──────────────────────────
    if (!needsFollowUp) {
      return { reason: 'completed', turnCount }
    }

    // ─── TOOL EXECUTION (orchestrator) ─────────────────────────────────
    const toolResults: Message[] = []
    try {
      for await (const update of orchestrateTools(
        toolUseBlocks, assistantMessages, sceneContext,
      )) {
        if (update.message) {
          yield { type: 'tool_result', message: update.message, label: update.label ?? '' }
          toolResults.push(update.message)
        }
        if (update.newContext) {
          sceneContext = update.newContext   // ← scene mutation flows in
        }
        if (update.pendingAskUser) {        // ← Sprint G
          return {
            reason: 'awaiting_user',
            questionId: update.pendingAskUser.questionId,
            question:   update.pendingAskUser.question,
          }
        }
      }
    } catch (error) {
      const err = error as Error
      yield { type: 'error', error: err.message }
      return { reason: 'model_error', error: err }
    }

    // ─── ABORT CHECK (tool execution sonrası) ──────────────────────────
    if (sceneContext.abortSignal.aborted) {
      return { reason: 'aborted_tools' }
    }

    // ─── MAX TURNS CHECK ───────────────────────────────────────────────
    const nextTurnCount = turnCount + 1
    if (maxTurns && nextTurnCount > maxTurns) {
      yield {
        type: 'attachment',
        attachment: { type: 'max_turns_reached', turnCount: nextTurnCount },
      }
      return { reason: 'max_turns', turnCount: nextTurnCount }
    }

    // ─── CONTINUE: bir sonraki iterasyon için state hazırla ────────────
    state = {
      messages: [...messages, ...assistantMessages, ...toolResults],
      sceneContext,
      turnCount: nextTurnCount,
      transition: { reason: 'next_turn' },
    }
    // loop devam (while true)
  }
}
```

### Termination logic — 5 çıkış noktası

| # | Nerede | Koşul | Sonuç |
|---|---|---|---|
| 1 | Model call öncesi | `abortSignal.aborted` | `aborted_streaming` |
| 2 | Model call sonrası | `!needsFollowUp` (tool çağırmadı) | `completed` — **planner kendisi bitirdi** |
| 3 | Model çağrısında error | Provider 5xx, network fail | `model_error` |
| 4 | Tool execution sonrası | `abortSignal.aborted` | `aborted_tools` |
| 5 | Tur sayısı limiti | `nextTurnCount > maxTurns` | `max_turns` |

### Constants
```typescript
// src/lib/ai/constants.ts
/** Max conversation depth. Planner can self-terminate sooner by not calling tools. */
export const DEFAULT_MAX_TURNS = 15

/** Total tool call budget across all turns (extra safety net). */
export const DEFAULT_MAX_TOTAL_TOOLS = 50

/** Pending question TTL (ms). */
export const PENDING_QUESTION_TTL_MS = 5 * 60 * 1000   // 5 dakika

/** SSE keep-alive interval. */
export const SSE_KEEPALIVE_MS = 15 * 1000
```

### Planner self-termination

**Çok önemli:** `maxTurns = 15` üst limit, **planner her zaman kendisi durabilir** — sadece tool çağırmazsa loop biter:

```
Tur 5:
  Model → AssistantMessage("Bütün katmanlara animasyon ekledim. Başka isteğin var mı?")
         (toolCalls boş, stop_reason = end_turn)
  needsFollowUp = false → return { reason: 'completed', turnCount: 5 }
```

Yani 15 sadece güvenlik ağı — pratikte loop genelde 3-5 turda biter.

---

## DOLGU 2 — Abort Mekanizması (Send → Stop butonu)

**Kaynak:** `/openclaude/src/query.ts:670, 1021-1058, 1491-1522`

### UI tarafı: butonun davranışı

```typescript
// src/components/AIPanel.tsx — gönder/durdur butonu

// State
const [abortController, setAbortController] = useState<AbortController | null>(null)
const isRunning = abortController !== null

// Gönder butonu / Durdur butonu
<button onClick={() => {
  if (isRunning) {
    // DURDUR modu
    abortController!.abort('user_cancel')
    setAbortController(null)
  } else {
    // GÖNDER modu
    if (!text.trim()) return
    const controller = new AbortController()
    setAbortController(controller)
    planner.send(text, controller.signal).finally(() => {
      setAbortController(null)
    })
  }
}}>
  {isRunning ? '⏹ Durdur' : '↑ Gönder'}
</button>
```

Butonun ikinci tıklamasında `abort('user_cancel')` çağrılır. Loop bir sonraki abort check noktasında (model call sonrası veya tool execution sonrası) bunu fark eder, `aborted_*` reason ile çıkar.

### Hook tarafı: signal'i context'e bağla

```typescript
// useAIPlanner.ts
export async function send(text: string, signal: AbortSignal) {
  const sceneContext: SceneContext = {
    scene: currentScene,
    availableTools: getAllTools(),
    abortSignal: signal,    // ← buradan loop'a iniyor
    updateScene: (updater) => dispatchSceneUpdate(updater),
    // ...
  }
  // SSE stream'i başlat...
}
```

### Server tarafı: SSE içinde abort

```typescript
// src/app/api/ai/route.ts
export async function POST(req: NextRequest) {
  const { params } = await req.json()
  const controller = new AbortController()

  // Client disconnect'te abort
  req.signal.addEventListener('abort', () => {
    controller.abort('client_disconnect')
  })

  const stream = new ReadableStream({
    async start(streamController) {
      try {
        const sceneContext = buildSceneContext(params.scene, controller.signal)
        for await (const event of queryLoop({
          ...params, sceneContext,
        })) {
          streamController.enqueue(encodeSSE(event))
        }
        // Generator'ın return değerini de gönder
        streamController.enqueue(encodeSSE({ type: 'terminal', ... }))
      } catch (err) {
        streamController.enqueue(encodeSSE({ type: 'error', error: String(err) }))
      } finally {
        streamController.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

function encodeSSE(event: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}
```

`req.signal.addEventListener('abort', ...)` — kullanıcı browser'da Durdur'a basınca fetch iptal olur, server kendiliğinden abort tetikler.

### Abort sırasında ne olur?

| Loop nerede | Abort tetiklendi | Davranış |
|---|---|---|
| Model API çağrısı sırasında | Fetch iptal olur | Provider call throw eder, catch ile `model_error` veya signal check ile `aborted_streaming` |
| Tool execution sırasında | Tool kendisi signal'i okur | Tool error fırlatır veya yarım sonuç döndürür, sonraki abort check'te `aborted_tools` |
| İki abort check arası | Henüz yakalanmadı | Sonraki check noktasında yakalanır (en fazla 1 tool gecikmesi) |

---

## DOLGU 3 — Scene Always Fresh (contextModifier pattern)

**Kaynak:** `/openclaude/src/services/tools/toolOrchestration.ts:14-82`

### Prensip: Tool sahneyi MUTATE etmez, MODIFIER döner

```typescript
// V3 Tool.call()'un sonuç tipi
export interface ToolResult<T> {
  data: T
  /** SceneContext'i nasıl güncelleyeceğini söyleyen fonksiyon */
  contextModifier?: (ctx: SceneContext) => SceneContext
}

// Örnek: add_layer
async call(input, ctx) {
  const layer = buildLayerFromParams(input)
  const nextScene: ChronoScene = {
    ...ctx.scene,
    layers: [...ctx.scene.layers, layer],
  }
  return {
    data: { applied: true, layerId: layer.id },
    contextModifier: (c) => ({ ...c, scene: nextScene }),
  }
}

// Örnek: get_scene (RO — modifier yok, sahneyi DEĞİŞTİRMEZ)
async call(input, ctx) {
  return {
    data: serializeScene(ctx.scene),  // ← güncel scene'i oku
    // contextModifier yok → ctx aynı kalır
  }
}
```

### Orchestrator nasıl uygular

```typescript
// src/lib/ai/toolOrchestration.ts
export async function* orchestrateTools(
  toolUseBlocks: ToolUseBlock[],
  assistantMessages: AssistantMessage[],
  sceneContext: SceneContext,
): AsyncGenerator<ToolUpdate> {
  let currentContext = sceneContext

  for (const { isSafe, blocks } of partitionToolCalls(toolUseBlocks, currentContext)) {
    if (isSafe) {
      // RO batch: paralel çalıştır, sonra modifier'ları sırayla uygula
      const results = await Promise.all(blocks.map(async (b) => {
        const tool = currentContext.availableTools.find(t => t.name === b.name)!
        return { block: b, tool, result: await tool.call(b.input, currentContext) }
      }))
      for (const { block, tool, result } of results) {
        yield { message: makeToolResultMessage(block.id, result.data, tool), label: tool.name }
        if (result.contextModifier) {
          currentContext = result.contextModifier(currentContext)
        }
      }
      yield { newContext: currentContext }
    } else {
      // WR batch: sıralı, her tool sonrası context güncellenir
      for (const block of blocks) {
        const tool = currentContext.availableTools.find(t => t.name === block.name)!
        const result = await tool.call(block.input, currentContext)
        yield { message: makeToolResultMessage(block.id, result.data, tool), label: tool.name }
        if (result.contextModifier) {
          currentContext = result.contextModifier(currentContext)
          yield { newContext: currentContext }
        }
      }
    }
  }
}
```

### Loop güncel sahneyi nasıl görür

```typescript
// queryLoop içinde
for await (const update of orchestrateTools(blocks, ...)) {
  if (update.newContext) {
    sceneContext = update.newContext   // ← her tool'dan sonra fresh
  }
}

// Sonraki tur
state = {
  ...state,
  sceneContext,   // ← güncel scene buraya akar
}
```

### Sonuç: Multi-turn'de scene her zaman güncel

```
Tur 1:
  Model → add_layer({id:"red"}) 
  Orchestrator: ctx.scene.layers = [..., {id:"red"}]
  ctx güncellendi

Tur 2:
  Model → get_scene({})
  Orchestrator: serializeScene(ctx.scene) → "Layers: ..., red"
  AI red'i görüyor ✓
```

---

## DOLGU 4 — SSE Streaming (zaten karar verilmişti, detay)

**Kaynak:** `/openclaude/src/query.ts:219-251` (AsyncGenerator pattern) + SSE adaptation

### Olay tipleri (event types)

Server her `yield` → 1 SSE event:

```
event: stream_request_start
data: {"turnCount":1}

event: assistant
data: {"message":{"role":"assistant","content":[...]}}

event: tool_result
data: {"message":{...},"label":"AI: Add Layer Red Box"}

event: assistant
data: {"message":{...}}

event: terminal
data: {"reason":"completed","turnCount":3}
```

### Client tarafı (browser'da SSE parser)

```typescript
// useAIPlanner.ts
async function send(text: string, signal: AbortSignal) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userMessage: text, scene, history }),
    signal,   // ← Durdur butonu fetch'i iptal eder
  })

  if (!response.body) throw new Error('No stream body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE: olaylar \n\n ile ayrılır
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''   // son parçayı buffer'da bırak

    for (const raw of events) {
      const dataLine = raw.split('\n').find(l => l.startsWith('data: '))
      if (!dataLine) continue
      const event = JSON.parse(dataLine.slice(6))
      handleEvent(event)
    }
  }
}

function handleEvent(event: StreamEvent) {
  switch (event.type) {
    case 'assistant':
      // UI'a yeni mesaj baloncuğu ekle
      appendAssistantMessage(event.message)
      break
    case 'tool_result':
      // Chip eklenebilir, scene state client tarafında güncellenebilir
      appendAppliedLabel(event.label)
      break
    case 'attachment':
      if (event.attachment.type === 'max_turns_reached') {
        showWarning(`Maks tur sayısına (${event.attachment.turnCount}) ulaşıldı`)
      }
      break
    case 'terminal':
      // Loop bitti, butonu eski haline çevir
      setIsRunning(false)
      break
    case 'error':
      showError(event.error)
      break
  }
}
```

### Avantaj: anlık feedback
Kullanıcı 3 turluk loop'ta her tur'un başını/sonunu, her tool çağrısının uygulandığını **anlık** görür. 10 saniyelik "boş ekran"ın yerine sürekli akan UX.

---

## DOLGU 5 — `ask_user` Pattern (openClaude elicitation)

**Kaynak:** `/openclaude/src/services/mcp/elicitationHandler.ts:68-155` + `Tool.ts:269-273` (requestPrompt)

OpenClaude'un MCP elicitation pattern'i bize tam uyuyor:

### Pattern: Promise-based pause

Tool `call()` içinde context üzerinden `requestPrompt` çağrılır. Bu fonksiyon **resolve olmamış bir promise döner** → loop bekler. UI cevap girince promise resolve olur, tool devam eder.

```typescript
// SceneContext'e ekle
export interface SceneContext {
  // ... mevcut ...
  /** Sprint G: AI'ın kullanıcıya soru sormasını sağlar */
  requestPrompt?: (request: AskUserInput) => Promise<AskUserOutput>
}

// AskUserTool — özel implementasyon
export const AskUserTool: Tool<AskUserInput, AskUserOutput> = {
  name: 'ask_user',
  description: '...',
  isReadOnly:        () => true,
  isConcurrencySafe: () => false,

  async call(input, ctx) {
    if (!ctx.requestPrompt) {
      throw new Error('ask_user not supported in this context')
    }
    // Burada loop DURUYOR — kullanıcı cevap verene kadar
    const answer = await ctx.requestPrompt(input)
    return {
      data: answer,
      // contextModifier yok — sahneye dokunmadı
    }
  },

  mapToolResultToToolResultBlockParam(answer, toolUseId) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify(answer),
    }
  },
}
```

### Server tarafı: requestPrompt nasıl SSE'ye köprülenir

```typescript
// /api/ai/route.ts içinde
let pendingResolver: ((answer: AskUserOutput) => void) | null = null

const sceneContext: SceneContext = {
  // ... diğerleri ...
  requestPrompt: (request) => {
    const questionId = `q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`

    // SSE üzerinden client'a soruyu fırlat
    streamController.enqueue(encodeSSE({
      type: 'awaiting_user',
      questionId,
      question: request,
    }))

    // Pending session store'a kaydet
    return new Promise<AskUserOutput>((resolve) => {
      pendingResolver = resolve
      pendingSessions.create(questionId, request, resolve, {
        timeoutMs: PENDING_QUESTION_TTL_MS,
        onTimeout: () => resolve({ cancelled: true }),
      })
    })
  },
}
```

### Client cevap gönderir

```typescript
// QuestionBubble onAnswer handler
async function onAnswer(questionId: string, answer: AskUserOutput) {
  await fetch('/api/ai/answer', {
    method: 'POST',
    body: JSON.stringify({ questionId, answer }),
  })
  // Cevap server'da resolve()'u çağırır → tool devam eder → loop devam eder
  // SSE üzerinden yeni event'ler akmaya başlar
}
```

### Pending session store (in-memory)

```typescript
// src/lib/ai/pendingSessions.ts
interface PendingSession {
  questionId: string
  resolve: (answer: AskUserOutput) => void
  timeoutHandle: ReturnType<typeof setTimeout>
}

class PendingSessionStore {
  private sessions = new Map<string, PendingSession>()

  create(
    questionId: string,
    request: AskUserInput,
    resolve: (answer: AskUserOutput) => void,
    opts: { timeoutMs: number; onTimeout: () => void },
  ): void {
    const timeoutHandle = setTimeout(() => {
      this.sessions.delete(questionId)
      opts.onTimeout()
    }, opts.timeoutMs)

    this.sessions.set(questionId, { questionId, resolve, timeoutHandle })
  }

  answer(questionId: string, answer: AskUserOutput): boolean {
    const session = this.sessions.get(questionId)
    if (!session) return false
    clearTimeout(session.timeoutHandle)
    this.sessions.delete(questionId)
    session.resolve(answer)
    return true
  }
}

export const pendingSessions = new PendingSessionStore()
```

### Avantaj: loop kodunda ÖZEL durum yok

`ask_user` sadece "yavaş çalışan bir tool" gibi davranıyor. queryLoop pause/resume mantığı bilmiyor — Promise pending kaldığı sürece `await tool.call()` doğal olarak bekliyor. SSE bağlantısı açık kaldığı sürece (keep-alive ping ile) bağlantı düşmüyor.

---

## AÇIK SORULAR (üst akla danışılacak / kullanıcı kararına bırakıldı)

Aşağıdaki konular plan tamamlanması için cevap bekliyor. Şu an "kararlı default" ile devam edilebilir, ileride iyileştirilebilir.

### S1: Migration step-by-step dosya listesi

**Sorun:** Sprint A'da `Tool` interface eklenirken mevcut `/api/ai/route.ts` ve `useAIPlanner` baştan mı yazılır, yan yana yeni dosya mı eklenir? `ActionRegistry` korunur mu?

**Şu an düşünce:**
- V1 dosyaları korunur, V3 yanına eklenir.
- `actionToTool.ts` adapter ile mevcut 5 action otomatik Tool olur.
- `/api/ai/route.ts` çift mod: query param `?v=1` veya `?v=3` ile hangi sistem.
- AI Panel başlangıçta V3'ü kullanır, V1 fallback.

**Karar bekliyor:** Tek seferde V3'e geç mi, paralel mi tut?

### S2: Hata yönetimi pattern'i (is_error, retry, give-up)

**Sorun:** Tool hata verirse loop ne yapsın?

**Mevcut V1 davranışı:** Label-prefixed "AI ERROR:" no-op command. UI'da kırmızı chip.

**V3'te seçenekler:**
- **A:** Tool hata fırlatınca `tool_result.is_error=true` ile AI'a bildir → AI kendisi karar verir (genelde tekrar dener veya farklı yol seçer). OpenClaude pattern'i.
- **B:** Loop hata sayar, 3 üst üste hata → "give up", loop biter.
- **C:** A + B hibrit — AI 2 kez yanlış yaparsa B devreye girer.

**Karar bekliyor:** A (en basit) yeterli mi, yoksa B/C de gerekli mi?

### S3: Loop budget constants + telemetry

**Sorun:** Token maliyeti? Tur başına maliyet? Toplam loop maliyeti?

**Şu an düşünce:**
- `MAX_TURNS = 15` zaten budget cap'i.
- Provider response'larında `usage` field'ı var (Anthropic'te `input_tokens`, `output_tokens`).
- AIPanel'in alt köşesine küçük "$ 0.012 / 1,432 tokens" göstergesi.
- Per-conversation toplam ve per-turn detay.

**Karar bekliyor:**
- Telemetri server'da mı tutulsun (DB) yoksa sadece UI'da mı?
- Tur başına maliyet limiti olsun mu? (örn. "$ 0.50'i aşma")
- Provider'a göre fiyat tablosu nereden? (hardcoded vs config)

### S4: Server-side scene state persistence

**Sorun:** Multi-turn loop sürerken sahne client'tan server'a tek seferde mi gönderilir, yoksa session-tabanlı mı tutulur?

**Şu an düşünce:** Stateless — client her request'te scene'i gönderir, server o snapshot üzerinden contextModifier'ları biriktirir, loop sonunda final scene'i SSE üzerinden geri döner, client setState yapar.

**Karar bekliyor:** Stateless yeterli mi yoksa Redis/session DB lazım mı? (Multi-user yoksa stateless yeter.)

### S5: `tool_use_id` round-trip detayları

**Sorun:** Provider başına `tool_use_id` farklı format:
- Anthropic: `content[i].id`
- OpenAI: `tool_calls[i].id`
- Custom: provider'a göre değişir

**Şu an düşünce:** `providers.ts` içinde her provider'ın response'undan normalize edilmiş `AIToolCall { id, name, input }` üretilir. Geri dönerken aynı id ile `tool_result` gönderilir.

**Karar bekliyor:** Custom provider'larda fail-safe ne olsun? (id boş gelirse uuid üret?)

---

## Karar Verilmesi Gerekenler

1. **Loop nerede çalışsın?**
   - **A:** Server-side `/api/ai` route içinde tek HTTP request → multiple turns → tek response. Basit.
   - **B:** SSE stream — her turn'ün assistant message'ı UI'a anında akar. UX daha iyi ama karmaşık.
   - **Öneri: A önce, B ikinci sprint.**

2. **Server-side scene state nasıl?**
   - **A:** Her HTTP request'te client current scene'i gönderir, server o snapshot üzerinden çalışır, dönen tool_call'ları client uygular. Stateless.
   - **B:** Server-side session — Redis vb. Scene server'da yaşar, multi-user için gerekli ama Chorono single-user bu yüzden gereksiz.
   - **Öneri: A (snapshot transfer).**

3. **Tool call'ları kim execute eder?**
   - **A:** Server execute eder (queryLoop içinde), client yeni scene'i alıp setState yapar.
   - **B:** Server sadece tool_call'ları döner, client kendisi execute eder (mevcut V1 davranışı).
   - **Karmaşıklık:** A multi-turn için zorunlu (loop devam etmek için sonucu görmesi lazım). B sadece single-turn'de çalışır.
   - **Öneri: A.**

4. **Read tool'lar tam scene mi yoksa filtered mi döner?**
   - **A:** `GetSceneTool` her zaman tam scene JSON döner. Basit ama token pahalı.
   - **B:** Query parametresi: `GetSceneTool({ layers: true, timelines: false })`. Daha akıllı.
   - **Öneri: B — token tasarrufu için baştan filtrele.**

---

## Eklemediklerimiz (bilinçli olarak)

| Pattern | Neden eklemiyoruz |
|---|---|
| Compaction / context window management | Chorono sahnesi küçük, context overflow olmaz |
| Permission gates | Trusted user, kişisel uygulama |
| Hook system (pre/post tool) | Şu an gereksiz, ileride telemetry için eklenebilir |
| Streaming tool execution | Animasyon editor'da görsel feedback canvas'ta zaten var |
| Sub-agent spawning | Tek agent yeterli |
| MCP server hosting | Faz 4'te (BL-01c) |
| File system tools | Sahne mutasyonu yapıyoruz, dosya değil |

---

## Sonraki Adım

İstersen **Sprint A**'dan başlayalım — port'un en güvenli adımı:
- `Tool.ts`, `SceneContext.ts`, `messageFormat.ts`, `actionToTool.ts` yazılır
- Mevcut V1 davranışı bozulmaz
- Sprint B (queryLoop) için altyapı hazırlanır
- 1-2 günlük iş

Onaylar mısın V3 yönünü?
