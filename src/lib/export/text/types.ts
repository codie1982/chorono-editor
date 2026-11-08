import type {HTMLExportOptions} from '../html/htmlExport'
import type {SVGExportOptions} from '../vector/SVGExporter'
import type {RuntimeExportOptions} from '../runtimeExport'

/** Existing serialization workflows retain their distinct schemas; canonical
 * export schema/parity is a later phase. No portable embedding is implied by
 * editor-json/html: their former source-URL policy is preserved. */
export type SceneTextKind='editor-json'|'runtime-json'|'legacy-runtime-json'|'html'|'svg'
export interface SceneTextOptions{html?:HTMLExportOptions;svg?:SVGExportOptions;runtime?:RuntimeExportOptions}
export interface TextOutputResult{
  readonly text:string
  readonly filename:string
  readonly mimeType:string
  readonly byteLength:number
  readonly lines:number
  readonly warnings:readonly string[]
}
export interface TextDownloadResult{readonly blob:Blob;readonly filename:string;readonly warnings:readonly string[]}
