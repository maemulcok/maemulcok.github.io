/* ============================================================
   매물콕 — 멀티유저 매물장
   - 로그인한 계정의 매물만 조회·수정 (Supabase RLS)
   - Supabase 미연결 시 '데모 모드' (이 브라우저에만 저장)
   ============================================================ */
(function () {
'use strict';

var CFG = window.CENTUM_CONFIG || {};
var LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && /^https?:\/\//.test(CFG.SUPABASE_URL));

/* ---------- 단지 목록 (멀티 단지) ---------- */
var CX_LIST = [];
(function () {
  if (window.CENTUM_BOARD) {
    CX_LIST.push({
      id: 'centum', name: '센텀르엘', sub: '101~106동 · 2,070세대',
      desc: '르엘 리버파크 센텀', board: window.CENTUM_BOARD, cols: 6, bottom: 5, fillBlanks: true,
      price: true, dongs: [101, 102, 103, 104, 105, 106]
    });
  }
  if (window.IPARK_BOARD) {
    CX_LIST.push({
      id: 'ipark', name: '해운대아이파크', sub: '1·2·3동 · 1,631세대',
      desc: "수영만 해운대 I'PARK", board: window.IPARK_BOARD, cols: 10, bottom: 3, fillBlanks: true,
      price: false, dongs: [1, 2, 3]
    });
  }
  if (window.ZENITH_BOARD) {
    /* 동 id 201~203: 센텀르엘(101~106)·해운대아이파크(1~3)와 unit_key가 겹치지 않게 하는 내부 번호.
       화면에는 board.dongs 의 name(101동~103동)으로 보인다. */
    CX_LIST.push({
      id: 'zenith', name: '해운대두산위브더제니스', sub: '101·102·103동 · 1,788세대',
      desc: '마린시티 두산위브 더 제니스', board: window.ZENITH_BOARD, cols: 12, bottom: 3, fillBlanks: true,
      price: false, dongs: [201, 202, 203]
    });
  }
  if (!CX_LIST.length) CX_LIST.push({ id: 'empty', name: '단지', sub: '', board: { units: [], area: {}, meta: {} }, cols: 6, bottom: 5, dongs: [] });
})();
var CX = CX_LIST[0];
var BOARD = CX.board;
var DONGS = (CX.dongs || []).slice();
var TOP = {}, BOTTOM = CX.bottom || 5, COLS = CX.cols || 6;
var DONG_META = {};

/* ---------- 기본 상수 ---------- */
var F1_LABEL = {
  101: '판매시설', 102: '판매시설', 103: '판매시설', 104: '판매시설',
  105: '판매시설, 어린이집', 106: '판매시설, 관리사무소'
};
var CENTUM_TYPE_COLOR = {
  '84':   { bg: '#A4B9DC', bd: '#8697B4', fg: '#1F2937' },
  '104A': { bg: '#F0A6C6', bd: '#C488A2', fg: '#1F2937' },
  '104B': { bg: '#EA747C', bd: '#BF5F65', fg: '#1F2937' },
  '104C': { bg: '#BDE3EE', bd: '#9ABAC3', fg: '#1F2937' },
  '104D': { bg: '#A49085', bd: '#86766D', fg: '#1F2937' },
  '125A': { bg: '#FCE29A', bd: '#CEB97E', fg: '#1F2937' },
  '125B': { bg: '#9B8DBE', bd: '#7F739B', fg: '#1F2937' },
  '125C': { bg: '#76B7BB', bd: '#609699', fg: '#1F2937' },
  '125D': { bg: '#B9D8A0', bd: '#97B183', fg: '#1F2937' },
  '154':  { bg: '#F3AA85', bd: '#C78B6D', fg: '#1F2937' },
  '244':  { bg: '#FFFFFF', bd: '#C9C9C9', fg: '#1F2937' }
};
/* 해운대두산위브더제니스 타입 색상 (네이버 부동산 동호수표 타입 색을 그대로 옮김) */
var ZENITH_COLOR = {
  '148AE':   { bg: '#A7E6B2', bd: '#86CF93', fg: '#1F2937' },
  '148AE-1': { bg: '#8ED8A0', bd: '#6FBF83', fg: '#1F2937' },
  '150AW':   { bg: '#7DD98B', bd: '#5FC271', fg: '#1F2937' },
  '155B':    { bg: '#3DAA4F', bd: '#2E8A3E', fg: '#FFFFFF' },
  '162C':    { bg: '#367840', bd: '#2A6333', fg: '#FFFFFF' },
  '173D':    { bg: '#F9B5BA', bd: '#DE979D', fg: '#1F2937' },
  '187E':    { bg: '#F47C86', bd: '#D6616B', fg: '#1F2937' },
  '214FS':   { bg: '#F7BFE0', bd: '#DB9FC2', fg: '#1F2937' },
  '230FN':   { bg: '#E773B7', bd: '#C9569A', fg: '#FFFFFF' },
  '232G':    { bg: '#C2B1FF', bd: '#A492E6', fg: '#1F2937' },
  '233I':    { bg: '#A892F8', bd: '#8B74E0', fg: '#FFFFFF' },
  '247H':    { bg: '#8165EA', bd: '#6A4FD0', fg: '#FFFFFF' },
  '300J':    { bg: '#B8B8E0', bd: '#9A9AC6', fg: '#1F2937' },
  '306KN':   { bg: '#9595C6', bd: '#7A7AAB', fg: '#FFFFFF' },
  '325KS':   { bg: '#5D5DA2', bd: '#4A4A85', fg: '#FFFFFF' }
};
var TYPE_COLOR = CENTUM_TYPE_COLOR;
var ST_NAME = { none: '미확인', sale: '매매', jeonse: '전세', wolse: '월세', done: '보류·완료' };
var ST_COLOR = { none: '#ffffff', sale: '#FEF08A', jeonse: '#BAE6FD', wolse: '#E9D5FF', done: '#FCA5A5' };
var ST_BORDER = { none: '#b9c2cc', sale: '#d9b421', jeonse: '#56b6e0', wolse: '#c084fc', done: '#e88' };
var URG_RE = /급내|급매/;
var FIELDS = ['price', 'owner', 'tenant', 'phone', 'tphone', 'end'];

var COARSE = (function () { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
var MQ_NARROW = window.matchMedia('(max-width: 900px)');
function isNarrow() { return MQ_NARROW.matches; }

/* ---------- 상태 ---------- */
var S = {
  mode: LIVE ? 'live' : 'demo',
  sb: null,
  user: null,          // {id, email}
  profile: null,       // {agency_name, manager_name, approved}
  notes: {},           // key -> {s, price, owner, tenant, phone, tphone, end, memo, urgent, ut}
  pending: new Set(),
  chan: null,
  ready: false
};
/* 관리자가 다른 회원의 배치표를 읽기 전용으로 보고 있을 때 {uid, name, notes, office} */
var RO = null;

/* ---------- 작은 도구 ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function str(v) { return v == null ? '' : String(v).trim(); }
function cleanState(s) {
  return (s === 'sale' || s === 'jeonse' || s === 'wolse' || s === 'done') ? s : 'none';
}
function K(d, h, f) { return d + '-' + h + '-' + f; }
/* 동 이름: 센텀르엘·아이파크는 '101동'·'1동', 제니스는 내부 id 201~203을 '101동'으로 보인다 */
var DONG_LABEL = {};
function dongLabel(d) { return DONG_LABEL[d] || (d + '동'); }
/* 타입 표기: 센텀르엘은 타입명(84·104A), 아이파크는 평형(36평), 제니스는 타입명(162C) */
function typeKind() { return CX.id === 'ipark' ? '평형' : '타입'; }
function chipLabel(t) { return CX.id === 'ipark' ? t + '평' : t; }
function typeFull(t) { return CX.id === 'ipark' ? t + '평형' : (CX.id === 'zenith' ? t + ' 타입' : t + '타입'); }
/* 타입 줄(칸)에는 좁은 칸에 맞는 짧은 이름: 제니스는 숫자를 빼고 영문 타입만(162C→C) */
function rowTypeLabel(t) {
  if (CX.id !== 'zenith') return t;
  var m = String(t).match(/^[\d.]+(.+)$/);
  return m ? m[1] : t;
}
function hoNum(f, h) { return String(f) + String(h).padStart(2, '0'); }
function py(m) { return (m / 3.3058).toFixed(1); }
function won(p) {
  var eok = Math.floor(p / 100000000), man = Math.round((p % 100000000) / 10000);
  if (eok && man) return eok + '억 ' + man.toLocaleString('ko-KR') + '만 원';
  if (eok) return eok + '억 원';
  return man.toLocaleString('ko-KR') + '만 원';
}
function wonShort(p) {
  var eok = Math.floor(p / 100000000), man = Math.round((p % 100000000) / 10000);
  if (eok && man) return eok + '억 ' + man.toLocaleString('ko-KR') + '만';
  if (eok) return eok + '억';
  return man.toLocaleString('ko-KR') + '만';
}
var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
}

/* ---------- 배치표 인덱스 ---------- */
var IDX = new Map(), LINE_TYPE = {}, LINE_TY = {}, DONG_CNT = {}, LINE_CNT = {}, AREA = {};

/* 해운대아이파크 타입 색상 (평형대별) */
var IPARK_COLOR = {
  '36': { bg: '#CFE3CF', bd: '#A9C4A9', fg: '#1F2937' },
  '37': { bg: 'hsl(137,46%,84%)', bd: 'hsl(137,34%,66%)', fg: '#1F2937' },
  '38': { bg: 'hsl(275,46%,84%)', bd: 'hsl(275,34%,66%)', fg: '#1F2937' },
  '39': { bg: 'hsl(52,46%,84%)', bd: 'hsl(52,34%,66%)', fg: '#1F2937' },
  '40': { bg: 'hsl(190,46%,84%)', bd: 'hsl(190,34%,66%)', fg: '#1F2937' },
  '41': { bg: 'hsl(327,46%,84%)', bd: 'hsl(327,34%,66%)', fg: '#1F2937' },
  '42': { bg: '#C7DDF0', bd: '#A2BDD3', fg: '#1F2937' },
  '43': { bg: 'hsl(242,46%,84%)', bd: 'hsl(242,34%,66%)', fg: '#1F2937' },
  '44': { bg: 'hsl(20,46%,84%)', bd: 'hsl(20,34%,66%)', fg: '#1F2937' },
  '45': { bg: '#F3E39B', bd: '#D2C27C', fg: '#1F2937' },
  '46': { bg: 'hsl(295,46%,84%)', bd: 'hsl(295,34%,66%)', fg: '#1F2937' },
  '47': { bg: 'hsl(72,46%,84%)', bd: 'hsl(72,34%,66%)', fg: '#1F2937' },
  '48': { bg: '#B9B3D6', bd: '#9A94B8', fg: '#1F2937' },
  '49': { bg: 'hsl(347,46%,84%)', bd: 'hsl(347,34%,66%)', fg: '#1F2937' },
  '50': { bg: 'hsl(125,46%,84%)', bd: 'hsl(125,34%,66%)', fg: '#1F2937' },
  '51': { bg: '#F6F1D6', bd: '#D8D2AE', fg: '#1F2937' },
  '52': { bg: 'hsl(40,46%,84%)', bd: 'hsl(40,34%,66%)', fg: '#1F2937' },
  '53': { bg: 'hsl(177,46%,84%)', bd: 'hsl(177,34%,66%)', fg: '#1F2937' },
  '54': { bg: '#CBDCC4', bd: '#A8BCA1', fg: '#1F2937' },
  '55': { bg: 'hsl(92,46%,84%)', bd: 'hsl(92,34%,66%)', fg: '#1F2937' },
  '56': { bg: 'hsl(230,46%,84%)', bd: 'hsl(230,34%,66%)', fg: '#1F2937' },
  '57': { bg: 'hsl(7,46%,84%)', bd: 'hsl(7,34%,66%)', fg: '#1F2937' },
  '58': { bg: 'hsl(145,46%,84%)', bd: 'hsl(145,34%,66%)', fg: '#1F2937' },
  '59': { bg: 'hsl(282,46%,84%)', bd: 'hsl(282,34%,66%)', fg: '#1F2937' },
  '60': { bg: '#DDEB9E', bd: '#BCCB7A', fg: '#1F2937' },
  '61': { bg: 'hsl(197,46%,84%)', bd: 'hsl(197,34%,66%)', fg: '#1F2937' },
  '62': { bg: 'hsl(335,46%,84%)', bd: 'hsl(335,34%,66%)', fg: '#1F2937' },
  '63': { bg: 'hsl(112,46%,84%)', bd: 'hsl(112,34%,66%)', fg: '#1F2937' },
  '64': { bg: 'hsl(250,46%,84%)', bd: 'hsl(250,34%,66%)', fg: '#1F2937' },
  '65': { bg: 'hsl(27,46%,84%)', bd: 'hsl(27,34%,66%)', fg: '#1F2937' },
  '66': { bg: '#F6C9A8', bd: '#D6AA89', fg: '#1F2937' },
  '67': { bg: 'hsl(302,46%,84%)', bd: 'hsl(302,34%,66%)', fg: '#1F2937' },
  '68': { bg: 'hsl(80,46%,84%)', bd: 'hsl(80,34%,66%)', fg: '#1F2937' },
  '69': { bg: 'hsl(217,46%,84%)', bd: 'hsl(217,34%,66%)', fg: '#1F2937' },
  '70': { bg: 'hsl(355,46%,84%)', bd: 'hsl(355,34%,66%)', fg: '#1F2937' },
  '71': { bg: 'hsl(132,46%,84%)', bd: 'hsl(132,34%,66%)', fg: '#1F2937' },
  '72': { bg: '#A9D3AE', bd: '#87B08C', fg: '#1F2937' },
  '73': { bg: 'hsl(47,46%,84%)', bd: 'hsl(47,34%,66%)', fg: '#1F2937' },
  '74': { bg: 'hsl(185,46%,84%)', bd: 'hsl(185,34%,66%)', fg: '#1F2937' },
  '75': { bg: 'hsl(322,46%,84%)', bd: 'hsl(322,34%,66%)', fg: '#1F2937' },
  '76': { bg: 'hsl(100,46%,84%)', bd: 'hsl(100,34%,66%)', fg: '#1F2937' },
  '78': { bg: '#D9CD93', bd: '#B9AE74', fg: '#1F2937' },
  '79': { bg: 'hsl(15,46%,84%)', bd: 'hsl(15,34%,66%)', fg: '#1F2937' },
  '80': { bg: 'hsl(152,46%,84%)', bd: 'hsl(152,34%,66%)', fg: '#1F2937' },
  '81': { bg: '#F3BFC6', bd: '#D19EA4', fg: '#1F2937' },
  '82': { bg: 'hsl(67,46%,84%)', bd: 'hsl(67,34%,66%)', fg: '#1F2937' },
  '83': { bg: 'hsl(205,46%,84%)', bd: 'hsl(205,34%,66%)', fg: '#1F2937' },
  '84': { bg: 'hsl(342,46%,84%)', bd: 'hsl(342,34%,66%)', fg: '#1F2937' },
  '86': { bg: 'hsl(120,46%,84%)', bd: 'hsl(120,34%,66%)', fg: '#1F2937' },
  '87': { bg: 'hsl(257,46%,84%)', bd: 'hsl(257,34%,66%)', fg: '#1F2937' },
  '88': { bg: 'hsl(35,46%,84%)', bd: 'hsl(35,34%,66%)', fg: '#1F2937' },
  '89': { bg: '#B9C4EA', bd: '#98A3C7', fg: '#1F2937' },
  '90': { bg: 'hsl(310,46%,84%)', bd: 'hsl(310,34%,66%)', fg: '#1F2937' },
  '91': { bg: 'hsl(87,46%,84%)', bd: 'hsl(87,34%,66%)', fg: '#1F2937' },
  '92': { bg: 'hsl(225,46%,84%)', bd: 'hsl(225,34%,66%)', fg: '#1F2937' },
  '94': { bg: 'hsl(2,46%,84%)', bd: 'hsl(2,34%,66%)', fg: '#1F2937' },
  '95': { bg: 'hsl(140,46%,84%)', bd: 'hsl(140,34%,66%)', fg: '#1F2937' },
  '96': { bg: '#EDE7A8', bd: '#CCC789', fg: '#1F2937' },
  '97': { bg: 'hsl(55,46%,84%)', bd: 'hsl(55,34%,66%)', fg: '#1F2937' },
  '98': { bg: 'hsl(192,46%,84%)', bd: 'hsl(192,34%,66%)', fg: '#1F2937' },
  '99': { bg: '#BEDFF2', bd: '#9CBED0', fg: '#1F2937' },
  '100': { bg: 'hsl(107,46%,84%)', bd: 'hsl(107,34%,66%)', fg: '#1F2937' },
  '101': { bg: 'hsl(245,46%,84%)', bd: 'hsl(245,34%,66%)', fg: '#1F2937' },
  '102': { bg: '#C3CBD6', bd: '#A3ABB6', fg: '#1F2937' },
  '103': { bg: 'hsl(160,46%,84%)', bd: 'hsl(160,34%,66%)', fg: '#1F2937' },
  '104': { bg: 'hsl(298,46%,84%)', bd: 'hsl(298,34%,66%)', fg: '#1F2937' },
  '105': { bg: '#D9BEDA', bd: '#B99EBA', fg: '#1F2937' },
  '106': { bg: 'hsl(213,46%,84%)', bd: 'hsl(213,34%,66%)', fg: '#1F2937' },
  '109': { bg: 'hsl(350,46%,84%)', bd: 'hsl(350,34%,66%)', fg: '#1F2937' },
  '124': { bg: 'hsl(128,46%,84%)', bd: 'hsl(128,34%,66%)', fg: '#1F2937' }
};

function dongMetaFor(cx) {
  var m = {};
  if (cx.id === 'centum') {
    [101, 102, 103, 104, 105, 106].forEach(function (d) {
      var sp = { 19: '19F 피난안전구역 기계실' };
      if (d !== 104) sp[47] = '47F 피난안전구역 기계실';
      m[d] = { top: (d === 104 ? 48 : 67), cols: 6, special: sp };
    });
    return m;
  }
  (cx.board && cx.board.dongs ? cx.board.dongs : []).forEach(function (d) {
    m[d.id] = { top: d.top, cols: d.cols || cx.cols, special: d.special || {}, name: d.name };
  });
  return m;
}

/* 단지 전환: 전역 배치표 상태를 다시 계산한다 */
function setComplex(cx) {
  CX = cx;
  BOARD = cx.board || { units: [], area: {}, meta: {} };
  AREA = BOARD.area || {};
  DONGS = (cx.dongs || []).slice();
  BOTTOM = cx.bottom || 5;
  COLS = cx.cols || 6;
  TYPE_COLOR = (cx.id === 'ipark') ? IPARK_COLOR : (cx.id === 'zenith' ? ZENITH_COLOR : CENTUM_TYPE_COLOR);
  DONG_META = dongMetaFor(cx);
  TOP = {};
  DONGS.forEach(function (d) { TOP[d] = (DONG_META[d] && DONG_META[d].top) || 67; });
  if (cx.id === 'ipark') {
    F1_LABEL = { 1: '판매시설 및 주민공동시설', 2: '판매시설 및 주민공동시설', 3: '판매시설 및 주민공동시설' };
  } else if (cx.id === 'zenith') {
    F1_LABEL = { 201: '로비 · 판매시설', 202: '로비 · 판매시설', 203: '로비 · 판매시설' };
  }
  buildIndex();
  UNIT_FLOORS = (function () { var m = 0, a = []; DONGS.forEach(function (d) { m = Math.max(m, TOP[d]); }); for (var f = m; f >= BOTTOM; f--) a.push(f); return a; })();
  built = false;
  cellMap.clear();
  if (boardEl) { boardEl.innerHTML = ''; boardEl.dataset.cx = cx.id; }
}

function buildIndex() {
  IDX = new Map(); LINE_TYPE = {}; LINE_TY = {}; DONG_CNT = {}; LINE_CNT = {};
  (BOARD.units || []).forEach(function (u) {
    IDX.set(K(u[0], u[1], u[2]), { d: u[0], h: u[1], f: u[2], t: u[3], p: u[4], s: u[5], j: u[6] });
    var meta = DONG_META[u[0]];
    if (meta && meta.special && meta.special[String(u[2])]) return;   /* 특수층 호실은 세대수에서 제외 */
    DONG_CNT[u[0]] = (DONG_CNT[u[0]] || 0) + 1;
    LINE_CNT[u[0] + '-' + u[1]] = (LINE_CNT[u[0] + '-' + u[1]] || 0) + 1;
    if (u[3] !== '244') {
      var lk = u[0] + '-' + u[1];
      LINE_TYPE[lk + '#n'] = LINE_TYPE[lk + '#n'] || {};
      LINE_TYPE[lk + '#n'][u[3]] = (LINE_TYPE[lk + '#n'][u[3]] || 0) + 1;
      /* 라인 안에서 층에 따라 평형이 바뀌는 곳(해운대아이파크 고층 등)을 잡기 위해
         타입별 세대수와 가장 낮은 층·가장 높은 층을 함께 기록한다 */
      var ty = LINE_TY[lk] || (LINE_TY[lk] = {});
      var te = ty[u[3]] || (ty[u[3]] = { n: 0, minF: u[2], maxF: u[2] });
      te.n++;
      if (u[2] < te.minF) te.minF = u[2];
      if (u[2] > te.maxF) te.maxF = u[2];
    }
  });
  /* 라인 대표 타입 = 가장 많은 호실의 타입 */
  Object.keys(LINE_TYPE).forEach(function (lk) {
    if (/#n$/.test(lk)) return;
    var cnt = LINE_TYPE[lk + '#n'];
    if (!cnt) return;
    var best = '', bn = -1;
    Object.keys(cnt).forEach(function (t) { if (cnt[t] > bn) { bn = cnt[t]; best = t; } });
    LINE_TYPE[lk] = best;
  });
}
/* 한 라인의 타입 구성 — 한 가지면 그대로, 두 가지 이상이면
   가장 아래층 타입(좌)과 가장 위층 타입(우)을 대표로 돌려준다. */
function lineTypeInfo(lk) {
  var o = LINE_TY[lk];
  if (!o) return null;
  var ts = Object.keys(o);
  if (!ts.length) return null;
  if (ts.length === 1) return { t: ts[0] };
  ts.sort(function (a, b) { return o[a].minF - o[b].minF || o[b].n - o[a].n; });
  var low = ts[0];
  var high = ts.slice(1).sort(function (a, b) { return o[b].maxF - o[a].maxF || o[b].n - o[a].n; })[0];
  var more = ts.filter(function (t) { return t !== low && t !== high; });
  return { split: true, low: low, high: high, more: more.join('·') };
}
function unitSup(u) { var a = AREA[u.t] || [0, 0, 0, 0, 0]; return (u && u.s != null) ? u.s : a[2]; }
function unitJeon(u) { var a = AREA[u.t] || [0, 0, 0, 0, 0]; return (u && u.j != null) ? u.j : a[0]; }

/* ---------- 메모(매물) 판정 ---------- */
function stateOf(k) { var n = S.notes[k]; return n ? cleanState(n.s) : 'none'; }
function memoOf(k) { var n = S.notes[k]; return n && n.memo ? n.memo : ''; }
function hasInfoNote(n) {
  return !!(n && (str(n.memo) || str(n.price) || str(n.owner) || str(n.tenant) || str(n.phone) || str(n.tphone) || str(n.end) || n.urgent));
}
function hasInfo(k) {
  return hasInfoNote(S.notes[k]);
}
/* 색을 고르지 않고 메모만 적은 호실도 빈 호실이 아니다.
   (빈 값을 저장하면 서버에서 행을 지운다) */
function isEmpty(n) { return !n || (!hasInfoNote(n) && cleanState(n.s) === 'none'); }
function isUrgent(k) {
  var n = S.notes[k];
  if (!n) return false;
  if (n.urgent) return true;
  return URG_RE.test(str(n.memo) + ' ' + str(n.price));
}
function fieldText(k) {
  var n = S.notes[k]; if (!n) return '';
  var st = cleanState(n.s), rental = (st === 'jeonse' || st === 'wolse'), parts = [];
  if (str(n.price)) parts.push((st === 'sale' ? '매매가 P ' : rental ? '보증금·월세 ' : '금액 ') + str(n.price));
  if (str(n.owner)) parts.push((rental ? '임대인 ' : '소유주 ') + str(n.owner));
  if (str(n.phone)) parts.push((rental ? '임대인 연락처 ' : '연락처 ') + str(n.phone));
  if (str(n.tenant)) parts.push('임차인 ' + str(n.tenant));
  if (str(n.tphone)) parts.push('임차인 연락처 ' + str(n.tphone));
  if (str(n.end)) parts.push('만기 ' + str(n.end));
  return parts.join(' · ');
}

/* ============================================================
   저장소 — 데모(브라우저) / 운영(Supabase)
   ============================================================ */
function noteToRow(k, n) {
  var cx = cxByKey(k);
  return {
    user_id: S.user.id,
    unit_key: k,
    complex: cx ? cx.id : 'centum',
    status: cleanState(n.s),
    price: str(n.price) || null,
    owner_name: str(n.owner) || null,
    tenant_name: str(n.tenant) || null,
    tenant_phone: str(n.tphone) || null,
    lease_end_date: str(n.end) || null,
    phone: str(n.phone) || null,
    memo: str(n.memo) || null,
    urgent: !!n.urgent
  };
}
function rowToNote(r) {
  return {
    s: cleanState(r.status),
    price: str(r.price),
    owner: str(r.owner_name),
    tenant: str(r.tenant_name),
    tphone: str(r.tenant_phone),
    end: str(r.lease_end_date).slice(0, 10),
    phone: str(r.phone),
    memo: str(r.memo),
    urgent: r.urgent ? 1 : 0,
    ut: Date.parse(r.updated_at) || 0
  };
}

var DemoStore = {
  key: function () { return 'cls.demo.data.' + S.user.id; },
  all: function () {
    try { return JSON.parse(localStorage.getItem(this.key()) || '{}') || {}; } catch (e) { return {}; }
  },
  loadAll: async function () { return this.all(); },
  save: async function (k, n) {
    var all = this.all();
    if (isEmpty(n)) delete all[k]; else { all[k] = n; n.ut = Date.now(); }
    localStorage.setItem(this.key(), JSON.stringify(all));
    return n ? n.ut : 0;
  },
  saveMany: async function (map) {
    var out = {}, self = this, t = Date.now();
    Object.keys(map).forEach(function (k) { var n = map[k]; n.ut = t; out[k] = n; });
    localStorage.setItem(this.key(), JSON.stringify(out));
  },
  removeAll: async function () { localStorage.removeItem(this.key()); },
  subscribe: function () { /* 같은 브라우저의 다른 탭만 반영 */ }
};

var CloudStore = {
  loadAll: async function () {
    var out = {}, from = 0, step = 1000;
    for (;;) {
      var res = await S.sb.from('listings').select('*')
        .eq('user_id', S.user.id)          /* 관리자 계정이어도 배치표는 내 매물만 */
        .order('unit_key', { ascending: true }).range(from, from + step - 1);
      if (res.error) throw res.error;
      var rows = res.data || [];
      rows.forEach(function (r) { out[r.unit_key] = rowToNote(r); });
      if (rows.length < step) break;
      from += step;
    }
    return out;
  },
  save: async function (k, n) {
    if (isEmpty(n)) {
      var del = await S.sb.from('listings').delete().eq('user_id', S.user.id).eq('unit_key', k);
      if (del.error) throw del.error;
      return 0;
    }
    var res = await S.sb.from('listings')
      .upsert(noteToRow(k, n), { onConflict: 'user_id,unit_key' })
      .select('updated_at').single();
    if (res.error && /complex/i.test(res.error.message || '')) {
      /* 아직 complex 컬럼 마이그레이션 전이면 컬럼 없이 저장한다 */
      var row = noteToRow(k, n); delete row.complex;
      res = await S.sb.from('listings').upsert(row, { onConflict: 'user_id,unit_key' })
        .select('updated_at').single();
    }
    if (res.error) throw res.error;
    return Date.parse(res.data && res.data.updated_at) || Date.now();
  },
  saveMany: async function (map) {
    var before = await this.loadAll();
    await this.removeAll();
    var keys = Object.keys(map), self = this;
    try {
      for (var i = 0; i < keys.length; i += 200) {
        var chunk = keys.slice(i, i + 200).map(function (k) { return noteToRow(k, map[k]); });
        var res = await S.sb.from('listings').insert(chunk);
        if (res.error) throw res.error;
      }
    } catch (e) {
      /* 불러오기에 실패하면 원래 기록을 되살린다 */
      try {
        var back = Object.keys(before).map(function (k) { return noteToRow(k, before[k]); });
        if (back.length) await S.sb.from('listings').insert(back);
      } catch (e2) { /* 되살리기도 실패 — 아래에서 알린다 */ }
      throw e;
    }
  },
  removeAll: async function () {
    var res = await S.sb.from('listings').delete().eq('user_id', S.user.id);
    if (res.error) throw res.error;
  },
  subscribe: function (onChange) {
    if (S.chan) { try { S.sb.removeChannel(S.chan); } catch (e) {} }
    S.chan = S.sb.channel('listings-' + S.user.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'listings', filter: 'user_id=eq.' + S.user.id },
        onChange)
      .subscribe();
  }
};

function Store() { return S.mode === 'live' ? CloudStore : DemoStore; }

/* ---------- 저장 큐 ---------- */
var flushT = null, inflight = false;
function markDirty(k) {
  if (RO) return;
  S.pending.add(k); scheduleFlush(500); mirrorSoon();
}
function scheduleFlush(ms) {
  clearTimeout(flushT);
  flushT = setTimeout(flush, ms || 500);
}
async function flush() {
  if (RO) { S.pending.clear(); return; }
  if (inflight) { scheduleFlush(600); return; }
  if (!S.pending.size) return;
  inflight = true;
  var keys = Array.from(S.pending);
  var failed = 0;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], n = S.notes[k];
    S.pending.delete(k);
    try {
      var ut = await Store().save(k, n);
      if (n && ut) n.ut = ut;
      if (cur === k) flashSaved('저장됨');
    } catch (e) {
      failed++;
      S.pending.add(k);
      console.warn('[저장 실패]', k, e);
      if (cur === k) flashSaved('저장 실패');
    }
  }
  inflight = false;
  if (failed) {
    toast('저장하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    scheduleFlush(5000);
  }
  mirrorSoon();
}

/* ---------- 이 기기 캐시 (빠른 첫 화면 · 오프라인 열람) ---------- */
var cacheKey = function () { return 'cls.cache.' + S.user.id; };
var mirrorT = null;
function mirrorSoon() {
  if (RO) return;
  clearTimeout(mirrorT);
  mirrorT = setTimeout(function () {
    try { localStorage.setItem(cacheKey(), JSON.stringify(S.notes)); } catch (e) {}
  }, 400);
}
function mirrorNow() {
  if (RO) return;
  try { localStorage.setItem(cacheKey(), JSON.stringify(S.notes)); } catch (e) {}
}
function cachedNotes() {
  try { return JSON.parse(localStorage.getItem(cacheKey()) || '{}') || {}; } catch (e) { return {}; }
}

/* ============================================================
   배치표 그리기
   ============================================================ */
var cellMap = new Map();
var boardEl = $('board');
var UNIT_FLOORS = [];

setComplex(CX);

/* 동 하나 그리기 (멀티 단지 공용) */
function buildDong(d) {
  var meta = DONG_META[d] || { top: TOP[d] || 67, cols: COLS, special: {} };
  var cols = meta.cols || COLS;
  var box = document.createElement('div');
  box.className = 'dong';
  box.dataset.d = d;
  box.id = 'd' + d;

  var html = '<table class="grid"><colgroup><col class="fc">' + '<col>'.repeat(cols) + '</colgroup>';
  html += '<thead><tr><th class="dh" colspan="' + (cols + 1) + '">' + dongLabel(d)
        + '<span class="ds">' + (DONG_CNT[d] || 0).toLocaleString('ko-KR') + '세대</span></th></tr></thead><tbody>';

  var maxTop = 0;
  DONGS.forEach(function (x) { maxTop = Math.max(maxTop, TOP[x]); });

  UNIT_FLOORS.forEach(function (f) {
    if (f > meta.top) {
      if (!CX.fillBlanks) return;
      html += '<tr class="fz"><th class="fc bz">' + f + '층</th><td class="blank" colspan="' + cols + '"></td></tr>';
      return;
    }
    var sp = meta.special && meta.special[String(f)];
    if (sp && f !== BOTTOM) {
      html += '<tr><th class="fc evac">' + f + '층</th><td class="evac" colspan="' + cols + '">' + esc(sp) + '</td></tr>';
      return;
    }
    var tr = '<tr><th class="fc">' + f + '층</th>';
    for (var h = 1; h <= cols; h++) {
      var u = IDX.get(K(d, h, f));
      if (u) {
        var span = (u.t === '244') ? 2 : 1;
        var ho = hoNum(f, h);
        /* 호실 칸은 미등록이면 순백(#ffffff). 타입·평형 색은 각 동 맨 아래 '타입' 행에만 넣는다.
           상태 색(매매·전세·월세·보류)과 급매 테두리는 paintCell 이 붙이는 클래스로만 칠한다. */
        tr += '<td class="c" colspan="' + span + '" data-k="' + K(d, h, f) + '" data-d="' + d
            + '" data-ho="' + h + '" data-f="' + f + '" data-t="' + u.t + '"'
            + ' aria-label="' + dongLabel(d) + ' ' + ho + '호 ' + u.t + '타입"><span class="num">' + ho + '</span></td>';
        if (span === 2) h++;
      } else {
        tr += '<td class="fx"></td>';
      }
    }
    html += tr + '</tr>';
  });

  /* 저층부 (단지별) */
  if (CX.id === 'ipark') {
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + cols + '">판매시설 및 주민공동시설</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + cols + '">판매시설 및 주민공동시설</td></tr>';
  } else if (CX.id === 'zenith') {
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + cols + '">판매시설 · 공용부</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + cols + '">' + (F1_LABEL[d] || '로비 · 판매시설') + '</td></tr>';
  } else {
    html += '<tr><th class="fc">4층</th><td class="fx">필로티</td><td class="fx">필로티</td><td class="fx">필로티</td>'
          + '<td class="fx lobby" colspan="2">로비</td><td class="fx">필로티</td></tr>';
    html += '<tr><th class="fc">3층</th><td class="fx under" colspan="' + cols + '">부대복리시설</td></tr>';
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + cols + '">판매시설</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + cols + '">' + (F1_LABEL[d] || '판매시설') + '</td></tr>';
  }

  html += '<tr class="sum dongrow"><th>동</th><td colspan="' + cols + '">' + dongLabel(d)
        + '<span class="sub">(' + (DONG_CNT[d] || 0).toLocaleString('ko-KR') + '세대)</span></td></tr>';

  html += '<tr class="sum typerow"><th>타입</th>';
  for (var j = 1; j <= cols; j++) {
    var info = lineTypeInfo(d + '-' + j);
    var badge = (j === 1 && CX.id === 'centum') ? '<i class="b244">244</i>' : '';
    if (!info) {
      html += '<td>' + badge + '</td>';
    } else if (!info.split) {
      var c = TYPE_COLOR[info.t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
      html += '<td style="background:' + c.bg + ';border-color:' + c.bd + ';color:' + c.fg + '" title="' + dongLabel(d) + ' ' + j + '호 라인 · ' + info.t + '타입">'
            + rowTypeLabel(info.t) + badge + '</td>';
    } else {
      /* 같은 라인에 평형이 섞여 있으면 대각선으로 나눠 좌=저층 평형, 우=고층 평형 */
      var cl = TYPE_COLOR[info.low] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
      var ch = TYPE_COLOR[info.high] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
      html += '<td class="tsplit" style="background:linear-gradient(135deg,' + cl.bg + ' 49%,#ffffff 49.5%,#ffffff 50.5%,' + ch.bg + ' 51%);border-color:' + cl.bd + ';color:#1F2937"'
            + ' title="' + dongLabel(d) + ' ' + j + '호 라인 · 저층 ' + info.low + ' · 고층 ' + info.high
            + (info.more ? ' (사이 ' + info.more + ')' : '') + '">'
            + rowTypeLabel(info.low) + '/' + rowTypeLabel(info.high) + badge + '</td>';
    }
  }
  html += '</tr>';
  html += '<tr class="sum linerow"><th>라인</th>';
  for (var k = 1; k <= cols; k++) html += '<td>' + k + '호</td>';
  html += '</tr>';
  html += '<tr class="sum cntrow"><th>세대수</th>';
  for (var m = 1; m <= cols; m++) html += '<td>' + (LINE_CNT[d + '-' + m] || 0) + '</td>';
  html += '</tr>';

  html += '</tbody></table>';
  box.innerHTML = html;
  box.querySelectorAll('td.c[data-k]').forEach(function (td) { cellMap.set(td.dataset.k, td); });
  return box;
}

var built = false;
function buildBoard() {
  if (built) return;
  boardEl.innerHTML = '';
  cellMap.clear();
  DONGS.forEach(function (d) { boardEl.appendChild(buildDong(d)); });

  var types = Array.from(new Set((BOARD.units || []).map(function (u) { return u[3]; })))
    .sort(function (a, b) { return parseInt(a) - parseInt(b) || a.localeCompare(b); });
  var tl = $('tlegend');
  tl.innerHTML = '';
  types.forEach(function (t) {
    var c = TYPE_COLOR[t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
    var s = document.createElement('span');
    s.className = 'tchip';
    s.style.background = c.bg; s.style.borderColor = c.bd; s.style.color = c.fg;
    s.textContent = chipLabel(t);
    /* 칩을 누르면 그 타입만 강조(필터). 다시 누르면 해제 */
    s.dataset.t = t;
    s.title = s.textContent + '만 강조 — 다시 누르면 해제';
    s.onclick = function () {
      var cur = $('sel-type').value;
      $('sel-type').value = (cur === t) ? '' : t;
      applyFilters();
    };
    tl.appendChild(s);
  });

  var selT = $('sel-type');
  selT.length = 1;
  types.forEach(function (t) {
    var o = document.createElement('option'); o.value = t;
    o.textContent = typeFull(t);
    selT.appendChild(o);
  });
  var selD = $('sel-dong');
  selD.length = 1;
  DONGS.forEach(function (d) {
    var o = document.createElement('option'); o.value = d; o.textContent = dongLabel(d); selD.appendChild(o);
  });

  var tabs = $('tabs');
  tabs.innerHTML = '';
  DONGS.forEach(function (d) {
    var b = document.createElement('button');
    b.dataset.d = d;
    b.innerHTML = dongLabel(d) + '<span class="n">' + (DONG_CNT[d] || 0).toLocaleString('ko-KR') + '</span>';
    b.onclick = function () { jumpTo(d); };
    tabs.appendChild(b);
  });
  built = true;
}

function jumpTo(d) {
  var el = $('d' + d);
  if (!el) return;
  var barh = $('bar').offsetHeight + ($('tabs').offsetHeight || 0) + 6;
  var y = el.getBoundingClientRect().top + window.scrollY - barh;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  setTab(d);
}
function setTab(d) {
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.classList.toggle('on', b.dataset.d === String(d));
  });
}
var scT = null;
window.addEventListener('scroll', function () {
  if (!isNarrow() || !built) return;
  if (scT) return;
  scT = requestAnimationFrame(function () {
    scT = null;
    var barh = $('bar').offsetHeight + 20;
    var top = window.scrollY + barh, cd = 101;
    DONGS.forEach(function (d) {
      var el = $('d' + d);
      if (el && el.getBoundingClientRect().top + window.scrollY <= top) cd = d;
    });
    setTab(cd);
  });
}, { passive: true });

/* ============================================================
   칠하기 · 필터 · 집계
   ============================================================ */
function paintUrgent(td, on) {
  var el = td.querySelector('.urg');
  if (on) {
    if (!el) { el = document.createElement('i'); el.className = 'urg'; el.textContent = '(급)'; td.appendChild(el); }
    td.classList.add('is-urgent');
  } else {
    if (el) el.remove();
    td.classList.remove('is-urgent');
  }
}
function paintCell(k) {
  var td = cellMap.get(k); if (!td) return;
  var st = stateOf(k);
  td.classList.remove('s-sale', 's-jeonse', 's-wolse', 's-done');
  if (st !== 'none') td.classList.add('s-' + st);
  paintUrgent(td, isUrgent(k));
}
function paintAll() { cellMap.forEach(function (td, k) { paintCell(k); }); updateCounts(); }

function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ''); }
function curFilter() {
  var on = document.querySelector('#seg-status button.on');
  return {
    q: norm($('q').value),
    st: on ? on.dataset.st : 'all',
    ty: $('sel-type').value,
    dg: $('sel-dong').value
  };
}
function isMatch(td, st, f) {
  if (f.dg && td.dataset.d !== f.dg) return false;
  if (f.ty && td.dataset.t !== f.ty) return false;
  if (f.st === 'sale' && st !== 'sale') return false;
  if (f.st === 'jeonse' && st !== 'jeonse') return false;
  if (f.st === 'wolse' && st !== 'wolse') return false;
  if (f.st === 'done' && st !== 'done') return false;
  if (f.st === 'urgent' && !isUrgent(td.dataset.k)) return false;
  if (f.st === 'memo' && !hasInfo(td.dataset.k)) return false;
  if (f.q) {
    var k = td.dataset.k;
    var hay = norm(dongLabel(td.dataset.d) + td.dataset.ho + '호' + td.dataset.f + '층'
                 + hoNum(td.dataset.f, td.dataset.ho) + ' ' + k + ' ' + ST_NAME[st] + ' '
                 + memoOf(k) + ' ' + fieldText(k) + (isUrgent(k) ? ' 급매' : ''));
    if (hay.indexOf(f.q) < 0) return false;
  }
  return true;
}
function applyFilters() {
  var f = curFilter(), searching = !!f.q;
  cellMap.forEach(function (td, k) {
    var ok = isMatch(td, stateOf(k), f);
    td.classList.toggle('dim', !ok);
    td.classList.toggle('hit', searching && ok);
  });
  /* 범례 칩에도 지금 고른 타입 표시를 맞춰 준다 */
  document.querySelectorAll('#tlegend .tchip').forEach(function (c) {
    c.classList.toggle('on', !!f.ty && c.dataset.t === f.ty);
  });
  updateCounts();
}
/* 이 호실이 어느 단지 것인지 — 단지 인덱스가 아직 만들어지기 전에는
   지금 배치표(IDX)에 있으면 현재 단지로 본다 */
function noteCxId(k) {
  var cx = cxByKey(k);
  if (cx) return cx.id;
  return IDX.has(k) ? CX.id : null;
}
function eachUnitKey(fn) {
  if (HOME_ON) {
    CX_LIST.forEach(function (cx) {
      ((cx.board && cx.board.units) || []).forEach(function (u) { fn(K(u[0], u[1], u[2])); });
    });
  } else {
    (BOARD.units || []).forEach(function (u) { fn(K(u[0], u[1], u[2])); });
  }
}
function updateCounts() {
  var c = { sale: 0, jeonse: 0, wolse: 0, done: 0, memo: 0 };
  /* 지금 보고 있는 배치표(홈이면 전체 단지)의 호실만 센다.
     다른 단지의 매물 수가 섮여 '내 매물 63호실'처럼 보이던 문제를 막는다. */
  eachUnitKey(function (k) {
    var st = stateOf(k);
    if (st !== 'none') c[st]++;
    if (hasInfo(k)) c.memo++;
  });
  $('c-sale').textContent = c.sale.toLocaleString('ko-KR');
  $('c-jeonse').textContent = c.jeonse.toLocaleString('ko-KR');
  $('c-wolse').textContent = c.wolse.toLocaleString('ko-KR');
  $('c-done').textContent = c.done.toLocaleString('ko-KR');
  $('c-memo').textContent = c.memo.toLocaleString('ko-KR');
  var mine = 0;
  Object.keys(S.notes).forEach(function (k) {
    if (!(hasInfoNote(S.notes[k]) || stateOf(k) !== 'none')) return;
    if (HOME_ON || noteCxId(k) === CX.id) mine++;
  });
  $('c-seed').textContent = mine.toLocaleString('ko-KR');
  if (HOME_ON) { $('c-show').textContent = '–'; return; }
  var shown = 0, f = curFilter();
  cellMap.forEach(function (td, k) { if (isMatch(td, stateOf(k), f)) shown++; });
  $('c-show').textContent = shown.toLocaleString('ko-KR');
}

/* ============================================================
   툴팁 (PC)
   ============================================================ */
var tipEl = $('tip'), tipOn = false;
function showTip(td, x, y) {
  var d = td.dataset.d, h = td.dataset.ho, f = td.dataset.f, t = td.dataset.t, key = td.dataset.k;
  var u = IDX.get(key); if (!u) return;
  var st = stateOf(key), sup = unitSup(u), jeon = unitJeon(u);
  var tname = typeFull(t);
  var memo = memoOf(key).replace(/\n+/g, ' · ').replace(/\s+/g, ' ').trim();
  var ft = fieldText(key), urg = isUrgent(key);
  tipEl.innerHTML = '<b>' + dongLabel(d) + ' ' + hoNum(f, h) + '호</b>' + (urg ? ' <em class="uu">(급)</em>' : '')
    + ' · ' + tname + (CX.price ? ' · <i>' + won(u.p) + '</i>' : '')
    + '<span class="stx"><em style="background:' + ST_COLOR[st] + ';border:1px solid ' + ST_BORDER[st] + '"></em>' + ST_NAME[st] + '</span>'
    + (ft ? '<em class="fl">' + esc(ft) + '</em>' : '')
    + '<em class="ar">공급 <b>' + sup.toFixed(2) + '㎡</b> (' + py(sup) + '평) · 전용 <b>' + jeon.toFixed(2) + '㎡</b> (' + py(jeon) + '평)</em>'
    + (memo ? '<s>' + esc(memo.slice(0, 110)) + '</s>' : '')
    + '<u>' + (COARSE ? '한 번 탭' : '더블클릭') + '하면 메모장 · 색상 · 계약금</u>';
  tipEl.classList.add('on'); tipOn = true;
  moveTip(x, y);
}
function moveTip(x, y) {
  if (!tipOn) return;
  var w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  var left = x + 14, top = y + 16;
  if (left + w > window.innerWidth - 8) left = x - w - 12;
  if (top + hh > window.innerHeight - 8) top = y - hh - 12;
  tipEl.style.left = Math.max(6, left) + 'px';
  tipEl.style.top = Math.max(6, top) + 'px';
}
function hideTip() { tipEl.classList.remove('on'); tipOn = false; }
document.addEventListener('mouseover', function (e) {
  if (COARSE || isNarrow()) return;
  var td = e.target.closest && e.target.closest('td.c[data-k]');
  if (td) showTip(td, e.clientX, e.clientY); else hideTip();
});
document.addEventListener('mousemove', function (e) { if (tipOn) moveTip(e.clientX, e.clientY); });
document.addEventListener('mouseleave', hideTip);
window.addEventListener('scroll', hideTip, { passive: true });

/* ============================================================
   메모장 — PC는 호실 옆 카드, 모바일은 하단 시트
   ============================================================ */
var mc = $('mc'), ov = $('ov');
var mcHo = $('mc-ho'), mcType = $('mc-type'), mcPrice = $('mc-price'), mcGy = $('mc-gy'),
    mcJn = $('mc-jn'), mcGye = $('mc-gye'), mcMemo = $('mc-memo'), mcSaved = $('mc-saved'),
    mcStat = $('mc-stat'), mcFields = $('mc-fields'), mcUrg = $('mc-urg');
var mcIn = { price: $('mc-price-in'), owner: $('mc-owner'), phone: $('mc-phone'), tenant: $('mc-tenant'), tphone: $('mc-tphone'), end: $('mc-end') };

var cur = null, curTd = null, selTd = null, curBase = '', saveT = null, justOpened = false, joT = null, posT = null;

function curSig() {
  var o = { memo: mcMemo.value };
  FIELDS.forEach(function (f) { o[f] = mcIn[f].value; });
  return JSON.stringify(o);
}
function readFields() {
  var o = {};
  FIELDS.forEach(function (f) { var v = mcIn[f].value.trim(); if (v) o[f] = v; });
  return o;
}
function fillEditor(k) {
  var n = S.notes[k] || {};
  FIELDS.forEach(function (f) {
    var v = str(n[f]);
    mcIn[f].value = (f === 'phone' || f === 'tphone') ? fmtPhone(v) : v;
  });
  mcMemo.value = memoOf(k);
  curBase = curSig();
  setStatusUI(stateOf(k));
  setUrgUI(isUrgent(k));
}
function flashSaved(text) {
  mcSaved.textContent = text || '저장됨';
  mcSaved.classList.add('on');
  clearTimeout(saveT);
  if (text !== '저장 실패') saveT = setTimeout(function () { mcSaved.classList.remove('on'); }, 1400);
}
function setUrgUI(on) { mcUrg.dataset.on = on ? '1' : '0'; }
function setStatusUI(st) {
  document.querySelectorAll('#mc-stat button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === st); });
  syncFieldUI(st);
}
/* 다른 회원의 배치표를 볼 때 메모장을 읽기 전용으로 바꾸고, 돌아오면 되돌린다 */
function applyROView() {
  var ro = !!RO;
  mc.classList.toggle('ro', ro);
  [mcMemo].concat(FIELDS.map(function (f) { return mcIn[f]; })).forEach(function (el) {
    el.readOnly = ro;
    if (ro) el.setAttribute('tabindex', '-1'); else el.removeAttribute('tabindex');
  });
  document.querySelectorAll('#mc-stat button').forEach(function (b) { b.disabled = ro; });
  mcUrg.disabled = ro;
  $('mc-del').hidden = ro;
  if (ro) { mcSaved.textContent = '읽기 전용 · 보기만'; mcSaved.classList.add('on'); }
  else { mcSaved.textContent = '저장됨'; mcSaved.classList.remove('on'); }
}
function syncFieldUI(st) {
  var rental = (st === 'jeonse' || st === 'wolse');
  mcFields.classList.toggle('rental', rental);
  $('mc-lb-price').textContent = st === 'sale' ? '매매가 · P' : st === 'jeonse' ? '보증금' : st === 'wolse' ? '보증금 · 월세' : '금액';
  $('mc-lb-owner').textContent = rental ? '임대인' : '소유주';
  $('mc-lb-phone').textContent = rental ? '임대인 연락처' : '연락처';
  if (cur && !isNarrow()) requestAnimationFrame(placeCard);
}
function selectCell(td) {
  if (selTd) selTd.classList.remove('sel');
  selTd = td;
  if (td) td.classList.add('sel');
}
function placeCard() {
  if (!cur || !curTd || isNarrow()) return;
  var r = curTd.getBoundingClientRect();
  var w = mc.offsetWidth || 356, h = mc.offsetHeight || 320;
  var barB = $('bar').getBoundingClientRect().bottom;
  var topMin = Math.max(barB + 6, 8), botMax = window.innerHeight - 8;
  var leftMin = 8, leftMax = window.innerWidth - 8;
  var fitsRight = r.right + 10 + w <= leftMax, fitsLeft = r.left - 10 - w >= leftMin;
  var left, top;
  if (fitsRight) left = r.right + 10;
  else if (fitsLeft) left = r.left - 10 - w;
  else {
    left = Math.min(Math.max(r.left + r.width / 2 - w / 2, leftMin), Math.max(leftMin, leftMax - w));
    var below = r.bottom + 8, above = r.top - 8 - h;
    if (below + h <= botMax) top = below;
    else if (above >= topMin) top = above;
  }
  left = Math.min(Math.max(left, leftMin), Math.max(leftMin, leftMax - w));
  if (top === undefined) {
    top = r.top - 4;
    if (top + h > botMax) top = botMax - h;
    if (top < topMin) top = topMin;
  }
  mc.style.left = Math.round(left) + 'px';
  mc.style.top = Math.round(top) + 'px';
}
function schedulePlace() {
  if (!cur || isNarrow() || posT) return;
  posT = requestAnimationFrame(function () { posT = null; placeCard(); });
}

function openCard(td) {
  if (!td) return;
  var key = td.dataset.k, u = IDX.get(key);
  if (!u) return;
  if (cur && cur !== key) writeNote(true);
  cur = key; curTd = td;
  selectCell(td); hideTip();

  var sup = unitSup(u), jeon = unitJeon(u);
  mcHo.textContent = dongLabel(u.d) + ' ' + hoNum(u.f, u.h) + '호';
  mcType.textContent = typeFull(u.t);
  var c = TYPE_COLOR[u.t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
  mcType.style.background = c.bg; mcType.style.borderColor = c.bd; mcType.style.color = c.fg;
  if (CX.price) {
    mcPrice.hidden = false;
    mcPrice.innerHTML = '<span class="mc-plabel">분양가</span>' + won(u.p);
    mcGye.hidden = false;
    mcGye.innerHTML = '계약금 <b>5%</b> · <b>' + wonShort(Math.round(u.p * 0.05)) + '</b>';
  } else {
    mcPrice.hidden = true;
    mcGye.hidden = true;
  }
  mcGy.innerHTML = '<b>' + sup.toFixed(2) + '㎡</b><i>' + py(sup) + '평</i>';
  mcJn.innerHTML = '<b>' + jeon.toFixed(2) + '㎡</b><i>' + py(jeon) + '평</i>';
  fillEditor(key);
  mcSaved.classList.remove('on');
  applyROView();

  mc.classList.add('on');
  ov.classList.toggle('on', isNarrow());
  if (isNarrow()) { mc.style.left = ''; mc.style.top = ''; }
  else { placeCard(); requestAnimationFrame(placeCard); }

  justOpened = true;
  clearTimeout(joT); joT = setTimeout(function () { justOpened = false; }, 80);
  setTimeout(function () { if (!isNarrow() && !COARSE) mcMemo.focus({ preventScroll: true }); }, 90);
}
function closeCard() {
  if (!cur) return;
  writeNote(false);
  mc.classList.remove('on'); ov.classList.remove('on');
  cur = null; curTd = null;
}
function writeNote(force) {
  if (!cur || RO) return;
  var sig = curSig();
  if (!force && sig === curBase) return;
  var txt = mcMemo.value, fld = readFields();
  var n = S.notes[cur] || { s: 'none' };
  n.memo = txt; n.price = fld.price || ''; n.owner = fld.owner || '';
  n.phone = fld.phone || ''; n.tenant = fld.tenant || ''; n.tphone = fld.tphone || ''; n.end = fld.end || '';
  if (isEmpty(n) && stateOf(cur) === 'none' && !n.urgent) {
    delete S.notes[cur];
  } else {
    S.notes[cur] = n;
  }
  curBase = sig;
  paintCell(cur); updateCounts(); markDirty(cur);
}

mcStat.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b || !cur || RO) return;
  var n = S.notes[cur] || { s: 'none' };
  n.s = cleanState(b.dataset.s);
  n.memo = mcMemo.value;
  var fld = readFields();
  FIELDS.forEach(function (f) { n[f] = fld[f] || ''; });
  S.notes[cur] = n;
  if (isEmpty(n) && n.s === 'none') delete S.notes[cur];
  curBase = curSig();
  paintCell(cur); setStatusUI(stateOf(cur)); updateCounts(); markDirty(cur);
  flashSaved('색상 저장');
});
mcUrg.onclick = function () {
  if (!cur || RO) return;
  var n = S.notes[cur] || { s: 'none' };
  var on = isUrgent(cur);
  n.urgent = on ? 0 : 1;
  S.notes[cur] = n;
  paintCell(cur); setUrgUI(isUrgent(cur)); updateCounts(); markDirty(cur);
  flashSaved(on ? '급매 해제' : '급매 표시');
  if (on && URG_RE.test(str(n.memo) + ' ' + str(n.price))) toast('메모·금액에 적힌 급매 문구를 지우면 (급)이 사라집니다.');
};
function onEditorInput() {
  clearTimeout(saveT);
  mcSaved.textContent = '입력 중…';
  mcSaved.classList.add('on');
  saveT = setTimeout(function () { writeNote(false); flashSaved('저장 중…'); scheduleFlush(200); }, 450);
}
mcMemo.addEventListener('input', onEditorInput);
FIELDS.forEach(function (f) {
  mcIn[f].addEventListener('input', onEditorInput);
  mcIn[f].addEventListener('blur', function () { writeNote(false); });
});
/* 연락처는 숫자만 넣어도 보기 좋게 하이픈을 넣어 준다 (저장 값은 이 모양 그대로) */
function phoneDigits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }
function fmtPhone(v) {
  var d = phoneDigits(v);
  if (!d) return '';
  /* 서울 02: 9자리 02-XXX-XXXX · 10자리 02-XXXX-XXXX */
  if (d.slice(0, 2) === '02') {
    if (d.length <= 2) return d;
    if (d.length <= 6) return d.slice(0, 2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5, 9);
    return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
  }
  /* 050X 인터넷전화 (12자리) */
  if (/^050\d/.test(d)) {
    if (d.length <= 4) return d;
    if (d.length <= 8) return d.slice(0, 4) + '-' + d.slice(4);
    return d.slice(0, 4) + '-' + d.slice(4, 8) + '-' + d.slice(8, 12);
  }
  /* 15XX·16XX·18XX 대표번호 (8자리) */
  if (/^(15|16|18)\d\d/.test(d) && d.length <= 8) {
    if (d.length <= 4) return d;
    return d.slice(0, 4) + '-' + d.slice(4);
  }
  /* 010·011·016·017·018·019·070·031·051 등 3자리 번호 */
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
  if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6, 10);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7, 11);
}
['phone', 'tphone'].forEach(function (f) {
  mcIn[f].addEventListener('input', function () {
    if (RO) return;
    var v = fmtPhone(this.value);
    if (v !== this.value) {
      this.value = v;
      try { this.setSelectionRange(v.length, v.length); } catch (e) {}
    }
  });
});
mcMemo.addEventListener('blur', function () { writeNote(false); });
$('mc-x').onclick = closeCard;
/* 메모장 바깥 배경을 잘못 누른 것으로 닫히지 않는다 — 닫기는 × 버튼과 Esc 만 */
$('mc-del').onclick = function () {
  if (!cur || RO) return;
  if (!confirm('이 호실의 메모·금액·연락처·색상을 모두 지울까요?')) return;
  delete S.notes[cur];
  mcMemo.value = ''; FIELDS.forEach(function (f) { mcIn[f].value = ''; });
  curBase = curSig();
  paintCell(cur); setStatusUI('none'); setUrgUI(false); updateCounts(); markDirty(cur);
  flashSaved('삭제됨');
};
/* 메모장은 바깥을 눌러도 닫히지 않는다 (× 버튼·Esc 전용).
   다른 호실을 누르면 그 호실 메모장으로 바뀐다. */
window.addEventListener('scroll', schedulePlace, { passive: true });
MQ_NARROW.addEventListener('change', function () {
  if (!cur) return;
  ov.classList.toggle('on', isNarrow());
  if (isNarrow()) { mc.style.left = ''; mc.style.top = ''; }
  else placeCard();
});
window.addEventListener('beforeunload', function () { if (cur) writeNote(true); });

/* ---------- 호실 클릭 ---------- */
boardEl.addEventListener('click', function (e) {
  var td = e.target.closest('td.c[data-k]');
  if (!td) return;
  selectCell(td);
  if (isNarrow() || COARSE) openCard(td);
});
boardEl.addEventListener('dblclick', function (e) {
  var td = e.target.closest('td.c[data-k]');
  if (!td) return;
  e.preventDefault();
  if (window.getSelection) window.getSelection().removeAllRanges();
  openCard(td);
});

/* ============================================================
   필터 UI
   ============================================================ */
function flashSeg(btn) {
  if (!btn) return;
  btn.classList.add('flash');
  setTimeout(function () { btn.classList.remove('flash'); }, 480);
}
$('seg-status').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var back = (b.dataset.st !== 'all' && b.classList.contains('on'));
  var want = back ? 'all' : b.dataset.st;
  document.querySelectorAll('#seg-status button').forEach(function (x) { x.classList.toggle('on', x.dataset.st === want); });
  if (back) flashSeg(document.querySelector('#seg-status button[data-st="all"]'));
  applyFilters();
});
$('sel-type').addEventListener('change', applyFilters);
$('sel-dong').addEventListener('change', applyFilters);
var qEl = $('q');
qEl.addEventListener('input', function () {
  $('qclr').style.display = qEl.value ? 'block' : 'none';
  applyFilters();
});
$('qclr').onclick = function () { qEl.value = ''; $('qclr').style.display = 'none'; applyFilters(); };

/* ============================================================
   배율 (PC)
   ============================================================ */
var VIEW = { zoom: 'fit' }, lastScale = 1;
var METRICS = { rh: 11.5, fn: 8.8, ff: 8, fs: 8.2, fh: 9, rhd: 15, fx: 7.2, col: 20, gap: 6 };
function applyMetrics(s) {
  var b = boardEl.style, px = function (v) { return (Math.round(v * s * 100) / 100) + 'px'; };
  b.setProperty('--rh', px(METRICS.rh));
  b.setProperty('--fnum', px(METRICS.fn));
  b.setProperty('--ffloor', px(METRICS.ff));
  b.setProperty('--fsum', px(METRICS.fs));
  b.setProperty('--fh', px(METRICS.fh));
  b.setProperty('--rhd', px(METRICS.rhd));
  b.setProperty('--fx', px(METRICS.fx));
  b.setProperty('--colw', px(METRICS.col));
  b.setProperty('--gap', px(METRICS.gap));
}
function clearMetrics() {
  ['--rh', '--fnum', '--ffloor', '--fsum', '--fh', '--rhd', '--fx', '--colw', '--gap']
    .forEach(function (p) { boardEl.style.removeProperty(p); });
}
function computeFit() {
  applyMetrics(1);
  void boardEl.offsetHeight;
  var bTop = boardEl.getBoundingClientRect().top + window.scrollY;
  var availH = window.innerHeight - (bTop - window.scrollY) - 9;
  var contentH = boardEl.getBoundingClientRect().height;
  if (!contentH || contentH < 50) return 1;
  var s = availH / contentH;
  var needW = (CX.id === 'zenith' ? (COLS * 21 + 30) : 138) * DONGS.length + 5 * Math.max(0, DONGS.length - 1), availW = window.innerWidth - 24;
  if (needW > availW) s = Math.min(s, availW / needW);
  s = Math.floor(s * 1000) / 1000;
  return Math.max(0.45, Math.min(1.14, s));
}
function applyZoom() {
  if (!S.ready) return;
  if (isNarrow()) { clearMetrics(); lastScale = 1; $('zval').textContent = '모바일'; fitBar(); return; }
  var s = (VIEW.zoom === 'fit') ? computeFit() : VIEW.zoom / 100;
  applyMetrics(s);
  lastScale = s;
  $('zval').textContent = (VIEW.zoom === 'fit' ? '맞춤 ' : '') + Math.round(s * 100) + '%';
  $('z-fit').classList.toggle('on', VIEW.zoom === 'fit');
  $('z-100').classList.toggle('on', VIEW.zoom === 100);
  fitBar(); schedulePlace();
}
function zoomStep(dir) {
  var cp = (VIEW.zoom === 'fit') ? lastScale * 100 : VIEW.zoom;
  var n = Math.round(Math.min(200, Math.max(40, cp * (dir > 0 ? 1.1 : 1 / 1.1))));
  VIEW.zoom = n; saveView(); applyZoom();
}
function loadView() {
  try {
    var o = JSON.parse(localStorage.getItem('cls.view') || 'null');
    if (o && (o.zoom === 'fit' || (typeof o.zoom === 'number' && o.zoom >= 40 && o.zoom <= 200))) VIEW.zoom = o.zoom;
  } catch (e) {}
}
function saveView() { try { localStorage.setItem('cls.view', JSON.stringify({ zoom: VIEW.zoom })); } catch (e) {} }
function fitBar() { document.documentElement.style.setProperty('--barh', $('bar').offsetHeight + 'px'); }
$('z-out').onclick = function () { zoomStep(-1); };
$('z-in').onclick = function () { zoomStep(1); };
$('z-fit').onclick = function () { VIEW.zoom = 'fit'; saveView(); applyZoom(); };
$('z-100').onclick = function () { VIEW.zoom = 100; saveView(); applyZoom(); };
var rzT = null;
window.addEventListener('resize', function () {
  clearTimeout(rzT);
  rzT = setTimeout(function () {
    if (VIEW.zoom === 'fit') applyZoom(); else { fitBar(); schedulePlace(); }
    if (S.ready) setGuide();
  }, 120);
});
function setGuide() {
  var tap = (COARSE || isNarrow()) ? '한 번 탭' : '더블클릭';
  var tail = isNarrow() ? '' : (CX.price ? ' · 분양가 · 색상' : ' · 면적 · 색상');
  $('guide-sub').innerHTML = (LIVE ? '' : '데모 모드 · ') + '호실을 <b>' + tap + '</b>하면 메모장' + tail;
}

/* ============================================================
   내보내기 / 불러오기 / 비우기
   ============================================================ */
function stamp() {
  var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function exportMap() {
  var out = {};
  Object.keys(S.notes).forEach(function (k) { if (hasInfo(k) || stateOf(k) !== 'none') out[k] = S.notes[k]; });
  return out;
}
var $exportBtn = $('btn-export');
if ($exportBtn) $exportBtn.onclick = function () {
  if (cur) writeNote(true);
  var notes = exportMap(), keys = Object.keys(notes);
  var out = {
    app: '센텀르엘 동호수·분양가 메모장', version: 3,
    agency: S.profile && S.profile.agency_name || '',
    exportedAt: new Date().toISOString(), count: keys.length, notes: notes
  };
  var blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '센텀르엘_매물_' + stamp() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  toast(keys.length + '호실을 파일로 내보냈습니다.');
};

/* 내보내기·불러오기 버튼은 화면에서 빠졌다(관리자 백업은 admin_backup.py·서버 자동 저장이 대신한다).
   버튼이 다시 생기면 아래 동작이 그대로 연결된다. */

function normNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var n = {
    s: cleanState(raw.s === 'memo' ? 'none' : raw.s),
    price: str(raw.price),
    owner: str(raw.owner),
    tenant: str(raw.tenant),
    phone: str(raw.phone),
    tphone: str(raw.tphone != null ? raw.tphone : raw.tenantPhone),
    end: str(raw.end || raw.leaseEnd || raw.lease_end_date).slice(0, 10),
    memo: str(raw.memo != null ? raw.memo : raw.m),
    urgent: raw.urgent ? 1 : 0,
    ut: +raw.ut || 0
  };
  /* 예전 매물장(단일 사용자판) 백업 읽기 */
  if (!n.phone && raw.ownerPhone) n.phone = str(raw.ownerPhone);
  return isEmpty(n) ? null : n;
}

var $importBtn = $('btn-import'), $fileIn = $('file');
if ($importBtn && $fileIn) $importBtn.onclick = function () { $fileIn.click(); };
if ($fileIn) $fileIn.addEventListener('change', function (e) {
  var f = e.target.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = async function () {
    try {
      var o = JSON.parse(r.result);
      var notesRaw = o && o.notes ? o.notes : o;
      if (!notesRaw || typeof notesRaw !== 'object') throw new Error('형식이 올바르지 않습니다.');
      var notes = {}, skipped = 0;
      Object.keys(notesRaw).forEach(function (k) {
        if (!IDX.has(k)) { skipped++; return; }
        var n = normNote(notesRaw[k]);
        if (n) notes[k] = n;
      });
      var cnt = Object.keys(notes).length;
      if (!cnt) throw new Error('불러올 매물이 없습니다.');
      if (!confirm('이 파일의 ' + cnt + '호실 기록으로 내 매물장을 바꿉니다.\n'
        + '지금 계정에 저장된 ' + Object.keys(exportMap()).length + '호실은 사라집니다.\n계속할까요?')) { e.target.value = ''; return; }
      var prev = JSON.parse(JSON.stringify(S.notes));
      S.notes = notes;
      try {
        await Store().saveMany(notes);
      } catch (err) {
        S.notes = prev;
        throw err;
      }
      paintAll(); applyFilters(); mirrorNow();
      if (cur) fillEditor(cur);
      toast(cnt + '호실을 불러왔습니다.' + (skipped ? ' (이 단지에 없는 호실 ' + skipped + '건 제외)' : ''));
    } catch (err) {
      console.error(err);
      alert('불러오지 못했습니다: ' + (err.message || err));
    }
    e.target.value = '';
  };
  r.readAsText(f, 'utf-8');
});

/* ============================================================
   전체 비우기 — 경고 모달 + 비밀번호 재확인
   ============================================================ */
var wipeEl = $('wipe'), ov5 = $('ov5');
function wipeMsg(t) { var el = $('wipe-msg'); if (el) el.textContent = t || ''; }
function wipeOpen(on) {
  if (!wipeEl) return;
  wipeEl.classList.toggle('on', !!on);
  ov5.classList.toggle('on', !!on);
  if (!on) return;
  wipeMsg('');
  var cnt = Object.keys(exportMap()).length;
  $('wipe-cnt').textContent = '현재 계정에 저장된 매물 ' + cnt.toLocaleString('ko-KR') + '호실';
  $('wipe-pw').value = '';
  $('wipe-pw-wrap').hidden = !LIVE;
  $('wipe-demo').hidden = LIVE;
  var go = $('wipe-go'); go.disabled = false; go.textContent = '전체 삭제';
  if (LIVE) setTimeout(function () { try { $('wipe-pw').focus(); } catch (e) {} }, 120);
}
$('wipe-cancel').onclick = function () { wipeOpen(false); };
ov5.onclick = function () { wipeOpen(false); };
$('wipe-pw').addEventListener('input', function () { wipeMsg(''); });
$('wipe-pw').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); $('wipe-go').click(); }
});

$('btn-reset').onclick = function () {
  if (RO) return;
  if (!Object.keys(exportMap()).length) { toast('비울 매물이 없습니다.'); return; }
  wipeOpen(true);
};

$('wipe-go').onclick = async function () {
  if (RO) return;
  var btn = $('wipe-go');
  if (btn.disabled) return;
  /* 운영 모드: 지금 로그인한 계정의 이메일로 비밀번호를 다시 확인한다 */
  if (LIVE) {
    var pw = $('wipe-pw').value;
    if (!pw) { wipeMsg('비밀번호를 입력해 주세요.'); $('wipe-pw').focus(); return; }
    var email = (S.user && S.user.email) || '';
    if (!email) { wipeMsg('계정 정보를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
    btn.disabled = true; btn.textContent = '확인 중…'; wipeMsg('');
    var ok = false;
    try {
      var r = await S.sb.auth.signInWithPassword({ email: email, password: pw });
      ok = !(r && r.error);
    } catch (e) { ok = false; }
    btn.disabled = false; btn.textContent = '전체 삭제';
    if (!ok) {
      wipeMsg('비밀번호가 일치하지 않습니다.');
      try { $('wipe-pw').select(); } catch (e) {}
      return;
    }
  }
  btn.disabled = true; btn.textContent = '비우는 중…';
  try {
    await Store().removeAll();
    S.notes = {}; S.pending.clear();
    paintAll(); applyFilters(); mirrorNow();
    if (cur) { curBase = curSig(); fillEditor(cur); }
    wipeOpen(false);
    toast('내 매물을 모두 비웠습니다.');
  } catch (e) {
    wipeMsg('비우지 못했습니다: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = '전체 삭제';
  }
};

/* ============================================================
   임대 만기 임박 알림 — 전세·월세 만기 90일 이내(D-0 ~ D-90)
   ============================================================ */
var expEl = $('exp'), ov6 = $('ov6');
var expShownSession = false;
function dayLeft(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  var end = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  var n = new Date(), today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.round((end - today) / 86400000);
}
function expKey() { return 'cls.expiry.hide.' + (S.user ? S.user.id : 'anon'); }
function expHidden() { try { return (+localStorage.getItem(expKey()) || 0) > Date.now(); } catch (e) { return false; } }
function leaseSoon() {
  var out = [];
  Object.keys(S.notes).forEach(function (k) {
    var n = S.notes[k] || {}, st = cleanState(n.s);
    if (st !== 'jeonse' && st !== 'wolse') return;
    var d = dayLeft(n.end);
    if (d === null || d < 0 || d > 90) return;
    var cx = cxByKey(k), u = (cx ? CXIDX[cx.id].get(k) : IDX.get(k));
    if (!u) return;
    out.push({ k: k, u: u, st: st, d: d, end: String(n.end).slice(0, 10), n: n, cx: cx });
  });
  out.sort(function (a, b) { return a.d - b.d; });
  return out;
}
function expClose() { if (expEl) expEl.classList.remove('on'); if (ov6) ov6.classList.remove('on'); }
function expItem(it) {
  var name = (it.cx ? it.cx.name + ' ' : '') + dongLabel(it.u.d) + ' ' + hoNum(it.u.f, it.u.h) + '호';
  var dd = it.d === 0 ? 'D-DAY' : 'D-' + it.d;
  var cs = [];
  if (str(it.n.owner)) cs.push('임대인 <b>' + esc(it.n.owner) + '</b>' + (str(it.n.phone) ? ' ' + esc(it.n.phone) : ''));
  if (str(it.n.tenant)) cs.push('임차인 <b>' + esc(it.n.tenant) + '</b>' + (str(it.n.tphone) ? ' ' + esc(it.n.tphone) : ''));
  return '<button type="button" class="exp-it" data-k="' + esc(it.k) + '">'
    + '<span class="exp-l1"><b>' + esc(name) + '</b>'
    + '<span class="exp-tag ' + it.st + '">' + (ST_NAME[it.st] || '') + '</span>'
    + '<span class="exp-d' + (it.d <= 30 ? ' soon' : '') + '">' + dd + '</span></span>'
    + '<span class="exp-l2">만기 <b>' + esc(it.end) + '</b>' + (cs.length ? ' · ' + cs.join(' · ') : '') + '</span>'
    + '</button>';
}
function checkLeaseAlerts() {
  if (!expEl || RO || expShownSession || expHidden()) return;
  var list = leaseSoon();
  if (!list.length) return;
  expShownSession = true;
  $('exp-list').innerHTML = list.map(expItem).join('');
  expEl.classList.add('on'); ov6.classList.add('on');
}
if (expEl) {
  $('exp-close').onclick = expClose;
  ov6.onclick = expClose;
  $('exp-week').onclick = function () {
    try { localStorage.setItem(expKey(), String(Date.now() + 7 * 86400000)); } catch (e) {}
    expClose();
    toast('일주일 동안 이 알림을 띄우지 않습니다.');
  };
  $('exp-list').addEventListener('click', function (e) {
    var b = e.target.closest('.exp-it'); if (!b) return;
    var k = b.dataset.k, cx = cxByKey(k);
    expClose();
    if (cx && cx.id !== CX.id) { openComplex(cx.id, k); return; }
    var td = cellMap.get(k);
    if (!td) return;
    try { td.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e2) { td.scrollIntoView(); }
    setTimeout(function () { openCard(td); }, 140);
  });
}

/* 데모 전용: 연습용 예시 */
var SAMPLE = [
  ['106-4-52', { s: 'sale', price: '2억 3,000', owner: '홍길동', phone: '010-2345-6789', memo: '매수 문의 2팀\n주말 방문 가능' }],
  ['106-3-41', { s: 'jeonse', price: '1억 8,000 / 0', owner: '김정희', tenant: '이서준', phone: '010-8765-4321', memo: '11월 말 입주' }],
  ['105-5-33', { s: 'wolse', price: '5,000 / 120', owner: '박상철', tenant: '최유진', phone: '010-3333-2222', memo: '반려동물 가능' }],
  ['103-5-63', { s: 'sale', price: '1억', owner: '골드', phone: '010-1111-2222', memo: '급매 / 손님 있을 때 연락', urgent: 1 }],
  ['102-4-31', { s: 'done', price: '9,000', owner: '민충기', phone: '010-5555-6666', memo: '공동 매매 완료' }],
  ['101-4-40', { s: 'sale', price: '1억 7,610', owner: '', phone: '', memo: '' }]
];
$('btn-sample').onclick = function () {
  if (RO) return;
  var t = Date.now();
  var entries = SAMPLE.map(function (p) {
    return [p[0], Object.assign({ ut: t }, p[1])];
  });
  entries.forEach(function (e) {
    if (!IDX.has(e[0])) return;
    S.notes[e[0]] = e[1];
    markDirty(e[0]);
  });
  paintAll(); applyFilters(); mirrorSoon();
  toast('연습용 예시 ' + entries.length + '건을 채웠습니다.');
};

/* ============================================================
   도움말 · 단축키 · 로그아웃
   ============================================================ */
var helpEl = $('help'), ov2 = $('ov2');
function showHelp(on) { helpEl.classList.toggle('on', on); ov2.classList.toggle('on', on); }
$('btn-help').onclick = function () { showHelp(true); };
$('help-close').onclick = function () { showHelp(false); };
$('help-x').onclick = function () { showHelp(false); };
ov2.onclick = function () { showHelp(false); };
$('ribbon-help').onclick = function () { showSetupHelp(); };

/* 회원가입 동의 안내 모달 */
var cd = $('consent-dlg'), ov3 = $('ov3');
function showConsent(on) { cd.classList.toggle('on', on); ov3.classList.toggle('on', on); }
$('consent-more').onclick = function () { showConsent(true); };
$('consent-close').onclick = function () { showConsent(false); };
ov3.onclick = function () { showConsent(false); };
$('su-consent').addEventListener('change', function () {
  this.closest('.consent').classList.toggle('on', this.checked);
  setMsg('su-msg', '');
});

document.addEventListener('keydown', function (e) {
  var t = e.target;
  var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.key === 'Escape') { closeCard(); showHelp(false); hideTip(); admClose(); wipeOpen(false); expClose(); meClose(); return; }
  if (!S.ready || typing) return;
  if (e.key === '/') { e.preventDefault(); qEl.focus(); return; }
  if (e.key === 'f' || e.key === 'F') { VIEW.zoom = 'fit'; saveView(); applyZoom(); return; }
  if (e.key === '0') { VIEW.zoom = 100; saveView(); applyZoom(); return; }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1); return; }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomStep(-1); return; }
});

async function signOut() {
  if (cur) writeNote(true);
  try { await flush(); } catch (e) {}
  clearTimeout(flushT);
  try { if (LIVE && S.sb) { if (S.chan) await S.sb.removeChannel(S.chan); await S.sb.auth.signOut(); } } catch (e) {}
  if (!LIVE) localStorage.removeItem('cls.demo.session');
  S.user = null; S.profile = null; S.notes = {}; S.pending.clear(); cur = null;
  S.ready = false; built = false; cellMap.clear();
  if (RO) { RO = null; $('robar').hidden = true; $('btn-reset').hidden = false; document.body.classList.remove('ro'); }
  admClose(); $('btn-admin').hidden = true;
  mc.classList.remove('on'); ov.classList.remove('on'); showHelp(false); meClose();
  $('app').hidden = true; $('pending').hidden = true;
  expShownSession = false; expClose();
  resetAuthForms();
  resetScreenAfterAuth();
  showAuth('login');
}
$('btn-logout').onclick = async function () {
  if (!confirm('로그아웃할까요? 저장되지 않은 입력은 자동 저장됩니다.')) return;
  await signOut();
};
$('pending-out').onclick = function () { signOut(); };

/* ============================================================
   인증 — 화면
   ============================================================ */
/* 화면을 바꿀 때 앞 화면에서 남은 입력 포커스와 스크롤을 되돌린다.
   휴대폰(iOS Safari)에서는 로그인 칸을 누를 때 화면이 확대되고 그 확대·스크롤이
   로그인 뒤 배치표까지 남아 좌우가 잘려 보이므로, 화면이 바뀌는 순간에 한 번 지운다. */
function resetScreenAfterAuth() {
  try { var a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); } catch (e) {}
  try { window.scrollTo(0, 0); } catch (e) {}
  try { document.documentElement.scrollLeft = 0; document.documentElement.scrollTop = 0; } catch (e) {}
  if (document.body) { document.body.scrollLeft = 0; document.body.scrollTop = 0; }
}
var authTabs = ['login', 'signup', 'reset', 'newpw'];
/* 비밀번호 재설정 링크로 들어온 상태인지 (새 비밀번호 화면을 먼저 보여 준다) */
var recovering = false;
function clearRecoveryHash() {
  if (/access_token|type=recovery|error_description/.test(location.hash || '')) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
}
function showAuth(tab, msg, ok) {
  $('boot').hidden = true;
  $('app').hidden = true;
  $('pending').hidden = true;
  $('auth').hidden = false;
  authTabs.forEach(function (t) {
    var f = $('form-' + t);
    if (f) f.hidden = (t !== tab);
  });
  $('auth-tabs').style.display = (tab === 'reset' || tab === 'newpw') ? 'none' : '';
  var authH = { login: '로그인', signup: '회원가입', reset: '비밀번호 찾기', newpw: '새 비밀번호' }[tab];
  if ($('auth-h') && authH) $('auth-h').textContent = authH;
  document.querySelectorAll('#auth-tabs button').forEach(function (b) {
    b.classList.toggle('on', b.dataset.tab === tab);
  });
  var m = { login: 'li-msg', signup: 'su-msg', reset: 'rs-msg', newpw: 'np-msg' }[tab];
  if (m && msg) setMsg(m, msg, ok);
  $('demo-box').hidden = LIVE;
}
function setMsg(id, text, ok) {
  var el = $(id);
  el.textContent = text || '';
  el.classList.toggle('ok', !!ok);
  el.classList.remove('on');
}
/* 로그인·회원가입·비번찾기 입력칸을 모두 빈칸·체크해제로 되돌린다
   (가입 성공 뒤, 로그아웃 뒤, 로그인 ↔ 회원가입 ↔ 비번찾기 탭을 옴길 때) */
function resetAuthForms() {
  ['form-login', 'form-signup', 'form-reset', 'form-newpw'].forEach(function (id) {
    var f = $(id); if (!f) return;
    try { f.reset(); } catch (e) {}
    f.querySelectorAll('input').forEach(function (i) {
      if (i.type === 'checkbox' || i.type === 'radio') i.checked = false;
      else i.value = '';
    });
  });
  var c = $('su-consent');
  if (c) {
    c.checked = false;
    var wrap = c.closest('.consent');
    if (wrap) wrap.classList.remove('on');
  }
  ['li-msg', 'su-msg', 'rs-msg', 'np-msg'].forEach(function (m) { setMsg(m, ''); });
  ['li-go', 'su-go', 'rs-go', 'np-go'].forEach(function (b) {
    var el = $(b); if (el) el.disabled = false;
  });
}
/* ---------- 아이디 ↔ 내부 주소 ----------
   일반 회원은 이메일 없이 '아이디'로 가입·로그인합니다.
   아이디(한글·영문·숫자)는 UTF-8 바이트를 hex 로 바꿔
   u_<hex>@id.centumleel.local 이라는 내부 전용 주소로 바꿔 Supabase 에 넘깁니다.
   같은 아이디는 언제나 같은 주소가 되므로 로그인·중복 확인이 그대로 동작합니다.
   관리자만 진짜 이메일로 로그인합니다(@ 가 들어 있으면 이메일 그대로). */
var ID_DOMAIN = 'id.centumleel.local';
var ID_RULE = /^[0-9a-z\uac00-\ud7a3]{2,20}$/;
function idNorm(raw) {
  /* 공백은 모두 빼고, 영문은 소문자로 통일 (한글·숫자는 그대로) */
  return String(raw == null ? '' : raw).replace(/\s+/g, '').replace(/[A-Z]/g, function (c) { return c.toLowerCase(); });
}
function idValid(id) { return ID_RULE.test(id); }
function idToEmail(raw) {
  var id = idNorm(raw);
  if (!id) return '';
  var bytes = new TextEncoder().encode(id), hex = '';
  for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
  return 'u_' + hex + '@' + ID_DOMAIN;
}
function isIdEmail(mail) {
  return String(mail || '').toLowerCase().slice(-(ID_DOMAIN.length + 1)) === '@' + ID_DOMAIN;
}
/* 이메일 형식 확인 (가입·비밀번호 찾기) */
function emailValid(v) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(v == null ? '' : v).trim());
}
/* 화면에 주소를 그대로 쓰지 않고 가린다 (재설정 메일을 어느 주소로 보냈는지만 확인) */
function maskEmail(mail) {
  var s = String(mail || ''), at = s.indexOf('@');
  if (at < 1) return s;
  return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
}
/* 아이디 → 그 계정의 실제 로그인 이메일 (profiles.username 조회 RPC).
   이메일로 가입한 계정은 실제 주소, 아이디만 있던 예전 계정은 내부 주소가 온다. */
async function resolveEmail(username) {
  if (!LIVE) {
    var k = demoFind(username);
    return k ? (demoData().users[k].email || '') : '';
  }
  try {
    var r = await S.sb.rpc('lookup_login_email', { p: username });
    if (r.error) {
      console.warn('lookup_login_email', r.error);
      return idToEmail(username);   /* RPC 가 없을 때 예전 방식으로 물러선다 */
    }
    return r.data ? String(r.data) : '';
  } catch (ex) {
    console.warn(ex);
    return idToEmail(username);
  }
}

function authErr(e) {
  var m = String((e && (e.message || e.error_description)) || e || '');
  if (/Invalid login credentials/i.test(m)) return '아이디 또는 비밀번호가 맞지 않습니다.';
  if (/Email not confirmed/i.test(m)) return '메일함의 확인 링크를 먼저 눌러 주세요.';
  if (/already registered|already been registered|user already exists/i.test(m)) return '이미 가입된 이메일입니다. 다른 이메일로 가입하거나, 이 이메일로 로그인해 주세요.';
  if (/Password should be at least/i.test(m)) return '지금은 인증 서버 정책상 비밀번호를 6자 이상으로 정해야 합니다.';
  if (/weak_password/i.test(m)) return '비밀번호가 서버 기준에 못 미칩니다. 6자 이상으로 정해 주세요.';
  if (/For security purposes, you can only request this after (\d+) seconds/i.test(m)) {
    return '방금 요청하셨습니다. ' + m.match(/(\d+) seconds/i)[1] + '초 뒤에 다시 시도해 주세요.';
  }
  if (/Email rate limit exceeded|over_email_send_rate_limit/i.test(m)) return '메일 발송 한도를 넘었습니다. 조금 뒤에 다시 시도해 주세요.';
  if (/rate limit|too many/i.test(m)) return '시도가 너무 잦습니다. 잠시 뒤 다시 해 주세요.';
  if (/Unable to validate email|invalid format|email_address_invalid/i.test(m)) return '이메일 주소를 확인해 주세요. 예: name@example.com';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  return m || '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
}
/* 가입 실패 문구 — 이메일 중복과 아이디 중복을 구분해서 알려 준다 */
function signupErr(e) {
  var m = String((e && (e.message || e.error_description)) || e || '');
  if (/already registered|already been registered|user already exists/i.test(m)) {
    return '이미 가입된 이메일입니다. 다른 이메일로 가입하거나, 이 이메일로 로그인해 주세요.';
  }
  if (/duplicate key|profiles_username_key|Database error saving new user/i.test(m)) {
    return '이미 쓰고 있는 아이디입니다. 다른 아이디로 가입해 주세요.';
  }
  return authErr(e);
}

/* 입력을 고치면 이전 오류 문구를 지운다 */
[['#form-login', 'li-msg'], ['#form-signup', 'su-msg'], ['#form-reset', 'rs-msg'], ['#form-newpw', 'np-msg']]
  .forEach(function (pair) {
    document.querySelectorAll(pair[0] + ' input').forEach(function (inp) {
      inp.addEventListener('input', function () { setMsg(pair[1], ''); });
    });
  });

/* 탭 전환 */
document.querySelectorAll('[data-tab]').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.dataset.tab;
    if (t === 'signup' && !LIVE && Object.keys(demoUsers()).length >= 0) { /* 데모에서도 가입 가능 */ }
    resetAuthForms();
    showAuth(t);
  });
});

/* ---------- 데모 계정 ---------- */
var DK = 'cls.demo.v1';
function demoData() { try { return JSON.parse(localStorage.getItem(DK) || '{}') || {}; } catch (e) { return {}; } }
function demoUsers() { return demoData().users || {}; }
function demoSave(d) { localStorage.setItem(DK, JSON.stringify(d)); }
function demoKey(username) { return 'u:' + idNorm(username); }
/* 데모에서는 아이디·이메일 둘 다로 계정을 찾는다 */
function demoFind(idOrEmail) {
  var users = demoUsers(), v = String(idOrEmail == null ? '' : idOrEmail);
  if (users[demoKey(v)]) return demoKey(v);
  var low = v.trim().toLowerCase();
  for (var key in users) { if ((users[key].email || '').toLowerCase() === low) return key; }
  return '';
}
function demoLogin(identifier, pw) {
  var d = demoData(), key = demoFind(identifier), u = key ? d.users[key] : null;
  if (!u) return '가입되지 않은 아이디입니다. 회원가입을 먼저 해 주세요.';
  if (u.pw !== pw) return '비밀번호가 맞지 않습니다.';
  d.session = key; demoSave(d);
  enterApp({ id: 'demo:' + key, email: u.email || null }, {
    username: (key.indexOf('u:') === 0 ? key.slice(2) : ''), agency_name: u.agency, manager_name: u.manager || '', approved: u.approved !== false
  });
  return '';
}
function demoSignup(username, email, pw, agency, consent) {
  var d = demoData(); d.users = d.users || {};
  var key = demoKey(username);
  if (d.users[key]) return '이미 쓰고 있는 아이디입니다. 로그인해 주세요.';
  if (demoFind(email)) return '이미 가입된 이메일입니다. 다른 이메일로 가입해 주세요.';
  if (!consent) return '백업·보관 동의에 체크해 주세요.';
  d.users[key] = { pw: pw, email: email, agency: agency, manager: '', approved: true, consentAt: new Date().toISOString() };
  d.session = key; demoSave(d);
  enterApp({ id: 'demo:' + key, email: email }, { username: username, agency_name: agency, manager_name: '', approved: true });
  return '';
}

$('demo-go').onclick = function () {
  var d = demoData(); d.users = d.users || {};
  var key = demoKey('데모');
  if (!d.users[key]) d.users[key] = { pw: 'demo1234', email: 'demo@example.com', agency: '데모공인중개사사무소', manager: '체험 계정', approved: true, consentAt: new Date().toISOString() };
  d.session = key; demoSave(d);
  enterApp({ id: 'demo:' + key, email: d.users[key].email }, { username: '데모', agency_name: d.users[key].agency, manager_name: d.users[key].manager, approved: true });
};

/* ---------- 로그인 ---------- */
$('form-login').addEventListener('submit', async function (e) {
  e.preventDefault();
  var input = str($('li-id').value), pw = $('li-pw').value;
  setMsg('li-msg', '');
  if (!input || !pw) { setMsg('li-msg', '아이디와 비밀번호를 입력해 주세요.'); return; }
  var byEmail = input.indexOf('@') >= 0;          /* @ 가 있으면 이메일 로그인 */
  var username = byEmail ? '' : idNorm(input);
  if (!byEmail && !idValid(username)) {
    setMsg('li-msg', '아이디는 한글·영문·숫자 2~20자입니다.'); return;
  }
  $('li-go').disabled = true;
  try {
    if (!LIVE) {
      var err = demoLogin(byEmail ? input : username, pw);
      if (err) setMsg('li-msg', err);
      return;
    }
    var email = input;
    if (!byEmail) {
      email = await resolveEmail(username);
      if (!email) { setMsg('li-msg', '가입되지 않은 아이디입니다. 회원가입을 먼저 해 주세요.'); return; }
    }
    var res = await S.sb.auth.signInWithPassword({ email: email, password: pw });
    if (res.error) { setMsg('li-msg', authErr(res.error)); return; }
    await enterApp(res.data.user);
  } catch (ex) {
    setMsg('li-msg', authErr(ex));
  } finally {
    $('li-go').disabled = false;
  }
});

/* ---------- 회원가입 ---------- */
$('form-signup').addEventListener('submit', async function (e) {
  e.preventDefault();
  var raw = str($('su-id').value), mail = str($('su-email').value), pw = $('su-pw').value;
  var consent = $('su-consent').checked;
  setMsg('su-msg', '');
  if (!raw || !mail || !pw) { setMsg('su-msg', '아이디(상호명)·이메일·비밀번호를 모두 입력해 주세요.'); return; }
  if (raw.indexOf('@') >= 0) {
    setMsg('su-msg', '아이디에는 @를 쓸 수 없습니다. 부동산 상호명을 아이디로 넣어 주세요.');
    $('su-id').focus(); return;
  }
  var username = idNorm(raw);
  if (!idValid(username)) {
    setMsg('su-msg', '아이디(상호명)는 한글·영문·숫자 2~20자로 정해 주세요. (공백·기호는 쓸 수 없습니다)');
    $('su-id').focus(); return;
  }
  if (!emailValid(mail)) {
    setMsg('su-msg', '이메일 주소를 확인해 주세요. 예: name@example.com');
    $('su-email').focus(); return;
  }
  if (isIdEmail(mail)) {
    setMsg('su-msg', '이 주소는 쓸 수 없습니다. 실제로 쓰는 이메일을 넣어 주세요.');
    $('su-email').focus(); return;
  }
  /* 아이디 = 사무소 이름. 칸에 친 그대로(공백·대소문자 유지) 사무소명으로 보여 준다. */
  var agency = raw.replace(/\s+/g, ' ').trim() || username;
  if (pw.length < 6) { setMsg('su-msg', '지금은 인증 서버 정책상 비밀번호를 6자 이상으로 정해야 합니다.'); return; }
  if (!consent) { setMsg('su-msg', '이용약관 및 데이터 보관 동의에 체크해 주세요.'); $('su-consent').focus(); return; }
  $('su-go').disabled = true;
  var consentAt = new Date().toISOString();
  try {
    if (!LIVE) {
      var err = demoSignup(username, mail, pw, agency, consent);
      if (err) setMsg('su-msg', err); else resetAuthForms();
      return;
    }
    /* 같은 아이디가 이미 있는지 먼저 묻고 친절하게 알려 준다 */
    var chk = await S.sb.rpc('username_taken', { p: username });
    if (!chk.error && chk.data === true) {
      setMsg('su-msg', '이미 쓰고 있는 아이디입니다. 로그인해 주세요.');
      $('su-id').focus(); return;
    }
    var res = await S.sb.auth.signUp({
      email: mail, password: pw,
      options: {
        emailRedirectTo: siteUrl(),
        data: {
          username: username,
          agency_name: agency, manager_name: '',
          email: mail,
          consent: 'v1', consent_at: consentAt
        }
      }
    });
    if (res.error) { setMsg('su-msg', signupErr(res.error)); return; }
    if (res.data.session) {
      resetAuthForms();
      await enterApp(res.data.user);
    } else {
      resetAuthForms();
      setMsg('su-msg', '가입 확인 메일을 보냈습니다. 메일함에서 확인 링크를 누른 뒤 로그인해 주세요.', true);
    }
  } catch (ex) {
    setMsg('su-msg', authErr(ex));
  } finally {
    $('su-go').disabled = false;
  }
});

/* ---------- 비밀번호 찾기 ---------- */
$('form-reset').addEventListener('submit', async function (e) {
  e.preventDefault();
  var input = str($('rs-id').value);
  setMsg('rs-msg', '');
  if (!input) { setMsg('rs-msg', '아이디 또는 이메일을 입력해 주세요.'); return; }
  var byEmail = input.indexOf('@') >= 0;
  var username = byEmail ? '' : idNorm(input);
  if (!byEmail && !idValid(username)) { setMsg('rs-msg', '아이디는 한글·영문·숫자 2~20자입니다.'); return; }
  if (!LIVE) { setMsg('rs-msg', '데모 모드에는 비밀번호 재설정 메일이 없습니다. 새로 가입해 주세요.', true); return; }
  $('rs-go').disabled = true;
  try {
    var email = input;
    if (!byEmail) {
      email = await resolveEmail(username);
      if (!email) { setMsg('rs-msg', '가입되지 않은 아이디입니다. 아이디를 확인해 주세요.'); return; }
    }
    if (!emailValid(email)) { setMsg('rs-msg', '이메일 주소를 확인해 주세요. 예: name@example.com'); return; }
    if (isIdEmail(email)) {
      setMsg('rs-msg', '이 계정은 등록된 이메일이 없습니다. 운영자에게 비밀번호 초기화를 요청해 주세요.', true);
      return;
    }
    var res = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (res.error) { setMsg('rs-msg', authErr(res.error)); return; }
    setMsg('rs-msg', '재설정 메일을 ' + maskEmail(email) + ' 로 보냈습니다. 메일함의 링크를 눌러 새 비밀번호를 정해 주세요.', true);
  } catch (ex) {
    setMsg('rs-msg', authErr(ex));
  } finally {
    $('rs-go').disabled = false;
  }
});

/* ---------- 새 비밀번호 ---------- */
$('form-newpw').addEventListener('submit', async function (e) {
  e.preventDefault();
  var a = $('np-pw').value, b = $('np-pw2').value;
  setMsg('np-msg', '');
  if (a.length < 4) { setMsg('np-msg', '비밀번호는 4자 이상으로 정해 주세요.'); return; }
  if (a.length < 6) { setMsg('np-msg', '지금은 인증 서버 정책상 비밀번호를 6자 이상으로 정해야 합니다.'); return; }
  if (a !== b) { setMsg('np-msg', '두 비밀번호가 서로 다릅니다.'); return; }
  $('np-go').disabled = true;
  try {
    var res = await S.sb.auth.updateUser({ password: a });
    if (res.error) { setMsg('np-msg', authErr(res.error)); return; }
    setMsg('np-msg', '비밀번호를 바꿨습니다. 잠시 뒤 매물장으로 들어갑니다.', true);
    recovering = false;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e2) {}
    var u = (await S.sb.auth.getUser()).data.user;
    if (u) await enterApp(u);
  } catch (ex) {
    setMsg('np-msg', authErr(ex));
  } finally {
    $('np-go').disabled = false;
  }
});

function siteUrl() {
  return (CFG.SITE_URL || (location.origin + location.pathname)).replace(/\/+$/, '/');
}

/* ============================================================
   멀티 단지 · 홈 대시보드
   ============================================================ */
var HOME_ON = false;
var CXIDX = {};
function buildCxIndexes() {
  CXIDX = {};
  DONG_LABEL = {};
  CX_LIST.forEach(function (cx) {
    ((cx.board && cx.board.dongs) || []).forEach(function (d) {
      DONG_LABEL[d.id] = d.name || (d.id + '동');
    });
  });
  CX_LIST.forEach(function (cx) {
    var m = new Map();
    ((cx.board && cx.board.units) || []).forEach(function (u) {
      m.set(K(u[0], u[1], u[2]), { d: u[0], h: u[1], f: u[2], t: u[3], p: u[4], s: u[5], j: u[6] });
    });
    CXIDX[cx.id] = m;
  });
}
function cxByKey(k) {
  for (var i = 0; i < CX_LIST.length; i++) {
    var m = CXIDX[CX_LIST[i].id];
    if (m && m.has(k)) return CX_LIST[i];
  }
  return null;
}
function cxById(id) {
  for (var i = 0; i < CX_LIST.length; i++) if (CX_LIST[i].id === id) return CX_LIST[i];
  return CX_LIST[0];
}
function lastCxId() { try { return localStorage.getItem('mc.cx') || ''; } catch (e) { return ''; } }
function setLastCx(id) { try { localStorage.setItem('mc.cx', id); } catch (e) {} }

function renderCxMenu() {
  var menu = $('cx-menu'); if (!menu) return;
  menu.innerHTML = '';
  CX_LIST.forEach(function (cx) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cxitem' + (cx.id === CX.id && !HOME_ON ? ' on' : '');
    b.innerHTML = '<b>' + esc(cx.name) + '</b><span>' + esc(cx.sub) + '</span>';
    b.onclick = function (e) { e.stopPropagation(); closeCxMenu(); openComplex(cx.id); };
    menu.appendChild(b);
  });
  var last = lastCxId();
  if (last) {
    var lc = cxById(last);
    var b2 = document.createElement('button');
    b2.type = 'button'; b2.className = 'cxitem recent';
    b2.innerHTML = '<b>최근 단지 · ' + esc(lc.name) + '</b><span>바로 열기</span>';
    b2.onclick = function (e) { e.stopPropagation(); closeCxMenu(); openComplex(lc.id); };
    menu.appendChild(b2);
  }
  $('cx-cur').textContent = HOME_ON ? '단지 선택' : CX.name;
  var hint = $('cx-hint');
  if (hint) hint.textContent = HOME_ON ? '선택' : '변경';
}
function toggleCxMenu() {
  var m = $('cx-menu');
  m.classList.toggle('on');
}
function closeCxMenu() { var m = $('cx-menu'); if (m) m.classList.remove('on'); }

function initCxUI() {
  buildCxIndexes();
  renderCxMenu();
  var btn = $('cx-btn');
  if (btn) btn.onclick = function (e) { e.stopPropagation(); toggleCxMenu(); };
  var hb = $('btn-home');
  if (hb) hb.onclick = function () { openHome(); };
  var na = $('home-note-add'), ni = $('home-note-in');
  if (na && ni) na.onclick = function () {
    var t = ni.value.trim(); if (!t) return;
    var arr = boardNotes();
    arr.unshift({ t: t, at: new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) });
    saveBoardNotes(arr); ni.value = ''; renderHome();
  };
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#cxpick')) closeCxMenu();
  });
}

function openHome() {
  if (RO) return;
  HOME_ON = true;
  hideTip(); if (typeof closeCard === 'function') closeCard();
  $('page').hidden = true;
  $('home').hidden = false;
  if ($('bar')) $('bar').classList.add('home-mode');
  var hcx0 = $('hd-cx'); if (hcx0) hcx0.textContent = '전체 단지';
  var allN = 0; CX_LIST.forEach(function (c) { var bd = c.board || {}; allN += ((bd.meta && bd.meta.units) || (bd.units || []).length); });
  var hsa = $('hs-all'); if (hsa) hsa.textContent = allN.toLocaleString('ko-KR');
  var call = $('c-all'); if (call) call.textContent = allN.toLocaleString('ko-KR');
  renderCxMenu();
  renderHome();
  updateCounts();
  window.scrollTo(0, 0);
}

function openComplex(id, focusKey) {
  var cx = cxById(id);
  HOME_ON = false;
  setComplex(cx);
  setLastCx(cx.id);
  $('home').hidden = true;
  $('page').hidden = false;
  if ($('bar')) $('bar').classList.remove('home-mode');
  var hcx = $('hd-cx'); if (hcx) hcx.textContent = cx.name;
  buildBoard();
  var ca = $('c-all');
  if (ca) ca.textContent = (BOARD.meta && BOARD.meta.units ? BOARD.meta.units : ((BOARD.units || []).length)).toLocaleString('ko-KR');
  var cs = $('c-show'); if (cs) cs.textContent = '-';
  paintAll();
  applyFilters();
  applyZoom();
  $('hs-all').textContent = ((cx.board && cx.board.meta && cx.board.meta.units) || ((cx.board && cx.board.units) || []).length).toLocaleString('ko-KR');
  renderCxMenu();
  if (focusKey) {
    setTimeout(function () {
      var td = cellMap.get(focusKey);
      if (!td) return;
      try { td.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { td.scrollIntoView(); }
      setTimeout(function () { openCard(td); }, 260);
    }, 120);
  } else {
    window.scrollTo(0, 0);
  }
}

function noteList() {
  var out = [];
  Object.keys(S.notes).forEach(function (k) { out.push({ k: k, n: S.notes[k] || {} }); });
  return out;
}

function renderHome() {
  var d = new Date();
  var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  $('home-date').textContent = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + wd + '요일';

  /* ① 만기 도래 (전체 단지) */
  var ex = [];
  noteList().forEach(function (it) {
    var st = cleanState(it.n.s);
    if (st !== 'jeonse' && st !== 'wolse') return;
    var left = dayLeft(it.n.end);
    if (left === null || left < 0 || left > 90) return;
    var cx = cxByKey(it.k); if (!cx) return;
    var u = CXIDX[cx.id].get(it.k);
    ex.push({ k: it.k, cx: cx, u: u, left: left, n: it.n, st: st });
  });
  ex.sort(function (a, b) { return a.left - b.left; });
  $('home-exp-n').textContent = ex.length ? ex.length + '건' : '없음';
  $('home-exp').innerHTML = ex.length ? ex.map(function (it) {
    return '<button type="button" class="hexp" data-k="' + esc(it.k) + '" data-cx="' + it.cx.id + '">'
      + '<span class="hx1"><b>' + esc(it.cx.name) + ' ' + dongLabel(it.u.d) + ' ' + hoNum(it.u.f, it.u.h) + '호</b>'
      + '<i class="htag ' + it.st + '">' + ST_NAME[it.st] + '</i>'
      + '<em class="hd' + (it.left <= 30 ? ' soon' : '') + '">' + (it.left === 0 ? 'D-DAY' : 'D-' + it.left) + '</em></span>'
      + '<span class="hx2">만기 ' + esc(String(it.n.end).slice(0, 10))
      + (str(it.n.tenant) ? ' · 임차인 ' + esc(it.n.tenant) : '')
      + (str(it.n.owner) ? ' · 임대인 ' + esc(it.n.owner) : '') + '</span></button>';
  }).join('') : '<p class="hempty">3개월 안에 만기가 돌아오는 전세·월세 매물이 없습니다.</p>';

  /* ② 단지별 내 매물 요약 */
  $('home-cx').innerHTML = CX_LIST.map(function (cx) {
    var c = { sale: 0, jeonse: 0, wolse: 0, done: 0, memo: 0, exp: 0 };
    Object.keys(S.notes).forEach(function (k) {
      var m = CXIDX[cx.id]; if (!m || !m.has(k)) return;
      var n = S.notes[k] || {}, st = cleanState(n.s);
      if (c[st] != null) c[st]++;
      if (hasInfoNote(n)) c.memo++;
      if ((st === 'jeonse' || st === 'wolse')) {
        var left = dayLeft(n.end);
        if (left !== null && left >= 0 && left <= 90) c.exp++;
      }
    });
    var tot = c.sale + c.jeonse + c.wolse + c.done;
    return '<button type="button" class="hsum" data-cx="' + cx.id + '">'
      + '<span class="hs-h"><b>' + esc(cx.name) + '</b><em>' + (((cx.board.meta && cx.board.meta.units) || (cx.board.units || []).length)).toLocaleString('ko-KR') + '세대</em></span>'
      + '<span class="hs-r"><i class="hs-sale">매매 ' + c.sale + '</i><i class="hs-jeonse">전세 ' + c.jeonse + '</i>'
      + '<i class="hs-wolse">월세 ' + c.wolse + '</i><i class="hs-done">보류 ' + c.done + '</i></span>'
      + '<span class="hs-f">내 매물 <b>' + tot + '</b>호실' + (c.exp ? ' · <em class="hs-soon">만기 임박 ' + c.exp + '</em>' : '') + '</span>'
      + '</button>';
  }).join('');

  /* ③ 공지 · 메모 */
  var bn = boardNotes();
  $('home-notes').innerHTML = bn.length ? bn.map(function (x, i) {
    return '<div class="hbnote"><span class="hb-t">' + esc(x.t) + '</span><span class="hb-m">' + esc(x.at) + '</span>'
      + '<button type="button" class="hb-x" data-i="' + i + '" aria-label="삭제">×</button></div>';
  }).join('') : '<p class="hempty">남길 메모가 없습니다. 아래에 적어 두면 로그인할 때마다 보입니다.</p>';

  /* ④ 단지 카드 */
  $('home-cards').innerHTML = CX_LIST.map(function (cx) {
    var isI = cx.id === 'ipark';
    var isZ = cx.id === 'zenith';
    var lines = isI
      ? ['1동 66층 · 2동 72층 · 3동 46층', '199개 평면 · 118.45~423.41㎡', '전용률 64~70% (KB 기준)']
      : isZ
      ? ['101동 80층 · 102동 75층 · 103동 70층', '148.11~325.30㎡ · 전용 99.40~222.59㎡', '마린시티 · 2011년 준공']
      : ['101~106동 · 6개동', '84 · 104 · 125 · 154 · 244타입', '분양가·계약금까지 표기'];
    return '<button type="button" class="hcard' + (isI ? ' ipark' : (isZ ? ' zenith' : ' centum')) + '" data-cx="' + cx.id + '">'
      + '<span class="hc-top"><b>' + esc(cx.name) + '</b><em>' + esc(cx.desc) + '</em></span>'
      + '<span class="hc-sub">' + esc(cx.sub) + '</span>'
      + '<span class="hc-lines">' + lines.map(function (l) { return '<i>' + esc(l) + '</i>'; }).join('') + '</span>'
      + '<span class="hc-go">배치표 열기 →</span></button>';
  }).join('');

  /* 클릭 연결 */
  $('home-exp').querySelectorAll('.hexp').forEach(function (b) {
    b.onclick = function () { openComplex(b.dataset.cx, b.dataset.k); };
  });
  $('home-cx').querySelectorAll('.hsum').forEach(function (b) {
    b.onclick = function () { openComplex(b.dataset.cx); };
  });
  $('home-cards').querySelectorAll('.hcard').forEach(function (b) {
    b.onclick = function () { openComplex(b.dataset.cx); };
  });
  $('home-notes').querySelectorAll('.hb-x').forEach(function (b) {
    b.onclick = function () {
      var arr = boardNotes(); arr.splice(+b.dataset.i, 1); saveBoardNotes(arr); renderHome();
    };
  });
}

function boardNotes() {
  try { return JSON.parse(localStorage.getItem('mc.boardnotes') || '[]') || []; } catch (e) { return []; }
}
function saveBoardNotes(a) { try { localStorage.setItem('mc.boardnotes', JSON.stringify(a.slice(0, 40))); } catch (e) {} }

/* ============================================================
   내 정보 — 상호명 · 비밀번호 · 등록 이메일
   ============================================================ */
var meEl = $('me'), ov7 = $('ov7');

function meMsg(id, t, ok) {
  var el = $(id); if (!el) return;
  el.textContent = t || '';
  el.classList.toggle('ok', !!ok && !!t);
}

function meOpen() {
  if (!S.user) return;
  meMsg('me-office-msg', ''); meMsg('me-pw-msg', ''); meMsg('me-mail-msg', '');
  ['me-pw-cur', 'me-pw-new', 'me-pw-new2'].forEach(function (id) { var i = $(id); if (i) i.value = ''; });
  var uname = (S.profile && S.profile.username) || '';
  var mail = (S.user && S.user.email) || '';
  $('me-id').textContent = uname || mail || '—';
  $('me-role').textContent = (S.profile && S.profile.role === 'admin') ? '관리자' : '회원';
  $('me-office').value = (S.profile && S.profile.agency_name) || '';
  $('me-mail').value = mail;
  meEl.classList.add('on'); ov7.classList.add('on');
  /* 프로필에 적힌 실제 이메일·아이디가 있으면 그쪽을 보여 준다 */
  if (LIVE && S.sb) {
    (async function () {
      try {
        var r = await S.sb.from('profiles').select('username,email').eq('id', S.user.id).maybeSingle();
        if (r && !r.error && r.data) {
          if (r.data.email) $('me-mail').value = r.data.email;
          if (!uname && r.data.username) $('me-id').textContent = r.data.username;
        }
      } catch (e) {}
    })();
  }
}
function meClose() { if (meEl) meEl.classList.remove('on'); if (ov7) ov7.classList.remove('on'); }

if ($('btn-me')) $('btn-me').onclick = meOpen;
if ($('me-x')) $('me-x').onclick = meClose;
if ($('me-close')) $('me-close').onclick = meClose;
if (ov7) ov7.onclick = meClose;

/* 상호명 저장 — profiles.agency_name + 화면 상단 즉시 반영 */
if ($('me-office-go')) $('me-office-go').onclick = async function () {
  var b = this;
  var v = String($('me-office').value || '').replace(/\s+/g, ' ').trim();
  if (!v) { meMsg('me-office-msg', '상호명을 입력해 주세요.'); $('me-office').focus(); return; }
  if (v.length > 40) { meMsg('me-office-msg', '상호명은 40자까지 쓸 수 있습니다.'); return; }
  if (b.disabled) return;
  var t0 = b.textContent;
  b.disabled = true; b.textContent = '저장 중…'; meMsg('me-office-msg', '');
  try {
    if (LIVE) {
      var r = await S.sb.from('profiles').update({ agency_name: v }).eq('id', S.user.id);
      if (r.error) throw r.error;
      var chk = await S.sb.from('profiles').select('agency_name').eq('id', S.user.id).maybeSingle();
      if (!chk.error && chk.data && chk.data.agency_name !== v) throw new Error('서버에 반영되지 않았습니다. 잠시 뒤 다시 시도해 주세요.');
    } else {
      var d = demoData(); var key = d.session; 
      if (key && d.users && d.users[key]) { d.users[key].agency = v; demoSave(d); }
    }
    S.profile = S.profile || {};
    S.profile.agency_name = v;
    $('hd-office').textContent = v;
    document.title = v + ' · 매물콕';
    meMsg('me-office-msg', '저장했습니다.', true);
    toast('상호명을 ' + v + ' 로 바꿨습니다.');
  } catch (e) {
    meMsg('me-office-msg', '저장하지 못했습니다: ' + ((e && e.message) || e));
  } finally {
    b.disabled = false; b.textContent = t0;
  }
};

/* 비밀번호 변경 — 현재 비밀번호 확인 후 6자 이상 새 비밀번호로 */
if ($('me-pw-go')) $('me-pw-go').onclick = async function () {
  var b = this;
  var cur = $('me-pw-cur').value || '', nw = $('me-pw-new').value || '', nw2 = $('me-pw-new2').value || '';
  if (!cur) { meMsg('me-pw-msg', '현재 비밀번호를 입력해 주세요.'); $('me-pw-cur').focus(); return; }
  if (nw.length < 6) { meMsg('me-pw-msg', '새 비밀번호는 6자 이상이어야 합니다.'); $('me-pw-new').focus(); return; }
  if (nw !== nw2) { meMsg('me-pw-msg', '새 비밀번호 확인이 서로 다릅니다.'); $('me-pw-new2').focus(); return; }
  if (nw === cur) { meMsg('me-pw-msg', '지금 쓰는 비밀번호와 다른 값을 넣어 주세요.'); return; }
  if (b.disabled) return;
  var t0 = b.textContent;
  b.disabled = true; b.textContent = '변경 중…'; meMsg('me-pw-msg', '');
  try {
    if (LIVE) {
      var email = (S.user && S.user.email) || '';
      if (!email) throw new Error('계정 이메일을 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      var v = await S.sb.auth.signInWithPassword({ email: email, password: cur });
      if (v && v.error) throw new Error('현재 비밀번호가 일치하지 않습니다.');
      var u = await S.sb.auth.updateUser({ password: nw });
      if (u && u.error) throw u.error;
    } else {
      var d = demoData(); var key = d.session; var du = key && d.users ? d.users[key] : null;
      if (!du) throw new Error('데모 계정을 찾지 못했습니다.');
      if (du.pw !== cur) throw new Error('현재 비밀번호가 일치하지 않습니다.');
      du.pw = nw; demoSave(d);
    }
    ['me-pw-cur', 'me-pw-new', 'me-pw-new2'].forEach(function (id) { $(id).value = ''; });
    meMsg('me-pw-msg', '비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.', true);
    toast('비밀번호를 바꿨습니다.');
  } catch (e) {
    meMsg('me-pw-msg', (e && e.message) || String(e));
  } finally {
    b.disabled = false; b.textContent = t0;
  }
};

/* 등록 이메일 변경 */
if ($('me-mail-go')) $('me-mail-go').onclick = async function () {
  var b = this;
  var v = String($('me-mail').value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { meMsg('me-mail-msg', '이메일 형식을 확인해 주세요.'); $('me-mail').focus(); return; }
  if (!LIVE) { meMsg('me-mail-msg', '데모 모드에서는 이메일을 바꿀 수 없습니다.'); return; }
  if (b.disabled) return;
  var t0 = b.textContent;
  b.disabled = true; b.textContent = '변경 중…'; meMsg('me-mail-msg', '');
  try {
    var u = await S.sb.auth.updateUser({ email: v });
    if (u && u.error) throw u.error;
    var pend = u && u.data && u.data.user && u.data.user.new_email;
    if (pend) meMsg('me-mail-msg', '확인 메일을 보냈습니다. ' + pend + ' 과(와) 지금 주소에서 확인을 마치면 바뀝니다.', true);
    else meMsg('me-mail-msg', '등록 이메일을 ' + v + ' 로 바꿨습니다.', true);
    toast('등록 이메일을 바꿨습니다.');
  } catch (e) {
    meMsg('me-mail-msg', '바꾸지 못했습니다: ' + ((e && e.message) || e));
  } finally {
    b.disabled = false; b.textContent = t0;
  }
};

/* ============================================================
   앱 시작
   ============================================================ */
async function enterApp(user, knownProfile) {
  $('boot').hidden = false;
  $('boot').textContent = '매물장을 준비하는 중…';
  try {
    S.user = user;
    var profile = knownProfile;
    if (!profile) profile = await loadProfile(user);
    S.profile = profile || { agency_name: '', manager_name: '', approved: true, role: 'user' };

    if (S.profile.approved === false) {
      $('boot').hidden = true; $('auth').hidden = true; $('app').hidden = true;
      $('pending').hidden = false;
      $('pending-who').textContent = (S.profile.agency_name || S.profile.username || '') + ' · ' + (S.profile.username || user.email || '');
      return;
    }

    $('auth').hidden = true; $('pending').hidden = true; $('app').hidden = false;
    $('ribbon').hidden = LIVE;
    /* 로그인 칸에서 확대·스크롤된 화면을 배치표 첫 화면으로 되돌린다 */
    resetScreenAfterAuth();

    var office = S.profile.agency_name || S.profile.username || (user.email ? String(user.email).split('@')[0] : '') || '내 사무소';
    $('hd-office').textContent = office;
    $('btn-admin').hidden = !admOk();
    if (admOk()) admRefreshCount();
    document.title = office + ' · 매물콕';

    S.ready = true;
    loadView();
    initCxUI();

    /* 이 기기에 남은 화면을 먼저 칠하고, 서버 기록으로 맞춘다 */
    S.notes = cachedNotes();
    openHome();

    try {
      var rows = await Store().loadAll();
      S.pending.forEach(function (k) { if (S.notes[k]) rows[k] = S.notes[k]; });
      S.notes = rows;
      mirrorNow();
    } catch (e) {
      console.warn('서버 기록을 읽지 못했습니다.', e);
      toast('서버 기록을 읽지 못했습니다. 이 기기에 저장된 화면을 보여 드립니다.');
    }
    paintAll(); applyFilters(); applyZoom();
    renderHome();

    if (LIVE) {
      CloudStore.subscribe(onRemoteChange);
    } else {
      $('btn-sample').hidden = false;
    }
    setGuide();
    if (isNarrow() && !HOME_ON) setTab(DONGS[0]);
    $('boot').hidden = true;
    resetScreenAfterAuth();
    requestAnimationFrame(resetScreenAfterAuth);
    /* 서버 기록을 받은 뒤 만기 임박 알림 (관리자 읽기전용 열람 중에는 띄우지 않는다) */
    setTimeout(function () { try { checkLeaseAlerts(); } catch (e) {} }, 420);
  } catch (e) {
    console.error(e);
    $('boot').hidden = true;
    showAuth('login', authErr(e));
  }
}

async function loadProfile(user) {
  if (!LIVE) return { agency_name: '', manager_name: '', approved: true, role: 'user' };
  var res = await S.sb.from('profiles').select('username,agency_name,manager_name,approved,role').eq('id', user.id).maybeSingle();
  if (res.error && /role|username/i.test(res.error.message || '')) {
    /* 관리자·아이디 기능 이전에 만든 데이터베이스여도 앱은 그대로 열린다 */
    res = await S.sb.from('profiles').select('agency_name,manager_name,approved').eq('id', user.id).maybeSingle();
  }
  if (res.error) {
    console.warn('프로필을 읽지 못했습니다.', res.error);
    if (/relation .* does not exist|does not exist/i.test(res.error.message || '')) {
      throw new Error('profiles 테이블이 없습니다. supabase_schema.sql 을 먼저 실행해 주세요.');
    }
    throw res.error;
  }
  if (res.data) return res.data;
  var m = user.user_metadata || {};
  return { username: m.username || '', agency_name: m.agency_name || '', manager_name: m.manager_name || '', approved: true, role: 'user' };
}

function onRemoteChange(payload) {
  if (!S.user || RO) return;
  if (payload.eventType === 'DELETE') {
    var k0 = payload.old && payload.old.unit_key;
    if (!k0) return;
    delete S.notes[k0];
    paintCell(k0); updateCounts(); mirrorSoon();
    if (cur === k0 && curSig() === curBase) fillEditor(k0);
    return;
  }
  var r = payload.new;
  if (!r || !r.unit_key) return;
  var k = r.unit_key;
  if (S.pending.has(k)) return;
  var ut = Date.parse(r.updated_at) || 0;
  var local = S.notes[k];
  if (local && local.ut && local.ut >= ut) return;
  S.notes[k] = rowToNote(r);
  paintCell(k); updateCounts(); mirrorSoon();
  if (cur === k && curSig() === curBase) fillEditor(k);
}

/* 창을 다시 열면 서버 기록과 맞춘다 */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') {
    if (cur) writeNote(true);
    if (S.pending.size) flush();
    return;
  }
  if (!S.ready || !LIVE || S.pending.size || RO) return;
  Store().loadAll().then(function (rows) {
    S.notes = rows; mirrorNow(); paintAll(); applyFilters();
  }).catch(function () {});
});

/* ---------- 부팅 ---------- */
/* ============================================================
   관리자 콘솔 — 회원 목록 · 활동 이력 · 복구
   role = 'admin' 인 계정에만 버튼이 보이고, 실제 허용은 서버(RLS)가 판단합니다.
   ============================================================ */
var ACT_KO = { insert: '등록', update: '수정', delete: '삭제' };
var F_LBL = { status: '상태', price: '금액', owner_name: '소유주', tenant_name: '임차인', phone: '연락처', tenant_phone: '임차인 연락처', lease_end_date: '만기일', urgent: '급매', memo: '메모' };
var admEl = $('adm'), ov4 = $('ov4');
var adm = { on: false, tab: 'members', members: [], people: {}, logs: [], userLogs: [], cursor: null,
            user: '', action: '', q: '', openUser: null, busy: false, logsLoaded: false };

function admOk() { return !!(LIVE && S.profile && S.profile.role === 'admin'); }

/* 헤더의 [회원수 (N)] 버튼 — 관리자에게만 */
function admSetBtn() {
  var b = $('btn-admin');
  if (!b) return;
  var n = (adm.members || []).length;
  b.textContent = '회원수 (' + n + ')';
  b.title = '관리자 콘솔 — 가입 사무소 ' + n + '곳의 매물·변경 이력';
}
async function admRefreshCount() {
  if (!admOk()) return;
  var res = await S.sb.rpc('admin_members');
  if (res.error) { console.warn('admin_members', res.error); return; }
  adm.members = res.data || [];
  admSetBtn();
}

function admWhen(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  var now = new Date();
  if (d.toDateString() === now.toDateString()) return '오늘 ' + hm;
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return '어제 ' + hm;
  return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + hm;
}

function admUnit(k) {
  var p = String(k || '').split('-');
  if (p.length !== 3) return String(k || '기록 없음');
  return dongLabel(p[0]) + ' ' + hoNum(parseInt(p[2], 10), parseInt(p[1], 10)) + '호';
}
function admUnitCmp(a, b) {
  var x = String(a || '').split('-').map(Number), y = String(b || '').split('-').map(Number);
  return (x[0] - y[0]) || (x[2] - y[2]) || (x[1] - y[1]);
}
function cut(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function admVal(f, v) {
  if (f === 'status') return ST_NAME[cleanState(v)] || '—';
  if (f === 'urgent') return v ? '표시' : '표시 안 함';
  if (v == null || String(v).trim() === '') return '없음';
  return cut(v, 40);
}
function admFields(d, list) {
  return (list || ['status', 'price', 'owner_name', 'tenant_name', 'phone', 'tenant_phone', 'lease_end_date', 'memo'])
    .filter(function (f) { return admVal(f, d[f]) !== '없음'; });
}
function admPlain(d) {
  return admFields(d).map(function (f) { return F_LBL[f] + ' ' + admVal(f, d[f]); }).join(' · ') || '내용 없음';
}
function admSummary(g) {
  var b = g.before_data || {}, a = g.after_data || {};
  if (g.action === 'insert') {
    return '<em>등록</em> ' + (admFields(a).map(function (f) { return esc(F_LBL[f] + ' ' + admVal(f, a[f])); }).join(' · ') || '빈 호실');
  }
  if (g.action === 'delete') {
    return '<em>삭제</em> ' + (admFields(b).map(function (f) { return esc(F_LBL[f] + ' ' + admVal(f, b[f])); }).join(' · ') || '빈 호실');
  }
  var parts = [];
  ['status', 'price', 'owner_name', 'tenant_name', 'phone', 'tenant_phone', 'lease_end_date', 'urgent', 'memo'].forEach(function (f) {
    var x = b[f] == null ? '' : String(b[f]), y = a[f] == null ? '' : String(a[f]);
    if (x !== y) parts.push(F_LBL[f] + ' ' + esc(admVal(f, b[f])) + ' <em>→</em> ' + esc(admVal(f, a[f])));
  });
  return parts.length ? parts.join(' · ') : '<em>바뀐 값 없음</em>';
}
function admWho(uid) {
  var p = adm.people[uid];
  if (!p) return '알 수 없는 사무소';
  return (p.agency_name || '(사무소명 없음)') + (p.manager_name ? ' ' + p.manager_name : '');
}

function admOpen() {
  if (!admOk()) { toast('관리자 권한이 있는 계정에서만 열립니다.'); return; }
  adm.on = true;
  admEl.classList.add('on'); ov4.classList.add('on');
  admSetTab(adm.tab);
  admLoadPeople().then(function () { admRenderMembers(); admFillUserSelect(); if (adm.tab === 'logs') admRenderLogs(); });
  admLoadMembers();
  if (adm.tab === 'logs' && !adm.logsLoaded) admLoadLogs(true);
}
function admClose() {
  if (!admEl) return;
  adm.on = false;
  admEl.classList.remove('on');
  if (ov4) ov4.classList.remove('on');
}
function admSetTab(t) {
  adm.tab = t;
  document.querySelectorAll('#adm-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.atab === t); });
  $('adm-pane-members').hidden = (t !== 'members');
  $('adm-pane-logs').hidden = (t !== 'logs');
  if (t === 'logs' && !adm.logsLoaded) admLoadLogs(true);
}

async function admLoadPeople() {
  var res = await S.sb.from('profiles').select('id,username,agency_name,manager_name,email,role');
  if (res.error && /username/i.test(res.error.message || '')) {
    res = await S.sb.from('profiles').select('id,agency_name,manager_name,email,role');
  }
  if (res.error) { console.warn('프로필 목록', res.error); return; }
  var map = {};
  (res.data || []).forEach(function (p) { map[p.id] = p; });
  adm.people = map;
}
async function admLoadMembers() {
  if (!admOk()) return;
  var res = await S.sb.rpc('admin_members');
  if (res.error) {
    $('adm-members').innerHTML = '<div class="adm-empty">회원 목록을 읽지 못했습니다.<br>' + esc(res.error.message || '') + '</div>';
    console.warn('admin_members', res.error);
    return;
  }
  adm.members = res.data || [];
  admSetBtn();
  admRenderMembers();
  admFillUserSelect();
}
function admRenderMembers() {
  var el = $('adm-members');
  if (!el) return;
  var q = norm($('adm-mq').value || '');
  var list = adm.members.filter(function (m) {
    return !q || norm([m.username, m.agency_name, m.manager_name, m.email].join(' ')).indexOf(q) >= 0;
  });
  if (!list.length) {
    el.innerHTML = '<div class="adm-empty">' + (adm.members.length ? '검색 결과가 없습니다.' : '아직 가입한 사무소가 없습니다.') + '</div>';
    return;
  }
  var head = '<div class="adm-mhead"><span>사무소</span><span>담당자</span><span>아이디 / 이메일</span><span style="text-align:right">매물</span><span style="text-align:right">마지막 활동</span><span style="text-align:right">권한</span><span></span></div>';
  el.innerHTML = head + list.map(function (m) {
    var isAdmin = (m.role === 'admin');
    var mine = !!(S.user && m.user_id === S.user.id);
    var del = (isAdmin || mine) ? '' :
      '<button class="adm-mdel" type="button" data-del="' + esc(m.user_id) + '" title="이 회원과 매물·이력을 완전히 삭제">회원 삭제</button>';
    return '<div class="adm-mrow" role="button" tabindex="0" data-uid="' + esc(m.user_id) + '">'
      + '<span class="am-name">' + esc(m.agency_name || '(사무소명 없음)') + '</span>'
      + '<span class="am-mgr">' + esc(m.manager_name || '—') + '</span>'
      + '<span class="am-mail">' + esc(m.username || m.email || '—') + '</span>'
      + '<span class="am-cnt">' + Number(m.listing_count || 0).toLocaleString('ko-KR') + '호실</span>'
      + '<span class="am-last">' + esc(admWhen(m.last_activity)) + '</span>'
      + (isAdmin ? '<span class="am-badge">관리자</span>' : '<span class="am-last">일반</span>')
      + del
      + '</div>';
  }).join('');
  el.querySelectorAll('.adm-mrow').forEach(function (b) {
    b.onclick = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-del]')) return;
      admOpenOffice(b.dataset.uid);
    };
    b.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); admOpenOffice(b.dataset.uid); }
    };
  });
  el.querySelectorAll('[data-del]').forEach(function (b) {
    b.onclick = function (e) {
      if (e.stopPropagation) e.stopPropagation();
      admDeleteMember(b.dataset.del, b);
    };
  });
}
function admMember(uid) {
  return (adm.members || []).filter(function (x) { return x.user_id === uid; })[0] || {};
}
function admFillUserSelect() {
  var sel = $('adm-user');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">전체 사무소</option>' + adm.members.map(function (m) {
    return '<option value="' + esc(m.user_id) + '">' + esc(m.agency_name || (m.username ? '(' + m.username + ')' : '') || m.email || m.user_id) + '</option>';
  }).join('');
  if (cur && adm.members.some(function (m) { return m.user_id === cur; })) sel.value = cur;
}
async function admOpenOffice(uid) {
  adm.openUser = uid;
  var p = adm.people[uid] || {};
  var m = adm.members.filter(function (x) { return x.user_id === uid; })[0] || {};
  $('adm-members').hidden = true;
  var box = $('adm-office');
  box.hidden = false;
  box.innerHTML = '<div class="adm-empty">매물을 불러오는 중…</div>';
  var res = await S.sb.from('listings').select('*').eq('user_id', uid).order('unit_key');
  var lg = await S.sb.from('activity_logs')
    .select('id,user_id,unit_key,action,before_data,after_data,actor_id,created_at')
    .eq('user_id', uid).order('id', { ascending: false }).limit(50);
  if (lg.error) console.warn('activity_logs (회원별)', lg.error);
  adm.userLogs = lg.error ? [] : (lg.data || []);
  if (res.error) {
    box.innerHTML = '<div class="adm-empty">매물을 읽지 못했습니다.<br>' + esc(res.error.message || '') + '</div>';
    return;
  }
  var rows = (res.data || []).slice().sort(function (a, b) { return admUnitCmp(a.unit_key, b.unit_key); });
  var cnt = { sale: 0, jeonse: 0, wolse: 0, done: 0, none: 0, urg: 0 };
  rows.forEach(function (r) {
    cnt[cleanState(r.status)]++;
    if (r.urgent) cnt.urg++;
  });
  var canDel = (m.role !== 'admin') && !(S.user && S.user.id === uid);
  var head = '<div class="of-head">'
    + '<button class="btn" type="button" id="of-back">← 목록</button>'
    + '<b>' + esc(m.agency_name || p.agency_name || '(사무소명 없음)') + '</b>'
    + '<span>' + esc(m.manager_name || p.manager_name || '') + (p.username || m.username ? ' · ' + esc(p.username || m.username) : (p.email ? ' · ' + esc(p.email) : '')) + '</span>'
    + '<span>가입 ' + esc(admWhen(m.created_at)) + '</span>'
    + '<span class="of-sp"></span>'
    + '<button class="btn primary" type="button" id="of-board">배치표 보기</button>'
    + (canDel ? '<button class="btn adm-del" type="button" id="of-del">회원 삭제</button>' : '')
    + '</div>';
  var chips = '<div class="of-chips">'
    + '<span class="of-chip">전체 <b>' + rows.length + '</b></span>'
    + '<span class="of-chip">매매 <b>' + cnt.sale + '</b></span>'
    + '<span class="of-chip">전세 <b>' + cnt.jeonse + '</b></span>'
    + '<span class="of-chip">월세 <b>' + cnt.wolse + '</b></span>'
    + '<span class="of-chip">보류·완료 <b>' + cnt.done + '</b></span>'
    + '<span class="of-chip">급매 <b>' + cnt.urg + '</b></span>'
    + '<span class="of-chip">기타 <b>' + cnt.none + '</b></span></div>';
  var table = rows.length ? ('<div class="of-tw"><table class="of-table"><thead><tr>'
    + '<th>호실</th><th>상태</th><th>금액</th><th>소유주</th><th>임차인</th><th>연락처</th><th>임차인 연락처</th><th>만기일</th><th>메모</th><th>수정</th>'
    + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>'
        + '<td class="num-c">' + esc(admUnit(r.unit_key)) + (r.urgent ? ' <span class="al-act delete" style="padding:0 5px">급</span>' : '') + '</td>'
        + '<td>' + esc(ST_NAME[cleanState(r.status)] || '—') + '</td>'
        + '<td>' + esc(str(r.price) || '—') + '</td>'
        + '<td>' + esc(str(r.owner_name) || '—') + '</td>'
        + '<td>' + esc(str(r.tenant_name) || '—') + '</td>'
        + '<td>' + esc(str(r.phone) || '—') + '</td>'
        + '<td>' + esc(str(r.tenant_phone) || '—') + '</td>'
        + '<td>' + esc(str(r.lease_end_date).slice(0, 10) || '—') + '</td>'
        + '<td class="memo-c">' + esc(cut(r.memo || '', 60) || '—') + '</td>'
        + '<td>' + esc(admWhen(r.updated_at)) + '</td>'
        + '</tr>';
    }).join('') + '</tbody></table></div>') : '<div class="adm-empty">등록한 매물이 없습니다.</div>';
  var hist = '<aside class="of-hist">'
    + '<div class="of-hist-h">이 회원의 변경 이력 <span>' + adm.userLogs.length + '건</span>'
    + '<button class="btn tiny" type="button" id="of-hist-refresh" title="이력을 다시 불러옵니다">새로고침</button></div>'
    + '<div class="of-hist-list" id="of-hist-list"></div></aside>';
  box.innerHTML = '<div class="of-wrap"><div class="of-main">' + head + chips + table + '</div>' + hist + '</div>';
  admRenderUserLogs();
  $('of-hist-refresh').onclick = function () { admOpenOffice(uid); };
  $('of-board').onclick = function () { admViewBoard(uid, $('of-board')); };
  if ($('of-del')) $('of-del').onclick = function () { admDeleteMember(uid, $('of-del')); };
  $('of-back').onclick = function () {
    box.hidden = true;
    $('adm-members').hidden = false;
    adm.openUser = null;
  };
}

/* ============================================================
   회원 완전 삭제 (관리자 전용 · 되돌릴 수 없음)
   ============================================================ */
async function admDeleteMember(uid, btn) {
  if (!admOk() || adm.busy || RO) return;
  var m = admMember(uid), p = adm.people[uid] || {};
  if (m.role === 'admin' || p.role === 'admin' || (S.user && S.user.id === uid)) {
    toast('관리자 계정은 삭제할 수 없습니다.');
    return;
  }
  var name = m.agency_name || m.username || p.agency_name || p.username || '(사무소명 없음)';
  var cnt = Number(m.listing_count || 0);
  var msg = name + (cnt ? ' · 매물 ' + cnt.toLocaleString('ko-KR') + '호실' : '') + '\n\n'
    + '이 회원과 등록된 모든 매물·이력을 완전히 삭제할까요? 되돌릴 수 없습니다.';
  if (!confirm(msg)) return;
  adm.busy = true;
  if (btn) { btn.disabled = true; btn.textContent = '삭제 중…'; }
  try {
    var res = await S.sb.rpc('admin_delete_member', { p_user_id: uid });
    if (res.error) throw res.error;
    var d = res.data || {};
    var lc = Number(d.listings || 0);
    toast((d.name || name) + ' 회원을 삭제했습니다' + (lc ? ' · 매물 ' + lc.toLocaleString('ko-KR') + '호실' : '') + '.');
    adm.openUser = null;
    adm.userLogs = [];
    var box = $('adm-office');
    box.hidden = true; box.innerHTML = '';
    $('adm-members').hidden = false;
    adm.logsLoaded = false;
    admLoadMembers();
    admRefreshCount();
    if (adm.tab === 'logs') admLoadLogs(true);
  } catch (e) {
    console.warn('회원 삭제 실패', e);
    toast('삭제하지 못했습니다: ' + ((e && e.message) || '연결을 확인해 주세요.'));
  } finally {
    adm.busy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = '회원 삭제'; }
  }
}

/* ============================================================
   회원 배치표 열람 — 101~106동 그리드에 그 회원의 매물을 읽기 전용으로
   ============================================================ */
async function admViewBoard(uid, btn) {
  if (!admOk() || RO) return;
  var m = admMember(uid), p = adm.people[uid] || {};
  var name = m.agency_name || p.agency_name || m.username || p.username || '(사무소명 없음)';
  if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
  var res = await S.sb.from('listings').select('*').eq('user_id', uid).order('unit_key');
  if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = '배치표 보기'; }
  if (res.error) {
    toast('매물을 읽지 못했습니다: ' + (res.error.message || ''));
    return;
  }
  /* 내가 쓰던 메모장·저장 대기열을 먼저 정리한다 */
  if (cur) { mc.classList.remove('on'); ov.classList.remove('on'); cur = null; curTd = null; selectCell(null); }
  try { if (S.pending.size && !RO) await flush(); } catch (e) {}
  var notes = {};
  (res.data || []).forEach(function (r) { notes[r.unit_key] = rowToNote(r); });
  RO = {
    uid: uid, name: name, notes: notes,
    office: $('hd-office').textContent
  };
  admClose();
  S.notes = notes;
  S.pending.clear();
  $('ro-name').textContent = name;
  $('robar').hidden = false;
  $('btn-reset').hidden = true;
  $('btn-sample').hidden = true;
  $('hd-office').textContent = name;
  document.title = '👁️ ' + name + ' 배치표 · 매물콕';
  document.body.classList.add('ro');
  paintAll(); applyFilters();
  window.scrollTo({ top: 0 });
  applyZoom();
  toast(name + ' 배치표 · ' + Object.keys(notes).length.toLocaleString('ko-KR') + '호실 (읽기 전용)');
}

async function roExit() {
  if (!RO) return;
  var back = RO.uid, office = RO.office;
  if (cur) { mc.classList.remove('on'); ov.classList.remove('on'); cur = null; curTd = null; selectCell(null); }
  RO = null;
  $('robar').hidden = true;
  $('btn-reset').hidden = false;
  document.body.classList.remove('ro');
  if (office) $('hd-office').textContent = office;
  document.title = (office || '매물콕') + ' · 매물콕';
  /* 내 배치표로 되돌린다 */
  S.pending.clear();
  S.notes = cachedNotes();
  paintAll(); applyFilters();
  admOpen();
  admOpenOffice(back);
  try {
    var rows = await Store().loadAll();
    if (RO) return;
    S.notes = rows; mirrorNow(); paintAll(); applyFilters();
  } catch (e) {
    console.warn('내 매물을 다시 읽지 못했습니다.', e);
  }
}
$('ro-back').onclick = function () { roExit(); };

/* 회원 한 명의 등록·수정·삭제·메모 이력 (우측 패널) */
function admRenderUserLogs() {
  var el = $('of-hist-list');
  if (!el) return;
  var rows = adm.userLogs || [];
  if (!rows.length) { el.innerHTML = '<div class="adm-empty">아직 변경 이력이 없습니다.</div>'; return; }
  el.innerHTML = rows.map(function (g) {
    var byAdmin = g.actor_id && g.actor_id !== g.user_id;
    return '<div class="adm-log">'
      + '<div class="al-top"><span class="al-when">' + esc(admWhen(g.created_at)) + '</span>'
      + '<span class="al-act ' + esc(g.action) + '">' + esc(ACT_KO[g.action] || g.action) + '</span>'
      + '<b>' + esc(admUnit(g.unit_key)) + '</b>'
      + (byAdmin ? '<span class="al-tag">관리자 작업</span>' : '')
      + '</div>'
      + '<div class="al-diff">' + admSummary(g) + '</div>'
      + '<div class="al-foot"><button class="al-undo" type="button" data-ulog="' + esc(g.id) + '">'
      + (g.action === 'insert' ? '등록 전으로 되돌리기' : '이 상태로 복구') + '</button></div>'
      + '</div>';
  }).join('');
  el.querySelectorAll('[data-ulog]').forEach(function (b) {
    b.onclick = function () { admRestore(b.dataset.ulog, b); };
  });
}

async function admLoadLogs(reset) {
  if (!admOk()) return;
  if (reset) { adm.logs = []; adm.cursor = null; }
  var qy = S.sb.from('activity_logs')
    .select('id,user_id,unit_key,action,before_data,after_data,actor_id,created_at')
    .order('id', { ascending: false }).limit(30);
  if (adm.user) qy = qy.eq('user_id', adm.user);
  if (adm.action) qy = qy.eq('action', adm.action);
  if (adm.q) qy = qy.ilike('unit_key', '%' + adm.q + '%');
  if (adm.cursor) qy = qy.lt('id', adm.cursor);
  var res = await qy;
  $('adm-logs').setAttribute('aria-busy', '0');
  if (res.error) {
    $('adm-logs').innerHTML = '<div class="adm-empty">활동 이력을 읽지 못했습니다.<br>' + esc(res.error.message || '') + '</div>';
    console.warn('activity_logs', res.error);
    return;
  }
  var rows = res.data || [];
  adm.logs = reset ? rows : adm.logs.concat(rows);
  if (rows.length) adm.cursor = rows[rows.length - 1].id;
  adm.logsLoaded = true;
  $('adm-more').hidden = rows.length < 30;
  admRenderLogs();
}
function admRenderLogs() {
  var el = $('adm-logs');
  if (!el) return;
  if (!adm.logs.length) {
    el.innerHTML = '<div class="adm-empty">' + (adm.logsLoaded ? '기록이 없습니다.' : '불러오는 중…') + '</div>';
    return;
  }
  el.innerHTML = adm.logs.map(function (g) {
    var byAdmin = g.actor_id && g.actor_id !== g.user_id;
    return '<div class="adm-log">'
      + '<div class="al-top"><span class="al-when">' + esc(admWhen(g.created_at)) + '</span>'
      + '<span class="al-who">' + esc(admWho(g.user_id)) + '</span>'
      + '<span class="al-act ' + esc(g.action) + '">' + esc(ACT_KO[g.action] || g.action) + '</span>'
      + '<b>' + esc(admUnit(g.unit_key)) + '</b>'
      + (byAdmin ? '<span class="al-tag">관리자 작업</span>' : '')
      + '</div>'
      + '<div class="al-diff">' + admSummary(g) + '</div>'
      + '<div class="al-foot"><button class="al-undo" type="button" data-log="' + esc(g.id) + '">'
      + (g.action === 'insert' ? '등록 전으로 되돌리기' : '이 상태로 복구') + '</button></div>'
      + '</div>';
  }).join('');
  el.querySelectorAll('[data-log]').forEach(function (b) {
    b.onclick = function () { admRestore(b.dataset.log, b); };
  });
}
async function admRestore(id, btn) {
  if (adm.busy) return;
  var g = (adm.logs || []).concat(adm.userLogs || []).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!g) return;
  var d = g.before_data;
  var who = admWho(g.user_id), unit = admUnit(g.unit_key);
  var msg;
  if (g.action === 'insert' || !d) {
    msg = unit + ' · ' + who + '\n\n이 등록을 되돌려 매물 기록을 지울까요?\n(지운 사실도 이력에 남습니다.)';
  } else {
    msg = unit + ' · ' + who + '\n\n아래 상태로 되돌릴까요?\n\n· ' + admPlain(d)
        + '\n\n지금 기록은 덮어써지고, 복구한 내용도 이력에 남습니다.';
  }
  if (!confirm(msg)) return;
  adm.busy = true;
  if (btn) btn.disabled = true;
  try {
    var res;
    if (g.action === 'insert' || !d) {
      res = await S.sb.from('listings').delete().eq('user_id', g.user_id).eq('unit_key', g.unit_key);
    } else {
      res = await S.sb.from('listings').upsert({
        user_id: g.user_id,
        unit_key: g.unit_key,
        status: cleanState(d.status),
        price: str(d.price) || null,
        owner_name: str(d.owner_name) || null,
        tenant_name: str(d.tenant_name) || null,
        phone: str(d.phone) || null,
        tenant_phone: str(d.tenant_phone) || null,
        lease_end_date: str(d.lease_end_date).slice(0, 10) || null,
        memo: str(d.memo) || null,
        urgent: !!d.urgent
      }, { onConflict: 'user_id,unit_key' });
    }
    if (res.error) throw res.error;
    toast((g.action === 'insert' || !d) ? (unit + ' · 등록 전으로 되돌렸습니다.') : (unit + ' · 복구 완료'));
    /* 관리자 본인 매물이면 이 화면도 맞춘다 */
    if (S.user && S.user.id === g.user_id) {
      try {
        S.notes = await Store().loadAll(); mirrorNow(); paintAll(); applyFilters();
      } catch (e) { console.warn(e); }
    }
    adm.logsLoaded = false;
    admLoadLogs(true);
    admLoadMembers();
    if (adm.openUser === g.user_id && !$('adm-office').hidden) admOpenOffice(g.user_id);
  } catch (e) {
    console.warn('복구 실패', e);
    toast('복구하지 못했습니다: ' + ((e && e.message) || '연결을 확인해 주세요.'));
  } finally {
    adm.busy = false;
    if (btn) btn.disabled = false;
  }
}

$('btn-admin').onclick = function () { if (RO) { roExit(); return; } admOpen(); };
$('adm-x').onclick = admClose;
ov4.onclick = admClose;
document.querySelectorAll('#adm-tabs button').forEach(function (b) {
  b.onclick = function () { admSetTab(b.dataset.atab); };
});
$('adm-mq').addEventListener('input', admRenderMembers);
$('adm-mrefresh').onclick = function () { admLoadPeople().then(admRenderMembers); admLoadMembers(); };
$('adm-user').addEventListener('change', function () { adm.user = this.value; admLoadLogs(true); });
$('adm-action').addEventListener('change', function () { adm.action = this.value; admLoadLogs(true); });
var admQT = null;
$('adm-q').addEventListener('input', function () {
  var v = str(this.value);
  clearTimeout(admQT);
  admQT = setTimeout(function () { adm.q = v; admLoadLogs(true); }, 280);
});
$('adm-refresh').onclick = function () { admLoadLogs(true); };
$('adm-more').onclick = function () { admLoadLogs(false); };

function showSetupHelp() {
  alert('데모 모드입니다.\n\n'
    + '실제 서비스로 바꾸려면 관리자가 다음을 하면 됩니다.\n'
    + '1) Supabase 무료 프로젝트 생성\n'
    + '2) supabase_schema.sql 실행\n'
    + '3) config.js 에 Project URL 과 anon public 키 입력\n'
    + '4) GitHub Pages 에 올리기\n\n'
    + '자세한 순서는 README_SETUP.md 에 있습니다.');
}

function boot() {
  $('hs-all').textContent = (BOARD.units || []).length.toLocaleString('ko-KR');
  $('c-all').textContent = (BOARD.units || []).length.toLocaleString('ko-KR');
  $('c-show').textContent = (BOARD.units || []).length.toLocaleString('ko-KR');
  $('demo-box').hidden = LIVE;

  if (!LIVE) {
    var d = demoData();
    if (d.session && d.users && d.users[d.session]) {
      var u = d.users[d.session];
      enterApp({ id: 'demo:' + d.session, email: u.email || null }, { agency_name: u.agency, manager_name: u.manager, approved: u.approved !== false });
    } else {
      showAuth('login');
    }
    $('auth-foot').innerHTML = '지금은 <b>데모 모드</b>입니다. 아래 버튼으로 둘러보세요.';
    return;
  }

  loadSdk().then(async function () {
    S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    S.sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true;
        showAuth('newpw');
        clearRecoveryHash();
        return;
      }
      if (event === 'SIGNED_OUT') { if (S.ready) signOut(); }
    });
    var recoveryHash = /[#&?]type=recovery/.test(location.hash || '');
    var got = await S.sb.auth.getSession();
    var session = got.data && got.data.session;
    /* 비밀번호 재설정 링크로 들어온 경우에는 매물장보다 새 비밀번호를 먼저 받는다 */
    if (recovering || recoveryHash) {
      recovering = true;
      clearRecoveryHash();
      showAuth('newpw');
      return;
    }
    if (session && session.user) enterApp(session.user);
    else {
      var hash = location.hash || '';
      if (/error_description=/.test(hash)) {
        showAuth('login', decodeURIComponent((hash.match(/error_description=([^&]+)/) || [])[1] || '').replace(/\+/g, ' '));
      } else if (/type=recovery/.test(hash)) {
        showAuth('newpw');
      } else {
        showAuth('login');
      }
    }
  }).catch(function (e) {
    $('boot').hidden = true;
    showAuth('login');
    setMsg('li-msg', '연결 모듈을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');
    console.error(e);
  });
}

function loadSdk() {
  return new Promise(function (res, rej) {
    if (window.supabase && window.supabase.createClient) return res();
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.onload = function () { res(); };
    s.onerror = function () { rej(new Error('Supabase SDK 로드 실패')); };
    document.head.appendChild(s);
  });
}

/* 테스트/디버그용 최소 노출 (읽기 전용) */
window.CLS = {
  get notes() { return S.notes; },
  get mode() { return S.mode; },
  get ready() { return S.ready; }
};

document.addEventListener('DOMContentLoaded', boot);
})();
