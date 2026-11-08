import {OutlineFontService} from './OutlineFontService'
import {editorResourceBudget} from '../../resources/budget'
import {editorMediaPreparation} from '../../resources/jobs'

/** Composition root only; fonts and IO remain cold until conversion demand. */
export const editorOutlineFonts=new OutlineFontService({budget:editorResourceBudget,executor:editorMediaPreparation})
export {OutlineFontService}
export type {OutlineFontOptions} from './OutlineFontService'
