// Safety copy: after changes (and shortly after start-up) write a restore file into Documents.
// It uses the app's own backup format, so Settings > "Restore from a backup file" can read it.
const DESK = window.MBM_DESKTOP;
let timer;
function writeBackup() {
  try {
    const A = window.MBM_APP, L = window.MBM;
    if (!DESK || !A || !L) return;
    const json = JSON.stringify(L.makeBackup(A.S.quotes, A.S.pos, A.S.settings, new Date()), null, 2);
    DESK.autoBackup(json).catch(() => {});
  } catch (e) { /* never disturb the app */ }
}
if (DESK) {
  window.addEventListener('mbm-data-changed', () => { clearTimeout(timer); timer = setTimeout(writeBackup, 8000); });
  setTimeout(writeBackup, 15000);
}
