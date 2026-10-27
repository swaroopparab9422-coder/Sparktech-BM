// Windows reminders. The page works out WHAT is due and WHEN (same rules as the Android app);
// the main process keeps the clock and shows the Windows notification, even when this window is hidden in the tray.
const DESK = window.MBM_DESKTOP;
const DAY = 24 * 60 * 60 * 1000;
let debounceTimer;
let busy = false;

function stableId(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 2000000000 + 1;
}
function parseDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function localAtNine(dateString) {
  const d = new Date(String(dateString) + 'T09:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
function localDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nextNine() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }

// Overdue items: remind once on the first check of a day (but not before 9:00 AM), then again at 9:00 AM each following day.
// The record keeps the time of the queued reminder and the day it belongs to, so a reminder is never repeated on the same day.
function overdueTime(id) {
  const key = 'mbm-ov:' + id, now = Date.now(), today = localDay(new Date());
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
  if (rec && rec.ts > now) return new Date(rec.ts);          // already queued: keep it
  const nine = new Date(); nine.setHours(9, 0, 0, 0);
  let ts;
  if (rec && rec.day === today) ts = nextNine().getTime();   // last reminder was today: next one tomorrow 9:00
  else if (now < nine.getTime()) ts = nine.getTime();        // first time today, before 9:00: wait for 9:00
  else ts = now + 3000;                                      // first time today, after 9:00: right away
  try { localStorage.setItem(key, JSON.stringify({ day: localDay(new Date(ts)), ts })); } catch (_) {}
  return new Date(ts);
}

function dueFromPO(po, app) {
  const S = app?.S;
  const L = window.MBM;
  if (!S || !L) return [];
  const out = [];
  const now = new Date();
  const label = [po.poNumber ? 'PO ' + po.poNumber : 'Purchase order', po.customer, po.project].filter(Boolean).join(' · ');

  if (po.status !== 'Completed') {
    let r = null;
    try { r = L.reminderOf(po, S.settings); } catch (_) {}
    let at = r?.dueAt ? parseDate(r.dueAt) : null;
    if (!at) {
      const base = parseDate(po.statusUpdatedAt) || parseDate(po.createdAt) || now;
      at = new Date(base.getTime() + (Number(S.settings.activeReminderDays) || 3) * DAY);
    }
    const projectId = stableId(po.id + ':project');
    if (at < now) at = overdueTime(projectId);
    out.push({ id: projectId, title: 'Project status follow-up',
      body: label + ' — current status: ' + (po.status || 'Not set') + '. Click to review.',
      at: at.getTime(), extra: { poId: po.id, kind: 'project' } });
  }

  if (po.paymentStatus !== 'Paid') {
    let at = po.paymentDueDate ? localAtNine(po.paymentDueDate) : null;
    if (!at && po.status === 'Completed') {
      let r = null;
      try { r = L.reminderOf(po, S.settings); } catch (_) {}
      at = r?.kind === 'payment' ? parseDate(r.dueAt) : null;
      if (!at) {
        const base = parseDate(po.statusUpdatedAt) || parseDate(po.createdAt) || now;
        at = new Date(base.getTime() + (Number(S.settings.paymentReminderDays) || 30) * DAY);
      }
    }
    if (at) {
      const payId = stableId(po.id + ':payment');
      if (at < now) at = overdueTime(payId);
      const outstanding = Number(po.value || 0) - Number(po.amountPaid || 0);
      const money = Number.isFinite(outstanding) ? ' Outstanding: ' + new Intl.NumberFormat('en-IN', { style: 'currency', currency: po.currency || 'INR', maximumFractionDigits: 0 }).format(Math.max(0, outstanding)) + '.' : '';
      out.push({ id: payId, title: 'Customer payment follow-up',
        body: label + ' — payment status: ' + (po.paymentStatus || 'Not Due') + '.' + money + ' Click to follow up.',
        at: at.getTime(), extra: { poId: po.id, kind: 'payment' } });
    }
  }
  return out;
}

async function syncReminders() {
  if (busy || !DESK || !window.MBM_APP || !window.MBM) return;
  busy = true;
  try {
    const S = window.MBM_APP.S;
    let items = (S.pos || []).flatMap(po => dueFromPO(po, window.MBM_APP));
    items.sort((a, b) => a.at - b.at);
    const seen = new Set();
    items = items.filter(n => !seen.has(n.id) && seen.add(n.id));
    const pos = S.pos || [];
    const inProgress = pos.filter(p => p.status !== 'Completed').length;
    const unpaid = pos.filter(p => p.paymentStatus !== 'Paid').length;
    if (inProgress + unpaid > 0) {
      items.push({ id: 1999999998, title: 'Manufacturing Business Manager',
        body: [inProgress ? inProgress + ' project' + (inProgress === 1 ? '' : 's') + ' in progress' : '', unpaid ? unpaid + ' payment' + (unpaid === 1 ? '' : 's') + ' pending' : ''].filter(Boolean).join(' · ') + '. Click to review.',
        daily: { hour: 9, minute: 0 }, extra: { kind: 'digest' } });
    }
    await DESK.setReminders(items);
  } catch (e) {
    console.warn('Could not refresh reminders.', e);
  } finally {
    busy = false;
  }
}

if (DESK) {
  window.addEventListener('mbm-data-changed', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(syncReminders, 1200); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(syncReminders, 500); });
  setTimeout(syncReminders, 2000);
  setInterval(syncReminders, 60 * 60 * 1000);   // hourly, so the daily 9:00 AM reminders keep coming while the app sits in the tray
  DESK.onReminderOpen((extra) => {                // clicking a notification opens that purchase order
    const app = window.MBM_APP;
    if (!app || !extra || !extra.poId) return;
    app.go(extra.kind === 'payment' ? 'poPayment' : 'poStatus', { id: extra.poId });
  });
}
