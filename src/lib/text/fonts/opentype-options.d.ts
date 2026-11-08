import 'opentype.js'

/** Installed opentype.js 2.0 parseBuffer(buffer, opt) supports lowMemory, while
 * @types/opentype.js exposes only its older one-argument declaration. Add the
 * actual narrow runtime capability; no cast to an unrestricted parser contract.
 * See node_modules/opentype.js/dist/opentype.mjs parseBuffer/glyf/hmtx loaders. */
declare module 'opentype.js' {
  function parse(buffer:ArrayBuffer,options:{lowMemory:boolean}):Font
}
