/** A stale server CAS version is terminal for the request, not a network retry.
 * Shared by orchestration and HTTP adapter without importing platform output
 * composition into the coordinator. */
export class SceneSaveConflictError extends Error{
  constructor(){super('Scene changed on server. Please refresh to sync.');this.name='SceneSaveConflictError'}
}
