import http.server, threading, functools, base64, json, subprocess, sys
from playwright.sync_api import sync_playwright
import os
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.join(HERE,'..','app')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
seed=json.load(open(os.path.join(HERE,'gst_seed.json')))
INIT="""window.__files=[];
if(!localStorage.getItem('__seeded')){ const recs=%s; recs.forEach(r=>localStorage.setItem('mbm:gst:'+r.id,JSON.stringify(r))); localStorage.setItem('__seeded','1'); }
window.MBM_DESKTOP={platform:'windows',setReminders:async()=>true,autoBackup:async()=>true,onReminderOpen:()=>{}};
window.NativeFileBridge={saveFile:async(n,t)=>{window.__files.push({n,t});return {canceled:false,path:'x'}},saveBase64:async(n,b)=>{window.__files.push({n,b});return {canceled:false,path:'x'}}};
window.NativeNotify={status:async()=>'granted',test:async()=>true};""" % json.dumps(seed)
errs=[]; fails=[]
def check(n,c,extra=''):
    print(('  ok   ' if c else '  FAIL ')+n+('' if c else '  -> '+str(extra)));
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':1000}); ctx.add_init_script(INIT+"try{localStorage.getItem('mbm:theme')||localStorage.setItem('mbm:theme','dark')}catch(e){}")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_function('window.MBM_GST && document.querySelector(".topbar")'); pg.wait_for_timeout(400)
    check('dashboard has the GST Filing tile next to Add PO etc.', pg.locator('[data-a="qa5"]:has-text("GST Filing")').count()==1)
    pg.screenshot(path='/tmp/gst/dash.png')
    pg.click('[data-a="qa5"]'); pg.wait_for_timeout(500)
    pg.evaluate("window.MBM_GST.state.ym='2026-09'"); pg.evaluate("window.MBM_APP.render()"); pg.wait_for_timeout(400)
    pg.evaluate("document.getElementById('toasts').innerHTML=''")
    pg.screenshot(path='/tmp/gst/sales-tab.png')
    check('suggested next invoice number is STA-26-27/44', pg.input_value('#g-no')=='STA-26-27/44', pg.input_value('#g-no'))
    txt=pg.inner_text('body'); check('missing invoice number 34 is flagged', 'STA-26-27/34' in txt)
    # live entry: intra-state sale
    pg.fill('#g-date','23/09/2026'); pg.fill('#g-party','Kirloskar Oil Engines Ltd.'); pg.fill('#g-gstin','27AADCK5714H1ZK'); pg.fill('#g-hsn','84748030'); pg.fill('#g-taxable','10000')
    check('intra-state: CGST 900 + SGST 900, total 11,800', pg.input_value('#g-cgst')=='900.00' and pg.input_value('#g-sgst')=='900.00' and pg.input_value('#g-igst')=='0.00' and pg.input_value('#g-total')=='11800.00', [pg.input_value(i) for i in ['#g-cgst','#g-sgst','#g-igst','#g-total']])
    pg.select_option('#g-rate','12'); check('rate 12% recalculates (CGST 600, total 11,200)', pg.input_value('#g-cgst')=='600.00' and pg.input_value('#g-total')=='11200.00')
    pg.select_option('#g-rate','18')
    pg.fill('#g-gstin','29ABCDE1234F1Z5'); check('other state: IGST 1,800, no CGST/SGST, place of supply Karnataka', pg.input_value('#g-igst')=='1800.00' and pg.input_value('#g-cgst')=='0.00' and pg.input_value('#g-pos')=='29', [pg.input_value('#g-igst'),pg.input_value('#g-pos')])
    pg.fill('#g-gstin','27AADCK5714H1ZK'); pg.fill('#g-total','11800'); pg.fill('#g-taxable','')
    pg.fill('#g-total','11800'); check('typing only the total works backwards (taxable 10,000)', pg.input_value('#g-taxable')=='10000.00', pg.input_value('#g-taxable'))
    pg.fill('#g-no','STA-26-27/44'); pg.click('[data-act="gstSave"]'); pg.wait_for_timeout(500)
    check('saved invoice appears in the Sept list', 'STA-26-27/44' in pg.inner_text('.o-gst'))
    pg.click('[data-act="gstSave"]'); pg.wait_for_timeout(200)
    check('empty form is refused', 'Enter the invoice date' in pg.inner_text('#toasts'))
    pg.fill('#g-date','24/09/2026'); pg.fill('#g-no','sta-26-27/44'); pg.fill('#g-gstin','27AADCK5714H1ZK'); pg.fill('#g-taxable','100'); pg.click('[data-act="gstSave"]'); pg.wait_for_timeout(300)
    check('duplicate invoice number for the same GSTIN is refused', 'already saved' in pg.inner_text('#toasts'))
    pg.evaluate("document.getElementById('toasts').innerHTML=''")
    # downloads
    base=len(pg.evaluate('window.__files'))
    pg.click('[data-fmt="csv"]'); pg.wait_for_function(f'window.__files.length>{base}'); 
    pg.click('[data-fmt="xlsx"]'); pg.wait_for_function(f'window.__files.length>{base+1}')
    pg.click('[data-fmt="pdf"]'); pg.wait_for_function(f'window.__files.length>{base+2}',timeout=20000)
    f=pg.evaluate('window.__files'); names=[x['n'] for x in f[base:]]; print('  files:',names)
    check('file names follow your pattern', names==['09_GSTR1_SALES_SEP_2026.csv','09_GSTR1_SALES_SEP_2026.xlsx','09_GSTR1_SALES_SEP_2026.pdf'], names)
    # purchases tab
    pg.click('[data-act="gstTab"][data-kind="purchase"]'); pg.wait_for_timeout(400); pg.evaluate("document.getElementById('toasts').innerHTML=''; window.scrollTo(0,0)")
    pg.screenshot(path='/tmp/gst/purchase-tab.png')
    check('purchase place of supply defaults to your own state', pg.input_value('#g-pos')=='27')
    b0=len(pg.evaluate('window.__files'))
    pg.click('[data-fmt="csv"]'); pg.wait_for_function(f'window.__files.length>{b0}'); pg.click('[data-fmt="xlsx"]'); pg.wait_for_function(f'window.__files.length>{b0+1}'); pg.click('[data-fmt="pdf"]'); pg.wait_for_function(f'window.__files.length>{b0+2}',timeout=20000)
    f=pg.evaluate('window.__files'); open('/tmp/gst/purch.csv','w',encoding='utf8').write(f[b0]['t']); open('/tmp/gst/purch.xlsx','wb').write(base64.b64decode(f[b0+1]['b'])); open('/tmp/gst/purch.pdf','wb').write(base64.b64decode(f[b0+2]['b']))
    check('purchase file names', [x['n'] for x in f[b0:]]==['09_GSTR2_PURCHASE_SEP_2026.csv','09_GSTR2_PURCHASE_SEP_2026.xlsx','09_GSTR2_PURCHASE_SEP_2026.pdf'])
    # backup carries GST
    bk=json.loads(pg.evaluate("JSON.stringify(window.MBM.makeBackup([],[],window.MBM_APP.S.settings,new Date()))"))
    check('backup carries the GST invoices', len(bk['officeTools']['gst']['records'])==54, len(bk.get('officeTools',{}).get('gst',{}).get('records',[])))
    b.close()
print('errors:',errs or 'none'); print('FAILED:',fails or 'none')
sys.exit(1 if fails or errs else 0)
