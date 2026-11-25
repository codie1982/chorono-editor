import { describe, expect, it } from 'vitest'
import { assertModelRenderSettings, defaultModelRenderSettings, modelRenderCliArgs } from './modelRenderSettings'
import { emptyScene } from '../../defaults'
import { newModelLayer, validateModel } from '../source/modelDefaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import '../../registry/bootstrap'

describe('Chorono Render settings contract', () => {
  it('maps only the CLI options used by the selected device and shader', () => {
    const base = defaultModelRenderSettings()
    const gpu = modelRenderCliArgs(base).join(' ')
    expect(gpu).toContain('--device gpu --shader pbr')
    expect(gpu).toContain('--pbr-exposure -0.35')
    expect(gpu).not.toContain('--samples')
    expect(gpu).not.toContain('--toon-profile')
    const toon = modelRenderCliArgs({ ...base, shader: 'toon', toonProfile: 'material' }).join(' ')
    expect(toon).toContain('--toon-profile material')
    expect(toon).not.toContain('--pbr-')
    const cpu = modelRenderCliArgs({ ...base, device: 'cpu', shader: 'toon', samples: 48 }).join(' ')
    expect(cpu).toContain('--samples 48 --threads 0')
    expect(cpu).not.toContain('--toon-profile')
  })
  it('rejects unknown or out-of-range renderer source before CLI launch', () => {
    const base = defaultModelRenderSettings()
    expect(() => assertModelRenderSettings(base)).not.toThrow()
    expect(() => assertModelRenderSettings({ ...base, width: 4096 })).toThrow(/render settings/)
    expect(() => assertModelRenderSettings({ ...base, pbrExposure: Number.NaN })).toThrow(/render settings/)
    expect(() => assertModelRenderSettings({ ...base, extra: '--output /tmp' } as typeof base)).toThrow(/render settings/)
  })
  it('keeps the optional preset through portable scene save/open', () => {
    const scene = emptyScene(), layer = newModelLayer('model', 'asset')
    layer.model3d!.render = { ...defaultModelRenderSettings(), device: 'cpu', shader: 'toon', samples: 48 }
    scene.layers.push(layer)
    validateModel(layer.model3d!)
    const reopened = parseSceneJson(JSON.stringify(scene), true)
    expect(reopened.layers[0].model3d?.render).toEqual(layer.model3d!.render)
  })
})
