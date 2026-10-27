'use strict';
const { app, BrowserWindow, Menu, Tray, Notification, dialog, ipcMain, nativeImage, protocol, session, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { LanSync } = require('./lansync');
const { Reminders } = require('./reminders');

const APP_NAME = 'Manufacturing Business Manager';
const APP_ID = 'com.sparktechautomation.manufacturingbusinessmanager';
const APP_DIR = path.join(__dirname, 'app');
const ICON = path.join(__dirname, 'assets', 'icon.png');

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);                       // needed for Windows toast notifications
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));   // same folder in every build
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

let win = null, tray = null, quitting = false;
let reminders = null;
const lan = new LanSync();
const live = new Set();                               // keeps notifications alive until they are closed

/* ---------------------------------------------------------------- small settings file */
const prefsFile = () => path.join(app.getPath('userData'), 'desktop-settings.json');
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch (e) { return {}; } }
function writePrefs(p) { try { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(prefsFile(), JSON.stringify(p)); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------- start with Windows */
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const LOGIN_ARGS = ['--hidden'];
function getAutoStart() {
  if (!app.isPackaged) return false;
  try { return !!app.getLoginItemSettings({ path: exePath(), args: LOGIN_ARGS }).openAtLogin; } catch (e) { return false; }
}
function setAutoStart(on) {
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!on, path: exePath(), args: LOGIN_ARGS }); } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------- window */
function sendToPage(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

function createWindow(showNow) {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620, show: false,
    backgroundColor: '#0a0a0a', title: APP_NAME, icon: ICON, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,                    // keep reminders and sync running while hidden in the tray
      spellcheck: false,
    },
  });
  win.loadURL('app://mbm/index.html');
  win.once('ready-to-show', () => { if (showNow) win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    const p = readPrefs();
    if (!p.trayNoticeShown) {
      p.trayNoticeShown = true; writePrefs(p);
      showToast({ title: APP_NAME, body: 'Still running in the system tray so reminders keep working. Right-click the tray icon and choose Quit to close it completely.', extra: { kind: 'info' } });
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://mbm/')) e.preventDefault(); });
}
function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

/* ---------------------------------------------------------------- notifications */
function showToast(item) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: item.title, body: item.body || '', icon: ICON, silent: false });
  live.add(n);
  const drop = () => live.delete(n);
  n.on('click', () => { drop(); showWindow(); sendToPage('reminder:open', item.extra || {}); });
  n.on('close', drop); n.on('failed', drop);
  setTimeout(drop, 30 * 60 * 1000);
  n.show();
}

/* ---------------------------------------------------------------- files */
function safeName(name, fallback) { return String(name || fallback).replace(/[\\/:*?"<>|]/g, '_'); }
async function saveWithDialog(event, filename, data, isText) {
  const parent = BrowserWindow.fromWebContents(event.sender) || win;
  const ext = path.extname(filename).slice(1).toLowerCase();
  const names = { json: 'Backup file (JSON)', csv: 'Spreadsheet (CSV)', pdf: 'PDF document' };
  const r = await dialog.showSaveDialog(parent, {
    title: 'Save ' + filename, defaultPath: path.join(app.getPath('documents'), filename),
    filters: ext ? [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : undefined,
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  let out = data;
  if (isText) {
    out = String(data);
    if (ext === 'csv' && out.charCodeAt(0) !== 0xFEFF) out = '\uFEFF' + out;   // lets Excel read ₹ and accents correctly
  }
  fs.writeFileSync(r.filePath, out);
  return { canceled: false, path: r.filePath };
}

/* Safety copy: every change writes a restore file (same format as "Download restore file") into Documents. */
const BACKUP_DIR = () => path.join(app.getPath('documents'), 'Manufacturing Business Manager Backups');
function writeAutoBackup(json) {
  if (typeof json !== 'string' || json.length > 64 * 1024 * 1024) return false;
  let obj; try { obj = JSON.parse(json); } catch (e) { return false; }
  const count = (Array.isArray(obj.quotations) ? obj.quotations.length : 0) + (Array.isArray(obj.purchaseOrders) ? obj.purchaseOrders.length : 0) + (Array.isArray(obj.pos) ? obj.pos.length : 0);
  const ot = obj.officeTools || {};
  const count2 = count + (Array.isArray(ot.challans) ? ot.challans.length : 0) + (Array.isArray(ot.employees) ? ot.employees.length : 0) + (ot.gst && Array.isArray(ot.gst.records) ? ot.gst.records.length : 0);
  const dir = BACKUP_DIR(), latest = path.join(dir, 'latest-auto-backup.json');
  fs.mkdirSync(dir, { recursive: true });
  if (count2 === 0 && fs.existsSync(latest)) return false;      // never replace a good backup with an empty one
  const tmp = latest + '.tmp'; fs.writeFileSync(tmp, json); fs.renameSync(tmp, latest);
  const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  fs.writeFileSync(path.join(dir, 'auto-backup-' + day + '.json'), json);   // one per day, newest 14 kept
  fs.readdirSync(dir).filter((f) => /^auto-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(14).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ } });
  return true;
}

/* ---------------------------------------------------------------- IPC (every handler answers, never throws) */
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => { try { return await fn(event, ...args); } catch (e) { return { __error: String((e && e.message) || e) }; } });
}
handle('notify:status', () => (Notification.isSupported() ? 'granted' : 'denied'));
handle('notify:test', () => reminders.fireNow({ title: APP_NAME, body: 'Reminders are working. You will be notified here on due dates, even when the window is closed.', extra: { kind: 'test' } }));
handle('reminders:set', (e, items) => { reminders.setItems(items); return true; });
handle('file:saveText', (e, name, text) => saveWithDialog(e, safeName(name, 'manufacturing-export.txt'), text, true));
handle('file:saveBase64', (e, name, b64) => saveWithDialog(e, safeName(name, 'export.pdf'), Buffer.from(String(b64), 'base64'), false));
handle('backup:auto', (e, json) => writeAutoBackup(json));
handle('lansync:start', (e, o) => lan.start(o));
handle('lansync:setState', (e, o) => { lan.setState(o); return true; });
handle('lansync:stop', async () => { await lan.stop(); return true; });
handle('lansync:getIps', () => lan.getIps());
handle('lansync:request', (e, o) => lan.request(o));
handle('lansync:scan', (e, o) => lan.scan(o));
lan.on('peerPush', (ev) => sendToPage('lansync:peerPush', ev));

/* ---------------------------------------------------------------- tray + menu */
function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ' + APP_NAME, click: showWindow },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: getAutoStart(), enabled: app.isPackaged, click: (item) => { setAutoStart(item.checked); } },
    { label: 'Send a test notification', click: () => reminders.fireNow({ title: APP_NAME, body: 'Reminders are working.', extra: { kind: 'test' } }) },
    { type: 'separator' },
    { label: 'Quit (reminders stop)', click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip(APP_NAME);
  tray.on('click', showWindow);
  buildTrayMenu();
}
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Hide to tray', accelerator: 'Ctrl+W', click: () => win && win.close() }, { type: 'separator' }, { label: 'Quit', accelerator: 'Ctrl+Q', click: () => { quitting = true; app.quit(); } }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ]));
}

/* ---------------------------------------------------------------- start up */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { /* stay alive in the tray */ });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      let rel = decodeURIComponent(new URL(request.url).pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const full = path.normalize(path.join(APP_DIR, rel));
      if (!full.startsWith(APP_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
      try {
        return new Response(fs.readFileSync(full), { headers: { 'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' } });
      } catch (e) { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'clipboard-sanitized-write'));

    reminders = new Reminders({ file: path.join(app.getPath('userData'), 'reminders.json'), notify: showToast });

    const prefs = readPrefs();
    if (app.isPackaged && !prefs.autoStartAsked) { prefs.autoStartAsked = true; writePrefs(prefs); setAutoStart(true); }

    buildMenu(); createTray();
    createWindow(!process.argv.includes('--hidden'));
    reminders.start();
    powerMonitor.on('resume', () => setTimeout(() => reminders.tick(), 3000));
  });
  app.on('will-quit', () => { try { reminders && reminders.stop(); lan.stop(); } catch (e) { /* ignore */ } });
}
