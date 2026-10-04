// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,rotate,buildScene,sceneSVG,atomPrimitives} from '../web/scene.js';
const model={name:'water',atoms:[{element:'O',label:'O1',xyz:[0,0,0]},{element:'H',label:'H2',xyz:[1,0,.2]},{element:'H',label:'H3',xyz:[-.25,1,-.2]}],
  elements:{O:{color:'#FF0000',covalent:.66,vdw:1.52,scale:1},H:{color:'#EEEEEE',covalent:.31,vdw:1.2,scale:1}},bonds:[{a:0,b:1,order:1},{a:0,b:2,order:1}]};
test('styles, equal radius, element overrides and hide H',()=>{
  const s=defaults();let scene=buildScene(model,s);
  assert.equal(scene.items.filter(x=>x.kind==='circle').length,3);
  assert.equal(scene.items.filter(x=>x.kind==='line').length,4);
  s.radius='equal';scene=buildScene(model,s);const radii=scene.items.filter(x=>x.kind==='circle').map(x=>x.r);assert.equal(new Set(radii).size,1);
  s.overrides.O={color:'#00FF00',scale:1.5};scene=buildScene(model,s);assert.equal(scene.items.find(x=>x.atom===0).color,'#00FF00');
  s.style='space';assert.equal(buildScene(model,s).items.filter(x=>x.kind==='line').length,0);
  s.hideH=true;assert.equal(buildScene(model,s).items.length,1);
  s.style='line';assert.equal(buildScene(model,s).items.filter(x=>x.kind==='circle').length,0);
});
test('rotation preserves sphere radii and reverses depth',()=>{
  const s=defaults(),before=buildScene(model,s);rotate(s,Math.PI,0);const after=buildScene(model,s);
  assert.equal(before.items.find(x=>x.atom===1).r,after.items.find(x=>x.atom===1).r);
  assert.ok(Math.abs(before.items.find(x=>x.atom===1).z+after.items.find(x=>x.atom===1).z)<1e-8);
  for(let i=1;i<after.items.length;i++)assert.ok(after.items[i].z>=after.items[i-1].z);
});
test('SVG escapes imported text and retains double bonds',()=>{
  const m=structuredClone(model);m.atoms[0].label='<script>';m.bonds[0].order=2;
  const sc=buildScene(m,defaults());assert.equal(sc.items.filter(x=>x.kind==='line').length,6);
  assert.ok(!sceneSVG(sc).includes('<script>'));
});
test('2D is unchanged; 2.5D uses basic ellipses; 3D has editable gradients',()=>{
  const base={kind:'circle',x:100,y:100,r:60,z:0,color:'#A478E7',name:'Atom 1',atom:0};
  assert.deepEqual(atomPrimitives(base,'2d'),[base]);
  const cartoon=atomPrimitives(base,'2.5d');
  assert.deepEqual(cartoon.map(x=>x.kind),['circle','ellipse','ellipse']);
  assert.equal(cartoon[2].color,'#FFFFFF');
  assert.ok(cartoon.every(x=>!x.gradient));
  // All decorations lie within the ball outline, including their rotation.
  for(const ellipse of cartoon.slice(1))for(let i=0;i<360;i++){
    const a=i*Math.PI/180,t=ellipse.rotation*Math.PI/180;
    const x=ellipse.x+ellipse.rx*Math.cos(a)*Math.cos(t)-ellipse.ry*Math.sin(a)*Math.sin(t);
    const y=ellipse.y+ellipse.rx*Math.cos(a)*Math.sin(t)+ellipse.ry*Math.sin(a)*Math.cos(t);
    assert.ok(Math.hypot(x-base.x,y-base.y)<base.r);
  }
  const shaded=atomPrimitives(base,'3d');
  assert.equal(shaded[0].gradient.stops.length,5);
  assert.equal(shaded[1].gradient.stops.at(-1).opacity,0);
  const svg=sceneSVG({items:shaded});assert.match(svg,/<linearGradient/);assert.doesNotMatch(svg,/<image/);
});
test('outlined bonds have one continuous frame and black bonds keep atom colors',()=>{
  const state=defaults();state.bondAppearance='outline';
  let scene=buildScene(model,state);
  const frames=scene.items.filter(s=>s.kind==='rect'&&s.name.includes('frame'));
  assert.equal(frames.length,2);assert.ok(frames.every(s=>s.color==='#000000'));
  assert.equal(scene.items.filter(s=>s.kind==='rect'&&s.name.includes('fill')).length,4);
  state.bondAppearance='black';scene=buildScene(model,state);
  assert.ok(scene.items.filter(s=>s.kind==='line').every(s=>s.color==='#000000'));
  assert.equal(scene.items.find(s=>s.atom===0).color,'#FF0000');
});
test('all nine combinations rotate with finite native geometry',()=>{
  for(const dim of ['2d','2.5d','3d'])for(const appearance of ['original','outline','black']){
    const s=defaults();s.atomDimension=dim;s.bondAppearance=appearance;rotate(s,.55,.6);
    const scene=buildScene(model,s);
    for(const p of scene.items)for(const v of Object.values(p))if(typeof v==='number')assert.ok(Number.isFinite(v));
    assert.equal(scene.items.filter(s=>s.atom!==undefined).length,3);
  }
});
