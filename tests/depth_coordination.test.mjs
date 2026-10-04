// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {depthProfile,faceDepthGradient} from '../web/depth.js';
import {defaults,buildScene,rotate,tint} from '../web/scene.js';
import {coordination} from '../web/polyhedra.js';
import {validateModel,removeAtoms} from '../web/editing.js';
const model=JSON.parse(readFileSync(new URL('../build/cif-coordination-model.json',import.meta.url),'utf8'));
test('focus is clear; opacity and blur increase on both sides and follow focus',()=>{
 const s={...defaults(),blur:6,depthOpacity:.8,focusWidth:0};
 const m={atoms:[-2,-1,0,1,2].map(z=>({element:'O',xyz:[0,0,z]})),bonds:[],elements:model.elements};
 let scene=buildScene(m,s),balls=scene.items.filter(x=>x.kind==='circle').sort((a,b)=>a.atom-b.atom);
 assert.equal(balls[2].opacity,1);assert.ok(!balls[2].softEdge);
 assert.ok(balls[0].opacity<balls[1].opacity&&balls[1].opacity<balls[2].opacity);
 assert.ok(balls[4].softEdge>balls[3].softEdge&&balls[3].softEdge>0);
 s.focus=(1-scene.camera.depthMin)/(scene.camera.depthMax-scene.camera.depthMin)*2-1;
 balls=buildScene(m,s).items.filter(x=>x.kind==='circle').sort((a,b)=>a.atom-b.atom);
 assert.equal(balls[3].opacity,1);assert.ok(balls[2].opacity<1);
 const before=balls.map(x=>x.opacity);m.atoms.forEach((a,i)=>a.xyz[0]=i*1000);
 assert.deepEqual(buildScene(m,s).items.filter(x=>x.kind==='circle').sort((a,b)=>a.atom-b.atom).map(x=>x.opacity),before);
 assert.equal(depthProfile(-2,2,{focus:0,focusWidth:0}).amount(0),0);
});
test('tilted surfaces retain one editable face with continuous focal alpha',()=>{
 const polygon={kind:'polygon',name:'face',points:[[0,0],[100,0],[0,100]],depthVertices:[-2,2,0],color:'#7799AA'};
 const gradient=faceDepthGradient(polygon,depthProfile(-2,2,{focus:0,focusWidth:0}),{depthOpacity:.8},tint);
 assert.equal(gradient.stops.length,8);assert.ok(new Set(gradient.stops.map(x=>x.opacity)).size>2);
 assert.ok(gradient.stops.some(x=>x.opacity===1));
});
test('depth effects never subdivide bonds into extra shapes',()=>{
 const m={atoms:[{element:'O',xyz:[-2,0,-2]},{element:'Fe',xyz:[2,0,2]}],bonds:[{a:0,b:1,order:1}],elements:model.elements};
 for(const bondAppearance of ['original','outline','black']){
   const state={...defaults(),bondAppearance};
   const base=buildScene(m,state).items.filter(x=>x.name.startsWith('Bond'));
   const result=buildScene(m,{...state,depthOpacity:.8,depthFade:.2,blur:2}).items.filter(x=>x.name.startsWith('Bond'));
   assert.equal(result.length,base.length);assert.ok(result.every(x=>!x.name.includes(' depth ')));
   assert.ok(result.some(x=>x.gradient&&new Set(x.gradient.stops.map(s=>s.opacity)).size>1));
   const blurOnly=buildScene(m,{...state,blur:2}).items.filter(x=>x.name.startsWith('Bond'));
   assert.equal(blurOnly.length,base.length);assert.deepEqual(blurOnly.map(x=>x.kind),base.map(x=>x.kind));
 }
});
test('CIF automatic shell uses six explicit periodic ligands and survives project edits',()=>{
 const m=structuredClone(model),shell=coordination(m,{scope:'auto'}).shells[0];
 assert.equal(shell.vertices.length,6);assert.equal(shell.faces.length,8);assert.equal(shell.source,'cif-bonds');
 assert.ok(shell.vertices.some(v=>v.some(x=>x<0)));
 const round=validateModel(m,m.elements);assert.equal(round.coordination.shells[0].vertices.length,6);
 const center=round.coordination.shells[0].center;removeAtoms(round,[center]);
 assert.ok(!round.coordination.shells.some(s=>s.center<0));
 validateModel(round,m.elements);
});
test('polyhedron normals produce different shades and follow rotation under fixed light',()=>{
 const s={...defaults(),polyEnabled:true,polyScope:'auto'};
 rotate(s,.3,.2);const before=buildScene(model,s).items.filter(x=>x.kind==='polygon');
 assert.ok(new Set(before.map(x=>x.color)).size>2);
 rotate(s,.9,-.4);const after=buildScene(model,s).items.filter(x=>x.kind==='polygon');
 assert.ok(before.some(a=>after.some(b=>b.name===a.name&&b.color!==a.color)));
 s.polyLight=0;assert.equal(new Set(buildScene(model,s).items.filter(x=>x.kind==='polygon').map(x=>x.color)).size,1);
});
