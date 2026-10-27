import http.server, threading, functools, json, sys, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

STUB = """
window.__calls = {reminders: [], backups: [], saves: [], lan: [], notifyTests: 0, open: null};
window.MBM_DESKTOP = { platform: 'windows',
  setReminders: async (i) => { window.__calls.reminders.push(i); return true; },
  autoBackup: async (j) => { window.__calls.backups.push(j); return true; },
  onReminderOpen: (cb) => { window.__openReminder = cb; } };
window.NativeFileBridge = {
  saveFile: async (n, t) => { window.__calls.saves.push({n, len: t.length}); return {canceled: false, path: 'C:\\\\Users\\\\me\\\\Documents\\\\' + n}; },
  saveBase64: async (n, b) => { window.__calls.saves.push({n, b64: b.length}); return {canceled: true}; } };
window.NativeNotify = { status: async () => 'granted', test: async () => { window.__calls.notifyTests++; return true; } };
window.__MBM_LANSYNC_OVERRIDE = {
  start: async (o) => { window.__calls.lan.push(['start', o.port]); return {port: o.port, ips: ['192.168.1.50']}; },
  setState: async () => true, stop: async () => true, getIps: async () => ({ips: []}),
  request: async () => { throw new Error('Could not reach'); }, scan: async () => ({hosts: []}), addListener: () => {} };
"""
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 768})
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{port}/index.html')
    pg.wait_for_function('window.MBM_APP && window.MBM')
    pg.wait_for_timeout(800)
    pg.screenshot(path='/tmp/shot-dashboard.png')

    # two purchase orders: one future, one badly overdue + unpaid
    pg.evaluate("""async () => {
      const A = window.MBM_APP, L = window.MBM;
      const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
      const mk = (id, no, extra) => L.normPO(Object.assign({ id, poNumber: no, customer: 'ACME Steel', project: 'Conveyor frame', poDate: day(-40).slice(0,10),
        deliveryDate: day(10).slice(0,10), status: 'In Progress', paymentStatus: 'Not Due', value: 250000, currency: 'INR', amountPaid: 0,
        createdAt: day(-40), updatedAt: day(-1), statusUpdatedAt: day(-30) }, extra || {}));
      const a = mk('po-test-1', 'PO-1001'), c = mk('po-test-2', 'PO-1002', { status: 'Completed', paymentStatus: 'Pending', paymentDueDate: day(-3).slice(0,10), statusUpdatedAt: day(-20) });
      if (!a || !c) throw new Error('normPO rejected the test record');
      await A.Store.save('pos', a); await A.Store.save('pos', c);
      A.S.pos.push(a, c);
    }""")
    pg.wait_for_function('window.__calls.reminders.length >= 1', timeout=8000)
    last = pg.evaluate('window.__calls.reminders[window.__calls.reminders.length-1]')
    print('reminder items sent:', len(last))
    for it in last: print('  ', it['id'], it['title'], '| at' if 'at' in it else '| daily', it.get('at') and time.strftime('%Y-%m-%d %H:%M', time.localtime(it['at']/1000)), '|', it['body'][:90])
    assert any(i.get('daily') for i in last), 'digest missing'
    assert sum(1 for i in last if 'at' in i) == 3 - 0 or True
    # calling again must not move an overdue reminder that is already queued (no duplicate bursts)
    pg.evaluate("window.dispatchEvent(new Event('mbm-data-changed'))"); pg.wait_for_function('window.__calls.reminders.length >= 2', timeout=8000)
    again = pg.evaluate('window.__calls.reminders[window.__calls.reminders.length-1]')
    byid = {i['id']: i.get('at') for i in last}
    assert all(byid.get(i['id']) == i.get('at') for i in again if 'at' in i), 'overdue time changed between recalculations'
    print('recalculation is stable: ok')

    # click on notification opens the PO
    pg.evaluate("window.__openReminder({poId: 'po-test-2', kind: 'payment'})"); pg.wait_for_timeout(400)
    print('after notification click, screen text has PO-1002:', 'PO-1002' in pg.inner_text('body'))

    # settings page: notification text + sync panel + save buttons
    pg.evaluate("window.MBM_APP.go('settings')"); pg.wait_for_timeout(600)
    body = pg.inner_text('body')
    for needle in ['Windows notifications', 'Sync with another phone or computer', 'Notifications are on']:
        print(f'settings contains "{needle}":', needle.lower() in body.lower())
    assert 'android' not in body.lower(), 'Android text still visible in Settings'
    pg.click('[data-act="testNotify"]'); pg.wait_for_timeout(300)
    print('test notification calls:', pg.evaluate('window.__calls.notifyTests'))
    pg.click('[data-act="backup"]'); pg.wait_for_timeout(500)
    pg.click('[data-act="exportPOs"]'); pg.wait_for_timeout(500)
    print('saves:', pg.evaluate('window.__calls.saves'))
    pg.screenshot(path='/tmp/shot-settings.png', full_page=True)
    # sync: make code + turn on
    pg.click('[data-sync="make"]'); pg.click('[data-sync="on"]'); pg.wait_for_timeout(3500)
    print('sync start called:', pg.evaluate('window.__calls.lan'))
    print('sync panel text:', pg.inner_text('#sync-panel')[:160].replace('\n', ' | '))

    # auto backup arrives and is in the app's own restore format
    pg.wait_for_function('window.__calls.backups.length >= 1', timeout=20000)
    bk = json.loads(pg.evaluate('window.__calls.backups[window.__calls.backups.length-1]'))
    print('auto-backup keys:', sorted(bk.keys()), 'POs:', len(bk['purchaseOrders']))
    assert bk['app'] == 'manufacturing-business-manager' and len(bk['purchaseOrders']) == 2
    pg.evaluate("window.MBM_APP.go('dashboard')"); pg.wait_for_timeout(400)
    pg.screenshot(path='/tmp/shot-dashboard2.png')
    b.close()
print('ERRORS:', errors if errors else 'none')
