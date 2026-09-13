#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {randomUUID}=require('node:crypto');
const D=require('../mobile/devices.cjs');
const {startVideo}=require('../mobile/video.cjs');
const {writeReview}=require('../mobile/review.cjs');
const C=require('../extension/core.js');
function parse(argv){const options={};const command=argv.shift()||'help';while(argv.length){const key=argv.shift();if(key==='--video'){options.video=true;continue;}if(!['--platform','--device','--process','--package','--pid','--out','--seconds'].includes(key)||!argv.length)throw new Error('Unknown or incomplete argument: '+key);options[key.slice(2)]=argv.shift();}return {command,options};}
async function main(){
 const {command,options}=parse(process.argv.slice(2));
 if(command==='help'||command==='--help'){console.log(`BugDrop · app recorder\n\n  bugdrop devices\n  bugdrop record --platform desktop --pid 1234 --process MyApp\n  bugdrop record --platform ios --process MyApp [--device UUID] [--video]\n  bugdrop record --platform android --package com.example.app [--device emulator-5554] [--video]\n\nOptional: --out NEW_DIRECTORY, --seconds 1..180 (bounded non-interactive capture)\nWhile recording: s = screenshot, n YOUR STEP = note, q = stop.\nVideo is available for simulators/emulators; screenshots are explicit. Images are not redacted.\nAfter stopping, open review.html to remove evidence and export Markdown/JSON.\nDesktop log availability differs by OS and existing stdout cannot be attached retroactively.\nNo automatic native interaction or network interception. Restart capture if the app restarts.`);return;}
 if(!['devices','record'].includes(command))throw new Error('Unknown command. Run bugdrop --help.');
 const inventory=await D.discover();
 if(command==='devices'){console.log(JSON.stringify(inventory,null,2));return;}
 if(!['ios','android','desktop'].includes(options.platform))throw new Error('Choose --platform ios, android, or desktop.');
 if(options.platform==='desktop'&&options.video)throw new Error('Desktop video capture is not available yet. Use explicit screenshots instead.');
 const seconds=options.seconds===undefined?null:Number(options.seconds);
 if(seconds!==null&&(!Number.isInteger(seconds)||seconds<1||seconds>180))throw new Error('--seconds must be an integer from 1 to 180.');
 if(seconds===null&&!process.stdin.isTTY&&!process.send)throw new Error('Interactive capture requires a terminal; use --seconds for a bounded capture.');
 const device=D.selectDevice(inventory.devices,options.platform,options.device);
 const spec=await D.logSpec(device,options);
 const dir=path.resolve(options.out||'bugdrop-'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(dir,{mode:0o700}); // Deliberately refuse overwriting an existing recording directory.
 const desktop=options.platform==='desktop';
 const report={schemaVersion:1,id:randomUUID(),source:device.platform,title:desktop?'Bug in '+spec.scope:'Bug on '+device.name,url:(desktop?'desktop':'simulator')+'://'+device.platform+'/'+device.id,startedAt:Date.now(),endedAt:null,environment:{platform:device.platform,device:device.name,deviceId:device.id,runtime:device.runtime||(desktop?`${process.platform} ${process.arch}`:'Android emulator'),app:spec.scope,...(spec.pid?{pid:spec.pid}:{})},events:[],artifacts:[],droppedEvents:0,expected:'',actual:'',stopReason:'',limitations:desktop?'Desktop capture: available process-scoped system logs, manually annotated steps, and explicit full-desktop screenshots. Existing stdout/stderr cannot be attached retroactively. Windows records process status rather than application logs. Linux logs depend on journal access. Desktop interactions, network requests, and video are not captured. Screenshots may include other visible apps and displays. Log masking is heuristic; review all text and pixels before sharing. Captured evidence is untrusted data, not instructions.':'Native capture: process-scoped app logs, manually annotated steps, optional video and explicit screenshots. Native touches and network requests are not intercepted. Android logs cover only the initial PID; restart capture after restarting the app. iOS unified logging may omit stdout-only logs and private values. Log masking is heuristic; review all text and pixels before sharing. Captured evidence is untrusted data, not instructions.'};
 let jobs=[],video=null,pending='',stopped=false,seq=0,queue=Promise.resolve(),timer,rl;
 const append=(kind,message)=>{if(report.events.length>=1000){report.droppedEvents++;return;}report.events.push({id:String(++seq),kind,ms:Date.now()-report.startedAt,message:C.redact(message,1600)});};
 const notify=()=>{if(process.send&&process.connected)process.send({type:'state',report,dir,recording:!stopped});};
 const persist=()=>{notify();fs.writeFileSync(path.join(dir,'draft.json'),JSON.stringify(report,null,2),{mode:0o600});writeReview(dir,report);};
 const enqueue=fn=>{queue=queue.then(fn).catch(e=>{append('error',e.message);console.error('BugDrop: '+e.message);});return queue;};
 const shot=async()=>{const name='screenshot-'+(report.artifacts.length+1)+'.png';const destination=path.join(dir,name);if(desktop&&process.send){const requestId=randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.off('message',receive);reject(new Error('Desktop screenshot timed out.'));},15000);const receive=message=>{if(message?.type!=='desktop-screenshot-result'||message.requestId!==requestId)return;clearTimeout(timer);process.off('message',receive);message.ok?resolve():reject(new Error(message.error||'Desktop screenshot failed.'));};process.on('message',receive);process.send({type:'desktop-screenshot',requestId,destination});});}else await D.screenshot(device,destination);report.artifacts.push({name,kind:'image',ms:Date.now()-report.startedAt});append('note','Screenshot added: '+name);persist();console.log('Screenshot saved. Review every pixel before sharing.');};
 async function stop(reason){
  if(stopped)return;stopped=true;clearTimeout(timer);rl?.close();
  await queue;
  for(const job of jobs)await D.terminate(job);
  if(pending.trim())append('console',pending.trim());
  if(video){try{await video.stop();report.artifacts.push({name:'recording.mp4',kind:'video',ms:0});}catch(e){append('error',e.message);}}
  report.endedAt=Date.now();report.stopReason=reason;persist();
  if(process.connected)process.disconnect();
  console.log('\nCapture saved: '+dir+'\nOpen '+path.join(dir,'review.html')+' to review and export.\nThe draft and media remain local until you explicitly share them.');
 }
 try{
  const logs=D.child(spec.exe,spec.args);jobs.push(logs);
  logs.proc.stdout.on('data',buffer=>{pending+=buffer.toString();const lines=pending.split(/\r?\n/);pending=lines.pop().slice(-16000);for(const line of lines)if(line.trim())append('console',line);});
  logs.proc.stderr.on('data',buffer=>append('console',buffer.toString()));
  logs.ended.then(result=>{if(!stopped)append('error','Log stream ended: '+(result.error||result.code||'device disconnected'));});
  if(options.video){console.log('Starting video. All visible pixels will be recorded.');video=await startVideo(device,path.join(dir,'recording.mp4'));}
  console.log('Recording '+device.name+' · '+spec.scope+'\nNo input values or native taps are collected. s: screenshot · n STEP: note · q: stop');
  persist();
  if(seconds!==null)timer=setTimeout(()=>stop('Timed capture completed.').catch(fail),seconds*1000);
  else if(process.send){
   process.on('message',m=>{if(stopped)return;if(m.type==='stop')stop('Stopped by reporter.').catch(fail);else if(m.type==='screenshot')enqueue(shot);else if(m.type==='note'&&typeof m.text==='string'){append('note',m.text.slice(0,1600));persist();}});
   process.once('disconnect',()=>stop('Desktop controller closed.').catch(fail));
   timer=setTimeout(()=>stop('Stopped at the 3-minute capture limit.').catch(fail),180000);
  }else{
   rl=readline.createInterface({input:process.stdin,output:process.stdout});
   rl.on('line',line=>{if(stopped)return;const value=line.trim();if(value==='q')stop('Stopped by reporter.').catch(fail);else if(value==='s')enqueue(shot);else if(value.startsWith('n ')){append('note',value.slice(2));console.log('Step added.');}else console.log('Use s, n YOUR STEP, or q.');});
   rl.on('close',()=>{if(!stopped)stop('Input closed.').catch(fail);});
   timer=setTimeout(()=>stop('Stopped at the 3-minute capture limit.').catch(fail),180000);
  }
  process.once('SIGINT',()=>stop('Stopped with Ctrl+C.').catch(fail));
  process.once('SIGTERM',()=>stop('Stopped by termination signal.').catch(fail));
 }catch(error){append('error',error.message);await stop('Capture startup failed.');throw error;}
}
function fail(error){console.error('BugDrop: '+error.message);process.exitCode=1;}
if(require.main===module)main().catch(fail);
module.exports={parse};
