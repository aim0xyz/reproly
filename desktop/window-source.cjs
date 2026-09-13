const {execFile} = require('node:child_process');
const {promisify} = require('node:util');

const runFile = promisify(execFile);

function sourceWindowId(source) {
  const match = /^window:([^:]+):\d+$/.exec(source.id);
  if (!match) return null;
  try { return BigInt(match[1]).toString(); } catch { return null; }
}

function macWindowScript(pid) {
  return `ObjC.import('CoreGraphics');
const ref=$.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,$.kCGNullWindowID);
const windows=ObjC.deepUnwrap(ObjC.castRefToObject(ref))||[];
JSON.stringify(windows.filter(w=>w.kCGWindowOwnerPID===${pid}&&w.kCGWindowLayer===0&&w.kCGWindowBounds?.Width>100&&w.kCGWindowBounds?.Height>100).map(w=>w.kCGWindowNumber));`;
}

async function windowIdsForApp(app, platform=process.platform) {
  if (!/^\d+$/.test(String(app.id))) throw new Error('The selected desktop app has no valid process ID.');
  if (platform === 'darwin') {
    const {stdout} = await runFile('/usr/bin/osascript',['-l','JavaScript','-e',macWindowScript(Number(app.id))],{timeout:10000});
    const ids = JSON.parse(stdout.trim() || '[]');
    return ids.map(id=>BigInt(id).toString());
  }
  if (app.windowId) return [BigInt(app.windowId).toString()];
  return [];
}

async function selectWindowSource(app, getSources, platform=process.platform) {
  const ids = await windowIdsForApp(app,platform);
  if (!ids.length) throw new Error('No visible window belongs to the selected app. Open its window and try again.');
  const sources = await getSources({types:['window'],thumbnailSize:{width:0,height:0}});
  const source = ids.map(id=>sources.find(item=>sourceWindowId(item)===id)).find(Boolean);
  if (!source) throw new Error('The selected app window is unavailable for capture. Bring it onto the current desktop and try again.');
  return source;
}

module.exports = {sourceWindowId,macWindowScript,windowIdsForApp,selectWindowSource};
