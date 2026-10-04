// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
export function depthProfile(min,max,state){
  const span=Math.max(1e-6,max-min),focus=min+((state.focus??0)+1)*span/2;
  const clear=span*(state.focusWidth??.5)/4,reach=Math.max(focus-min,max-focus)-clear;
  return {min,max,focus,clear,amount(z){
    const distance=Math.max(0,Math.abs(z-focus)-clear),t=reach<=1e-8?0:Math.min(1,distance/reach);
    return t*t*(3-2*t);
  }};
}
export function depthGradient(start,end,color,profile,state,tint,angle=0){
  const span=end-start;if(Math.abs(span)<1e-8)return null;
  const positions=new Set([0,1]);
  for(const z of [profile.focus-profile.clear,profile.focus,profile.focus+profile.clear]){const t=(z-start)/span;if(t>0&&t<1)positions.add(t);}
  while(positions.size<8){const sorted=[...positions].sort((a,b)=>a-b);let i=0;for(let j=1;j<sorted.length-1;j++)if(sorted[j+1]-sorted[j]>sorted[i+1]-sorted[i])i=j;positions.add((sorted[i]+sorted[i+1])/2);}
  return {angle,stops:[...positions].sort((a,b)=>a-b).map(position=>{
    const amount=profile.amount(start+span*position);
    return {position,color:tint(color,amount*(state.depthFade||0)),opacity:1-amount*(state.depthOpacity||0)};
  })};
}
// Fit view depth to a face's normalized bounding box. A native gradient keeps
// the editable face intact, with no seams from triangulated transparency.
export function faceDepthGradient(item,profile,state,tint){
  const xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY;
  if(w<1e-6||h<1e-6)return null;
  const points=item.points.map((p,i)=>[(p[0]-minX)/w,(p[1]-minY)/h,item.depthVertices[i]]);
  const avg=[0,1,2].map(k=>points.reduce((s,p)=>s+p[k],0)/points.length);
  let xx=0,xy=0,yy=0,xz=0,yz=0;
  for(const p of points){const x=p[0]-avg[0],y=p[1]-avg[1],z=p[2]-avg[2];xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;}
  const det=xx*yy-xy*xy;if(Math.abs(det)<1e-10)return null;
  const a=(xz*yy-yz*xy)/det,b=(yz*xx-xz*xy)/det,span=Math.abs(a)+Math.abs(b);
  if(span<1e-8)return null;
  const middle=avg[2]+a*(.5-avg[0])+b*(.5-avg[1]);
  return depthGradient(middle-span/2,middle+span/2,item.color,profile,state,tint,(Math.atan2(b,a)*180/Math.PI+360)%360);
}
