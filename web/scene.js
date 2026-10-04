// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
import {coordination} from './polyhedra.js';
import {depthProfile,depthGradient,faceDepthGradient} from './depth.js';
// The same ordered primitives drive SVG preview, DrawingML and PowerPoint COM.
export const defaults = () => ({style:'ball', radius:'covalent', atomScale:1,
  bondWidth:3, atomDimension:'2d', bondAppearance:'original', zoom:1, labels:false, hideH:false, cell:false,
  rotation:[1,0,0,0,1,0,0,0,1], overrides:{},
  perspective:0,depthFade:0,depthOpacity:0,focus:0,focusWidth:.5,blur:0,
  polyEnabled:false,polyScope:'auto',polyElement:'',polyLigand:'',polyMethod:'bonds',polyCutoff:2.8,
  polyOpacity:.3,polyColor:'#6A9FE8',polyLight:1,polyCenters:[],frame:null});

export function multiply(a,b) {
  return Array.from({length:9},(_,i)=>[0,1,2].reduce((s,k)=>s+a[Math.floor(i/3)*3+k]*b[k*3+i%3],0));
}
export function rotate(state, dx, dy, dz=0) {
  const cx=Math.cos(dy), sx=Math.sin(dy), cy=Math.cos(dx), sy=Math.sin(dx), cz=Math.cos(dz), sz=Math.sin(dz);
  state.rotation=multiply([cz,-sz,0,sz,cz,0,0,0,1],multiply([cy,0,sy,0,1,0,-sy,0,cy],multiply([1,0,0,0,cx,-sx,0,sx,cx],state.rotation)));
}
const transform=(m,p)=>[0,1,2].map(i=>m[i*3]*p[0]+m[i*3+1]*p[1]+m[i*3+2]*p[2]);

export function tint(hex, amount) {
  const target=amount<0?0:255, t=Math.abs(amount);
  return '#'+hex.slice(1).match(/../g).map(v=>Math.round(parseInt(v,16)*(1-t)+target*t).toString(16).padStart(2,'0')).join('').toUpperCase();
}

export function atomPrimitives(base, dimension='2d') {
  if(dimension==='2d')return [base];
  const {x,y,r,z,color,atom}=base;
  const body={...base,stroke:tint(color,-.24),strokeWidth:r*(dimension==='2.5d'?.055:.018)};
  const ellipse=(suffix,dx,dy,rx,ry,rotation,fill)=>({kind:'ellipse',name:base.name+' '+suffix,
    x:x+dx*r,y:y+dy*r,rx:rx*r,ry:ry*r,rotation,color:fill,z,ownerAtom:atom,strokeWidth:0});
  if(dimension==='2.5d')return [body,
    ellipse('lit face',.19,-.11,.76,.86,-25,tint(color,.28)),
    ellipse('highlight',.39,-.47,.36,.15,45,'#FFFFFF')];
  // Native linear gradient fills are supported identically by SVG, DrawingML and COM.
  body.gradient={angle:135,stops:[{position:0,color:tint(color,.92)},
    {position:.28,color:tint(color,.60)},{position:.56,color},
    {position:.84,color:tint(color,-.38)},{position:1,color:tint(color,-.66)}]};
  const gloss=ellipse('soft highlight',.33,-.40,.32,.19,45,'#FFFFFF');
  gloss.gradient={angle:90,stops:[{position:0,color:'#FFFFFF',opacity:.9},
    {position:.45,color:'#FFFFFF',opacity:.35},{position:1,color:'#FFFFFF',opacity:0}]};
  return [body,gloss];
}

function strip(name,a,b,width,color,z,padding=0){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(length<1e-6)return null;
  return {kind:'rect',name,x:(a[0]+b[0])/2-length/2-padding,y:(a[1]+b[1])/2-width/2,
    width:length+2*padding,height:width,rotation:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI,
    color,strokeWidth:0,z};
}

function outlinedBond(items,name,a,b,width,colorA,colorB,split,z,dashed,depthEnds){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(length<1e-6)return;
  const border=Math.max(.55,Math.min(1.2,width*.22));
  const point=t=>a.map((v,k)=>v+(b[k]-v)*t);
  const spans=[];
  if(dashed){for(let start=0;start<length;start+=width*7)spans.push([start/length,Math.min(1,(start+width*4)/length)]);}
  else spans.push([0,1]);
  spans.forEach(([lo,hi],i)=>{
    const depths=(from,to)=>[from,to].map(t=>depthEnds[0]+t*(depthEnds[1]-depthEnds[0]));
    items.push({...strip(name+' frame '+i,point(lo),point(hi),width+border*2,'#000000',z,border),depthEnds:depths(lo,hi)});
    for(const [from,to,color] of [[lo,Math.min(hi,split),colorA],[Math.max(lo,split),hi,colorB]]){
      if(to>from){const s=strip(name+' fill '+i,point(from),point(to),width,color,z);if(s)items.push({...s,depthEnds:depths(from,to)});}
    }
  });
}

export function buildScene(model,state) {
  if (!model) return {width:960,height:540,items:[]};
  const style=i=>({...state,...model.atoms[i].appearance});
  const visible=model.atoms.map((a,i)=>i).filter(i=>(!state.hideH||model.atoms[i].element!=='H')&&!style(i).hidden);
  if(!visible.length) return {width:960,height:540,items:[]};
  const center=state.frame?.center||[0,1,2].map(k=>visible.reduce((s,i)=>s+model.atoms[i].xyz[k],0)/visible.length);
  const project=p=>transform(state.rotation,p.map((v,k)=>v-center[k]));
  const p=model.atoms.map(a=>project(a.xyz));
  const element=e=>({...model.elements[e],...state.overrides[e]});
  const color=i=>style(i).color||element(model.atoms[i].element).color;
  const radii=model.atoms.map((a,i)=>{
    const local=style(i);
    const el=element(a.element);
    const base=local.radius==='equal' ? (local.style==='space'?1.7:.76) : el[local.radius];
    return base*(local.style==='space'?1:.42)*local.atomScale*el.scale*(local.scale||1);
  });
  const poly=state.polyEnabled?coordination(model,{scope:state.polyScope,centers:state.polyCenters,element:state.polyElement,ligand:state.polyLigand,method:state.polyMethod,cutoff:state.polyCutoff}):null;
  // Fit uses a rotation-invariant 3D bound, so dragging never changes scale.
  let bound=Math.max(...visible.map(i=>Math.hypot(...model.atoms[i].xyz.map((v,k)=>v-center[k]))+radii[i]),1);
  if(state.cell&&model.cell) bound=Math.max(bound,...model.cell.corners.map(c=>Math.hypot(...c.map((v,k)=>v-center[k]))));
  if(poly)for(const shell of poly.shells)for(const vertex of shell.vertices)bound=Math.max(bound,Math.hypot(...vertex.map((v,k)=>v-center[k]))+.2);
  bound=state.frame?.bound||bound;
  const scale=215/bound*state.zoom;
  const perspective=q=>1/Math.max(.25,1-(state.perspective||0)*q[2]/(bound*2));
  const xy=q=>[480+q[0]*scale*perspective(q),270-q[1]*scale*perspective(q)];
  let items=[];
  const warnings=[];
  if(state.polyEnabled){
    warnings.push(...poly.warnings);
    const visibleSet=new Set(visible);
    for(const shell of poly.shells)if(visibleSet.has(shell.center))for(const [faceIndex,face] of shell.faces.entries()){
      if(!face.every(i=>shell.vertexAtoms[i]===null||visibleSet.has(shell.vertexAtoms[i])))continue;
      const vertices=face.map(i=>project(shell.vertices[i])),points=vertices.map(xy);
      // Edge-on faces have zero projected area; omit them rather than produce degenerate freeforms.
      const area=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-a[1]*b[0];},0);
      if(Math.abs(area)<1e-5)continue;
      const normal=transform(state.rotation,shell.faceNormals[faceIndex]),light=[-.35,.45,.8216];
      const diffuse=Math.max(0,normal.reduce((sum,v,k)=>sum+v*light[k],0));
      const faceColor=tint(state.polyColor,(-.5+.68*diffuse)*(state.polyLight??1));
      items.push({kind:'polygon',name:`Polyhedron ${shell.center+1} face ${faceIndex+1}`,points,color:faceColor,opacity:state.polyOpacity,
        stroke:tint(faceColor,-.2),strokeWidth:.8,z:vertices.reduce((s,q)=>s+q[2],0)/face.length,depthVertices:vertices.map(q=>q[2]),centerAtom:shell.center});
    }
  }
  if(state.cell&&model.cell) {
    const c=model.cell.corners.map(project);
    for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if([1,2,4].includes(i^j)){
      const a=xy(c[i]),b=xy(c[j]);
      items.push({kind:'line',name:`Cell ${i}-${j}`,x1:a[0],y1:a[1],x2:b[0],y2:b[1],width:1,color:'#A2ADBE',z:(c[i][2]+c[j][2])/2,dash:true});
    }
  }
  const selected=new Set(visible);
  const connected=new Set(model.bonds.filter(b=>selected.has(b.a)&&selected.has(b.b)).flatMap(b=>[b.a,b.b]));
  for(const bond of model.bonds) {
    if(!selected.has(bond.a)||!selected.has(bond.b))continue;
    const sa=style(bond.a),sb=style(bond.b);
    if(sa.style==='space'&&sb.style==='space')continue;
    const appearance=sa.bondAppearance===sb.bondAppearance?sa.bondAppearance:state.bondAppearance;
    const width=(sa.bondWidth+sb.bondWidth)/2;
    const a=p[bond.a],b=p[bond.b], dist=Math.hypot(...a.map((v,k)=>v-b[k]));
    if(dist<1e-6)continue;
    const r1=sa.style==='line'?0:radii[bond.a],r2=sb.style==='line'?0:radii[bond.b];
    const start=r1/dist,end=1-r2/dist;
    if(start>=end)continue;
    const aa=xy(a),bb=xy(b),dx=bb[0]-aa[0],dy=bb[1]-aa[1],length=Math.hypot(dx,dy);
    const nx=length>1e-6?-dy/length:0,ny=length>1e-6?dx/length:0;
    const order=bond.order===1.5?2:Math.max(1,Math.min(3,Math.round(bond.order)));
    if(appearance==='outline'){
      const spacing=width+2.4+2*Math.max(.55,Math.min(1.2,width*.22));
      for(let n=0;n<order;n++){
        const offset=(n-(order-1)/2)*spacing;
        const u=xy(a.map((v,k)=>v+(b[k]-v)*start)).map((v,k)=>v+(k?ny:nx)*offset);
        const v=xy(a.map((v,k)=>v+(b[k]-v)*end)).map((v,k)=>v+(k?ny:nx)*offset);
        outlinedBond(items,`Bond ${bond.a+1}-${bond.b+1} ${n+1}`,u,v,width,
          color(bond.a),color(bond.b),
          Math.max(0,Math.min(1,(.5-start)/(end-start))),(a[2]+b[2])/2,bond.order===1.5&&n===1,
          [start,end].map(t=>a[2]+t*(b[2]-a[2])));
      }
      continue;
    }
    // Half bonds retain the two element colors and manageable shape counts.
    const intervals=appearance==='black'?[[start,end,bond.a]]:
      start<.5&&end>.5?[[start,.5,bond.a],[.5,end,bond.b]]:[[start,end,(start+end)/2<.5?bond.a:bond.b]];
    for(let n=0;n<order;n++)for(const [t0,t1,owner] of intervals) {
      const q0=a.map((v,k)=>v+(b[k]-v)*t0),q1=a.map((v,k)=>v+(b[k]-v)*t1);
      const u=xy(q0),v=xy(q1),offset=(n-(order-1)/2)*(width+2.4);
      items.push({kind:'line',name:`Bond ${bond.a+1}-${bond.b+1} ${n+1} ${owner+1}`,
        x1:u[0]+nx*offset,y1:u[1]+ny*offset,x2:v[0]+nx*offset,y2:v[1]+ny*offset,
        width,color:appearance==='black'?'#000000':color(owner),
        z:(q0[2]+q1[2])/2,depthEnds:[q0[2],q1[2]],dash:bond.order===1.5&&n===1});
    }
  }
  for(const i of visible){
    const local=style(i),a=model.atoms[i],q=p[i],[x,y]=xy(q),r=radii[i]*scale*perspective(q);
    if(local.style!=='line') items.push(...atomPrimitives({kind:'circle',name:`Atom ${i+1} ${a.element} ${a.label}`,x,y,r,color:color(i),z:q[2],atom:i},local.atomDimension));
    const show=local.labels || (local.style==='line'&&a.element!=='C'&&a.element!=='H') || (local.style==='line'&&!connected.has(i));
    if(show) items.push({kind:'text',name:`Label ${i+1}`,x:x-18,y:y-9,width:36,height:18,text:a.element,
      color:local.style==='line'?'#24334C':contrast(color(i)),font:12,z:q[2]+.00001,ownerAtom:i});
  }
  const depths=visible.flatMap(i=>[p[i][2]-radii[i],p[i][2]+radii[i]]).concat(items.flatMap(s=>s.depthVertices||[]));
  const depth=depthProfile(Math.min(...depths),Math.max(...depths),state);
  // Continuous filled strips provide native alpha gradients without fragmenting
  // bonds. Dashed bonds keep their original line geometry and dash pattern.
  if(state.depthOpacity||state.depthFade)items=items.map(item=>{
    if(item.kind!=='line'||!item.depthEnds||item.dash||Math.abs(item.depthEnds[1]-item.depthEnds[0])<1e-8)return item;
    const shape=strip(item.name,[item.x1,item.y1],[item.x2,item.y2],item.width,item.color,item.z);
    return shape?{...shape,depthEnds:item.depthEnds}:item;
  });
  for(const item of items){
    const defocus=depth.amount(item.z),fade=defocus*(state.depthFade||0);
    const continuous=(state.depthOpacity||state.depthFade)?
      item.kind==='polygon'&&item.depthVertices?faceDepthGradient(item,depth,state,tint):
      item.kind==='rect'&&item.depthEnds?depthGradient(...item.depthEnds,item.color,depth,state,tint):null:null;
    if(continuous)item.gradient=continuous;
    else{
      if(fade){item.color=tint(item.color,fade);if(item.stroke)item.stroke=tint(item.stroke,fade);if(item.gradient)item.gradient.stops=item.gradient.stops.map(t=>({...t,color:tint(t.color,fade)}));}
      if(state.depthOpacity)item.opacity=(item.opacity??1)*(1-defocus*state.depthOpacity);
    }
    if(state.blur&&defocus)item.softEdge=Math.min(12,defocus*state.blur);
  }
  items.sort((a,b)=>a.z-b.z);
  return {width:960,height:540,items,title:model.name,warnings,polyhedra:poly?.shells.length||0,camera:{center,bound,scale,perspective:state.perspective||0,depthMin:depth.min,depthMax:depth.max},
    atoms:visible.map(i=>({index:i,xy:xy(p[i]),z:p[i][2],r:style(i).style==='line'?7:radii[i]*scale*perspective(p[i])})).sort((a,b)=>a.z-b.z)};
}
function contrast(hex){const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16));return .299*v[0]+.587*v[1]+.114*v[2]>155?'#25334A':'#FFFFFF';}
export function sceneSVG(scene) {
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  return scene.items.map((s,index)=>{
    const title=`<title>${esc(s.name)}</title>`;
    let fill=s.color,defs='';
    if(s.gradient){
      const angle=s.gradient.angle*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle),norm=Math.abs(dx)+Math.abs(dy);
      // DrawingML scaled linear gradients span the projected bounding box.
      defs=`<defs><linearGradient id="g${index}" x1="${(1-dx*norm)/2}" y1="${(1-dy*norm)/2}" x2="${(1+dx*norm)/2}" y2="${(1+dy*norm)/2}">${s.gradient.stops.map(t=>`<stop offset="${t.position}" stop-color="${t.color}" stop-opacity="${t.opacity??1}"/>`).join('')}</linearGradient></defs>`;
      fill=`url(#g${index})`;
    }
    const stroke=s.stroke??'#334155',sw=s.strokeWidth??(s.kind==='circle'?.6:0);
    const paint=`fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
    let body='';
    if(s.kind==='polygon')body=`<polygon points="${s.points.map(p=>p.join(',')).join(' ')}" ${paint}>${title}</polygon>`;
    else
    if(s.kind==='circle')body=`<circle cx="${s.x}" cy="${s.y}" r="${s.r}" ${paint}>${title}</circle>`;
    else if(s.kind==='ellipse')body=`<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" transform="rotate(${s.rotation??0} ${s.x} ${s.y})" ${paint}>${title}</ellipse>`;
    else if(s.kind==='rect')body=`<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" transform="rotate(${s.rotation??0} ${s.x+s.width/2} ${s.y+s.height/2})" ${paint}>${title}</rect>`;
    else if(s.kind==='line')body=`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.color}" stroke-width="${s.width}" ${s.dash?'stroke-dasharray="5 4"':''}>${title}</line>`;
    else body=`<text x="${s.x+s.width/2}" y="${s.y+s.height/2}" fill="${s.color}" font-family="Arial" font-size="${s.font}" text-anchor="middle" dominant-baseline="central">${esc(s.text)}</text>`;
    if(s.softEdge)defs+=`<defs><filter id="f${index}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s.softEdge/2}"/></filter></defs>`;
    return `${defs}<g opacity="${s.opacity??1}" ${s.softEdge?`filter="url(#f${index})"`:''}>${body}</g>`;
  }).join('');
}
