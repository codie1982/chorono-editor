/** Public source-editing contract for viewport and other trajectory adapters.
 * Model/sampling exports remain in index.ts to avoid depending on commands. */
export { setTrajectoryPoint, moveTrajectoryNodes } from './positionCommands'
export { deleteTrajectoryNodes, retimeTrajectoryNodes, duplicateTrajectoryNodes } from './selectionCommands'
export { drawTrajectory, type DrawTrajectoryOptions } from './drawCommand'
export type { TrajectoryNodeRef, TrajectoryCommandScope, TrajectoryEditResult } from './commandTypes'
export { TRAJECTORY_EDIT_LIMITS } from './editHelpers'
export { createTrajectoryKeyIdAllocator, type TrajectoryKeyIdAllocator, type TrajectoryKeyIdAddress } from './keyIds'
