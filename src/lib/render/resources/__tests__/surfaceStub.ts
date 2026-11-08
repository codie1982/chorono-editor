/** Pixel-free canvas double preserving native reset/save semantics for ownership tests. */
export function surfaceStub(width: number, height: number, draw = () => {}): HTMLCanvasElement {
  let currentWidth = width
  const defaults = { globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none', fillStyle: '' }
  const states: typeof defaults[] = []
  const context = { ...defaults, canvas: undefined as unknown as HTMLCanvasElement,
    drawImage: draw, fillRect: draw, translate() {},
    save() { states.push({ globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,filter:this.filter,fillStyle:this.fillStyle }) },
    restore() { Object.assign(this,states.pop()) },
    createRadialGradient: () => ({ addColorStop() {} }) }
  const canvas = { get width() { return currentWidth },
    set width(value: number) { currentWidth=value;states.length=0;Object.assign(context,defaults) },
    height, getContext: () => context } as unknown as HTMLCanvasElement
  context.canvas = canvas
  return canvas
}
