import http.server, threading, functools, json, os, base64, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
STUB = """
window.__saves=[]; window.__pdfs=[];
window.MBM_DESKTOP={platform:'windows',setReminders:async()=>true,autoBackup:async()=>true,onReminderOpen:()=>{}};
window.NativeFileBridge={saveFile:async(n,t)=>{window.__saves.push({n,t});return {canceled:false,path:'C:\\\\x\\\\'+n}},saveBase64:async(n,b)=>{window.__pdfs.push({n,b});return {canceled:false,path:'C:\\\\x\\\\'+n}}};
window.NativeNotify={status:async()=>'granted',test:async()=>true};
"""
fails = []
def check(name, cond, extra=''):
    print(('  ok   ' if cond else '  FAIL ') + name + (('  -> ' + str(extra)) if not cond and extra != '' else ''))
    if not cond: fails.append(name)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 800})
    ctx.add_init_script(STUB + "try{localStorage.setItem('mbm:theme','light')}catch(e){}")
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{port}/index.html')
    pg.wait_for_function('window.MBM_APP && typeof window.MBM_APP.SCREENS.attPayroll === "function"'); pg.wait_for_timeout(500)
    go = lambda name, params='{}': pg.evaluate(f"window.MBM_APP.go('{name}', {params})")
    body = lambda: pg.inner_text('body')

    print('Dashboard'); 
    t = body()
    check('challan and attendance tiles are on the dashboard', 'New Challan' in t and 'Mark Attendance' in t and 'Monthly Salary' in t)
    check('dashboard amounts are hidden (first digit then XX)', '₹0XX' in t and '0.00' not in t, t[:400])
    pg.evaluate("""async()=>{const A=window.MBM_APP,L=window.MBM;const r=L.normPO({id:'m1',poNumber:'PO-9',customer:'Zed',project:'J',poDate:'2026-10-01',deliveryDate:'2026-11-01',status:'In Progress',paymentStatus:'Due',value:512345,currency:'INR',amountPaid:100000,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),statusUpdatedAt:new Date().toISOString()});await A.Store.save('pos',r);A.S.pos.push(r);A.render();}""")
    pg.wait_for_timeout(300); t = body()
    check('PO value shows as ₹5XX, outstanding as ₹4XX, no real amounts', '₹5XX' in t and '₹4XX' in t and '5,12,345' not in t and '4,12,345' not in t, t[300:700])
    pg.evaluate("""async()=>{await window.MBM_APP.Store.remove?.('pos','m1'); }""")
    # eye button: hidden by default, shows the real value when pressed, hides again
    eyes=pg.locator('.bt-val .eye'); check('every hidden amount has an eye button', eyes.count()>=3, eyes.count())
    card=pg.locator('[data-a="pv"]'); before=card.inner_text()
    card.locator('.eye').first.click(); pg.wait_for_timeout(150); shown=card.inner_text()
    check('pressing the eye shows the full amount (5,12,345)', '5,12,345' in shown and '5XX' in before, shown)
    card.locator('.eye').first.click(); pg.wait_for_timeout(150)
    check('pressing again hides it', '5,12,345' not in card.inner_text() and '5XX' in card.inner_text())
    pg.screenshot(path='/tmp/o-dashboard.png', full_page=True)

    print('Challan')
    pg.click('[data-act="chlNew"]'); pg.wait_for_timeout(300)
    check('form opens with auto number 26/32', pg.input_value('#o-no') == '26/32')
    pg.fill('#o-customer', 'Kirloskar Oil Engines Limited'); pg.fill('#o-address', 'Five Star MIDC Kolhapur')
    pg.fill('#o-ip-0', 'Fixture Parts ( BS4 Cylinder Head Tackle )'); pg.fill('#o-iq-0', '1 Nos')
    pg.click('[data-act="chlAddRow"]'); pg.fill('#o-ip-1', 'Tackle for DV cylinder Head Lifting ( 92.600.079 )'); pg.fill('#o-iq-1', '1 Nos')
    check('typed text survives adding a row', pg.input_value('#o-ip-0').startswith('Fixture') and pg.input_value('#o-iq-0') == '1 Nos')
    pg.fill('#o-tname', 'Shree Transport'); pg.fill('#o-tveh', 'MH09 AB 1234'); pg.fill('#o-tmob', '9876543210')
    pg.click('[data-act="chlSavePdf"]'); pg.wait_for_function('window.__pdfs.length>=1', timeout=10000); pg.wait_for_timeout(300)
    check('PDF saved as Challan-26-32.pdf', pg.evaluate('window.__pdfs[0].n') == 'Challan-26-32.pdf')
    open('/tmp/challan1.pdf', 'wb').write(base64.b64decode(pg.evaluate('window.__pdfs[0].b')))
    check('list shows 26/32', '26/32' in body())
    # second challan -> 26/33 ; empty form validation
    pg.click('[data-act="chlNew"]'); pg.wait_for_timeout(200)
    check('second challan gets 26/33', pg.input_value('#o-no') == '26/33')
    pg.click('[data-act="chlSave"]'); pg.wait_for_timeout(200)
    check('empty form is refused', 'Enter the customer name' in body())
    pg.fill('#o-customer', 'Kirloskar Oil Engines Limited'); pg.dispatch_event('#o-customer', 'change')
    check('address auto-filled from the last challan to that customer', pg.input_value('#o-address') == 'Five Star MIDC Kolhapur')
    pg.fill('#o-ip-0', 'Gauge'); pg.click('[data-act="chlSave"]'); pg.wait_for_timeout(300)
    # new FY: date in April 2027 -> 27/1 ; and Feb 2027 stays in series 26
    pg.click('[data-act="chlNew"]'); pg.wait_for_timeout(200)
    pg.evaluate("(()=>{const i=document.getElementById('o-date');i.value='2027-02-10';i.dispatchEvent(new Event('change',{bubbles:true}))})()")
    check('Feb 2027 is still series 26 (next 26/34)', pg.input_value('#o-no') == '26/34', pg.input_value('#o-no'))
    pg.evaluate("(()=>{const i=document.getElementById('o-date');i.value='2027-04-01';i.dispatchEvent(new Event('change',{bubbles:true}))})()")
    check('April 2027 starts series 27/1', pg.input_value('#o-no') == '27/1', pg.input_value('#o-no'))
    go('challanList'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/o-challan-list.png', full_page=True)
    # delete the last one -> number is reused
    pg.once('dialog', lambda d: d.accept())
    pg.click('article:has-text("26/33") [data-act="chlDelete"]'); pg.wait_for_timeout(300); pg.click('#modal-root [data-i="1"]'); pg.wait_for_timeout(300)
    check('deleted challan removed', '26/33' not in pg.inner_text('#o-chl-list'))
    # a challan with a long list must not crash
    go('challanForm'); pg.wait_for_timeout(200)
    pg.screenshot(path='/tmp/o-challan-form.png', full_page=True)

    print('Employees and attendance')
    def add_emp(name, desig, join, sal, left=''):
        go('empForm'); pg.wait_for_timeout(150)
        pg.fill('#o-en', name); pg.fill('#o-ed', desig); pg.fill('#o-es', str(sal))
        pg.evaluate(f"document.getElementById('o-ej').value='{join}'; document.getElementById('o-el').value='{left}'")
        pg.click('[data-act="empSave"]'); pg.wait_for_timeout(200)
    add_emp('Ashish Jarag', 'Fitter', '2025-08-08', 30000)
    add_emp('Rahul Patil', 'Welder', '2026-09-15', 26000)
    add_emp('Sunil More', 'Helper', '2024-01-01', 15000, '2026-09-20')
    check('three employees listed', all(n in body() for n in ['Ashish Jarag', 'Rahul Patil', 'Sunil More']))
    # yearly sheet clicks: September 2026 for Ashish
    ids = pg.evaluate("window.MBM_OFFICE.collect().employees.map(e=>[e.name,e.id])"); ids = {n: i for n, i in ids}
    go('attSheet', json.dumps({'id': ids['Ashish Jarag'], 'year': 2026})); pg.wait_for_timeout(300)
    def cell(date, times): 
        for _ in range(times): pg.click(f'td[data-date="{date}"]')
    pg.evaluate("document.getElementById('toasts').innerHTML=''")   # old toasts can sit on top of cells
    for d in ['01','02','03','04','05']: cell(f'2026-09-{d}', 1)      # P x5
    cell('2026-09-08', 2); cell('2026-09-09', 3)                        # H, A
    check('cell cycles empty->P->H->A', pg.inner_text('td[data-date="2026-09-09"]').strip().endswith('A'))
    cell('2026-09-09', 1)
    check('cell cycles A->empty', not pg.inner_text('td[data-date="2026-09-09"]').strip().endswith('A'))
    cell('2026-09-09', 3)                                               # back to A
    check('days before joining are not clickable', pg.locator('td[data-date="2025-07-01"]').count() == 0)
    check('weekly holiday is Monday: Monday cells are shaded, Sunday cells are not', pg.locator('td.ac.sun[data-date="2026-09-14"]').count() == 1 and pg.locator('td.ac.sun[data-date="2026-09-13"]').count() == 0)
    go('attSheet', json.dumps({'id': ids['Ashish Jarag'], 'year': 2026})); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/o-sheet.png', full_page=True)
    sheet_txt = pg.inner_text('.o-sheet tfoot')
    # payroll
    def payroll(ym='2026-09'):
        go('attPayroll', json.dumps({'ym': ym})); pg.wait_for_timeout(300)
    payroll()
    row = pg.inner_text('tr:has-text("Ashish Jarag")')
    print('  payroll row:', ' | '.join(row.split('\t')))
    check('Ashish Sept: 5 present + half day = 5.5 of 26 days -> salary 6,346', '5.5 / 26' in row and '6,346' in row, row)
    pg.fill(f'#o-bonus-{ids["Ashish Jarag"]}', '500'); pg.dispatch_event(f'#o-bonus-{ids["Ashish Jarag"]}', 'change')
    pg.fill(f'#o-ded-{ids["Ashish Jarag"]}', '1000'); pg.dispatch_event(f'#o-ded-{ids["Ashish Jarag"]}', 'change')
    check('bonus 500 and deduction 1000 -> net 5,846', '5,846' in pg.inner_text(f'#o-net-{ids["Ashish Jarag"]}'), pg.inner_text(f'#o-net-{ids["Ashish Jarag"]}'))
    row2 = pg.inner_text('tr:has-text("Rahul Patil")'); row3 = pg.inner_text('tr:has-text("Sunil More")')
    check('nothing marked -> no pay (Sundays are not paid)', '0 / 26' in row2 and '0 / 26' in row3, row2 + row3)
    go('attSheet', json.dumps({'id': ids['Rahul Patil'], 'year': 2026})); pg.wait_for_timeout(300)
    check('days before joining are not clickable (Rahul joined 15 Sep)', pg.locator('td[data-date="2026-09-14"]').count() == 0)
    pg.evaluate("document.getElementById('toasts').innerHTML=''"); pg.click('td[data-date="2026-09-15"]')
    go('attSheet', json.dumps({'id': ids['Sunil More'], 'year': 2026})); pg.wait_for_timeout(300)
    check('days after the last working day are not clickable (Sunil left 20 Sep)', pg.locator('td[data-date="2026-09-21"]').count() == 0 and pg.locator('td[data-date="2026-09-19"]').count() == 1)
    payroll(); r2 = pg.inner_text('tr:has-text("Rahul Patil")')
    check('joined mid-month: 1 day present -> 1/26 -> 1,000', '1 / 26' in r2 and '1,000' in r2, r2)
    check('unmarked-days warning shown', 'not marked yet' in body())
    pg.screenshot(path='/tmp/o-payroll.png', full_page=True)
    # Sunday work and working-days setting
    go('attSheet', json.dumps({'id': ids['Ashish Jarag'], 'year': 2026})); pg.wait_for_timeout(300)
    pg.evaluate("document.getElementById('toasts').innerHTML=''"); pg.click('td[data-date="2026-09-07"]')     # Monday (weekly holiday) worked
    payroll(); r = pg.inner_text('tr:has-text("Ashish Jarag")')
    check('Holiday (Monday) work paid as an extra day: 6.5/26 -> 7,500', '6.5 / 26' in r and '7,500' in r, r)
    pg.select_option('#o-sunwork', 'none'); pg.wait_for_timeout(200)
    r = pg.inner_text('tr:has-text("Ashish Jarag")'); check('Holiday work not paid extra: back to 5.5/26 -> 6,346', '5.5 / 26' in r and '6,346' in r, r)
    pg.fill('#o-workdays', '5'); pg.dispatch_event('#o-workdays', 'change'); pg.wait_for_timeout(200)
    r = pg.inner_text('tr:has-text("Ashish Jarag")'); check('payable days never exceed the working days (5/5 -> 30,000)', '5 / 5' in r and '30,000' in r, r)
    pg.fill('#o-workdays', '26'); pg.dispatch_event('#o-workdays', 'change'); pg.select_option('#o-sunwork', 'extra'); pg.wait_for_timeout(200)
    # future month: nothing counted
    payroll('2027-03'); check('future month has no pay', 'has not started' in body())
    # PDF + CSV
    payroll('2026-09')
    pg.click('[data-act="payPdf"]'); pg.wait_for_function('window.__pdfs.length>=2', timeout=15000)
    open('/tmp/salary.pdf', 'wb').write(base64.b64decode(pg.evaluate('window.__pdfs[1].b')))
    pg.click('[data-act="payCsv"]'); pg.wait_for_function('window.__saves.length>=1')
    csv = pg.evaluate('window.__saves[0].t'); print('  csv:', csv.replace('\r\n', ' // ')[:230])
    check('csv has total row', csv.splitlines()[-1].startswith('Total'))

    print('Daily marking')
    go('attToday'); pg.wait_for_timeout(300)
    today_str = pg.input_value('#o-att-date')
    pg.click('.o-row:has-text("Ashish Jarag") [data-st="P"]'); pg.wait_for_timeout(100)
    check('Present is highlighted', pg.get_attribute('.o-row:has-text("Ashish Jarag") [data-st="P"]', 'aria-pressed') == 'true')
    pg.click('.o-row:has-text("Ashish Jarag") [data-st="P"]'); pg.wait_for_timeout(100)
    check('tapping again clears it', pg.get_attribute('.o-row:has-text("Ashish Jarag") [data-st="P"]', 'aria-pressed') == 'false')
    pg.click('.o-row:has-text("Ashish Jarag") [data-st="H"]')
    pg.screenshot(path='/tmp/o-today.png', full_page=True)
    pg.click('[data-act="attDate"][data-delta="-1"]'); pg.wait_for_timeout(100)
    check('previous day works', pg.input_value('#o-att-date') != today_str)
    pg.click('[data-act="attDate"][data-delta="0"]')
    pg.click('[data-act="attAllPresent"]'); pg.wait_for_timeout(200)
    check('mark all not-yet-marked as present keeps Ashish at half day', pg.get_attribute('.o-row:has-text("Ashish Jarag") [data-st="H"]', 'aria-pressed') == 'true')

    print('Backup and restore')
    bk = pg.evaluate("JSON.stringify(window.MBM.makeBackup([], [], window.MBM_APP.S.settings, new Date()))")
    o = json.loads(bk)
    check('backup carries challans, employees and attendance', len(o['officeTools']['challans']) == 1 and len(o['officeTools']['employees']) == 3 and len(o['officeTools']['attendance']) >= 2)
    ctx2 = b.new_context(viewport={'width': 1366, 'height': 800}); ctx2.add_init_script(STUB)
    pg2 = ctx2.new_page(); pg2.goto(f'http://127.0.0.1:{port}/index.html'); pg2.wait_for_function('window.MBM_APP && typeof window.MBM_APP.SCREENS.attPayroll === "function"'); pg2.wait_for_timeout(300)
    open('/tmp/restore.json', 'w').write(bk)
    pg2.evaluate("window.MBM_APP.go('settings')"); pg2.wait_for_timeout(300)
    pg2.set_input_files('#restore-file', '/tmp/restore.json'); pg2.wait_for_timeout(500)
    pg2.click('#modal-root [data-i="1"]'); pg2.wait_for_timeout(600)
    msg = pg2.inner_text('#toasts')
    check('restore on a fresh PC brings the office data', 'Also restored 1 challan, 3 employees' in msg, msg)
    pg2.evaluate("window.MBM_APP.go('dashboard')"); pg2.wait_for_timeout(300)
    pg2.evaluate("window.MBM_APP.go('challanList',{})"); pg2.wait_for_timeout(300)
    check('restored challan number continues the series (next 26/33)', 'Next number: 26/33' in pg2.inner_text('body'), pg2.inner_text('body')[-500:])
    # reload keeps everything
    pg2.reload(); pg2.wait_for_function('window.MBM_APP && typeof window.MBM_APP.SCREENS.attPayroll === "function"'); pg2.wait_for_timeout(400)
    pg2.evaluate("window.MBM_APP.go('empList',{})"); pg2.wait_for_timeout(300); t2 = pg2.inner_text('body')
    check('data survives a restart', all(n in t2 for n in ['Ashish Jarag', 'Rahul Patil', 'Sunil More']), t2[:300])
    b.close()
real = [e for e in errors if 'favicon' not in e]
print('\nconsole/page errors:', real if real else 'none')
print('FAILED:', fails if fails else 'none')
sys.exit(1 if fails or real else 0)
