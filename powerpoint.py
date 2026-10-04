# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
"""Export editable DrawingML and insert the exact same scene via Windows COM."""
import bootstrap  # noqa: F401
import io
import math
import re
import zipfile
from xml.sax.saxutils import escape, quoteattr

A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
EMU = 12700


def validate_scene(scene):
    if not isinstance(scene, dict) or scene.get('width') != 960 or scene.get('height') != 540:
        raise ValueError('无效的画布尺寸。')
    items = scene.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 30000:
        raise ValueError('导出要求 1–30000 个图形，请减少结构大小。')
    for s in items:
        kind = s.get('kind')
        keys = {'circle':['x','y','r'], 'ellipse':['x','y','rx','ry'],
                'rect':['x','y','width','height'], 'line':['x1','y1','x2','y2','width'],
                'text':['x','y','width','height','font'],'polygon':[]}.get(kind)
        if keys is None or not re.fullmatch(r'#[0-9a-fA-F]{6}', s.get('color','')):
            raise ValueError('图形类型或颜色无效。')
        for key in keys:
            v = s.get(key)
            if type(v) not in (int, float) or not math.isfinite(v) or abs(v)>100000:
                raise ValueError('图形坐标无效。')
            if key in ('width','height','r','rx','ry','font') and v <= 0:
                raise ValueError('图形尺寸必须大于零。')
        if kind=='polygon':
            points=s.get('points')
            if not isinstance(points,list) or not 3<=len(points)<=24 or not all(isinstance(p,list) and len(p)==2 and all(type(v) in (int,float) and math.isfinite(v) and abs(v)<=100000 for v in p) for p in points):
                raise ValueError('多面体面的顶点无效。')
            area=sum(p[0]*points[(i+1)%len(points)][1]-p[1]*points[(i+1)%len(points)][0] for i,p in enumerate(points))
            if abs(area)<1e-6:raise ValueError('多面体面投影退化。')
        for key,low,high in [('rotation',-360,360),('strokeWidth',0,1000),('opacity',0,1),('softEdge',0,12)]:
            if key in s and (type(s[key]) not in (int,float) or not math.isfinite(s[key]) or not low<=s[key]<=high):
                raise ValueError('图形旋转或描边参数无效。')
        if 'stroke' in s and not re.fullmatch(r'#[0-9a-fA-F]{6}',s['stroke']):
            raise ValueError('描边颜色无效。')
        if 'gradient' in s:
            g=s['gradient']
            if kind not in ('circle','ellipse','rect','polygon') or not isinstance(g,dict):
                raise ValueError('渐变仅适用于基础形状。')
            angle=g.get('angle')
            stops=g.get('stops')
            if type(angle) not in (float,int) or not math.isfinite(angle) or not 0<=angle<360 or not isinstance(stops,list) or not 2<=len(stops)<=8:
                raise ValueError('渐变参数无效。')
            last=-1
            for stop in stops:
                pos=stop.get('position');alpha=stop.get('opacity',1)
                if type(pos) not in (int,float) or not math.isfinite(pos) or not 0<=pos<=1 or pos<=last:
                    raise ValueError('渐变色标须按位置递增。')
                if type(alpha) not in (int,float) or not math.isfinite(alpha) or not 0<=alpha<=1 or not re.fullmatch(r'#[0-9a-fA-F]{6}',stop.get('color','')):
                    raise ValueError('渐变颜色或透明度无效。')
                last=pos
            if stops[0]['position']!=0 or stops[-1]['position']!=1:
                raise ValueError('渐变须包含起点和终点。')
        if len(str(s.get('name',''))) > 250 or len(str(s.get('text',''))) > 100:
            raise ValueError('图形标签过长。')
    return scene


def _e(v):
    return str(round(v * EMU))


def _fill_xml(s):
    if not s.get('gradient'):
        return f'<a:solidFill><a:srgbClr val="{s["color"][1:]}"><a:alpha val="{round(s.get("opacity",1)*100000)}"/></a:srgbClr></a:solidFill>'
    g=s['gradient']
    stops=''.join(f'<a:gs pos="{round(t["position"]*100000)}"><a:srgbClr val="{t["color"][1:]}">'
                  f'<a:alpha val="{round(t.get("opacity",1)*s.get("opacity",1)*100000)}"/></a:srgbClr></a:gs>' for t in g['stops'])
    return f'<a:gradFill rotWithShape="1"><a:gsLst>{stops}</a:gsLst><a:lin ang="{round(g["angle"]*60000)}" scaled="1"/><a:tileRect/></a:gradFill>'


def _outline_xml(s):
    width=s.get('strokeWidth',.6 if s['kind']=='circle' else 0)
    if not width:return '<a:ln><a:noFill/></a:ln>'
    color=s.get('stroke','#334155')[1:]
    return f'<a:ln w="{_e(width)}"><a:solidFill><a:srgbClr val="{color}"><a:alpha val="{round(s.get("opacity",1)*100000)}"/></a:srgbClr></a:solidFill></a:ln>'


def _shape(s, sid):
    kind = s['kind']
    name = quoteattr(str(s.get('name',f'Shape {sid}')))
    fill = _fill_xml(s)
    flip = f' rot="{round((s.get("rotation",0)%360)*60000)}"' if s.get('rotation') else ''
    if kind in ('circle','ellipse','rect'):
        if kind=='circle':
            x,y,w,h = s['x']-s['r'],s['y']-s['r'],s['r']*2,s['r']*2
        elif kind=='ellipse':
            x,y,w,h = s['x']-s['rx'],s['y']-s['ry'],s['rx']*2,s['ry']*2
        else:
            x,y,w,h=(s[k] for k in ('x','y','width','height'))
        preset='rect' if kind=='rect' else 'ellipse'
        geometry = f'<a:prstGeom prst="{preset}"><a:avLst/></a:prstGeom>'
        style = fill + _outline_xml(s)
    elif kind == 'polygon':
        points=s['points'];x=min(p[0] for p in points);y=min(p[1] for p in points)
        w=max(p[0] for p in points)-x;h=max(p[1] for p in points)-y
        nodes=f'<a:moveTo><a:pt x="{_e(points[0][0]-x)}" y="{_e(points[0][1]-y)}"/></a:moveTo>'
        nodes+=''.join(f'<a:lnTo><a:pt x="{_e(p[0]-x)}" y="{_e(p[1]-y)}"/></a:lnTo>' for p in points[1:])+'<a:close/>'
        geometry=f'<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="{_e(w)}" h="{_e(h)}">{nodes}</a:path></a:pathLst></a:custGeom>'
        style=fill+_outline_xml(s)
    elif kind == 'line':
        x,y = min(s['x1'],s['x2']),min(s['y1'],s['y2'])
        w,h = abs(s['x2']-s['x1']),abs(s['y2']-s['y1'])
        flip = f' flipH="{int(s["x2"]<s["x1"])}" flipV="{int(s["y2"]<s["y1"])}"'
        geometry = '<a:prstGeom prst="line"><a:avLst/></a:prstGeom>'
        dash = '<a:prstDash val="dash"/>' if s.get('dash') else '<a:prstDash val="solid"/>'
        style = f'<a:noFill/><a:ln w="{_e(s["width"])}" cap="flat">{fill}{dash}</a:ln>'
    else:
        x,y,w,h = (s[k] for k in ('x','y','width','height'))
        geometry = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        style = '<a:noFill/><a:ln><a:noFill/></a:ln>'
    text = ''
    if s.get('softEdge'):style+=f'<a:effectLst><a:softEdge rad="{_e(s["softEdge"])}"/></a:effectLst>'
    if kind == 'text':
        text = (f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>'
                f'<a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="{round(s["font"]*100)}">'
                f'{fill}<a:latin typeface="Arial"/></a:rPr><a:t>{escape(s["text"])}</a:t></a:r></a:p></p:txBody>')
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name={name}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm{flip}><a:off x="{_e(x)}" y="{_e(y)}"/>'
            f'<a:ext cx="{_e(w)}" cy="{_e(h)}"/></a:xfrm>{geometry}{style}</p:spPr>{text}</p:sp>')


def _rels(entries):
    return ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
            ''.join(f'<Relationship Id="rId{i}" Type="{R}/{kind}" Target="{target}"/>'
                    for i,kind,target in entries)+'</Relationships>')


def _group_header(sid=1, name=''):
    return (f'<p:nvGrpSpPr><p:cNvPr id="{sid}" name={quoteattr(name)}/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            f'<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{_e(960)}" cy="{_e(540)}"/>'
            f'<a:chOff x="0" y="0"/><a:chExt cx="{_e(960)}" cy="{_e(540)}"/></a:xfrm></p:grpSpPr>')


def make_pptx(scene):
    validate_scene(scene)
    ns = f'xmlns:a="{A}" xmlns:p="{P}" xmlns:r="{R}"'
    slide = (f'<p:sld {ns}><p:cSld><p:spTree>{_group_header()}'
             f'<p:grpSp>{_group_header(2,"AtomWeft — editable molecule")}'
             + ''.join(_shape(s,i+3) for i,s in enumerate(scene['items']))
             + '</p:grpSp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')
    presentation = (f'<p:presentation {ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/>'
                    '</p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'
                    f'<p:sldSz cx="{_e(960)}" cy="{_e(540)}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
    cmap = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    master = (f'<p:sldMaster {ns}><p:cSld><p:spTree>{_group_header()}</p:spTree></p:cSld>{cmap}'
              '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
              '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>')
    layout = f'<p:sldLayout {ns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{_group_header()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    colors = dict(dk1='000000',lt1='FFFFFF',dk2='24334C',lt2='F4F6FA',accent1='2563EB',accent2='EF5350',accent3='62C97B',accent4='E9BE3C',accent5='9258CC',accent6='EF9740',hlink='0563C1',folHlink='954F72')
    scheme = ''.join(f'<a:{k}><a:srgbClr val="{v}"/></a:{k}>' for k,v in colors.items())
    solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    theme = (f'<a:theme xmlns:a="{A}" name="AtomWeft"><a:themeElements><a:clrScheme name="AtomWeft">{scheme}</a:clrScheme>'
             '<a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
             '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
             f'<a:fmtScheme name="AtomWeft"><a:fillStyleLst>{solid*3}</a:fillStyleLst><a:lnStyleLst>'
             + ''.join(f'<a:ln w="{w}" cap="flat">{solid}<a:prstDash val="solid"/></a:ln>' for w in (6350,12700,19050))
             + f'</a:lnStyleLst><a:effectStyleLst>{"<a:effectStyle><a:effectLst/></a:effectStyle>"*3}</a:effectStyleLst>'
             f'<a:bgFillStyleLst>{solid*3}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>')
    files = {
        '_rels/.rels':_rels([(1,'officeDocument','ppt/presentation.xml')]),
        'ppt/presentation.xml':presentation,
        'ppt/_rels/presentation.xml.rels':_rels([(1,'slideMaster','slideMasters/slideMaster1.xml'),(2,'slide','slides/slide1.xml')]),
        'ppt/slides/slide1.xml':slide,
        'ppt/slides/_rels/slide1.xml.rels':_rels([(1,'slideLayout','../slideLayouts/slideLayout1.xml')]),
        'ppt/slideMasters/slideMaster1.xml':master,
        'ppt/slideMasters/_rels/slideMaster1.xml.rels':_rels([(1,'slideLayout','../slideLayouts/slideLayout1.xml'),(2,'theme','../theme/theme1.xml')]),
        'ppt/slideLayouts/slideLayout1.xml':layout,
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels':_rels([(1,'slideMaster','../slideMasters/slideMaster1.xml')]),
        'ppt/theme/theme1.xml':theme,
    }
    types = {'presentation':'presentationml.presentation.main','slide':'presentationml.slide',
             'slideMaster':'presentationml.slideMaster','slideLayout':'presentationml.slideLayout','theme':'theme'}
    overrides = [('ppt/presentation.xml','presentation'),('ppt/slides/slide1.xml','slide'),
                 ('ppt/slideMasters/slideMaster1.xml','slideMaster'),('ppt/slideLayouts/slideLayout1.xml','slideLayout'),('ppt/theme/theme1.xml','theme')]
    files['[Content_Types].xml'] = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>' +
        ''.join(f'<Override PartName="/{path}" ContentType="application/vnd.openxmlformats-officedocument.{types[t]}+xml"/>' for path,t in overrides)+'</Types>')
    out = io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
        for path,data in files.items():
            archive.writestr(path, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+data)
    return out.getvalue()


def insert_current(scene):
    validate_scene(scene)
    if len(scene['items']) > 8000:
        raise ValueError('直接插入最多 8000 个图形；请隐藏氢或改用导出 PPTX。')
    import pythoncom
    import win32com.client
    # CoInitializeEx balances nested calls even on an already initialized main thread.
    pythoncom.CoInitializeEx(pythoncom.COINIT_APARTMENTTHREADED)
    created = []
    app = slide = None
    try:
        try:
            app = win32com.client.GetActiveObject('PowerPoint.Application')
            slide = app.ActiveWindow.View.Slide
            presentation = app.ActivePresentation
            slide_index = slide.SlideIndex
        except Exception as e:
            raise ValueError('请先打开桌面版 PowerPoint，在普通编辑视图中选择一张幻灯片。') from e
        scale = min(presentation.PageSetup.SlideWidth/960,presentation.PageSetup.SlideHeight/540)
        ox=(presentation.PageSetup.SlideWidth-960*scale)/2
        oy=(presentation.PageSetup.SlideHeight-540*scale)/2
        names = []
        import uuid
        prefix='AtomWeft_'+uuid.uuid4().hex[:8]+'_'
        for i,s in enumerate(scene['items']):
            if s['kind'] in ('circle','ellipse','rect'):
                if s['kind']=='circle':
                    x,y,w,h=s['x']-s['r'],s['y']-s['r'],2*s['r'],2*s['r']
                elif s['kind']=='ellipse':
                    x,y,w,h=s['x']-s['rx'],s['y']-s['ry'],2*s['rx'],2*s['ry']
                else:
                    x,y,w,h=(s[k] for k in ('x','y','width','height'))
                shape=slide.Shapes.AddShape(1 if s['kind']=='rect' else 9,ox+x*scale,oy+y*scale,w*scale,h*scale)
                created.append(shape)
                if s.get('rotation'):shape.Rotation=s['rotation']%360
                _native_fill(shape.Fill,s)
                width=s.get('strokeWidth',.6 if s['kind']=='circle' else 0)
                if width:
                    shape.Line.Visible=-1
                    shape.Line.ForeColor.RGB=_rgb(s.get('stroke','#334155'));shape.Line.Weight=width*scale
                else:shape.Line.Visible=0
            elif s['kind']=='polygon':
                points=s['points']
                builder=slide.Shapes.BuildFreeform(1,ox+points[0][0]*scale,oy+points[0][1]*scale)
                for point in points[1:]+points[:1]:builder.AddNodes(0,0,ox+point[0]*scale,oy+point[1]*scale)
                shape=builder.ConvertToShape();created.append(shape)
                _native_fill(shape.Fill,s)
                shape.Line.Visible=-1 if s.get('strokeWidth',0) else 0
                shape.Line.ForeColor.RGB=_rgb(s.get('stroke',s['color']));shape.Line.Weight=s.get('strokeWidth',.8)*scale
            elif s['kind']=='line':
                shape=slide.Shapes.AddLine(ox+s['x1']*scale,oy+s['y1']*scale,ox+s['x2']*scale,oy+s['y2']*scale)
                created.append(shape)
                shape.Line.ForeColor.RGB=_rgb(s['color']);shape.Line.Weight=s['width']*scale
                if s.get('dash'):shape.Line.DashStyle=4
            else:
                shape=slide.Shapes.AddTextbox(1,ox+s['x']*scale,oy+s['y']*scale,s['width']*scale,s['height']*scale)
                created.append(shape)
                tf=shape.TextFrame
                tf.AutoSize=0
                tf.MarginLeft=tf.MarginRight=tf.MarginTop=tf.MarginBottom=0
                tf.VerticalAnchor=3;tf.WordWrap=0
                tf.Ruler.Levels(1).FirstMargin=0
                tf.Ruler.Levels(1).LeftMargin=0
                tf.TextRange.Text=s['text'];tf.TextRange.Font.Name='Arial'
                tf.TextRange.Font.Size=s['font']*scale;tf.TextRange.Font.Color.RGB=_rgb(s['color'])
                tf.TextRange.ParagraphFormat.Bullet.Visible=0
                tf.TextRange.ParagraphFormat.Alignment=2
            if s.get('opacity') is not None:
                shape.Line.Transparency=1-s['opacity']
                if s['kind']=='text':shape.TextFrame2.TextRange.Font.Fill.Transparency=1-s['opacity']
            if s.get('softEdge'):shape.SoftEdge.Radius=s['softEdge']*scale
            shape.Name=prefix+str(i+1)+' '+s.get('name','')
            shape.AlternativeText=s.get('name','')
            names.append(shape.Name)
        if len(names)>1:
            group=slide.Shapes.Range(names).Group()
            group.Name=prefix+str(scene.get('title','Molecule'))[:80]
        return dict(slide=slide_index,count=len(names))
    except Exception:
        # Failure must not leave a half-inserted structure on the user's slide.
        for shape in reversed(created):
            try:shape.Delete()
            except Exception:pass
        raise
    finally:
        created.clear();app=slide=None
        pythoncom.CoUninitialize()


def _rgb(color):
    r,g,b=(int(color[i:i+2],16) for i in (1,3,5))
    return r | (g<<8) | (b<<16)


def _native_fill(fill,s):
    if not s.get('gradient'):
        fill.Solid();fill.ForeColor.RGB=_rgb(s['color']);fill.Transparency=1-s.get('opacity',1)
        return
    g=s['gradient']
    fill.TwoColorGradient(1,1)
    fill.GradientAngle=g['angle']
    stops=fill.GradientStops
    while stops.Count>2:stops.Delete(stops.Count-1)
    for index,t in ((1,g['stops'][0]),(2,g['stops'][-1])):
        stop=stops.Item(index)
        stop.Position=t['position'];stop.Color.RGB=_rgb(t['color']);stop.Transparency=1-t.get('opacity',1)*s.get('opacity',1)
    for index,t in enumerate(g['stops'][1:-1],2):
        stops.Insert(_rgb(t['color']),t['position'],1-t.get('opacity',1)*s.get('opacity',1),index)
