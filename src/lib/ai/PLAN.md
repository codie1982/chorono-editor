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

---

# EK: BOŞLUK DOLGULARI (gap-fill)

Bu bölüm yukarıdaki spec'in altında kalan helper'ları, edge case'leri ve
implementasyon detaylarını tamamlar. Plana göre kodlayan kişi için karar
verme yükü sıfıra iner.

---

## DOLGU 1 — `buildLayerFromParams()` helper

Konum: `src/lib/ai/actions/layer.ts` içinde top-level helper.

`add_layer` ve `update_layer` aksiyonlarının ortak param → Layer dönüştürücüsü.

```typescript
import type { Layer, LayerType, ShapeKind, Transform } from '@/lib/types'

export interface AddLayerParams {
  id: string
  name: string
  type: LayerType  // 'shape' | 'text' | 'group'
  // Transform
  x?: number; y?: number; width?: number; height?: number
  opacity?: number; rotationDeg?: number
  scaleX?: number; scaleY?: number
  // Shape
  shapeKind?: ShapeKind
  fillColor?: string; fillOpacity?: number
  strokeColor?: string; strokeWidth?: number
  cornerRadius?: number
  sides?: number; innerRadius?: number
  startAngle?: number; endAngle?: number
  // Text
  text?: string; fontSize?: number
  fontFamily?: string; fontWeight?: string
  textColor?: string; textAlign?: 'left' | 'center' | 'right'
  letterSpacing?: number
  // Visibility
  startMs?: number; endMs?: number
  // Tree
  parentId?: string
}

/**
 * Build a Layer from AI tool params. Defaults follow existing factory
 * conventions (anchor at layer center, opacity 1, etc.).
 *
 * IMPORTANT: anchorX/anchorY is set to (width/2, height/2) by default —
 * this matches newRectLayer/newCircleLayer behavior so rotation/scale
 * pivot around the visual center. AI tools don't expose anchor on purpose
 * (it's not animatable and rarely needed at creation time).
 */
export function buildLayerFromParams(p: AddLayerParams): Layer {
  const w = p.width  ?? (p.type === 'text' ? 200 : 100)
  const h = p.height ?? (p.type === 'text' ? (p.fontSize ?? 24) : 100)

  const transform: Transform = {
    x:           p.x ?? 0,
    y:           p.y ?? 0,
    scaleX:      p.scaleX ?? 1,
    scaleY:      p.scaleY ?? 1,
    rotationDeg: p.rotationDeg ?? 0,
    anchorX:     w / 2,
    anchorY:     h / 2,
  }

  const base: Layer = {
    id: p.id,
    name: p.name,
    type: p.type,
    transform,
    opacity: p.opacity ?? 1,
    ...(p.startMs != null ? { startMs: p.startMs } : {}),
    ...(p.endMs   != null ? { endMs:   p.endMs   } : {}),
    ...(p.parentId       ? { parentId: p.parentId } : {}),
  }

  if (p.type === 'shape') {
    const kind = p.shapeKind ?? 'rect'
    return {
      ...base,
      // Legacy 'shape' field — keep in sync with shapeKind for back-compat.
      // Only 'rect' and 'circle' map to legacy values; everything else uses shapeKind only.
      ...(kind === 'rect' ? { shape: 'rect' as const } : {}),
      shapeKind: kind,
      size: { width: w, height: h },
      style: {
        fill: {
          type: 'solid',
          color:   p.fillColor   ?? '#3B82F6',
          opacity: p.fillOpacity ?? 1,
        },
        ...(p.strokeColor || p.strokeWidth ? {
          stroke: {
            color:    p.strokeColor ?? '#000000',
            width:    p.strokeWidth ?? 1,
            opacity:  1,
            alignment: 'center' as const,
          },
        } : {}),
        ...(p.cornerRadius != null ? { cornerRadius: p.cornerRadius } : {}),
      },
      // Geometry params for non-rect/ellipse shapes
      ...(p.sides != null || p.innerRadius != null || p.startAngle != null || p.endAngle != null
        ? {
            shapeParams: {
              kind,
              ...(p.sides       != null ? { sides:       p.sides       } : {}),
              ...(p.innerRadius != null ? { innerRadius: p.innerRadius } : {}),
              ...(p.startAngle  != null ? { startAngle:  p.startAngle  } : {}),
              ...(p.endAngle    != null ? { endAngle:    p.endAngle    } : {}),
            },
          }
        : {}),
    }
  }

  if (p.type === 'text') {
    return {
      ...base,
      text: {
        value:     p.text ?? 'Text',
        fontSize:  p.fontSize ?? 24,
        color:     p.textColor ?? '#FFFFFF',
        ...(p.fontFamily    ? { fontFamily: p.fontFamily } : {}),
        ...(p.fontWeight    ? { fontWeight: p.fontWeight as Layer['text']['fontWeight'] } : {}),
        ...(p.textAlign     ? { textAlign: p.textAlign } : {}),
        ...(p.letterSpacing != null ? { letterSpacing: p.letterSpacing } : {}),
      },
    }
  }

  // group — no geometry
  return base
}
```

### `update_layer` patch helper

```typescript
/**
 * Apply a partial param patch to an existing layer. Only fields present
 * in the patch are touched; everything else preserved.
 */
export function applyPatchToLayer(prev: Layer, patch: Partial<AddLayerParams>): Layer {
  let next: Layer = { ...prev }

  // Transform (merge, don't replace)
  if (patch.x != null || patch.y != null || patch.scaleX != null ||
      patch.scaleY != null || patch.rotationDeg != null) {
    next.transform = {
      ...prev.transform,
      ...(patch.x           != null ? { x: patch.x }                       : {}),
      ...(patch.y           != null ? { y: patch.y }                       : {}),
      ...(patch.scaleX      != null ? { scaleX: patch.scaleX }             : {}),
      ...(patch.scaleY      != null ? { scaleY: patch.scaleY }             : {}),
      ...(patch.rotationDeg != null ? { rotationDeg: patch.rotationDeg }   : {}),
    }
  }

  if (patch.opacity != null) next.opacity = patch.opacity
  if (patch.name)            next.name    = patch.name
  if (patch.startMs != null) next.startMs = patch.startMs
  if (patch.endMs   != null) next.endMs   = patch.endMs

  if (patch.width != null || patch.height != null) {
    const w = patch.width  ?? prev.size?.width  ?? 100
    const h = patch.height ?? prev.size?.height ?? 100
    next.size = { width: w, height: h }
  }

  // Shape style merge
  if (prev.type === 'shape' &&
      (patch.fillColor || patch.fillOpacity != null ||
       patch.strokeColor || patch.strokeWidth != null ||
       patch.cornerRadius != null)) {
    next.style = {
      ...prev.style,
      ...(patch.fillColor || patch.fillOpacity != null ? {
        fill: {
          ...prev.style?.fill,
          type: 'solid' as const,
          ...(patch.fillColor   ? { color: patch.fillColor }       : {}),
          ...(patch.fillOpacity != null ? { opacity: patch.fillOpacity } : {}),
        },
      } : {}),
      ...(patch.strokeColor || patch.strokeWidth != null ? {
        stroke: {
          ...prev.style?.stroke,
          alignment: prev.style?.stroke?.alignment ?? 'center' as const,
          ...(patch.strokeColor ? { color: patch.strokeColor }     : {}),
          ...(patch.strokeWidth != null ? { width: patch.strokeWidth } : {}),
        },
      } : {}),
      ...(patch.cornerRadius != null ? { cornerRadius: patch.cornerRadius } : {}),
    }
  }

  // Text merge
  if (prev.type === 'text' &&
      (patch.text || patch.fontSize != null || patch.textColor || patch.textAlign)) {
    next.text = {
      ...prev.text,
      value:    prev.text?.value    ?? '',
      fontSize: prev.text?.fontSize ?? 24,
      color:    prev.text?.color    ?? '#FFFFFF',
      ...(patch.text                ? { value: patch.text }         : {}),
      ...(patch.fontSize  != null   ? { fontSize: patch.fontSize }  : {}),
      ...(patch.textColor           ? { color: patch.textColor }    : {}),
      ...(patch.textAlign           ? { textAlign: patch.textAlign } : {}),
    }
  }

  return next
}
```

---

## DOLGU 2 — Value type coercion + KRİTİK BUG FIX

### Bug bulundu: `upsertKeyframe` track yoksa hiçbir şey yapmıyor

`/src/lib/timeline/keyframeOps.ts:99` üzerinde inceleme:
```typescript
export function upsertKeyframe(scene, timelineId, target, kf) {
  return mapTimeline(scene, timelineId, target, (kfs) => { ... })
}
// mapTimeline yalnız MEVCUT track'leri map ediyor.
// Track yoksa, scene değişmeden döner.
```

Bu yüzden `actions/keyframe.ts` track'i de manuel yaratmalı:

```typescript
import type { ActionRegistry } from '../ActionRegistry'
import type { Keyframe, Track, Timeline, AnimatableValue, ChronoScene } from '@/lib/types'
import { upsertKeyframe } from '@/lib/timeline/keyframeOps'

interface KfInput {
  timeMs: number
  value: unknown
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'
}

interface AddKeyframesParams {
  timelineId: string
  target: string
  keyframes: KfInput[]
}

/**
 * Coerce arbitrary JSON value into AnimatableValue.
 * - Color tracks (target ends with .color): keep as string ("#rrggbb")
 * - Vec2 tracks: { x, y } object passes through
 * - Everything else: Number() coercion (rejects NaN)
 */
function coerceValue(target: string, raw: unknown): AnimatableValue {
  // Color tracks — string passthrough. The renderer reads the override
  // directly without numeric interpolation; AI should use 2 keyframes
  // (start + end) for color "transitions" — they will snap, not blend.
  if (target.endsWith('.color') || target.endsWith('Color')) {
    return String(raw)
  }
  // Vec2 (rare in current schema, defensive)
  if (typeof raw === 'object' && raw !== null && 'x' in raw && 'y' in raw) {
    return raw as AnimatableValue
  }
  // Boolean
  if (typeof raw === 'boolean') return raw
  // Numeric (default for opacity, position, scale, rotation, etc.)
  const n = Number(raw)
  if (Number.isFinite(n)) return n
  // Last resort: throw — caller will surface as error
  throw new Error(`Cannot coerce value "${String(raw)}" for target "${target}"`)
}

/**
 * Ensure scene contains a timeline with the given id; if missing, create one
 * sized to fit the largest keyframe timeMs.
 */
function ensureTimeline(scene: ChronoScene, timelineId: string, fallbackDurationMs: number): ChronoScene {
  if (scene.timelines.some(t => t.id === timelineId)) return scene
  const tl: Timeline = {
    id: timelineId,
    durationMs: Math.max(fallbackDurationMs, 1000),
    autoplay: true,
    loop: false,
    tracks: [],
  }
  return { ...scene, timelines: [...scene.timelines, tl] }
}

/**
 * Ensure the given timeline contains a track with the given target; if
 * missing, append an empty track. Required because upsertKeyframe only
 * maps over EXISTING tracks.
 */
function ensureTrack(scene: ChronoScene, timelineId: string, target: string): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((tl) => {
      if (tl.id !== timelineId) return tl
      if (tl.tracks.some(t => t.target === target)) return tl
      const track: Track = { target, keyframes: [] }
      return { ...tl, tracks: [...tl.tracks, track] }
    }),
  }
}

export function registerKeyframeActions(reg: ActionRegistry): void {
  reg.register<AddKeyframesParams>({
    id: 'keyframe.addBatch',
    toolName: 'add_keyframes',
    description: '/* aynı tools.ts içindeki — ileride buradan üretilecek */',
    parameters: { /* aynı tools.ts içindeki */ },
    toCommand: (p, scene) => {
      // Build keyframe objects with id + coerced value + easing
      const kfs: Keyframe[] = p.keyframes.map((kf, i) => ({
        id:     `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}`,
        timeMs: kf.timeMs,
        value:  coerceValue(p.target, kf.value),
        easing: { type: kf.easing ?? 'easeInOut' },
      }))

      const maxTimeMs = Math.max(...kfs.map(k => k.timeMs), 0)
      const snapshot  = scene  // for undo

      return {
        label: `AI: Add ${kfs.length} keyframes → ${p.target}`,
        execute: (s) => {
          let next = ensureTimeline(s, p.timelineId, maxTimeMs)
          next     = ensureTrack(next, p.timelineId, p.target)
          for (const kf of kfs) {
            next = upsertKeyframe(next, p.timelineId, p.target, kf)
          }
          return next
        },
        undo: () => snapshot,
      }
    },
  })
}
```

### Color animation limitation (AI'a system prompt'ta belirtilmeli)

Evaluator (`/src/lib/evaluator.ts:63`) `interpolateKeyframes` sadece sayısal
değerler üzerinde lineer interpolasyon yapar:
```typescript
const vA = kfA.value as number
const vB = kfB.value as number
return vA + (vB - vA) * easedT
```

String color değerleri "tip kast" ile geçer ama runtime'da string kalır.
Sonuç: **color tracks animasyon yapmaz, snap eder.**

`tools.ts` içindeki `buildSystemPrompt`'a şu eklenmeli:
> "Color properties (style.fill.color) snap between keyframes — they do not
> interpolate smoothly. Use easing='hold' or just provide 2 keyframes for
> a discrete color change."

---

## DOLGU 3 — `AIPanel.tsx` tam UI kodu

```typescript
'use client'
import { useState, useRef, useEffect } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AIProviderName, AIUIMessage } from '@/lib/ai/types'
import { useAIPlanner } from '@/app/hooks/useAIPlanner'
import { DEFAULT_MODELS } from '@/lib/ai/providers'

interface AIPanelProps {
  scene: ChronoScene
  dispatchCommand: (cmd: EditorCommand) => void
  onClose: () => void
}

const QUICK_ACTIONS = [
  { label: '🎬 Red box slide', prompt: '1080×1080 canvas, kırmızı kutu (200×200), 1 saniyede sağdan sola animasyon' },
  { label: '✨ Fade in all',   prompt: 'Mevcut tüm layerlara 500ms fade-in animasyonu ekle' },
  { label: '⏳ Loading spinner', prompt: '360×360 canvas, ortada bir ring shape, sonsuz dönen loading spinner yap' },
  { label: '⚽ Bouncing ball',  prompt: '360×640 canvas, mavi top yukarıdan düşüp zıplayan bounce animasyonu' },
]

export default function AIPanel({ scene, dispatchCommand, onClose }: AIPanelProps) {
  const planner = useAIPlanner({ scene, dispatchCommand })
  const [text, setText] = useState('')
  const [provider, setProvider] = useState<AIProviderName>('anthropic')
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic[0])
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState('')  // optional UI override
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // When provider changes, reset model to that provider's first option
  useEffect(() => {
    const list = DEFAULT_MODELS[provider]
    if (list.length > 0) setModel(list[0])
  }, [provider])

  // Auto-scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [planner.messages])

  const handleSend = (msg: string) => {
    if (!msg.trim() || planner.isLoading) return
    const override = apiKey ? { provider, model, apiKey } : undefined
    planner.send(msg, override)
    setText('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(text)
    }
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-700
                    flex flex-col z-50 shadow-2xl text-gray-200">

      {/* Header */}
      <header className="px-3 py-2 border-b border-gray-700 flex items-center gap-2 bg-gray-800">
        <span className="text-sm font-semibold">🤖 AI Planner</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AIProviderName)}
          className="ml-auto text-[11px] bg-gray-700 px-1.5 py-0.5 rounded"
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="custom">Custom</option>
        </select>
        {DEFAULT_MODELS[provider].length > 0 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-[11px] bg-gray-700 px-1.5 py-0.5 rounded"
          >
            {DEFAULT_MODELS[provider].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <button
          onClick={() => setShowSettings(v => !v)}
          title="Settings"
          className="text-[11px] px-1.5 hover:bg-gray-700 rounded"
        >⚙</button>
        <button
          onClick={planner.clear}
          title="Clear conversation"
          className="text-[11px] px-1.5 hover:bg-gray-700 rounded"
        >🗑</button>
        <button
          onClick={onClose}
          title="Close panel"
          className="text-[11px] px-1.5 hover:bg-gray-700 rounded"
        >✕</button>
      </header>

      {/* Settings (collapsible) */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-gray-700 bg-gray-800 text-[11px] space-y-1">
          <label className="block text-gray-400">API Key override (leave empty to use env)</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`${provider} API key`}
            className="w-full bg-gray-900 px-2 py-1 rounded font-mono"
          />
          <p className="text-gray-500 text-[10px]">
            Override only — env vars (.env.local) used otherwise.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-3 py-2 border-b border-gray-700 flex flex-wrap gap-1 bg-gray-850">
        {QUICK_ACTIONS.map((q) => (
          <button
            key={q.label}
            onClick={() => handleSend(q.prompt)}
            disabled={planner.isLoading}
            className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700
                       disabled:opacity-40 rounded transition-colors"
            title={q.prompt}
          >{q.label}</button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {planner.messages.length === 0 && (
          <div className="text-center text-gray-500 text-xs mt-8">
            <p>Animasyon oluşturmak için aşağıya yaz.</p>
            <p className="mt-2 text-[10px]">Örn: "kırmızı bir daire ekle ve fade-in yap"</p>
          </div>
        )}
        {planner.messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(text) }}
        className="border-t border-gray-700 p-2 flex gap-2 bg-gray-850"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ne yapmak istersin? (Enter = gönder, Shift+Enter = yeni satır)"
          rows={2}
          disabled={planner.isLoading}
          className="flex-1 bg-gray-800 text-xs p-2 rounded resize-none
                     disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={planner.isLoading || !text.trim()}
          className="px-3 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >{planner.isLoading ? '⏳' : '↑'}</button>
      </form>
    </div>
  )
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AIUIMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs
                       ${isUser ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-200'}`}>
        {/* Loading dots */}
        {msg.loading ? (
          <div className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <>
            {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}

            {/* Applied commands chips */}
            {msg.appliedLabels && msg.appliedLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {msg.appliedLabels.map((label, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-emerald-900/60
                                           text-emerald-300 rounded border border-emerald-800">
                    ✓ {label}
                  </span>
                ))}
              </div>
            )}

            {/* Tool calls without applied (when there was an error) */}
            {msg.toolCalls && msg.toolCalls.length > 0 && !msg.appliedLabels?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {msg.toolCalls.map((tc, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded font-mono">
                    {tc.name}
                  </span>
                ))}
              </div>
            )}

            {/* Error box */}
            {msg.error && (
              <div className="mt-2 px-2 py-1 bg-red-900/40 border border-red-800
                              text-red-300 rounded text-[10px] whitespace-pre-wrap">
                ⚠ {msg.error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

---

## DOLGU 4 — Hata yönetimi (5 senaryo)

### S1: AI olmayan layerId ile keyframe ekliyor
**Davranış:** `actions/keyframe.ts` track'i yine yaratır (mevcut layer kontrolü yok).
Renderer override'ı görür ama layer olmadığı için hiçbir şey çizmez. **Sessiz başarısızlık.**

**Çözüm:** `actions/keyframe.ts` toCommand içinde `target`'tan layerId çıkarıp scene'de var mı diye bak:
```typescript
toCommand: (p, scene) => {
  // Validate layerId exists
  const m = p.target.match(/^layers\.([^.]+)\./)
  if (m) {
    const layerId = m[1]
    if (!scene.layers.some(l => l.id === layerId)) {
      // Return a no-op command that surfaces the error in label
      return {
        label: `AI ERROR: layer "${layerId}" not found for ${p.target}`,
        execute: (s) => s,
        undo: (s) => s,
      }
    }
  }
  // ... normal flow
}
```

PlannerExecutor zaten `cmd.label` ile başlayan "AI ERROR" string'ini chip listesine
yansıtır — kullanıcı hatayı görür.

### S2: AI invalid easing döndürüyor (örn. "bounce")
**Davranış:** Schema enum'da yok ama provider uymayabilir.

**Çözüm:** `coerceValue` yanında `coerceEasing` ekle:
```typescript
const VALID_EASINGS = new Set(['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'])
function coerceEasing(raw: unknown): EasingType {
  if (typeof raw === 'string' && VALID_EASINGS.has(raw)) return raw as EasingType
  return 'easeInOut'  // safe default
}
```

### S3: Required field eksik (örn. add_layer'da id yok)
**Davranış:** Schema validation yapmıyoruz, runtime crash riski.

**Çözüm:** Her ActionDef.toCommand giriş kontrolü yapar:
```typescript
toCommand: (p, scene) => {
  if (!p.id || !p.name || !p.type) {
    return {
      label: `AI ERROR: add_layer missing required field (id/name/type)`,
      execute: (s) => s, undo: (s) => s,
    }
  }
  // ...
}
```

### S4: AI API timeout / 5xx
**Davranış:** `providers.ts` zaten throw eder. `route.ts` 500 döner.
`useAIPlanner` catch eder, `error` state'ine yazar, son mesajı error flag ile günceller.
`MessageBubble` kırmızı kutu gösterir.

**Aksiyon gerekmiyor** — mevcut hata akışı yeterli.

### S5: Aynı id ile ikinci kez add_layer
**Davranış:** `makeAddLayerCmd` `[...scene.layers, layer]` yapar — duplicate id oluşur.
Renderer aynı id'yi iki kez işler, override'lar belirsiz olur.

**Çözüm:** `actions/layer.ts` toCommand:
```typescript
if (scene.layers.some(l => l.id === p.id)) {
  return {
    label: `AI ERROR: layer id "${p.id}" already exists`,
    execute: (s) => s, undo: (s) => s,
  }
}
```

---

## DOLGU 5 — PropertySchema entegrasyon stratejisi

### Sorun
Şu an `tools.ts` içindeki `add_keyframes` description'ı **hard-coded property listesi** içeriyor:
```
opacity                → 0.0 – 1.0
transform.x            → pixels
...
```

Yeni bir animatable property eklenince (örn. yeni layer tipinin yeni property'si)
bu liste manuel güncellenmeli — drift kaynağı.

### Çözüm: ActionRegistry oluşturulduktan sonra otomatik üret

`actions/keyframe.ts` description'ını fonksiyondan üret:

```typescript
import { layerRegistry } from '@/lib/registry'

function buildKeyframeDescription(): string {
  // Tüm registered layer definitions üzerinde gez, animatable property'leri topla
  const properties = new Set<string>()
  for (const def of layerRegistry.getAll()) {
    // createDefault örneği üzerinden property schema'larını al
    const sample = def.createDefault()
    const groups = def.getPropertyGroups(sample)
    for (const group of groups) {
      for (const schema of group.schemas) {
        if (schema.animatable) properties.add(schema.path)
      }
    }
  }

  const lines = ['TRACK TARGET FORMAT: "layers.{layerId}.{property}"', '', 'AVAILABLE PROPERTIES:']
  for (const p of [...properties].sort()) {
    lines.push(`  ${p}`)
  }
  lines.push('', 'Color properties snap (no interpolation) — use 2 keyframes for color changes.')
  return lines.join('\n')
}
```

### Migration sırası
1. **Önce hard-coded ile çalış** — MVP olur, drift sonra düzeltilir
2. **Sonra otomatize et** — yukarıdaki fonksiyonu bağla
3. **En son `tools.ts`'i tamamen kaldır** — `ANIMATION_TOOLS[]` artık registry'den üretiliyor, sadece `buildSystemPrompt` kalır

### Önemli not
PropertySchema'lar `Layer` instance gerektiriyor (`showWhen`, `getPropertyGroups(layer)`).
`createDefault()` sample'ı yeterli — `showWhen` filtrelerinden bazı property'ler düşebilir
ama AI için "tüm potansiyel property'leri ver" stratejisi makul.

İyileştirme: ayrı bir `getStaticAnimatableProperties()` API'si eklenebilir
(`Layer` parametresiz, conditional skip yapmadan tüm property'leri döner). Bu
RegistryAction'ın v2 işidir, MVP için gerekli değil.

---

## ÖZET: BOŞLUK DOLGULAMA SONRASI DURUM

| Eksiklik | Durum | Konum |
|---|---|---|
| `buildLayerFromParams` | ✅ Tam kod | DOLGU 1 |
| `applyPatchToLayer` | ✅ Tam kod | DOLGU 1 |
| Value coercion (color/Vec2/number) | ✅ Tam kod | DOLGU 2 |
| **upsertKeyframe track yaratma bug fix** | ✅ Tam kod (ensureTimeline + ensureTrack) | DOLGU 2 |
| Color animation limitation | ✅ Belgelendi + system prompt update | DOLGU 2 |
| AIPanel tam kodu | ✅ MessageBubble dahil tam kod | DOLGU 3 |
| Provider/model selector state | ✅ Tam kod | DOLGU 3 |
| Settings UI (API key override) | ✅ Tam kod | DOLGU 3 |
| Hata: olmayan layerId | ✅ Validation + label-based error | DOLGU 4 (S1) |
| Hata: invalid easing | ✅ coerceEasing helper | DOLGU 4 (S2) |
| Hata: required field eksik | ✅ Per-action validation pattern | DOLGU 4 (S3) |
| Hata: API timeout | ✅ Zaten mevcut hata akışı yeterli | DOLGU 4 (S4) |
| Hata: duplicate layer id | ✅ Pre-check | DOLGU 4 (S5) |
| PropertySchema entegrasyon | ✅ 3-aşamalı migration plan | DOLGU 5 |

Bu noktadan sonra geliştirici PLAN.md'yi açıp **mekanik olarak** kodlayabilir
— karar verme yükü sıfır.
