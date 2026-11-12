import type { FontWeight, FontStyle } from '../types/text'
/** Font suggestions, not installed-font guarantees. Unlisted imported/custom
 * family names remain valid; native rendering/font preparation owns fallback. */
export const FONT_FAMILIES: readonly string[] = ['sans-serif','serif','monospace','Arial','Helvetica','Georgia','Times New Roman','Courier New','Verdana','Trebuchet MS','Impact']
/** One complete source enum for literal selects and strict formula validation. */
export const FONT_WEIGHTS: [FontWeight,string][] = [['100','100 · Thin'],['200','200 · Extra Light'],['300','300 · Light'],['normal','Regular'],['400','400'],['500','500 · Medium'],['600','600 · Semibold'],['bold','Bold'],['700','700'],['800','800 · Extra'],['900','900 · Black']]
export const FONT_STYLES: {value:FontStyle;label:string}[] = [{value:'normal',label:'Normal'},{value:'italic',label:'Italic'}]
