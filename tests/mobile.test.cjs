const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const D=require('../mobile/devices.cjs');
const A=require('../mobile/apps.cjs');
const {parse}=require('../bin/bugdrop.cjs');
const {writeReview}=require('../mobile/review.cjs');
const C=require('../extension/core.js');
test('mobile discovery excludes physical, offline, unauthorized and non-iOS devices',()=>{
 assert.deepEqual(D.parseAndroid('List of devices attached\nemulator-5554 device model:Pixel_9\nemulator-5556 offline\nphone123 device\nphone234 unauthorized\n').map(d=>d.id),['emulator-5554']);
 const json=JSON.stringify({devices:{'com.apple.CoreSimulator.SimRuntime.iOS-26-5':[{udid:'A',name:'iPhone',state:'Booted',isAvailable:true},{udid:'B',state:'Shutdown',isAvailable:true}],'com.apple.CoreSimulator.SimRuntime.tvOS-26-5':[{udid:'C',state:'Booted',isAvailable:true}]}});
 assert.deepEqual(D.parseIOS(json).map(d=>d.id),['A']);
});
test('desktop app discovery parses foreground apps on macOS and windowed apps on Windows/Linux',()=>{
 const mac=' 1) "Notes" ASN:0x0:\n    executable path="/System/Applications/Notes.app/Contents/MacOS/Notes"\n    pid = 496 type="Foreground"\n 2) "Dock" ASN:0x1:\n    executable path="/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock"\n    pid = 499 type="UIElement"';
 assert.deepEqual(A.parseMacApplications(mac),[{id:'496',name:'Notes',process:'Notes'}]);
 assert.deepEqual(A.parseWindowsProcesses({Id:42,ProcessName:'Demo',MainWindowTitle:'Checkout',MainWindowHandle:123}),[{id:'42',name:'Demo — Checkout',process:'Demo',windowId:'123'}]);
 assert.deepEqual(A.parseLinuxWindows('0x1  0 77 host Demo','77 demo-app\n88 hidden'),[{id:'77',name:'demo-app',process:'demo-app',windowId:'0x1'}]);
});
test('ambiguous devices and invalid log selectors fail closed',()=>{
 assert.throws(()=>D.selectDevice([{platform:'ios',id:'A'},{platform:'ios',id:'B'}],'ios'),/Multiple/);
 assert.throws(()=>D.selectDevice([],'ios'),/No matching/);
 assert.equal(D.validProcess('App" OR true'),false);
 assert.equal(D.validPackage('com.app; rm -rf /'),false);
 assert.equal(D.validProcess('Runner'),true);
 assert.equal(D.validPackage('com.example.app'),true);
 assert.equal(D.validPid('1234'),true);
 assert.equal(D.validPid('12; rm'),false);
});
test('CLI rejects unknown flags and supports explicit video opt-in',()=>{
 assert.throws(()=>parse(['record','--upload','x']),/Unknown/);
 assert.deepEqual(parse(['record','--platform','ios','--process','Runner','--video']).options,{platform:'ios',process:'Runner',video:true});
 assert.deepEqual(parse(['record','--platform','desktop','--pid','42','--process','Demo']).options,{platform:'desktop',pid:'42',process:'Demo'});
});
test('mobile export keeps source and attachments without browser-specific capability claims',()=>{
 const r={source:'ios',events:[],environment:{},artifacts:[{name:'recording.mp4',kind:'video'}],limitations:'No native touch capture.'};
 assert.equal(C.portable(r).source,'ios');assert.ok(C.markdown(r).includes('recording.mp4'));assert.ok(C.markdown(r).includes('No native touch capture.'));
});
test('offline review safely embeds hostile app log text and provides a review gate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bugdrop-review-'));
 try{writeReview(dir,{source:'ios',environment:{platform:'ios',device:'test',app:'app'},events:[{id:'1',kind:'console',ms:0,message:'</script><script>alert(1)</script>'}],artifacts:[],limitations:'limited'});const html=fs.readFileSync(path.join(dir,'review.html'),'utf8');assert.ok(!html.includes('</script><script>alert(1)'));assert.ok(html.includes('\\u003c/script'));assert.ok(html.includes('id="reviewed"'));assert.ok(html.includes('text.textContent='));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('offline review can preview a desktop WebM recording',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bugdrop-video-review-'));
 try{
  writeReview(dir,{source:'desktop',environment:{platform:'desktop',device:'test',app:'app'},events:[],artifacts:[{name:'recording.webm',kind:'video',ms:0}],limitations:''});
  const html=fs.readFileSync(path.join(dir,'review.html'),'utf8');
  assert.match(html,/recording\\?\.webm/);
  assert.match(html,/preview\.controls=true/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
