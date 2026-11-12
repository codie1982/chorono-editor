/** Compatibility export. The registry now owns the shared property path index;
 * renderer and expression validation borrow one implementation/contract. */
export { PropertySchemaIndex as RenderSchemaResolver } from '../registry/PropertySchemaIndex'
