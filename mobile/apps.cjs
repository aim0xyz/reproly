const path=require('node:path');
const os=require('node:os');
const D=require('./devices.cjs');
function parseApps(plist){return Object.entries(plist).map(([id,a])=>({id,name:a.CFBundleDisplayName||a.CFBundleName||id,process:a.CFBundleExecutable})).filter(a=>D.validProcess(a.process)).sort((a,b)=>a.name.localeCompare(b.name));}
function parseMacProcesses(text){return text.split(/\r?\n/).map(line=>line.match(/^\s*(\d+)\s+(.+?\.app\/Contents\/MacOS\/[^/]+)\s*$/)).filter(Boolean).map(match=>{const app=match[2].match(/\/([^/]+)\.app\/Contents\/MacOS\/([^/]+)$/);return {id:match[1],name:app[1],process:app[2]};}).filter(app=>!/^BugDrop(?: Helper)?$/i.test(app.name)).sort((a,b)=>a.name.localeCompare(b.name));}
function parseMacApplications(text){return text.split(/\n(?=\s*\d+\)\s+")/).map(block=>{const name=block.match(/^\s*\d+\)\s+"([^"]+)"/);const pid=block.match(/\bpid\s*=\s*(\d+)/);const executable=block.match(/executable path="([^"]+)"/);return name&&pid&&/\btype="Foreground"/.test(block)?{id:pid[1],name:name[1],process:executable?path.basename(executable[1]):name[1]}:null;}).filter(Boolean).filter(app=>!/^BugDrop$/i.test(app.name)).sort((a,b)=>a.name.localeCompare(b.name));}
function parseWindowsProcesses(value){const items=Array.isArray(value)?value:value?[value]:[];return items.filter(item=>D.validPid(item.Id)&&item.ProcessName).map(item=>({id:String(item.Id),name:item.MainWindowTitle?`${item.ProcessName} — ${item.MainWindowTitle}`:item.ProcessName,process:item.ProcessName,...(item.MainWindowHandle?{windowId:String(item.MainWindowHandle)}:{})})).sort((a,b)=>a.name.localeCompare(b.name));}
function parseLinuxWindows(windows,processes){const pids=new Set(windows.split(/\r?\n/).map(line=>line.trim().split(/\s+/)[2]).filter(D.validPid));const ids=new Map(windows.split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length>2&&D.validPid(parts[2])).map(parts=>[parts[2],parts[0]]));return processes.split(/\r?\n/).map(line=>line.match(/^\s*(\d+)\s+(.+)$/)).filter(Boolean).filter(match=>pids.has(match[1])).map(match=>({id:match[1],name:path.basename(match[2]),process:path.basename(match[2]),windowId:ids.get(match[1])})).sort((a,b)=>a.name.localeCompare(b.name));}
async function desktopApps(){
 if(process.platform==='darwin'){try{return parseMacApplications(await D.run('lsappinfo',['list']));}catch{return parseMacProcesses(await D.run('ps',['-axo','pid=,comm=']));}}
 if(process.platform==='win32'){
  const json=await D.run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-Process | Where-Object {$_.MainWindowHandle -ne 0 -and $_.Id -ne $PID} | Select-Object Id,ProcessName,MainWindowTitle,MainWindowHandle | ConvertTo-Json -Compress']);
  return parseWindowsProcesses(JSON.parse(json||'[]'));
 }
 if(process.platform==='linux'){
  try{const windows=await D.run('wmctrl',['-lp']);const ids=[...new Set(windows.split(/\r?\n/).map(line=>line.trim().split(/\s+/)[2]).filter(D.validPid))];if(!ids.length)return [];const processes=await D.run('ps',['-p',ids.join(','),'-o','pid=,comm=']);return parseLinuxWindows(windows,processes);}catch{
   const processes=await D.run('ps',['-u',os.userInfo().username,'-o','pid=,comm=']);const ids=new Map(windows.split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length>2&&D.validPid(parts[2])).map(parts=>[parts[2],parts[0]]));return processes.split(/\r?\n/).map(line=>line.match(/^\s*(\d+)\s+(.+)$/)).filter(Boolean).filter(match=>!['ps','bash','zsh','sh','systemd','dbus-daemon'].includes(path.basename(match[2]))).map(match=>({id:match[1],name:path.basename(match[2]),process:path.basename(match[2]),windowId:ids.get(match[1])})).sort((a,b)=>a.name.localeCompare(b.name));
  }
 }
 return [];
}
async function apps(device){
 if(device.platform==='desktop')return desktopApps();
 if(device.platform==='ios'){
  const plist=await D.run('xcrun',['simctl','listapps',device.id]);
  const {spawn}=require('node:child_process');
  const json=await new Promise((resolve,reject)=>{const p=spawn('plutil',['-convert','json','-o','-','-']);let out='',err='';const timer=setTimeout(()=>{p.kill();reject(new Error('App listing timed out.'));},10000);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);code?reject(new Error(err)):resolve(out)});p.stdin.end(plist);});
  return parseApps(JSON.parse(json));
 }
 const text=await D.run(D.adbPath(),['-s',device.id,'shell','pm','list','packages','-3']);
 return text.split(/\r?\n/).map(s=>s.replace(/^package:/,'').trim()).filter(D.validPackage).sort().map(id=>({id,name:id}));
}
module.exports={apps,parseApps,parseMacProcesses,parseMacApplications,parseWindowsProcesses,parseLinuxWindows};
