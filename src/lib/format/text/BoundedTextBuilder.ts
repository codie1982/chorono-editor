/** Bounded ordered string assembly without nested group-wide concatenation.
 * Caller owns/admits fragment construction and final joined string. append
 * rejects before retaining an over-limit fragment; finish rejects no partial
 * output and does not mutate order. UTF-16 units, not bytes or physical RAM.
 * Instances own mutable fragment arrays; clear drops references, not caller
 * strings. No cache, IO, timers, DOM or platform allocation policy here. */
export class BoundedTextBuilder{
  private readonly parts:string[]=[]
  private chars=0
  constructor(private readonly maxChars:number,private readonly maxParts=200000){
    if(!Number.isSafeInteger(maxChars)||maxChars<1||!Number.isSafeInteger(maxParts)||maxParts<1)throw new RangeError('Invalid text assembly limits.')
  }
  /** Borrow/retain a fragment after checking total characters and part metadata. */
  append(text:string):void{
    if(this.chars+text.length>this.maxChars||this.parts.length>=this.maxParts)throw new RangeError('Text assembly limit exceeded.')
    this.parts.push(text);this.chars+=text.length
  }
  /** Exact assembled UTF-16 size; inspection does not retain/copy parts. */
  get length():number{return this.chars}
  /** Join once in insertion order. Caller must admit source + final overlap. */
  finish():string{return this.parts.join('')}
  /** Drop this builder's references; existing returned strings stay caller-owned. */
  clear():void{this.parts.length=0;this.chars=0}
}
