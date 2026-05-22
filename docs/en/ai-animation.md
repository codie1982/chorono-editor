# AI Animation

Chorono Animator includes a built-in AI assistant that lets you describe animations in plain English and have them built for you automatically. Instead of manually placing keyframes, you can say "make the logo slide in from the left" and the AI will create the layers, keyframes, and timing on its own.

---

## Opening the AI Panel

Click the robot icon (🤖) in the right-side toolbar. This opens the **AI Animation drawer** — a chat interface that stays docked alongside your canvas. You can keep it open while you work and use it alongside the timeline and inspector.

---

## Supported AI Providers

The AI panel works with multiple providers. You choose the one that fits your setup:

| Provider | Models |
|---|---|
| **Anthropic Claude** | Claude Sonnet, Claude Haiku, Claude Opus |
| **OpenAI** | GPT-4o, GPT-4 Turbo |
| **Ollama** | Any locally-running model (llama3, mistral, etc.) |
| **Groq** | Llama 3, Mixtral (fast inference) |
| **Together AI** | Open-source model hosting |
| **Azure OpenAI** | Your Azure-deployed model endpoint |

---

## Setting Up Your API Key

You need an API key from your chosen provider. There are two ways to add it:

### Option 1 — .env.local file (recommended for development)

Create a `.env.local` file in the project root and add one of the following:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
TOGETHER_API_KEY=...
```

Restart the dev server after saving.

### Option 2 — Settings Panel

Click the gear icon in the toolbar to open **Settings**, then navigate to the **AI** tab. Paste your API key into the field for your chosen provider. This saves the key in your browser's local storage and does not require a server restart.

For local models (Ollama), set the base URL instead of an API key. For example:

```
http://localhost:11434
```

---

## What to Say — Example Prompts

The AI understands natural language. You do not need to use special syntax. Here are examples of what you can ask:

**Adding layers and objects**
- "Add a blue circle in the center of the canvas"
- "Create a red rectangle in the top-left corner, 200 by 100 pixels"
- "Add a text layer that says 'Hello World' in large white text"

**Creating animations**
- "Make the blue circle slide from the left edge to the right edge over 1 second"
- "Make the text fade in over 2 seconds starting at frame 10"
- "Rotate the logo 360 degrees over 3 seconds"
- "Scale the button from 0 to 100% with an ease-out curve"

**Multi-layer and stagger effects**
- "Create a stagger animation where each box appears 0.2 seconds apart"
- "Animate all the circles so they fly in from the bottom one after another"
- "Make the menu items slide in from the left with a 0.1 second delay between each"

**Layout and alignment**
- "Center all layers on the canvas"
- "Align the selected layers to the bottom"
- "Distribute the three boxes evenly across the canvas"
- "Fit the image layer to the canvas size"

**Looping and repeat**
- "Loop the rotation animation"
- "Make the pulse effect repeat indefinitely"
- "Create a breathing loop — scale up and down smoothly, forever"

**Special effects**
- "Add a particle burst effect at the center"
- "Create a shimmer effect on the text"
- "Add a bounce ease to the ball's movement"

**Editing existing content**
- "Change the circle color to orange"
- "Move the logo to the top-right corner"
- "Increase the fade-in duration to 3 seconds"
- "Delete all layers except the background"

---

## How the AI Works — The Agent Loop

When you send a prompt, the AI does not just generate code blindly. It works through an **agent loop** — a reasoning cycle where it inspects the scene, makes changes, verifies the result, and continues if needed. This happens automatically in up to **5 turns** per request.

A typical turn looks like this:

1. **Reason** — The AI reads your prompt and decides what to do
2. **Inspect** — It reads the current scene state (layers, timelines, keyframes)
3. **Act** — It adds layers, creates keyframes, or runs a script
4. **Verify** — It checks whether the result matches what you asked for
5. **Continue or finish** — If more work is needed it loops; otherwise it reports what it did

This means the AI can handle multi-step requests without you breaking them into pieces. "Add three circles and stagger their appearance" is handled as a single prompt.

---

## What the AI Can Do

The AI has full access to the Chorono scene API. It can:

- **Create layers** — shapes, text, images, splines, groups
- **Delete or update layers** — change any property on any layer
- **Set keyframes** — position, scale, rotation, opacity, color, and custom properties
- **Build timelines** — create tracks, set durations, choose easing curves
- **Run scripts** — for complex procedural animations the AI writes and executes JavaScript
- **Read scene state** — it sees layer names, positions, timeline state, and existing keyframes before acting
- **Use built-in animation helpers:**
  - `create_stagger_animation` — stagger any property across multiple layers
  - `center_layer` — center one or more layers on the canvas
  - `align_layers` — align layers relative to each other or the canvas
  - `fit_to_canvas` — scale a layer to fill the canvas
  - `create_loop_animation` — wrap a timeline into a seamless loop

---

## What the AI Cannot Do (Yet)

The following are not yet supported:

- **Export** — The AI cannot trigger or configure export. Use the Export panel manually.
- **Complex physics** — Gravity, collisions, and rigid-body simulations are not available.
- **Per-character text animation** — Animating individual letters independently is not yet supported.
- **Audio sync** — The AI cannot read or respond to audio waveform data.

---

## Quick Action Chips

Below the chat input you will see a row of **Quick Action** buttons. These are pre-built prompts for the most common tasks:

- **Center all** — centers every layer on the canvas
- **Add fade in** — adds a 1-second opacity fade-in to the selected layer
- **Stagger entrance** — staggers the selected layers' entrance animations
- **Loop animation** — wraps the current timeline into a loop
- **Fit to canvas** — scales the selected layer to fill the canvas

Click any chip to run it immediately without typing. You can customise these chips in Settings > AI > Quick Actions.

---

## Undo Support

Every change the AI makes goes through Chorono's standard command history. You can undo any AI action with **Ctrl+Z** (or Cmd+Z on Mac), exactly like manual edits. If the AI creates 10 keyframes in one pass, a single undo undoes all 10.

---

## Tips for Better Results

**Be specific about timing.** Instead of "make it animate slowly", say "animate over 2.5 seconds". The AI will use your exact value.

**Name your layers.** If your layers have names like "logo", "subtitle", and "background", you can refer to them directly: "make the logo slide in first, then the subtitle". Unnamed layers are harder to target.

**Describe the end state, not the steps.** Say "the box should end up in the top-right corner" rather than "move the box 400 pixels to the right". The AI will figure out the coordinates.

**Use one concept per prompt.** If you want both a slide-in and a color change, send them as separate prompts. The AI handles each cleanly and the result is easier to undo if needed.

**Iterate.** Start with a basic prompt and refine it. "Make it faster" or "use an ease-in instead of ease-out" work perfectly as follow-up messages.
