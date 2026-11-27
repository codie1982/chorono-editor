import type { SplinePathData } from '../../types/spline'
import type { SplineEditMode } from '../selection'
import type { BandChain } from './types'

/** Directed contiguous selected chains, in source order. Closed seam chains
 * are joined once; disconnected selections remain separate. No promotion to
 * unselected edges. Object selection includes every owned contour and hole. */
export function bandSelection(data: SplinePathData, mode: SplineEditMode, ids: readonly string[]): BandChain[] {
  if (!ids.length || !['edge', 'object'].includes(mode)) throw new Error('Select edges or spline Objects for Outline.')
  const selected = new Set(ids), records = mode === 'edge' ? data.segments : data.subShapes
  if (ids.some(id => !records[id])) throw new Error('Outline selection no longer exists.')
  const chains: BandChain[] = []
  for (const object of Object.values(data.subShapes)) for (const contourId of object.contourIds) {
    const contour = data.contours[contourId], edges = contour.segmentIds
    const chosen = (id: string) => mode === 'object' ? selected.has(object.id) : selected.has(id)
    if (edges.every(chosen)) { chains.push({ objectId: object.id, contourId, edgeIds: [...edges], closed: contour.closed }); continue }
    let order = edges
    if (contour.closed) { const gap = edges.findIndex(id => !chosen(id)); order = [...edges.slice(gap + 1), ...edges.slice(0, gap + 1)] }
    let chain: string[] = []
    const flush = () => { if (chain.length) chains.push({ objectId: object.id, contourId, edgeIds: chain, closed: false }); chain = [] }
    for (const id of order) { if (chosen(id)) chain.push(id); else flush() }
    flush()
  }
  if (!chains.length || chains.length > 32 || chains.reduce((n, c) => n + c.edgeIds.length, 0) > 2048) throw new Error('Outline needs 1–32 selected chains and at most 2048 edges.')
  return chains
}
