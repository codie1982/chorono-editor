# Chorono AI Planner — Kodlama Spesifikasyonu

Bu doküman, AI sistemini sıfırdan implemente etmek için yeterli detaya sahiptir.
Sunucu tarafı geliştirmesi tamamlandıktan sonra bu plana göre kodlanacak.

## DURUM (2026-05-17 itibarıyla)

### Tamamlandı
| Dosya | İçerik |
|---|---|
| `types.ts` | `AIProviderConfig`, `AIMessage`, `AIToolCall`, `AIResponse`, `AITool`, `AIUIMessage` |
| `providers.ts` | `callAnthropic`, `callOpenAI`, `callCustom`, `callAIProvider` — fetch, sıfır bağımlılık |
| `tools.ts` | 6 manuel tool tanımı + `buildSystemPrompt` (ileride auto-generate edilecek) |
| `SceneSerializer.ts` | `serializeScene(scene)` → LLM context string |

### Eksik (sırasıyla kodlanacak)
1. `ActionRegistry.ts` + `actions/*.ts`
2. `PlannerExecutor.ts` (eski adı CommandBuilder)
3. `/app/api/ai/route.ts`
4. `/app/hooks/useAIPlanner.ts`
5. `/components/AIPanel.tsx`
6. `/app/page.tsx` güncellemesi
7. `.env.local.example`

---

## MİMARİ

```
┌──────────────────────────────────────────────────────────────┐
│ KULLANICI                                                     │
│   "1080×1080 kırmızı kutu, 1s sağdan sola"                   │
└────────────┬─────────────────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────────────────┐
│ AIPanel.tsx (client component)                                │
│   - Chat UI, provider seçici, quick actions                  │
└────────────┬─────────────────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────────────────┐
│ useAIPlanner.ts (React hook)                                  │
│   - messages: AIUIMessage[]                                   │
│   - send(text) → fetch /api/ai → executor.run(toolCalls)     │
└────────────┬─────────────────────────────────────────────────┘
             ↓ POST /api/ai
┌──────────────────────────────────────────────────────────────┐
│ /api/ai/route.ts (server)                                     │
│   - env'den provider config oku                              │
│   - actionRegistry.toAITools() → AITool[]                    │
│   - callAIProvider(config, messages, tools, systemPrompt)    │
└────────────┬─────────────────────────────────────────────────┘
             ↓ HTTP
┌──────────────────────────────────────────────────────────────┐
│ providers.ts (Anthropic / OpenAI / Custom)                    │
│   - fetch ile Claude / GPT-4o / Ollama vs.                   │
│   - Tool use → AIToolCall[]                                  │
└────────────┬─────────────────────────────────────────────────┘
             ↓ AIResponse { message, toolCalls }
┌──────────────────────────────────────────────────────────────┐
│ PlannerExecutor.ts                                            │
│   - Her toolCall için ActionRegistry'den ActionDef bul       │
│   - actionDef.toCommand(params, scene) → EditorCommand       │
│   - dispatchCommand(cmd) — undo history'ye girer             │
└────────────┬─────────────────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────────────────┐
│ useEditorState.dispatchCommand (MEVCUT)                       │
│   - Scene güncellenir, undo history büyür                    │
│   - Canvas re-render olur                                    │
└──────────────────────────────────────────────────────────────┘
```

### Tek Doğruluk Kaynağı: ActionRegistry

```
ActionRegistry
   ├── ActionDef'leri saklar
   │
   ├── toAITools() ─────────────→ AI Panel için tools.ts
   │
   ├── toMCPTools() ────────────→ MCP server (sonra)
   │
   └── get(id).toCommand(p) ────→ EditorCommand
                                  ↓
                              dispatchCommand
                                  ↓
                              MEVCUT EditorCommand sistemi
                              (execute/undo, dokunulmuyor)
```

---

## DOSYA SPESİFİKASYONLARI

### 1. `src/lib/ai/ActionRegistry.ts` — YENİ

```typescript
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AITool, AIToolProperty } from './types'

/** Bir AI/UI aksiyonu için tam tanım. */
export interface ActionDef<P = Record<string, unknown>> {
  /** Benzersiz aksiyon id'si, dot-notation: "layer.add", "keyframe.add" */
  id: string

  /** AI'a verilecek tool ismi. id ile aynı veya farklı olabilir. */
  toolName: string

  /** AI'ın araç seçerken kullanacağı açıklama. */
  description: string

  /** AI tool input schema (JSON Schema benzeri). */
  parameters: {
    type: 'object'
    properties: Record<string, AIToolProperty>
    required?: string[]
  }

  /**
   * Parametreleri alıp EditorCommand üretir.
   * scene parametresi sıralı çağrılarda working scene'i tutar
   * (örn: önce timeline create, sonra add_keyframes aynı timeline'a).
   */
  toCommand(params: P, scene: ChronoScene): EditorCommand | null
}

export class ActionRegistry {
  private actions = new Map<string, ActionDef>()

  register<P>(def: ActionDef<P>): void {
    if (this.actions.has(def.id)) {
      throw new Error(`Action "${def.id}" already registered`)
    }
    this.actions.set(def.id, def as ActionDef)
  }

  get(idOrToolName: string): ActionDef | undefined {
    if (this.actions.has(idOrToolName)) return this.actions.get(idOrToolName)
    // toolName ile arama (id'den farklıysa)
    for (const def of this.actions.values()) {
      if (def.toolName === idOrToolName) return def
    }
    return undefined
  }

  getAll(): ActionDef[] {
    return [...this.actions.values()]
  }

  /** AI provider'lara verilecek tool listesini üretir. */
  toAITools(): AITool[] {
    return this.getAll().map((a) => ({
      name: a.toolName,
      description: a.description,
      parameters: a.parameters,
    }))
  }

  clear(): void {
    this.actions.clear()
  }
}

// Singleton + bootstrap
export const actionRegistry = new ActionRegistry()

import { registerCompositionActions } from './actions/composition'
import { registerLayerActions }       from './actions/layer'
import { registerTimelineActions }    from './actions/timeline'
import { registerKeyframeActions }    from './actions/keyframe'
import { registerSceneActions }       from './actions/scene'

let bootstrapped = false
export function bootstrapAIActions(): void {
  if (bootstrapped) return
  bootstrapped = true
  registerSceneActions(actionRegistry)
  registerCompositionActions(actionRegistry)
  registerLayerActions(actionRegistry)
  registerTimelineActions(actionRegistry)
  registerKeyframeActions(actionRegistry)
}
```

---

### 2. `src/lib/ai/actions/` — YENİ klasör

Her dosya 1+ ActionDef export eder. Schema'lar `tools.ts`'deki mevcut tanımlardan birebir alınır (tools.ts kalkacak).

#### `actions/scene.ts`
```typescript
import type { ActionRegistry } from '../ActionRegistry'

export function registerSceneActions(reg: ActionRegistry): void {
  reg.register({
    id: 'scene.clear',
    toolName: 'clear_scene',
    description: 'Remove all layers and timelines (fresh start)',
    parameters: { type: 'object', properties: {} },
    toCommand: (_params, scene) => ({
      label: 'AI: Clear Scene',
      execute: (s) => ({ ...s, layers: [], timelines: [] }),
      undo: () => scene,
    }),
  })
}
```

#### `actions/composition.ts`
```typescript
import type { ActionRegistry } from '../ActionRegistry'

interface UpdateCompParams {
  width?: number; height?: number; durationMs?: number
  frameRate?: number; backgroundColor?: string
}

export function registerCompositionActions(reg: ActionRegistry): void {
  reg.register<UpdateCompParams>({
    id: 'composition.update',
    toolName: 'update_composition',
    description: 'Change canvas composition settings',
    parameters: {
      type: 'object',
      properties: {
        width:           { type: 'number', description: 'Canvas width in px' },
        height:          { type: 'number', description: 'Canvas height in px' },
        durationMs:      { type: 'number' },
        frameRate:       { type: 'number' },
        backgroundColor: { type: 'string', description: 'hex e.g. "#1a1a2e"' },
      },
    },
    toCommand: (p, scene) => {
      const prev = scene.composition
      const next = { ...prev, ...p }
      return {
        label: 'AI: Update Composition',
        execute: (s) => ({ ...s, composition: next }),
        undo:    (s) => ({ ...s, composition: prev }),
      }
    },
  })
}
```

#### `actions/layer.ts`
ActionDef'ler:
- `layer.add` → `add_layer` → `makeAddLayerCmd(buildLayerFromParams(p))`
- `layer.update` → `update_layer` → `makeUpdateLayerCmd(...)`
- `layer.delete` → `delete_layer` → `makeDeleteLayerCmd(...)`

`buildLayerFromParams(p)` helper:
- p.type === 'shape' → `{ type: 'shape', shapeKind, transform, style: { fill, stroke, cornerRadius }, size }`
- p.type === 'text' → `{ type: 'text', transform, text: { value, fontSize, color, ... } }`
- p.type === 'group' → `{ type: 'group', transform }`

Schema mevcut `tools.ts` içindeki `add_layer` ile aynı (kopya).

#### `actions/timeline.ts`
- `timeline.create` → `create_timeline` → `makeAddTimelineCmd(buildTimelineFromParams(p))`

`buildTimelineFromParams(p)`:
```typescript
{
  id: p.id,
  durationMs: p.durationMs,
  autoplay: p.autoplay ?? false,
  loop: p.loop ?? false,
  loopCount: p.loopCount,
  pingPong: p.pingPong ?? false,
  tracks: [],
}
```

#### `actions/keyframe.ts`

En karmaşık aksiyon. `add_keyframes` tool'u alır, batch komut üretir.

```typescript
interface AddKeyframesParams {
  timelineId: string
  target: string  // "layers.{id}.{prop}"
  keyframes: Array<{
    timeMs: number
    value: unknown
    easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'
  }>
}

reg.register<AddKeyframesParams>({
  id: 'keyframe.addBatch',
  toolName: 'add_keyframes',
  description: '...',  // tools.ts'deki birebir aynı
  parameters: { ... },  // tools.ts'deki birebir aynı
  toCommand: (p, scene) => {
    const tlExists = scene.timelines.some(t => t.id === p.timelineId)
    const kfs: Keyframe[] = p.keyframes.map((kf, i) => ({
      id: `kf_${Date.now()}_${i}`,
      timeMs: kf.timeMs,
      value: kf.value as AnimatableValue,
      easing: { type: kf.easing ?? 'easeInOut' },
    }))

    return {
      label: `AI: Add ${kfs.length} keyframes to ${p.target}`,
      execute: (s) => {
        let next = s
        // Timeline yoksa minimum tanım ile yarat
        if (!tlExists) {
          next = {
            ...next,
            timelines: [...next.timelines, {
              id: p.timelineId,
              durationMs: Math.max(...kfs.map(k => k.timeMs)),
              autoplay: true, loop: false,
              tracks: [],
            }],
          }
        }
        // Her keyframe için upsertKeyframe
        for (const kf of kfs) {
          next = upsertKeyframe(next, p.timelineId, p.target, kf)
        }
        return next
      },
      undo: () => scene,
    }
  },
})
```

---

### 3. `src/lib/ai/PlannerExecutor.ts` — YENİ

```typescript
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AIToolCall } from './types'
import { actionRegistry } from './ActionRegistry'

export interface ExecutionResult {
  commands: EditorCommand[]
  appliedLabels: string[]
  errors: string[]
}

/**
 * AI'dan gelen toolCalls dizisini sıralı olarak EditorCommand'lara çevirir.
 * Working scene'i her komut sonrası günceller — bu sayede sıralı bağımlılıklar
 * (timeline create → add_keyframes) doğru çalışır.
 */
export function buildCommandsFromToolCalls(
  toolCalls: AIToolCall[],
  scene: ChronoScene,
): ExecutionResult {
  const commands: EditorCommand[] = []
  const labels: string[] = []
  const errors: string[] = []
  let workingScene = scene

  for (const call of toolCalls) {
    const def = actionRegistry.get(call.name)
    if (!def) {
      errors.push(`Unknown tool: "${call.name}"`)
      continue
    }
    try {
      const cmd = def.toCommand(call.input as Record<string, unknown>, workingScene)
      if (!cmd) {
        errors.push(`Tool "${call.name}" produced no command`)
        continue
      }
      commands.push(cmd)
      labels.push(cmd.label)
      // Working scene'i ilerlet (sonraki komut bunu görür)
      workingScene = cmd.execute(workingScene)
    } catch (err: unknown) {
      errors.push(`Tool "${call.name}" failed: ${(err as Error).message}`)
    }
  }

  return { commands, appliedLabels: labels, errors }
}
```

---

### 4. `src/app/api/ai/route.ts` — YENİ

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { actionRegistry, bootstrapAIActions } from '@/lib/ai/ActionRegistry'
import { buildSystemPrompt } from '@/lib/ai/tools'  // sadece prompt için
import { callAIProvider } from '@/lib/ai/providers'
import type { AIProviderConfig } from '@/lib/ai/types'

bootstrapAIActions()

function readProviderConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER ?? 'anthropic') as AIProviderConfig['provider']
  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    }
  }
  if (provider === 'openai') {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    }
  }
  return {
    provider: 'custom',
    apiKey: process.env.CUSTOM_AI_KEY ?? '',
    model: process.env.CUSTOM_AI_MODEL ?? 'local',
    baseUrl: process.env.CUSTOM_AI_URL ?? '',
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userMessage, sceneContext, history, providerOverride } = body
    const config = providerOverride ?? readProviderConfig()
    if (!config.apiKey && config.provider !== 'custom') {
      return NextResponse.json({ error: `${config.provider} API key not configured` }, { status: 400 })
    }

    const tools = actionRegistry.toAITools()
    const systemPrompt = buildSystemPrompt(sceneContext)
    const messages = [...(history ?? []), { role: 'user' as const, content: userMessage }]

    const result = await callAIProvider(config, messages, tools, systemPrompt)
    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'AI request failed' },
      { status: 500 }
    )
  }
}
```

---

### 5. `src/app/hooks/useAIPlanner.ts` — YENİ

```typescript
'use client'
import { useState, useCallback } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AIUIMessage, AIProviderConfig, AIResponse } from '@/lib/ai/types'
import { serializeScene } from '@/lib/ai/SceneSerializer'
import { buildCommandsFromToolCalls } from '@/lib/ai/PlannerExecutor'

export interface UseAIPlannerArgs {
  scene: ChronoScene
  dispatchCommand: (cmd: EditorCommand) => void
}

export interface UseAIPlannerReturn {
  messages: AIUIMessage[]
  isLoading: boolean
  error: string | null
  send: (text: string, providerOverride?: AIProviderConfig) => Promise<void>
  clear: () => void
}

export function useAIPlanner({ scene, dispatchCommand }: UseAIPlannerArgs): UseAIPlannerReturn {
  const [messages, setMessages] = useState<AIUIMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(async (text: string, providerOverride?: AIProviderConfig) => {
    const userMsg: AIUIMessage = {
      id: `m_${Date.now()}_u`, role: 'user', content: text,
    }
    setMessages((m) => [...m, userMsg, {
      id: `m_${Date.now()}_a`, role: 'assistant', content: '', loading: true,
    }])
    setIsLoading(true); setError(null)

    try {
      const sceneContext = serializeScene(scene)
      const history = messages.map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userMessage: text, sceneContext, history, providerOverride }),
      })
      const data: AIResponse & { error?: string } = await res.json()
      if (data.error) throw new Error(data.error)

      // Tool call'ları komutlara çevir ve uygula
      const exec = buildCommandsFromToolCalls(data.toolCalls, scene)
      for (const cmd of exec.commands) dispatchCommand(cmd)

      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = {
          id: next[next.length - 1].id,
          role: 'assistant',
          content: data.message || `(${exec.appliedLabels.length} işlem uygulandı)`,
          toolCalls: data.toolCalls,
          appliedLabels: exec.appliedLabels,
          error: exec.errors.length > 0 ? exec.errors.join('\n') : undefined,
        }
        return next
      })
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'AI request failed'
      setError(msg)
      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = {
          ...next[next.length - 1], loading: false, error: msg,
        }
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [scene, messages, dispatchCommand])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isLoading, error, send, clear }
}
```

---

### 6. `src/components/AIPanel.tsx` — YENİ

İskelet:
```typescript
'use client'
import { useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AIProviderConfig, AIProviderName } from '@/lib/ai/types'
import { useAIPlanner } from '@/app/hooks/useAIPlanner'
import { DEFAULT_MODELS } from '@/lib/ai/providers'

interface AIPanelProps {
  scene: ChronoScene
  dispatchCommand: (cmd: EditorCommand) => void
  onClose: () => void
}

export default function AIPanel({ scene, dispatchCommand, onClose }: AIPanelProps) {
  const planner = useAIPlanner({ scene, dispatchCommand })
  const [text, setText] = useState('')
  const [provider, setProvider] = useState<AIProviderName>('anthropic')
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic[0])
  const [apiKey, setApiKey] = useState('')  // opsiyonel UI override

  const QUICK_ACTIONS = [
    '1080×1080 canvas, kırmızı kutu, 1s sağdan sola animasyon',
    'Mevcut tüm layer\'lara fade-in efekti ekle',
    'Bir loading spinner animasyonu oluştur (360×640)',
    'Bouncing ball animasyonu yap',
  ]

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-700 flex flex-col z-50">
      <header className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
        <span className="text-sm font-semibold">🤖 AI Planner</span>
        <select value={provider} onChange={...} className="ml-auto text-xs">
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="custom">Custom</option>
        </select>
        <button onClick={onClose}>✕</button>
      </header>

      <div className="px-3 py-2 border-b border-gray-700 flex flex-wrap gap-1">
        {QUICK_ACTIONS.map(q => (
          <button key={q} onClick={() => planner.send(q)} className="text-[10px] px-2 py-1 bg-gray-800 rounded">
            {q.slice(0, 30)}…
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {planner.messages.map(m => (
          <MessageBubble key={m.id} msg={m} />
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { planner.send(text); setText('') } }}
            className="border-t border-gray-700 p-2 flex gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Ne yapmak istersin? (örn: kırmızı bir daire koy ve fade-in yap)"
                  className="flex-1 bg-gray-800 text-xs p-2 rounded resize-none" rows={2} />
        <button type="submit" disabled={planner.isLoading} className="px-3 bg-blue-600 rounded text-xs">
          {planner.isLoading ? '...' : 'Gönder'}
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ msg }: { msg: AIUIMessage }) {
  // user → sağ hizalı bg-blue-700
  // assistant → sol hizalı bg-gray-800
  // appliedLabels varsa altında chip listesi
  // error varsa kırmızı kutu
  // loading varsa "..." göster
}
```

---

### 7. `src/app/page.tsx` — KÜÇÜK EDIT

```typescript
// Yeni state
const [showAI, setShowAI] = useState(false)

// Toolbar'a yeni buton (Export butonundan önce):
<button
  onClick={() => setShowAI(v => !v)}
  className="px-3 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-medium"
  title="AI Planner"
>
  🤖 AI
</button>

// Render sonunda, ToastContainer'dan önce:
{showAI && (
  <AIPanel
    scene={scene}
    dispatchCommand={dispatchCommand}
    onClose={() => setShowAI(false)}
  />
)}
```

---

### 8. `.env.local.example` — YENİ

```bash
# ── AI Provider Configuration ───────────────────────────────
# Aktif provider: anthropic | openai | custom
AI_PROVIDER=anthropic

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Custom (OpenAI-compatible: Ollama, Groq, Together AI, Azure)
CUSTOM_AI_URL=http://localhost:11434
CUSTOM_AI_KEY=
CUSTOM_AI_MODEL=llama3.1
```

---

## KODLAMA SIRASI

Bu sırayla yazılırsa her adımda test edilebilir:

1. **`actions/scene.ts`** — en basit aksiyon, registry'yi test eder
2. **`ActionRegistry.ts`** — bootstrap'a `scene.ts`'i bağla, `toAITools()` test et
3. **`actions/composition.ts`** — schema + toCommand pattern oturur
4. **`actions/layer.ts`** — layer factory en karmaşığı, ayrı helper
5. **`actions/timeline.ts`** — basit
6. **`actions/keyframe.ts`** — en karmaşık (timeline create + upsert batch)
7. **`PlannerExecutor.ts`** — registry'yi tüketir
8. **`/api/ai/route.ts`** — providers.ts + registry birleşir
9. **`.env.local`** oluştur, API key gir
10. **MVP testi (manuel curl):**
    ```bash
    curl http://localhost:2000/api/ai -X POST \
      -H 'content-type: application/json' \
      -d '{"userMessage":"1080x1080 red box slide","sceneContext":"empty","history":[]}'
    ```
11. **`useAIPlanner.ts`** — hook'u tek başına denemek için minimal sayfada test edilebilir
12. **`AIPanel.tsx`** — UI
13. **`page.tsx`** — bağla, MVP senaryosunu UI'dan dene

---

## MVP TEST SENARYOSU

Kullanıcı şunu yazar:
> "1080×1080 composition oluştur, ekrana kırmızı kutu koy, 1 saniyede sağdan sola animasyon yap"

Beklenen tool call sırası:
```json
[
  { "name": "clear_scene", "input": {} },
  { "name": "update_composition", "input": { "width": 1080, "height": 1080, "durationMs": 1000 } },
  { "name": "create_timeline", "input": { "id": "slide", "durationMs": 1000, "autoplay": true } },
  { "name": "add_layer", "input": {
      "id": "red_box", "name": "Red Box", "type": "shape", "shapeKind": "rect",
      "x": 880, "y": 440, "width": 200, "height": 200, "fillColor": "#EF4444"
  } },
  { "name": "add_keyframes", "input": {
      "timelineId": "slide", "target": "layers.red_box.transform.x",
      "keyframes": [
        { "timeMs": 0,    "value": 880,  "easing": "linear" },
        { "timeMs": 1000, "value": -200, "easing": "easeInOut" }
      ]
  } }
]
```

Beklenen sonuç:
- Canvas 1080×1080 olur
- 200×200 kırmızı kare ekranın sağında belirir
- 1 saniyede sola kayar
- Timeline panelinde "slide" timeline'ı, içinde 1 track + 2 keyframe görünür

---

## SONRAKİ ADIM: MCP SERVER (uygulama bitince)

```
chorono-mcp/
├── index.ts                ← @modelcontextprotocol/sdk Server
├── tools.ts                ← actionRegistry.toMCPTools() — köprü
├── bridge-client.ts        ← localhost:2000/api/mcp-bridge'e bağlanır
└── package.json
```

API bridge: `/app/api/mcp-bridge/route.ts` — MCP server'dan gelen
komutları SSE ile tarayıcıya iletir. Tarayıcı dispatch eder.

`ActionRegistry` zaten hem AI tool hem MCP tool üretebildiği için
MCP server sıfır yeni tool tanımıyla çalışır.

---

## NE EKLENDİĞİNDE NE DEĞİŞİR?

| Yeni özellik | Değişen dosya |
|---|---|
| Yeni shape kind | `actions/layer.ts` (enum genişletme) |
| Yeni animatable property | `actions/keyframe.ts` description |
| Yeni komut tipi (örn. parameter ekle) | `actions/parameter.ts` yeni dosya |
| Yeni provider (Gemini vb.) | `providers.ts` yeni fonksiyon |
| MCP support | Hazır — sadece `chorono-mcp/` paketi |

ActionRegistry pattern sayesinde **her yeni aksiyon otomatik olarak hem AI
panel hem MCP server tarafından kullanılabilir** — manuel tool tanımı yok.
