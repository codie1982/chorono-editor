import { describe, expect, it, vi } from 'vitest'
import { ADD_LAYER_GROUPS } from '@/lib/icons/iconMap'
import { buildAddLayerMenu } from './buildAddLayerMenu'
import { activateAddLayerItem } from './activateAddLayerItem'
import { openDocumentFilePicker } from '@/components/import/DocumentFilePicker'
import { buildCanvasMenu } from '@/components/canvas/buildCanvasMenu'
import { newRectLayer } from '@/lib/defaults'
vi.mock('@/components/import/DocumentFilePicker', () => ({ openDocumentFilePicker: vi.fn() }))

describe('one Add definition and activation policy across menus', () => {
  it('offers grouping only for multiple selection and ungrouping for a group target', () => {
    const layer = newRectLayer(), handlers = { group: vi.fn(), ungroup: vi.fn() }
    const labels = (multiCount: number, canUngroup: boolean) => buildCanvasMenu({ layer, handlers, multiCount, canUngroup, canPaste: false })
      .filter(item => item.kind === 'action').map(item => item.label)
    expect(labels(1, false)).not.toContain('Group')
    expect(labels(2, false)).toContain('Group')
    expect(labels(1, true)).toContain('Ungroup')
  })
  it('matches every available palette category, including empty 3D scene/import, without activating during build', () => {
    const activate = vi.fn(), [menu] = buildAddLayerMenu(activate)
    expect(menu.kind).toBe('submenu')
    if (menu.kind !== 'submenu') throw new Error('Missing Add')
    expect(menu.items.map(item => item.kind === 'submenu' && [item.label, item.items.map(child => child.kind === 'action' && child.label)]))
      .toEqual(ADD_LAYER_GROUPS.filter(group => group.items.some(item => item.available)).map(group => [group.title, group.items.filter(item => item.available).map(item => item.label)]))
    expect(activate).not.toHaveBeenCalled()
    const group = menu.items.find(item => item.kind === 'submenu' && item.label === '3D Objects')!
    if (group.kind !== 'submenu') throw new Error('Missing 3D group')
    const empty = group.items.find(item => item.kind === 'action' && item.label === 'Empty 3D Scene')!
    if (empty.kind === 'action') empty.onSelect()
    expect(activate).toHaveBeenCalledExactlyOnceWith('empty3dScene')
    expect(buildAddLayerMenu()).toEqual([])
  })
  it('retains persistent creation and routes all media through the guarded picker, never a placeholder layer', () => {
    const native = vi.fn().mockReturnValue(true), image = vi.fn(), video = vi.fn(), audio = vi.fn(), svg = vi.fn(), model = vi.fn()
    const signal = new AbortController().signal
    const handlers = { onAdd: native, getDocumentSignal: () => signal, onAddImage: image, onAddVideo: video, onAddAudio: audio, onImportSvg: svg, onImportModel: model }
    expect(activateAddLayerItem('rect', handlers)).toBe(true)
    expect(native).toHaveBeenCalledExactlyOnceWith('rect')
    for (const [kind, callback, accept] of [['image', image, 'image/*'], ['video', video, 'video/*'], ['audio', audio, 'audio/*'], ['svgImport', svg, '.svg,image/svg+xml'], ['model3d', model, '.glb,.gltf,model/gltf-binary,model/gltf+json']] as const) {
      expect(activateAddLayerItem(kind, handlers)).toBe(false)
      const request = vi.mocked(openDocumentFilePicker).mock.calls.at(-1)![0]
      expect(request.accept).toBe(accept); expect(request.getDocumentSignal?.()).toBe(signal)
      const file = new File(['source'], 'source')
      request.onFiles([file]); expect(callback).toHaveBeenCalledWith(file)
    }
    expect(native).toHaveBeenCalledTimes(1)
  })
  it('adds creation at the end of object context menus and exposes single-object Fit Parent', () => {
    const add = vi.fn(), fit = vi.fn(), items = buildCanvasMenu({ layer: newRectLayer(), multiCount: 1, canPaste: false, canUngroup: false, handlers: { addLayer: add, fitParent: fit, alignLeft: vi.fn() } })
    expect(items.at(-1)).toMatchObject({ kind: 'submenu', label: 'Add' })
    const align = items.find(item => item.kind === 'submenu' && item.label === 'Align')!
    expect(align).toMatchObject({ disabled: false })
    if (align.kind !== 'submenu') throw new Error('Missing Align')
    expect(align.items.find(item => item.kind === 'action' && item.label === 'Align Left')).toMatchObject({ disabled: true })
    const action = align.items.find(item => item.kind === 'action' && item.label === 'Fit Parent')!
    expect(action).toMatchObject({ disabled: false }); if (action.kind === 'action') action.onSelect()
    expect(fit).toHaveBeenCalledOnce()
  })
})
