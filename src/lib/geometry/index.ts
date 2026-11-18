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
export {
  StructuredGridMesh2DGenerator,
  SplineBoundaryMesh2DGenerator,
  ShapeBoundaryMesh2DGenerator,
  SplineBoundaryRingBuilder,
  Mesh2DTopologyHasher,
  Mesh2DAdjacencyBuilder,
  Mesh2DTopologyValidator,
  computeMesh2DLocalBounds,
  containsMesh2DPoint,
} from './mesh2d'
export type {
  StructuredGridMesh2DOptions,
  SplineBoundaryMesh2DOptions,
  Mesh2DShapeKind,
  ShapeBoundaryInput,
  SplineBoundaryPoint,
  SplineBoundaryRing,
  Mesh2DAdjacency,
  Mesh2DEdgeAdjacency,
  Mesh2DValidationDiagnostic,
  Mesh2DValidationResult,
  Mesh2DValidationSeverity,
} from './mesh2d'
