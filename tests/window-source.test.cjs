const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sourceWindowId,selectWindowSource}=require('../desktop/window-source.cjs');

test('desktop capture selects the chosen process window, never a screen or another app',async()=>{
 const sources=[{id:'screen:1:0'},{id:'window:12:0'},{id:'window:34:0'}];
 const getSources=async()=>sources;
 assert.equal(sourceWindowId(sources[0]),null);
 assert.equal((await selectWindowSource({id:'42',windowId:'34'},getSources,'win32')).id,'window:34:0');
 await assert.rejects(selectWindowSource({id:'42',windowId:'99'},getSources,'win32'),/unavailable/);
 await assert.rejects(selectWindowSource({id:'42'},getSources,'linux'),/No visible window/);
});
