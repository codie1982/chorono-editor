// Lightweight unique-id generator for spline elements (no crypto dependency).
let _counter = 0

export function uid(prefix: string): string {
  return `${prefix}_${++_counter}_${Math.random().toString(36).slice(2, 6)}`
}
