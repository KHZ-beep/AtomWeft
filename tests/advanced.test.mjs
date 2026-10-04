// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {hullFaces,coordination,invalidateCoordination} from '../web/polyhedra.js';
import {defaults,buildScene,rotate,sceneSVG} from '../web/scene.js';
import {removeAtoms,moveAtoms,addAtom,setBond,History,validateModel} from '../web/editing.js';
const elements={Fe:{number:26,color:'#BC8048',scale:1,covalent:1.32,vdw:2.05},O:{number:8,color:'#ED504C',scale:1,covalent:.66,vdw:1.52}};
const oct=[[0,0,0],[2,0,0],[-2,0,0],[0,2,0],[0,-2,0],[0,0,2],[0,0,-2]];
const model=()=>({name:'FeO6 coordination',atoms:oct.map((xyz,i)=>({element:i?'O':'Fe',xyz:[...xyz],label:'site'+i})),bonds:oct.slice(1).map((v,i)=>({a:0,b:i+1,order:1})),elements:structuredClone(elements),cell:null});
test('convex hull merges coplanar faces and rejects flat shells',()=>{
 assert.equal(hullFaces([[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]]).length,4);
 assert.equal(hullFaces(oct.slice(1)).length,8);
 const cube=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x,y,z])));
 const faces=hullFaces(cube);assert.equal(faces.length,6);assert.ok(faces.every(f=>f.indices.length===4));
 assert.equal(hullFaces([[0,0,0],[1,0,0],[1,1,0],[0,1,0]]).length,0);
});
test('coordination obeys centers, ligands and distance and updates after edits',()=>{
 const m=model(),opts={scope:'element',element:'Fe',method:'distance',cutoff:2.1,ligand:'O'};
 assert.equal(coordination(m,opts).shells[0].neighbors.length,6);
 moveAtoms(m,[1],[4,0,0]);invalidateCoordination(m);
 assert.equal(coordination(m,opts).shells[0].neighbors.length,5);
 assert.equal(coordination(m,{...opts,ligand:'Fe'}).shells.length,0);
});
test('deletion remaps connectivity; addition and manual bond are reversible',()=>{
 const m=model(),history=new History();history.push(m);
 removeAtoms(m,[1,3]);assert.equal(m.atoms.length,5);assert.ok(m.bonds.every(b=>b.a<m.atoms.length&&b.b<m.atoms.length));
 const i=addAtom(m,'O',[3,3,3],elements);setBond(m,[0,i],2);assert.equal(m.bonds.at(-1).order,2);
 const old=history.undo(m);assert.equal(old.atoms.length,7);assert.equal(history.redo(old).atoms.length,6);
});
test('local styles mix independently without changing global styles',()=>{
 const m=model(),s=defaults();m.atoms[0].appearance={style:'space',radius:'vdw',color:'#00FF00',atomDimension:'3d'};
 const scene=buildScene(m,s);assert.equal(scene.items.find(v=>v.atom===0).color,'#00FF00');assert.ok(scene.items.find(v=>v.atom===0).gradient);
 assert.ok(!scene.items.find(v=>v.atom===1).gradient);assert.equal(s.style,'ball');
});
test('perspective, focus blur and translucency remain finite native primitives',()=>{
 const m=model(),s=defaults();s.perspective=.8;s.depthFade=.3;s.depthOpacity=.2;s.blur=6;s.focusWidth=.2;
 const scene=buildScene(m,s),near=scene.atoms.find(a=>a.index===5),far=scene.atoms.find(a=>a.index===6);
 assert.ok(near.r>far.r);assert.ok(scene.items.some(v=>v.softEdge>0));assert.ok(scene.items.some(v=>v.opacity<1));
 assert.match(sceneSVG(scene),/feGaussianBlur/);assert.doesNotMatch(sceneSVG(scene),/<image/);
});
test('project model rejects invalid atoms and bonds; preserves per-atom styles and parts',()=>{
 const m=model();m.atoms[0].part='metal';m.atoms[0].appearance={atomDimension:'2.5d'};
 const round=validateModel(m,elements);assert.equal(round.atoms[0].part,'metal');assert.equal(round.atoms[0].appearance.atomDimension,'2.5d');
 m.atoms[0].xyz[0]=NaN;assert.throws(()=>validateModel(m,elements));m.atoms[0].xyz[0]=0;m.bonds[0].b=99;assert.throws(()=>validateModel(m,elements));
});
const m=model(),s=defaults();Object.assign(s,{polyEnabled:true,polyElement:'Fe',polyOpacity:.26,perspective:.55,depthFade:.2,depthOpacity:.12,blur:2,focusWidth:.5,atomDimension:'3d'});rotate(s,.65,-.45);
m.atoms[0].appearance={atomDimension:'2.5d',color:'#946ADE',scale:1.1};
const scene=buildScene(m,s);mkdirSync(new URL('../build/',import.meta.url),{recursive:true});writeFileSync(new URL('../build/advanced-scene.json',import.meta.url),JSON.stringify(scene));
