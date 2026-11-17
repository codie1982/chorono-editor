/** Serializable single-frame Chorono Render options. These values describe a
 * renderer request, not the editor's realtime Three viewport. The renderer CLI
 * is the authority for final pixels and rejects unavailable hardware/codecs. */
export interface ModelRenderSettings {
  device: 'cpu' | 'gpu'
  shader: 'pbr' | 'toon'
  antiAliasing: 'standard' | 'high'
  width: number
  height: number
  format: 'png' | 'jpeg' | 'webp'
  samples: number
  threads: number
  pbrProfile: 'balanced' | 'legacy'
  pbrExposure: number
  pbrAmbient: number
  pbrDirectional: number
  pbrEnvironment: number
  toonProfile: 'ramp' | 'material' | 'legacy'
}

/** Detached defaults match the renderer's GPU PBR balanced profile. The frame
 * size is explicit and independent of the 2D canvas dimensions. */
export const defaultModelRenderSettings = (): ModelRenderSettings => ({
  device: 'gpu', shader: 'pbr', antiAliasing: 'standard', width: 1080, height: 1080,
  format: 'png', samples: 32, threads: 0, pbrProfile: 'balanced',
  pbrExposure: -.35, pbrAmbient: .5, pbrDirectional: .9, pbrEnvironment: .3,
  toonProfile: 'ramp',
})

/** Validate the exact CLI-exposed subset before persistence and again at the
 * server boundary. Unknown keys are rejected so a scene cannot add CLI flags. */
export function assertModelRenderSettings(value: ModelRenderSettings): void {
  const exact = ['device', 'shader', 'antiAliasing', 'width', 'height', 'format', 'samples', 'threads',
    'pbrProfile', 'pbrExposure', 'pbrAmbient', 'pbrDirectional', 'pbrEnvironment', 'toonProfile']
  const keys = value && typeof value === 'object' ? Object.keys(value) : []
  const integer = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi
  const number = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
  if (!value || keys.length !== exact.length || keys.some(key => !exact.includes(key))
    || !['cpu', 'gpu'].includes(value.device) || !['pbr', 'toon'].includes(value.shader)
    || !['standard', 'high'].includes(value.antiAliasing) || !['png', 'jpeg', 'webp'].includes(value.format)
    || !integer(value.width, 32, 2048) || !integer(value.height, 32, 2048)
    || !integer(value.samples, 1, 256) || !integer(value.threads, 0, 256)
    || !['balanced', 'legacy'].includes(value.pbrProfile)
    || !number(value.pbrExposure, -6, 6)
    || ![value.pbrAmbient, value.pbrDirectional, value.pbrEnvironment].every(n => number(n, 0, 4))
    || !['ramp', 'material', 'legacy'].includes(value.toonProfile)) throw new Error('Invalid 3D render settings.')
}

/** Fixed-option CLI argument mapping. Inapplicable settings are omitted rather
 * than sent to a device/shader combination that rejects them. Paths are supplied
 * separately by the trusted server; no user string becomes a command flag. */
export function modelRenderCliArgs(value: ModelRenderSettings): string[] {
  assertModelRenderSettings(value)
  const args = ['--device', value.device, '--shader', value.shader, '--size', `${value.width}x${value.height}`,
    '--format', value.format, '--anti-aliasing', value.antiAliasing, '--accept-warnings']
  if (value.device === 'cpu') args.push('--samples', String(value.samples), '--threads', String(value.threads))
  else if (value.shader === 'pbr') args.push('--pbr-profile', value.pbrProfile,
    '--pbr-exposure', String(value.pbrExposure), '--pbr-ambient', String(value.pbrAmbient),
    '--pbr-directional', String(value.pbrDirectional), '--pbr-environment', String(value.pbrEnvironment))
  else args.push('--toon-profile', value.toonProfile)
  return args
}
