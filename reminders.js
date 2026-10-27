'use strict';
/* Reminder engine that lives in the main process, so reminders still appear when the window is closed
 * (the app keeps running in the system tray). The page works out WHAT is due and WHEN and hands the
 * list over; this file only waits for the time and shows the Windows notification.
 *
 * item: { id, title, body, at: <ms since epoch>, extra }            one-time
 *       { id, title, body, daily: {hour, minute}, extra }           every day (the 9:00 AM summary)
 */
const fs = require('fs');
const path = require('path');

const TICK_MS = 15000;
const DAILY_GRACE_MS = 3 * 60 * 60 * 1000;   // a daily summary missed by more than 3 hours is skipped
const FIRED_KEEP_MS = 4 * 24 * 60 * 60 * 1000;

class Reminders {
  constructor({ file, notify, now = () => Date.now() }) {
    this.file = file; this.notify = notify; this.now = now;
    this.items = []; this.fired = {}; this.timer = null;
    this._load();
  }
  _load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(j.items)) this.items = j.items;
      if (j.fired && typeof j.fired === 'object') this.fired = j.fired;
    } catch (e) { /* first run */ }
  }
  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ items: this.items, fired: this.fired }));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* not fatal */ }
  }
  start() { if (!this.timer) { this.timer = setInterval(() => this.tick(), TICK_MS); } this.tick(); }
  stop() { clearInterval(this.timer); this.timer = null; }

  setItems(items) {
    const clean = [];
    (Array.isArray(items) ? items : []).forEach((it) => {
      if (!it || typeof it.id !== 'number' || !it.title) return;
      const ok = (typeof it.at === 'number' && isFinite(it.at)) || (it.daily && isFinite(it.daily.hour));
      if (ok) clean.push({ id: it.id, title: String(it.title), body: String(it.body || ''), at: it.at, daily: it.daily, extra: it.extra || {} });
    });
    this.items = clean;
    this._save();
    this.tick();
  }

  _key(it, t) {
    if (it.daily) { const d = new Date(t); return it.id + '@' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    return it.id + '@' + it.at;
  }

  tick() {
    const t = this.now();
    let changed = false;
    this.items.forEach((it) => {
      let due = false;
      if (it.daily) {
        const d = new Date(t); d.setHours(it.daily.hour, it.daily.minute || 0, 0, 0);
        due = t >= d.getTime() && t - d.getTime() <= DAILY_GRACE_MS;
      } else due = it.at <= t;
      if (!due) return;
      const k = this._key(it, t);
      if (this.fired[k]) return;
      this.fired[k] = t; changed = true;
      try { this.notify(it); } catch (e) { /* keep going */ }
    });
    Object.keys(this.fired).forEach((k) => { if (t - this.fired[k] > FIRED_KEEP_MS) { delete this.fired[k]; changed = true; } });
    if (changed) this._save();
  }

  fireNow(it) { try { this.notify(it); return true; } catch (e) { return false; } }
}

module.exports = { Reminders };
