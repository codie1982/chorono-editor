import type {HTMLExportOptions} from '../html/htmlExport'
import type {SVGExportOptions} from '../vector/SVGExporter'
import type {RuntimeExportOptions} from '../runtimeExport'
import type { HistoryState } from '../../editor/history'

/** Existing serialization workflows retain their distinct schemas; canonical
 * export schema/parity is a later phase. Source-only editor-json/html retain their former source-URL policy. An
 * editor-json session option explicitly prepares a portable history envelope. */
export type SceneTextKind='editor-json'|'runtime-json'|'legacy-runtime-json'|'html'|'svg'
export interface SceneTextOptions{html?:HTMLExportOptions;svg?:SVGExportOptions;runtime?:RuntimeExportOptions;session?:{sessionId:string;history:HistoryState}}
export interface TextOutputResult{
  readonly text:string
  readonly filename:string
  readonly mimeType:string
  readonly byteLength:number
  readonly lines:number
  readonly warnings:readonly string[]
}
export interface TextDownloadResult{readonly blob:Blob;readonly filename:string;readonly warnings:readonly string[]}
