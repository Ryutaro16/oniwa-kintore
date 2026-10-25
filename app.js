'use strict';
/* 毎日トレーニング v1
   ・サーキットタイマー：種目名を登録し、声で「つぎは〇〇」と案内する
   ・お庭：運動を終えるたびにお水をあげて植物が育つ（枯れない）。やった日はカレンダーにお花のスタンプ
   データはこのiPhoneの中（localStorage）だけに保存する。外へは送らない */

const VERSION = '1.1.0';
const KEY = 'kintore-garden-v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, '0');
const mmss = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; };
const jpSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}分${s % 60 ? `${s % 60}秒` : ''}` : `${s}秒`);
const jpMin = (s) => (s < 60 ? `${s}秒` : `約${Math.round(s / 60)}分`);
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ---------- はじめから入っているメニュー ---------- */
const PRESETS = [
  { name: 'おうちサーキット', prep: 10, work: 30, rest: 15, sets: 2, setRest: 60, cool: 30,
    exercises: ['スクワット', '壁腕立て', 'もも上げ', 'かかと上げ', 'ひざ上げ腹筋', 'その場足踏み'] },
  { name: 'やさしい5分', prep: 10, work: 30, rest: 30, sets: 1, setRest: 0, cool: 60,
    exercises: ['いすスクワット', '肩まわし', 'かかと上げ', 'その場足踏み'] },
  // 種目なし（時間だけ）。exercises が空のメニューは「回数」でくり返す
  { name: 'かんたんタイマー', prep: 10, work: 30, rest: 15, sets: 8, setRest: 0, cool: 0,
    exercises: [] },
];
const noEx = (m) => !m.exercises.length;
const QUICK_EX = ['スクワット', '腕立て', '壁腕立て', 'もも上げ', 'かかと上げ', '腹筋', 'プランク', 'ランジ', 'その場足踏み', '肩まわし', 'ジャンプ', 'バーピー'];

/* ---------- 植物 ---------- */
// need＝咲くまでのお水の回数。最初のチューリップは週3〜4回の運動で約1週間、先の植物ほどむずかしい
const PLANTS = [
  { id: 'tulip', name: 'チューリップ', type: 'tulip', color: '#E8879B', need: 4, word: '思いやり' },
  { id: 'gerbera', name: 'ガーベラ', type: 'daisy', color: '#F2A07B', center: '#8A5A3B', n: 16, r: 28, need: 5, word: '希望・前進' },
  { id: 'sunflower', name: 'ひまわり', type: 'daisy', color: '#F3C64F', center: '#7A5230', n: 14, r: 34, need: 6, word: 'あこがれ' },
  { id: 'hydrangea', name: 'あじさい', type: 'cluster', color: '#9FB3E3', color2: '#B9A3DA', need: 7, word: '辛抱強い愛情' },
  { id: 'rose', name: 'バラ', type: 'rose', color: '#D45D74', need: 8, word: '愛・美' },
  { id: 'lavender', name: 'ラベンダー', type: 'spike', color: '#A88BCF', need: 9, word: '期待' },
  { id: 'sakura', name: '桜', type: 'tree', color: '#F5B8C6', need: 10, word: '精神の美' },
  { id: 'orchid', name: 'こちょうらん', type: 'orchid', color: '#FBF1F5', center: '#D9779A', need: 12, word: '幸福が飛んでくる' },
  { id: 'pineapple', name: 'パイナップル', type: 'pine', color: '#E9B949', need: 14, word: '完全無欠' },
];
const STAGES = ['たね', '芽', 'ふたば', 'つぼみ', '花'];
// お水 w 回のときの育ち具合（0〜4）。1回で芽、need回で花、そのあいだを3等分
const stageOf = (w, need) => (w <= 0 ? 0 : w >= need ? 4 : 1 + Math.floor(((w - 1) * 3) / (need - 1)));
const needOf = (i) => PLANTS[i].need;
const stars = (need) => '★'.repeat(Math.min(5, Math.ceil((need - 3) / 2))) || '★';
const STAGE_MSG = ['', '芽が出ました', 'ふたばになりました', 'つぼみができました', '咲きました'];

/* ---------- 保存 ---------- */
function defaults() {
  const menus = PRESETS.map((p) => ({ id: uid(), ...p, exercises: [...p.exercises] }));
  return {
    v: 1, menus, cur: menus[0].id,
    settings: { voice: true, tenSec: true, beep: true, rate: 'normal', silentOk: true },
    log: [], // { d:'2026-10-25', t: 時刻, kind:'timer'|'manual', menu, sec }
    garden: { plant: 0, water: 0, coll: {}, blooms: 0, hist: [] }, // hist: 咲いた記録 { id, d }
  };
}
let S;
function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S = { ...base, ...d, settings: { ...base.settings, ...d.settings }, garden: { ...base.garden, ...d.garden } };
      if (!Array.isArray(S.menus) || !S.menus.length) S.menus = base.menus;
      migrate();
      return;
    }
  } catch { /* 読めないときは初期状態で始める */ }
  S = base;
}
// 前の版のデータを今の形に合わせる
function migrate() {
  // タバタ（はじめから入っていたもの）は「かんたんタイマー」に置き換える（2026-10-25 龍太郎の選択）
  S.menus = S.menus.map((m) => (m.name === 'タバタ' && m.work === 20 && m.rest === 10 && m.sets === 8
    && m.exercises.length === 1 && m.exercises[0] === 'ワークアウト' ? { id: m.id, ...PRESETS[2], exercises: [] } : m));
  const g = S.garden;
  if (!Array.isArray(g.hist)) {
    g.hist = [];
    PLANTS.forEach((p) => { for (let i = 0; i < (g.coll[p.id] || 0); i++) g.hist.push({ id: p.id, d: '' }); });
  }
  // 咲くまでの回数が変わったので、咲く前の植物は「あと1回で咲く」より先へ進めない
  if (g.water > needOf(g.plant)) g.water = needOf(g.plant) - 1;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('保存できませんでした'); }
}
const curMenu = () => S.menus.find((m) => m.id === S.cur) || S.menus[0];

/* ---------- タイマーの流れ（区切りの並び） ---------- */
function buildSegs(m) {
  const ex = m.exercises.length ? m.exercises : ['ワークアウト'];
  const segs = [];
  if (m.prep > 0) segs.push({ k: 'prep', dur: m.prep, ex: ex[0], set: 0 });
  for (let s = 0; s < m.sets; s++) {
    ex.forEach((name, i) => {
      segs.push({ k: 'work', dur: m.work, ex: name, set: s });
      const lastEx = i === ex.length - 1;
      if (lastEx && s === m.sets - 1) return;
      if (lastEx) {
        const d = m.setRest > 0 ? m.setRest : m.rest;
        if (d > 0) segs.push({ k: m.setRest > 0 ? 'setrest' : 'rest', dur: d, ex: ex[0], set: s + 1 });
      } else if (m.rest > 0) segs.push({ k: 'rest', dur: m.rest, ex: ex[i + 1], set: s });
    });
  }
  if (m.cool > 0) segs.push({ k: 'cool', dur: m.cool, ex: '', set: m.sets });
  return segs;
}
const totalSec = (m) => buildSegs(m).reduce((a, s) => a + s.dur, 0);
const PH = { prep: '準備', work: 'ワークアウト', rest: '休憩', setrest: 'セット間の休憩', cool: 'クールダウン', done: 'おわり' };

/* ---------- 音・声 ---------- */
let audioCtx = null;
// iPhoneでは、音を出す前に一度ボタン操作の中で準備しておく必要がある
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = S.settings.silentOk ? 'playback' : 'auto'; } catch { /* 未対応 */ }
  try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* 音が出せない環境 */ }
  try { if (window.speechSynthesis && !unlockAudio.done) { speechSynthesis.speak(new SpeechSynthesisUtterance('')); unlockAudio.done = true; } } catch { /* 読み上げが使えない環境 */ }
}
const TONES = {
  pop: [[880, 0, 0.09]],
  chime: [[988, 0, 0.14], [1319, 0.15, 0.26]],
  fanfare: [[784, 0, 0.12], [988, 0.13, 0.12], [1175, 0.26, 0.12], [1568, 0.4, 0.45]],
  sparkle: [[1568, 0, 0.08], [2093, 0.07, 0.08], [2637, 0.14, 0.1], [3136, 0.22, 0.3]],
  bloom: [[523, 0, 0.16], [659, 0.16, 0.16], [784, 0.32, 0.16], [1047, 0.48, 0.32], [988, 0.82, 0.12], [1047, 0.95, 0.12],
    [1319, 1.08, 0.5], [2093, 1.15, 0.08], [2637, 1.22, 0.08], [3136, 1.29, 0.35]],
};
function playTone(kind) {
  return new Promise((res) => {
    if (!audioCtx) { res(); return; }
    const t0 = audioCtx.currentTime + 0.02;
    let end = 0;
    for (const [f, at, dur] of TONES[kind]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      end = Math.max(end, at + dur);
    }
    setTimeout(res, (end + 0.05) * 1000);
  });
}
const RATE = { slow: 0.9, normal: 1.05, fast: 1.25 };
function jaVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  return vs.find((v) => v.lang === 'ja-JP' && /Kyoko|O-ren|Otoya/.test(v.name)) || vs.find((v) => (v.lang || '').startsWith('ja'));
}
function say(text, interrupt = false) {
  if (!S.settings.voice || !text || !window.speechSynthesis) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = RATE[S.settings.rate] || 1.05;
    const v = jaVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* 読み上げ失敗は無視 */ }
}
function stopSpeech() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch { /* なし */ } }

/* 画面が自動で消えないようにする（消えるとタイマーと声が止まるため） */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* 未対応・拒否 */ }
}

/* ---------- タイマー ---------- */
const T = { segs: [], idx: 0, state: 'idle', endAt: 0, left: 0, lastSec: 0, menuId: null, timer: null };
const timerMenu = () => S.menus.find((m) => m.id === T.menuId) || curMenu();
function resetTimer() {
  clearInterval(T.timer);
  const m = curMenu();
  Object.assign(T, { segs: buildSegs(m), idx: 0, state: 'idle', menuId: m.id });
  T.left = T.segs[0].dur;
  stopSpeech(); keepAwake(false);
  updateTimer();
}
function announce(seg) {
  const m = timerMenu();
  let text = '';
  const exName = (n) => (n === 'ワークアウト' ? '' : n);
  const last = seg.k === 'work' && !T.segs.slice(T.segs.indexOf(seg) + 1).some((s) => s.k === 'work');
  if (seg.k === 'prep') text = exName(seg.ex) ? `準備してください。さいしょは、${seg.ex}` : '準備してください';
  else if (seg.k === 'work') text = `${last ? 'ラスト、' : ''}${exName(seg.ex) ? `${seg.ex}、` : ''}スタート`;
  else if (seg.k === 'rest') text = exName(seg.ex) ? `休憩。つぎは、${seg.ex}` : '休憩';
  else if (seg.k === 'setrest') text = `セットの間の休憩です。のこり${m.sets - seg.set}セット`;
  else if (seg.k === 'cool') text = 'クールダウン。ゆっくり呼吸しましょう';
  playTone('chime').then(() => say(text, true));
}
function cue(sec) {
  const seg = T.segs[T.idx];
  if (!seg) return;
  if (sec >= 1 && sec <= 3 && seg.dur > 4 && S.settings.beep) playTone('pop');
  if (sec === 10 && seg.k === 'work' && seg.dur >= 20 && S.settings.tenSec) say('あと10秒');
}
function startTimer() {
  unlockAudio();
  if (T.state === 'done') resetTimer();
  const first = T.state === 'idle';
  T.state = 'run';
  T.endAt = Date.now() + T.left * 1000;
  T.lastSec = Math.ceil(T.left);
  if (first) announce(T.segs[T.idx]);
  clearInterval(T.timer);
  T.timer = setInterval(tick, 200);
  keepAwake(true);
  updateTimer();
}
function pauseTimer() {
  T.left = Math.max(0, (T.endAt - Date.now()) / 1000);
  T.state = 'pause';
  clearInterval(T.timer);
  stopSpeech(); keepAwake(false);
  updateTimer();
}
function tick() {
  if (T.state !== 'run') return;
  const now = Date.now();
  while (now >= T.endAt) {
    T.idx++;
    if (T.idx >= T.segs.length) { finishTimer(); return; }
    T.endAt += T.segs[T.idx].dur * 1000;
    // 画面が止まっていた間に次の区切りまで過ぎていたら、声を出さずに追いつく
    if (now < T.endAt) announce(T.segs[T.idx]);
    T.lastSec = Math.ceil((T.endAt - now) / 1000);
  }
  const sec = Math.ceil((T.endAt - now) / 1000);
  if (sec !== T.lastSec) { T.lastSec = sec; cue(sec); }
  updateTimer();
}
function jump(delta) {
  if (T.state === 'idle' || T.state === 'done') return;
  const seg = T.segs[T.idx];
  const left = T.state === 'run' ? (T.endAt - Date.now()) / 1000 : T.left;
  if (delta < 0 && seg.dur - left > 2) { /* 区切りの途中なら、その区切りの最初へ */ }
  else T.idx += delta;
  if (T.idx < 0) T.idx = 0;
  if (T.idx >= T.segs.length) { finishTimer(); return; }
  T.left = T.segs[T.idx].dur;
  if (T.state === 'run') { T.endAt = Date.now() + T.left * 1000; T.lastSec = Math.ceil(T.left); announce(T.segs[T.idx]); }
  updateTimer();
}
function finishTimer() {
  clearInterval(T.timer);
  T.state = 'done'; T.idx = T.segs.length; T.left = 0;
  keepAwake(false);
  const m = timerMenu();
  const sec = T.segs.reduce((a, s) => a + s.dur, 0);
  const res = addRecord({ kind: 'timer', menu: m.name, sec });
  playTone('fanfare').then(() => say('おつかれさまでした', true));
  if (view === 'garden') keepScroll(render); else updateTimer();
  celebrate(res, `${m.name}・${jpMin(sec)}`);
}

/* ---------- お庭（記録と植物） ---------- */
function water() {
  const g = S.garden;
  const r = { newSeed: false, bloomed: false };
  if (g.water >= needOf(g.plant)) { // 前の花が咲いていたら、つぎのたねをまく
    g.plant = g.blooms < PLANTS.length ? g.blooms : Math.floor(Math.random() * PLANTS.length);
    g.water = 0; r.newSeed = true;
  }
  const need = needOf(g.plant);
  r.prevStage = stageOf(g.water, need);
  g.water++;
  r.stage = stageOf(g.water, need);
  r.stageUp = r.stage > r.prevStage;
  if (g.water === need) {
    const id = PLANTS[g.plant].id;
    g.coll[id] = (g.coll[id] || 0) + 1;
    g.blooms++;
    g.hist.push({ id, d: dayKey() });
    r.bloomed = true;
  }
  return r;
}
function addRecord({ kind, menu, sec }) {
  S.log.push({ d: dayKey(), t: Date.now(), kind, menu, sec });
  const r = water();
  save();
  return r;
}
const doneDays = () => new Set(S.log.map((l) => l.d));
function streak() {
  const set = doneDays();
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function weekCount() {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); // 日曜はじまり
  const from = dayKey(d);
  return new Set(S.log.filter((l) => l.d >= from).map((l) => l.d)).size;
}
function season(month) {
  if (month >= 3 && month <= 5) return { id: 'spring', name: '春のお庭', deco: '🌸' };
  if (month >= 6 && month <= 8) return { id: 'summer', name: '夏のお庭', deco: '🌿' };
  if (month >= 9 && month <= 11) return { id: 'autumn', name: '秋のお庭', deco: '🍁' };
  return { id: 'winter', name: '冬のお庭', deco: '❄️' };
}

/* ---------- 植物の絵（SVG） ---------- */
const LEAF = 'M0 0 Q10 -13 26 -7 Q13 3 0 0Z';
const leaf = (x, y, rot, s = 1, flip = false, fill = '#93B297') =>
  `<path d="${LEAF}" transform="translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})" fill="${fill}"/>`;
const stemPath = (x1, y1, x2, y2, w = 4, c = '#7E9E82') =>
  `<path d="M${x1} ${y1} Q${x1 + 5} ${(y1 + y2) / 2} ${x2} ${y2}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
const POT = `<ellipse cx="100" cy="236" rx="52" ry="4" fill="#5A4646" opacity=".08"/>
<path d="M56 182 H144 L134 229 Q133 235 127 235 H73 Q67 235 66 229 Z" fill="#E9BBA8"/>
<rect x="50" y="170" width="100" height="17" rx="8.5" fill="#DFA793"/>
<ellipse cx="100" cy="172" rx="44" ry="5" fill="#8B6B5C"/>
<path d="M100 216 C92 210 88 205 92 201 C95 198 99 199 100 202 C101 199 105 198 108 201 C112 205 108 210 100 216Z" fill="#F7EDE6" opacity=".9"/>`;
function miniFlower(x, y, r, petal, center) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    s += `<circle cx="${(x + Math.cos(a) * r * 0.9).toFixed(1)}" cy="${(y + Math.sin(a) * r * 0.9).toFixed(1)}" r="${(r * 0.72).toFixed(1)}" fill="${petal}"/>`;
  }
  return `${s}<circle cx="${x}" cy="${y}" r="${(r * 0.45).toFixed(1)}" fill="${center}"/>`;
}
function bloomHead(p, cx, cy) {
  if (p.type === 'tulip') {
    return `<path d="M${cx - 22} ${cy - 6} Q${cx - 26} ${cy - 34} ${cx - 12} ${cy - 40} Q${cx - 5} ${cy - 26} ${cx} ${cy - 38} Q${cx + 5} ${cy - 26} ${cx + 12} ${cy - 40} Q${cx + 26} ${cy - 34} ${cx + 22} ${cy - 6} Q${cx} ${cy + 14} ${cx - 22} ${cy - 6}Z" fill="${p.color}"/>
      <path d="M${cx - 6} ${cy - 30} Q${cx - 12} ${cy - 14} ${cx - 8} ${cy}" stroke="#fff" stroke-opacity=".4" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  if (p.type === 'daisy') {
    let s = '';
    for (let i = 0; i < p.n; i++) {
      s += `<ellipse cx="${cx}" cy="${cy - p.r * 0.58}" rx="${(p.r * 0.17).toFixed(1)}" ry="${(p.r * 0.45).toFixed(1)}" fill="${p.color}" transform="rotate(${(i * 360 / p.n).toFixed(1)} ${cx} ${cy})"/>`;
    }
    s += `<circle cx="${cx}" cy="${cy}" r="${(p.r * 0.36).toFixed(1)}" fill="${p.center}"/>`;
    s += `<circle cx="${cx - p.r * 0.1}" cy="${cy - p.r * 0.1}" r="${(p.r * 0.12).toFixed(1)}" fill="#fff" opacity=".25"/>`;
    return s;
  }
  if (p.type === 'cluster') {
    const pts = [[0, 0], [-16, -6], [16, -6], [-8, -18], [8, -18], [-22, 8], [22, 8], [-8, 11], [8, 11], [0, -28], [-24, -18], [24, -18], [0, 22]];
    let s = `<circle cx="${cx}" cy="${cy - 2}" r="34" fill="${p.color2}" opacity=".45"/>`;
    pts.forEach(([dx, dy], i) => {
      const c = i % 3 === 0 ? p.color2 : p.color;
      const x = cx + dx, y = cy + dy;
      s += `<g transform="rotate(45 ${x} ${y})"><circle cx="${x - 4.5}" cy="${y}" r="5.5" fill="${c}"/><circle cx="${x + 4.5}" cy="${y}" r="5.5" fill="${c}"/><circle cx="${x}" cy="${y - 4.5}" r="5.5" fill="${c}"/><circle cx="${x}" cy="${y + 4.5}" r="5.5" fill="${c}"/></g><circle cx="${x}" cy="${y}" r="1.6" fill="#fff" opacity=".8"/>`;
    });
    return s;
  }
  if (p.type === 'rose') {
    let s = '';
    for (let i = 0; i < 6; i++) {
      const a = (i * 60) * Math.PI / 180;
      s += `<circle cx="${(cx + Math.cos(a) * 15).toFixed(1)}" cy="${(cy + Math.sin(a) * 13).toFixed(1)}" r="13" fill="#C94F68"/>`;
    }
    s += `<circle cx="${cx}" cy="${cy}" r="21" fill="${p.color}"/>`;
    s += `<path d="M${cx} ${cy} m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a12 12 0 1 1 24 0 a16 16 0 1 1 -32 0" stroke="#A93D55" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    return s;
  }
  return '';
}
function plantBody(p, stage) {
  if (stage === 0) return `<ellipse cx="100" cy="170" rx="15" ry="5" fill="#7A5B4D"/><ellipse cx="100" cy="166.5" rx="5.5" ry="3.8" fill="#C9A06F"/>`;
  if (stage === 1) return stemPath(100, 172, 100, 152, 3.5) + leaf(100, 153, -28, 0.6) + leaf(100, 153, -28, 0.6, true);
  if (stage === 2) return stemPath(100, 172, 100, 128, 4) + leaf(100, 130, -22, 1.05) + leaf(100, 130, -22, 1.05, true, '#87A68B');
  if (stage === 3) {
    return stemPath(100, 172, 100, 80) + leaf(101, 142, -18, 1.15) + leaf(101, 120, -18, 1.1, true, '#87A68B')
      + `<ellipse cx="100" cy="68" rx="10" ry="15" fill="${p.color === '#FBF1F5' ? '#EFC7D7' : p.color}"/>` + leaf(100, 80, -60, 0.45) + leaf(100, 80, -60, 0.45, true);
  }
  // 咲いた姿
  if (p.type === 'spike') {
    let s = stemPath(100, 172, 86, 64, 3) + stemPath(100, 172, 100, 52, 3) + stemPath(100, 172, 114, 66, 3);
    s += leaf(100, 160, -50, 1.3) + leaf(100, 160, -50, 1.3, true, '#87A68B');
    [[86, 30], [100, 18], [114, 32]].forEach(([x, top]) => {
      for (let j = 0; j < 7; j++) s += `<ellipse cx="${x + (j % 2 ? 2 : -2)}" cy="${top + j * 6}" rx="5.5" ry="4.2" fill="${j % 2 ? '#C2AEE0' : p.color}"/>`;
    });
    return s;
  }
  if (p.type === 'tree') {
    let s = `<path d="M97 172 Q95 140 100 118 M100 118 Q92 104 80 96 M100 118 Q109 102 122 92 M100 118 Q101 100 100 84" stroke="#8C6B5D" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    [[78, 88, 22], [100, 72, 26], [124, 86, 22], [90, 100, 17], [112, 100, 17]].forEach(([x, y, r]) => { s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.color}"/>`; });
    [[74, 82], [96, 64], [118, 74], [130, 92], [88, 98], [108, 90], [100, 80], [82, 70]].forEach(([x, y]) => { s += miniFlower(x, y, 4.2, '#FFF3F6', '#E68AA2'); });
    return s;
  }
  if (p.type === 'orchid') {
    let s = `<ellipse cx="86" cy="164" rx="26" ry="9" transform="rotate(-18 86 164)" fill="#7E9E82"/><ellipse cx="116" cy="164" rx="26" ry="9" transform="rotate(16 116 164)" fill="#93B297"/>`;
    s += `<path d="M100 168 Q98 110 120 80 Q136 62 152 64" stroke="#7E9E82" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    [[110, 100, 1], [128, 74, 0.9], [150, 66, 0.75]].forEach(([x, y, k]) => {
      const e = (dx, dy, rx, ry, rot) => `<ellipse cx="${x + dx * k}" cy="${y + dy * k}" rx="${rx * k}" ry="${ry * k}" transform="rotate(${rot} ${x + dx * k} ${y + dy * k})" fill="${p.color}" stroke="#EBCFDC" stroke-width="1"/>`;
      s += e(0, -11, 5, 9, 0) + e(-10, 4, 5, 8, 50) + e(10, 4, 5, 8, -50) + e(-9, -3, 9, 8, 0) + e(9, -3, 9, 8, 0);
      s += `<ellipse cx="${x}" cy="${y + 3 * k}" rx="${4 * k}" ry="${5 * k}" fill="${p.center}"/>`;
    });
    return s;
  }
  if (p.type === 'pine') {
    let s = '';
    [[-60, 1.5], [-35, 1.6], [-10, 1.4]].forEach(([r, k], i) => { s += leaf(100, 168, r, k, false, i % 2 ? '#87A68B' : '#7FA36A') + leaf(100, 168, r, k, true, i % 2 ? '#7FA36A' : '#87A68B'); });
    s += stemPath(100, 168, 100, 140, 6);
    [[0, 54], [-12, 46], [12, 46], [-20, 40], [20, 40]].forEach(([dx, h]) => {
      s += `<path d="M100 84 Q${100 + dx - 4} ${84 - h * 0.6} ${100 + dx * 1.3} ${84 - h} Q${100 + dx + 5} ${84 - h * 0.5} 100 84Z" fill="#7FA36A"/>`;
    });
    s += `<ellipse cx="100" cy="114" rx="26" ry="33" fill="${p.color}"/>`;
    for (let y = 92; y <= 138; y += 9) {
      for (let x = 80; x <= 120; x += 10) {
        const ox = ((y - 92) / 9) % 2 ? 5 : 0;
        const px = x + ox;
        if (((px - 100) / 24) ** 2 + ((y - 114) / 31) ** 2 < 0.85) s += `<path d="M${px - 3.5} ${y - 2} l3.5 3.5 l3.5 -3.5" stroke="#B9852A" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      }
    }
    return s;
  }
  return stemPath(100, 172, 100, 84) + leaf(101, 142, -18, 1.2) + leaf(101, 120, -18, 1.15, true, '#87A68B') + `<g class="head">${bloomHead(p, 100, 66)}</g>`;
}
// 植物は土のところを支点に風でゆれる（ゆれ方は1つずつずらす）。pot:false はお庭の地面に植えた姿
const GROUND = '<ellipse cx="100" cy="176" rx="40" ry="8" fill="#A88570"/><ellipse cx="100" cy="173" rx="30" ry="5" fill="#8B6B5C"/>';
function plantSVG(p, stage, cls = '', pot = true) {
  const delay = -(Math.random() * 6).toFixed(2);
  return `<svg viewBox="0 0 200 ${pot ? 240 : 186}" class="${cls}" aria-hidden="true">${pot ? POT : GROUND}`
    + `<g class="sway" style="animation-delay:${delay}s">${plantBody(p, stage)}</g></svg>`;
}
const DROP = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2C10 2 3 11 3 15.5a7 7 0 0 0 14 0C17 11 10 2 10 2Z"/></svg>';
const STAMP = `<svg viewBox="0 0 20 20" class="stamp" aria-hidden="true">${miniFlower(10, 10, 5.2, '#D98C9A', '#F6D8A8')}</svg>`;

/* ---------- アイコン ---------- */
const IC = {
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18.3 6.7l1.4-1.4"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  flower: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="2"/><path d="M12 5.5c-.3-2.6 3.2-3.3 3.7-1.2.4 1.8-1.7 2.9-1.7 2.9M14 7.5c2.6-.3 3.3 3.2 1.2 3.7-1.8.4-2.9-1.7-2.9-1.7M12 9.5c.3 2.6-3.2 3.3-3.7 1.2-.4-1.8 1.7-2.9 1.7-2.9M10 7.5c-2.6.3-3.3-3.2-1.2-3.7 1.8-.4 2.9 1.7 2.9 1.7M12 10v11M12 17.5c-3 0-5-1.8-5.5-4.5 3 0 5 1.8 5.5 4.5zM12 15.5c2.6 0 4.4-1.6 4.8-3.9-2.6 0-4.4 1.6-4.8 3.9z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M3 4v6h6"/><path d="M5.5 15a8 8 0 1 0 1.9-8.3L3 10"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="fill"><path d="M8.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.7 4.5a.8.8 0 0 0-1.2.7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="fill"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 5.5l9 6.5-9 6.5zM18.5 5.5v13"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M19 5.5l-9 6.5 9 6.5zM5.5 5.5v13"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
};

/* ---------- 画面 ---------- */
let view = 'timer'; // timer | menus | edit | garden | settings
let draft = null; // 編集中のメニュー
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calPick = null;

function render() {
  const main = $('#main');
  main.className = `v-${view}`;
  main.innerHTML = { timer: timerHTML, menus: menusHTML, edit: editHTML, garden: gardenHTML, settings: settingsHTML }[view]();
  main.scrollTop = 0;
  if (view === 'timer') updateTimer();
  const tab = view === 'edit' ? 'menus' : view === 'settings' ? 'timer' : view;
  $('#tabs').innerHTML = [['timer', 'タイマー'], ['menus', 'メニュー'], ['garden', 'お庭']]
    .map(([v, label]) => `<button type="button" data-act="tab" data-v="${v}" class="${tab === v ? 'on' : ''}"><span class="ic">${IC[{ timer: 'timer', menus: 'list', garden: 'flower' }[v]]}</span>${label}</button>`).join('');
}
function go(v) { view = v; render(); }

/* タイマー画面 */
function timerHTML() {
  return `<div id="timer">
    <header class="t-head">
      <button type="button" class="icbtn" data-act="settings" aria-label="設定"><span class="ic">${IC.gear}</span></button>
      <button type="button" class="menu-pick" data-act="pickMenu"><span class="mname"></span><span class="total"></span></button>
      <button type="button" class="icbtn" data-act="reset" aria-label="最初から"><span class="ic">${IC.reset}</span></button>
    </header>
    <section class="phase">
      <div class="ph-label"></div>
      <div class="ph-ex"></div>
      <div class="ph-time"></div>
      <div class="ph-bar"><i></i></div>
    </section>
    <section class="next">
      <div><div class="nx-label"></div><div class="nx-ex"></div></div>
      <div class="nx-time"></div>
    </section>
    <div class="ctrl">
      <div class="count c-ex"><b></b><span>のこり種目</span></div>
      <div class="play-wrap"><button type="button" class="play" data-act="play"></button><span class="play-label"></span></div>
      <div class="count c-set"><b></b><span>のこりセット</span></div>
    </div>
    <div class="ctrl2">
      <button type="button" class="pill" data-act="prev"><span class="ic">${IC.prev}</span>もどる</button>
      <button type="button" class="pill" data-act="next">とばす<span class="ic">${IC.next}</span></button>
    </div>
  </div>`;
}
function updateTimer() {
  const root = $('#timer');
  if (!root) return;
  const m = timerMenu();
  const done = T.state === 'done';
  const seg = done ? null : T.segs[T.idx];
  const left = T.state === 'run' ? Math.max(0, (T.endAt - Date.now()) / 1000) : T.left;
  const k = seg ? seg.k : 'done';
  const ph = $('.phase', root);
  ph.dataset.k = k;
  $('.ph-label', root).textContent = PH[k];
  const isName = (n) => n && n !== 'ワークアウト';
  const works = T.segs.filter((s) => s.k === 'work').length;
  const worksDone = T.segs.slice(0, Math.min(T.idx, T.segs.length)).filter((s) => s.k === 'work').length;
  $('.ph-ex', root).textContent = !seg ? 'おつかれさまでした'
    : seg.k === 'work' ? (isName(seg.ex) ? seg.ex : `${worksDone + 1}回目 / ${works}回`)
    : seg.k === 'cool' ? 'ゆっくり呼吸'
    : isName(seg.ex) ? `つぎは ${seg.ex}` : '';
  $('.ph-time', root).textContent = mmss(seg ? left : 0);
  $('.ph-bar i', root).style.width = `${seg ? Math.min(100, (1 - left / seg.dur) * 100) : 100}%`;
  const nx = done ? null : T.segs[T.idx + 1];
  const nxEl = $('.next', root);
  nxEl.dataset.k = nx ? nx.k : 'done';
  $('.nx-label', root).textContent = done ? 'お庭にお水をあげました' : `つぎ ・ ${nx ? PH[nx.k] : 'おわり'}`;
  $('.nx-ex', root).textContent = done ? '' : nx ? (nx.k === 'work' && isName(nx.ex) ? nx.ex : nx.k === 'work' ? 'がんばりましょう' : nx.k === 'cool' ? 'ストレッチ' : isName(nx.ex) ? `そのあと ${nx.ex}` : 'ひと休み') : 'もう少し！';
  $('.nx-time', root).textContent = nx ? mmss(nx.dur) : '';
  let total = seg ? left : 0;
  for (let i = T.idx + 1; i < T.segs.length; i++) total += T.segs[i].dur;
  $('.mname', root).textContent = m.name;
  $('.total', root).textContent = mmss(total);
  const curSet = seg ? seg.set : m.sets;
  if (noEx(m)) { // 種目なし：のこり回数／おわった回数
    $('.c-ex span', root).textContent = 'のこり回数';
    $('.c-set span', root).textContent = 'おわった回数';
    $('.c-ex b', root).textContent = works - worksDone;
    $('.c-set b', root).textContent = worksDone;
  } else {
    $('.c-ex span', root).textContent = 'のこり種目';
    $('.c-set span', root).textContent = 'のこりセット';
    $('.c-ex b', root).textContent = seg ? T.segs.slice(T.idx).filter((s) => s.k === 'work' && s.set === curSet).length : 0;
    $('.c-set b', root).textContent = Math.max(0, m.sets - curSet);
  }
  const run = T.state === 'run';
  const btn = $('.play', root);
  btn.innerHTML = run ? IC.pause : IC.play;
  btn.setAttribute('aria-label', run ? '一時停止' : 'スタート');
  $('.play-label', root).textContent = { idle: 'スタート', run: '一時停止', pause: 'つづける', done: 'もう一度' }[T.state];
  root.classList.toggle('is-idle', T.state === 'idle' || done);
}

/* メニュー一覧 */
function menuSummary(m) {
  return noEx(m) ? `種目なし・${m.sets}回・${jpMin(totalSec(m))}` : `${m.exercises.length}種目 × ${m.sets}セット・${jpMin(totalSec(m))}`;
}
function menusHTML() {
  return `<div class="page">
    <header class="p-head"><h1>メニュー</h1></header>
    <p class="lead">使うメニューをえらんでください。「編集」で種目や時間を変えられます。</p>
    ${S.menus.map((m) => `<div class="m-card ${m.id === S.cur ? 'on' : ''}">
      <button type="button" class="m-main" data-act="useMenu" data-id="${m.id}">
        <span class="m-name">${m.id === S.cur ? '<span class="badge">使用中</span>' : ''}${esc(m.name)}</span>
        <span class="m-sum">${menuSummary(m)}</span>
        <span class="m-ex">${noEx(m) ? `${jpSec(m.work)}運動・${m.rest ? `${jpSec(m.rest)}休憩` : '休憩なし'}をくり返します` : m.exercises.map(esc).join('・')}</span>
      </button>
      <button type="button" class="m-edit" data-act="editMenu" data-id="${m.id}"><span class="ic">${IC.pencil}</span>編集</button>
    </div>`).join('')}
    <button type="button" class="btn-add" data-act="newMenu">＋ 新しいメニューをつくる</button>
  </div>`;
}

/* メニュー編集 */
const FIELDS = [
  { f: 'prep', label: '準備', sub: 'スタート前のカウントダウン', dot: 'var(--honey)', kind: 'sec', min: 0, max: 60, step: 5, chips: [0, 5, 10, 15, 20, 30] },
  { f: 'work', label: 'ワークアウト', sub: '1種目の時間', dot: 'var(--rose)', kind: 'sec', min: 5, max: 600, step: 5, chips: [20, 30, 40, 45, 60, 90] },
  { f: 'rest', label: '休憩', sub: '種目と種目のあいだ', dot: 'var(--sage)', kind: 'sec', min: 0, max: 300, step: 5, chips: [0, 10, 15, 20, 30, 60] },
  { f: 'sets', label: 'セット数', sub: '種目をぜんぶやって1セット', dot: 'var(--rose-d)', kind: 'set', min: 1, max: 20, step: 1, chips: [1, 2, 3, 4, 5, 8] },
  { f: 'setRest', label: 'セット間の休憩', sub: '0にすると、ふつうの休憩と同じ', dot: 'var(--sage-l)', kind: 'sec', min: 0, max: 600, step: 15, chips: [0, 30, 60, 90, 120, 180] },
  { f: 'cool', label: 'クールダウン', sub: 'さいごのストレッチ', dot: 'var(--mist)', kind: 'sec', min: 0, max: 600, step: 15, chips: [0, 30, 60, 120, 180, 300] },
];
// 種目なしのメニューでは「セット数」を「回数」と呼び、セット間の休憩は使わない
const fieldsFor = (d) => (d.useEx ? FIELDS : FIELDS.filter((fd) => fd.f !== 'setRest').map((fd) => (fd.f === 'sets'
  ? { ...fd, label: '回数', sub: 'ワークアウト＋休憩を1回として', kind: 'count', max: 50, chips: [4, 6, 8, 10, 12, 20] }
  : fd.f === 'work' ? { ...fd, sub: '1回の運動の時間' } : fd.f === 'rest' ? { ...fd, sub: '運動と運動のあいだ' } : fd)));
const fmtVal = (fd, v) => (fd.kind === 'sec' ? (v === 0 ? 'なし' : jpSec(v)) : fd.kind === 'count' ? `${v}回` : `${v}`);
function editHTML() {
  const d = draft;
  return `<div class="page edit">
    <header class="e-head">
      <button type="button" class="txtbtn" data-act="editCancel">キャンセル</button>
      <h1>${d.isNew ? '新しいメニュー' : 'メニューの編集'}</h1>
      <button type="button" class="txtbtn save" data-act="editSave">保存</button>
    </header>
    <label class="name-row"><span>名前</span><input type="text" id="e-name" value="${esc(d.name)}" maxlength="20" placeholder="マイメニュー"></label>
    <h2 class="sec-title">時間とくり返し</h2>
    <div class="rows card">
      ${fieldsFor(d).map((fd) => `<button type="button" class="row" data-act="editField" data-f="${fd.f}">
        <i class="dot" style="background:${fd.dot}"></i>
        <span class="r-main"><b>${fd.label}</b><small>${fd.sub}</small></span>
        <span class="r-val">${fmtVal(fd, d[fd.f])}</span><span class="ic chev">${IC.chev}</span>
      </button>`).join('')}
    </div>
    <h2 class="sec-title">種目</h2>
    <div class="rows card"><button type="button" class="row" data-act="exToggle">
      <span class="r-main"><b>種目の名前を使う</b><small>${d.useEx ? '声で「スクワット、スタート」と案内します' : 'オフ：時間だけでくり返します（「スタート」「休憩」）'}</small></span>
      <i class="sw ${d.useEx ? 'on' : ''}"></i></button></div>
    ${d.useEx ? `<h2 class="sec-title">種目の並び <small>（この順番で行います）</small></h2>
    <div class="rows card">
      ${d.exercises.map((name, i) => `<div class="ex-row">
        <span class="ex-no">${i + 1}</span>
        <input type="text" data-exi="${i}" value="${esc(name)}" maxlength="16">
        <button type="button" class="icbtn sm" data-act="exUp" data-i="${i}" aria-label="上へ" ${i === 0 ? 'disabled' : ''}><span class="ic">${IC.up}</span></button>
        <button type="button" class="icbtn sm" data-act="exDown" data-i="${i}" aria-label="下へ" ${i === d.exercises.length - 1 ? 'disabled' : ''}><span class="ic">${IC.down}</span></button>
        <button type="button" class="icbtn sm" data-act="exDel" data-i="${i}" aria-label="けす"><span class="ic">${IC.x}</span></button>
      </div>`).join('') || '<p class="empty">下のボタンから種目を入れてください</p>'}
    </div>
    <p class="hint-s">タップで追加</p>
    <div class="chips">${QUICK_EX.map((n) => `<button type="button" class="chip" data-act="exAdd" data-n="${esc(n)}">${esc(n)}</button>`).join('')}
      <button type="button" class="chip other" data-act="exAdd" data-n="">＋ その他</button></div>` : ''}
    <p class="e-total">合計 <b>${mmss(totalSec(d))}</b>（${menuSummary(d)}）</p>
    ${!d.isNew && S.menus.length > 1 ? '<button type="button" class="btn-del" data-act="editDelete">このメニューを削除</button>' : ''}
  </div>`;
}

/* お庭 */
function gardenHTML() {
  const g = S.garden;
  const p = PLANTS[g.plant];
  const need = needOf(g.plant);
  const stage = stageOf(g.water, need);
  const se = season(new Date().getMonth() + 1);
  const bloomed = g.water >= need;
  const today = dayKey();
  const manualDone = S.log.some((l) => l.d === today && l.kind === 'manual');
  return `<div class="page garden">
    <header class="p-head"><h1>お庭</h1><span class="season">${se.deco} ${se.name}</span></header>
    <section class="plant-card s-${se.id}">
      <div class="falling">${Array.from({ length: 6 }, (_, i) => `<span style="--i:${i}">${se.deco}</span>`).join('')}</div>
      <div class="plant">${plantSVG(p, stage)}</div>
      <div class="pname">${esc(p.name)}<small>${STAGES[stage]}</small></div>
      <div class="drops ${need > 9 ? 'many' : ''}">${Array.from({ length: need }, (_, i) => `<span class="${i < g.water ? 'on' : ''}">${DROP}</span>`).join('')}</div>
      <p class="p-hint">${bloomed ? 'きれいに咲きました！ つぎの運動で、新しいたねをまきます' : `運動するとお水をあげられます。あと<b>${need - g.water}回</b>で咲きます`}</p>
    </section>
    <section class="stats">
      <div><b>${streak()}</b><span>日連続</span></div>
      <div><b>${weekCount()}</b><span>今週の回数</span></div>
      <div><b>${doneDays().size}</b><span>合計の日数</span></div>
    </section>
    <button type="button" class="btn-soft" data-act="manual" ${manualDone ? 'disabled' : ''}>${manualDone ? '✓ きょうの運動は記録ずみ' : '💧 タイマーなしで運動した日を記録'}</button>
    ${yardHTML()}
    ${zukanHTML(stage)}
    ${calendarHTML()}
  </div>`;
}
// わたしのお庭：咲かせた花が、咲いた順に地面に植わっていく（新しいもの24本まで）
function yardHTML() {
  const hist = S.garden.hist;
  const shown = hist.slice(-24);
  const slots = Math.max(8, Math.ceil((shown.length + 1) / 4) * 4);
  let cells = shown.map((h) => {
    const pl = PLANTS.find((x) => x.id === h.id) || PLANTS[0];
    return `<div class="yd">${plantSVG(pl, 4, '', false)}</div>`;
  }).join('');
  for (let i = shown.length; i < slots; i++) cells += `<div class="yd empty">${i === shown.length ? '<span>つぎは<br>ここに</span>' : ''}</div>`;
  return `<section class="card yard-card">
    <h2>わたしのお庭 <small>${hist.length}本</small></h2>
    <div class="yard">${cells}</div>
    ${hist.length ? '' : '<p class="yard-empty">咲かせたお花が、ここに植わっていきます</p>'}
  </section>`;
}
// お花図鑑：出会った花をタップすると、花言葉や咲かせた日が見られる
function zukanHTML(stage) {
  const g = S.garden;
  return `<section class="card coll">
    <h2>お花図鑑 <small>${Object.keys(g.coll).length} / ${PLANTS.length}種類・レベル ${g.blooms + 1}</small></h2>
    <div class="coll-grid">${PLANTS.map((pl, i) => {
      const n = g.coll[pl.id] || 0;
      const st = `<i class="star">${stars(pl.need)}</i>`;
      if (i === g.plant && g.water < pl.need) return `<button type="button" class="ci grow" data-act="zukan" data-i="${i}"><div class="ci-img">${plantSVG(pl, stage)}</div><span>${esc(pl.name)}</span>${st}<em>育て中</em></button>`;
      if (n) return `<button type="button" class="ci" data-act="zukan" data-i="${i}"><div class="ci-img">${plantSVG(pl, 4)}</div><span>${esc(pl.name)}</span>${st}<em>×${n}</em></button>`;
      if (i <= g.blooms) return `<div class="ci grow"><div class="ci-img">${plantSVG(pl, 0)}</div><span>${esc(pl.name)}</span>${st}<em>つぎのたね</em></div>`;
      return `<div class="ci lock"><div class="ci-img">${plantSVG(pl, 4)}</div><span>？？？</span>${st}<em>レベル${i + 1}</em></div>`;
    }).join('')}</div>
  </section>`;
}
function calendarHTML() {
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const set = doneDays();
  const today = dayKey();
  const prefix = `${y}-${pad(mo + 1)}-`;
  const monthCount = [...set].filter((d) => d.startsWith(prefix)).length;
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="cd empty"></span>';
  for (let d = 1; d <= days; d++) {
    const key = prefix + pad(d);
    const has = set.has(key);
    cells += `<button type="button" class="cd ${has ? 'has' : ''} ${key === today ? 'today' : ''} ${key === calPick ? 'pick' : ''}" data-act="calDay" data-d="${key}" ${has ? '' : 'tabindex="-1"'}>${has ? STAMP : ''}<span>${d}</span></button>`;
  }
  const picked = calPick && calPick.startsWith(prefix) ? S.log.filter((l) => l.d === calPick) : [];
  return `<section class="card cal">
    <div class="cal-head">
      <button type="button" class="icbtn sm" data-act="calMove" data-d="-1" aria-label="前の月"><span class="ic">${IC.back}</span></button>
      <h2>${y}年${mo + 1}月 <small>${monthCount}日</small></h2>
      <button type="button" class="icbtn sm" data-act="calMove" data-d="1" aria-label="次の月"><span class="ic">${IC.chev}</span></button>
    </div>
    <div class="cal-grid">${['日', '月', '火', '水', '木', '金', '土'].map((w) => `<span class="cw">${w}</span>`).join('')}${cells}</div>
    ${picked.length ? `<ul class="cal-log">${picked.map((l) => `<li><b>${+calPick.slice(5, 7)}/${+calPick.slice(8)}</b> ${esc(l.menu)}${l.sec ? `・${jpMin(l.sec)}` : ''}</li>`).join('')}</ul>` : ''}
  </section>`;
}

/* 設定 */
function settingsHTML() {
  const st = S.settings;
  const tg = (key, label, sub = '') => `<label class="row tg"><span class="r-main"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    <input type="checkbox" data-set="${key}" ${st[key] ? 'checked' : ''}><i class="sw"></i></label>`;
  return `<div class="page settings">
    <header class="e-head"><button type="button" class="txtbtn" data-act="tab" data-v="timer"><span class="ic">${IC.back}</span>もどる</button><h1>設定</h1><span></span></header>
    <h2 class="sec-title">音と声</h2>
    <div class="rows card">
      ${tg('voice', '声の案内', '「スクワット、スタート」「休憩。つぎは〜」')}
      ${tg('tenSec', '「あと10秒」の声', 'ワークアウトのとき')}
      ${tg('beep', 'のこり3秒のピッ')}
      ${tg('silentOk', 'マナーモードでも音を出す', 'iPhoneの消音スイッチがオンでも鳴らします')}
      <div class="row"><span class="r-main"><b>声の速さ</b></span>
        <div class="seg">${[['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'はやめ']].map(([v, l]) => `<button type="button" data-act="rate" data-v="${v}" class="${st.rate === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <button type="button" class="row" data-act="testSound"><span class="r-main"><b>音と声のテスト</b><small>音量はiPhoneの横のボタンで</small></span><span class="ic chev">${IC.chev}</span></button>
    </div>
    <h2 class="sec-title">データ</h2>
    <div class="rows card">
      <button type="button" class="row" data-act="backup"><span class="r-main"><b>バックアップを書き出す</b><small>機種変更のときなどに。ファイルに保存します</small></span><span class="ic chev">${IC.chev}</span></button>
      <label class="row"><span class="r-main"><b>バックアップから戻す</b><small>書き出したファイルを読み込みます</small></span><input type="file" accept=".json,application/json" id="restore" hidden><span class="ic chev">${IC.chev}</span></label>
    </div>
    <p class="about">毎日トレーニング v${VERSION}<br>記録はこのiPhoneの中にだけ保存されます。</p>
  </div>`;
}

/* ---------- ダイアログ ---------- */
function ask(html, cls, bind) {
  return new Promise((res) => {
    const d = $('#dlg');
    if (d.open) d.close();
    d.className = cls;
    d.innerHTML = html;
    d.showModal();
    let fin = false;
    const finish = (v) => { if (fin) return; fin = true; d.removeEventListener('close', onClose); if (d.open) d.close(); res(v); };
    const onClose = () => finish(null);
    d.addEventListener('close', onClose);
    d.onclick = (e) => { if (e.target === d && cls === 'sheet') finish(null); };
    bind(d, finish);
  });
}
const confirmBox = (msg, ok = 'はい', danger = false) => ask(
  `<p class="dlg-msg">${esc(msg)}</p><div class="dlg-btns"><button type="button" class="btn ghost" data-v="0">やめる</button><button type="button" class="btn ${danger ? 'danger' : ''}" data-v="1">${esc(ok)}</button></div>`,
  'center', (d, fin) => { $$('[data-v]', d).forEach((b) => { b.onclick = () => fin(b.dataset.v === '1'); }); },
).then((v) => !!v);
function pickValue(fd, value) {
  let v = value;
  const show = (d) => {
    $('.st-val', d).textContent = fd.kind === 'set' ? `${v}セット` : fmtVal(fd, v);
    $$('.chip', d).forEach((c) => c.classList.toggle('on', +c.dataset.c === v));
  };
  return ask(`<h3 class="dlg-title">${fd.label}</h3><p class="dlg-sub">${fd.sub}</p>
    <div class="stepper"><button type="button" class="st-btn" data-d="-1" aria-label="へらす">−</button><output class="st-val"></output><button type="button" class="st-btn" data-d="1" aria-label="ふやす">＋</button></div>
    <div class="chips center">${fd.chips.map((c) => `<button type="button" class="chip" data-c="${c}">${fmtVal(fd, c)}</button>`).join('')}</div>
    <div class="dlg-btns"><button type="button" class="btn ghost" data-x>やめる</button><button type="button" class="btn" data-ok>決定</button></div>`,
  'sheet', (d, fin) => {
    $$('.st-btn', d).forEach((b) => { b.onclick = () => { v = Math.min(fd.max, Math.max(fd.min, v + fd.step * +b.dataset.d)); show(d); }; });
    $$('.chip', d).forEach((b) => { b.onclick = () => { v = +b.dataset.c; show(d); }; });
    $('[data-x]', d).onclick = () => fin(null);
    $('[data-ok]', d).onclick = () => fin(v);
    show(d);
  });
}
function textBox(title, value = '') {
  return ask(`<h3 class="dlg-title">${esc(title)}</h3><input type="text" class="dlg-input" maxlength="16" value="${esc(value)}">
    <div class="dlg-btns"><button type="button" class="btn ghost" data-x>やめる</button><button type="button" class="btn" data-ok>追加</button></div>`,
  'center', (d, fin) => {
    const inp = $('.dlg-input', d);
    setTimeout(() => inp.focus(), 50);
    $('[data-x]', d).onclick = () => fin(null);
    $('[data-ok]', d).onclick = () => fin(inp.value.trim() || null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') fin(inp.value.trim() || null); };
  });
}
// おつかれさま：お水が降ってきて、植物が育つ。咲いたときは光とキラキラと花びらで大きくお祝いする
function celebrate(r, sub) {
  const g = S.garden;
  const p = PLANTS[g.plant];
  const remain = needOf(g.plant) - g.water;
  const bloom = r.bloomed;
  let msg = '';
  if (r.newSeed) msg = `新しいたね「${p.name}」をまいて、${STAGE_MSG[r.stage]}`;
  else if (r.stageUp && !bloom) msg = `${p.name}の${STAGE_MSG[r.stage]}`;
  const after = bloom
    ? `<p class="cel-big">${esc(p.name)}が<br>咲きました！</p><p class="cel-word">花言葉「${esc(p.word)}」</p><p class="cel-remain">🌼 お花図鑑とお庭に入りました</p>`
    : `${msg ? `<p class="cel-msg">${esc(msg)}</p>` : ''}<p class="cel-remain">あと${remain}回で咲きます</p>`;
  const token = {};
  celebrate.token = token;
  ask(`<div class="rays"></div><div class="petals"></div>
    <h3 class="cel-title">おつかれさまでした！</h3>
    <p class="cel-sub">${esc(sub)}</p>
    <div class="cel-stage">
      <div class="cel-plant">${plantSVG(p, r.prevStage)}</div>
      <div class="rain">${Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="sparkles"></div>
    </div>
    <p class="cel-water">💧 お水をあげました</p>
    <div class="cel-after">${after}</div>
    <div class="dlg-btns"><button type="button" class="btn ghost" data-x>とじる</button><button type="button" class="btn" data-g>お庭を見る</button></div>`,
  `center cel${bloom ? ' is-bloom' : ''}`, (d, fin) => {
    $('[data-x]', d).onclick = () => fin(null);
    $('[data-g]', d).onclick = () => { fin(null); go('garden'); };
    // お水が届いたら育つ
    setTimeout(() => {
      if (celebrate.token !== token || !d.open) return;
      $('.cel-plant', d).innerHTML = plantSVG(p, r.stage);
      if (r.stageUp || bloom) $('.cel-plant', d).classList.add('grown');
      d.classList.add('revealed');
      const n = bloom ? 16 : r.stageUp ? 7 : 0;
      $('.sparkles', d).innerHTML = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2, rr = 38 + (i % 3) * 14;
        return `<i style="left:${(50 + Math.cos(a) * rr).toFixed(1)}%;top:${(48 + Math.sin(a) * rr * 0.8).toFixed(1)}%;--d:${(i % 5) * 0.15}s;--s:${0.7 + (i % 4) * 0.25}">✦</i>`;
      }).join('');
      if (bloom) {
        const cols = ['var(--rose)', 'var(--honey)', 'var(--sage)', '#F3C64F', '#fff', p.color];
        $('.petals', d).innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 2.83) % 100}%;--c:${cols[i % cols.length]};--d:${(i % 12) * 0.1}s;--r:${(i % 7) * 60}deg"></i>`).join('');
        playTone('bloom').then(() => say(`おめでとうございます。${p.name}が咲きました`));
      } else if (r.stageUp) playTone('sparkle');
    }, 1150);
  });
}
function zukanDetail(i) {
  const g = S.garden;
  const pl = PLANTS[i];
  const n = g.coll[pl.id] || 0;
  const growing = i === g.plant && g.water < pl.need;
  const first = g.hist.find((h) => h.id === pl.id && h.d);
  const fmtD = (d) => `${+d.slice(0, 4)}年${+d.slice(5, 7)}月${+d.slice(8)}日`;
  ask(`<div class="zk-img">${plantSVG(pl, growing && !n ? stageOf(g.water, pl.need) : 4)}</div>
    <h3 class="dlg-title">${esc(pl.name)}</h3>
    <p class="zk-word">花言葉「${esc(pl.word)}」</p>
    <table class="zk-tbl">
      <tr><th>むずかしさ</th><td><span class="star">${stars(pl.need)}</span>（${pl.need}回で咲く）</td></tr>
      <tr><th>咲かせた回数</th><td>${n}回</td></tr>
      ${first ? `<tr><th>はじめて咲いた日</th><td>${fmtD(first.d)}</td></tr>` : ''}
      ${growing ? `<tr><th>いま</th><td>${STAGES[stageOf(g.water, pl.need)]}・あと${pl.need - g.water}回</td></tr>` : ''}
    </table>
    <div class="dlg-btns"><button type="button" class="btn" data-x>とじる</button></div>`, 'sheet', (d, fin) => { $('[data-x]', d).onclick = () => fin(null); });
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- 操作 ---------- */
const timerBusy = () => T.state === 'run' || T.state === 'pause';
const ACT = {
  tab: (b) => go(b.dataset.v),
  settings: () => go('settings'),
  play: () => (T.state === 'run' ? pauseTimer() : startTimer()),
  prev: () => jump(-1),
  next: () => jump(1),
  async reset() {
    if (timerBusy() && !(await confirmBox('最初からやり直しますか？', 'やり直す'))) return;
    resetTimer();
  },
  pickMenu() {
    ask(`<h3 class="dlg-title">メニューをえらぶ</h3><div class="pick-list">${S.menus.map((m) => `<button type="button" class="pick-item ${m.id === S.cur ? 'on' : ''}" data-id="${m.id}"><b>${esc(m.name)}</b><small>${menuSummary(m)}</small></button>`).join('')}</div>
      <div class="dlg-btns"><button type="button" class="btn ghost" data-x>とじる</button></div>`, 'sheet', (d, fin) => {
      $('[data-x]', d).onclick = () => fin(null);
      $$('.pick-item', d).forEach((b) => { b.onclick = () => fin(b.dataset.id); });
    }).then(async (id) => {
      if (!id) return;
      if (timerBusy() && id !== T.menuId && !(await confirmBox('タイマーを止めて、メニューを変えますか？', '変える'))) return;
      S.cur = id; save(); resetTimer();
    });
  },
  async useMenu(b) {
    if (timerBusy() && b.dataset.id !== T.menuId && !(await confirmBox('タイマーを止めて、メニューを変えますか？', '変える'))) return;
    S.cur = b.dataset.id; save();
    if (b.dataset.id !== T.menuId || !timerBusy()) resetTimer();
    go('timer');
  },
  editMenu(b) {
    const m = S.menus.find((x) => x.id === b.dataset.id);
    draft = { ...JSON.parse(JSON.stringify(m)), useEx: !noEx(m) };
    go('edit');
  },
  newMenu() {
    draft = { id: uid(), isNew: true, useEx: true, name: '', prep: 10, work: 30, rest: 15, sets: 2, setRest: 60, cool: 30, exercises: ['スクワット'] };
    go('edit');
  },
  exToggle() {
    const d = draft;
    if (d.useEx) { d.keepEx = d.exercises; d.exercises = []; d.useEx = false; if (d.sets < 4) d.sets = 8; }
    else { d.exercises = d.keepEx?.length ? d.keepEx : ['スクワット']; d.useEx = true; }
    keepScroll(render);
  },
  zukan: (b) => zukanDetail(+b.dataset.i),
  editCancel: () => go('menus'),
  editSave() {
    const d = draft;
    d.name = d.name.trim() || 'マイメニュー';
    d.exercises = d.useEx ? d.exercises.map((x) => x.trim()).filter(Boolean) : [];
    if (d.useEx && !d.exercises.length) { toast('種目を1つ以上入れてください（または「種目の名前を使う」をオフに）'); return; }
    if (!d.useEx) d.setRest = 0;
    const isNew = d.isNew;
    delete d.isNew; delete d.useEx; delete d.keepEx;
    if (isNew) { S.menus.push(d); S.cur = d.id; } else S.menus = S.menus.map((m) => (m.id === d.id ? d : m));
    save();
    if (!timerBusy() && (isNew || d.id === T.menuId)) resetTimer();
    toast('保存しました');
    go('menus');
  },
  async editDelete() {
    if (!(await confirmBox(`「${draft.name}」を削除しますか？（記録やお庭は消えません）`, '削除する', true))) return;
    S.menus = S.menus.filter((m) => m.id !== draft.id);
    if (S.cur === draft.id) S.cur = S.menus[0].id;
    save();
    if (!timerBusy()) resetTimer();
    go('menus');
  },
  async editField(b) {
    const fd = fieldsFor(draft).find((x) => x.f === b.dataset.f);
    const v = await pickValue(fd, draft[fd.f]);
    if (v == null) return;
    draft[fd.f] = v;
    keepScroll(render);
  },
  exUp: (b) => { const i = +b.dataset.i; const a = draft.exercises; [a[i - 1], a[i]] = [a[i], a[i - 1]]; keepScroll(render); },
  exDown: (b) => { const i = +b.dataset.i; const a = draft.exercises; [a[i + 1], a[i]] = [a[i], a[i + 1]]; keepScroll(render); },
  exDel: (b) => { draft.exercises.splice(+b.dataset.i, 1); keepScroll(render); },
  async exAdd(b) {
    const n = b.dataset.n || (await textBox('種目の名前'));
    if (!n) return;
    draft.exercises.push(n);
    keepScroll(render);
  },
  async manual() {
    const d = new Date();
    if (!(await confirmBox(`きょう（${d.getMonth() + 1}月${d.getDate()}日）の運動を記録して、お花にお水をあげますか？`, '記録する'))) return;
    const r = addRecord({ kind: 'manual', menu: 'タイマーなしの運動', sec: 0 });
    render();
    celebrate(r, 'きょうの運動を記録しました');
  },
  calMove: (b) => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.d, 1); keepScroll(render); },
  calDay: (b) => { calPick = calPick === b.dataset.d ? null : b.dataset.d; keepScroll(render); },
  rate: (b) => { S.settings.rate = b.dataset.v; save(); keepScroll(render); unlockAudio(); say('この速さで案内します', true); },
  testSound() {
    unlockAudio();
    playTone('pop').then(() => playTone('chime')).then(() => say('スクワット、スタート', true));
  },
  backup() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `毎日トレーニング_バックアップ_${dayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
function keepScroll(fn) {
  const y = $('#main').scrollTop;
  fn();
  $('#main').scrollTop = y;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || b.closest('dialog')) return;
  ACT[b.dataset.act]?.(b, e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (view === 'edit' && draft) {
    if (t.id === 'e-name') draft.name = t.value;
    if (t.dataset.exi != null) draft.exercises[+t.dataset.exi] = t.value;
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.set) { S.settings[t.dataset.set] = t.checked; save(); if (t.dataset.set === 'silentOk') unlockAudio(); }
  if (t.id === 'restore' && t.files[0]) {
    try {
      const d = JSON.parse(await t.files[0].text());
      if (!Array.isArray(d.menus) || !d.garden || !Array.isArray(d.log)) throw new Error('形式');
      if (!(await confirmBox(`バックアップ（記録${d.log.length}件）で、今のデータを置きかえますか？`, '置きかえる', true))) { t.value = ''; return; }
      localStorage.setItem(KEY, JSON.stringify(d));
      load(); resetTimer(); toast('バックアップから戻しました'); render();
    } catch { toast('このファイルは読み込めませんでした'); }
    t.value = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && T.state === 'run') { keepAwake(true); tick(); }
});
// 声の一覧はあとから届くことがある
try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {}; } catch { /* なし */ }

/* ---------- 起動 ---------- */
load();
resetTimer();
render();
try { navigator.storage?.persist?.(); } catch { /* なし */ }
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
