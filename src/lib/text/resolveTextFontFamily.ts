import type {Asset} from '../types'

/** Text measurement port. Explicit source scope prevents a mutable global
 * "current document" from leaking into concurrent renders. Providers perform
 * readonly lookups only; native registration/admission belongs to asset owners. */
export type TextFontFamilyResolver=(css:string,assets:readonly Asset[])=>string
let resolver:TextFontFamilyResolver=css=>css

/** Composition installs its platform resolver once. No font/scene is owned. */
export function configureTextFontFamilyResolver(provider:TextFontFamilyResolver):void {resolver=provider}
/** Resolve a ready imported family for synchronous metrics. Omitted scope keeps
 * standalone/SSR callers' legacy CSS behavior and never starts a load. */
export function resolveTextFontFamily(css:string,assets?:readonly Asset[]):string {return assets?.length?resolver(css,assets):css}
