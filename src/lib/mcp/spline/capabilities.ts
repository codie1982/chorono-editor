/** Discoverable versioned workflow; script operation entry is synchronous and
 * panel/cursor controls intentionally remain UI-only. */
export const SPLINE_EDITING_CAPABILITIES = Object.freeze({ version: 1,
  prepareTool: 'prepare_spline_edit', applyTool: 'apply_spline_edit', discardTool: 'discard_spline_edit',
  nativeOperations: ['topology', 'append', 'draw', 'transform', 'movePoint', 'pointType', 'edgeType', 'paint', 'attach', 'detach', 'offset', 'chamfer', 'fillet', 'boolean'],
  scriptEntry: 'layer.spline.edit(operation)', scriptSynchronous: true, nativeSolversOnly: ['offset', 'chamfer', 'fillet', 'boolean'],
  selection: 'Explicit Point/Edge/Object IDs; panel selection is not changed.',
  drawing: 'Local new points plus explicit existing endpoint IDs; no mouse/snap-preference writes.',
  plans: { ttlMs: 300000, maxCount: 50, estimatedBudgetBytes: 64 * 1024 ** 2 },
  source: 'Fresh get_scene before prepare; Apply uses the NEW plan-bound revision/readToken. Manual edits make plans stale.',
})
