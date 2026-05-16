// Geometry barrel — public API surface
export { Matrix2D } from './Matrix2D'
export { Bounds } from './Bounds'
export type {
  LocalPoint, WorldPoint, ScreenPoint, CanvasPoint, Vec2,
} from './CoordinateSystem'
export { local, world, screen, canvas, vec2, distance, lerp } from './CoordinateSystem'
export type {
  PathDefinition, NormalizedPathCommand,
  MoveToCommand, LineToCommand, CubicToCommand, QuadToCommand, ClosePathCommand,
} from './PathCommand'
export { M, L, C, Q, Z, buildPathOnCanvas, pathToSvgString } from './PathCommand'
export { ShapeToPathConverter } from './ShapeToPathConverter'
export type { Size } from './ShapeToPathConverter'
