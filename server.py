# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
"""Loopback-only server. All molecular data remains on this computer."""
import bootstrap
import argparse
import json
import mimetypes
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from chemistry import parse_structure, PT, COLORS, atom, infer_bonds
from powerpoint import make_pptx, insert_current

TOKEN=secrets.token_urlsafe(32)
INSERT_LOCK=threading.Lock()
ROOT=bootstrap.ROOT


class Handler(BaseHTTPRequestHandler):
    def respond(self,status,data,ctype='application/json; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'")
        self.end_headers();self.wfile.write(data)

    def valid_host(self):
        return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'

    def do_GET(self):
        if not self.valid_host():
            return self.respond(403,b'{}')
        route=urlsplit(self.path).path
        paths={'/':'index.html',**{f'/{f}':f for f in ('app.js','scene.js','style.css','editing.js','polyhedra.js','depth.js')}}
        if route not in paths:return self.respond(404,b'{}')
        p=ROOT/'web'/paths[route]
        mime={'html':'text/html','js':'text/javascript','css':'text/css'}[p.suffix[1:]]
        self.respond(200,p.read_bytes(),mime+'; charset=utf-8')

    def do_POST(self):
        if not self.valid_host() or not secrets.compare_digest(self.headers.get('X-AtomWeft-Token',''),TOKEN):
            return self.respond(403,json.dumps({'error':'会话已失效，请从启动入口重新打开。'},ensure_ascii=False).encode())
        if self.headers.get('Origin') not in (None,f'http://127.0.0.1:{self.server.server_port}'):
            return self.respond(403,b'{}')
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=20*1024*1024:raise ValueError('请求大小超过限制。')
            data=json.loads(self.rfile.read(size))
            if self.path=='/api/parse':
                result=parse_structure(data['name'],data['text'],data.get('options'))
            elif self.path=='/api/elements':
                result={PT.GetElementSymbol(i):dict(number=i,color=COLORS.get(PT.GetElementSymbol(i),'#91A4B4'),scale=1,covalent=PT.GetRcovalent(i),vdw=PT.GetRvdw(i)) for i in range(1,119)}
            elif self.path=='/api/rebond':
                values=data.get('atoms');factor=data.get('factor',1.2)
                if not isinstance(values,list) or len(values)>4000 or type(factor) not in (int,float) or not .8<=factor<=1.6:raise ValueError('原子数或成键阈值无效。')
                atoms=[atom(v['element'],v['xyz']) for v in values]
                if any(len(a['xyz'])!=3 for a in atoms):raise ValueError('原子坐标必须有三个分量。')
                result=infer_bonds(atoms,factor)
                if len(result)>16000:raise ValueError('连接过多，请检查原子间距。')
            elif self.path=='/api/pptx':
                return self.respond(200,make_pptx(data['scene']),'application/vnd.openxmlformats-officedocument.presentationml.presentation')
            elif self.path=='/api/insert':
                if not INSERT_LOCK.acquire(blocking=False):raise ValueError('已有插入任务正在执行。')
                try:result=insert_current(data['scene'])
                finally:INSERT_LOCK.release()
            else:return self.respond(404,b'{}')
            self.respond(200,json.dumps(result,ensure_ascii=False,allow_nan=False).encode())
        except Exception as e:
            msg=str(e) if isinstance(e,(ValueError,RuntimeError)) else f'处理失败：{type(e).__name__}。请检查结构文件或 PowerPoint 状态。'
            self.respond(400,json.dumps({'error':msg},ensure_ascii=False).encode())

    def log_message(self,fmt,*args):
        pass


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--port',type=int,default=0)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    server.daemon_threads=True
    url=f'http://127.0.0.1:{server.server_port}/#token={TOKEN}'
    print(url,flush=True)
    if not args.no_browser:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()


if __name__=='__main__':main()
