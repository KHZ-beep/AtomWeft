// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
export const clone=v=>structuredClone(v);
export function recount(model){
  for(const e of Object.values(model.elements))e.count=0;
  for(const a of model.atoms)model.elements[a.element].count++;
  return model;
}
export function removeAtoms(model,indices){
  const removed=new Set(indices),map=new Map();
  model.atoms=model.atoms.filter((a,i)=>{if(removed.has(i))return false;map.set(i,map.size);return true;});
  model.bonds=model.bonds.filter(b=>map.has(b.a)&&map.has(b.b)).map(b=>({...b,a:map.get(b.a),b:map.get(b.b)}));
  if(model.coordination)model.coordination.shells=model.coordination.shells.filter(s=>map.has(s.center)).map(s=>({...s,center:map.get(s.center),vertices:s.vertices.filter(v=>v.atom===null||map.has(v.atom)).map(v=>({...v,atom:v.atom===null?null:map.get(v.atom)}))}));
  recount(model);
}
export function moveAtoms(model,indices,delta){
  if(!delta.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5))throw Error('移动距离无效。');
  for(const i of indices)model.atoms[i].xyz=model.atoms[i].xyz.map((v,k)=>v+delta[k]);
}
export function addAtom(model,element,xyz,catalog){
  if(model.atoms.length>=4000)throw Error('最多支持 4000 个原子。');
  if(!Object.hasOwn(catalog,element)||xyz.length!==3||!xyz.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5))throw Error('元素或坐标无效。');
  model.elements[element]??={...catalog[element],count:0};
  model.atoms.push({element,xyz:[...xyz],label:element+(model.atoms.length+1),occupancy:1});
  recount(model);return model.atoms.length-1;
}
export function setBond(model,indices,order){
  if(indices.length!==2)throw Error('请选择两个原子。');
  const [a,b]=indices;
  model.bonds=model.bonds.filter(v=>!((v.a===a&&v.b===b)||(v.a===b&&v.b===a)));
  if(order)model.bonds.push({a,b,order,inferred:false});
}
export class History {
  constructor(limit=30){this.limit=limit;this.clear();}
  clear(){this.undoStack=[];this.redoStack=[];}
  push(value){this.undoStack.push(clone(value));if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];}
  undo(current){if(!this.undoStack.length)return null;this.redoStack.push(clone(current));return this.undoStack.pop();}
  redo(current){if(!this.redoStack.length)return null;this.undoStack.push(clone(current));return this.redoStack.pop();}
}
const finite=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
export function validateStyle(s){
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('显示设置无效。');
  for(const [key,choices] of Object.entries({style:['line','ball','space'],radius:['equal','covalent','vdw'],atomDimension:['2d','2.5d','3d'],bondAppearance:['original','outline','black']}))
    if(s[key]!==undefined&&!choices.includes(s[key]))throw Error('显示设置无效：'+key);
  if(s.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(s.color))throw Error('颜色无效。');
  for(const [k,lo,hi] of [['atomScale',.3,2],['bondWidth',.5,10],['scale',.2,3]])if(s[k]!==undefined&&!finite(s[k],lo,hi))throw Error('比例无效。');
  for(const k of ['labels','hidden'])if(s[k]!==undefined&&typeof s[k]!=='boolean')throw Error('显示开关无效。');
  return Object.fromEntries(Object.entries(s).filter(([k])=>['style','radius','atomDimension','bondAppearance','color','atomScale','bondWidth','scale','labels','hidden'].includes(k)));
}
export function validateModel(input,catalog){
  if(!input||!Array.isArray(input.atoms)||input.atoms.length>4000||!Array.isArray(input.bonds)||input.bonds.length>16000)throw Error('项目结构大小无效。');
  const model={name:String(input.name||'Structure').slice(0,180),atoms:[],bonds:[],elements:{},warnings:[],cell:null};
  if(Array.isArray(input.warnings))model.warnings=input.warnings.filter(v=>typeof v==='string').slice(0,100).map(v=>v.slice(0,1000));
  for(const a of input.atoms){
    if(!Object.hasOwn(catalog,a.element)||!Array.isArray(a.xyz)||a.xyz.length!==3||!a.xyz.every(v=>finite(v,-1e5,1e5)))throw Error('项目原子坐标或元素无效。');
    model.atoms.push({element:a.element,xyz:[...a.xyz],label:String(a.label||a.element).slice(0,100),occupancy:finite(a.occupancy,0,1)?a.occupancy:1,part:String(a.part||'').slice(0,60),appearance:validateStyle(a.appearance||{})});
    model.elements[a.element]={...catalog[a.element],count:0};
  }
  const seen=new Set();
  for(const b of input.bonds){
    if(![b.a,b.b].every(i=>Number.isInteger(i)&&i>=0&&i<model.atoms.length)||b.a===b.b||![1,1.5,2,3].includes(b.order))throw Error('项目连接无效。');
    const key=[b.a,b.b].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);
    model.bonds.push({a:b.a,b:b.b,order:b.order,inferred:!!b.inferred,...(b.source==='cif-bonds'?{source:b.source}:{})});
  }
  if(input.cell){
    const corners=input.cell.corners;
    if(!Array.isArray(corners)||corners.length!==8||!corners.every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>finite(v,-1e5,1e5))))throw Error('晶胞坐标无效。');
    model.cell={corners:clone(corners)};
    if(Array.isArray(input.cell.parameters)&&input.cell.parameters.length===6&&input.cell.parameters.every(v=>finite(v,0,1e5)))model.cell.parameters=[...input.cell.parameters];
    if(Array.isArray(input.cell.repeats)&&input.cell.repeats.length===3&&input.cell.repeats.every(v=>Number.isInteger(v)&&v>=1&&v<=4))model.cell.repeats=[...input.cell.repeats];
    if(typeof input.cell.spacegroup==='string')model.cell.spacegroup=input.cell.spacegroup.slice(0,100);
  }
  if(input.coordination){
    const shells=input.coordination.shells;
    const point=p=>Array.isArray(p)&&p.length===3&&p.every(v=>finite(v,-1e5,1e5));
    const index=i=>Number.isInteger(i)&&i>=0&&i<model.atoms.length;
    if(!Array.isArray(shells)||shells.length>200)throw Error('配位中心数据无效。');
    model.coordination={shells:shells.map(s=>{
      if(!index(s.center)||!point(s.origin)||!Array.isArray(s.vertices)||s.vertices.length>24||!['cif-bonds','periodic-distance'].includes(s.source))throw Error('配位壳层无效。');
      return {center:s.center,origin:clone(s.origin),source:s.source,vertices:s.vertices.map(v=>{
        if(!(v.atom===null||index(v.atom))||!point(v.xyz)||!point(v.offset)||!Object.hasOwn(catalog,v.element))throw Error('配位顶点无效。');
        return {atom:v.atom,xyz:clone(v.xyz),offset:clone(v.offset),element:v.element,label:String(v.label||'').slice(0,100)};
      })};
    })};
    if(Number.isInteger(input.coordination.explicitRows)&&input.coordination.explicitRows>=0)model.coordination.explicitRows=input.coordination.explicitRows;
    if(typeof input.coordination.method==='string')model.coordination.method=input.coordination.method.slice(0,100);
  }
  return recount(model);
}
