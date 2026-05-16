// ── SvgPathParser ─────────────────────────────────────────────────────────────
//
// Parses an SVG path `d` attribute into our internal NormalizedPathCommand[]
// (M | L | C | Q | Z only). Performs three transformations:
//
//   1. RELATIVE → ABSOLUTE
//      Lowercase commands (m, l, c, s, q, t, a, h, v) are offsets from the
//      current point. We add the current point to make every coordinate
//      absolute, so the renderer never has to track state.
//
//   2. SHORTHAND → FULL
//      H/V → L (horizontal/vertical lineto becomes a regular lineto)
//      S → C (smooth cubic: control point 1 = reflection of previous c2)
//      T → Q (smooth quadratic: control point = reflection of previous q1)
//
//   3. ARC → CUBIC
//      A → one or more C commands via SvgArcConverter (Maisonobe algorithm).
//
// The parser also handles SVG's "implicit repeat" semantics: after an M
// command, additional coordinate pairs are treated as L; after a C, more
// 6-tuples are treated as C; etc.
//
// Pure: no DOM, no canvas. Fully testable in node.

import type {
  NormalizedPathCommand, MoveToCommand, LineToCommand, CubicToCommand, QuadToCommand,
} from '@/lib/geometry/PathCommand'
import { M, L, C, Q, Z } from '@/lib/geometry/PathCommand'
import { SvgArcConverter } from './SvgArcConverter'
import type { SvgImportWarning } from '@/lib/types/svg'

export class SvgPathParser {
  constructor(private arcConverter: SvgArcConverter = new SvgArcConverter()) {}

  parse(d: string, warnings: SvgImportWarning[] = []): NormalizedPathCommand[] {
    if (!d || d.trim().length === 0) return []

    const tokens = tokenize(d)
    if (tokens.length === 0) return []

    const out: NormalizedPathCommand[] = []

    // ── Mutable parse state ─────────────────────────────────────────────────
    let curX = 0, curY = 0                   // current pen position (absolute)
    let startX = 0, startY = 0               // start of current subpath (for Z)
    let lastCubicCtrlX: number | null = null // for S: reflection of prev C control 2
    let lastCubicCtrlY: number | null = null
    let lastQuadCtrlX:  number | null = null // for T: reflection of prev Q control
    let lastQuadCtrlY:  number | null = null
    let lastCmd: string | null = null        // for implicit repeat

    let i = 0
    while (i < tokens.length) {
      const tk = tokens[i]
      let cmd: string

      if (tk.type === 'cmd') {
        cmd = tk.value as string
        i++
      } else {
        // Implicit repeat — reuse the last command. Per SVG spec, after M/m
        // implicit args are L/l, not M/m.
        if (lastCmd === null) {
          warnings.push({
            code:    'INVALID_PATH_DATA',
            message: `Path data starts with a number — first token must be M or m`,
          })
          return out
        }
        cmd = lastCmd === 'M' ? 'L' : (lastCmd === 'm' ? 'l' : lastCmd)
      }

      const absolute = cmd === cmd.toUpperCase()
      const cmdU     = cmd.toUpperCase()

      // Read N args required by the command.
      const argCount = ARG_COUNT[cmdU]
      if (argCount === undefined) {
        warnings.push({
          code:    'INVALID_PATH_DATA',
          message: `Unknown SVG path command "${cmd}"`,
        })
        return out
      }

      // Z has zero args
      if (cmdU === 'Z') {
        out.push(Z())
        curX = startX
        curY = startY
        lastCubicCtrlX = lastCubicCtrlY = null
        lastQuadCtrlX  = lastQuadCtrlY  = null
        lastCmd = cmd
        continue
      }

      // Read one tuple of args
      const args: number[] = []
      for (let a = 0; a < argCount; a++) {
        if (i >= tokens.length || tokens[i].type !== 'num') {
          warnings.push({
            code:    'INVALID_PATH_DATA',
            message: `Not enough arguments for ${cmd} — expected ${argCount}, found ${a}`,
          })
          return out
        }
        args.push(tokens[i].value as number)
        i++
      }

      // ── Dispatch by command kind ───────────────────────────────────────────

      switch (cmdU) {
        case 'M': {
          let [x, y] = args
          if (!absolute) { x += curX; y += curY }
          out.push(M(x, y))
          curX = startX = x
          curY = startY = y
          lastCubicCtrlX = lastCubicCtrlY = null
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
        case 'L': {
          let [x, y] = args
          if (!absolute) { x += curX; y += curY }
          out.push(L(x, y))
          curX = x; curY = y
          lastCubicCtrlX = lastCubicCtrlY = null
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
        case 'H': {
          let [x] = args
          if (!absolute) x += curX
          out.push(L(x, curY))
          curX = x
          lastCubicCtrlX = lastCubicCtrlY = null
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
        case 'V': {
          let [y] = args
          if (!absolute) y += curY
          out.push(L(curX, y))
          curY = y
          lastCubicCtrlX = lastCubicCtrlY = null
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
        case 'C': {
          let [x1, y1, x2, y2, x, y] = args
          if (!absolute) {
            x1 += curX; y1 += curY
            x2 += curX; y2 += curY
            x  += curX; y  += curY
          }
          out.push(C(x1, y1, x2, y2, x, y))
          curX = x; curY = y
          lastCubicCtrlX = x2; lastCubicCtrlY = y2
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
        case 'S': {
          // Smooth cubic: x1, y1 = reflection of previous C's c2 around current point.
          let [x2, y2, x, y] = args
          if (!absolute) {
            x2 += curX; y2 += curY
            x  += curX; y  += curY
          }
          const x1: number = lastCubicCtrlX !== null ? 2 * curX - lastCubicCtrlX : curX
          const y1: number = lastCubicCtrlY !== null ? 2 * curY - lastCubicCtrlY : curY
          out.push(C(x1, y1, x2, y2, x, y))
          curX = x; curY = y
          lastCubicCtrlX = x2; lastCubicCtrlY = y2
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
        case 'Q': {
          let [x1, y1, x, y] = args
          if (!absolute) {
            x1 += curX; y1 += curY
            x  += curX; y  += curY
          }
          out.push(Q(x1, y1, x, y))
          curX = x; curY = y
          lastQuadCtrlX = x1; lastQuadCtrlY = y1
          lastCubicCtrlX = lastCubicCtrlY = null
          break
        }
        case 'T': {
          // Smooth quadratic: x1, y1 = reflection of previous Q's control point.
          let [x, y] = args
          if (!absolute) { x += curX; y += curY }
          const x1: number = lastQuadCtrlX !== null ? 2 * curX - lastQuadCtrlX : curX
          const y1: number = lastQuadCtrlY !== null ? 2 * curY - lastQuadCtrlY : curY
          out.push(Q(x1, y1, x, y))
          curX = x; curY = y
          lastQuadCtrlX = x1; lastQuadCtrlY = y1
          lastCubicCtrlX = lastCubicCtrlY = null
          break
        }
        case 'A': {
          let [rx, ry, xAxisRotationDeg, largeArc, sweep, x, y] = args
          if (!absolute) { x += curX; y += curY }

          // Degenerate cases → line to endpoint
          if (rx === 0 || ry === 0 || (curX === x && curY === y)) {
            if (!(curX === x && curY === y)) out.push(L(x, y))
          } else {
            const cubics = this.arcConverter.convert({
              x1: curX, y1: curY,
              x2: x,    y2: y,
              rx, ry,
              xAxisRotationDeg,
              largeArc: largeArc ? 1 : 0,
              sweep:    sweep    ? 1 : 0,
            })
            for (const c of cubics) out.push(c)
            if (cubics.length === 0 && (curX !== x || curY !== y)) {
              // Degenerate arc that converter rejected — fall back to line.
              out.push(L(x, y))
            }
          }
          curX = x; curY = y
          lastCubicCtrlX = lastCubicCtrlY = null
          lastQuadCtrlX  = lastQuadCtrlY  = null
          break
        }
      }

      lastCmd = cmd
    }

    return out
  }
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

interface CmdToken { type: 'cmd'; value: string }
interface NumToken { type: 'num'; value: number }
type Token = CmdToken | NumToken

/**
 * Walks the d string char-by-char and yields commands + numbers. SVG path
 * data uses minimal punctuation:
 *   - Commands are single letters from MmLlHhVvCcSsQqTtAaZz
 *   - Numbers may be separated by whitespace, comma, OR by a sign / decimal
 *     point that starts a new number (e.g. "10-5" = "10", "-5";
 *     "10.5.3" = "10.5", ".3")
 *   - Numbers support scientific notation (1e-3) which complicates the
 *     "sign starts a new number" rule (the 'e' itself can be followed by
 *     a sign that does NOT start a new number).
 */
function tokenize(d: string): Token[] {
  const out: Token[] = []
  const n = d.length
  let i = 0
  while (i < n) {
    const c = d.charCodeAt(i)

    // Whitespace / comma — skip
    if (c === 0x20 /*space*/ || c === 0x09 /*tab*/ ||
        c === 0x0a /*LF*/    || c === 0x0d /*CR*/ ||
        c === 0x2c /*,*/) {
      i++
      continue
    }

    // Command letter
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      out.push({ type: 'cmd', value: d[i] })
      i++
      continue
    }

    // Number — may start with '-', '+', '.' or a digit
    if ((c >= 0x30 && c <= 0x39) /*0-9*/ || c === 0x2d /*-*/ || c === 0x2b /*+*/ || c === 0x2e /*.*/) {
      const start = i
      i++
      let sawDecimal = c === 0x2e
      let sawExp     = false
      while (i < n) {
        const cc = d.charCodeAt(i)
        if (cc >= 0x30 && cc <= 0x39) {                   // digit
          i++
        } else if (cc === 0x2e /*.*/ && !sawDecimal && !sawExp) {
          sawDecimal = true
          i++
        } else if ((cc === 0x65 /*e*/ || cc === 0x45 /*E*/) && !sawExp) {
          sawExp = true
          i++
          // Optional sign immediately after exponent letter
          if (i < n) {
            const sc = d.charCodeAt(i)
            if (sc === 0x2b || sc === 0x2d) i++
          }
        } else {
          break
        }
      }
      const numStr = d.slice(start, i)
      const num    = parseFloat(numStr)
      if (Number.isFinite(num)) out.push({ type: 'num', value: num })
      continue
    }

    // Unknown character — skip
    i++
  }
  return out
}

// ── Argument counts per command (uppercase only — case is checked separately) ─

const ARG_COUNT: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}
