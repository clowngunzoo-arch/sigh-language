const $ = id => document.getElementById(id);
const video = $('v'), cv = $('c'), ctx = cv.getContext('2d');
const HOLD = 15;                       // frames a sign must stay steady
let out = '', last = null, streak = 0, rec = null, samples = [], lastResultAt = 0;

try { samples = JSON.parse(localStorage.getItem('asl_samples') || '[]'); } catch (e) {}
function save() { try { localStorage.setItem('asl_samples', JSON.stringify(samples)); } catch (e) {} $('cnt').textContent = samples.length; }
save();

'ABCDEFGHIKLMNOPQRSTUVWXY0123456789'.split('').forEach(ch => $('lab').add(new Option(ch, ch)));

const lmsg = t => { $('lmsg').textContent = t; };
const NOHANDS = 'The hand model is not running yet. Wait a few seconds (it needs internet) and try again.';
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- Built-in rules (static signs only) ----
function classify(L) {
  const s = d(L[0], L[9]);                                   // hand scale
  const n = (a, b) => d(L[a], L[b]) / s;
  const ext = (t, p) => d(L[t], L[0]) > d(L[p], L[0]) * 1.12;
  const I = ext(8, 6), M = ext(12, 10), R = ext(16, 14), P = ext(20, 18);
  const T = d(L[4], L[17]) > d(L[3], L[17]) * 1.05 && n(4, 5) > 0.55; // thumb out
  const cnt = I + M + R + P;

  if (cnt === 4) return T ? '5' : (n(8, 20) > 1.0 ? '4' : 'B');
  if (cnt === 3) {
    if (I && M && R && n(4, 20) < 0.45) return 'W / 6';
    if (I && M && P && n(4, 16) < 0.45) return '7';
    if (I && R && P && n(4, 12) < 0.45) return '8';
    if (M && R && P && n(4, 8) < 0.45) return 'F / 9';
    return null;
  }
  if (cnt === 2) {
    if (I && M) return T ? '3' : (n(8, 12) < 0.35 ? 'U' : 'V / 2');
    return null;
  }
  if (cnt === 1) {
    if (I) return n(4, 12) < 0.4 ? 'D' : (T ? 'L' : '1');
    if (P) return T ? 'Y' : 'I';
    return null;
  }
  if (n(4, 8) < 0.3) return 'O / 0';
  return T ? 'A' : 'S';
}

// ---- Nearest-neighbour on your own recorded samples ----
function feat(L, hand) {
  const s = d(L[0], L[9]), flip = hand === 'Left' ? -1 : 1, f = [];
  for (const p of L) f.push((p.x - L[0].x) / s * flip, (p.y - L[0].y) / s);
  return f;
}
function knn(f) {
  let best = null, bd = 1e9;
  for (const s of samples) {
    let t = 0;
    for (let i = 0; i < 42; i++) { const e = f[i] - s.f[i]; t += e * e; }
    t = Math.sqrt(t);
    if (t < bd) { bd = t; best = s.l; }
  }
  return bd < 1.5 ? best : null;
}

// ---- Text buffer ----
function setOut() { $('out').textContent = out; sendText(); renderSugg(); }
function current(lab) {
  $('big').textContent = lab || '–';
  if (lab && lab === last) streak++; else { streak = lab ? 1 : 0; last = lab; }
  $('bar').style.width = Math.min(100, streak / HOLD * 100) + '%';
  if (lab && streak === HOLD) {
    const parts = lab.split(' / ');
    out += parts.length > 1 ? parts[$('mode').value === '1' ? 1 : 0] : lab;
    setOut();
  }
}

// ---- Camera + MediaPipe ----
const chains = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20],[5,9,13,17]];
const hands = new Hands({ locateFile: f => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + f });
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
hands.onResults(r => {
  cv.width = video.videoWidth; cv.height = video.videoHeight;
  ctx.clearRect(0, 0, cv.width, cv.height);
  lastResultAt = performance.now();
  const Ls = r.multiHandLandmarks || [];
  const labs = (r.multiHandedness || []).map(h => h.label);

  for (const L of Ls) {
    ctx.strokeStyle = '#4fd1c5'; ctx.lineWidth = 3;
    for (const ch of chains) {
      ctx.beginPath();
      ch.forEach((i, k) => { const x = L[i].x * cv.width, y = L[i].y * cv.height; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const p of L) { ctx.beginPath(); ctx.arc(p.x * cv.width, p.y * cv.height, 4, 0, 7); ctx.fill(); }
  }
  if (tickCap(Ls, labs)) return;          // word capture in progress
  const L = Ls[0];
  if (!L) { current(null); return; }

  const f = feat(L, labs[0]);
  if (rec) {
    samples.push({ l: rec.l, f: f.map(x => +x.toFixed(3)) });
    rec.n--;
    $('rec').textContent = 'Recording… ' + (20 - rec.n) + '/20';
    if (rec.n === 0) {
      const l = rec.l; rec = null; save();
      $('rec').textContent = 'Record 20 samples'; $('rec').disabled = false;
      lmsg('Saved 20 samples for ' + l + '. You now have ' + samples.filter(s => s.l === l).length + ' for ' + l + '.');
    }
  }
  current(knn(f) || classify(L));
});

let busy = false;
async function loop() {
  if (video.readyState >= 2 && !busy) {
    busy = true;
    try { await hands.send({ image: video }); $('st').textContent = ''; }
    catch (e) { $('st').textContent = 'Could not load the hand model. Check your internet connection.'; }
    busy = false;
  }
  requestAnimationFrame(loop);
}
$('start').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: true });
    video.srcObject = stream;
    await video.play();
    $('start').hidden = true;
    $('st').textContent = 'Loading hand model…';
    loop();
  } catch (e) { $('st').textContent = 'Camera blocked: allow camera access and try again.'; }
};

// ---- Buttons ----
$('sp').onclick = () => { out += ' '; setOut(); };
$('bs').onclick = () => { out = out.slice(0, -1); setOut(); };
$('clr').onclick = () => { out = ''; setOut(); };
$('say').onclick = () => { if (out.trim()) speechSynthesis.speak(new SpeechSynthesisUtterance(out)); };
$('rec').onclick = () => {
  if (rec) return;
  if (!stream) return lmsg('Start the camera first.');
  if (performance.now() - lastResultAt > 1500) return lmsg(NOHANDS);
  rec = { l: $('lab').value, n: 20 };
  $('rec').disabled = true; $('rec').textContent = 'Recording… 0/20';
  lmsg('Hold the sign "' + rec.l + '" in view and turn your hand slightly. If the counter does not move, your hand is not being detected.');
};
$('wipe').onclick = () => { samples = []; save(); };

// ---- Video call (WebRTC through PeerJS) ----
let stream = null, peer = null, conn = null, call = null, myShort = '';
const callMsg = t => { $('callst').textContent = t; };
function sendText() { if (conn && conn.open) conn.send({ t: 'text', v: out }); }

function initPeer() {
  myShort = Math.random().toString(36).slice(2, 8);
  peer = new Peer('asl-' + myShort);
  peer.on('open', () => { $('myid').textContent = myShort; });
  peer.on('call', c => {
    c.answer(stream || undefined);              // no camera yet = receive only
    setupCall(c);
  });
  peer.on('connection', setupConn);
  peer.on('error', e => {
    if (e.type === 'unavailable-id') return initPeer();
    callMsg(e.type === 'peer-unavailable' ? "Couldn't find that ID. Check the spelling and make sure your friend has the app open." : 'Call error: ' + e.type);
  });
}
function setupCall(c) {
  call = c;
  c.on('stream', s => { $('rv').srcObject = s; $('rstage').hidden = false; $('rv').play().catch(() => {}); callMsg('Connected.'); });
  c.on('close', endCall);
}
function setupConn(c) {
  conn = c;
  c.on('open', sendText);
  c.on('data', m => { if (m && m.t === 'text') $('cap').textContent = m.v; });
  c.on('close', () => { conn = null; });
}
function endCall() {
  if (call) call.close();
  if (conn) conn.close();
  call = conn = null;
  $('rv').srcObject = null; $('rstage').hidden = true; $('cap').textContent = '';
  callMsg('Call ended.');
}
$('callbtn').onclick = () => {
  const id = $('rid').value.trim().toLowerCase();
  if (!stream) return callMsg('Start the camera first.');
  if (!id) return callMsg("Enter your friend's ID.");
  callMsg('Calling…');
  setupConn(peer.connect('asl-' + id));
  setupCall(peer.call('asl-' + id, stream));
};
$('hang').onclick = endCall;
$('copyid').onclick = () => { try { navigator.clipboard.writeText(myShort); callMsg('ID copied.'); } catch (e) {} };
$('sayfriend').onclick = () => { const t = $('cap').textContent; if (t.trim()) speechSynthesis.speak(new SpeechSynthesisUtterance(t)); };
initPeer();

// ---- Words: built-in signs + your own recordings ----
let words = [], cap = null;
try { words = JSON.parse(localStorage.getItem('asl_words') || '[]').filter(x => x.s && x.s[0] && x.s[0].length === 88); } catch (e) {}
const saveWords = () => { try { localStorage.setItem('asl_words', JSON.stringify(words)); } catch (e) {} renderWords(); };
const wmsg = t => { $('wmsg').textContent = t; };

// one frame = up to 2 hands (left-most first): hand shape + where the wrist is
function frame(Ls, labs) {
  const hs = Ls.map((L, i) => ({ f: feat(L, labs[i]), w: L[0] })).sort((a, b) => a.w.x - b.w.x).slice(0, 2);
  const o = [];
  for (let i = 0; i < 2; i++) { const h = hs[i]; if (h) o.push(...h.f, h.w.x * 3, h.w.y * 3); else o.push(...new Array(44).fill(0)); }
  return o;
}
function resample(fr, N = 20) {
  const o = [];
  for (let i = 0; i < N; i++) {
    const t = i * (fr.length - 1) / (N - 1), a = Math.floor(t), b = Math.min(a + 1, fr.length - 1), w = t - a;
    o.push(fr[a].map((v, k) => v * (1 - w) + fr[b][k] * w));
  }
  return o;
}
function dtw(a, b) {
  const n = a.length, m = b.length, D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    let c = 0; const x = a[i - 1], y = b[j - 1];
    for (let k = 0; k < x.length; k++) { const e = x[k] - y[k]; c += e * e; }
    D[i][j] = Math.sqrt(c) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
  }
  return D[n][m] / (n + m);
}

// Counts how many times a path changes direction by at least `amp`.
function reversals(a, amp) {
  let dir = 0, ext = a[0], c = 0;
  for (const v of a) {
    if (dir === 0) { if (v > ext + amp) { dir = 1; ext = v; } else if (v < ext - amp) { dir = -1; ext = v; } }
    else if (dir === 1) { if (v > ext) ext = v; else if (v < ext - amp) { dir = -1; ext = v; c++; } }
    else { if (v < ext) ext = v; else if (v > ext + amp) { dir = 1; ext = v; c++; } }
  }
  return c;
}

// Built-in one-hand signs, from hand shape + how the wrist moves.
function builtin(raws) {
  const R = raws.filter(r => r.n === 1);
  if (R.length < 6) return null;
  const fr = R.map(r => {
    const L = r.L, s = d(L[0], L[9]), n = (a, b) => d(L[a], L[b]) / s;
    const ext = (t, p) => d(L[t], L[0]) > d(L[p], L[0]) * 1.12;
    const I = ext(8, 6), M = ext(12, 10), Rg = ext(16, 14), P = ext(20, 18);
    return { s, x: L[0].x, y: L[0].y, I, M, R: Rg, P, cnt: I + M + Rg + P,
      T: d(L[4], L[17]) > d(L[3], L[17]) * 1.05 && n(4, 5) > 0.55,
      up: L[4].y < L[3].y && L[4].y < L[5].y,
      pinch: n(4, 8) < 0.5 && n(4, 12) < 0.5 && n(4, 16) < 0.5 && n(4, 20) < 0.5, d48: n(4, 8) };
  });
  const len = fr.length, k = Math.max(1, Math.min(4, Math.floor(len / 3)));
  const avg = (a, i, j) => a.slice(i, j).reduce((p, c) => p + c, 0) / (j - i);
  const S = avg(fr.map(f => f.s), 0, len), xs = fr.map(f => f.x), ys = fr.map(f => f.y);
  const dx = (avg(xs, len - k, len) - avg(xs, 0, k)) / S, dy = (avg(ys, len - k, len) - avg(ys, 0, k)) / S;
  let path = 0; for (let i = 1; i < len; i++) path += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / S;
  const net = Math.hypot(dx, dy), hx = reversals(xs, 0.35 * S), hy = reversals(ys, 0.35 * S);
  const circ = hx >= 1 && hy >= 1 && path > 2.5 && net < 0.9;
  const frac = fn => fr.filter(fn).length / len;

  if (frac(f => f.T && f.I && f.P && !f.M && !f.R) >= 0.6) return 'I LOVE YOU';
  if (frac(f => f.I && f.M && f.R && !f.P) >= 0.6) return 'WATER';
  if (frac(f => f.pinch) >= 0.4 && dy < -0.4) return 'EAT';
  if (frac(f => f.cnt === 0 && f.T && f.up) >= 0.6 && path < 2.5) return 'GOOD';
  if (frac(f => f.cnt === 0) >= 0.6) { if (circ) return 'SORRY'; if (hy >= 2) return 'YES'; if (hx >= 2) return 'BATHROOM'; return null; }
  if (frac(f => f.I && !f.M && !f.R && !f.P) >= 0.6) { if (hx >= 2) return 'WHERE'; if (path < 1.5) return 'WAIT'; return null; }
  if (frac(f => f.I && f.M && !f.R && !f.P) >= 0.6) {
    const a = avg(fr.map(f => f.d48), 0, k), b = avg(fr.map(f => f.d48), len - k, len);
    return a - b > 0.3 && b < 0.4 ? 'NO' : null;
  }
  if (frac(f => f.cnt === 4) >= 0.6) {
    if (hx >= 2) return 'HELLO';
    if (circ) return 'PLEASE';
    if (dy > 0.8) return 'THANK YOU';
    if (path < 1.5) return 'STOP';
  }
  return null;
}

const setBusy = b => { $('recword').disabled = b; $('signword').disabled = b; };
function startCapture(cb) {
  if (cap) return;
  if (performance.now() - lastResultAt > 1500) return wmsg(NOHANDS);
  cap = { t0: performance.now(), frames: [], raws: [], miss: 0, cb, phase: 'count' };
  setBusy(true);
}
function tickCap(Ls, labs) {
  if (!cap) return false;
  const t = performance.now() - cap.t0;
  if (cap.phase === 'count') {
    if (t < 2000) { $('big').textContent = Math.ceil((2000 - t) / 1000); return true; }
    cap.phase = 'rec'; cap.t1 = performance.now();
  }
  $('big').textContent = '● REC ' + cap.frames.length;
  $('bar').style.width = Math.min(100, (performance.now() - cap.t1) / 25) + '%';
  wmsg('Recording… ' + cap.frames.length + ' frames captured. Keep signing, then lower your hand.');
  if (Ls.length) { cap.frames.push(frame(Ls, labs)); cap.raws.push({ L: Ls[0], n: Ls.length }); cap.miss = 0; } else cap.miss++;
  if (performance.now() - cap.t1 > 2500 || (cap.frames.length >= 8 && cap.miss >= 8)) {
    const c = cap; cap = null; last = null; streak = 0; $('bar').style.width = '0'; setBusy(false);
    c.cb(c.frames.length >= 6 ? resample(c.frames) : null, c.raws);
  }
  return true;
}
function renderWords() {
  const box = $('wlist'); box.innerHTML = '';
  [...new Set(words.map(x => x.w))].forEach(w => {
    const b = document.createElement('button');
    b.textContent = w + ' (' + words.filter(x => x.w === w).length + ') ✕';
    b.title = 'Delete this word';
    b.onclick = () => { words = words.filter(x => x.w !== w); saveWords(); };
    box.appendChild(b);
  });
}
$('thr').oninput = () => { $('thrv').textContent = $('thr').value; };
$('recword').onclick = () => {
  const w = $('wname').value.trim().toLowerCase();
  if (!stream) return wmsg('Start the camera first.');
  if (!w) return wmsg('Type the word first.');
  wmsg('Sign after the countdown…');
  startCapture(seq => {
    if (!seq) return wmsg('No hand detected. Try again.');
    words.push({ w, s: seq.map(f => f.map(v => +v.toFixed(3))) });
    saveWords();
    const k = words.filter(x => x.w === w).length;
    wmsg('Saved "' + w + '": ' + k + ' recording' + (k > 1 ? 's' : '') + ' so far. ' + (k < 3 ? 'Record it ' + (3 - k) + ' more time' + (k === 2 ? '' : 's') + '.' : 'Good. More recordings make it more accurate.'));
  });
};
$('signword').onclick = () => {
  if (!stream) return wmsg('Start the camera first.');
  wmsg('Sign after the countdown…');
  startCapture((seq, raws) => {
    if (!seq) return wmsg('No hand detected. Try again.');
    let best = null, bd = 1e9;
    for (const x of words) { const dd = dtw(seq, x.s); if (dd < bd) { bd = dd; best = x.w; } }
    let hit = null, note = '';
    if (best && bd <= +$('thr').value) { hit = best; note = ' (your recording, ' + bd.toFixed(2) + ')'; }
    else { hit = builtin(raws); if (hit) note = ' (built-in)'; }
    if (hit) { out += hit.toUpperCase() + ' '; setOut(); wmsg('Recognized: ' + hit.toLowerCase() + note); }
    else wmsg('Not recognized.' + (best ? ' Closest of your recordings: ' + best + ' (' + bd.toFixed(2) + '). Raise Tolerance if that was right.' : ' Try again, or record this sign yourself.'));
  });
};
renderWords();

// ---- Word suggestions from the letters you spelled ----
const BASE = ('hello hi thanks thank please sorry help yes no good morning night evening love family friend mother father sister brother baby ' +
  'name water food eat drink sleep happy sad angry tired hungry sick home school work church market money phone book car bus road city ' +
  'time day today tomorrow yesterday week month year when where what who why how come go stop wait want need like know think see look ' +
  'hear say tell ask give take make do have be am is are was will can cannot not and or but because with without for from to in on at ' +
  'big small hot cold new old fast slow beautiful nice fine well very more again always never maybe welcome goodbye bye understand learn ' +
  'teach read write talk sign deaf hearing language english filipino ' +
  'kumusta salamat paalam sige oo hindi po opo tulong mahal kita ako ikaw siya kami tayo pangalan magandang umaga hapon gabi araw bahay ' +
  'pamilya kaibigan trabaho pagkain tubig mabuti masaya malungkot pasensya').split(' ');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function renderSugg() {
  const box = $('sugg'); box.innerHTML = '';
  const m = out.match(/[A-Za-z]+$/); if (!m) return;
  const frag = m[0].toLowerCase();
  const mine = words.map(x => x.w), pool = [...new Set([...mine, ...BASE])];
  let res = pool.filter(w => w.startsWith(frag) && w !== frag).sort((a, b) => (mine.includes(b) - mine.includes(a)) || a.length - b.length).slice(0, 6);
  if (!res.length && frag.length >= 3) res = pool.filter(w => Math.abs(w.length - frag.length) <= 1 && lev(w, frag) <= 1).slice(0, 4);
  res.forEach(w => {
    const b = document.createElement('button'); b.textContent = w;
    b.onclick = () => { out = out.slice(0, out.length - frag.length) + w.toUpperCase() + ' '; setOut(); };
    box.appendChild(b);
  });
}

// ---- Make it installable (PWA) ----
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
