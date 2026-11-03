# Chorono NextJS — Claude Code Guidelines

> These rules override system defaults. Follow them exactly.

---

## 🏗️ Code Style & Architecture

### OOP & Class Hierarchies
See **[[coding_standards_oop]]** in memory for full spec. Summary:

- **Singleton**: Only for specific cases (shared utilities, managers)
- **Class hierarchies**: Always use abstract base class first
  - Common properties in base
  - Getters/setters on every class (private properties)
  - Example: `Shape (abstract) → Rect, Circle, Polygon`
- **Access**: `private` properties, `public` methods/classes (default)
- **Deviate only if**: Performance-critical, framework demands, type-safety requires

### General Rules
- Edit existing files, don't create new ones
- **No comments** unless WHY is non-obvious (gizli constraint, workaround)
- Don't explain WHAT—good names do that
- Avoid premature abstraction (3 lines > abstract class)
- Trust internal code; only validate at system boundaries
- No error handling for impossible scenarios
- Security first: prevent XSS, SQL injection, OWASP top 10
- **Reuse-before-create**: before writing a new lib/module/helper, search for an existing one and extend it instead of duplicating ([[coding_standards_oop]])

---

## ⚡ Operations & Safety

### Next.js Build
**CRITICAL**: Never run `next build` while dev server is running.
- Corrupts `.next` directory
- Blanks the app on reload
- Always: stop dev server → build → restart dev

### Multi-Mode System
- Code lives in `src/lib/core` — understand data model (Layer, Timeline, Track, Keyframe, ChronoScene)
- Use ModeRegistry to add new modes
- See [[arch_multi_mode_system]] in memory

### Scripting & Events
**MANDATORY**: Every new class must emit/expose its events per script-event structure.
- Silent bugs if you skip this
- See [[arch_scripting_event_system]] in memory

### SceneCanvas Drag Invariants
- Live-scale + ref-stable handlers are **critical**
- Break them → objects escape/bounce
- See [[feedback_scenecanvas_drag_invariants]] in memory

---

## 🤖 Agent & Prompt Quality

When delegating planning/exploration tasks, see **[[agent_prompt_quality]]** in memory:

- **Planning tasks** need quality score **8+** before running Plan agent
- Ask enrichment questions (constraints, scope, success criteria, prior art)
- Use right agent type: Plan (strategy), Explore (search), Simplify (review)
- Document answers so future sessions don't re-learn context

---

## 📁 Structure

- Feature branches: `feature/*`
- Main branch: `main`
- Commits: Use existing git user (codie1982)
- Memory: Read from `~/.claude/projects/.../memory/MEMORY.md` each session

---

## 🔗 Key References

- [MCP animation authoring](AGENTS.md) — connected editor workflow for Claude and Codex
- [MCP setup and capabilities](docs/tr/mcp.md) — isolated scripts, multi-timeline animation, previews and portable projects

- [[arch_multi_mode_system]] — App fundamentals (start here)
- [[arch_scripting_event_system]] — JS scripting + events (mandatory for new classes)
- [[coding_standards_oop]] — OOP rules, Singleton, abstract classes
- [[agent_prompt_quality]] — Prompt scoring & enrichment questions
