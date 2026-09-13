const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../desktop/server.cjs');
const {writeReview}=require('../mobile/review.cjs');

test('completed reports persist in the list and solved status survives a server restart',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bugdrop-reports-'));
 const id='12345678-1234-1234-1234-123456789abc';
 const dir=path.join(root,'capture-test');fs.mkdirSync(dir);
 const report={id,title:'Test bug',source:'desktop',startedAt:100,endedAt:200,environment:{platform:'desktop',device:'Test Mac',app:'My App'},events:[],artifacts:[],limitations:''};
 fs.writeFileSync(path.join(dir,'draft.json'),JSON.stringify(report));writeReview(dir,report);
 let app;
 async function start(){app=createServer({root,discover:async()=>({devices:[],warnings:[]})});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+app.server.address().port;}
 try{
  let base=await start();let headers={'X-BugDrop-Token':app.token};
  let response=await fetch(base+'/api/reports',{headers});let body=await response.json();
  assert.equal(body.reports.length,1);assert.equal(body.reports[0].solved,false);
  assert.equal((await fetch(base+body.reports[0].review)).status,200);
  response=await fetch(base+'/api/report-status',{method:'POST',headers,body:JSON.stringify({id,solved:true})});assert.equal(response.status,200);
  assert.equal((await (await fetch(base+'/api/reports',{headers})).json()).reports[0].solved,true);
  await new Promise(resolve=>app.server.close(resolve));
  base=await start();headers={'X-BugDrop-Token':app.token};
  body=await (await fetch(base+'/api/reports',{headers})).json();assert.equal(body.reports[0].solved,true);
  assert.equal((await fetch(base+body.reports[0].review)).status,200);
 }finally{await new Promise(resolve=>app.server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
