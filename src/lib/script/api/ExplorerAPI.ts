import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import type { ChronoScene, Layer, Transform } from '../../types'
import type { ApiContext } from './LayerHandle'
import { copyScriptData } from './scriptData'
import { parseSearchQuery } from '../../sceneExplorer/searchQuery'
import { matchesQuery } from '../../sceneExplorer/searchEval'
import { makeGroupCmd, makeUngroupCmd } from '../../editor/commands-group'
import { makeBulkUpdateLayersCmd, makeMoveLayerToCmdWithSnapshot, makeUpdateLayerCmd } from '../../editor/commands-layer'
import { assertStaticTransform, localTransform } from '../../editor/branches/WorldPlacement'
import { Matrix2D } from '../../geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { createLayerWorldBoundsResolver } from '../../geometry/resolveLayerWorldBounds'

export interface ExplorerReadOptions { timelineId?: string; timeMs?: number }
export interface ExplorerQuery extends ExplorerReadOptions {
  search?: string
  parentId?: string | null
  recursive?: boolean
  includeAncestors?: boolean
  offset?: number
  limit?: number
}
export interface ExplorerNode {
  id: string
  name: string
  type: Layer['type']
  parentId: string | null
  childIds: string[]
  ancestorIds: string[]
  depth: number
  index: number
  flags: { hidden: boolean; locked: boolean; solo: boolean; pinned: boolean; frozen: boolean }
  inherited: { hidden: boolean; locked: boolean; frozen: boolean }
  links: { instanceOf: string | null; sourceLayerId: string | null; pathLayerId: string | null; assetId: string | null; maskLayerIds: string[] }
  tracks: { timelineId: string; target: string; keyframeCount: number }[]
  effects: { css: Layer['effects'] | null; chain: NonNullable<Layer['effectsChain']>; masks: NonNullable<Layer['masks']> }
  worldBounds: { x: number; y: number; width: number; height: number } | null
  data?: Layer
}
export interface ExplorerTreeNode extends ExplorerNode { children: ExplorerTreeNode[] }
export type ExplorerFlags = Partial<Pick<Layer, 'hidden' | 'locked' | 'solo' | 'pinned'>>
interface Hierarchy { byId: Map<string, Layer>; children: Map<string | null, string[]>; ancestors: Map<string, string[]> }

function hierarchy(scene: ChronoScene): Hierarchy {
  const byId = new Map<string, Layer>(), children = new Map<string | null, string[]>(), ancestors = new Map<string, string[]>()
  for (const layer of scene.layers) {
    if (byId.has(layer.id)) throw new Error('Duplicate layer id in scene hierarchy.')
    byId.set(layer.id, layer)
  }
  for (const layer of scene.layers) {
    const parent = layer.parentId ?? null
    if (parent && !byId.has(parent)) throw new Error(`Missing parent '${parent}'.`)
    children.set(parent, [...(children.get(parent) ?? []), layer.id])
    const path: string[] = [], seen = new Set([layer.id])
    let id = parent
    while (id) {
      if (seen.has(id) || path.length >= 64) throw new Error('Cyclic or excessively deep scene hierarchy.')
      seen.add(id); path.unshift(id)
      id = byId.get(id)?.parentId ?? null
    }
    ancestors.set(layer.id, path)
  }
  return { byId, children, ancestors }
}
function requireLayer(index: Hierarchy, id: string): Layer {
  const layer = index.byId.get(id)
  if (!layer) throw new Error(`Layer '${id}' was not found.`)
  return layer
}
function descendantIds(index: Hierarchy, id: string): string[] {
  const result: string[] = []
  const visit = (parent: string) => { for (const child of index.children.get(parent) ?? []) { result.push(child); visit(child) } }
  visit(id)
  return result
}
function selectedRoots(scene: ChronoScene, index: Hierarchy, ids: string | string[]): string[] {
  const input = typeof ids === 'string' ? [ids] : ids
  if (!Array.isArray(input) || !input.length || input.length > 5000 || input.some(id => typeof id !== 'string')) throw new Error('Supply one or more layer ids.')
  const selected = new Set(input)
  for (const id of input) requireLayer(index, id)
  return scene.layers.filter(layer => selected.has(layer.id) && !index.ancestors.get(layer.id)!.some(id => selected.has(id))).map(layer => layer.id)
}
function editable(index: Hierarchy, id: string, subtree = false): void {
  requireLayer(index, id)
  const ids = [id, ...index.ancestors.get(id)!, ...(subtree ? descendantIds(index, id) : [])]
  for (const target of ids) {
    const layer = requireLayer(index, target)
    if (layer.locked || layer.frozen) throw new Error(`Unlock and unfreeze '${layer.name}' before editing its hierarchy.`)
  }
}
function flags(layer: Layer): ExplorerNode['flags'] {
  return { hidden: !!layer.hidden, locked: !!layer.locked, solo: !!layer.solo, pinned: !!layer.pinned, frozen: !!layer.frozen }
}

/** Scene Explorer domain API. It does not read/change DOM, selection, columns or collapse state. */
export class ExplorerAPI {
  constructor(private readonly ctx: ApiContext) {}

  private read(options: ExplorerReadOptions = {}) {
    const scene = this.ctx.host.getScene(), index = hierarchy(scene)
    const timeMs = options.timeMs ?? 0
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('Explorer time must be finite and within one hour.')
    const timelineId = options.timelineId ?? this.ctx.resolveTimelineId()
    if (options.timelineId !== undefined && !scene.timelines.some(timeline => timeline.id === options.timelineId)) throw new Error('Explorer timeline was not found.')
    const timelines = scene.timelines.filter(timeline => timeline.id === timelineId)
    const bounds = createLayerWorldBoundsResolver(scene, timeMs, evaluateSceneFrame({ ...scene, timelines }, timeMs).overrides)
    const makeNode = (id: string, data = false): ExplorerNode => {
      const layer = requireLayer(index, id), ancestorIds = index.ancestors.get(id)!
      const ancestors = ancestorIds.map(id => index.byId.get(id)!)
      const prefix = `layers.${id}.`
      return copyScriptData({ id, name: layer.name, type: layer.type, parentId: layer.parentId ?? null,
        childIds: index.children.get(id) ?? [], ancestorIds, depth: ancestorIds.length,
        index: (index.children.get(layer.parentId ?? null) ?? []).indexOf(id), flags: flags(layer),
        inherited: { hidden: ancestors.some(parent => parent.hidden), locked: ancestors.some(parent => parent.locked), frozen: ancestors.some(parent => parent.frozen) },
        links: { instanceOf: layer.instanceOf ?? null, sourceLayerId: layer.repeater?.sourceLayerId ?? layer.particleEmitter?.emitter.area?.sourceLayerId ?? null,
          pathLayerId: layer.followPath?.pathLayerId ?? layer.particleEmitter?.emitter.area?.pathLayerId ?? null, assetId: layer.image?.assetId ?? layer.video?.assetId ?? layer.audio?.assetId ?? layer.frameSequence?.assetId ?? null,
          maskLayerIds: layer.masks?.map(mask => mask.maskLayerId) ?? [] },
        tracks: timelines.flatMap(timeline => timeline.tracks.filter(track => track.target.startsWith(prefix)).map(track => ({ timelineId: timeline.id, target: track.target, keyframeCount: track.keyframes.length }))),
        effects: { css: layer.effects ?? null, chain: layer.effectsChain ?? [], masks: layer.masks ?? [] },
        worldBounds: bounds(layer), ...(data ? { data: layer } : {}) })
    }
    return { scene, index, timelines, makeNode }
  }
  private apply(label: string, update: (scene: ChronoScene) => ChronoScene): void {
    const before = this.ctx.host.getScene(), after = update(before)
    this.ctx.host.applyCommand({ label, execute: () => after, undo: () => before })
  }

  get roots(): string[] { return [...(hierarchy(this.ctx.host.getScene()).children.get(null) ?? [])] }
  get nodes(): ExplorerNode[] { const { scene, makeNode } = this.read(); return scene.layers.map(layer => makeNode(layer.id)) }
  get tree(): ExplorerTreeNode[] {
    const { index, makeNode } = this.read()
    const build = (id: string): ExplorerTreeNode => ({ ...makeNode(id), children: (index.children.get(id) ?? []).map(build) })
    return (index.children.get(null) ?? []).map(build)
  }
  node(id: string, options: ExplorerReadOptions = {}): ExplorerNode { return this.read(options).makeNode(id, true) }
  children(id: string | null = null): string[] {
    const index = hierarchy(this.ctx.host.getScene())
    if (id !== null) requireLayer(index, id)
    return [...(index.children.get(id) ?? [])]
  }
  ancestors(id: string): string[] { const index = hierarchy(this.ctx.host.getScene()); requireLayer(index, id); return [...index.ancestors.get(id)!] }
  descendants(id: string): string[] { const index = hierarchy(this.ctx.host.getScene()); requireLayer(index, id); return descendantIds(index, id) }

  /** Same faceted grammar as the UI; default results contain matches, not retained ancestor rows. */
  query(filter: string | ExplorerQuery = '', options: ExplorerQuery = {}): ExplorerNode[] {
    const input = typeof filter === 'string' ? { ...options, search: filter } : filter
    const { scene, index, timelines, makeNode } = this.read(input)
    const search = parseSearchQuery(input.search ?? '')
    const animated = (layer: Layer) => timelines.some(timeline => timeline.tracks.some(track => track.target.startsWith(`layers.${layer.id}.`) && track.keyframes.length > 0))
    const hasEffects = (layer: Layer) => !!(layer.effectsChain?.length || layer.masks?.length)
    let scope: Set<string> | undefined
    if (input.parentId !== undefined) {
      if (input.parentId !== null) requireLayer(index, input.parentId)
      const childIds = index.children.get(input.parentId) ?? []
      scope = new Set(input.recursive ? childIds.flatMap(id => [id, ...descendantIds(index, id)]) : childIds)
    }
    const matches = new Set(scene.layers.filter(layer => (!scope || scope.has(layer.id)) && matchesQuery(layer, search, { isAnimated: animated, hasEffects })).map(layer => layer.id))
    if (input.includeAncestors) for (const id of Array.from(matches)) for (const ancestor of index.ancestors.get(id)!) matches.add(ancestor)
    const offset = input.offset ?? 0, limit = input.limit ?? 5000
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 0 || limit > 5000) throw new Error('Invalid Explorer query offset/limit.')
    return scene.layers.filter(layer => matches.has(layer.id)).slice(offset, offset + limit).map(layer => makeNode(layer.id))
  }

  rename(id: string, name: string): void {
    if (typeof name !== 'string' || !name.trim() || name.length > 1024) throw new Error('Layer name must contain 1–1024 characters.')
    this.apply('Explorer rename', scene => { const index = hierarchy(scene); editable(index, id); const layer = requireLayer(index, id); return makeUpdateLayerCmd(id, { name: name.trim() }, layer).execute(scene) })
  }
  setFlags(ids: string | string[], patch: ExplorerFlags): void {
    const keys = Object.keys(patch)
    if (!keys.length || keys.some(key => !['hidden', 'locked', 'solo', 'pinned'].includes(key) || typeof patch[key as keyof ExplorerFlags] !== 'boolean')) throw new Error('Supply boolean hidden/locked/solo/pinned flags.')
    this.apply('Explorer layer flags', scene => {
      const index = hierarchy(scene), input = typeof ids === 'string' ? [ids] : ids
      if (!Array.isArray(input) || !input.length) throw new Error('Supply one or more layer ids.')
      for (const id of input) requireLayer(index, id)
      return makeBulkUpdateLayersCmd(Array.from(new Set(input)), { ...patch }, 'Explorer layer flags').execute(scene)
    })
  }

  reparent(ids: string | string[], parentId: string | null, options: { keepWorld?: boolean; timeMs?: number } = {}): string[] {
    let moved: string[] = []
    this.apply('Explorer reparent', scene => {
      const index = hierarchy(scene); moved = selectedRoots(scene, index, ids)
      if (parentId !== null) { const parent = requireLayer(index, parentId); if (parent.type !== 'group') throw new Error('A parent must be a group.'); editable(index, parentId) }
      moved = moved.filter(id => (requireLayer(index, id).parentId ?? null) !== parentId)
      const timeMs = options.timeMs ?? 0
      if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('Invalid reparent time.')
      const transforms = new Map<string, Transform>()
      for (const id of moved) {
        editable(index, id, true)
        if (parentId === id || (parentId && index.ancestors.get(parentId)!.includes(id))) throw new Error('Reparent would create a cycle.')
        if (options.keepWorld !== false) {
          const chain = [id, ...index.ancestors.get(id)!, ...(parentId ? [parentId, ...index.ancestors.get(parentId)!] : [])]
          assertStaticTransform(scene, Array.from(new Set(chain)))
          const world = resolveLayerWorldMatrix(requireLayer(index, id), scene, timeMs)
          const parentWorld = parentId ? resolveLayerWorldMatrix(requireLayer(index, parentId), scene, timeMs) : Matrix2D.identity()
          transforms.set(id, localTransform(parentWorld.invert().multiply(world), requireLayer(index, id).transform))
        }
      }
      let next = scene
      for (const id of moved) {
        const command = makeMoveLayerToCmdWithSnapshot(next, id, parentId ?? undefined, next.layers.length)
        next = command!.execute(next)
      }
      return { ...next, layers: next.layers.map(layer => transforms.has(layer.id) ? { ...layer, transform: transforms.get(layer.id)! } : layer) }
    })
    return moved
  }

  /** Index is the authored sibling/render order, independent of UI pinning/sorting. */
  reorder(id: string, siblingIndex: number): void {
    this.apply('Explorer reorder', scene => {
      const index = hierarchy(scene), layer = requireLayer(index, id); editable(index, id)
      const siblings = index.children.get(layer.parentId ?? null)!
      if (!Number.isInteger(siblingIndex) || siblingIndex < 0 || siblingIndex >= siblings.length) throw new Error('Sibling index is outside its valid bounds.')
      const rest = siblings.filter(sibling => sibling !== id)
      const targetId = rest[siblingIndex]
      const toIndex = targetId ? scene.layers.findIndex(layer => layer.id === targetId) : scene.layers.length
      return makeMoveLayerToCmdWithSnapshot(scene, id, layer.parentId, toIndex)!.execute(scene)
    })
  }
  moveBefore(id: string, referenceId: string): void { this.moveRelative(id, referenceId, false) }
  moveAfter(id: string, referenceId: string): void { this.moveRelative(id, referenceId, true) }
  private moveRelative(id: string, referenceId: string, after: boolean): void {
    const scene = this.ctx.host.getScene(), index = hierarchy(scene)
    const layer = requireLayer(index, id), reference = requireLayer(index, referenceId)
    if (id === referenceId) return
    if ((layer.parentId ?? null) !== (reference.parentId ?? null)) throw new Error('Move-before/after requires siblings; reparent explicitly first.')
    const rest = index.children.get(layer.parentId ?? null)!.filter(sibling => sibling !== id)
    this.reorder(id, rest.indexOf(referenceId) + (after ? 1 : 0))
  }

  group(ids: string[], options: { name?: string } = {}): string {
    const initial = this.ctx.host.getScene(), roots = selectedRoots(initial, hierarchy(initial), ids), command = makeGroupCmd(roots)
    if (options.name !== undefined && (typeof options.name !== 'string' || !options.name.trim() || options.name.length > 1024)) throw new Error('Invalid group name.')
    this.apply('Explorer group', scene => {
      const index = hierarchy(scene)
      for (const id of roots) editable(index, id, true)
      const parent = requireLayer(index, roots[0]).parentId
      if (roots.some(id => requireLayer(index, id).parentId !== parent)) throw new Error('Group requires sibling layers with a common parent.')
      if (scene.layers.some(layer => layer.id === command.groupId)) throw new Error('Group id already exists.')
      const next = command.execute(scene)
      return { ...next, layers: next.layers.map(layer => layer.id === command.groupId ? { ...layer,
        ...(options.name ? { name: options.name.trim() } : {}), transform: { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 } } : layer) }
    })
    return command.groupId
  }

  ungroup(id: string, options: { keepWorld?: boolean } = {}): string[] {
    let children: string[] = []
    this.apply('Explorer ungroup', scene => {
      const index = hierarchy(scene), group = requireLayer(index, id); editable(index, id, true)
      if (group.type !== 'group') throw new Error('Only a group can be ungrouped.')
      children = [...(index.children.get(id) ?? [])]
      const transforms = new Map<string, Transform>()
      if (options.keepWorld !== false) {
        if (group.masks?.length || group.effectsChain?.length || group.effects || group.motionBlur?.enabled || (group.blendMode && group.blendMode !== 'source-over')) throw new Error('Bake/remove group effects, masks and blending before ungrouping.')
        assertStaticTransform(scene, [id])
        if (scene.timelines.some(timeline => timeline.tracks.some(track => track.target.startsWith(`layers.${id}.`)))) throw new Error('Bake group animation before ungrouping.')
        const parent = group.parentId ? requireLayer(index, group.parentId) : undefined
        const parentWorld = parent ? resolveLayerWorldMatrix(parent, scene) : Matrix2D.identity()
        const inverse = parentWorld.invert()
        const groupLocal = inverse.multiply(resolveLayerWorldMatrix(group, scene))
        for (const childId of children) {
          if (!groupLocal.isIdentity()) assertStaticTransform(scene, [childId])
          const child = requireLayer(index, childId)
          if ((group.opacity ?? 1) !== 1 && scene.timelines.some(timeline => timeline.tracks.some(track => track.target === `layers.${childId}.opacity`))) throw new Error('Bake child opacity automation before removing a translucent group.')
          transforms.set(childId, groupLocal.isIdentity() ? { ...child.transform } : localTransform(inverse.multiply(resolveLayerWorldMatrix(child, scene)), child.transform))
        }
      }
      const native = makeUngroupCmd(scene, id)!
      const next = native.execute(scene)
      return { ...next, layers: next.layers.map(layer => transforms.has(layer.id) ? { ...layer, transform: transforms.get(layer.id)!, opacity: layer.opacity * group.opacity } : layer),
        timelines: next.timelines.map(timeline => ({ ...timeline, layerIds: timeline.layerIds?.filter(layerId => layerId !== id) })) }
    })
    return children
  }
}
