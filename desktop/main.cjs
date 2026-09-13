const {app, BrowserWindow, desktopCapturer, shell, session} = require('electron');
const fs = require('node:fs');
const {createServer} = require('./server.cjs');
const {selectWindowSource} = require('./window-source.cjs');

let controller;
let mainWindow;
let origin;
let selectedApp;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#e9e4da',
    title: 'BugDrop',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith(origin + '/capture/')) return {action: 'allow'};
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return {action: 'deny'};
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin + '/')) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(origin);
}

async function start() {
  await app.whenReady();
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!selectedApp || request.securityOrigin !== origin || !request.userGesture) return callback(null);
    try { callback({video: await selectWindowSource(selectedApp, desktopCapturer.getSources)}); }
    catch { callback(null); }
  });
  controller = createServer({desktopVideoAvailable: true,
    selectDesktopApp: async selected => { const source = await selectWindowSource(selected, desktopCapturer.getSources); selectedApp=selected; return source.id; },
    captureDesktopScreenshot: async (destination, selected) => {
    const source = await selectWindowSource(selected, options => desktopCapturer.getSources({...options,thumbnailSize:{width:4096,height:4096}}));
    if (source.thumbnail.isEmpty()) throw new Error('The selected app window could not be captured. Check the operating-system screen recording permission.');
    fs.writeFileSync(destination, source.thumbnail.toPNG(), {mode: 0o600});
  }});
  await new Promise((resolve, reject) => {
    controller.server.once('error', reject);
    controller.server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${controller.server.address().port}`;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => controller?.close());

start().catch(error => {
  console.error(error);
  app.quit();
});
