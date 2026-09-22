const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {fork}=require('node:child_process');
const D=require('../mobile/devices.cjs');
const {apps}=require('../mobile/apps.cjs');
const {writeReview}=require('../mobile/review.cjs');
function createServer({root=path.join(os.homedir(),'BugDrop Captures'),discover=D.discover,listApps=apps,captureDesktopScreenshot=null,selectDesktopApp=null,desktopVideoAvailable=false}={}){
 const token=randomBytes(32).toString('hex');let current=null,proc=null,tail='',pending=false;const captures=new Map();
 const adaptDesktopReport=report=>{
  if(report?.source!=='desktop'||!selectDesktopApp)return report;
  report.limitations=String(report.limitations||'').replace('explicit full-desktop screenshots','explicit selected-app window screenshots').replace('Screenshots may include other visible apps and displays.','Screenshots contain the selected app window.').replace('Desktop interactions, network requests, and video are not captured.','Desktop interactions and network requests are not captured. Video is available when selected at capture start.');
  return report;
 };
 const listReports=()=>{
  if(!fs.existsSync(root))return [];
  const reports=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
   if(!entry.isDirectory()||!entry.name.startsWith('capture-'))continue;
   const dir=path.join(root,entry.name);
   try{
    const report=JSON.parse(fs.readFileSync(path.join(dir,'draft.json'),'utf8'));
    if(!report.endedAt||!/^[0-9a-f-]{36}$/i.test(report.id)||!fs.statSync(path.join(dir,'review.html')).isFile())continue;
    const statusFile=path.join(dir,'status.json');let solved=false;
    try{solved=JSON.parse(fs.readFileSync(statusFile,'utf8')).solved===true;}catch{}
    captures.set(report.id,{dir});
    reports.push({id:report.id,title:String(report.title||'Untitled report').slice(0,160),source:report.source,app:report.environment?.app||'',startedAt:report.startedAt,endedAt:report.endedAt,events:Array.isArray(report.events)?report.events.length:0,solved,review:'/capture/'+report.id+'/review.html?key='+token});
   }catch{}
  }
  return reports.sort((a,b)=>b.startedAt-a.startedAt);
 };
 const base=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(req.headers.host!==new URL(origin).host)return send(403,{error:'Invalid host'});
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Foreign origin'});
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/reports')){
   const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replace('__TOKEN__',token).replace('BugDrop · App recorder','Patchmason · App recorder').replace('<span class="mark">b</span>bugdrop','<img src="/patchmason-mark.svg" alt="" width="32" height="32">patchmason');
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'"});return res.end(html);
  }
  const staticFiles={'/app.js':path.join(__dirname,'app.js'),'/ui.css':path.join(base,'extension/ui.css'),'/desktop.css':path.join(__dirname,'desktop.css'),'/patchmason-mark.svg':path.join(__dirname,'patchmason-mark.svg')};
  if(req.method==='GET'&&staticFiles[url.pathname]){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.svg')?'image/svg+xml':'text/css'});return res.end(fs.readFileSync(staticFiles[url.pathname]));}
  if(req.method==='GET'&&url.pathname.startsWith('/capture/')&&url.searchParams.get('key')===token){
   listReports();
   const parts=url.pathname.slice('/capture/'.length).split('/');
   const capture=captures.get(parts[0]);const name=parts[1];
   if(!capture||parts.length!==2)return send(404,{error:'Capture not found'});
   if(!/^(review\.html|screenshot-\d+\.png|recording\.(mp4|webm))$/.test(name))return send(404,{error:'Not found'});
   const file=path.join(capture.dir,name);if(!fs.existsSync(file))return send(404,{error:'Not ready'});
   const type=name.endsWith('.html')?'text/html':name.endsWith('.png')?'image/png':name.endsWith('.webm')?'video/webm':'video/mp4';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Frame-Options':'DENY'});
   if(name==='review.html'){let html=fs.readFileSync(file,'utf8');html=html.replace("preview.src=artifact.name;",`preview.src=artifact.name+'?key=${token}';`);html=html.replace('<main class="workspace">','<main class="workspace"><a class="review-back" href="/reports">← All bug reports</a>');return res.end(html);}return fs.createReadStream(file).pipe(res);
  }
  if(req.headers['x-bugdrop-token']!==token)return send(403,{error:'Missing session token'});
  try{
   if(req.method==='GET'&&url.pathname==='/api/devices')return send(200,{...await discover(),desktopVideoAvailable});
   if(req.method==='GET'&&url.pathname==='/api/reports')return send(200,{reports:listReports()});
   if(req.method==='GET'&&url.pathname==='/api/apps'){
    const {devices}=await discover();const device=devices.find(d=>d.id===url.searchParams.get('device'));if(!device)throw new Error('Device disconnected. Refresh devices.');return send(200,await listApps(device));
   }
   if(req.method==='GET'&&url.pathname==='/api/state')return send(200,{...current,output:tail,pending,desktopVideoAvailable,review:current?.report?.endedAt?'/capture/'+current.report.id+'/review.html?key='+token:null});
   if(req.method!=='POST')return send(404,{error:'Not found'});
   if(url.pathname==='/api/video'){
    if(!desktopVideoAvailable||!current?.videoRequested||!current?.report?.endedAt)throw new Error('No completed desktop video capture.');
    if(req.headers['content-type']!=='video/webm')throw new Error('Expected WebM video.');
    const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length<32||length>256*1024*1024)throw new Error('Video must be between 32 bytes and 256 MB.');
    const dir=current.dir;const report=current.report;
    if(report.artifacts.some(item=>item.name==='recording.webm'))throw new Error('Video has already been saved.');
    const destination=path.join(dir,'recording.webm');let written=0;
    const file=await fs.promises.open(destination,'wx',0o600);
    try{
     for await(const chunk of req){written+=chunk.length;if(written>length)throw new Error('Video length changed during upload.');let offset=0;while(offset<chunk.length){const result=await file.write(chunk,offset,chunk.length-offset);offset+=result.bytesWritten;}}
     if(written!==length)throw new Error('Incomplete video upload.');
     await file.close();
     report.artifacts.push({name:'recording.webm',kind:'video',ms:0});
     adaptDesktopReport(report);
     report.limitations=report.limitations.replace('Video is available when selected at capture start.','The optional video records only the selected app window.');
     fs.writeFileSync(path.join(dir,'draft.json'),JSON.stringify(report,null,2),{mode:0o600});writeReview(dir,report);
     return send(200,{ok:true});
    }catch(error){await file.close().catch(()=>{});try{fs.unlinkSync(destination);}catch{}throw error;}
   }
   let raw='';for await(const part of req){raw+=part;if(raw.length>8000)throw new Error('Request too large');}const data=JSON.parse(raw||'{}');
   if(url.pathname==='/api/target'){
    if(proc||pending)throw new Error('Cannot change the target during capture.');
    const {devices}=await discover();const device=devices.find(d=>d.id===data.device);
    if(!device)throw new Error('Device disconnected.');
    const selected=(await listApps(device)).find(item=>item.id===data.app);
    if(!selected)throw new Error('The selected app is no longer running.');
    if(device.platform==='desktop'&&selectDesktopApp)await selectDesktopApp(selected);
    return send(200,{ok:true});
   }
   if(url.pathname==='/api/start'){
    if(proc||pending)throw new Error('A capture is already running.');pending=true;
    try{
     const {devices}=await discover();const device=devices.find(d=>d.id===data.device);if(!device)throw new Error('Device disconnected.');
     const app=(await listApps(device)).find(a=>a.id===data.app);if(!app)throw new Error('Choose an installed app.');
     if(device.platform==='desktop'&&data.video===true&&!desktopVideoAvailable)throw new Error('Desktop video requires the Patchmason desktop app.');
     if(device.platform==='desktop'&&selectDesktopApp)await selectDesktopApp(app);
     fs.mkdirSync(root,{recursive:true,mode:0o700});const dir=path.join(root,'capture-'+Date.now()+'-'+randomBytes(3).toString('hex'));
     const selector=device.platform==='desktop'?['--pid',app.id,'--process',app.process]:device.platform==='ios'?['--process',app.process]:['--package',app.id];
     const desktopVideo=device.platform==='desktop'&&data.video===true;
     const args=['record','--platform',device.platform,'--device',device.id,'--out',dir,...selector];if(data.video===true&&!desktopVideo)args.push('--video');
     current={dir,recording:false,starting:true,videoRequested:desktopVideo,desktopApp:device.platform==='desktop'?app:null};tail='';
     proc=fork(path.join(base,'bin/bugdrop.cjs'),args,{silent:true});
     const child=proc;
     const log=b=>{tail=(tail+b.toString()).slice(-4000);};child.stdout.on('data',log);child.stderr.on('data',log);
     child.on('message',async m=>{if(m.type==='state'){current={...current,dir:m.dir,report:m.report,recording:m.recording,starting:false};if(m.report.endedAt)captures.set(m.report.id,{dir:m.dir});return;}if(m.type==='desktop-screenshot'&&captureDesktopScreenshot){const destination=path.resolve(String(m.destination||''));const allowed=path.dirname(destination)===path.resolve(current?.dir||'')&&/^screenshot-\d+\.png$/.test(path.basename(destination));try{if(!allowed)throw new Error('Invalid screenshot destination.');await captureDesktopScreenshot(destination,current.desktopApp);child.send({type:'desktop-screenshot-result',requestId:m.requestId,ok:true});}catch(e){child.send({type:'desktop-screenshot-result',requestId:m.requestId,ok:false,error:e.message});}}});
     child.on('error',e=>{tail=e.message;});
     child.on('exit',code=>{if(proc===child){
      proc=null;
      // The final IPC state can be lost when the recorder disconnects immediately
      // after stopping. Recover the completed report from its persisted draft.
      let report=current?.report;
      try{
       const saved=JSON.parse(fs.readFileSync(path.join(dir,'draft.json'),'utf8'));
       if(saved.endedAt&&fs.existsSync(path.join(dir,'review.html'))){report=adaptDesktopReport(saved);fs.writeFileSync(path.join(dir,'draft.json'),JSON.stringify(report,null,2),{mode:0o600});writeReview(dir,report);captures.set(saved.id,{dir});}
      }catch{}
      current={...current,report,recording:false,starting:false,exitCode:code};
     }});
     return send(200,{ok:true});
    }finally{pending=false;}
   }
   if(url.pathname==='/api/report-status'){
    if(typeof data.id!=='string'||typeof data.solved!=='boolean')throw new Error('Invalid report status.');
    listReports();const capture=captures.get(data.id);if(!capture)throw new Error('Report not found.');
    fs.writeFileSync(path.join(capture.dir,'status.json'),JSON.stringify({solved:data.solved}),{mode:0o600});
    return send(200,{ok:true});
   }
   if(url.pathname==='/api/stop'||url.pathname==='/api/screenshot'||url.pathname==='/api/note'){
    if(!proc?.connected||!current?.recording)throw new Error('No active capture.');
    const type=url.pathname.split('/').pop();proc.send({type,text:typeof data.text==='string'?data.text.slice(0,1600):''});return send(200,{ok:true});
   }
   return send(404,{error:'Not found'});
  }catch(e){return send(400,{error:e.message});}
 });
 return {server,token,close:()=>{if(proc?.connected)proc.disconnect();server.close();}};
}
if(require.main===module){const app=createServer();app.server.listen(Number(process.env.PORT||4318),'127.0.0.1',()=>console.log('Patchmason desktop: http://127.0.0.1:'+app.server.address().port));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close());}
module.exports={createServer};
