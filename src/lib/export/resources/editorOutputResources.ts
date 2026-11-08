import {editorResourceBudget} from '../../resources/budget'
import {OutputResources} from './OutputResources'

/** Realm composition root. Construction allocates no native output/timers.
 * Output work has its own bounded outer queue; media preparation may be awaited
 * inside it, but media work must never wait on this output queue in reverse. */
export const editorOutputResources=new OutputResources({budget:editorResourceBudget})
