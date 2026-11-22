import Ajv from 'ajv'
import { splineOperationSchema } from './schema'

const validate = new Ajv({ strict: false, allErrors: false }).compile(splineOperationSchema())

/** Validate the shared source-edit representation before allocating geometry.
 * Console, QuickJS and MCP use the same strict fields, count/amount limits and
 * paint units. The compiled validator is synchronous, owns no source data, and
 * neither coerces nor removes unknown properties. Invalid requests throw before
 * a command, worker or generated geometry can be retained. */
export function assertSplineOperation(value: unknown): void {
  if (!validate(value)) throw new Error(`Invalid spline operation: ${validate.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
}
