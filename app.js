'use strict';
/* 毎日トレーニング v1
   ・サーキットタイマー：種目名を登録し、声で「つぎは〇〇」と案内する
   ・お庭：運動を終えるたびにお水をあげて植物が育つ（枯れない）。やった日はカレンダーにお花のスタンプ
   データはこのiPhoneの中（localStorage）だけに保存する。外へは送らない */

const VERSION = '1.4.0';
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
// need＝咲くまでのお水の回数。どんどん咲くよう 3〜5回（v1.4。前は4〜14回）
const PLANTS = [
  { id: 'tulip', name: 'チューリップ', type: 'tulip', color: '#E8879B', need: 3, word: '思いやり' },
  { id: 'gerbera', name: 'ガーベラ', type: 'daisy', color: '#F2A07B', center: '#8A5A3B', n: 16, r: 28, need: 3, word: '希望・前進' },
  { id: 'sunflower', name: 'ひまわり', type: 'daisy', color: '#F3C64F', center: '#7A5230', n: 14, r: 34, need: 4, word: 'あこがれ' },
  { id: 'hydrangea', name: 'あじさい', type: 'cluster', color: '#9FB3E3', color2: '#B9A3DA', need: 4, word: '辛抱強い愛情' },
  { id: 'rose', name: 'バラ', type: 'rose', color: '#D45D74', need: 4, word: '愛・美' },
  { id: 'lavender', name: 'ラベンダー', type: 'spike', color: '#A88BCF', need: 4, word: '期待' },
  { id: 'sakura', name: '桜', type: 'tree', color: '#F5B8C6', need: 5, word: '精神の美' },
  { id: 'orchid', name: 'こちょうらん', type: 'orchid', color: '#FBF1F5', center: '#D9779A', need: 5, word: '幸福が飛んでくる' },
  { id: 'pineapple', name: 'パイナップル', type: 'pine', color: '#E9B949', need: 5, word: '完全無欠' },
  // 冬のお花（v1.4）。記録がずれないよう、新しい花はいつも最後に足す（並べかえない）。verb＝咲いたときの言い方
  { id: 'poinsettia', name: 'ポインセチア', type: 'poinsettia', color: '#CF4655', need: 3, word: '祝福・幸運を祈る', winter: true },
  { id: 'holly', name: '西洋ヒイラギ', type: 'holly', color: '#D2434F', need: 3, word: '将来の見通し', winter: true, verb: '赤い実をつけました' },
  { id: 'xmasrose', name: 'クリスマスローズ', type: 'xmasrose', color: '#F3DFDC', bud: '#E9C6C8', need: 4, word: 'いたわり', winter: true },
  { id: 'mistletoe', name: 'ヤドリギ', type: 'mistletoe', color: '#9BB86B', bud: '#C9D8A0', need: 4, word: '困難に打ち勝つ', winter: true, verb: '白い実をつけました' },
  { id: 'cotton', name: 'コットンフラワー', type: 'cotton', color: '#FFFDF8', bud: '#B9C79A', need: 4, word: '私を包んで', winter: true, verb: 'ふわふわに開きました' },
  { id: 'cyclamen', name: 'シクラメン', type: 'cyclamen', color: '#E58FB0', need: 4, word: 'はにかみ', winter: true },
  { id: 'nandina', name: '南天', type: 'nandina', color: '#D2434F', need: 4, word: '福をなす・よい家庭', winter: true, verb: '赤い実をつけました' },
  { id: 'adonis', name: '福寿草', type: 'adonis', color: '#F5C93B', need: 4, word: '幸せを招く', winter: true },
  { id: 'camellia', name: '椿', type: 'camellia', color: '#C93F55', need: 5, word: '控えめなすばらしさ', winter: true },
  { id: 'snowdrop', name: 'スノードロップ', type: 'snowdrop', color: '#FDFBF8', bud: '#E9EFE0', need: 5, word: '希望', winter: true },
];
const OLD_PLANTS = 9; // v1.3 までの花の数
const OLD_NEED = [4, 5, 6, 7, 8, 9, 10, 12, 14]; // v1.3 までの咲くまでの回数（育てている途中の花を移すときに使う）
const STAGES = ['たね', '芽', 'ふたば', 'つぼみ', '花'];
// お水 w 回のときの育ち具合（0〜4）。1回で芽、need回で花、そのあいだを3等分
const stageOf = (w, need) => (w <= 0 ? 0 : w >= need ? 4 : 1 + Math.floor(((w - 1) * 3) / (need - 1)));
const needOf = (i) => PLANTS[i].need;
const stars = (need) => '★'.repeat(Math.max(1, need - 2));
// 同じ姿が2回続くとき（5回の花の芽）は、1回目を少し小さく描いて、毎回育ったことが分かるようにする
const growOf = (w, need) => (w > 0 && w < need && stageOf(w, need) === stageOf(w + 1, need) ? 0.72 : 1);
const STAGE_MSG = ['', '芽が出ました', 'ふたばになりました', 'つぼみができました', '咲きました'];
const bloomWord = (p) => p.verb || '咲きました';
// これから出る花（まだ咲かせていない花）の順番。11〜2月は冬のお花が先、ほかの季節はあとまわし
function upcoming() {
  const g = S.garden;
  const yet = PLANTS.map((p, i) => i).filter((i) => !g.coll[PLANTS[i].id] && !(i === g.plant && g.water < needOf(i)));
  const isWinter = [11, 12, 1, 2].includes(new Date().getMonth() + 1);
  const first = yet.filter((i) => !!PLANTS[i].winter === isWinter);
  return [...first, ...yet.filter((i) => !first.includes(i))];
}
const nextSeed = () => upcoming()[0] ?? Math.floor(Math.random() * PLANTS.length);

/* ---------- 保存 ---------- */
function defaults() {
  const menus = PRESETS.map((p) => ({ id: uid(), ...p, exercises: [...p.exercises] }));
  return {
    v: 1, menus, cur: menus[0].id,
    settings: { voice: true, tenSec: true, beep: true, count3: false, rate: 'normal', silentOk: true },
    log: [], // { d:'2026-10-25', t: 時刻, kind:'timer'|'manual', menu, sec }
    garden: { plant: 0, water: 0, coll: {}, blooms: 0, hist: [] }, // hist: 咲いた記録 { id, d }
  };
}
let S;
let saveBlocked = false; // 読めなかったデータの控えも残せなかったときは、上書きしない
// first：起動のとき（更新前の控えを残し、読めないデータも別の名前で残す）。読めたら true
function load(first = false) {
  const base = defaults();
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (first) keepBefore(d, raw);
      S = { ...base, ...d, settings: { ...base.settings, ...d.settings }, garden: { ...base.garden, ...d.garden } };
      if (!Array.isArray(S.menus) || !S.menus.length) S.menus = base.menus;
      migrate(d.garden || {});
      S.ver = VERSION;
      return true;
    }
  } catch {
    if (first && raw) keepBroken(raw);
  }
  S = { ...base, ver: VERSION };
  S.garden.nv = 2;
  return !raw;
}
// 新しい版で初めて開いたとき、直前のデータの控えを端末の中に1つ残す（記録が多いほうを残す）
const KEY_BEFORE = `${KEY}-before`; // 更新する前の控え
const KEY_PREV = `${KEY}-prev`; // 引き継ぎ・復元で置きかえる前の控え
const KEY_BROKEN = `${KEY}-broken`; // 読めなかったデータ
function readCopy(key) {
  try { const d = JSON.parse(localStorage.getItem(key)); return validData(d) ? d : null; } catch { return null; }
}
function keepBefore(d, raw) {
  if (d.ver === VERSION || !Array.isArray(d.log)) return;
  const old = readCopy(KEY_BEFORE);
  if (old && old.log.length > d.log.length) return;
  try { localStorage.setItem(KEY_BEFORE, raw); } catch { /* 残せなくても、今のデータはそのまま */ }
}
const brokenKeys = () => { try { return Object.keys(localStorage).filter((k) => k.startsWith(KEY_BROKEN)); } catch { return []; } };
function keepBroken(raw) {
  try {
    if (brokenKeys().some((k) => localStorage.getItem(k) === raw)) return;
    localStorage.setItem(localStorage.getItem(KEY_BROKEN) ? `${KEY_BROKEN}-${Date.now()}` : KEY_BROKEN, raw);
  } catch { saveBlocked = true; }
}
// 引き継ぎ・復元：今の記録の控えを取ってから置きかえる。うまくいかなければ元に戻す
function replaceData(d) {
  const cur = localStorage.getItem(KEY);
  try { if (cur) localStorage.setItem(KEY_PREV, cur); } catch { toast('今の記録の控えが残せないため、中止しました'); return false; }
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    if (!load()) throw new Error('読めない');
    S.menus.forEach(buildSegs);
    resetTimer(); render(); save();
    return true;
  } catch {
    if (cur) localStorage.setItem(KEY, cur); else localStorage.removeItem(KEY);
    load(); resetTimer(); render();
    toast('読み込めませんでした。今の記録はそのままです');
    return false;
  }
}
// 前の版のデータを今の形に合わせる
function migrate(old) {
  // タバタ（はじめから入っていたもの）は「かんたんタイマー」に置き換える
  S.menus = S.menus.map((m) => (m.name === 'タバタ' && m.work === 20 && m.rest === 10 && m.sets === 8
    && m.exercises.length === 1 && m.exercises[0] === 'ワークアウト' ? { id: m.id, ...PRESETS[2], exercises: [] } : m));
  S.log = (Array.isArray(S.log) ? S.log : []).filter((l) => l && typeof l.d === 'string');
  const g = S.garden;
  if (!g.coll || typeof g.coll !== 'object' || Array.isArray(g.coll)) g.coll = {};
  ['plant', 'water', 'blooms', 'bank'].forEach((k) => { if (!(Number.isInteger(g[k]) && g[k] >= 0)) g[k] = 0; });
  // お庭に植わっている花（hist）が、咲かせた数より少なければ足す（日付は分からない）
  if (!Array.isArray(g.hist)) g.hist = [];
  g.hist = g.hist.filter((h) => h && h.id);
  PLANTS.forEach((p) => {
    for (let i = (g.coll[p.id] || 0) - g.hist.filter((h) => h.id === p.id).length; i > 0; i--) g.hist.unshift({ id: p.id, d: '' });
  });
  // 育てている花は名前（pid）で覚える。stamp（保存したときの番号とお水）が変わっていたら、前の版が触ったあと
  const newShape = (old.nv || 1) >= 2;
  const touched = newShape && Array.isArray(old.stamp) && (old.stamp[0] !== old.plant || old.stamp[1] !== old.water);
  const moved = touched && old.stamp[0] !== old.plant; // 前の版が次の花へ進んだ
  const pi = newShape && !moved ? PLANTS.findIndex((p) => p.id === g.pid) : -1;
  if (pi >= 0) g.plant = pi;
  if (!PLANTS[g.plant]) g.plant = 0;
  const need = needOf(g.plant);
  if (newShape && !touched) {
    if (g.water > need) g.water = need;
  } else {
    // 前の版の数え方：咲いていた花は咲いたまま、育ち途中の花は「あと1回で咲く」までにする（いちばん古い版はどの花も7回）
    const oldNeed = !newShape && !Array.isArray(old.hist) ? 7 : OLD_NEED[g.plant] ?? Infinity;
    g.water = g.water >= oldNeed ? need : Math.min(g.water, need - 1);
  }
  // まだ一度も咲いたことになっていない花は、かならず「咲くところ」から（数え落とさない）
  if (g.water >= need && !g.coll[PLANTS[g.plant].id]) g.water = need - 1;
  g.nv = 2;
}
// 保存する形。番号は前の版でも読める範囲にして、本当の花は pid に入れる（前の版で開いても壊れないように）
function dataOut() {
  const g = S.garden;
  const plant = Math.min(g.plant, OLD_PLANTS - 1);
  return { ...S, garden: { ...g, pid: PLANTS[g.plant].id, plant, stamp: [plant, g.water] } };
}
function save() {
  if (saveBlocked) { toast('記録を読めなかったため、上書きを止めています'); return; }
  try { localStorage.setItem(KEY, JSON.stringify(dataOut())); } catch { toast('保存できませんでした'); }
  if (typeof refreshMoveUrl === 'function') refreshMoveUrl();
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
  count: [[1047, 0, 0.22]], // のこり3秒。運動中でも聞こえるよう、長く大きく鳴らす
  chime: [[988, 0, 0.14], [1319, 0.15, 0.26]],
  fanfare: [[784, 0, 0.12], [988, 0.13, 0.12], [1175, 0.26, 0.12], [1568, 0.4, 0.45]],
  sparkle: [[1568, 0, 0.08], [2093, 0.07, 0.08], [2637, 0.14, 0.1], [3136, 0.22, 0.3]],
  bloom: [[523, 0, 0.16], [659, 0.16, 0.16], [784, 0.32, 0.16], [1047, 0.48, 0.32], [988, 0.82, 0.12], [1047, 0.95, 0.12],
    [1319, 1.08, 0.5], [2093, 1.15, 0.08], [2637, 1.22, 0.08], [3136, 1.29, 0.35]],
};
async function playTone(kind) {
  if (!audioCtx) return;
  // 電話や画面ロックのあとは音が止まっていることがあるので、起こしてから鳴らす
  if (audioCtx.state !== 'running') {
    await Promise.race([audioCtx.resume().catch(() => {}), new Promise((r) => setTimeout(r, kind === 'count' ? 250 : 800))]);
    if (audioCtx.state !== 'running') return;
  }
  await new Promise((res) => {
    const loud = kind === 'count';
    const t0 = audioCtx.currentTime + 0.02;
    let end = 0;
    for (const [f, at, dur] of TONES[kind]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = loud ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(loud ? 0.85 : 0.35, t0 + at + 0.015);
      if (loud) g.gain.setValueAtTime(0.85, t0 + at + dur * 0.7);
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
function say(text, interrupt = false, always = false) {
  if ((!S.settings.voice && !always) || !text || !window.speechSynthesis) return;
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
  if (sec >= 1 && sec <= 3 && seg.dur > 4) {
    if (S.settings.beep) playTone('count');
    if (S.settings.count3 && seg.dur >= 8) say(['', 'いち', 'に', 'さん'][sec], !!window.speechSynthesis?.speaking, true); // 短い区切りは案内の声を切らない
  }
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
function water(n) {
  const g = S.garden;
  const r = { newSeed: false, bloomed: false, lucky: 1, used: 0 };
  if (g.water >= needOf(g.plant)) { // 前の花が咲いていたら、つぎのたねをまく
    g.plant = nextSeed();
    g.water = 0; r.newSeed = true;
  }
  const need = needOf(g.plant);
  r.prevW = g.water;
  while (n > 0 && g.water < need) { g.water++; n--; r.used++; }
  g.bank = Math.min(5, n); // 咲いてあまったお水は、つぎのたねに使う
  r.w = g.water;
  r.stage = stageOf(r.w, need);
  r.stageUp = r.stage > stageOf(r.prevW, need);
  if (g.water >= need) {
    const x = Math.random();
    r.lucky = x < 0.08 ? 3 : x < 0.33 ? 2 : 1; // ときどき2〜3輪まとめて咲く
    const id = PLANTS[g.plant].id;
    g.coll[id] = (g.coll[id] || 0) + r.lucky;
    g.blooms += r.lucky;
    for (let i = 0; i < r.lucky; i++) g.hist.push({ id, d: dayKey() });
    r.bloomed = true;
  }
  return r;
}
// ごほうびのお水（その日の1回目の運動だけ）。やめていた人が戻ったときも、もらえる
function bonusWater() {
  const today = dayKey();
  if (S.log.filter((l) => l.d === today).length !== 1) return [];
  const out = [];
  const wc = weekCount(), st = streak();
  if (wc === 3 || wc === 5) out.push(`今週${wc}日目`);
  if (st > 0 && st % 3 === 0) out.push(`${st}日つづけて`);
  const last = [...doneDays()].filter((d) => d < today).sort().pop();
  if (last) {
    const at = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8));
    if (Math.round((at(today) - at(last)) / 864e5) >= 7) out.push('おかえりなさい');
  }
  return out;
}
function addRecord({ kind, menu, sec }) {
  S.log.push({ d: dayKey(), t: Date.now(), kind, menu, sec });
  save(); // お水の計算の前に、運動した記録を残す
  const bonus = bonusWater();
  const r = water(1 + bonus.length + (S.garden.bank || 0));
  r.bonus = bonus;
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
  return new Set(S.log.filter((l) => l.d >= from && l.d <= dayKey()).map((l) => l.d)).size;
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
// 先のとがった花びら・葉（根もと cx,cy から上へ len、向き rot）
const petal = (cx, cy, len, w, rot, fill) =>
  `<path d="M${cx} ${cy} Q${cx - w} ${cy - len * 0.55} ${cx} ${cy - len} Q${cx + w} ${cy - len * 0.55} ${cx} ${cy}Z" transform="rotate(${rot} ${cx} ${cy})" fill="${fill}"/>`;
const berry = (x, y, r = 5.5, c = '#D2434F') =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${(r * 0.28).toFixed(1)}" fill="#fff" opacity=".75"/>`;
function bloomHead(p, cx, cy) {
  if (p.type === 'poinsettia') {
    let s = '';
    for (let i = 0; i < 4; i++) s += petal(cx, cy, 44, 15, 45 + i * 90, '#6F9274');
    for (let i = 0; i < 6; i++) s += petal(cx, cy, 42, 17, i * 60, '#B93A49');
    for (let i = 0; i < 6; i++) s += petal(cx, cy, 29, 13, 30 + i * 60, '#E0626F');
    [[0, 0], [-5, -3], [5, -3], [-3, 5], [4, 5]].forEach(([x, y]) => { s += `<circle cx="${cx + x}" cy="${cy + y}" r="3" fill="#F3C64F"/>`; });
    return s;
  }
  if (p.type === 'xmasrose') {
    let s = '';
    for (let i = 0; i < 5; i++) {
      s += `<g transform="rotate(${i * 72} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy - 20}" rx="18" ry="20" fill="${p.color}" stroke="#E0BFC2" stroke-width="1.2"/><ellipse cx="${cx}" cy="${cy - 11}" rx="8" ry="10" fill="#E2A9B6" opacity=".5"/></g>`;
    }
    for (let i = 0; i < 12; i++) {
      const a = i * 30 * Math.PI / 180;
      s += `<circle cx="${(cx + Math.cos(a) * 9.5).toFixed(1)}" cy="${(cy + Math.sin(a) * 9.5).toFixed(1)}" r="2.3" fill="#E5CF6B"/>`;
    }
    return `${s}<circle cx="${cx}" cy="${cy}" r="5.5" fill="#9DB86A"/>`;
  }
  if (p.type === 'camellia') {
    let s = leaf(cx + 6, cy + 18, 18, 1.5, false, '#5F8465') + leaf(cx - 6, cy + 18, -18, 1.5, true, '#6B9070');
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 + 30) * Math.PI / 180;
      s += `<circle cx="${(cx + Math.cos(a) * 17).toFixed(1)}" cy="${(cy + Math.sin(a) * 16).toFixed(1)}" r="16" fill="${i % 2 ? '#BC364C' : p.color}"/>`;
    }
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      s += `<circle cx="${(cx + Math.cos(a) * 10).toFixed(1)}" cy="${(cy + Math.sin(a) * 10).toFixed(1)}" r="11.5" fill="#DC5A6E"/>`;
    }
    s += `<circle cx="${cx}" cy="${cy}" r="9.5" fill="#F0C75E"/>`;
    for (let i = 0; i < 8; i++) {
      const a = i * 45 * Math.PI / 180;
      s += `<circle cx="${(cx + Math.cos(a) * 6).toFixed(1)}" cy="${(cy + Math.sin(a) * 6).toFixed(1)}" r="1.8" fill="#FFF4CF"/>`;
    }
    return s;
  }
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
      + `<ellipse cx="100" cy="68" rx="10" ry="15" fill="${p.bud || (p.color === '#FBF1F5' ? '#EFC7D7' : p.color)}"/>` + leaf(100, 80, -60, 0.45) + leaf(100, 80, -60, 0.45, true);
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
  if (p.type === 'holly') {
    const HL = 'M0 0 Q4 -6 10 -5 L13 -12 Q17 -6 23 -8 L27 -14 Q31 -7 36 -8 L46 0 L36 8 Q31 7 27 14 L23 8 Q17 6 13 12 L10 5 Q4 6 0 0Z';
    const hl = (x, y, r, k = 1, c = '#5E8A63') => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${k})"><path d="${HL}" fill="${c}" stroke="#4F7755" stroke-width="1"/><path d="M3 0 H41" stroke="#9CBF9C" stroke-width="1.6" stroke-linecap="round"/></g>`;
    let s = '<path d="M100 172 Q98 130 100 78 M100 138 Q88 128 78 120 M100 132 Q112 122 122 116" stroke="#8C6B5D" stroke-width="5" fill="none" stroke-linecap="round"/>';
    s += hl(98, 152, 205, 0.85) + hl(102, 150, -24, 0.85, '#6B9770') + hl(80, 122, 168, 1) + hl(120, 118, 8, 1, '#6B9770') + hl(82, 118, 232, 0.9, '#6B9770') + hl(118, 114, -56, 0.9);
    s += hl(98, 92, 200, 1.1) + hl(102, 92, -20, 1.1, '#6B9770') + hl(99, 84, 246, 1, '#6B9770') + hl(101, 84, -66, 1);
    [[100, 92], [92, 85], [108, 85], [80, 124], [72, 118], [120, 120], [128, 114]].forEach(([x, y]) => { s += berry(x, y, 6); });
    return s;
  }
  if (p.type === 'mistletoe') {
    let s = '<path d="M98 172 Q94 140 100 116" stroke="#8C6B5D" stroke-width="7" fill="none" stroke-linecap="round"/>';
    const cx = 100, cy = 74;
    s += `<circle cx="${cx}" cy="${cy}" r="36" fill="#86A65A" opacity=".35"/>`;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 13; i++) {
        const a = i * (360 / 13) + k * 14, rr = k ? 12 : 24, t = a * Math.PI / 180;
        const x = cx + Math.sin(t) * rr, y = cy - Math.cos(t) * rr;
        s += petal(+x.toFixed(1), +y.toFixed(1), 23, 8, a - 20, i % 2 ? '#86A65A' : '#A5C274') + petal(+x.toFixed(1), +y.toFixed(1), 23, 8, a + 22, i % 2 ? '#9BB86B' : '#7C9B52');
      }
    }
    [[100, 74], [84, 64], [116, 66], [88, 90], [113, 90], [100, 50], [72, 80], [128, 82], [101, 100]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="5" fill="#FCF8E8" stroke="#DDD3AE" stroke-width="1"/>`; });
    s += '<path d="M100 116 Q84 104 78 114 Q80 126 100 118 Q120 126 122 114 Q116 104 100 116Z" fill="#D2434F"/><path d="M98 118 L90 136 M102 118 L110 136" stroke="#D2434F" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="116" r="5" fill="#B93A49"/>';
    return s;
  }
  if (p.type === 'cotton') {
    let s = '<path d="M100 172 Q98 130 101 62 M100 146 Q86 132 70 118 M100 130 Q116 114 130 104" stroke="#9A7A63" stroke-width="4" fill="none" stroke-linecap="round"/>';
    s += leaf(98, 158, -150, 0.9, false, '#A9B08A') + leaf(102, 152, -24, 0.95, false, '#A9B08A');
    [[101, 54, 1.15], [67, 110, 1], [133, 96, 1]].forEach(([x, y, k]) => {
      for (let i = -2; i <= 2; i++) s += petal(x, y + 12 * k, 25 * k, 8 * k, i * 48, '#A9805F');
      [[-10, 2], [10, 2], [0, 8], [-6, -9], [7, -9]].forEach(([dx, dy], j) => {
        s += `<circle cx="${(x + dx * k).toFixed(1)}" cy="${(y + dy * k).toFixed(1)}" r="${(11.5 * k).toFixed(1)}" fill="${j === 2 ? '#F1E9DE' : '#FFFDF8'}" stroke="#E6DACB" stroke-width=".8"/>`;
      });
      s += `<circle cx="${x}" cy="${y}" r="${10 * k}" fill="#FFFDF8"/>`;
    });
    return s;
  }
  if (p.type === 'cyclamen') {
    let s = '';
    [[[100, 168], [66, 92]], [[100, 168], [100, 68]], [[100, 168], [136, 90]], [[100, 168], [116, 114]]].forEach(([[x1, y1], [x2, y2]]) => {
      s += `<path d="M${x1} ${y1} Q${(x1 + x2) / 2 - 4} ${(y1 + y2) / 2} ${x2} ${y2}" stroke="#B0787F" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    });
    [[66, 158, -14], [134, 158, 14], [84, 148, -6], [117, 149, 8], [100, 163, 0]].forEach(([x, y, r], i) => {
      s += `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 13 C-26 10 -28 -14 -10 -14 Q-2 -14 0 -8 Q2 -14 10 -14 C28 -14 26 10 0 13Z" fill="${i % 2 ? '#7E9E82' : '#6F9274'}"/><path d="M-13 -3 Q0 8 13 -3" stroke="#BCD0BC" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`;
    });
    [[66, 92, 1], [100, 68, 1.15], [136, 90, 1], [116, 114, 0.75]].forEach(([x, y, k]) => {
      [[-52, '#D9779A'], [52, '#D9779A'], [-27, '#E58FB0'], [27, '#E58FB0'], [0, '#EDA6C0']].forEach(([r, c]) => { s += petal(x, y, 33 * k, 13 * k, r, c); });
      s += `<ellipse cx="${x}" cy="${y + 1}" rx="${6 * k}" ry="${4.2 * k}" fill="#B9567C"/>`;
    });
    return s;
  }
  if (p.type === 'nandina') {
    let s = '<path d="M100 172 Q97 120 101 58 M100 128 Q84 112 72 92 M100 116 Q118 98 130 84" stroke="#8C6B5D" stroke-width="3.6" fill="none" stroke-linecap="round"/>';
    const spray = (x, y, r, c) => petal(x, y, 30, 8, r, c) + petal(x, y, 25, 7, r - 42, c) + petal(x, y, 25, 7, r + 42, c);
    s += spray(101, 62, 0, '#7E9E82') + spray(100, 100, -62, '#93B297') + spray(100, 100, 62, '#C98A72') + spray(99, 142, -72, '#C98A72') + spray(101, 140, 72, '#7E9E82') + spray(72, 92, -44, '#7E9E82') + spray(130, 84, 44, '#93B297');
    [[70, 96], [132, 88]].forEach(([x, y]) => {
      [[-9, 0], [0, -3], [9, 0], [-13, 10], [-4, 8], [5, 8], [13, 10], [-9, 18], [0, 17], [9, 18], [-4, 27], [5, 27], [0, 36]].forEach(([dx, dy]) => { s += berry(x + dx, y + dy, 5.2, (dx + dy) % 2 ? '#C63A47' : '#DB505B'); });
    });
    return s;
  }
  if (p.type === 'adonis') {
    const d = { type: 'daisy', color: p.color, center: '#D99A2B', n: 14, r: 1 };
    let s = '';
    [[100, 170, 100, 100], [100, 170, 66, 128], [100, 170, 134, 126]].forEach(([a, b, c, e]) => { s += stemPath(a, b, c, e, 4.5); });
    for (let i = -4; i <= 4; i++) s += petal(100 + i * 9, 170, 34 - Math.abs(i) * 2, 5, i * 13, i % 2 ? '#87A68B' : '#7FA36A');
    s += '<ellipse cx="72" cy="171" rx="24" ry="6" fill="#fff"/><ellipse cx="122" cy="172" rx="26" ry="6" fill="#FBFDFF"/>';
    [[66, 124, 24], [134, 122, 24], [100, 94, 31]].forEach(([x, y, r]) => { s += bloomHead({ ...d, r }, x, y); for (let i = 0; i < 7; i++) s += petal(x, y, r * 0.6, 5, i * 51 + 12, '#FBDD72'); s += `<circle cx="${x}" cy="${y}" r="${r * 0.26}" fill="#D99A2B"/>`; });
    return s;
  }
  if (p.type === 'snowdrop') {
    let s = '';
    [[-26, 92], [-12, 78], [14, 80], [28, 94]].forEach(([dx, top]) => { s += `<path d="M${100 + dx * 0.3} 171 Q${100 + dx * 0.7} 130 ${100 + dx * 1.5} ${top + 22}" stroke="${dx % 4 ? '#87A68B' : '#7E9E82'}" stroke-width="7" fill="none" stroke-linecap="round"/>`; });
    s += '<ellipse cx="80" cy="172" rx="26" ry="5.5" fill="#fff"/><ellipse cx="120" cy="172.5" rx="24" ry="5.5" fill="#FBFDFF"/>';
    [[100, 58, 128, 66, 1.15], [94, 88, 66, 92, 1], [106, 100, 140, 112, 0.9]].forEach(([tx, ty, fx, fy, k]) => {
      s += `<path d="M100 170 Q${tx - 4} ${(170 + ty) / 2} ${tx} ${ty} Q${(tx + fx) / 2} ${ty - 14} ${fx} ${fy}" stroke="#7E9E82" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      [[-24, '#FDFBF8'], [24, '#FDFBF8'], [0, '#FFFFFF']].forEach(([r, c]) => { s += `<path d="M${fx} ${fy} Q${fx - 13 * k} ${fy + 20 * k} ${fx} ${fy + 35 * k} Q${fx + 13 * k} ${fy + 20 * k} ${fx} ${fy}Z" transform="rotate(${r} ${fx} ${fy})" fill="${c}" stroke="#D5DECF" stroke-width="1.2"/>`; });
      s += `<path d="M${fx - 4 * k} ${fy + 24 * k} L${fx} ${fy + 29 * k} L${fx + 4 * k} ${fy + 24 * k}" stroke="#8FB07F" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="${fx}" cy="${fy}" rx="${5.5 * k}" ry="${6 * k}" fill="#8FB07F"/>`;
    });
    return s;
  }
  return stemPath(100, 172, 100, 84) + leaf(101, 142, -18, 1.2) + leaf(101, 120, -18, 1.15, true, '#87A68B') + `<g class="head">${bloomHead(p, 100, 66)}</g>`;
}
// 植物は土のところを支点に風でゆれる（ゆれ方は1つずつずらす）。pot:false はお庭の地面に植えた姿
const GROUND = '<ellipse cx="100" cy="176" rx="40" ry="8" fill="#A88570"/><ellipse cx="100" cy="173" rx="30" ry="5" fill="#8B6B5C"/>';
function plantSVG(p, stage, cls = '', pot = true, size = 1) {
  const delay = -(Math.random() * 6).toFixed(2);
  return `<svg viewBox="0 0 200 ${pot ? 240 : 186}" class="${cls}" aria-hidden="true">${pot ? POT : GROUND}`
    + `<g class="sway" style="animation-delay:${delay}s">${size === 1 ? plantBody(p, stage) : `<g transform="translate(100 172) scale(${size}) translate(-100 -172)">${plantBody(p, stage)}</g>`}</g></svg>`;
}
const plantAt = (p, w) => plantSVG(p, stageOf(w, p.need), '', true, growOf(w, p.need)); // お水w回のときの姿
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
  trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
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
  ph.classList.toggle('last3', T.state === 'run' && !!seg && seg.dur > 4 && left > 0 && left <= 3); // 画面の数字もはずむ
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
    <p class="lead">使うメニューをえらんでください。「編集」で種目や時間を変えられます。いらないメニューは「削除」で消せます。</p>
    ${S.menus.map((m) => `<div class="m-card ${m.id === S.cur ? 'on' : ''}">
      <button type="button" class="m-main" data-act="useMenu" data-id="${m.id}">
        <span class="m-name">${m.id === S.cur ? '<span class="badge">使用中</span>' : ''}${esc(m.name)}</span>
        <span class="m-sum">${menuSummary(m)}</span>
        <span class="m-ex">${noEx(m) ? `${jpSec(m.work)}運動・${m.rest ? `${jpSec(m.rest)}休憩` : '休憩なし'}をくり返します` : m.exercises.map(esc).join('・')}</span>
      </button>
      <div class="m-side">
        <button type="button" class="m-edit" data-act="editMenu" data-id="${m.id}"><span class="ic">${IC.pencil}</span>編集</button>
        <button type="button" class="m-edit m-del" data-act="delMenu" data-id="${m.id}"><span class="ic">${IC.trash}</span>削除</button>
      </div>
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
    ${!d.isNew ? '<button type="button" class="btn-del" data-act="editDelete">このメニューを削除</button>' : ''}
  </div>`;
}

/* お庭 */
// つぎの「ごほうびのお水」まで
function bonusHint() {
  const bank = S.garden.bank || 0;
  const wc = weekCount();
  const left = wc < 3 ? 3 - wc : wc < 5 ? 5 - wc : 0;
  const t = bank ? `💧 お水が<b>${bank}回分</b>たまっています。つぎの運動で使います`
    : left ? `今週あと<b>${left}日</b>運動すると、ごほうびのお水💧` : '今週のごほうびのお水は、ぜんぶもらいました！';
  return `<p class="p-bonus">${t}</p>`;
}
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
      <div class="plant">${plantAt(p, g.water)}</div>
      <div class="pname">${esc(p.name)}<small>${STAGES[stage]}</small></div>
      <div class="drops ${need > 9 ? 'many' : ''}">${Array.from({ length: need }, (_, i) => `<span class="${i < g.water ? 'on' : ''}">${DROP}</span>`).join('')}</div>
      <p class="p-hint">${bloomed ? 'きれいに咲きました！ つぎの運動で、新しいたねから芽が出ます' : `運動するとお水をあげられます。あと<b>${need - g.water}回</b>で咲きます`}</p>
      ${bonusHint()}
    </section>
    <section class="stats">
      <div><b>${streak()}</b><span>日連続</span></div>
      <div><b>${weekCount()}</b><span>今週の回数</span></div>
      <div><b>${doneDays().size}</b><span>合計の日数</span></div>
    </section>
    <button type="button" class="btn-soft" data-act="manual" ${manualDone ? 'disabled' : ''}>${manualDone ? '✓ きょうの運動は記録ずみ' : '💧 タイマーなしで運動した日を記録'}</button>
    ${yardHTML()}
    ${zukanHTML()}
    ${calendarHTML()}
  </div>`;
}
// わたしのお庭：咲かせた花が、咲いた順に地面に植わっていく（新しいもの36本まで）
function yardHTML() {
  const hist = S.garden.hist;
  const shown = hist.slice(-36);
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
function zukanHTML() {
  const g = S.garden;
  const next = upcoming();
  const bloomed = g.water >= needOf(g.plant);
  const cell = (pl, i) => {
    const n = g.coll[pl.id] || 0;
    const st = `<i class="star">${stars(pl.need)}</i>`;
    if (i === g.plant && !bloomed) return `<button type="button" class="ci grow" data-act="zukan" data-i="${i}"><div class="ci-img">${plantAt(pl, g.water)}</div><span>${esc(pl.name)}</span>${st}<em>育て中</em></button>`;
    if (n) return `<button type="button" class="ci" data-act="zukan" data-i="${i}"><div class="ci-img">${plantSVG(pl, 4)}</div><span>${esc(pl.name)}</span>${st}<em>×${n}</em></button>`;
    const pos = next.indexOf(i);
    if (pos === 0 && bloomed) return `<div class="ci grow"><div class="ci-img">${plantSVG(pl, 0)}</div><span>${esc(pl.name)}</span>${st}<em>つぎのたね</em></div>`;
    return `<div class="ci lock"><div class="ci-img">${plantSVG(pl, 4)}</div><span>？？？</span>${st}<em>あと${pos + (bloomed ? 0 : 1)}本咲くと</em></div>`;
  };
  const grid = (winter) => PLANTS.map((pl, i) => (!!pl.winter === winter ? cell(pl, i) : '')).join('');
  return `<section class="card coll">
    <h2>お花図鑑 <small>${PLANTS.filter((p) => g.coll[p.id]).length} / ${PLANTS.length}種類・レベル ${g.blooms + 1}</small></h2>
    <div class="coll-grid">${grid(false)}</div>
    <h3 class="coll-sub">❄️ 冬のお花 <small>11月〜2月に、先に出てきます</small></h3>
    <div class="coll-grid">${grid(true)}</div>
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
const copies = () => [[KEY_BEFORE, 'アップデートの前'], [KEY_PREV, '引き継ぎ・復元の前']].map(([key, label]) => ({ label, d: readCopy(key) })).filter((c) => c.d);
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
      ${tg('beep', 'のこり3秒の音', 'ピッ・ピッ・ピッ')}
      ${tg('count3', 'のこり3秒を声で数える', '「さん・に・いち」')}
      ${tg('silentOk', 'マナーモードでも音を出す', 'iPhoneの消音スイッチがオンでも鳴らします')}
      <div class="row"><span class="r-main"><b>声の速さ</b></span>
        <div class="seg">${[['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'はやめ']].map(([v, l]) => `<button type="button" data-act="rate" data-v="${v}" class="${st.rate === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <button type="button" class="row" data-act="testSound"><span class="r-main"><b>音と声のテスト</b><small>音量はiPhoneの横のボタンで</small></span><span class="ic chev">${IC.chev}</span></button>
    </div>
    <h2 class="sec-title">データ</h2>
    <div class="rows card">
      ${STANDALONE ? '' : `<button type="button" class="row" data-act="homeGuide"><span class="r-main"><b>ホーム画面に置く</b><small>記録が消えにくくなります。やり方を見る</small></span><span class="ic chev">${IC.chev}</span></button>`}
      <button type="button" class="row" data-act="copyCode"><span class="r-main"><b>引き継ぎコードをコピー</b><small>Safariとホーム画面のあいだや、機種変更のときに</small></span><span class="ic chev">${IC.chev}</span></button>
      <button type="button" class="row" data-act="pasteCode"><span class="r-main"><b>引き継ぎコードを貼り付ける</b><small>コピーした記録をここに移します</small></span><span class="ic chev">${IC.chev}</span></button>
      ${copies().length ? `<button type="button" class="row" data-act="restoreCopy"><span class="r-main"><b>控えから戻す</b><small>更新や引き継ぎの前の記録に戻せます</small></span><span class="ic chev">${IC.chev}</span></button>` : ''}
      ${brokenKeys().length ? `<button type="button" class="row" data-act="saveBroken"><span class="r-main"><b>読めなかったデータを書き出す</b><small>ファイルに保存して、取っておけます</small></span><span class="ic chev">${IC.chev}</span></button>` : ''}
      <button type="button" class="row" data-act="backup"><span class="r-main"><b>バックアップを書き出す</b><small>機種変更のときなどに。ファイルに保存します</small></span><span class="ic chev">${IC.chev}</span></button>
      <label class="row"><span class="r-main"><b>バックアップから戻す</b><small>書き出したファイルを読み込みます</small></span><input type="file" accept=".json,application/json" id="restore" hidden><span class="ic chev">${IC.chev}</span></label>
    </div>
    <p class="about">毎日トレーニング v${VERSION}（今は${STANDALONE ? 'ホーム画面のアイコン' : 'Safari'}で開いています）<br>記録はこのiPhoneの中にだけ保存されます。<br>Safariとホーム画面のアイコンでは、記録は別々です。</p>
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
    // 前のダイアログを閉じた合図は少し遅れて届くので、開いている間に来た合図は無視する
    const onClose = () => { if (!d.open) finish(null); };
    d.addEventListener('close', onClose);
    d.onclick = (e) => { if (e.target === d && cls === 'sheet') finish(null); };
    bind(d, finish);
  });
}
const confirmBox = (msg, ok = 'はい', danger = false) => ask(
  `<p class="dlg-msg">${esc(msg).replace(/\n/g, '<br>')}</p><div class="dlg-btns"><button type="button" class="btn ghost" data-v="0">やめる</button><button type="button" class="btn ${danger ? 'danger' : ''}" data-v="1">${esc(ok)}</button></div>`,
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
  else if (!bloom) msg = `${p.name}が、ぐんと伸びました`;
  const after = bloom
    ? `${r.lucky > 1 ? `<p class="cel-lucky">🎉 ラッキー！ ${r.lucky}輪いっしょに</p>` : ''}<p class="cel-big">${esc(p.name)}が<br>${esc(bloomWord(p))}！</p><p class="cel-word">花言葉「${esc(p.word)}」</p><p class="cel-remain">🌼 お花図鑑とお庭に入りました${g.bank ? '<br>あまったお水は、つぎのたねにあげます' : ''}</p>`
    : `${msg ? `<p class="cel-msg">${esc(msg)}</p>` : ''}<p class="cel-remain">あと${remain}回で咲きます</p>`;
  const token = {};
  celebrate.token = token;
  ask(`<div class="rays"></div><div class="petals"></div>
    <h3 class="cel-title">おつかれさまでした！</h3>
    <p class="cel-sub">${esc(sub)}</p>
    <div class="cel-stage">
      <div class="cel-plant">${plantAt(p, r.prevW)}</div>
      <div class="rain">${Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="sparkles"></div>
    </div>
    <p class="cel-water">${r.bonus.length ? `💧×${r.used} ごほうびのお水！<small>${esc(r.bonus.join('・'))}</small>` : `💧${r.used > 1 ? `×${r.used}` : ''} お水をあげました`}</p>
    <div class="cel-after">${after}</div>
    <div class="dlg-btns"><button type="button" class="btn ghost" data-x>とじる</button><button type="button" class="btn" data-g>お庭を見る</button></div>`,
  `center cel${bloom ? ' is-bloom' : ''}`, (d, fin) => {
    $('[data-x]', d).onclick = () => fin(null);
    $('[data-g]', d).onclick = () => { fin(null); go('garden'); };
    // お水が届いたら育つ
    setTimeout(() => {
      if (celebrate.token !== token || !d.open || !$('.cel-plant', d)) return; // 閉じて別の画面を開いたとき
      $('.cel-plant', d).innerHTML = plantAt(p, r.w);
      if (r.w > r.prevW) $('.cel-plant', d).classList.add('grown');
      d.classList.add('revealed');
      const n = bloom ? 16 + (r.lucky - 1) * 8 : 7;
      $('.sparkles', d).innerHTML = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2, rr = 38 + (i % 3) * 14;
        return `<i style="left:${(50 + Math.cos(a) * rr).toFixed(1)}%;top:${(48 + Math.sin(a) * rr * 0.8).toFixed(1)}%;--d:${(i % 5) * 0.15}s;--s:${0.7 + (i % 4) * 0.25}">✦</i>`;
      }).join('');
      if (bloom) {
        const cols = ['var(--rose)', 'var(--honey)', 'var(--sage)', '#F3C64F', '#fff', p.color];
        $('.petals', d).innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 2.83) % 100}%;--c:${cols[i % cols.length]};--d:${(i % 12) * 0.1}s;--r:${(i % 7) * 60}deg"></i>`).join('');
        playTone('bloom').then(() => say(`おめでとうございます。${p.name}が、${bloomWord(p)}`));
      } else playTone('sparkle');
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
  ask(`<div class="zk-img">${growing && !n ? plantAt(pl, g.water) : plantSVG(pl, 4)}</div>
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
/* ---------- 引き継ぎ（Safari ⇄ ホーム画面） ----------
   iPhoneでは、Safariとホーム画面のアイコンで記録の置き場所が別々になる。
   記録を文字の「引き継ぎコード」にしてコピー→もう一方で貼り付けて移す（外へは送らない） */
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const CODE_HEAD = 'MAINICHI-TRAINING:';
const isEmpty = () => !S.log.length && !S.garden.water && !S.garden.blooms;
const validData = (d) => !!d && Array.isArray(d.menus) && d.menus.every((m) => m && Array.isArray(m.exercises)) && !!d.garden && typeof d.garden === 'object' && Array.isArray(d.log);
function makeCode() {
  const bin = new TextEncoder().encode(JSON.stringify(dataOut()));
  let s = '';
  for (let i = 0; i < bin.length; i += 0x8000) s += String.fromCharCode(...bin.subarray(i, i + 0x8000));
  return CODE_HEAD + btoa(s);
}
function readCode(text) {
  // iPhoneやメッセージアプリが頭の文字を小文字にすることがあるので、大文字・小文字は区別しない
  text = String(text || '');
  const i = text.toUpperCase().indexOf(CODE_HEAD);
  if (i < 0) return null;
  const b64 = text.slice(i + CODE_HEAD.length).trim().split(/\s+/)[0];
  try {
    const s = atob(b64);
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))));
    return validData(d) ? d : null;
  } catch { return null; }
}
// 引き継ぐ記録で、今の記録を置きかえる
async function applyData(d) {
  const now = isEmpty() ? '' : `\n今ここにある記録（運動${S.log.length}回）は置きかわります。`;
  if (!(await confirmBox(`運動${d.log.length}回・咲いた花${d.garden.blooms || 0}本の記録を引き継ぎますか？${now}`, '引き継ぐ', !!now))) return false;
  if (!replaceData(d)) return false;
  toast('記録を引き継ぎました');
  return true;
}
async function copyCode() {
  const code = makeCode();
  try { await navigator.clipboard.writeText(code); toast('引き継ぎコードをコピーしました'); return true; } catch { /* 下で手でコピー */ }
  await ask(`<h3 class="dlg-title">引き継ぎコード</h3><p class="dlg-sub">下の文字を長押しして「すべてを選択」→「コピー」</p>
    <textarea class="dlg-input code-box" rows="4" readonly>${esc(code)}</textarea>
    <div class="dlg-btns"><button type="button" class="btn" data-x>とじる</button></div>`,
  'center', (d, fin) => { $('[data-x]', d).onclick = () => fin(null); });
  return false;
}
function pasteCode() {
  return ask(`<h3 class="dlg-title">記録を引き継ぐ</h3><p class="dlg-sub">もう一方でコピーした「引き継ぎコード」を貼り付けます</p>
    <textarea class="dlg-input code-box" rows="3" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="うまくいかないときは、ここを長押し→「ペースト」"></textarea>
    <p class="code-err" hidden></p>
    <div class="dlg-btns"><button type="button" class="btn ghost sm" data-x>やめる</button><button type="button" class="btn" data-ok>貼り付けて引き継ぐ</button></div>`,
  'center', (d, fin) => {
    const box = $('.code-box', d);
    const err = (msg) => { const e = $('.code-err', d); e.textContent = msg; e.hidden = false; };
    $('[data-x]', d).onclick = () => fin(null);
    $('[data-ok]', d).onclick = async () => {
      let text = box.value;
      if (!text.trim()) { try { text = await navigator.clipboard.readText(); } catch { text = ''; } }
      if (!text.trim()) { err('コピーした文字が見つかりません。上の枠を長押しして「ペースト」を押してください'); box.focus(); return; }
      const data = readCode(text);
      if (!data) { err('引き継ぎコードではないようです。もう一方で「引き継ぎコードをコピー」からやり直してください'); return; }
      fin(data);
    };
  }).then((data) => (data ? applyData(data) : false));
}
/* ホーム画面に追加するだけで記録が付いていく仕組み（v1.3）
   Safariで開いている間、記録をページの住所の「#」のうしろ（サーバーには送られない部分）と
   ホーム画面用の設定（manifest の start_url）に入れておく。「ホーム画面に追加」するとその住所でアイコンが作られ、
   アイコンで初めて開いたとき、住所の中の記録を読み込む */
const MOVE_TAG = '#move=';
const b64url = (bin) => { let s = ''; for (let i = 0; i < bin.length; i += 0x8000) s += String.fromCharCode(...bin.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function squeeze(bin, dir) {
  const S2 = dir === 'z' ? window.CompressionStream : window.DecompressionStream;
  return new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new S2('deflate-raw'))).arrayBuffer());
}
// 記録 → 住所に入れる文字（縮められるiPhoneでは縮める。z=縮めた・p=そのまま）
async function packData() {
  const { ui, ...rest } = dataOut();
  const bin = new TextEncoder().encode(JSON.stringify(rest));
  if (window.CompressionStream) { try { return 'z' + b64url(await squeeze(bin, 'z')); } catch { /* そのまま */ } }
  return 'p' + b64url(bin);
}
async function unpackData(t) {
  try {
    let bin = unb64url(t.slice(1));
    if (t[0] === 'z') bin = await squeeze(bin, 'u');
    const d = JSON.parse(new TextDecoder().decode(bin));
    return validData(d) ? d : null;
  } catch { return null; }
}
const appBase = () => location.href.split('#')[0].split('?')[0];
let moveTimer = 0;
// Safariで開いている間、住所とホーム画面用の設定を今の記録に合わせておく
function refreshMoveUrl() {
  if (STANDALONE) return;
  clearTimeout(moveTimer);
  moveTimer = setTimeout(async () => {
    try {
      const url = appBase() + MOVE_TAG + (await packData());
      history.replaceState(null, '', url);
      const base = appBase().replace(/[^/]*$/, '');
      const mf = {
        name: '毎日トレーニング', short_name: '毎日トレーニング', start_url: url, scope: base, display: 'standalone',
        orientation: 'portrait', background_color: '#F7F1EC', theme_color: '#F7F1EC',
        icons: [{ src: `${base}icon-180.png`, sizes: '180x180', type: 'image/png' }, { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' }],
      };
      const link = $('link[rel="manifest"]');
      if (link) link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(mf))}`;
    } catch { /* 住所に入れられなくても、アプリはそのまま使える */ }
  }, 600);
}
// アイコンで開いたとき：住所に記録が入っていれば読み込む
async function takeFromUrl() {
  const i = location.href.indexOf(MOVE_TAG);
  if (i < 0) return false;
  const d = await unpackData(location.href.slice(i + MOVE_TAG.length));
  history.replaceState(null, '', appBase());
  if (!d || S.ui?.moved) return false;
  if (!isEmpty()) {
    // すでにアイコンで使っているときは、Safariのほうが記録が多いときだけ聞く
    if (d.log.length <= S.log.length || !(await confirmBox(`Safariで使っていた記録（運動${d.log.length}回）を引き継ぎますか？\n今ここにある記録（運動${S.log.length}回）は置きかわります。`, '引き継ぐ', true))) {
      S.ui = { ...S.ui, moved: true }; save(); return false;
    }
  }
  if (!replaceData({ ...d, ui: { moved: true, takeOverAsked: true } })) return false;
  await ask(`<h3 class="dlg-title">記録を引き継ぎました</h3>
    <p class="dlg-msg">Safariで使っていた記録（運動${d.log.length}回・咲いた花${d.garden.blooms || 0}本）が入りました。<br>これからは、このアイコンから開いてください。</p>
    <div class="dlg-btns"><button type="button" class="btn" data-x>はじめる</button></div>`,
  'center', (dl, fin) => { $('[data-x]', dl).onclick = () => fin(null); });
  return true;
}
// Safariで開いたとき：ホーム画面に置くやり方（追加するだけで記録も付いていく）
function homeGuide() {
  S.ui = { ...S.ui, homeHint2: Date.now() }; save();
  const has = !isEmpty();
  return ask(`<h3 class="dlg-title">ホーム画面に置きましょう</h3>
    <p class="dlg-sub">Safariは、しばらく開かないと記録を消すことがあります。ホーム画面に置くと消えにくくなります。${has ? '<br><b>今までの記録も、そのまま付いていきます。</b>' : ''}</p>
    <ol class="guide">
      <li>画面の下の<b>共有ボタン</b>（四角に↑）を押す</li>
      <li><b>「ホーム画面に追加」</b>→<b>「追加」</b></li>
      <li>これからは、ホーム画面の<b>アイコン</b>から開く</li>
    </ol>
    <p class="guide-note">すでにアイコンがあるときは、アイコンを長押しして削除してから、もう一度ここから追加してください。</p>
    <div class="dlg-btns"><button type="button" class="btn ghost" data-x>あとで</button><button type="button" class="btn" data-x>わかった</button></div>`,
  'center', (d, fin) => { $$('[data-x]', d).forEach((b) => { b.onclick = () => fin(null); }); });
}
// アイコンで初めて開いて記録が空のとき（住所に記録がなかったとき）
async function askTakeOver() {
  const v = await ask(`<h3 class="dlg-title">ようこそ</h3>
    <p class="dlg-msg">Safari（リンク）で使っていた記録はありますか？</p>
    <button type="button" class="btn wide" data-v="take">ある</button>
    <div class="dlg-btns"><button type="button" class="btn ghost" data-v="new">ない：はじめて使う</button></div>`,
  'center', (d, fin) => { $$('[data-v]', d).forEach((b) => { b.onclick = () => fin(b.dataset.v); }); });
  if (v === 'new') { S.ui = { ...S.ui, takeOverAsked: true }; save(); return; }
  if (v !== 'take') return;
  const w = await ask(`<h3 class="dlg-title">記録を引き継ぐには</h3>
    <ol class="guide">
      <li>このアイコンを<b>長押し</b>して<b>削除</b></li>
      <li>Safariで<b>いつものリンク</b>を開く</li>
      <li><b>共有ボタン</b>（四角に↑）→<b>「ホーム画面に追加」</b></li>
      <li>新しいアイコンを開くと、記録が入っています</li>
    </ol>
    <div class="dlg-btns"><button type="button" class="btn" data-x>わかった</button></div>
    <button type="button" class="txtlink" data-code>引き継ぎコードで移す（くわしい人向け）</button>`,
  'center', (d, fin) => { $('[data-x]', d).onclick = () => fin(null); $('[data-code]', d).onclick = () => fin('code'); });
  if (w === 'code') await pasteCode();
}
async function startHint() {
  if (STANDALONE) {
    if (await takeFromUrl()) return;
    if (isEmpty() && !S.ui?.takeOverAsked) askTakeOver();
    return;
  }
  refreshMoveUrl();
  // v1.3 で案内が変わったので、前の版の案内を見た人にももう一度出す（homeHint → homeHint2）
  if (Date.now() - (S.ui?.homeHint2 || 0) > 7 * 864e5) homeGuide();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- 操作 ---------- */
const timerBusy = () => T.state === 'run' || T.state === 'pause';
// メニューの削除。運動の記録・カレンダー・お庭には手を付けない
async function removeMenu(id) {
  const m = S.menus.find((x) => x.id === id);
  if (!m) return false;
  if (S.menus.length <= 1) { toast('さいごの1つは削除できません'); return false; }
  const using = timerBusy() && T.menuId === id;
  if (!(await confirmBox(`${using ? 'タイマーを止めて、' : ''}「${m.name}」を削除しますか？\n（運動の記録やお庭は消えません）`, '削除する', true))) return false;
  S.menus = S.menus.filter((x) => x.id !== id);
  if (S.cur === id) S.cur = S.menus[0].id;
  save();
  if (using || !timerBusy()) resetTimer();
  toast('削除しました');
  return true;
}
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
    if (await removeMenu(draft.id)) go('menus');
  },
  async delMenu(b) { if (await removeMenu(b.dataset.id)) keepScroll(render); },
  async restoreCopy() {
    const list = copies();
    const i = await ask(`<h3 class="dlg-title">控えから戻す</h3>
      <p class="dlg-sub">今：運動${S.log.length}回・咲いた花${S.garden.blooms}本・メニュー${S.menus.length}個</p>
      <div class="pick-list">${list.map((c, k) => `<button type="button" class="pick-item" data-k="${k}"><b>${c.label}</b><small>運動${c.d.log.length}回・咲いた花${c.d.garden.blooms || 0}本・メニュー${c.d.menus.length}個</small></button>`).join('')}</div>
      <div class="dlg-btns"><button type="button" class="btn ghost" data-x>やめる</button></div>`, 'sheet', (d, fin) => {
      $('[data-x]', d).onclick = () => fin(null);
      $$('.pick-item', d).forEach((b) => { b.onclick = () => fin(+b.dataset.k); });
    });
    if (i != null) await applyData(list[i].d);
  },
  saveBroken() { saveFile(brokenKeys().map((k) => localStorage.getItem(k)).join('\n'), `毎日トレーニング_読めなかったデータ_${dayKey()}.txt`); },
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
    const gap = () => new Promise((r) => setTimeout(r, 450));
    playTone('count').then(gap).then(() => playTone('count')).then(gap).then(() => playTone('count')).then(gap)
      .then(() => playTone('chime')).then(() => say('スクワット、スタート', true));
  },
  backup() { saveFile(JSON.stringify(dataOut(), null, 1), `毎日トレーニング_バックアップ_${dayKey()}.json`); },
};
function saveFile(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
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
      if (!validData(d)) throw new Error('形式');
      if (!(await confirmBox(`バックアップ（記録${d.log.length}件）で、今のデータを置きかえますか？`, '置きかえる', true))) { t.value = ''; return; }
      if (replaceData(d)) toast('バックアップから戻しました');
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
load(true);
resetTimer();
render();
startHint();
try { navigator.storage?.persist?.(); } catch { /* なし */ }
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
