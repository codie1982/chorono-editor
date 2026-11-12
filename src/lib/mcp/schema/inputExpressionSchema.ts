/** Data-only constant recipe envelope. Loading validates this metadata without
 * executing formulas. The owning command saves an ordinary typed source value;
 * a recipe never replaces that value with executable text or a runtime handle. */
export function inputExpressionSchema() {
  return {type:'object', required:['version','fields'], properties:{
    version:{type:'integer',enum:[1],description:'Constant authoring recipe version; currently 1.'},
    fields:{type:'object',maxProperties:128,description:'Layer-local supported fields. Preserve unrelated recipes and source values; this map is not a live driver.',additionalProperties:{
      type:'object',required:['formula','value'],properties:{
        formula:{type:'string',maxLength:4096,description:'Bounded whitelist formula evaluated only by an explicit authoring operation.'},
        resultType:{type:'string',enum:['number','boolean','string','color','vec2'],description:'Exact result family. Omitted means number for old v1 projects.'},
        value:{description:'Last applied typed result. The normal source field remains authoritative.',oneOf:[
          {type:'number'},{type:'boolean'},{type:'string',maxLength:4096},
          {type:'object',required:['x','y'],properties:{x:{type:'number'},y:{type:'number'}},additionalProperties:false},
          {type:'object',required:['r','g','b','a'],properties:Object.fromEntries(['r','g','b','a'].map(key=>[key,{type:'number',minimum:0,maximum:255}])),additionalProperties:false},
        ]},
      },additionalProperties:false,
    }},
  },description:'Saved constant recipes v1. No time context, AST, per-frame evaluation or automatic reapplication after human changes.'}
}
