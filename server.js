const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'user-data');
const APPS = path.join(DATA, 'Apps');
const DOWNLOADS = path.join(DATA, 'Downloads');
const MEDIA = path.join(DATA, 'Media');
const CLOUD = path.join(DATA, 'Cloud');
for (const d of [DATA, APPS, DOWNLOADS, MEDIA, CLOUD]) fs.mkdirSync(d, {recursive:true});

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.txt':'text/plain; charset=utf-8'
};

function safeName(name) { return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0,140); }
function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    const p = path.join(dir,e.name);
    if (e.isDirectory()) return walk(p,base);
    return [{name:e.name, path:'/'+path.relative(base,p).replaceAll(path.sep,'/'), size:fs.statSync(p).size}];
  });
}
function json(res, code, data) { const s=JSON.stringify(data); res.writeHead(code, {'Content-Type':mime['.json'], 'Cache-Control':'no-store'}); res.end(s); }
function parseBody(req) { return new Promise((resolve,reject)=>{ let b=''; req.on('data',c=>{b+=c; if(b.length>2e6){req.destroy();reject(new Error('body too large'))}}); req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}}); }); }
function downloadFile(urlStr, dest) { return new Promise((resolve,reject)=>{
  const u=new URL(urlStr); if(!['http:','https:'].includes(u.protocol)) return reject(new Error('Only HTTP/HTTPS URLs are allowed'));
  const lib=u.protocol==='https:'?https:require('http');
  lib.get(u,{headers:{'User-Agent':'XboxS-Simulator/0.2'}},r=>{
    if(r.statusCode>=300&&r.statusCode<400&&r.headers.location) return downloadFile(new URL(r.headers.location,u).toString(),dest).then(resolve,reject);
    if(r.statusCode!==200) return reject(new Error(`Download failed: HTTP ${r.statusCode}`));
    const file=fs.createWriteStream(dest); let total=Number(r.headers['content-length']||0), received=0;
    r.on('data',c=>{received+=c.length}); r.pipe(file); file.on('finish',()=>file.close(()=>resolve({total,received}))); file.on('error',e=>{try{fs.unlinkSync(dest)}catch{};reject(e)});
  }).on('error',reject);
}); }

function start(port=0) {
  const srv=http.createServer(async (req,res)=>{
    try{
      const u=new URL(req.url,'http://127.0.0.1');
      if(u.pathname==='/api/status') return json(res,200,{ok:true,online:true,time:new Date().toISOString(),storage:{apps:walk(APPS),downloads:walk(DOWNLOADS),media:walk(MEDIA),cloud:walk(CLOUD)}});
      if(u.pathname==='/api/storage') return json(res,200,{apps:walk(APPS),downloads:walk(DOWNLOADS),media:walk(MEDIA),cloud:walk(CLOUD)});
      if(req.method==='POST' && u.pathname==='/api/folder'){
        const body=await parseBody(req); const name=safeName(body.name||'New App'); const dir=path.join(APPS,name); fs.mkdirSync(path.join(dir,'files'),{recursive:true}); fs.mkdirSync(path.join(dir,'media'),{recursive:true}); fs.mkdirSync(path.join(dir,'cache'),{recursive:true}); return json(res,200,{ok:true,folder:`/Apps/${name}`,path:dir});
      }
      if(req.method==='POST' && u.pathname==='/api/download'){
        const body=await parseBody(req); const url=String(body.url||''); const name=safeName(body.name||path.basename(new URL(url).pathname)||crypto.randomUUID()); const dest=path.join(DOWNLOADS,name);
        const info=await downloadFile(url,dest); return json(res,200,{ok:true,name,path:`/Downloads/${name}`,bytes:info.received});
      }
      if(req.method==='POST' && u.pathname==='/api/cloud/sync'){
        const manifest={syncedAt:new Date().toISOString(),apps:walk(APPS),downloads:walk(DOWNLOADS),media:walk(MEDIA)}; fs.writeFileSync(path.join(CLOUD,'manifest.json'),JSON.stringify(manifest,null,2)); return json(res,200,{ok:true,count:manifest.apps.length+manifest.downloads.length+manifest.media.length});
      }
      let filePath = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath=path.join(ROOT,'index.html');
      const ext=path.extname(filePath).toLowerCase(); res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(filePath).pipe(res);
    }catch(e){json(res,500,{ok:false,error:e.message})}
  });
  return new Promise(resolve=>srv.listen(port,'127.0.0.1',()=>resolve({port:srv.address().port,close:()=>srv.close()})));
}
module.exports={start};
if(require.main===module) start(Number(process.env.PORT||8080)).then(x=>console.log(`Xbox S simulator online: http://127.0.0.1:${x.port}`));
