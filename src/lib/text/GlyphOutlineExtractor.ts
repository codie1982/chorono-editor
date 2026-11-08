// ── Text → Spline glyph outlines (BL-73 Sprint 6 / BL-62) ─────────────────────
//
// Converts a text string into editable granular spline data using opentype.js
// to read real glyph outlines. Each glyph becomes one SubShape (multi-contour
// for letters with holes like O / A / B). Quadratic on-curve commands are
// elevated to cubics so everything fits the handle-canonical model.
//
// The bounded outline-font owner lends parsed input only for conversion.

import type * as opentype from 'opentype.js'
import type { SplinePathData } from '@/lib/types/spline'
import type { AnchorSpec, ContourSpec } from '../spline/util/buildSplineData'
import { buildSplineData } from '../spline/util/buildSplineData'
import { mergeSplineData } from '../spline/factory/mergeSplineData'
import { computeSplineBounds } from '../spline/geometry/computeSplineBounds'
import { translateSplineData } from '../spline/geometry/translateSplineData'
import {editorOutlineFonts} from './fonts'

const DEFAULT_FONT_URL = '/fonts/GeistVF.woff'

const EPS = 0.01

/** opentype glyph path commands → granular contour anchor specs. */
function glyphPathToContours(cmds: opentype.PathCommand[]): ContourSpec[] {
  const contours: ContourSpec[] = []
  let cur: AnchorSpec[] | null = null

  const finish = () => {
    if (cur && cur.length) {
      // Glyph contours usually end back on the start point; drop the duplicate
      // and carry its incoming handle onto the first anchor so the auto-created
      // closing segment keeps the curve.
      if (cur.length > 1) {
        const a = cur[0], z = cur[cur.length - 1]
        if (Math.hypot(a.x - z.x, a.y - z.y) < EPS) {
          if (z.in) a.in = z.in
          cur.pop()
        }
      }
      if (cur.length >= 2) contours.push({ closed: true, anchors: cur })
    }
    cur = null
  }

  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        finish()
        cur = [{ x: c.x, y: c.y, type: 'corner' }]
        break
      case 'L':
        cur?.push({ x: c.x, y: c.y, type: 'corner' })
        break
      case 'C': {
        if (!cur) break
        const prev = cur[cur.length - 1]
        prev.out = { x: c.x1, y: c.y1 }; prev.type = 'smooth'
        cur.push({ x: c.x, y: c.y, in: { x: c.x2, y: c.y2 }, type: 'smooth' })
        break
      }
      case 'Q': {
        if (!cur) break
        const prev = cur[cur.length - 1]
        // elevate quadratic → cubic
        const cp1x = prev.x + (2 / 3) * (c.x1 - prev.x)
        const cp1y = prev.y + (2 / 3) * (c.y1 - prev.y)
        const cp2x = c.x + (2 / 3) * (c.x1 - c.x)
        const cp2y = c.y + (2 / 3) * (c.y1 - c.y)
        prev.out = { x: cp1x, y: cp1y }; prev.type = 'smooth'
        cur.push({ x: c.x, y: c.y, in: { x: cp2x, y: cp2y }, type: 'smooth' })
        break
      }
      case 'Z':
        finish()
        break
    }
  }
  finish()
  return contours
}

/**
 * Builds centered granular spline data for `text` at `fontSize` px.
 * Returns null when the string yields no drawable glyphs (e.g. only spaces).
 * Owns no font cache: the shared bounded font owner pins input through conversion.
 * Runtime cancellation is optional and never serialized; stale output rejects.
 * Text is limited to 4096 UTF-16 units and 50000 path commands, preventing an
 * unbounded synchronous geometry expansion. Geometry uses the original centered
 * pixel convention, contour closure and quadratic-to-cubic approximation.
 */
export async function textToSplineData(
  text: string,
  fontSize: number,
  fontUrl: string = DEFAULT_FONT_URL,
  options: {signal?:AbortSignal} = {},
): Promise<SplinePathData | null> {
  validateOutlineInput(text,fontSize)
  return editorOutlineFonts.withFont(fontUrl,font=>fontTextToSplineData(font,text,fontSize),options)
}

/** Pure copied-geometry conversion while caller owns the parsed font. Never
 * returns lazy glyph/path objects. Command limit counts all glyphs, including
 * contours later discarded as degenerate; no scene/native state is modified.
 * Uses centered editor pixels, EPS=0.01px closure and quadratic elevation.
 * Same input-size/command policy as the asynchronous convenience entry point. */
export function fontTextToSplineData(font:opentype.Font,text:string,fontSize:number):SplinePathData|null {
  validateOutlineInput(text,fontSize)
  if(!Number.isFinite(font.unitsPerEm)||font.unitsPerEm<=0)throw new RangeError('Outline font units per em must be positive.')
  const scale = fontSize / font.unitsPerEm
  let penX = 0
  let merged: SplinePathData | null = null
  let commandCount=0

  for (const glyph of font.stringToGlyphs(text)) {
    const path = glyph.getPath(penX, 0, fontSize)
    commandCount+=path.commands.length
    if(commandCount>50000)throw new RangeError('Outline conversion exceeds the 50000-command limit.')
    const contours = glyphPathToContours(path.commands)
    if (contours.length) {
      const data = buildSplineData({
        kind: 'textOutline',
        name: glyph.name || 'glyph',
        source: 'convertedText',
        fillRule: 'nonzero',
        contours,
      })
      merged = merged ? mergeSplineData(merged, data) : data
    }
    penX += (glyph.advanceWidth ?? font.unitsPerEm) * scale
  }

  if (!merged) return null
  const b = computeSplineBounds(merged)
  return translateSplineData(merged, -(b.x + b.width / 2), -(b.y + b.height / 2))
}

/** Shared conversion contract checked before IO and by direct converter callers. */
function validateOutlineInput(text:string,fontSize:number):void {
  if(!Number.isFinite(fontSize)||fontSize<=0)throw new RangeError('Outline font size must be positive.')
  if(text.length>4096)throw new RangeError('Outline conversion exceeds the 4096-character limit.')
}
