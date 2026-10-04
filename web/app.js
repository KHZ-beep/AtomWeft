// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
import {defaults,rotate,buildScene,sceneSVG} from './scene.js';
import {History,clone,removeAtoms,moveAtoms,addAtom,setBond,recount,validateModel,validateStyle} from './editing.js';
import {invalidateCoordination} from './polyhedra.js';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.hash.slice(1)).get('token')||sessionStorage.getItem('atomweft-token');
if(token)sessionStorage.setItem('atomweft-token',token);
history.replaceState(null,'',location.pathname);
let model=null,state=defaults(),source=null,scene=null,busy=false;
let selected=new Set(),tool='rotate',catalog={},drag=null;
const edits=new History();
const snapshot=()=>({model,state});
const remember=()=>{if(model)edits.push(snapshot());};
const restore=value=>{if(!value)return;({model,state}=value);selected.clear();refreshModel();};
const status=(msg,kind='')=>{$('status').textContent=msg;$('status').className=kind;};
const parserOptions=()=>({expand:$('expand').checked,repeats:['ra','rb','rc'].map(id=>Number($(id).value)),bondFactor:Number($('bondFactor').value)});
async function api(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-AtomWeft-Token':token||''},body:JSON.stringify(body)});
  if(!response.ok){let msg;try{msg=(await response.json()).error;}catch{msg=`请求失败 (${response.status})`;}throw new Error(msg);}
  return response;
}
function render(){
  scene=buildScene(model,state);$('preview').innerHTML=sceneSVG(scene);
  if(model){
    const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g');overlay.id='selectionOverlay';
    for(const atom of scene.atoms||[]){
      if(selected.has(atom.index)){const ring=document.createElementNS(ns,'circle');for(const [k,v] of Object.entries({cx:atom.xy[0],cy:atom.xy[1],r:atom.r+4,fill:'none',stroke:'#1766ed','stroke-width':2,'pointer-events':'none'}))ring.setAttribute(k,v);overlay.append(ring);}
    }
    $('preview').append(overlay);
  }
  $('empty').hidden=!!model;
  $('export').disabled=$('insert').disabled=busy||!scene.items.length;
  $('zoomValue').textContent=Math.round(state.zoom*100)+'%';
  document.querySelector('.canvas-bottom span:last-child').textContent=state.perspective?'透视投影':'正交投影';
  if(model)$('stats').textContent=`${model.atoms.length} 个原子 · ${model.bonds.length} 个连接 · ${scene.items.length} 个可编辑图形`;
  $('selectionCount').textContent=`已选择 ${selected.size} 个原子`;
  $('undo').disabled=!edits.undoStack.length||busy;$('redo').disabled=!edits.redoStack.length||busy;
  $('polyStatus').textContent=scene.warnings?.join(' ')|| (state.polyEnabled?`识别 ${scene.polyhedra||0} 个多面体 · ${state.polyScope==='auto'?'CIF 自动配位':'手动中心'}`:'');
}
function syncControls(){
  for(const k of ['radius','atomScale','bondWidth','atomDimension','bondAppearance'])$(k).value=state[k];
  $('atomDimension').disabled=state.style==='line';
  $('bondAppearance').disabled=state.style==='space';
  $('dimensionHint').textContent=state.style==='line'?'键线式不显示小球。':{
    '2d':'保留原有纯色圆形。','2.5d':'底色、明亮面和白色高光均为可编辑图形。','3d':'渐变填充与柔和高光，可在 PowerPoint 中继续调整。'}[state.atomDimension];
  for(const k of ['labels','hideH','cell'])$(k).checked=state[k];
  $('atomScaleValue').textContent=state.atomScale.toFixed(2)+'×';
  $('bondWidthValue').textContent=state.bondWidth.toFixed(1)+' pt';
  document.querySelectorAll('[data-style]').forEach(b=>b.classList.toggle('active',b.dataset.style===state.style));
  $('modeBadge').textContent={line:'键线式',ball:'球棍式',space:'空间填充 / 全球型'}[state.style];
  for(const k of ['perspective','depthFade','depthOpacity','focus','focusWidth','blur','polyScope','polyElement','polyLigand','polyMethod','polyCutoff','polyOpacity','polyColor','polyLight'])$(k).value=state[k];
  for(const k of ['polyElement','polyMethod','polyCutoff','setPolyCenters'])$(k).disabled=state.polyScope==='auto';
  $('polyEnabled').checked=state.polyEnabled;
  $('perspectiveValue').textContent=state.perspective.toFixed(2);$('focusValue').textContent=state.focus.toFixed(2);$('blurValue').textContent=state.blur.toFixed(1);
}
function elementControls(){
  $('elements').replaceChildren();
  for(const [symbol,el] of Object.entries(model.elements).sort((a,b)=>a[1].number-b[1].number)){
    const row=document.createElement('div');row.className='element';
    const name=document.createElement('span');name.className='element-name';
    const bold=document.createElement('b');bold.textContent=symbol;
    const count=document.createElement('small');count.textContent=el.count+' 个';name.append(bold,count);
    const color=document.createElement('input');color.type='color';color.value=state.overrides[symbol]?.color||el.color;color.setAttribute('aria-label',symbol+' 颜色');
    const size=document.createElement('input');size.type='number';size.min='.2';size.max='3';size.step='.05';size.value=state.overrides[symbol]?.scale||1;size.setAttribute('aria-label',symbol+' 半径倍率');
    color.onpointerdown=remember;
    color.oninput=()=>{state.overrides[symbol]={...state.overrides[symbol],color:color.value};render();};
    size.onchange=()=>{const v=Number(size.value);if(!Number.isFinite(v)||v<.2||v>3){size.value=state.overrides[symbol]?.scale||1;return;}remember();state.overrides[symbol]={...state.overrides[symbol],scale:v};render();};
    row.append(name,color,size);$('elements').append(row);
  }
}
async function loadSource(next,preserve=false,projectState=null){
  if(busy)return;busy=true;render();status('正在读取结构…');
  try{
    const result=await (await api('/api/parse',{...next,options:parserOptions()})).json();
    model=result;source=next;state=projectState||(preserve?state:defaults());
    if(!projectState&&!preserve&&model.coordination?.shells.length){state.polyEnabled=true;state.polyScope='auto';}
    selected.clear();edits.clear();state.frame=null;state.polyCenters=[];
    $('modelName').textContent=model.name;$('crystalOptions').hidden=!/\.(cif|mmcif)$/i.test(next.name);
    $('cell').disabled=!model.cell; if(!model.cell)state.cell=false;
    $('warnings').replaceChildren(...model.warnings.map(w=>{const li=document.createElement('li');li.textContent=w;return li;}));
    $('warningPanel').hidden=!model.warnings.length;$('warningTitle').textContent=`结构说明 · ${model.warnings.length} 项`;
    refreshModel();status('结构已就绪。拖动预览以选择插入角度。','success');
  }catch(e){status(e.message,'error');}finally{busy=false;render();}
}
async function loadFile(file){if(!file)return;if(file.size>12*1024*1024){status('文件超过 12 MB，请先提取所需片段。','error');return;}await loadSource({name:file.name,text:await file.text()});}
$('file').onchange=e=>loadFile(e.target.files[0]);
const drop=$('drop');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('over');});
for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('over');if(event==='drop')loadFile(e.dataTransfer.files[0]);});
for(const id of ['reparse','rebond'])$(id).onclick=()=>{if(source&&confirm('重新读取源文件会替换当前结构编辑。继续？'))loadSource(source,true);};
for(const k of ['atomScale','bondWidth','radius','atomDimension','bondAppearance','labels','hideH','cell'])$(k).addEventListener('input',()=>{state[k]=$(k).type==='checkbox'?$(k).checked:$(k).tagName==='SELECT'?$(k).value:Number($(k).value);syncControls();render();});
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{remember();state.style=b.dataset.style;if(state.style==='space')state.radius='vdw';if(state.style==='ball')state.radius='covalent';syncControls();render();});
function setView(v){state.rotation=defaults().rotation;if(v==='side')rotate(state,Math.PI/2,0);if(v==='top')rotate(state,0,Math.PI/2);if(v==='iso')rotate(state,Math.PI/4,-Math.PI/6);render();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('reset').onclick=()=>{state.zoom=1;state.frame=null;setView('front');};
const zoom=factor=>{state.zoom=Math.max(.25,Math.min(3,state.zoom*factor));render();};
$('zoomOut').onclick=()=>zoom(1/1.15);$('zoomIn').onclick=()=>zoom(1.15);
const vp=$('viewport');
function point(e){const r=$('preview').getBoundingClientRect();return [(e.clientX-r.left)*960/r.width,(e.clientY-r.top)*540/r.height];}
function hitAt(p){return [...(scene.atoms||[])].reverse().find(a=>Math.hypot(p[0]-a.xy[0],p[1]-a.xy[1])<=Math.max(9,a.r))?.index;}
function selectionChanged(){
  const ids=[...selected];if(ids.length){const xyz=[0,1,2].map(k=>ids.reduce((s,i)=>s+model.atoms[i].xyz[k],0)/ids.length);['posX','posY','posZ'].forEach((id,k)=>$(id).value=xyz[k].toFixed(4));}
  render();
}
vp.onpointerdown=e=>{
  if(busy||!model||e.button!==0)return;vp.focus();const p=point(e),hit=hitAt(p);vp.setPointerCapture(e.pointerId);
  if(tool==='rotate'){drag={kind:'rotate',p};return;}
  if(tool==='box'){drag={kind:'box',p,base:e.shiftKey?[...selected]:[]};return;}
  if(hit===undefined){if(!e.shiftKey)selected.clear();selectionChanged();return;}
  if(e.shiftKey){selected.has(hit)?selected.delete(hit):selected.add(hit);}else if(!selected.has(hit)||tool==='select'){selected=new Set([hit]);}
  selectionChanged();
  if(tool==='move'&&selected.has(hit)){
    remember();state.frame={center:[...scene.camera.center],bound:scene.camera.bound};
    drag={kind:'move',p,original:model.atoms.map(a=>[...a.xyz]),camera:scene.camera,z:scene.atoms.find(a=>a.index===hit).z,rotation:[...state.rotation]};
  }
};
vp.onpointermove=e=>{
  if(!drag)return;const p=point(e),dx=p[0]-drag.p[0],dy=p[1]-drag.p[1];
  if(drag.kind==='rotate'){rotate(state,e.shiftKey?0:dx*.008,e.shiftKey?0:dy*.008,e.shiftKey?dx*.008:0);drag.p=p;render();}
  else if(drag.kind==='box'){
    render();const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [k,v] of Object.entries({x:Math.min(p[0],drag.p[0]),y:Math.min(p[1],drag.p[1]),width:Math.abs(dx),height:Math.abs(dy),fill:'#2563eb22',stroke:'#2563eb','pointer-events':'none'}))rect.setAttribute(k,v);$('preview').append(rect);drag.end=p;
  }else{
    const f=1/Math.max(.25,1-drag.camera.perspective*drag.z/(2*drag.camera.bound));
    const delta=e.altKey?[0,0,-dy/drag.camera.scale]:[dx/(drag.camera.scale*f),-dy/(drag.camera.scale*f),0];
    const world=[0,1,2].map(k=>[0,1,2].reduce((s,j)=>s+drag.rotation[j*3+k]*delta[j],0));
    for(const i of selected)model.atoms[i].xyz=drag.original[i].map((v,k)=>v+world[k]);
    invalidateCoordination(model);selectionChanged();
  }
};
vp.onpointerup=()=>{if(drag?.kind==='box'){const a=drag.p,b=drag.end||a;selected=new Set([...drag.base,...(scene.atoms||[]).filter(v=>v.xy[0]>=Math.min(a[0],b[0])&&v.xy[0]<=Math.max(a[0],b[0])&&v.xy[1]>=Math.min(a[1],b[1])&&v.xy[1]<=Math.max(a[1],b[1])).map(v=>v.index)]);}drag=null;selectionChanged();};
vp.onpointercancel=()=>{drag=null;render();};
vp.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?.94:1/.94);},{passive:false});
vp.onkeydown=e=>{const delta={ArrowLeft:[-.08,0],ArrowRight:[.08,0],ArrowUp:[0,-.08],ArrowDown:[0,.08]}[e.key];if(delta){e.preventDefault();rotate(state,...delta);render();}};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function output(insert){
  busy=true;render();status(insert?'正在插入当前幻灯片…':'正在生成原生 PowerPoint 图形…');
  try{
    const response=await api(insert?'/api/insert':'/api/pptx',{scene});
    if(insert){const r=await response.json();status(`已插入第 ${r.slide} 页：${r.count} 个图形，已组合。`,'success');}
    else {download(await response.blob(),model.name.replace(/\.[^.]+$/,'')+'.pptx');status('已导出可编辑 PPTX。打开后取消组合，即可逐个编辑。','success');}
  }catch(e){status(e.message,'error');}finally{busy=false;render();}
}
$('export').onclick=()=>output(false);$('insert').onclick=()=>output(true);
$('saveProject').onclick=()=>{if(!model)return status('请先导入或新建结构。');download(new Blob([JSON.stringify({application:'AtomWeft',version:2,model,source,state,options:parserOptions()},null,2)],{type:'application/json'}),'AtomWeft-project.json');};
$('loadProject').onclick=()=>$('projectFile').click();
$('projectFile').onchange=async e=>{
  try{
    const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw new Error('项目文件过大。');
    const data=JSON.parse(await file.text());
    if(![1,2].includes(data.version)||(data.version===1&&(typeof data.source?.text!=='string'||typeof data.source?.name!=='string')))throw new Error('不是有效的 AtomWeft 项目。');
    const s={...defaults(),...data.state};
    if(!['2d','2.5d','3d'].includes(s.atomDimension)||!['original','outline','black'].includes(s.bondAppearance))throw new Error('项目的小球维度或键样式无效。');
    if(!['line','ball','space'].includes(s.style)||!['equal','covalent','vdw'].includes(s.radius)||!Array.isArray(s.rotation)||s.rotation.length!==9||!s.rotation.every(v=>Number.isFinite(v)&&Math.abs(v)<=1.001)||!s.overrides)throw new Error('项目视图参数无效。');
    for(const [k,min,max] of [['zoom',.25,3],['atomScale',.3,2],['bondWidth',.5,10]])if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)throw new Error('项目比例参数无效。');
    for(const v of Object.values(s.overrides))if((v.color&&!/^#[0-9a-f]{6}$/i.test(v.color))||(v.scale!==undefined&&(!Number.isFinite(v.scale)||v.scale<.2||v.scale>3)))throw new Error('项目元素参数无效。');
    const opts=data.options||{};$('expand').checked=opts.expand!==false;
    ['ra','rb','rc'].forEach((id,i)=>$(id).value=opts.repeats?.[i]||1);$('bondFactor').value=opts.bondFactor||1.2;
    validateExtraState(s);
    if(data.version===2){await catalogReady;const next=validateModel(data.model,catalog);model=next;source=data.source&&typeof data.source.text==='string'&&typeof data.source.name==='string'?data.source:null;state=s;selected.clear();edits.clear();refreshModel();status('完整项目已恢复，包含结构编辑与局部样式。','success');}
    else await loadSource(data.source,false,s);
  }catch(e){status(e.message,'error');}
};
function options(id,values,empty=null){const old=$(id).value;$(id).replaceChildren();if(empty!==null)$(id).add(new Option(empty,''));for(const v of values)$(id).add(new Option(v,v));$(id).value=values.includes(old)?old:(empty!==null?'':values[0]||'');}
function refreshModel(){
  if(!model)return;
  invalidateCoordination(model);recount(model);$('modelName').textContent=model.name;
  const elements=Object.keys(model.elements).filter(e=>model.elements[e].count>0);
  options('selectElement',elements);options('polyElement',elements);options('polyLigand',elements,'全部元素');
  if(!elements.includes(state.polyElement))state.polyElement=elements[0]||'';
  options('parts',[...new Set(model.atoms.map(a=>a.part).filter(Boolean))],'选择片段…');
  $('cell').disabled=!model.cell;$('crystalOptions').hidden=!source||! /\.(cif|mmcif)$/i.test(source.name);
  $('warnings').replaceChildren(...(model.warnings||[]).map(w=>{const li=document.createElement('li');li.textContent=w;return li;}));
  $('warningPanel').hidden=!(model.warnings||[]).length;$('warningTitle').textContent=`结构说明 · ${(model.warnings||[]).length} 项`;
  if(!model.cell)state.cell=false;
  syncControls();elementControls();selectionChanged();
}
function edit(action){if(!model||busy)return;const before=clone(snapshot());try{action();edits.push(before);invalidateCoordination(model);refreshModel();status('修改已应用，可撤销。','success');}catch(e){({model,state}=before);selected=new Set([...selected].filter(i=>i<model.atoms.length));refreshModel();status(e.message,'error');}}
function requireSelection(){if(!selected.size)throw Error('请先选择原子。');return [...selected];}
function validateExtraState(s){
  for(const [k,lo,hi] of [['perspective',0,1],['depthFade',0,.9],['depthOpacity',0,.8],['focus',-1,1],['focusWidth',0,2],['blur',0,12],['polyCutoff',.1,10],['polyOpacity',.05,1],['polyLight',0,1]])if(!Number.isFinite(s[k])||s[k]<lo||s[k]>hi)throw Error('景深或配位参数无效。');
  if(!['auto','element','selection'].includes(s.polyScope)||!['bonds','distance'].includes(s.polyMethod)||!/^#[0-9a-f]{6}$/i.test(s.polyColor)||!Array.isArray(s.polyCenters)||s.polyCenters.length>4000||!s.polyCenters.every(v=>Number.isInteger(v)&&v>=0&&v<4000))throw Error('配位设置无效。');
  if(s.frame&&(!Array.isArray(s.frame.center)||s.frame.center.length!==3||!s.frame.center.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5)||!Number.isFinite(s.frame.bound)||s.frame.bound<=0||s.frame.bound>1e6))throw Error('视图范围无效。');
  // Require an orthonormal camera; inversion for dragging is its transpose.
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs([0,1,2].reduce((v,k)=>v+s.rotation[i*3+k]*s.rotation[j*3+k],0)-(i===j?1:0))>.01)throw Error('旋转矩阵无效。');
}
const catalogReady=api('/api/elements',{}).then(r=>r.json()).then(value=>{catalog=value;options('newElement',Object.keys(catalog));$('newElement').value='C';}).catch(e=>status('元素数据加载失败：'+e.message,'error'));
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(v=>v.classList.toggle('active',v===b));vp.dataset.tool=tool;document.querySelector('.canvas-bottom span').textContent=tool==='rotate'?'拖动旋转 · 滚轮缩放 · Shift 绕 Z 轴':'Shift 多选 · 移动模式拖动原子 · Alt 沿视线移动';});
$('undo').onclick=()=>restore(edits.undo(snapshot()));$('redo').onclick=()=>restore(edits.redo(snapshot()));
$('newModel').onclick=()=>{if(model&&!confirm('新建会替换当前结构。请先保存需要的项目。继续？'))return;model={name:'Untitled structure',atoms:[],bonds:[],elements:{},warnings:[],cell:null};source=null;state=defaults();selected.clear();edits.clear();refreshModel();$('editPanel').open=true;};
$('selectAll').onclick=()=>{if(model)selected=new Set(model.atoms.map((a,i)=>i));selectionChanged();};
$('clearSelection').onclick=()=>{selected.clear();selectionChanged();};
$('selectByElement').onclick=()=>{if(model)selected=new Set(model.atoms.flatMap((a,i)=>a.element===$('selectElement').value?[i]:[]));selectionChanged();};
$('selectConnected').onclick=()=>{if(!model)return;let changed=true;while(changed){changed=false;for(const b of model.bonds)if(selected.has(b.a)!==selected.has(b.b)){selected.add(b.a);selected.add(b.b);changed=true;}}selectionChanged();};
$('deleteAtoms').onclick=()=>edit(()=>{const ids=requireSelection(),removed=new Set(ids);state.polyCenters=state.polyCenters.filter(i=>!removed.has(i)).map(i=>i-ids.filter(j=>j<i).length);removeAtoms(model,ids);selected.clear();});
$('applyPosition').onclick=()=>edit(()=>{const ids=requireSelection(),target=['posX','posY','posZ'].map(id=>Number($(id).value));const center=[0,1,2].map(k=>ids.reduce((s,i)=>s+model.atoms[i].xyz[k],0)/ids.length);moveAtoms(model,ids,target.map((v,k)=>v-center[k]));});
$('addAtom').onclick=()=>edit(()=>{const xyz=['posX','posY','posZ'].map(id=>Number($(id).value));selected=new Set([addAtom(model,$('newElement').value,xyz,catalog)]);});
$('changeElement').onclick=()=>edit(()=>{const ids=requireSelection(),element=$('newElement').value;if(!Object.hasOwn(catalog,element))throw Error('元素无效。');model.elements[element]??={...catalog[element],count:0};for(const i of ids){model.atoms[i].element=element;model.atoms[i].label=element+(i+1);}});
$('assignPart').onclick=()=>edit(()=>{const ids=requireSelection(),name=$('partName').value.trim();if(!name)throw Error('请输入片段名称。');for(const i of ids)model.atoms[i].part=name;});
$('parts').onchange=()=>{if(!model)return;selected=new Set(model.atoms.flatMap((a,i)=>a.part&&a.part===$('parts').value?[i]:[]));selectionChanged();};
$('applyLocal').onclick=()=>edit(()=>{const ids=requireSelection(),style=$('localStyle').value;const value=validateStyle({style,atomDimension:$('localDimension').value,bondAppearance:$('localBond').value,scale:Number($('localScale').value),radius:style==='space'?'vdw':'covalent',...($('useLocalColor').checked?{color:$('localColor').value}:{})});for(const i of ids){model.atoms[i].appearance={...model.atoms[i].appearance,...value};if(!$('useLocalColor').checked)delete model.atoms[i].appearance.color;}});
$('clearLocal').onclick=()=>edit(()=>{for(const i of requireSelection())model.atoms[i].appearance={};});
$('hideSelected').onclick=()=>edit(()=>{for(const i of requireSelection())model.atoms[i].appearance={...model.atoms[i].appearance,hidden:true};selected.clear();});
$('showAll').onclick=()=>edit(()=>{state.hideH=false;for(const a of model.atoms)if(a.appearance)delete a.appearance.hidden;});
$('applyBond').onclick=()=>edit(()=>setBond(model,requireSelection(),Number($('bondOrder').value)));
$('inferEdited').onclick=async()=>{if(!model||busy||!confirm('将按当前坐标重建全部连接，并替换原来的键级。继续？'))return;busy=true;render();try{const bonds=await(await api('/api/rebond',{atoms:model.atoms,factor:Number($('bondFactor').value)})).json();remember();model.bonds=bonds;refreshModel();status('已按当前坐标重建连接，键级均为单键。','success');}catch(e){status(e.message,'error');}finally{busy=false;render();}};
$('exportXYZ').onclick=()=>{if(!model)return;download(new Blob([model.atoms.length+'\nAtomWeft edited coordinates (angstrom)\n'+model.atoms.map(a=>a.element+' '+a.xyz.map(v=>v.toFixed(8)).join(' ')).join('\n')+'\n'],{type:'text/plain'}),'structure-edited.xyz');};
for(const id of ['perspective','depthFade','depthOpacity','focus','focusWidth','blur','polyEnabled','polyScope','polyElement','polyLigand','polyMethod','polyCutoff','polyOpacity','polyColor','polyLight']){
  $(id).onfocus=remember;
  $(id).oninput=()=>{const el=$(id),value=el.type==='checkbox'?el.checked:['range','number'].includes(el.type)?Number(el.value):el.value;const next={...state,[id]:value};try{validateExtraState(next);state=next;syncControls();render();}catch{}};
}
for(const id of ['atomScale','bondWidth','radius','atomDimension','bondAppearance','labels','hideH','cell'])$(id).addEventListener('focus',remember);
$('setPolyCenters').onclick=()=>edit(()=>{state.polyCenters=requireSelection();state.polyScope='selection';state.polyEnabled=true;});
$('focusSelection').onclick=()=>edit(()=>{const ids=new Set(requireSelection()),atoms=(scene.atoms||[]).filter(a=>ids.has(a.index));if(!atoms.length)throw Error('选中原子不可见。');const z=atoms.reduce((s,a)=>s+a.z,0)/atoms.length;state.focus=Math.max(-1,Math.min(1,2*(z-scene.camera.depthMin)/(scene.camera.depthMax-scene.camera.depthMin)-1));if(!state.blur)state.blur=4;});
$('resetDepth').onclick=()=>edit(()=>{for(const k of ['perspective','depthFade','depthOpacity','focus','focusWidth','blur'])state[k]=defaults()[k];});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click();}if(e.key==='Delete'&&document.activeElement===vp){e.preventDefault();$('deleteAtoms').click();}});
const ethanol=`9\nEthanol - illustrative 3D coordinates\nC -0.750 0.000 0.000\nC 0.750 0.000 0.000\nO 1.350 1.180 0.450\nH -1.130 -0.520 0.880\nH -1.130 -0.520 -0.880\nH -1.130 1.020 0.000\nH 1.130 -0.820 0.620\nH 1.130 -0.150 -1.020\nH 2.270 1.120 0.180\n`;
const crystal=`data_Si\n_cell_length_a 5.43\n_cell_length_b 5.43\n_cell_length_c 5.43\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_space_group_name_H-M_alt 'F d -3 m'\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\nSi1 Si 0.125 0.125 0.125\n`;
$('demo').onclick=()=>loadSource({name:'ethanol.xyz',text:ethanol});
$('crystalDemo').onclick=()=>loadSource({name:'silicon.cif',text:crystal});
syncControls();render();
