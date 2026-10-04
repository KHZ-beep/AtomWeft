// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
import {mkdirSync,writeFileSync} from 'node:fs';
import {atomPrimitives,buildScene,defaults,sceneSVG} from '../web/scene.js';
const scene={width:960,height:540,title:'AtomWeft styles',items:[]};
const text=(name,x,y,width,size=20)=>({kind:'text',name,text:name,x,y,width,height:30,font:size,color:'#283751',z:0});
scene.items.push(text('小球维度',35,18,300,22));
['2d','2.5d','3d'].forEach((dim,i)=>{
  const x=175+i*305;
  scene.items.push(...atomPrimitives({kind:'circle',name:`Atom ${dim}`,x,y:163,r:65,z:0,color:'#AB7BE5',atom:i},dim));
  scene.items.push(text(dim.toUpperCase(),x-100,241,200));
});
scene.items.push(text('键的显示',35,306,300,22));
const model={name:'pair',atoms:[{element:'C',label:'C1',xyz:[-1,0,0]},{element:'O',label:'O2',xyz:[1,0,0]}],
  elements:{C:{color:'#AB7BE5',covalent:.76,vdw:1.7,scale:1},O:{color:'#EF6666',covalent:.66,vdw:1.52,scale:1}},bonds:[{a:0,b:1,order:1}]};
['original','outline','black'].forEach((appearance,i)=>{
  const state=defaults();state.bondAppearance=appearance;state.bondWidth=10;
  const row=buildScene(model,state);
  for(const p of row.items){
    const s={...p};
    for(const key of ['x','x1','x2'])if(key in s)s[key]=175+i*305+(s[key]-480)*.56;
    for(const key of ['y','y1','y2'])if(key in s)s[key]=413+(s[key]-270)*.56;
    for(const key of ['r','rx','ry','width','height','strokeWidth'])if(key in s)s[key]*=.56;
    scene.items.push(s);
  }
  scene.items.push(text(['原样','黑色描边','全黑'][i],75+i*305,472,200,18));
});
mkdirSync('build',{recursive:true});
writeFileSync('build/styles-scene.json',JSON.stringify(scene,null,2));
writeFileSync('build/styles-preview.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810" viewBox="0 0 960 540"><rect width="960" height="540" fill="white"/>${sceneSVG(scene)}</svg>`);
// Fixtures for all appearance combinations and direct-insertion verification.
const variants=[];
for(const atomDimension of ['2d','2.5d','3d'])for(const bondAppearance of ['original','outline','black']){
  const state={...defaults(),atomDimension,bondAppearance,bondWidth:8};
  variants.push({atomDimension,bondAppearance,scene:buildScene(model,state)});
}
writeFileSync('build/style-variants.json',JSON.stringify(variants));
console.log('Wrote editable gallery and nine combination fixtures.');
