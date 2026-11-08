import {cancelledJobError} from '../../resources/jobs'
import type {FontDecoder} from './types'
import {FontRegistrationUnavailable} from './FontRegistrationUnavailable'

/** FontFace.load is not natively abortable. Abort prevents publication but
 * ready remains pending until the browser settles, retaining queue/reservation
 * and source ownership. A private alias prevents cross-document family clashes.
 * No face is registered under the authored name; callers resolve scoped aliases. */
export const browserFontDecoder:FontDecoder=(input,signal)=>{
  if(typeof FontFace==='undefined'||typeof document==='undefined')throw new FontRegistrationUnavailable('Native font loading is unavailable.')
  let face:FontFace|null
  try {face=new FontFace(input.alias,input.data??`url(${JSON.stringify(input.url)})`)}
  catch(error){if(error instanceof Error&&error.name==='SyntaxError')throw new FontRegistrationUnavailable(error.message);throw error}
  const ready=face.load().then(loaded=>{
    if(signal.aborted)throw cancelledJobError()
    document.fonts.add(loaded)
  },error=>{
    if(signal.aborted)throw cancelledJobError()
    if(error instanceof Error&&['SyntaxError','NetworkError'].includes(error.name))throw new FontRegistrationUnavailable(error.message)
    throw error
  })
  return {alias:input.alias,ready,dispose(){if(face){document.fonts.delete(face);face=null}}}
}
