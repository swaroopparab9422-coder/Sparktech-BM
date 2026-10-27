'use strict';
/* Computer-side twin of the Android "LanSync" plugin (LanSyncPlugin.java).
 * Same plain-TCP wire format, so this computer and the phones can sync with each other.
 *   Request / reply framing (same as Java DataOutputStream):
 *     request : writeUTF(cmd)  = uint16 length + bytes, then int32 bodyLength, then body
 *     reply   : int32 status, int32 bodyLength, body
 *   Commands: HELLO (returns the pairing tag), GET (returns the snapshot), PUSH (delivers a snapshot)
 * Everything in a body is already AES-GCM encrypted by the page; this file never sees plain data.
 */
const net = require('net');
const os = require('os');
const { EventEmitter } = require('events');

const MAX_BYTES = 32 * 1024 * 1024;
const SKIP_NICS = /vmware|virtualbox|vethernet|wsl|hyper-v|docker|vpn|\btap\b|\btun\b|loopback|bluetooth|npcap|tailscale|zerotier|hamachi/i;

function isPrivate(ip) {
  const p = ip.split('.').map(Number);
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}
function localIps() {
  const out = [];
  const nics = os.networkInterfaces();
  Object.keys(nics).forEach((name) => {
    if (SKIP_NICS.test(name)) return;
    (nics[name] || []).forEach((a) => {
      const fam = typeof a.family === 'string' ? a.family === 'IPv4' : a.family === 4;
      if (fam && !a.internal && isPrivate(a.address) && out.indexOf(a.address) < 0) out.push(a.address);
    });
  });
  return out;
}

function encodeFrame(cmdOrStatus, body, isRequest) {
  const b = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  let head;
  if (isRequest) {
    const c = Buffer.from(cmdOrStatus, 'utf8');
    head = Buffer.alloc(2 + c.length + 4);
    head.writeUInt16BE(c.length, 0); c.copy(head, 2); head.writeInt32BE(b.length, 2 + c.length);
  } else {
    head = Buffer.alloc(8);
    head.writeInt32BE(cmdOrStatus, 0); head.writeInt32BE(b.length, 4);
  }
  return Buffer.concat([head, b]);
}

/* Incremental reader so partial TCP chunks are handled. Calls onFrame once a full frame has arrived. */
function frameReader(isRequest, onFrame, onError) {
  let buf = Buffer.alloc(0), done = false;
  return function feed(chunk) {
    if (done) return;
    buf = Buffer.concat([buf, chunk]);
    try {
      let off = 0, head;
      if (isRequest) {
        if (buf.length < 2) return;
        const cl = buf.readUInt16BE(0);
        if (buf.length < 2 + cl + 4) return;
        head = buf.toString('utf8', 2, 2 + cl); off = 2 + cl;
      } else {
        if (buf.length < 4) return;
        head = buf.readInt32BE(0); off = 4;
        if (buf.length < off + 4) return;
      }
      const len = buf.readInt32BE(off); off += 4;
      if (len < 0 || len > MAX_BYTES) throw new Error('bad length');
      if (buf.length < off + len) return;
      done = true;
      onFrame(head, buf.subarray(off, off + len));
    } catch (e) { done = true; onError(e); }
  };
}

class LanSync extends EventEmitter {
  constructor() {
    super();
    this.server = null; this.tag = ''; this.snapshot = Buffer.alloc(0);
  }

  start({ port = 48765, tag } = {}) {
    if (typeof tag === 'string') this.tag = tag;
    return new Promise((resolve, reject) => {
      const done = () => resolve({ port, ips: localIps() });
      if (this.server && this.server.listening) return done();
      const srv = net.createServer((sock) => this._handle(sock));
      srv.once('error', (e) => { this.server = null; reject(new Error('Could not start sync listener: ' + e.message)); });
      srv.listen(port, '0.0.0.0', () => { this.server = srv; srv.on('error', () => {}); done(); });
    });
  }
  setState({ tag, snapshot } = {}) {
    if (typeof tag === 'string') this.tag = tag;
    if (typeof snapshot === 'string') this.snapshot = Buffer.from(snapshot, 'utf8');
  }
  stop() {
    const s = this.server; this.server = null;
    return new Promise((r) => { if (!s) return r(); try { s.close(() => r()); } catch (e) { r(); } setTimeout(r, 300); });
  }
  getIps() { return { ips: localIps() }; }

  _handle(sock) {
    sock.setTimeout(8000, () => sock.destroy());
    sock.on('error', () => {});
    sock.setNoDelay(true);
    const feed = frameReader(true, (cmd, body) => {
      let reply;
      if (cmd === 'HELLO') reply = Buffer.from(this.tag, 'utf8');
      else if (cmd === 'GET') reply = this.snapshot;
      else if (cmd === 'PUSH') {
        reply = Buffer.from('ok');
        this.emit('peerPush', { body: body.toString('utf8'), from: (sock.remoteAddress || '').replace(/^::ffff:/, '') });
      } else reply = Buffer.alloc(0);
      sock.end(encodeFrame(200, reply, false));
    }, () => sock.destroy());
    sock.on('data', feed);
  }

  /** Send one command to another device and return {status, body}. */
  request({ host, port = 48765, cmd = 'GET', body = '', timeoutMs = 6000, connectMs = 1500 } = {}) {
    return new Promise((resolve, reject) => {
      if (!host) return reject(new Error('No address given'));
      let finished = false;
      const sock = new net.Socket();
      const fail = (e) => { if (finished) return; finished = true; clearTimeout(ct); sock.destroy(); reject(new Error('Could not reach ' + host + ': ' + (e && e.message || e))); };
      const ct = setTimeout(() => fail(new Error('connect timed out')), connectMs);
      sock.setNoDelay(true);
      sock.once('error', fail);
      sock.once('timeout', () => fail(new Error('timed out')));
      sock.connect(port, host, () => {
        clearTimeout(ct);
        sock.setTimeout(timeoutMs);
        sock.write(encodeFrame(cmd, body, true));
      });
      sock.on('data', frameReader(false, (status, b) => {
        if (finished) return; finished = true; sock.destroy();
        resolve({ status, body: b.toString('utf8') });
      }, fail));
    });
  }

  /** Look for the other device in this computer's own /24 network(s). */
  async scan({ port = 48765, tag = '', connectMs = 700 } = {}) {
    const own = localIps(), targets = [];
    own.forEach((ip) => {
      const prefix = ip.slice(0, ip.lastIndexOf('.') + 1);
      for (let i = 1; i <= 254; i++) { const c = prefix + i; if (own.indexOf(c) < 0 && targets.indexOf(c) < 0) targets.push(c); }
    });
    const found = [], deadline = Date.now() + 25000;
    let next = 0;
    const worker = async () => {
      while (next < targets.length && Date.now() < deadline) {
        const host = targets[next++];
        try {
          const r = await this.request({ host, port, cmd: 'HELLO', timeoutMs: 1500, connectMs });
          if (r.status === 200 && r.body === tag) found.push(host);
        } catch (e) { /* nothing there */ }
      }
    };
    await Promise.all(Array.from({ length: 64 }, worker));
    return { hosts: found };
  }
}

module.exports = { LanSync, localIps, encodeFrame, frameReader };
