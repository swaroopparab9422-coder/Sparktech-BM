'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (r && typeof r === 'object' && r.__error) throw new Error(r.__error);
  return r;
}

/* Same shape as the Android "LanSync" plugin, so lan-sync.js runs unchanged. */
contextBridge.exposeInMainWorld('__MBM_LANSYNC_OVERRIDE', {
  start: (o) => call('lansync:start', o),
  setState: (o) => call('lansync:setState', o),
  stop: () => call('lansync:stop'),
  getIps: () => call('lansync:getIps'),
  request: (o) => call('lansync:request', o),
  scan: (o) => call('lansync:scan', o),
  addListener: (name, cb) => {
    if (name !== 'peerPush') return;
    ipcRenderer.removeAllListeners('lansync:peerPush');
    ipcRenderer.on('lansync:peerPush', (_e, ev) => cb(ev));
  },
});

contextBridge.exposeInMainWorld('NativeFileBridge', {
  saveFile: (name, text) => call('file:saveText', name, text),
  saveBase64: (name, b64) => call('file:saveBase64', name, b64),
});

contextBridge.exposeInMainWorld('NativeNotify', {
  status: () => call('notify:status'),
  test: () => call('notify:test'),
});

contextBridge.exposeInMainWorld('MBM_DESKTOP', {
  platform: 'windows',
  setReminders: (items) => call('reminders:set', items),
  autoBackup: (json) => call('backup:auto', json),
  onReminderOpen: (cb) => { ipcRenderer.removeAllListeners('reminder:open'); ipcRenderer.on('reminder:open', (_e, extra) => cb(extra)); },
});
