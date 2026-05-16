// ── SvgNodeConverter ──────────────────────────────────────────────────────────
//
// Walks an SVGSVGElement DOM tree and emits Chorono Layer[]. Pushes a new
// SvgImportContext at each <g> so transform inheritance works.
//
// SKELETON (Sprint 5.1):
//   - <g>            recurse with composed transform + inherited style
//   - <rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline>
//                    Sprint 5.3 will fill these in via SvgShapeConverter
//   - <path>         Sprint 5.2 will fill this in via SvgPathParser
//   - everything else  emits UNSUPPORTED_ELEMENT warning
//
// This file establishes the WALK structure. Actual shape→Layer conversion is
// the next sprint slice — that keeps each PR reviewable.

import type { Layer } from '@/lib/types'
import type {
  SvgImportContext, SvgImportResult, SvgImportOptions, SvgImportWarning,
} from '@/lib/types/svg'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { SvgTransformParser } from './SvgTransformParser'
import { SvgStyleParser } from './SvgStyleParser'
import { SvgShapeConverter } from './SvgShapeConverter'
import { SvgPathParser } from './SvgPathParser'
import { SvgLayerFactory } from './SvgLayerFactory'
import type { SvgRootContext } from './SvgViewBoxNormalizer'

export class SvgNodeConverter {
  constructor(
    private transformParser: SvgTransformParser = new SvgTransformParser(),
    private styleParser:     SvgStyleParser     = new SvgStyleParser(),
    private shapeConverter:  SvgShapeConverter  = new SvgShapeConverter(),
    private pathParser:      SvgPathParser      = new SvgPathParser(),
    private layerFactory:    SvgLayerFactory    = new SvgLayerFactory(),
  ) {}

  convertDocument(
    svgRoot: SVGSVGElement,
    rootCtx: SvgRootContext,
    options: SvgImportOptions = {},
  ): SvgImportResult {
    const warnings: SvgImportWarning[] = []
    const layers:   Layer[]            = []

    const initialContext: SvgImportContext = {
      transform:   rootCtx.rootMatrix,
      opacity:     1,
      layerCount:  0,
      warnings,
    }

    this.walk(svgRoot, initialContext, layers, options)

    if (layers.length === 0) {
      warnings.push({
        code:    'EMPTY_DOCUMENT',
        message: 'SVG contained no convertible elements',
      })
    }

    return {
      layers,
      width:    rootCtx.width,
      height:   rootCtx.height,
      viewBox:  rootCtx.viewBox,
      warnings,
    }
  }

  /**
   * Depth-first walk. At each element:
   *   1. Compose local transform → context
   *   2. Inherit style (fill/stroke/opacity)
   *   3. If <g>, recurse with new context
   *   4. If leaf element, hand off to shape/path converter (Sprint 5.2/5.3)
   *   5. Unknown elements → UNSUPPORTED_ELEMENT warning
   */
  private walk(
    node:    Element,
    parentCtx: SvgImportContext,
    layers:  Layer[],
    options: SvgImportOptions,
  ): void {
    for (let i = 0; i < node.children.length; i++) {
      // Honour layer cap
      if (options.maxLayers !== undefined && parentCtx.layerCount >= options.maxLayers) {
        parentCtx.warnings.push({
          code:    'LIMIT_REACHED',
          message: `Reached maxLayers (${options.maxLayers}); remaining elements skipped`,
        })
        return
      }

      const child = node.children[i]
      const tag   = child.tagName.toLowerCase()

      // Compose transform: parent × this element's own transform
      const localTransform = this.transformParser.parse(
        child.getAttribute('transform'),
        parentCtx.warnings,
      )
      const composed = parentCtx.transform.multiply(localTransform)

      // Inherit + parse style (resolved in 5.3 — for now just propagate)
      const style = this.styleParser.parse(child as any, parentCtx.warnings)
      const childCtx: SvgImportContext = {
        ...parentCtx,
        transform:   composed,
        fill:        style.fill        ?? parentCtx.fill,
        stroke:      style.stroke      ?? parentCtx.stroke,
        strokeWidth: style.strokeWidth ?? parentCtx.strokeWidth,
        opacity:     parentCtx.opacity * (style.opacity ?? 1),
      }

      // Dispatch by tag
      switch (tag) {
        case 'g':
        case 'svg':
          // Recurse into containers
          this.walk(child, childCtx, layers, options)
          break

        case 'defs':
          // Definitions — gradients, clipPaths, symbols. V1 ignored.
          // (Future: collect gradients into an asset registry.)
          break

        case 'title':
        case 'desc':
        case 'metadata':
          // Non-renderable — silently skipped (spec-defined behaviour).
          break

        case 'path': {
          const d = child.getAttribute('d')
          if (!d) break
          const cmds = this.pathParser.parse(d, parentCtx.warnings)
          const layer = this.layerFactory.buildPathLayer(
            cmds, childCtx, style, `Path ${parentCtx.layerCount + 1}`,
          )
          if (layer) {
            layers.push(layer)
            parentCtx.layerCount++
          }
          break
        }

        case 'rect':
        case 'circle':
        case 'ellipse':
        case 'line':
        case 'polyline':
        case 'polygon': {
          const cmds = this.shapeConverter.convert(child as any, parentCtx.warnings)
          if (cmds.length === 0) break
          const name = `${tag[0].toUpperCase()}${tag.slice(1)} ${parentCtx.layerCount + 1}`
          const layer = this.layerFactory.buildPathLayer(cmds, childCtx, style, name)
          if (layer) {
            layers.push(layer)
            parentCtx.layerCount++
          }
          break
        }

        case 'text':
        case 'tspan':
          parentCtx.warnings.push({
            code:     'TEXT_IGNORED',
            message:  `<${tag}> ignored — text import lands in V2`,
            nodeName: tag,
          })
          break

        case 'filter':
        case 'mask':
        case 'clippath':
        case 'pattern':
        case 'symbol':
        case 'use':
          parentCtx.warnings.push({
            code:     'UNSUPPORTED_ELEMENT',
            message:  `<${tag}> not supported in V1`,
            nodeName: tag,
          })
          break

        default:
          parentCtx.warnings.push({
            code:     'UNSUPPORTED_ELEMENT',
            message:  `Unknown SVG element <${tag}> skipped`,
            nodeName: tag,
          })
      }
    }
  }
}
