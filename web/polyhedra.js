// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Supporting planes of a small coordination shell; coplanar triangles merge into one face.
export function hullFaces(points){
  if(points.length<4||points.length>24)return [];
  const eps=Math.max(1,...points.flat().map(Math.abs))*1e-7,faces=new Map();
  for(let a=0;a<points.length-2;a++)for(let b=a+1;b<points.length-1;b++)for(let c=b+1;c<points.length;c++){
    let n=cross(sub(points[b],points[a]),sub(points[c],points[a]));const length=Math.hypot(...n);if(length<eps)continue;
    n=n.map(v=>v/length);const ds=points.map(p=>dot(n,sub(p,points[a])));
    if(ds.some(d=>d>eps)&&ds.some(d=>d< -eps))continue;
    if(ds.every(d=>Math.abs(d)<=eps))continue; // no 3D hull for a planar shell
    if(ds.some(d=>d>eps))n=n.map(v=>-v);
    const face=ds.map((d,i)=>Math.abs(d)<=eps?i:-1).filter(i=>i>=0),key=face.join(',');if(faces.has(key))continue;
    const center=[0,1,2].map(k=>face.reduce((s,i)=>s+points[i][k],0)/face.length);
    let u=sub(points[face[0]],center);u=u.map(v=>v/Math.hypot(...u));const v=cross(n,u);
    face.sort((i,j)=>Math.atan2(dot(sub(points[i],center),v),dot(sub(points[i],center),u))-Math.atan2(dot(sub(points[j],center),v),dot(sub(points[j],center),u)));
    faces.set(key,{indices:face,normal:n});
  }
  return [...faces.values()];
}
const cache=new WeakMap();
export function coordination(model,options){
  const key=JSON.stringify(options),hit=cache.get(model);if(hit?.key===key)return hit.value;
  if(options.scope==='auto'&&model.coordination?.shells){
    const shells=[];
    for(const entry of model.coordination.shells){
      if(!model.atoms[entry.center])continue;
      const records=entry.vertices.filter(v=>!options.ligand||(v.atom!==null?model.atoms[v.atom]?.element:v.element)===options.ligand);
      const vertices=records.map(v=>v.atom!==null?model.atoms[v.atom].xyz.map((x,k)=>x+v.offset[k]):v.xyz.map((x,k)=>x+model.atoms[entry.center].xyz[k]-entry.origin[k]));
      const hull=hullFaces(vertices.map(v=>sub(v,model.atoms[entry.center].xyz)));
      if(hull.length)shells.push({center:entry.center,neighbors:records.map(v=>v.atom).filter(v=>v!==null),vertices,vertexAtoms:records.map(v=>v.atom),faces:hull.map(f=>f.indices),faceNormals:hull.map(f=>f.normal),source:entry.source});
    }
    const value={shells,warnings:shells.length?[]:['CIF 中未识别到具有四个以上非共面邻居的配位中心。可切换为手动选择中心。']};cache.set(model,{key,value});return value;
  }
  const centers=options.scope==='selection'?(options.centers||[]):model.atoms.map((a,i)=>a.element===options.element?i:-1).filter(i=>i>=0);
  const adjacency=model.atoms.map(()=>[]);for(const b of model.bonds){adjacency[b.a].push(b.b);adjacency[b.b].push(b.a);}
  const shells=[],warnings=[];
  if(centers.length>200)warnings.push('多面体最多显示 200 个中心，请缩小选区。');
  for(const center of centers.slice(0,200)){
    if(!model.atoms[center])continue;
    let neighbors=options.method==='distance'?model.atoms.map((a,i)=>i!==center&&Math.hypot(...sub(a.xyz,model.atoms[center].xyz))<=options.cutoff?i:-1).filter(i=>i>=0):adjacency[center];
    neighbors=[...new Set(neighbors)].filter(i=>!options.ligand||model.atoms[i].element===options.ligand);
    if(neighbors.length>24){warnings.push(`中心 ${center+1} 有超过 24 个邻居，已跳过；请缩小截断距离。`);continue;}
    const relative=neighbors.map(i=>sub(model.atoms[i].xyz,model.atoms[center].xyz));
    const hull=hullFaces(relative),faces=hull.map(f=>f.indices);
    if(faces.length)shells.push({center,neighbors,faces,vertices:neighbors.map(i=>model.atoms[i].xyz),vertexAtoms:neighbors,faceNormals:hull.map(f=>f.normal),source:'manual'});
  }
  if(centers.length&&!shells.length)warnings.push('没有找到含至少四个非共面配位原子的中心。请检查中心、配体、连接或截断距离。');
  const value={shells,warnings};cache.set(model,{key,value});return value;
}
export function invalidateCoordination(model){cache.delete(model);}
