/* Звук системы: синтез Web Audio, ни одного аудиофайла.
   Выключен по умолчанию; включается командой sfx on в терминале.
   Характер — приборный: щелчки реле и гул, не музыка. */

var ctx = null;
var enabled = false;

try { enabled = localStorage.getItem('sfx') === 'on'; } catch (e) {}

function ac() {
  if (!ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(node, t0, attack, decay, peak) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

export function setSfx(on) {
  enabled = !!on;
  try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch (e) {}
  if (on) ac();
}

export function sfxEnabled() { return enabled; }

/* отказ узла: короткий шумовой щелчок + падающий тон */
export function sfxKill() {
  if (!enabled) return;
  var c = ac(); if (!c) return;
  var t = c.currentTime;
  var o = c.createOscillator(), g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(340, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
  env(g, t, 0.004, 0.1, 0.07);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.13);
}

/* восстановление: мягкий восходящий тон */
export function sfxHeal() {
  if (!enabled) return;
  var c = ac(); if (!c) return;
  var t = c.currentTime;
  var o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.14);
  env(g, t, 0.01, 0.16, 0.05);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.2);
}

/* шторм: низкий фильтрованный шумовой накат */
export function sfxStorm() {
  if (!enabled) return;
  var c = ac(); if (!c) return;
  var t = c.currentTime;
  var len = Math.floor(c.sampleRate * 0.8);
  var buf = c.createBuffer(1, len, c.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(140, t);
  f.frequency.exponentialRampToValueAtTime(60, t + 0.8);
  env(g, t, 0.05, 0.75, 0.09);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}
