'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const PY = ['python3', 'python'].find((c) => { try { return spawnSync(c, ['--version']).status === 0; } catch (e) { return false; } });
const { LanSync } = require('../lansync');
const { Reminders } = require('../reminders');

let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); process.exitCode = 1; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const py = (...a) => new Promise((res) => { const p = spawn(PY, [path.join(__dirname, 'java_peer.py'), ...a]); let stdout = '', stderr = ''; p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; }); p.on('close', () => res({ stdout, stderr })); });

(async () => {
  console.log('Reminder engine');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mbm-'));
  const file = path.join(tmp, 'r.json');
  let clock = new Date(2026, 9, 20, 8, 0, 0).getTime(), shown = [];
  const mk = () => new Reminders({ file, notify: (i) => shown.push(i.title + '|' + i.id), now: () => clock });

  await test('fires a one-time reminder at its time, only once', () => {
    const r = mk();
    r.setItems([{ id: 1, title: 'Pay', body: 'x', at: new Date(2026, 9, 20, 9, 0, 0).getTime() }]);
    assert.strictEqual(shown.length, 0);
    clock = new Date(2026, 9, 20, 9, 0, 5).getTime(); r.tick(); r.tick();
    assert.deepStrictEqual(shown, ['Pay|1']);
    r.setItems([{ id: 1, title: 'Pay', body: 'x', at: new Date(2026, 9, 20, 9, 0, 0).getTime() }]);   // page re-sends the same list
    assert.strictEqual(shown.length, 1);
  });
  await test('catches up after the PC was off, and does not repeat after a restart', () => {
    shown = [];
    const r = mk();
    r.setItems([{ id: 2, title: 'Late', body: '', at: new Date(2026, 9, 20, 8, 30, 0).getTime() }]);
    assert.deepStrictEqual(shown, ['Late|2']);
    const r2 = mk(); r2.tick();                                   // new process reads the saved list + fired record
    assert.deepStrictEqual(shown, ['Late|2']);
  });
  await test('daily summary: fires once a day, skipped when missed by hours', () => {
    shown = []; clock = new Date(2026, 9, 21, 8, 59, 0).getTime();
    const r = mk(); r.setItems([{ id: 9, title: 'Digest', body: '', daily: { hour: 9, minute: 0 } }]);
    assert.strictEqual(shown.length, 0);
    clock = new Date(2026, 9, 21, 9, 0, 10).getTime(); r.tick(); r.tick();
    assert.strictEqual(shown.length, 1);
    clock = new Date(2026, 9, 22, 15, 0, 0).getTime(); r.tick();   // next day, started at 3 PM: too late, skip
    assert.strictEqual(shown.length, 1);
    clock = new Date(2026, 9, 23, 9, 1, 0).getTime(); r.tick();
    assert.strictEqual(shown.length, 2);
  });
  await test('ignores malformed items', () => {
    shown = []; const r = mk(); r.setItems([null, { id: 'x' }, { id: 3, title: 'ok' }, { id: 4, title: 'a', at: 'soon' }]); r.tick();
    assert.strictEqual(shown.length, 0);
  });

  console.log('Sync transport (Windows <-> Android wire format)');
  const A = new LanSync(), B = new LanSync();
  await A.start({ port: 48801, tag: 'tagA' });
  await B.start({ port: 48802, tag: 'tagB' });
  await test('HELLO returns the pairing tag', async () => {
    const r = await A.request({ host: '127.0.0.1', port: 48802, cmd: 'HELLO' });
    assert.deepStrictEqual([r.status, r.body], [200, 'tagB']);
  });
  await test('GET returns the snapshot, including non-ASCII text and a 3 MB body', async () => {
    const big = '₹é' + 'x'.repeat(3 * 1024 * 1024);
    B.setState({ tag: 'tagB', snapshot: big });
    const r = await A.request({ host: '127.0.0.1', port: 48802, cmd: 'GET', timeoutMs: 8000 });
    assert.strictEqual(r.body, big);
  });
  await test('PUSH is delivered to the listener with sender address', async () => {
    const got = new Promise((res) => B.once('peerPush', res));
    const r = await A.request({ host: '127.0.0.1', port: 48802, cmd: 'PUSH', body: 'payload-ü' });
    const ev = await got;
    assert.strictEqual(r.body, 'ok'); assert.strictEqual(ev.body, 'payload-ü'); assert.strictEqual(ev.from, '127.0.0.1');
  });
  await test('unreachable host fails quickly with a clear message', async () => {
    const t = Date.now();
    await assert.rejects(A.request({ host: '127.0.0.1', port: 48899, cmd: 'HELLO', connectMs: 500 }), /Could not reach/);
    assert.ok(Date.now() - t < 3000);
  });
  await test('a garbage client does not crash the listener', async () => {
    await new Promise((res) => { const s = require('net').connect(48801, '127.0.0.1', () => { s.write(Buffer.from([0xff, 0xff, 1, 2, 3])); s.destroy(); res(); }); });
    await sleep(100);
    const r = await B.request({ host: '127.0.0.1', port: 48801, cmd: 'HELLO' });
    assert.strictEqual(r.body, 'tagA');
  });
  await test('Android-format client (Java framing, independent Python) can talk to this listener', async () => {
    if (!PY) return console.log('       (skipped: Python not installed)');
    A.setState({ tag: 'tagA', snapshot: 'SNAP-from-windows' });
    let o = await py('client', '48801', 'HELLO'); assert.strictEqual(o.stdout.trim(), '200 tagA', o.stderr);
    o = await py('client', '48801', 'GET'); assert.strictEqual(o.stdout.trim(), '200 SNAP-from-windows', o.stderr);
  });
  await test('this app can talk to an Android-format listener', async () => {
    if (!PY) return;
    const p = spawn(PY, [path.join(__dirname, 'java_peer.py'), 'server', '48803', 'phoneTag', 'phone-snapshot']);
    let out = ''; p.stdout.on('data', (d) => { out += d; });
    for (let i = 0; i < 50 && !out.includes('READY'); i++) await sleep(100);
    const h = await A.request({ host: '127.0.0.1', port: 48803, cmd: 'HELLO' });
    assert.deepStrictEqual([h.status, h.body], [200, 'phoneTag']);
    const g = await A.request({ host: '127.0.0.1', port: 48803, cmd: 'GET' });
    assert.strictEqual(g.body, 'phone-snapshot');
    await A.request({ host: '127.0.0.1', port: 48803, cmd: 'PUSH', body: 'from-windows' });
    for (let i = 0; i < 50 && !out.includes('PUSHED'); i++) await sleep(100);
    assert.ok(out.includes('PUSHED from-windows'), out);
  });
  await A.stop(); await B.stop();
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' (with failures)' : ''));
})();
