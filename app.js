/* ============================================================
   매물콕 — 멀티유저 매물장
   - 로그인한 계정의 매물만 조회·수정 (Supabase RLS)
   - Supabase 미연결 시 '데모 모드' (이 브라우저에만 저장)
   ============================================================ */
(function () {
'use strict';

var CFG = window.CENTUM_CONFIG || {};
var LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && /^https?:\/\//.test(CFG.SUPABASE_URL));

/* ---------- 단지 목록 (멀티 단지) ----------
   cat: 상단 카테고리(아파트 · 오피스텔 · 분양권)
   py:  타입을 '평형'으로 부르고 표기에 '평'을 붙인다 (아이파크·아델리스)
   premium: 매매가와 프리미엄을 나눠 적는 단지 (분양권 — 센텀르엘·써밋리미티드남천·베뉴브해운대) */
var CATS = ['아파트', '오피스텔', '분양권'];
var CAT = '';
var CX_LIST = [];
(function () {
  if (window.CENTUM_BOARD) {
    CX_LIST.push({
      id: 'centum', name: '센텀르엘(분양권)', sub: '101~106동 · 2,070세대',
      desc: '르엘 리버파크 센텀', board: window.CENTUM_BOARD, cols: 6, bottom: 5, fillBlanks: true,
      price: true, py: false, premium: true, cat: '분양권', dongs: [101, 102, 103, 104, 105, 106]
    });
  }
  if (window.IPARK_BOARD) {
    CX_LIST.push({
      id: 'ipark', name: '해운대아이파크', sub: '1·2·3동 · 1,631세대',
      desc: "수영만 해운대 I'PARK", board: window.IPARK_BOARD, cols: 10, bottom: 3, fillBlanks: true,
      price: false, py: true, premium: false, cat: '아파트', dongs: [1, 2, 3]
    });
  }
  if (window.ZENITH_BOARD) {
    /* 동 id 201~203: 센텀르엘(101~106)·해운대아이파크(1~3)와 unit_key가 겹치지 않게 하는 내부 번호.
       화면에는 board.dongs 의 name(101동~103동)으로 보인다. */
    CX_LIST.push({
      id: 'zenith', name: '해운대두산위브더제니스', sub: '101·102·103동 · 1,788세대',
      desc: '마린시티 두산위브 더 제니스', board: window.ZENITH_BOARD, cols: 12, bottom: 3, fillBlanks: true,
      price: false, py: false, premium: false, cat: '아파트', dongs: [201, 202, 203], skipLines: [4]
    });
  }
  if (window.ADELLIS_BOARD) {
    /* 오피스텔. 동 id 301~303: 센텀르엘(101~106)·아이파크(1~3)·제니스(201~203)와
       unit_key가 겹치지 않게 하는 내부 번호. 화면에는 101~103동으로 보인다.
       4호 라인이 없어 skipLines 로 빼고, 1~3층은 필로티·근린생활시설이라 BOTTOM=4. */
    CX_LIST.push({
      id: 'adellis', name: '더샵해운대아델리스(O/T)', sub: '101·102·103동 · 510세대',
      desc: '마린시티 더샵 아델리스', board: window.ADELLIS_BOARD, cols: 5, bottom: 4, fillBlanks: true,
      price: false, py: true, premium: false, cat: '오피스텔', dongs: [301, 302, 303], skipLines: [4]
    });
  }
  if (window.SUMMIT_BOARD) {
    /* 써밋리미티드남천 — 분양권. 동 id 401~405: 센텀르엘(101~106)·아이파크(1~3)·제니스(201~203)·
       아델리스(301~303)와 unit_key 가 겹치지 않게 하는 내부 번호. 화면에는 101~105동으로 보인다.
       동마다 라인 수가 달라(101동 6 · 102·103동 4 · 104·105동 5) board.dongs[].cols 를 동별로 읽어
       그리므로 단지 공통 cols 는 가장 넓은 6으로 둔다. 1~3층은 판매시설·필로티라 BOTTOM=4. */
    CX_LIST.push({
      id: 'summit', name: '써밋리미티드남천(분양권)', sub: '101~105동 · 835세대',
      desc: '남천 써밋', board: window.SUMMIT_BOARD, cols: 6, bottom: 4, fillBlanks: true,
      price: true, py: false, premium: true, cat: '분양권', dongs: [401, 402, 403, 404, 405]
    });
  }
  if (window.VENUV_BOARD) {
    /* 베뉴브 해운대 — 분양권. 동 id 501~503: 위 단지들과 unit_key 가 겹치지 않게 하는 내부 번호.
       1층은 필로티·판매시설·관리사무소라 BOTTOM=2, 20층은 피난안전구역(세대 없음).
       조합원·보류지 31세대는 분양가 0(미공개)로 들어 있다. */
    CX_LIST.push({
      id: 'venuv', name: '베뉴브해운대(분양권)', sub: '101·102·103동 · 660세대',
      desc: '베뉴브 해운대', board: window.VENUV_BOARD, cols: 5, bottom: 2, fillBlanks: true,
      price: true, py: false, premium: true, cat: '분양권', dongs: [501, 502, 503],
      noPrice: '분양가 미공개 (조합원·보류지)'
    });
  }
  if (window.TRUMP_BOARD) {
    /* 트럼프월드마린 아파트 — 도면의 101·102동이 현장·네이버 표기로는 A동·B동이다.
       동 id 601·602: 위 단지들과 unit_key 가 겹치지 않게 하는 내부 번호. 화면에는 A동·B동으로 보인다.
       1·2층은 필로티 및 기타공간이라 세대는 3층부터(BOTTOM=3). */
    CX_LIST.push({
      id: 'trump_apt', name: '트럼프월드마린', sub: 'A·B동 · 232세대',
      desc: '마린시티 대우트럼프월드마린', board: window.TRUMP_BOARD, cols: 3, bottom: 3, fillBlanks: true,
      price: false, py: true, premium: false, cat: '아파트', dongs: [601, 602]
    });
  }
  if (window.TRUMP_OT_BOARD) {
    /* 트럼프월드마린 오피스텔 — 도면의 103·104동이 C동·D동.
       동 id 701·702: 위 단지들과 unit_key 가 겹치지 않게 하는 내부 번호. 화면에는 C동·D동으로 보인다. */
    CX_LIST.push({
      id: 'trump_ot', name: '트럼프월드마린(O/T)', sub: 'C·D동 · 222세대',
      desc: '마린시티 트럼프월드마린 오피스텔', board: window.TRUMP_OT_BOARD, cols: 4, bottom: 3, fillBlanks: true,
      price: false, py: true, premium: false, cat: '오피스텔', dongs: [701, 702]
    });
  }
  if (window.WOOSHIN_BOARD) {
    /* 우신골든스위트(O/T) — 서관동·동관동 2개동 202세대. 동 id 801·802: 위 단지들과
       unit_key 가 겹치지 않게 하는 내부 번호. 화면에는 board.dongs 의 name(서관동·동관동)으로 보인다.
       1~3층은 상가·부대복리시설이라 세대는 4층부터(BOTTOM=4).
       호수는 4층을 건너뛰고 5xx부터 시작해 37층이 38xx → hoAdd:1 로 '층+1'을 앞자리로 쓴다
       (37층 3803호 = 802-3-37). */
    CX_LIST.push({
      id: 'wooshin', name: '우신골든스위트(O/T)', sub: '서관·동관 · 202세대',
      desc: '마린시티 우신 골든스위트', board: window.WOOSHIN_BOARD, cols: 3, bottom: 4, fillBlanks: true,
      price: false, py: false, premium: false, cat: '오피스텔', dongs: [801, 802], hoAdd: 1
    });
  }
  if (!CX_LIST.length) CX_LIST.push({ id: 'empty', name: '단지', sub: '', board: { units: [], area: {}, meta: {} }, cols: 6, bottom: 5, dongs: [] });
})();
var CX = CX_LIST[0];
var BOARD = CX.board;
var DONGS = (CX.dongs || []).slice();
var TOP = {}, BOTTOM = CX.bottom || 5, COLS = CX.cols || 6;
var DONG_META = {};
/* 화면에서 빼는 호수 열 — 제니스는 4호 세대가 아예 없어 3호와 5호를 붙여 보여준다 */
var SKIP_LINES = [], NCOLS = COLS;

/* ---------- 동 테두리 색 ----------
   동 하나를 한 채의 건물로 보고 바깥 테두리를 두른다.
   c=테두리·동 이름 띠, h=동 제목 머리 바탕, t=빈 하늘 칸의 아주 옅은 바탕.
   2026-11-24 사용자 요청: 동마다 색을 달리하던 6색 팔레트를 모두 같은 짙은 회색으로 통일.
   단지·동이 몇 개로 늘어나도 전부 이 한 색을 쓰므로 새 단지도 자동으로 같은 결이 된다. */
var DONG_COLOR = { c: '#334155', h: '#F1F5F9', t: 'rgba(51,65,85,.045)' };
function dongColor(d) {
  return DONG_COLOR;
}
function dongLines(n) {
  var a = [];
  for (var h = 1; h <= n; h++) if (SKIP_LINES.indexOf(h) < 0) a.push(h);
  return a;
}

/* ---------- 기본 상수 ---------- */
/* 1~4층 공용부 이름 — 센텀르엘 기본값. 단지별로 setComplex 에서 바꿔 끼운다. */
var F1_LABEL_CENTUM = {
  101: '판매시설', 102: '판매시설', 103: '판매시설', 104: '판매시설',
  105: '판매시설, 어린이집', 106: '판매시설, 관리사무소'
};
var F1_LABEL = F1_LABEL_CENTUM;
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
/* 더샵해운대아델리스(O/T) 평형 색상 — 단지 배치도의 평형 색(노랑·연두·라벤더·분홍·연녹·주황·파랑)을 따름 */
var ADELLIS_COLOR = {
  '58':  { bg: '#FBE7A1', bd: '#D9C273', fg: '#1F2937' },
  '67':  { bg: '#B9E1B4', bd: '#95C08F', fg: '#1F2937' },
  '74A': { bg: '#D9C8F1', bd: '#B5A2D4', fg: '#1F2937' },
  '74B': { bg: '#F5B8C8', bd: '#D494A5', fg: '#1F2937' },
  '81':  { bg: '#C9E8A8', bd: '#A5C786', fg: '#1F2937' },
  '122': { bg: '#F8C08A', bd: '#D19E69', fg: '#1F2937' },
  '126': { bg: '#A9CDEB', bd: '#86AACB', fg: '#1F2937' }
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
/* 써밋리미티드남천(분양권) 타입 색상 — 작은 평형(파랑·초록)에서 큰 평형(노랑·주황·분홍)으로,
   팬트하우스 243B~E는 짙은 색으로 두어 다른 타입과 한눈에 갈린다 */
var SUMMIT_COLOR = {
  '84A':  { bg: '#9CC7E8', bd: '#7BA6C7', fg: '#1F2937' },
  '84B':  { bg: '#A8D8B9', bd: '#86B798', fg: '#1F2937' },
  '112A': { bg: '#F2E08E', bd: '#CDBB69', fg: '#1F2937' },
  '112B': { bg: '#F5C58A', bd: '#CFA066', fg: '#1F2937' },
  '122A': { bg: '#C7B0E3', bd: '#A78FC4', fg: '#1F2937' },
  '142A': { bg: '#8FBFC4', bd: '#6E9EA3', fg: '#1F2937' },
  '144A': { bg: '#EFA78C', bd: '#CC876A', fg: '#1F2937' },
  '177A': { bg: '#CBE59E', bd: '#A9C37C', fg: '#1F2937' },
  '182A': { bg: '#A6AEDC', bd: '#858DBE', fg: '#1F2937' },
  '182B': { bg: '#E790B0', bd: '#C17091', fg: '#1F2937' },
  '227A': { bg: '#9E8FD0', bd: '#8073B0', fg: '#FFFFFF' },
  '243B': { bg: '#7C8FC4', bd: '#61729F', fg: '#FFFFFF' },
  '243C': { bg: '#9C7FB8', bd: '#7E6499', fg: '#FFFFFF' },
  '243D': { bg: '#C08A6B', bd: '#9E6D51', fg: '#FFFFFF' },
  '243E': { bg: '#6E9E9E', bd: '#548080', fg: '#FFFFFF' }
};
/* 써밋리미티드남천 타입 줄 배지 — 라인 대부분과 다른 타입이 최상층 한두 세대만 차지하는 줄.
   해당 줄은 대표 타입으로 칠하고, 이 타입을 작은 배지로 붙인다(툴팁에도 같이 남는다). */
var SUMMIT_LINE_BADGE = {
  '401-1': '227A', '401-2': '227A',
  '402-1': '243C', '402-2': '243B',
  '403-1': '243E', '403-2': '243D'
};
/* 베뉴브해운대(분양권) 타입 색상 — 59(파랑) · 84(초록~주황) · 99(라일락)로 평형대를 나눈
   조합 배치도 색을 따르고, 같은 84 안에서도 A~E가 서로 섮이지 않게 색상환을 넓혔다 */
var VENUV_COLOR = {
  '59A': { bg: '#B7D9F2', bd: '#93B7D0', fg: '#1F2937' },
  '59B': { bg: '#F0C9A8', bd: '#CCA481', fg: '#1F2937' },
  '84A': { bg: '#A8D8B9', bd: '#86B798', fg: '#1F2937' },
  '84B': { bg: '#CBE59E', bd: '#A9C37C', fg: '#1F2937' },
  '84C': { bg: '#F1E199', bd: '#CDBF74', fg: '#1F2937' },
  '84D': { bg: '#F5C48F', bd: '#D0A06C', fg: '#1F2937' },
  '84E': { bg: '#EFA78C', bd: '#CC876A', fg: '#1F2937' },
  '99':  { bg: '#C3ABE0', bd: '#A38CBE', fg: '#1F2937' }
};
/* 트럼프월드마린 아파트(A·B동) 평형 색 — 59(연파랑) → 64(연두) → 69(노랑) → 79(분홍) → 펜트하우스(짙은 남색) */
var TRUMP_APT_COLOR = {
  '59': { bg: '#B7D9F2', bd: '#93B7D0', fg: '#1F2937' },
  '64': { bg: '#CBE59E', bd: '#A9C37C', fg: '#1F2937' },
  '69': { bg: '#F1E199', bd: '#CDBF74', fg: '#1F2937' },
  '79': { bg: '#F5B8C8', bd: '#D494A5', fg: '#1F2937' },
  'PH': { bg: '#7C8FC4', bd: '#61729F', fg: '#FFFFFF' }
};
/* 우신골든스위트(O/T) 평형 색 — 66평(연두) · 70평(노랑) · 80평(분홍).
   2026-11-27 사용자 요청: 계약면적 5종(287.97·293.11·346.2A·388.71B·389.56C)을 화면에서는
   작은 평수 순서대로 66평·70평·80평 3종으로 묶는다. 호실별 계약/전용㎡는 그대로 둔다. */
var WOOSHIN_COLOR = {
  '66평': { bg: '#CBE59E', bd: '#A9C37C', fg: '#1F2937' },
  '70평': { bg: '#F1E199', bd: '#CDBF74', fg: '#1F2937' },
  '80평': { bg: '#F5B8C8', bd: '#D494A5', fg: '#1F2937' }
};
/* 트럼프월드마린 오피스텔(C·D동) 평형 색 — 58(연파랑) · 64(연두) · 69(노랑) */
var TRUMP_OT_COLOR = {
  '58': { bg: '#B7D9F2', bd: '#93B7D0', fg: '#1F2937' },
  '64': { bg: '#CBE59E', bd: '#A9C37C', fg: '#1F2937' },
  '69': { bg: '#F1E199', bd: '#CDBF74', fg: '#1F2937' }
};
var ST_NAME = { none: '미확인', sale: '매매', jeonse: '전세', wolse: '월세', done: '보류·완료' };
var ST_COLOR = { none: '#ffffff', sale: '#FEF08A', jeonse: '#BAE6FD', wolse: '#E9D5FF', done: '#FCA5A5' };
var ST_BORDER = { none: '#b9c2cc', sale: '#d9b421', jeonse: '#56b6e0', wolse: '#c084fc', done: '#e88' };
var URG_RE = /급내|급매/;
/* 복수로 함께 고를 수 있는 상태 — 이 순서대로 대각선 색을 나눈다(매매 → 전세 → 월세).
   보류·완료는 단독, 기본은 선택 없음이다. */
var ST_ORDER = ['sale', 'jeonse', 'wolse'];
var PRICE_LBL = { sale: '매매가', jeonse: '전세 보증금', wolse: '월세 보증금·월세', etc: '금액', premium: '프리미엄' };
/* 금액은 모두 '만원' 단위 숫자로 다룬다. DB에는 96,000 처럼 콤마가 붙은 숫자로 남긴다. */
var PRICE_KEYS = ['sale', 'premium', 'jeonse', 'wolse', 'etc'];
/* price 는 상태별(ps)로 나눠 담고, 아래 목록은 금액을 뺀 나머지 칸이다 */
var FIELDS = ['owner', 'tenant', 'phone', 'tphone', 'end'];

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
/* ---------- 금액 — 모두 '만원' 단위 숫자로 다룬다 ---------- */
function digitsOnly(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }
/* 입력칸에 보이는 모양 — 숫자만 남기고 천 단위 콤마 */
function fmtMan(v) {
  var s = str(v);
  if (!s) return '';
  if (!digitsOnly(s)) return s;      /* 숫자가 전혀 없는 값은 그대로 보여 준다 */
  var n = parseMan(s);
  if (n === '') return s;
  return Number(n).toLocaleString('ko-KR');
}
/* 옛 금액('30억', '12억 5,000만', '13억7000만', '5,000만', '96000') → 만원 숫자('300000') */
function parseMan(v) {
  var s = str(v).replace(/,/g, '').replace(/\s+/g, '');
  if (!s) return '';
  if (/^\d+(?:\.\d+)?$/.test(s)) return String(Math.round(parseFloat(s)));
  var eok = 0, man = 0, rest = s, m;
  m = rest.match(/^(\d+(?:\.\d+)?)억(.*)$/);
  if (m) { eok = parseFloat(m[1]); rest = m[2]; }
  m = rest.match(/^(\d+(?:\.\d+)?)만?/);
  if (m) man = parseFloat(m[1]);
  var t = Math.round(eok * 10000 + man);
  return t ? String(t) : '';
}
/* 만원 숫자 → 화면용('9억 6,000만', '3,000만') */
function amtText(v) {
  var n = parseMan(v);
  if (n === '') return str(v);
  var num = parseInt(n, 10) || 0;
  if (!num) return '0';
  var eok = Math.floor(num / 10000), man = num % 10000;
  if (eok && man) return eok + '억 ' + man.toLocaleString('ko-KR') + '만';
  if (eok) return eok + '억';
  return man.toLocaleString('ko-KR') + '만';
}
/* 빈 값을 '' 로 박아 둔 행(다른 프로그램으로 넣은 자료)은 빈 칸으로 본다 */
function phStr(v) {
  var s = str(v);
  return (s === "''" || s === '\"\"') ? '' : s;
}
function cleanState(s) {
  return (s === 'sale' || s === 'jeonse' || s === 'wolse' || s === 'done') ? s : 'none';
}
/* 복합 상태 정규화 — 배열이든 'sale,jeonse' 같은 문자열이든 [sale,jeonse] 로.
   매매·전세·월세는 2~3개를 함께 고를 수 있고, 보류·완료는 단독 선택이다. */
function cleanStates(v) {
  var raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[^a-z]+/);
  if (raw.indexOf('done') >= 0) return ['done'];
  var out = [];
  ST_ORDER.forEach(function (s) { if (raw.indexOf(s) >= 0 && out.indexOf(s) < 0) out.push(s); });
  return out;
}
function statesFromNote(n) {
  if (!n) return [];
  if (n.ss != null) return cleanStates(n.ss);
  var st = cleanState(n.s);
  return st === 'none' ? [] : [st];
}
function statesLabel(ss) {
  var a = cleanStates(ss);
  return a.length ? a.map(function (s) { return ST_NAME[s]; }).join('+') : ST_NAME.none;
}
/* 전세·월세가 들어 있는 복합 매물이면 만기 알림에 어느 이름으로 보일지 고른다 */
function leaseState(n) {
  var ss = statesFromNote(n);
  if (ss.indexOf('jeonse') >= 0) return 'jeonse';
  if (ss.indexOf('wolse') >= 0) return 'wolse';
  return '';
}
/* 금액은 상태별로 따로 적는다 (매매가 / 전세 보증금 / 월세 보증금·월세)
   상태가 없는 기본·보류는 etc 한 칸을 쓴다. */
function priceKeyOf(st) { return (st === 'sale' || st === 'jeonse' || st === 'wolse') ? st : 'etc'; }
function pricesOf(n) { return (n && n.ps && typeof n.ps === 'object') ? n.ps : {}; }
function primaryPrice(n) {
  var ps = pricesOf(n), ss = statesFromNote(n), v = '';
  ss.forEach(function (s) { if (!v) v = str(ps[s]); });
  return v || str(ps.etc);
}
function priceText(ss, ps) {
  var arr = cleanStates(ss), parts = [];
  arr.forEach(function (s) {
    var v = str(ps[s]); if (!v) return;
    /* 월세는 '보증금 / 월세' 한 값으로 저장돼 있어 둘을 따로 보여 준다 */
    if (s === 'wolse') {
      var w = splitWolse(v), t = [amtText(w.dep), amtText(w.mon)].filter(Boolean).join(' / ');
      parts.push(PRICE_LBL[s] + ' ' + (t || amtText(v)));
      return;
    }
    parts.push(PRICE_LBL[s] + ' ' + amtText(v));
  });
  /* 센텀르엘(분양권) 매매 프리미엄은 매매가와 따로 보여 준다 */
  if (arr.indexOf('sale') >= 0 && CX.premium && str(ps.premium)) parts.push(PRICE_LBL.premium + ' ' + amtText(ps.premium));
  if (!parts.length && str(ps.etc)) parts.push(amtText(ps.etc));
  return parts.join(' · ');
}
function K(d, h, f) { return d + '-' + h + '-' + f; }
/* 동 이름: 센텀르엘·아이파크는 '101동'·'1동', 제니스는 내부 id 201~203을 '101동'으로 보인다 */
var DONG_LABEL = {};
function dongLabel(d) { return DONG_LABEL[d] || (d + '동'); }
/* 타입 표기: 센텀르엘은 타입명(84·104A), 아이파크는 평형(36평), 제니스는 타입명(162C) */
function typeKind() { return CX.py ? '평형' : '타입'; }
/* 펜트하우스(PH)는 '평'을 붙이지 않고 그대로 PH 로 부른다 */
function chipLabel(t) { return (CX.py && t !== 'PH') ? t + '평' : t; }
/* 타입 이름에 이미 '평'이 붙은 단지(우신골든스위트 '66평')는 그대로 쓴다 */
function typeFull(t) { return /평$/.test(t) ? t : ((CX.py && t !== 'PH') ? t + '평형' : (CX.id === 'zenith' ? t + ' 타입' : t + '타입')); }
/* 툴팁·읽기 이름에 붙는 '타입' — '66평 타입'처럼 띄어 쓴다 */
function typeWord(t) { return /평$/.test(t) ? t + ' 타입' : t + '타입'; }
/* 타입 줄(칸)에는 좁은 칸에 맞는 짧은 이름: 제니스는 숫자를 빼고 영문 타입만(162C→C) */
function rowTypeLabel(t) {
  if (CX.id !== 'zenith') return t;
  var m = String(t).match(/^[\d.]+(.+)$/);
  return m ? m[1] : t;
}
/* 호수 표시 — 기본은 '층+호라인'(2501호). 우신골든스위트처럼 4층을 건너뛰고 5xx부터
   번호를 매긴 단지는 hoAdd 로 앞자리를 한 층 올린다(4층 501호 = 4층 1호라인). */
function hoNum(f, h, cx) { var c = cx || CX; var off = (c && c.hoAdd) || 0; return String(+f + off) + String(h).padStart(2, '0'); }
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
/* 분양가가 공개되지 않은 호실 — 베뉴브해운대의 조합원·보류지 31세대가 분양가 0으로 들어 있다.
   0을 그대로 찍으면 '0만 원'·'계약금 5% · 0만'이 되므로 메모장·툴팁에서는 안내 문구로 바꾼다. */
function hasPrice(u) { return !!(u && u.p > 0); }
function noPriceText() { return CX.noPrice || '분양가 미공개'; }
function priceLabelOf(u) { return hasPrice(u) ? won(u.p) : noPriceText(); }
var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
}

/* ---------- 배치표 인덱스 ---------- */
var IDX = new Map(), RIDX = new Map(), LINE_TYPE = {}, LINE_TY = {}, DONG_CNT = {}, LINE_CNT = {}, AREA = {};

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
    m[d.id] = { top: d.top, cols: d.cols || cx.cols, special: d.special || {}, name: d.name, lines: d.lines || null };
  });
  /* 베뉴브해운대는 101·102·103동 모두 20층이 피난안전구역이라 세대가 없다 */
  if (cx.id === 'venuv') {
    [501, 502, 503].forEach(function (d) {
      if (!m[d]) return;
      m[d].special = Object.assign({ 20: '20F 피난안전구역' }, m[d].special || {});
    });
  }
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
  SKIP_LINES = (cx.skipLines || []).slice();
  NCOLS = dongLines(COLS).length;
  TYPE_COLOR = (cx.id === 'adellis') ? ADELLIS_COLOR
    : ((cx.id === 'ipark') ? IPARK_COLOR
    : ((cx.id === 'zenith') ? ZENITH_COLOR
    : ((cx.id === 'summit') ? SUMMIT_COLOR
    : ((cx.id === 'venuv') ? VENUV_COLOR
    : ((cx.id === 'trump_apt') ? TRUMP_APT_COLOR
    : ((cx.id === 'trump_ot') ? TRUMP_OT_COLOR
    : ((cx.id === 'wooshin') ? WOOSHIN_COLOR : CENTUM_TYPE_COLOR)))))));
  DONG_META = dongMetaFor(cx);
  TOP = {};
  DONGS.forEach(function (d) { TOP[d] = (DONG_META[d] && DONG_META[d].top) || 67; });
  if (cx.id === 'ipark') {
    F1_LABEL = { 1: '판매시설 및 주민공동시설', 2: '판매시설 및 주민공동시설', 3: '판매시설 및 주민공동시설' };
  } else if (cx.id === 'zenith') {
    F1_LABEL = { 201: '로비 · 판매시설', 202: '로비 · 판매시설', 203: '로비 · 판매시설' };
  } else if (cx.id === 'adellis') {
    F1_LABEL = { 301: '근린생활시설 · 로비', 302: '근린생활시설 · 로비', 303: '근린생활시설 · 로비' };
  } else if (cx.id === 'summit') {
    F1_LABEL = { 401: '판매시설', 402: '판매시설', 403: '판매시설', 404: '판매시설', 405: '판매시설' };
  } else if (cx.id === 'venuv') {
    F1_LABEL = { 501: '판매시설 · 필로티 · 관리사무소', 502: '판매시설 · 필로티 · 관리사무소', 503: '판매시설 · 필로티 · 관리사무소' };
  } else if (cx.id === 'trump_apt') {
    F1_LABEL = { 601: '필로티 및 기타공간', 602: '필로티 및 기타공간' };
  } else if (cx.id === 'trump_ot') {
    F1_LABEL = { 701: '필로티 및 기타공간', 702: '필로티 및 기타공간' };
  } else if (cx.id === 'wooshin') {
    F1_LABEL = { 801: '부대복리시설 · 헬스장·수영장·연회실', 802: '부대복리시설 · 헬스장·수영장·연회실' };
  } else {
    F1_LABEL = F1_LABEL_CENTUM;
  }
  buildIndex();
  UNIT_FLOORS = (function () { var m = 0, a = []; DONGS.forEach(function (d) { m = Math.max(m, TOP[d]); }); for (var f = m; f >= BOTTOM; f--) a.push(f); return a; })();
  built = false;
  cellMap.clear();
  if (boardEl) { boardEl.innerHTML = ''; boardEl.dataset.cx = cx.id; }
}

function buildIndex() {
  IDX = new Map(); RIDX = new Map(); LINE_TYPE = {}; LINE_TY = {}; DONG_CNT = {}; LINE_CNT = {};
  (BOARD.units || []).forEach(function (u) {
    var it = { d: u[0], h: u[1], f: u[2], t: u[3], p: u[4], s: u[5], j: u[6] };
    IDX.set(K(u[0], u[1], u[2]), it);
    /* 화면에 그리는 열 — 대부분 호수 그대로지만, 우신골든스위트 동관동 3803호처럼
       세로로 비는 호수 열을 없애고 옆 열에 그리는 호실은 units 8번째 값(그리는 열)을 쓴다.
       unit_key 는 실제 호수(K(u[0],u[1],u[2])) 그대로다. */
    var rc = (u[7] != null) ? u[7] : u[1];
    RIDX.set(K(u[0], rc, u[2]), it);
    var meta = DONG_META[u[0]];
    if (meta && meta.special && meta.special[String(u[2])]) return;   /* 특수층 호실은 세대수에서 제외 */
    DONG_CNT[u[0]] = (DONG_CNT[u[0]] || 0) + 1;
    LINE_CNT[u[0] + '-' + rc] = (LINE_CNT[u[0] + '-' + rc] || 0) + 1;
    if (u[3] !== '244') {
      var lk = u[0] + '-' + rc;
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
function stateOf(k) { return primaryOf(statesOf(k)); }
function primaryOf(ss) { var a = cleanStates(ss); return a.length ? a[0] : 'none'; }
function statesOf(k) { return statesFromNote(S.notes[k]); }
function memoOf(k) { var n = S.notes[k]; return n && n.memo ? n.memo : ''; }
function hasInfoNote(n) {
  if (!n) return false;
  if (str(n.memo) || str(n.owner) || str(n.tenant) || str(n.phone) || str(n.tphone) || str(n.end) || n.urgent || n.op) return true;
  var ps = pricesOf(n);
  return !!(str(ps.sale) || str(ps.premium) || str(ps.jeonse) || str(ps.wolse) || str(ps.etc) || str(n.price));
}
function hasInfo(k) {
  return hasInfoNote(S.notes[k]);
}
/* 색을 고르지 않고 메모만 적은 호실도 빈 호실이 아니다.
   (빈 값을 저장하면 서버에서 행을 지운다) */
function isEmpty(n) { return !n || (!hasInfoNote(n) && statesFromNote(n).length === 0); }
function isUrgent(k) {
  var n = S.notes[k];
  if (!n) return false;
  if (n.urgent) return true;
  return URG_RE.test(str(n.memo) + ' ' + primaryPrice(n));
}
/* 타부동산 — 급매와 중복해서 표시할 수 있다 */
function isOtherProp(k) { var n = S.notes[k]; return !!(n && n.op); }
function fieldText(k) {
  var n = S.notes[k]; if (!n) return '';
  var ss = statesFromNote(n), rental = (ss.indexOf('jeonse') >= 0 || ss.indexOf('wolse') >= 0), parts = [];
  var ps = pricesOf(n), pt = priceText(ss, ps);
  if (pt) parts.push(pt);
  if (str(n.owner)) parts.push((rental ? '임대인 ' : '소유주 ') + str(n.owner));
  if (str(n.phone)) parts.push((rental ? '임대인 연락처 ' : '연락처 ') + str(n.phone));
  if (str(n.tenant)) parts.push('임차인 ' + str(n.tenant));
  if (str(n.tphone)) parts.push('임차인 연락처 ' + str(n.tphone));
  if (str(n.end)) parts.push('만기 ' + str(n.end));
  if (n.op) parts.push('타부동산');
  return parts.join(' · ');
}

/* ============================================================
   저장소 — 데모(브라우저) / 운영(Supabase)
   ============================================================ */
function noteToRow(k, n) {
  var cx = cxByKey(k), ss = statesFromNote(n), ps = pricesOf(n), prices = {}, any = false;
  PRICE_KEYS.forEach(function (p) {
    var v = str(ps[p]); if (v) { prices[p] = v; any = true; }
  });
  return {
    user_id: S.user.id,
    unit_key: k,
    complex: cx ? cx.id : 'centum',
    status: primaryOf(ss),
    /* 예전 앱·기존 데이터와 호환: status 는 대표 상태 하나만 담고,
       복합 상태(statuses)·상태별 금액(prices)·타부동산(other_prop)은 따로 둔다 */
    statuses: ss.length > 1 ? ss.join(',') : null,
    prices: any ? prices : null,
    other_prop: !!n.op,
    price: primaryPrice(n) || null,
    owner_name: str(n.owner) || null,
    tenant_name: str(n.tenant) || null,
    tenant_phone: str(n.tphone) || null,
    lease_end_date: str(n.end) || null,
    phone: str(n.phone) || null,
    memo: str(n.memo) || null,
    urgent: !!n.urgent
  };
}
function rowStates(r) {
  var ss = cleanStates(r.statuses);
  if (!ss.length) { var st = cleanState(r.status); if (st !== 'none') ss = [st]; }
  return ss;
}
function rowToNote(r) {
  var ss = rowStates(r), ps = (r.prices && typeof r.prices === 'object') ? r.prices : {}, out = {};
  PRICE_KEYS.forEach(function (p) { if (str(ps[p])) out[p] = str(ps[p]); });
  if (!Object.keys(out).length && str(r.price)) out[priceKeyOf(ss.length ? ss[0] : cleanState(r.status))] = str(r.price);
  return {
    s: ss.length ? ss[0] : 'none',
    ss: ss,
    ps: out,
    price: primaryPrice({ ss: ss, ps: out }),
    owner: str(r.owner_name),
    tenant: str(r.tenant_name),
    tphone: phStr(r.tenant_phone),
    end: str(r.lease_end_date).slice(0, 10),
    phone: phStr(r.phone),
    memo: str(r.memo),
    urgent: r.urgent ? 1 : 0,
    op: r.other_prop ? 1 : 0,
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
    var row = noteToRow(k, n);
    var res = await S.sb.from('listings')
      .upsert(row, { onConflict: 'user_id,unit_key' })
      .select('updated_at').single();
    if (res.error && /complex/i.test(res.error.message || '')) {
      /* 아직 complex 컬럼 마이그레이션 전이면 컬럼 없이 저장한다 */
      delete row.complex;
      res = await S.sb.from('listings').upsert(row, { onConflict: 'user_id,unit_key' })
        .select('updated_at').single();
    }
    if (res.error && /statuses|prices|other_prop/i.test(res.error.message || '')) {
      /* 복합 상태 컬럼 이전에 만든 DB여도 대표 색·금액만은 저장된다 */
      ['statuses', 'prices', 'other_prop'].forEach(function (c) { delete row[c]; });
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
        if (res.error && /statuses|prices|other_prop/i.test(res.error.message || '')) {
          /* 복합 상태 컬럼 이전에 만든 DB — 대표 상태·금액만 넣는다 */
          chunk.forEach(function (r) { ['statuses', 'prices', 'other_prop'].forEach(function (c) { delete r[c]; }); });
          res = await S.sb.from('listings').insert(chunk);
        }
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
  /* 동마다 실제로 있는 호수 열 — board.dongs[].lines 가 있으면 그 열만 그린다.
     우신골든스위트 서관동은 1·2·3호, 동관동은 3·5·6·7호처럼 두 동의 호수대가 달라서 쓴다. */
  var lines = (meta.lines && meta.lines.length) ? meta.lines.slice() : dongLines(cols);
  var ncols = lines.length;
  var dc = dongColor(d);
  var box = document.createElement('div');
  box.className = 'dong';
  box.dataset.d = d;
  box.id = 'd' + d;
  /* 동마다 라인(호수 열) 수가 다르면 폭도 그만큼 나눠 갖게 한다 —
     써밋리미티드남천(101동 6 · 102·103동 4 · 104·105동 5)처럼 동마다 라인이 다른 단지에서
     한 칸 폭이 동별로 달라 보이지 않고 모든 동의 호실 칸이 같은 크기로 선다.
     라인 수가 같은 단지는 전부 같은 값이라 지금까지 모양 그대로다. */
  box.style.flexGrow = ncols;
  box.style.setProperty('--dc', dc.c);
  box.style.setProperty('--dc-h', dc.h);
  box.style.setProperty('--dc-tint', dc.t);

  var html = '<table class="grid"><colgroup><col class="fc">' + '<col>'.repeat(ncols) + '</colgroup>';
  html += '<thead><tr><th class="dh" colspan="' + (ncols + 1) + '">' + dongLabel(d)
        + '<span class="ds">' + (DONG_CNT[d] || 0).toLocaleString('ko-KR') + '세대</span></th></tr></thead><tbody>';

  var maxTop = 0;
  DONGS.forEach(function (x) { maxTop = Math.max(maxTop, TOP[x]); });
  var specialRows = [];   /* 피난안전구역 같은 설비층 — 호실 실루엔을 거기서 끊지 않는다 */

  UNIT_FLOORS.forEach(function (f) {
    if (f > meta.top) {
      if (!CX.fillBlanks) return;
      html += '<tr class="fz"><th class="fc bz">' + f + '층</th><td class="blank" colspan="' + ncols + '"></td></tr>';
      return;
    }
    var sp = meta.special && meta.special[String(f)];
    if (sp && f !== BOTTOM) {
      specialRows.push(f);
      html += '<tr><th class="fc evac">' + f + '층</th><td class="evac" colspan="' + ncols + '">' + esc(sp) + '</td></tr>';
      return;
    }
    var tr = '<tr><th class="fc">' + f + '층</th>';
    for (var li = 0; li < ncols; li++) {
      var h = lines[li];
      var u = RIDX.get(K(d, h, f));
      if (u) {
        var span = (u.t === '244') ? 2 : 1;
        var uh = u.h;                       /* 실제 호수 — 그리는 열과 다를 수 있다(3803호 → 6호 열) */
        var ho = hoNum(f, uh);
        /* 호실 칸은 미등록이면 순백(#ffffff). 타입·평형 색은 각 동 맨 아래 '타입' 행에만 넣는다.
           상태 색(매매·전세·월세·보류)과 급매 테두리는 paintCell 이 붙이는 클래스로만 칠한다. */
        tr += '<td class="c" colspan="' + span + '" data-k="' + K(d, uh, f) + '" data-d="' + d
            + '" data-ho="' + uh + '" data-f="' + f + '" data-t="' + u.t + '"'
            + ' aria-label="' + dongLabel(d) + ' ' + ho + '호 ' + typeWord(u.t) + '"><span class="num">' + ho + '</span></td>';
        if (span === 2) li++;
      } else {
        tr += '<td class="fx"></td>';
      }
    }
    html += tr + '</tr>';
  });

  /* 저층부 (단지별) */
  if (CX.id === 'ipark') {
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + ncols + '">판매시설 및 주민공동시설</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">판매시설 및 주민공동시설</td></tr>';
  } else if (CX.id === 'zenith') {
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + ncols + '">판매시설 · 공용부</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '로비 · 판매시설') + '</td></tr>';
  } else if (CX.id === 'adellis') {
    /* 오피스텔 저층부 — 네이버 단지정보와 같이 1~3층은 '필로티 및 기타공간' */
    html += '<tr><th class="fc">3층</th><td class="fx under" colspan="' + ncols + '">필로티 및 기타공간</td></tr>';
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '필로티 및 기타공간') + '</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '필로티 및 기타공간') + '</td></tr>';
  } else if (CX.id === 'summit') {
    /* 써밋리미티드남천 저층부 — 1~3층은 판매시설·필로티·부대복리시설, 세대는 4층부터 */
    html += '<tr><th class="fc">3층</th><td class="fx under" colspan="' + ncols + '">부대복리시설 · 필로티</td></tr>';
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '판매시설') + '</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '판매시설') + '</td></tr>';
  } else if (CX.id === 'venuv') {
    /* 베뉴브해운대 저층부 — 1층은 판매시설·필로티·관리사무소, 세대는 2층부터 */
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '판매시설 · 필로티') + '</td></tr>';
  } else if (CX.id === 'trump_apt' || CX.id === 'trump_ot') {
    /* 트럼프월드마린 — 1·2층은 필로티 및 기타공간, 세대는 3층부터 */
    html += '<tr><th class="fc">2층</th><td class="fx under" colspan="' + ncols + '">필로티 및 기타공간</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '필로티 및 기타공간') + '</td></tr>';
  } else if (CX.id === 'wooshin') {
    /* 우신골든스위트 — 1층 상가, 2~3층 부대복리시설(헬스장·수영장·연회실), 세대는 4층부터 */
    html += '<tr><th class="fc">3층</th><td class="fx under" colspan="' + ncols + '">' + (F1_LABEL[d] || '부대복리시설') + '</td></tr>';
    html += '<tr><th class="fc">2층</th><td class="fx under" colspan="' + ncols + '">' + (F1_LABEL[d] || '부대복리시설') + '</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">상가</td></tr>';
  } else {
    html += '<tr><th class="fc">4층</th><td class="fx">필로티</td><td class="fx">필로티</td><td class="fx">필로티</td>'
          + '<td class="fx lobby" colspan="2">로비</td><td class="fx">필로티</td></tr>';
    html += '<tr><th class="fc">3층</th><td class="fx under" colspan="' + ncols + '">부대복리시설</td></tr>';
    html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="' + ncols + '">판매시설</td></tr>';
    html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="' + ncols + '">' + (F1_LABEL[d] || '판매시설') + '</td></tr>';
  }

  html += '<tr class="sum dongrow"><th>동</th><td colspan="' + ncols + '">' + dongLabel(d)
        + '<span class="sub">(' + (DONG_CNT[d] || 0).toLocaleString('ko-KR') + '세대)</span></td></tr>';

  html += '<tr class="sum typerow"><th>타입</th>';
  for (var lj = 0; lj < ncols; lj++) {
    var j = lines[lj];
    var info = lineTypeInfo(d + '-' + j);
    /* 타입 줄이 한 칸에 다 들어가지 않는 단지 — 라인 전체와 다른 타입이 한두 세대만 섞인 줄은
       그 타입을 작은 배지로 붙인다(센텀르엘 101동 등 1호 40F 244).
       써밋리미티드남천은 '142A/227A'처럼 긴 두 타입이 6칸짜리 동에서 잘리므로
       101동 1·2호 40F 227A · 102·103동 1·2호 38F 243B~E 를 배지로 뺐다. */
    var badge = '';
    if (CX.id === 'centum' && j === 1) badge = '<i class="b244">244</i>';
    else if (CX.id === 'summit' && SUMMIT_LINE_BADGE[d + '-' + j]) badge = '<i class="b244 bph">' + SUMMIT_LINE_BADGE[d + '-' + j] + '</i>';
    if (!info) {
      html += '<td>' + badge + '</td>';
    } else if (!info.split || badge) {
      /* 배지가 있으면 라인을 대표하는 낮은 타입을 한 색으로 칠하고, 섞인 타입은 배지·툴팁에 남긴다 */
      var tOne = info.split ? info.low : info.t;
      var c = TYPE_COLOR[tOne] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
      html += '<td style="background:' + c.bg + ';border-color:' + c.bd + ';color:' + c.fg + '" title="' + dongLabel(d) + ' ' + j + '호 라인 · ' + typeWord(tOne)
            + (info.split ? ' · 고층부 ' + typeWord(info.high) + (info.more ? ' · 사이 ' + info.more : '') : '') + '">'
            + rowTypeLabel(tOne) + badge + '</td>';
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
  for (var l1 = 0; l1 < ncols; l1++) html += '<td>' + lines[l1] + '호</td>';
  html += '</tr>';
  html += '<tr class="sum cntrow"><th>세대수</th>';
  for (var l2 = 0; l2 < ncols; l2++) html += '<td>' + (LINE_CNT[d + '-' + lines[l2]] || 0) + '</td>';
  html += '</tr>';

  html += '</tbody></table>';
  box.innerHTML = html;
  box.querySelectorAll('td.c[data-k]').forEach(function (td) { cellMap.set(td.dataset.k, td); });
  return box;
}

/* 동 구분은 .dong 카드의 바깥 사각형 테두리·동 제목·동 이름 띠만으로 한다.
   (2026-11-24 사용자 요청) 예전에는 호실이 없는 안쪽 빈 공간마다 동 색 2px 선을
   그려 건물 내부에 세로 줄무늬·네모가 생겼으므로 그 계산(markSilhouette)을 없췄다. */

var built = false;
function buildBoard() {
  if (built) return;
  boardEl.innerHTML = '';
  cellMap.clear();
  DONGS.forEach(function (d) { boardEl.appendChild(buildDong(d)); });

  var types = Array.from(new Set((BOARD.units || []).map(function (u) { return u[3]; })))
    .sort(function (a, b) {
      /* 숫자 평형은 작은 것부터, 펜트하우스(PH)처럼 숫자가 아닌 타입은 맨 뒤로 */
      var na = parseInt(a, 10), nb = parseInt(b, 10);
      if (isNaN(na) || isNaN(nb)) {
        if (isNaN(na) && isNaN(nb)) return String(a).localeCompare(String(b));
        return isNaN(na) ? 1 : -1;
      }
      return (na - nb) || String(a).localeCompare(String(b));
    });
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
function paintOther(td, on) {
  var el = td.querySelector('.op');
  if (on) {
    if (!el) { el = document.createElement('i'); el.className = 'op'; el.textContent = '✓'; td.appendChild(el); }
  } else if (el) el.remove();
  td.classList.toggle('is-other', !!on);
}
/* 2~3색 대각선 분할 — 지금 쓰는 매매·전세·월세 색을 그대로 나눈다 */
function stateGradient(ss) {
  var a = cleanStates(ss), c = a.map(function (s) { return ST_COLOR[s] || '#ffffff'; });
  if (c.length === 2) return 'linear-gradient(135deg,' + c[0] + ' 50%,' + c[1] + ' 50%)';
  if (c.length >= 3) return 'linear-gradient(135deg,' + c[0] + ' 0 33.33%,' + c[1] + ' 33.33% 66.66%,' + c[2] + ' 66.66% 100%)';
  return '';
}
function paintCell(k) {
  var td = cellMap.get(k); if (!td) return;
  var ss = statesOf(k);
  td.classList.remove('s-sale', 's-jeonse', 's-wolse', 's-done', 'st-multi');
  if (ss.length === 1) {
    td.classList.add('s-' + ss[0]);
    td.style.background = '';
    td.style.color = '';
  } else if (ss.length > 1) {
    /* 여러 상태면 칸 배경을 대각선으로 나눈다 (글자색은 기본색) */
    td.classList.add('st-multi');
    td.style.background = stateGradient(ss);
    td.style.color = '#16202b';
  } else {
    td.style.background = '';
    td.style.color = '';
  }
  paintUrgent(td, isUrgent(k));
  paintOther(td, isOtherProp(k));
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
  var ss = statesOf(td.dataset.k);
  /* 복합 매물은 고른 상태가 하나라도 들어 있으면 함께 보인다 */
  if ((f.st === 'sale' || f.st === 'jeonse' || f.st === 'wolse' || f.st === 'done')
      && ss.indexOf(f.st) < 0) return false;
  if (f.st === 'urgent' && !isUrgent(td.dataset.k)) return false;
  if (f.st === 'memo' && !hasInfo(td.dataset.k)) return false;
  if (f.q) {
    var k = td.dataset.k;
    var hay = norm(dongLabel(td.dataset.d) + td.dataset.ho + '호' + td.dataset.f + '층'
                 + hoNum(td.dataset.f, td.dataset.ho) + ' ' + k + ' ' + statesLabel(ss) + ' '
                 + memoOf(k) + ' ' + fieldText(k) + (isUrgent(k) ? ' 급매' : '') + (isOtherProp(k) ? ' 타부동산' : ''));
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
  if (LIST_ON) renderList();
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
    var ss = statesOf(k);
    /* 복합 매물은 들어 있는 상태마다 함께 센다 (매매+전세 → 매매1·전세1) */
    ss.forEach(function (s) { if (c[s] != null) c[s]++; });
    if (hasInfo(k)) c.memo++;
  });
  $('c-sale').textContent = c.sale.toLocaleString('ko-KR');
  $('c-jeonse').textContent = c.jeonse.toLocaleString('ko-KR');
  $('c-wolse').textContent = c.wolse.toLocaleString('ko-KR');
  $('c-done').textContent = c.done.toLocaleString('ko-KR');
  $('c-memo').textContent = c.memo.toLocaleString('ko-KR');
  var mine = 0;
  Object.keys(S.notes).forEach(function (k) {
    if (!(hasInfoNote(S.notes[k]) || statesOf(k).length)) return;
    if (HOME_ON || noteCxId(k) === CX.id) mine++;
  });
  $('c-seed').textContent = mine.toLocaleString('ko-KR');
  if (HOME_ON) { $('c-show').textContent = '–'; return; }
  var shown = 0, f = curFilter();
  cellMap.forEach(function (td, k) { if (isMatch(td, stateOf(k), f)) shown++; });
  $('c-show').textContent = shown.toLocaleString('ko-KR');
}

/* ============================================================
   목록 보기 — 지금 검색·필터에 맞는 매물을 글자로 (2026-11-25)
   평소에는 닫혀 있어 배치표를 가리지 않는다. 줄을 누르면 그 호실 메모장이 열린다.
   ============================================================ */
var LIST_ON = false;
function noteHay(k, d, h, f) {
  return norm(dongLabel(d) + h + '호' + f + '층' + hoNum(f, h) + ' ' + k + ' '
    + statesLabel(statesOf(k)) + ' ' + memoOf(k) + ' ' + fieldText(k)
    + (isUrgent(k) ? ' 급매' : '') + (isOtherProp(k) ? ' 타부동산' : ''));
}
function listRows() {
  var f = curFilter(), out = [];
  (BOARD.units || []).forEach(function (u) {
    var k = K(u[0], u[1], u[2]), n = S.notes[k];
    if (!n || !(hasInfoNote(n) || statesFromNote(n).length)) return;
    if (f.dg && String(u[0]) !== String(f.dg)) return;
    if (f.ty && u[3] !== f.ty) return;
    var ss = statesFromNote(n);
    if ((f.st === 'sale' || f.st === 'jeonse' || f.st === 'wolse' || f.st === 'done') && ss.indexOf(f.st) < 0) return;
    if (f.st === 'urgent' && !isUrgent(k)) return;
    if (f.st === 'memo' && !hasInfo(k)) return;
    if (f.q && noteHay(k, u[0], u[1], u[2]).indexOf(f.q) < 0) return;
    out.push({ k: k, u: u, n: n, ss: ss });
  });
  out.sort(function (a, b) { return (a.u[0] - b.u[0]) || (b.u[2] - a.u[2]) || (a.u[1] - b.u[1]); });
  return out;
}
function filterSummary(f) {
  var stk = { sale: '매매', jeonse: '전세', wolse: '월세', done: '보류·완료', urgent: '급매', memo: '메모있음' };
  var parts = [];
  if (f.st !== 'all') parts.push(stk[f.st] || '');
  if (f.ty) parts.push(typeFull(f.ty));
  if (f.dg) parts.push(dongLabel(f.dg));
  if (f.q) parts.push('"' + $('q').value.trim() + '"');
  return parts.filter(Boolean).join(' · ');
}
function renderList() {
  var el = $('listpanel'); if (!el) return;
  if (!LIST_ON) { el.hidden = true; return; }
  var rows = listRows(), sum = filterSummary(curFilter());
  var head = '<div class="lp-head"><b>' + esc(CX.name) + '</b><span>' + esc(sum || '전체 매물') + '</span>'
    + '<span class="lp-n">' + rows.length.toLocaleString('ko-KR') + '호실</span></div>';
  if (!rows.length) {
    el.innerHTML = head + '<div class="lp-empty">조건에 맞는 매물이 없습니다.</div>';
    return;
  }
  el.innerHTML = head + '<div class="lp-list">' + rows.map(function (r) {
    var u = r.u, k = r.k, n = r.n, ss = r.ss;
    var price = priceText(ss, pricesOf(n)) || str(n.price);
    var who = str(n.owner) ? (leaseState(n) ? '임대인 ' : '소유주 ') + esc(str(n.owner)) : '';
    var ph = str(n.phone);
    var line2 = [who, ph ? esc(ph) : ''].filter(Boolean).join(' · ');
    var memo = memoFlat(memoOf(k));
    return '<button type="button" class="lp-row" data-k="' + k + '">'
      + '<span class="lp-l1"><b>' + esc(dongLabel(u[0]) + ' ' + hoNum(u[2], u[1]) + '호') + '</b>'
      + (ss.length ? ss.map(function (s) { return '<i class="lp-st s-' + s + '">' + ST_NAME[s] + '</i>'; }).join('')
                   : '<i class="lp-st">미확인</i>')
      + (isUrgent(k) ? '<i class="lp-u">(급)</i>' : '')
      + (isOtherProp(k) ? '<i class="lp-op">✓타부동산</i>' : '')
      + (price ? '<em class="lp-price">' + esc(price) + '</em>' : '')
      + '</span>'
      + (line2 ? '<span class="lp-l2">' + line2 + '</span>' : '')
      + (memo ? '<span class="lp-l3">' + esc(memo) + '</span>' : '')
      + '</button>';
  }).join('') + '</div>';
}
function setList(on) {
  LIST_ON = !!on;
  var b = $('btn-list');
  if (b) { b.classList.toggle('on', LIST_ON); b.setAttribute('aria-pressed', LIST_ON ? 'true' : 'false'); }
  var el = $('listpanel');
  if (el) el.hidden = !LIST_ON;
  $('board').hidden = LIST_ON;
  $('tabs').hidden = LIST_ON;
  if (LIST_ON) { renderList(); window.scrollTo(0, 0); }
  else if (S.ready) applyZoom();
}

/* ============================================================
   툴팁 (PC)
   ============================================================ */
var tipEl = $('tip'), tipOn = false;
function showTip(td, x, y) {
  var d = td.dataset.d, h = td.dataset.ho, f = td.dataset.f, t = td.dataset.t, key = td.dataset.k;
  var u = IDX.get(key); if (!u) return;
  var ss = statesOf(key), st = primaryOf(ss), sup = unitSup(u), jeon = unitJeon(u);
  var tname = typeFull(t);
  var memo = memoFlat(memoOf(key));
  var ft = fieldText(key), urg = isUrgent(key), op = isOtherProp(key);
  /* 복합 상태면 색 두세 개를 나란히 견다 */
  var sw = (ss.length ? ss : ['none']).map(function (s) {
    return '<em style="background:' + ST_COLOR[s] + ';border:1px solid ' + ST_BORDER[s] + '"></em>';
  }).join('');
  tipEl.innerHTML = '<b>' + dongLabel(d) + ' ' + hoNum(f, h) + '호</b>' + (urg ? ' <em class="uu">(급)</em>' : '')
    + (op ? ' <em class="uu">✓타부동산</em>' : '')
    + ' · ' + tname + (CX.price ? ' · <i>' + priceLabelOf(u) + '</i>' : '')
    + '<span class="stx">' + sw + (ss.length > 1 ? '<em class="stx-k">' : '') + statesLabel(ss) + (ss.length > 1 ? '</em>' : '') + '</span>'
    + (ft ? '<em class="fl">' + esc(ft) + '</em>' : '')
    + '<em class="ar">공급 <b>' + sup.toFixed(2) + '㎡</b> (' + py(sup) + '평) · 전용 <b>' + jeon.toFixed(2) + '㎡</b> (' + py(jeon) + '평)</em>'
    + (memo ? '<s>' + esc(memo.slice(0, 110)) + '</s>' : '')
    + '<u>한 번 누르면 메모장 · 색상 · 계약금</u>';
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
    mcJn = $('mc-jn'), mcGye = $('mc-gye'), mmWrap = $('mc-memos'), mcSaved = $('mc-saved'),
    mcStat = $('mc-stat'), mcFields = $('mc-fields'), mcUrg = $('mc-urg');
var mcOp = $('mc-op');
var mcIn = { owner: $('mc-owner'), phone: $('mc-phone'), tenant: $('mc-tenant'), tphone: $('mc-tphone'), end: $('mc-end') };
/* 금액 칸 — 상태별로 따로 적는다. mc-price-in 은 매매가이자, 상태가 없을 때의 '금액' 칸이다 */
var mcP = { sale: $('mc-price-in'), premium: $('mc-price-premium'), jeonse: $('mc-price-jeonse') };
/* 월세 — 보증금과 월세를 두 칸으로 나누어 적는다 */
var mcW = { dep: $('mc-wolse-dep'), mon: $('mc-wolse-mon') };
var mcPRows = { sale: $('mc-row-sale'), jeonse: $('mc-row-jeonse'), wolse: $('mc-row-wolse') };
function priceInputs() { return [mcP.sale, mcP.premium, mcP.jeonse, mcW.dep, mcW.mon]; }
/* DB에는 예전처럼 "보증금 / 월세" 한 문자열로 남긴다(기존 매물·검색·백업과 그대로 호환). */
function wolseVal() {
  var d = str(mcW.dep.value), m = str(mcW.mon.value);
  if (d && m) return d + ' / ' + m;
  if (d) return d;
  if (m) return '/ ' + m;
  return '';
}
function splitWolse(v) {
  var s = str(v), i = s.indexOf('/');
  if (i < 0) return { dep: s, mon: '' };
  return { dep: s.slice(0, i).trim(), mon: s.slice(i + 1).trim() };
}

var cur = null, curTd = null, selTd = null, curBase = '', saveT = null, justOpened = false, joT = null, posT = null;

/* ---------- 소유주 연락처 여러 개 ----------
   화면은 입력칸을 여러 개로 나누지만, 저장은 예전처럼 owner_phone 한 칸에
   '010-1111-1111, 010-2222-2222' 처럼 ', '로 이어서 넣는다(DB 스키마 그대로). */
function extRows() { return Array.prototype.slice.call(document.querySelectorAll('#mc-ext-phone .mc-ext')); }
function extInputs() { return extRows().map(function (r) { return r.querySelector('.mc-extp'); }); }
function extNameInputs() { return extRows().map(function (r) { return r.querySelector('.mc-extn'); }); }
function extPhoneList() {
  return extInputs().map(function (i) { return i.value.trim(); });
}
function extNameList() {
  return extNameInputs().map(function (i) { return i.value.trim(); });
}
function phoneAll() {
  var arr = [mcIn.phone.value.trim()].concat(extPhoneList());
  return arr.filter(function (v) { return !!v; }).join(', ');
}
/* 이름도 예전처럼 owner_name 한 칸에 ', '로 이어 저장한다 */
function ownerAll() {
  var arr = [mcIn.owner.value.trim()].concat(extNameList());
  return arr.filter(function (v) { return !!v; }).join(', ');
}
/* 저장 여부를 가릴 때 쓰는 지문 — 빈 칸을 하나 더 눌러도 ‘바뀜’으로 보지 않는다 */
function contactSig() {
  var names = [mcIn.owner.value.trim()].concat(extNameList());
  var phones = [mcIn.phone.value.trim()].concat(extPhoneList());
  while (names.length > 1 && !names[names.length - 1]) names.pop();
  while (phones.length > 1 && !phones[phones.length - 1]) phones.pop();
  return names.join('|') + '‖' + phones.join('|');
}
function splitPhones(v) {
  return String(v == null ? '' : v).split(/\s*,\s*/).map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
}
/* 이름은 ', ' 말고 '/'·'·'로 이어 적힌 옛 자료도 한 사람씩 나눈다 */
function splitNames(v) {
  return String(v == null ? '' : v).split(/\s*[,/·]\s*/).map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
}
/* 추가한 행 — 이름과 연락처를 함께 적는다 */
function addPhoneRow(val, name) {
  var row = document.createElement('div');
  row.className = 'mc-ext';
  row.innerHTML = '<input type="text" class="mc-extn" placeholder="이름" autocomplete="off">'
    + '<input type="tel" class="mc-extp" inputmode="tel" placeholder="010-0000-0000" autocomplete="off">'
    + '<button type="button" class="mc-extx" aria-label="이 연락처 지우기" title="이 연락처 지우기">×</button>';
  var nin = row.querySelector('.mc-extn'), inp = row.querySelector('.mc-extp');
  if (name) nin.value = name;
  if (val) inp.value = fmtPhone(val);
  nin.addEventListener('input', function () { onEditorChanged(); });
  inp.addEventListener('input', function () {
    if (RO) return;
    var v = fmtPhone(inp.value);
    if (v !== inp.value) { inp.value = v; try { inp.setSelectionRange(v.length, v.length); } catch (e) {} }
    onEditorChanged();
  });
  inp.addEventListener('blur', function () { if (inp.value !== fmtPhone(inp.value)) inp.value = fmtPhone(inp.value); });
  row.querySelector('button').onclick = function () {
    if (RO) return;
    row.remove(); onEditorChanged();
  };
  $('mc-ext-phone').appendChild(row);
  return nin;
}
function renderExtPhones(list, names) {
  $('mc-ext-phone').innerHTML = '';
  var ph = list || [], nm = names || [], len = Math.max(ph.length, nm.length);
  for (var i = 0; i < len; i++) addPhoneRow(ph[i] || '', nm[i] || '');
}

function curSig() {
  var o = { memo: memoText(), ct: contactSig() };
  FIELDS.forEach(function (f) { if (f !== 'phone' && f !== 'owner') o[f] = mcIn[f].value; });
  priceInputs().forEach(function (el, i) { o['p' + i] = el.value; });
  return JSON.stringify(o);
}
function curDirty() { return !!cur && curSig() !== curBase; }
function readFields() {
  var o = {};
  FIELDS.forEach(function (f) {
    if (f === 'phone' || f === 'owner') return;
    var v = mcIn[f].value.trim(); if (v) o[f] = v;
  });
  var ow = ownerAll(); if (ow) o.owner = ow;
  var ph = phoneAll();
  if (ph) o.phone = ph;
  return o;
}
function isGenericState(ss) {
  var arr = cleanStates(ss);
  return arr.length === 0 || (arr.length === 1 && arr[0] === 'done');
}
/* 지금 고른 상태의 금액 칸만 읽는다 — 숨은 상태의 금액은 적지 않은 것으로 친다 */
function readPrices(ss) {
  var o = {}, arr = cleanStates(ss);
  if (arr.indexOf('sale') >= 0) {
    o.sale = mcP.sale.value.trim();
    /* 분양권 단지에서만 프리미엄을 따로 적는다 */
    if (CX.premium) o.premium = mcP.premium.value.trim();
  } else if (isGenericState(arr)) o.etc = mcP.sale.value.trim();
  if (arr.indexOf('jeonse') >= 0) o.jeonse = mcP.jeonse.value.trim();
  if (arr.indexOf('wolse') >= 0) o.wolse = wolseVal();
  return o;
}
/* 상태별 금액을 정리한다. 지금 고른 상태에서 빈 칸이면 그 금액만 지우고,
   잠시 해제한 상태의 금액은 지우지 않는다(다시 고르면 그대로 살아난다). */
function applyPrices(n, ss) {
  var ps = pricesOf(n), kept = {}, got = readPrices(ss);
  PRICE_KEYS.forEach(function (p) { var v = str(ps[p]); if (v) kept[p] = v; });
  Object.keys(got).forEach(function (p) { if (got[p]) kept[p] = got[p]; else delete kept[p]; });
  n.ps = kept;
  n.price = primaryPrice(n);
}
function fillEditor(k) {
  var n = S.notes[k] || {}, ss = statesFromNote(n), ps = pricesOf(n), gen = isGenericState(ss);
  FIELDS.forEach(function (f) {
    if (f === 'phone') return;
    var v = str(n[f]);
    mcIn[f].value = (f === 'tphone') ? fmtPhone(v) : v;
  });
  /* 이름·연락처는 순서대로 짝을 맞춘다 (첫 사람은 기본 칸, 나머지는 추가 행) */
  var nm = splitNames(n.owner), ph = splitPhones(n.phone);
  mcIn.owner.value = nm.length ? nm[0] : '';
  mcIn.phone.value = ph.length ? fmtPhone(ph[0]) : '';
  renderExtPhones(ph.slice(1), nm.slice(1));
  /* 옛 금액('2억 5,000')도 만원 숫자('25,000')로 바꿔 보여 준다.
     ps 없이 price 한 칸에만 적혀 있던 옛 메모도 그 금액으로 불러온다. */
  var legacy = str(n.price);
  var saleRaw = ss.indexOf('sale') >= 0 ? str(ps.sale) : (gen ? str(ps.etc) : '');
  if (!saleRaw && legacy && (ss.indexOf('sale') >= 0 || gen)) saleRaw = legacy;
  var jeonRaw = str(ps.jeonse) || (ss.indexOf('jeonse') >= 0 && !str(ps.sale) ? legacy : '');
  var wolseRaw = str(ps.wolse) || (ss.indexOf('wolse') >= 0 && !str(ps.jeonse) ? legacy : '');
  mcP.sale.value = fmtMan(saleRaw);
  mcP.premium.value = fmtMan(str(ps.premium));
  mcP.jeonse.value = fmtMan(jeonRaw);
  var w = splitWolse(wolseRaw);
  mcW.dep.value = fmtMan(w.dep); mcW.mon.value = fmtMan(w.mon);
  renderMemo(memoOf(k));
  /* 저장할 때 비교할 직전 저장본 */
  curBase = curSig();
  setStatusUI(ss);
  setUrgUI(isUrgent(k));
  setOpUI(isOtherProp(k));
}
function flashSaved(text) {
  mcSaved.textContent = text || '저장됨';
  mcSaved.classList.add('on');
  clearTimeout(saveT);
  if (text !== '저장 실패') saveT = setTimeout(function () { mcSaved.classList.remove('on'); }, 1400);
}
function setUrgUI(on) { mcUrg.dataset.on = on ? '1' : '0'; }
function setOpUI(on) { mcOp.dataset.on = on ? '1' : '0'; }
/* 매매·전세·월세는 여러 개를 함께 켤 수 있고, 기본·보류·완료는 단독이다 */
function setStatusUI(ss) {
  var arr = cleanStates(ss);
  document.querySelectorAll('#mc-stat button').forEach(function (b) {
    var s = b.dataset.s;
    b.classList.toggle('on', s === 'none' ? arr.length === 0 : arr.indexOf(s) >= 0);
  });
  syncFieldUI(arr);
}
/* 다른 회원의 배치표를 볼 때 메모장을 읽기 전용으로 바꾸고, 돌아오면 되돌린다 */
function applyROView() {
  var ro = !!RO;
  mc.classList.toggle('ro', ro);
  FIELDS.map(function (f) { return mcIn[f]; }).concat(priceInputs()).concat(extInputs()).concat(extNameInputs()).forEach(function (el) {
    el.readOnly = ro;
    if (ro) el.setAttribute('tabindex', '-1'); else el.removeAttribute('tabindex');
  });
  mmSetRO(ro);
  document.querySelectorAll('#mc-stat button').forEach(function (b) { b.disabled = ro; });
  mcUrg.disabled = ro; mcOp.disabled = ro;
  $('mc-del').hidden = ro;
  $('mc-save').hidden = ro;
  var ap = $('mc-add-phone'); if (ap) ap.hidden = ro;
  if (ro) { mcSaved.textContent = '읽기 전용 · 보기만'; mcSaved.classList.add('on'); }
  else { mcSaved.textContent = '저장됨'; mcSaved.classList.remove('on'); }
}
function syncFieldUI(ss) {
  var arr = cleanStates(ss), gen = isGenericState(arr), rental = (arr.indexOf('jeonse') >= 0 || arr.indexOf('wolse') >= 0);
  var show = {
    sale: arr.indexOf('sale') >= 0 || gen,
    jeonse: arr.indexOf('jeonse') >= 0,
    wolse: arr.indexOf('wolse') >= 0
  };
  Object.keys(mcPRows).forEach(function (p) { mcPRows[p].hidden = !show[p]; });
  mcFields.classList.toggle('rental', rental);
  /* 매매가·프리미엄 두 칸은 센텀르엘(분양권)에서 매매를 골랐을 때만 연다.
     다른 단지에는 '- P' 같은 표시 없이 '매매가' 한 칸만 둔다. */
  var prem = !!CX.premium && show.sale && !gen;
  $('mc-prem-wrap').hidden = !prem;
  var grid = $('mc-sale-grid');
  grid.classList.toggle('two', prem);
  grid.classList.toggle('sub', prem);
  $('mc-lb-price').textContent = gen ? '금액' : (prem ? '매매' : '매매가');
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
  if (cur && cur !== key) {
    /* 다른 호실로 옴길 때 저장하지 않은 내용이 있으면 먼저 묻는다 */
    if (curDirty()) { askUnsaved('move', function () { openCard(td); }); return; }
    hideCard();
  }
  /* 이미 열린 호실을 다시 누른 경우 — 적던 내용을 건드리지 않는다 */
  if (cur === key) { selectCell(td); return; }
  cur = key; curTd = td;
  selectCell(td); hideTip();

  var sup = unitSup(u), jeon = unitJeon(u);
  mcHo.textContent = dongLabel(u.d) + ' ' + hoNum(u.f, u.h) + '호';
  mcType.textContent = typeFull(u.t);
  var c = TYPE_COLOR[u.t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
  mcType.style.background = c.bg; mcType.style.borderColor = c.bd; mcType.style.color = c.fg;
  if (CX.price) {
    mcPrice.hidden = false;
    mcPrice.innerHTML = '<span class="mc-plabel">분양가</span>'
      + (hasPrice(u) ? won(u.p) : '<span class="nop">' + esc(noPriceText().replace(/^분양가\s*/, '')) + '</span>');
    mcGye.hidden = !hasPrice(u);
    if (hasPrice(u)) mcGye.innerHTML = '계약금 <b>5%</b> · <b>' + wonShort(Math.round(u.p * 0.05)) + '</b>';
    else mcGye.innerHTML = '';
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
  setTimeout(function () { if (!isNarrow() && !COARSE) mmFocusToday(); }, 90);
}
function closeCard(force) {
  if (!cur) return;
  if (!force && curDirty()) { askUnsaved('close', null); return; }
  hideCard();
}
/* 메모장만 닫는다(저장 없이). 열린 호실 표시는 그대로 두어 다시 누르기 쉽게 한다. */
function hideCard() {
  mc.classList.remove('on'); ov.classList.remove('on');
  cur = null; curTd = null;
}
/* ---------- 저장하지 않은 내용 확인 ---------- */
var unsEl = $('uns'), ov8 = $('ov8');
var unsCb = null, unsMode = 'move';
function askUnsaved(mode, cb) {
  unsMode = mode; unsCb = cb;
  $('uns-p').textContent = (mode === 'close')
    ? '저장하고 닫을까요? 저장하지 않으면 지금 적은 내용이 사라집니다.'
    : '저장하고 넘어갈까요? 저장하지 않으면 지금 적은 내용이 사라집니다.';
  $('uns-save').textContent = (mode === 'close') ? '저장하고 닫기' : '저장하고 이동';
  unsEl.classList.add('on'); ov8.classList.add('on');
}
function unsClose() { unsEl.classList.remove('on'); ov8.classList.remove('on'); unsCb = null; }
if (unsEl) {
  $('uns-save').onclick = function () {
    var cb = unsCb; saveNote(); unsClose(); hideCard(); if (cb) cb();
  };
  $('uns-drop').onclick = function () {
    var cb = unsCb; unsClose(); hideCard(); if (cb) cb();
  };
  $('uns-cancel').onclick = unsClose;
  ov8.onclick = unsClose;
}
/* 화면을 옴기는 동작(홈·다른 단지) 앞에 한 번 거른다 */
function leaveEditor(cb) {
  if (!cur) { cb(); return; }
  if (!curDirty()) { hideCard(); cb(); return; }
  askUnsaved('move', cb);
}
/* ---------- 저장 (메모장의 [저장] 버튼) ---------- */
function todayStamp() {
  /* 한국 시간(Asia/Seoul) 기준 오늘 — YYYY.MM.DD */
  try {
    var s = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return s.replace(/-/g, '.');
  } catch (e) {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }
}
/* ---------- 기타 메모 — 날짜마다 칸 ----------
   DB에는 예전처럼 "[YYYY.MM.DD]" 머리글을 단 한 덩이 글로 남기고(검색·백업·API 호환),
   화면에서는 날짜별 카드로 나누어 보여 준다. 저장할 때 날짜 순서대로 다시 합진다. */
var MM_RE = /\[\s*(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*\]/g;
function pad2(v) { v = String(v); return v.length >= 2 ? v : ('0' + v).slice(-2); }
function mmDateText(y, m, d) { return y + '.' + pad2(m) + '.' + pad2(d); }
/* 메모를 한 줄로 — 날짜 머리글은 "2026.11.10" 으로만 남긴다(툴팁·목록) */
function memoFlat(txt) {
  return String(txt == null ? '' : txt)
    .replace(/\[\s*(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*\]/g, function (all, y, m, d) {
      return mmDateText(y, m, d);
    })
    .replace(/\s*\n+\s*/g, ' · ').replace(/\s+/g, ' ').trim();
}
function parseMemo(txt) {
  var s = String(txt == null ? '' : txt).replace(/\r\n?/g, '\n');
  var out = { legacy: '', days: [] };
  if (!s.trim()) return out;
  MM_RE.lastIndex = 0;
  var m, marks = [];
  while ((m = MM_RE.exec(s))) marks.push({ at: m.index, end: MM_RE.lastIndex, date: mmDateText(m[1], m[2], m[3]) });
  if (!marks.length) { out.legacy = s.trim(); return out; }
  if (marks[0].at > 0) out.legacy = s.slice(0, marks[0].at).trim();
  marks.forEach(function (mk, i) {
    var stop = (i + 1 < marks.length) ? marks[i + 1].at : s.length;
    var body = s.slice(mk.end, stop).replace(/^\s+/, '').replace(/\s+$/, '');
    var hit = null;
    out.days.forEach(function (d) { if (d.date === mk.date) hit = d; });
    if (hit) { if (body) hit.body = hit.body ? hit.body + '\n' + body : body; }
    else out.days.push({ date: mk.date, body: body });
  });
  out.days.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return out;
}
/* 화면의 날짜 칸을 하나의 글로 합친다(저장할 값) */
function memoText() {
  var parts = [];
  Array.prototype.forEach.call(mmWrap.querySelectorAll('.mm-card'), function (c) {
    var ta = c.querySelector('textarea'); if (!ta) return;
    var body = String(ta.value == null ? '' : ta.value).replace(/\s+$/, '').replace(/^\s+/, '');
    if (!body) return;
    var d = c.getAttribute('data-date');
    parts.push(d ? ('[' + d + ']\n' + body) : body);
  });
  return parts.join('\n\n');
}
function mmTextareas() { return Array.prototype.slice.call(mmWrap.querySelectorAll('textarea')); }
function mmGrow(ta) {
  if (!ta) return;
  var max = Math.max(80, Math.round(window.innerHeight * (isNarrow() ? 0.26 : 0.3)));
  ta.style.height = 'auto';
  var h = Math.min(Math.max(ta.scrollHeight + 2, 40), max);
  ta.style.height = h + 'px';
  ta.style.overflowY = (ta.scrollHeight + 2 > max) ? 'auto' : 'hidden';
  if (!isNarrow()) schedulePlace();
}
function mmCard(date, body, isToday) {
  var card = document.createElement('div');
  card.className = 'mm-card' + (date ? '' : ' mm-od');
  if (date) card.setAttribute('data-date', date);
  var head = document.createElement('div'); head.className = 'mm-head';
  var lab = document.createElement('span'); lab.className = 'mm-date';
  if (date) {
    lab.textContent = '📅 ' + date;
    if (isToday) {
      lab.appendChild(document.createTextNode(' '));
      var now = document.createElement('i'); now.className = 'mm-now'; now.textContent = '오늘';
      lab.appendChild(now);
    }
  } else {
    lab.textContent = '기존 메모';
  }
  head.appendChild(lab);
  var x = document.createElement('button');
  x.type = 'button'; x.className = 'mm-x'; x.textContent = '×';
  x.title = date ? (date + ' 메모 지우기') : '기존 메모 지우기';
  x.setAttribute('aria-label', x.title);
  x.onclick = function () { mmClear(card); };
  head.appendChild(x);
  card.appendChild(head);
  var ta = document.createElement('textarea');
  ta.className = 'mm-ta'; ta.rows = 2; ta.spellcheck = false;
  ta.value = body || '';
  ta.placeholder = date ? '이 날짜의 매물·상담 내용' : '날짜 없이 적어 둔 메모';
  ta.addEventListener('input', function () { mmGrow(ta); onEditorChanged(); });
  card.appendChild(ta);
  return card;
}
function renderMemo(txt) {
  var data = parseMemo(txt), today = todayStamp(), hasToday = false;
  mmWrap.innerHTML = '';
  if (data.legacy) mmWrap.appendChild(mmCard('', data.legacy, false));
  data.days.forEach(function (d) {
    if (d.date === today) hasToday = true;
    mmWrap.appendChild(mmCard(d.date, d.body, d.date === today));
  });
  /* 오늘 칸은 늘 맨 아래에 비어(또는 이어 쓸 수 있게) 준비해 둔다 */
  if (!hasToday) mmWrap.appendChild(mmCard(today, '', true));
  mmTextareas().forEach(mmGrow);
  mmSetRO(!!RO);
}
function mmClear(card) {
  if (RO) return;
  var ta = card.querySelector('textarea'); if (!ta) return;
  var d = card.getAttribute('data-date');
  if (ta.value.trim() && !confirm((d ? d + ' 메모를' : '기존 메모를') + ' 지울까요?')) return;
  /* 오늘 칸은 늘 남기고 내용만 지운다 */
  if (d === todayStamp()) { ta.value = ''; mmGrow(ta); onEditorChanged(); return; }
  card.remove(); onEditorChanged();
}
function mmSetRO(ro) {
  mmTextareas().forEach(function (ta) {
    ta.readOnly = !!ro;
    if (ro) ta.setAttribute('tabindex', '-1'); else ta.removeAttribute('tabindex');
  });
}
/* 오늘 칸으로 커서를 옮긴다(새 메모를 바로 적게) */
function mmFocusToday() {
  var t = mmWrap.querySelector('.mm-card[data-date="' + todayStamp() + '"] textarea') || mmTextareas().pop();
  if (!t) return;
  try {
    t.focus({ preventScroll: true });
    var n = t.value.length;
    t.setSelectionRange(n, n);
  } catch (e) {}
  if (mmWrap.scrollHeight > mmWrap.clientHeight + 4) mmWrap.scrollTop = mmWrap.scrollHeight;
}
function saveNote() {
  if (!cur || RO) return false;
  if (!curDirty()) { flashSaved('저장됨'); return true; }
  writeNote(true);
  curBase = curSig();
  flashSaved('저장됨');
  scheduleFlush(120);
  return true;
}
function writeNote(force) {
  if (!cur || RO) return;
  var sig = curSig();
  if (!force && sig === curBase) return;
  var txt = memoText(), fld = readFields();
  var n = S.notes[cur] || { ss: [] }, ss = statesFromNote(n);
  n.memo = txt;
  FIELDS.forEach(function (f) { n[f] = fld[f] || ''; });
  n.ss = ss; n.s = primaryOf(ss);
  applyPrices(n, ss);
  if (isEmpty(n) && !n.urgent && !n.op) {
    delete S.notes[cur];
  } else {
    S.notes[cur] = n;
  }
  curBase = sig;
  paintCell(cur); updateCounts(); markDirty(cur);
}

mcStat.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b || !cur || RO) return;
  var n = S.notes[cur] || { ss: [] }, arr = statesFromNote(n), s = b.dataset.s;
  if (s === 'none') arr = [];
  else if (s === 'done') arr = (arr.length === 1 && arr[0] === 'done') ? [] : ['done'];
  else {
    /* 매매·전세·월세는 누를 때마다 켜고 끈다 */
    arr = arr.filter(function (x) { return x !== 'done'; });
    var i = arr.indexOf(s);
    if (i >= 0) arr.splice(i, 1); else arr.push(s);
    arr = cleanStates(arr);
  }
  n.ss = arr; n.s = primaryOf(arr);
  if (isEmpty(n) && !n.urgent && !n.op) delete S.notes[cur]; else S.notes[cur] = n;
  paintCell(cur); setStatusUI(arr); updateCounts(); markDirty(cur);
  flashSaved(arr.length > 1 ? '복합 상태 저장' : '색상 저장');
});
mcUrg.onclick = function () {
  if (!cur || RO) return;
  var n = S.notes[cur] || { ss: [] };
  var on = isUrgent(cur);
  n.urgent = on ? 0 : 1;
  S.notes[cur] = n;
  paintCell(cur); setUrgUI(isUrgent(cur)); updateCounts(); markDirty(cur);
  flashSaved(on ? '급매 해제' : '급매 표시');
  if (on && URG_RE.test(str(n.memo) + ' ' + primaryPrice(n))) toast('메모·금액에 적힌 급매 문구를 지우면 (급)이 사라집니다.');
};
/* 타부동산 — 급매와 따로·동시에 켤 수 있다 */
mcOp.onclick = function () {
  if (!cur || RO) return;
  var n = S.notes[cur] || { ss: [] };
  n.op = n.op ? 0 : 1;
  S.notes[cur] = n;
  paintCell(cur); setOpUI(isOtherProp(cur)); updateCounts(); markDirty(cur);
  flashSaved(n.op ? '타부동산 ✓ 표시' : '타부동산 해제');
};
/* 입력만으로는 저장하지 않는다 — 메모장 아래 [저장]을 눌러야 저장된다 */
function onEditorChanged() {
  if (RO) return;
  clearTimeout(saveT);
  mcSaved.textContent = '저장 버튼을 누르세요';
  mcSaved.classList.add('on');
}
FIELDS.forEach(function (f) {
  mcIn[f].addEventListener('input', onEditorChanged);
});
/* 금액 칸은 숫자만 받고, 입력하는 즉시 천 단위 콤마를 붙인다 (2026-11-26) */
function bindAmount(el) {
  el.addEventListener('input', function () {
    if (RO) return;
    var raw = el.value;
    var pos = (el.selectionStart == null) ? raw.length : el.selectionStart;
    var before = digitsOnly(raw.slice(0, pos)).length;
    /* 숫자가 아닌 글자는 바로 지운다. 타이핑 중에는 콤마만 다시 붙인다. */
    var d = digitsOnly(raw);
    var v = d ? Number(d).toLocaleString('ko-KR') : '';
    if (v !== raw) {
      el.value = v;
      var idx = 0, cnt = 0;
      while (idx < v.length && cnt < before) { if (/[0-9]/.test(v[idx])) cnt++; idx++; }
      try { el.setSelectionRange(idx, idx); } catch (e) {}
    }
    onEditorChanged();
  });
  /* 옛 방식('1억', '2억 5,000만')을 붙여 넣으면 만원 숫자로 바꾼다 */
  el.addEventListener('paste', function (e) {
    if (RO) return;
    var cd = e.clipboardData || window.clipboardData;
    var t = cd ? String(cd.getData('text') || '') : '';
    if (!/[억만]/.test(t)) return;
    e.preventDefault();
    var n = parseMan(t);
    if (n !== '') { el.value = Number(n).toLocaleString('ko-KR'); onEditorChanged(); }
  });
}
priceInputs().forEach(bindAmount);
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
/* 연락처 추가 — 소유주·임대인 번호를 두 명 이상 적을 수 있다 */
$('mc-add-phone').onclick = function () {
  if (!cur || RO) return;
  var inp = addPhoneRow('');
  onEditorChanged();
  try { inp.focus(); } catch (e) {}
};
$('mc-save').onclick = function () { saveNote(); };
$('mc-x').onclick = function () { closeCard(); };
/* 메모장 바깥 배경을 잘못 누른 것으로 닫히지 않는다 — 닫기는 × 버튼과 Esc 만 */
$('mc-del').onclick = function () {
  if (!cur || RO) return;
  if (!confirm('이 호실의 메모·금액·연락처·색상을 모두 지울까요?')) return;
  delete S.notes[cur];
  renderMemo(''); FIELDS.forEach(function (f) { mcIn[f].value = ''; });
  renderExtPhones([]);
  priceInputs().forEach(function (el) { el.value = ''; });
  curBase = curSig();
  paintCell(cur); setStatusUI('none'); setUrgUI(false); setOpUI(false); updateCounts(); markDirty(cur);
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
/* 창을 닫을 때는 따로 저장하지 않는다 — 저장은 메모장의 [저장] 버튼으로만 한다 */

/* ---------- 호실 클릭 (PC·모바일 모두 한 번에 열린다) ---------- */
boardEl.addEventListener('click', function (e) {
  var td = e.target.closest('td.c[data-k]');
  if (!td) return;
  selectCell(td);
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
/* 목록 보기 토글 — 평소 닫혀 있고, 누르면 지금 조건의 매물을 글자로 보여 준다 */
$('btn-list').onclick = function () { setList(!LIST_ON); };
$('listpanel').addEventListener('click', function (e) {
  var b = e.target.closest('.lp-row'); if (!b) return;
  var k = b.dataset.k;
  setList(false);
  var td = cellMap.get(k); if (!td) return;
  try { td.scrollIntoView({ block: 'center' }); } catch (e2) { try { td.scrollIntoView(); } catch (e3) {} }
  setTimeout(function () { openCard(td); }, 60);
});
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
/* 맞춤 배율 상한
   세대수가 많은 단지(센텀르엘 2,070 · 아이파크 1,631 · 제니스 1,788)는 늘 하던 그대로
   114%까지만 키운다. 반대로 아델리스(510세대·47층)처럼 층이 적어 표가 화면 위쪽만
   차지하고 아래가 비던 단지는 상한을 올려 화면 끝까지 채운다.
   (새 소규모 단지도 세대수 1,000 미만이거나 최고 55층 이하면 자동 적용) */
var FIT_CAP_BIG = 1.14, FIT_CAP_SMALL = 2.2;
function isSmallBoard() {
  var units = (BOARD && BOARD.meta && BOARD.meta.units) || 0;
  if (units && units < 1000) return true;
  var top = 0;
  DONGS.forEach(function (d) { top = Math.max(top, (DONG_META[d] && DONG_META[d].top) || 0); });
  return top > 0 && top <= 55;
}
function computeFit() {
  applyMetrics(1);
  void boardEl.offsetHeight;
  var bTop = boardEl.getBoundingClientRect().top + window.scrollY;
  var availH = window.innerHeight - (bTop - window.scrollY) - 9;
  var contentH = boardEl.getBoundingClientRect().height;
  if (!contentH || contentH < 50) return 1;
  var s = availH / contentH;
  var needW = (CX.id === 'zenith' ? (NCOLS * 21 + 30) : 138) * DONGS.length + 5 * Math.max(0, DONGS.length - 1), availW = window.innerWidth - 24;
  if (needW > availW) s = Math.min(s, availW / needW);
  s = Math.floor(s * 1000) / 1000;
  return Math.max(0.45, Math.min(isSmallBoard() ? FIT_CAP_SMALL : FIT_CAP_BIG, s));
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
/* 배율은 기억하지 않는다.
   새로고침·재접속·단지 이동 때는 언제나 '맞춤'으로 시작하고,
   +/−·100%·F·0 키는 지금 보고 있는 화면에서만 잠깐 쓰는 임시 조절이다.
   예전 버전이 남겨 둔 localStorage(cls.view) 값(예: {"zoom":100})은 지운다. */
function loadView() {
  VIEW.zoom = 'fit';
  try { localStorage.removeItem('cls.view'); } catch (e) {}
}
function saveView() { /* 이 화면에서만 — 저장하지 않는다 */ }
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
  var tail = isNarrow() ? '' : (CX.price ? ' · 분양가 · 색상' : ' · 면적 · 색상');
  $('guide-sub').innerHTML = (LIVE ? '' : '데모 모드 · ') + '호실을 <b>클릭</b>하면 메모장' + tail;
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
  Object.keys(S.notes).forEach(function (k) { if (hasInfo(k) || statesOf(k).length) out[k] = S.notes[k]; });
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
  var ss = cleanStates(raw.ss != null ? raw.ss : (raw.s === 'memo' ? '' : raw.s));
  var ps = {};
  if (raw.ps && typeof raw.ps === 'object') {
    PRICE_KEYS.forEach(function (p) { if (str(raw.ps[p])) ps[p] = str(raw.ps[p]); });
  }
  if (!Object.keys(ps).length && str(raw.price)) ps[priceKeyOf(ss.length ? ss[0] : 'none')] = str(raw.price);
  var n = {
    s: ss.length ? ss[0] : 'none',
    ss: ss,
    ps: ps,
    price: primaryPrice({ ss: ss, ps: ps }),
    op: raw.op || raw.other_prop ? 1 : 0,
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
    var n = S.notes[k] || {}, st = leaseState(n);
    if (!st) return;
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
  var name = (it.cx ? it.cx.name + ' ' : '') + dongLabel(it.u.d) + ' ' + hoNum(it.u.f, it.u.h, it.cx) + '호';
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
  ['106-4-52', { ss: ['sale'], ps: { sale: '2억 3,000' }, owner: '홍길동', phone: '010-2345-6789', memo: '매수 문의 2팀\n주말 방문 가능' }],
  ['106-3-41', { ss: ['jeonse'], ps: { jeonse: '1억 8,000 / 0' }, owner: '김정희', tenant: '이서준', phone: '010-8765-4321', memo: '11월 말 입주' }],
  ['105-5-33', { ss: ['wolse'], ps: { wolse: '5,000 / 120' }, owner: '박상철', tenant: '최유진', phone: '010-3333-2222', memo: '반려동물 가능' }],
  ['103-5-63', { ss: ['sale'], ps: { sale: '1억' }, owner: '골드', phone: '010-1111-2222', memo: '급매 / 손님 있을 때 연락', urgent: 1 }],
  ['102-4-31', { ss: ['done'], ps: { etc: '9,000' }, owner: '민충기', phone: '010-5555-6666', memo: '공동 매매 완료' }],
  ['101-4-40', { ss: ['sale'], ps: { sale: '1억 7,610' } }],
  /* 복합 상태(매매+전세 / 매매+전세+월세)와 타부동산 연습용 */
  ['104-2-45', { ss: ['sale', 'jeonse'], ps: { sale: '2억 9,000', jeonse: '1억 9,500' }, owner: '이정숙', phone: '010-3333-1111', memo: '매매·전세 동시 진행' }],
  ['105-1-31', { ss: ['sale', 'jeonse', 'wolse'], ps: { sale: '3억 4,000', jeonse: '2억 2,000 / 0', wolse: '1억 / 180' }, owner: '최영수', phone: '010-4444-2222', memo: '매매·전세·월세 모두 열어 둠' }],
  ['102-3-51', { ss: ['sale'], ps: { sale: '1억 5,000' }, owner: '타사', phone: '010-7777-8888', memo: '타부동산 매물', op: 1, urgent: 1 }]
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
  if (e.key === 'Escape') {
    if (unsEl && unsEl.classList.contains('on')) { unsClose(); return; }
    closeCard(); showHelp(false); hideTip(); admClose(); wipeOpen(false); expClose(); meClose(); return;
  }
  if (!S.ready || typing) return;
  if (e.key === '/') { e.preventDefault(); qEl.focus(); return; }
  if (e.key === 'f' || e.key === 'F') { VIEW.zoom = 'fit'; saveView(); applyZoom(); return; }
  if (e.key === '0') { VIEW.zoom = 100; saveView(); applyZoom(); return; }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1); return; }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomStep(-1); return; }
});

async function signOut() {
  if (cur) saveNote();
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
function setLastCx(id) { try { localStorage.setItem('mc.cx', id); } catch (e) {} }

/* ---------- 상단 카테고리 (아파트 · 오피스텔 · 분양권) ----------
   카테고리를 누르면 그 카테고리의 단지만 '단지 선택'에 남고, 그 첫 단지로 바로 넘어간다.
   이미 그 카테고리 단지를 보고 있으면 '단지 선택'을 열어 같은 카테고리의 다른 단지를 고른다. */
function catOf(cx) { return (cx && cx.cat) || ''; }
function cxListOfCat(cat) {
  return CX_LIST.filter(function (cx) { return !cat || catOf(cx) === cat; });
}
/* 홈 화면용 — 아파트 · 오피스텔 · 분양권 순서로 정렬(같은 카테고리 안은 원래 순서) */
function cxOrdered() {
  return CX_LIST.slice().sort(function (a, b) {
    var ia = CATS.indexOf(catOf(a)), ib = CATS.indexOf(catOf(b));
    if (ia !== ib) return ia - ib;
    return CX_LIST.indexOf(a) - CX_LIST.indexOf(b);
  });
}
function syncCatUI() {
  var on = HOME_ON ? '' : catOf(CX);
  document.querySelectorAll('#cx-cat button').forEach(function (b) {
    var onCat = b.dataset.cat === on;
    b.classList.toggle('on', onCat);
    b.setAttribute('aria-pressed', onCat ? 'true' : 'false');
  });
}
function pickCat(cat) {
  CAT = cat;
  var list = cxListOfCat(cat);
  if (!list.length) return;
  if (!HOME_ON && catOf(CX) === cat) { syncCatUI(); toggleCxMenu(); return; }
  closeCxMenu();
  openComplex(list[0].id);
}

function renderCxMenu() {
  var menu = $('cx-menu'); if (!menu) return;
  menu.innerHTML = '';
  var show = cxListOfCat(CAT);
  if (!show.length) show = CX_LIST;
  show.forEach(function (cx) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cxitem' + (cx.id === CX.id && !HOME_ON ? ' on' : '');
    b.innerHTML = '<b>' + esc(cx.name) + '</b><span>' + esc(cx.sub) + '</span>';
    b.onclick = function (e) { e.stopPropagation(); closeCxMenu(); openComplex(cx.id); };
    menu.appendChild(b);
  });
  /* 2026-11-26 사용자 요청: 드롭다운 맨 아래 '최근 단지 · 바로 열기' 줄은 없뱄다 */
  $('cx-cur').textContent = HOME_ON ? (CAT ? CAT + ' 단지' : '단지 선택') : CX.name;
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
  document.querySelectorAll('#cx-cat button').forEach(function (b) {
    b.onclick = function (e) { e.stopPropagation(); pickCat(b.dataset.cat); };
  });
  syncCatUI();
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
  leaveEditor(openHomeNow);
}
function openHomeNow() {
  HOME_ON = true;
  CAT = '';
  hideTip();
  setList(false);
  $('page').hidden = true;
  $('home').hidden = false;
  if ($('bar')) $('bar').classList.add('home-mode');
  var hcx0 = $('hd-cx'); if (hcx0) hcx0.textContent = '전체 단지';
  var allN = 0; CX_LIST.forEach(function (c) { var bd = c.board || {}; allN += ((bd.meta && bd.meta.units) || (bd.units || []).length); });
  var hsa = $('hs-all'); if (hsa) hsa.textContent = allN.toLocaleString('ko-KR');
  var call = $('c-all'); if (call) call.textContent = allN.toLocaleString('ko-KR');
  renderCxMenu();
  syncCatUI();
  renderHome();
  updateCounts();
  window.scrollTo(0, 0);
}

function openComplex(id, focusKey) {
  leaveEditor(function () { openComplexNow(id, focusKey); });
}
function openComplexNow(id, focusKey) {
  var cx = cxById(id);
  HOME_ON = false;
  CAT = catOf(cx);
  setList(false);
  setComplex(cx);
  setLastCx(cx.id);
  VIEW.zoom = 'fit';   /* 단지를 바꾸면 그 단지에 맞춰 다시 맞춤 */
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
  syncCatUI();
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
    var st = leaseState(it.n);
    if (!st) return;
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
      + '<span class="hx1"><b>' + esc(it.cx.name) + ' ' + dongLabel(it.u.d) + ' ' + hoNum(it.u.f, it.u.h, it.cx) + '호</b>'
      + '<i class="htag ' + it.st + '">' + ST_NAME[it.st] + '</i>'
      + '<em class="hd' + (it.left <= 30 ? ' soon' : '') + '">' + (it.left === 0 ? 'D-DAY' : 'D-' + it.left) + '</em></span>'
      + '<span class="hx2">만기 ' + esc(String(it.n.end).slice(0, 10))
      + (str(it.n.tenant) ? ' · 임차인 ' + esc(it.n.tenant) : '')
      + (str(it.n.owner) ? ' · 임대인 ' + esc(it.n.owner) : '') + '</span></button>';
  }).join('') : '<p class="hempty">3개월 안에 만기가 돌아오는 전세·월세 매물이 없습니다.</p>';

  /* ② 단지별 내 매물 요약 — 아파트 · 오피스텔 · 분양권 순서로 묶어 보여 준다 */
  $('home-cx').innerHTML = cxOrdered().map(function (cx, i, arr) {
    var c = { sale: 0, jeonse: 0, wolse: 0, done: 0, memo: 0, exp: 0 };
    Object.keys(S.notes).forEach(function (k) {
      var m = CXIDX[cx.id]; if (!m || !m.has(k)) return;
      var n = S.notes[k] || {}, ss = statesFromNote(n);
      ss.forEach(function (s) { if (c[s] != null) c[s]++; });
      if (hasInfoNote(n)) c.memo++;
      if (leaseState(n)) {
        var left = dayLeft(n.end);
        if (left !== null && left >= 0 && left <= 90) c.exp++;
      }
    });
    var tot = c.sale + c.jeonse + c.wolse + c.done;
    return '<button type="button" class="hsum" data-cx="' + cx.id + '">'
      + '<i class="hcat">' + esc(catOf(cx)) + '</i>'
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

  /* ④ 단지 카드 — 아파트 / 오피스텔 / 분양권 으로 묶어서 */
  $('home-cards').innerHTML = CATS.map(function (cat) {
    var list = cxListOfCat(cat);
    if (!list.length) return '';
    return '<div class="hcatrow"><b>' + esc(cat) + '</b><em>' + list.length + '개 단지</em></div>'
      + list.map(function (cx) {
        var isI = cx.id === 'ipark';
        var isZ = cx.id === 'zenith';
        var isA = cx.id === 'adellis';
        var isS = cx.id === 'summit';
        var isV = cx.id === 'venuv';
        var isTA = cx.id === 'trump_apt';
        var isTO = cx.id === 'trump_ot';
        var isW = cx.id === 'wooshin';
        var lines = isA
          ? ['101·102·103동 · 3개동 510세대', '58 · 67 · 74A · 74B · 81 · 122 · 126평형', '2006년 9월 준공 · 마린시티 오피스텔']
          : isI
          ? ['1동 66층 · 2동 72층 · 3동 46층', '199개 평면 · 118.45~423.41㎡', '전용률 64~70% (KB 기준)']
          : isZ
          ? ['101동 80층 · 102동 75층 · 103동 70층', '148.11~325.30㎡ · 전용 99.40~222.59㎡', '마린시티 · 2011년 준공']
          : isS
          ? ['101동 40층 · 102·103동 38층 · 104·105동 39~40층', '84A~243E · 15타입 835세대', '2029년 7월 입주 · 대우건설']
          : isV
          ? ['101·102·103동 48층 · 3개동 660세대', '59A~99 · 8타입 (일반분양 629)', '2029년 5월 입주 · 삼한종합건설']
          : isTA
          ? ['A동·B동 42층 · 232세대', '59 · 64 · 69 · 79평 + 펜트하우스 2', '2007년 4월 준공 · 마린시티 아파트']
          : isTO
          ? ['C동·D동 30층 · 222세대', '58 · 64 · 69평 · 3타입', '2007년 4월 준공 · 마린시티 오피스텔']
          : isW
          ? ['서관동·동관동 37층 · 202세대', '66평 · 70평 · 80평 · 3타입', '2005년 12월 준공 · 마린시티 주거용 오피스텔']
          : ['101~106동 · 6개동', '84 · 104 · 125 · 154 · 244타입', '분양가·계약금까지 표기'];
        return '<button type="button" class="hcard' + (isA ? ' adellis' : (isI ? ' ipark' : (isZ ? ' zenith' : (isS ? ' summit' : (isV ? ' venuv' : (isTA ? ' trump_apt' : (isTO ? ' trump_ot' : (isW ? ' wooshin' : ' centum')))))))) + '" data-cx="' + cx.id + '">'
          + '<span class="hc-top"><b>' + esc(cx.name) + '</b><em>' + esc(cx.desc) + '</em><i class="hc-cat">' + esc(cat) + '</i></span>'
          + '<span class="hc-sub">' + esc(cx.sub) + '</span>'
          + '<span class="hc-lines">' + lines.map(function (l) { return '<i>' + esc(l) + '</i>'; }).join('') + '</span>'
          + '<span class="hc-go">배치표 열기 →</span></button>';
      }).join('');
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

/* 이메일 필수 전환 전에 가입한 계정은 u_...@id.centumleel.local 내부 주소가 남아 있다.
   사람이 읽고 쓸 수 있는 주소가 아니므로 내 정보 칸에는 그대로 띄우지 않는다. */
function realMail(mail) {
  var s = String(mail || '').trim();
  return isIdEmail(s) ? '' : s;
}

function meOpen() {
  if (!S.user) return;
  meMsg('me-office-msg', ''); meMsg('me-pw-msg', ''); meMsg('me-mail-msg', '');
  ['me-pw-cur', 'me-pw-new', 'me-pw-new2'].forEach(function (id) { var i = $(id); if (i) i.value = ''; });
  var uname = (S.profile && S.profile.username) || '';
  var mail = realMail(S.user && S.user.email);
  $('me-id').textContent = uname || mail || '—';
  $('me-role').textContent = (S.profile && S.profile.role === 'admin') ? '관리자' : '회원';
  $('me-office').value = (S.profile && S.profile.agency_name) || '';
  $('me-mail').value = mail;
  meEl.classList.add('on'); ov7.classList.add('on');
  /* 아직 확인을 마치지 않은 새 주소가 남아 있으면 그 사실을 먼저 알려 준다 */
  var pend0 = realMail(S.user && S.user.new_email);
  if (pend0) meMsg('me-mail-msg', '확인 대기 중인 주소가 있습니다: ' + maskEmail(pend0) + ' — 메일함의 확인 링크를 누르면 그 주소로 바뀝니다.', true);
  /* 프로필에 적힌 실제 이메일·아이디가 있으면 그쪽을 보여 준다 */
  if (LIVE && S.sb) {
    (async function () {
      try {
        var r = await S.sb.from('profiles').select('username,email').eq('id', S.user.id).maybeSingle();
        if (r && !r.error && r.data) {
          var pm = realMail(r.data.email);
          if (pm) $('me-mail').value = pm;
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

/* ============================================================
   피클(AI) 연동 안내 — 복사 한 번으로 AI가 바로 조회·등록할 수 있는 스펙
   (화면 안내는 짧게, 복사되는 글은 AI가 실행할 수 있게 정확하게)
   ============================================================ */
function pickleGuide() {
  var cfg = window.CENTUM_CONFIG || {};
  var sb = cfg.SUPABASE_URL || 'https://trcytxrztbeknbtqvymv.supabase.co';
  var anon = cfg.SUPABASE_ANON_KEY || '';
  var myId = (S.profile && S.profile.username) || realMail(S.user && S.user.email) || '';
  var L = [];
  L.push('매물콕 — 공인중개사 전용 매물장 (내 계정 매물만 보입니다)');
  L.push('');
  L.push('[접속]');
  L.push('주소: https://maemulcok.github.io/   (PC·휴대폰 공용, 반응형 — 앱 설치 없음)');
  L.push('· 호실을 한 번 클릭하면 메모장이 열립니다. (더블클릭 필요 없음)');
  L.push('· 상단 [목록] 버튼을 누르면 지금 검색·필터에 맞는 매물이 글자 목록으로 나옵니다.');
  L.push('· 위쪽 [아파트] [오피스텔] [분양권]을 누르면 그 카테고리 단지만 [단지 선택]에 남습니다.');
  L.push('· 메모장에서 고친 내용은 [저장]을 눌러야 저장됩니다.');
  L.push('');
  L.push('[내 계정]');
  L.push('아이디: ' + (myId || '(내 매물콕 아이디)'));
  L.push('비밀번호: (내 매물콕 비밀번호 — 피클에게 한 번만 알려주세요)');
  L.push('');
  L.push('[직접 연동 — Supabase]');
  L.push('SUPABASE_URL = ' + sb);
  L.push('SUPABASE_ANON_KEY = ' + anon);
  L.push('');
  L.push('1) 로그인');
  L.push('· 아이디에 @가 들어 있으면 그 주소가 곧 로그인 이메일입니다.');
  L.push('· 한글·영문 상호 아이디는 먼저 물어봅니다:');
  L.push('  POST ' + sb + '/rest/v1/rpc/lookup_login_email');
  L.push('  headers: apikey: ' + anon + ' / Content-Type: application/json');
  L.push('  body: {"p":"<아이디>"}   → "로그인 이메일" 문자열이 옵니다.');
  L.push('  (예전에 만든 계정은 u_…@id.centumleel.local 처럼 내부 주소가 오는데 그대로 쓰면 됩니다.)');
  L.push('· 로그인');
  L.push('  POST ' + sb + '/auth/v1/token?grant_type=password');
  L.push('  headers: apikey: ' + anon + ' / Content-Type: application/json');
  L.push('  body: {"email":"<로그인 이메일>","password":"<비밀번호>"}');
  L.push('→ 받은 access_token을 아래 요청의 Authorization: Bearer <토큰> 에 넣습니다. apikey는 그대로 둡니다.');
  L.push('');
  L.push('2) 내 user_id');
  L.push('GET ' + sb + '/rest/v1/profiles?select=id');
  L.push('→ 응답의 id 가 내 user_id 입니다.');
  L.push('');
  L.push('3) 조회');
  L.push('GET ' + sb + '/rest/v1/listings?select=*&user_id=eq.<user_id>&complex=eq.<complex>');
  L.push('· complex: 센텀르엘(분양권)=centum, 써밋리미티드남천(분양권)=summit, 베뉴브해운대(분양권)=venuv, 해운대아이파크=ipark, 해운대두산위브더제니스=zenith, 더샵해운대아델리스(O/T)=adellis, 트럼프월드마린(A·B동 아파트)=trump_apt, 트럼프월드마린(O/T)(C·D동)=trump_ot, 우신골든스위트(O/T)=wooshin');
  L.push('· 상단 카테고리: 아파트 = 해운대아이파크 · 해운대두산위브더제니스 · 트럼프월드마린 / 오피스텔 = 더샵해운대아델리스(O/T) · 트럼프월드마린(O/T) · 우신골든스위트(O/T) / 분양권 = 센텀르엘(분양권) · 써밋리미티드남천(분양권) · 베뉴브해운대(분양권)');
  L.push('· 예) 제니스 급매 → …&complex=eq.zenith&urgent=eq.true');
  L.push('');
  L.push('4) 등록·수정 (같은 호실은 덮어씁니다)');
  L.push('POST ' + sb + '/rest/v1/listings?on_conflict=user_id,unit_key');
  L.push('headers: Prefer: resolution=merge-duplicates / Content-Type: application/json');
  L.push('body: {"user_id":"<user_id>","unit_key":"201-1-25","complex":"zenith","status":"sale",');
  L.push('       "prices":{"sale":"150000","premium":"3000"},"price":"150000","owner_name":"홍길동, 김철수",');
  L.push('       "phone":"010-8888-8888, 010-7777-7777","memo":"[2026.11.25]\n15억 희망","urgent":false,"other_prop":false}');
  L.push('· status: none|sale|jeonse|wolse|done (대표 하나) / 매매·전세·월세를 같이 올릴 때는 statuses:"sale,jeonse"');
  L.push('· prices: {"sale":"…","premium":"…","jeonse":"…","wolse":"3,000 / 120","etc":"…"} — 금액은 모두 **만원 단위 숫자**입니다.');
  L.push('  예) 9억 6,000만원 → "96000" / 3억 → "30000" / 월세 보증금 3,000·월세 120 → wolse:"3,000 / 120"');
  L.push('  premium 은 분양권 단지(센텀르엘·써밋리미티드남천·베뉴브해운대) 매매의 프리미엄(만원)이며, price 에는 대표 금액(매매가)을 같이 넣습니다.');
  L.push('  아파트·오피스텔(아이파크·제니스·아델리스·트럼프월드마린·우신골든스위트)은 프리미엄 칸이 없고 prices.sale(매매가)만 씁니다.');
  L.push('· owner_name·phone: 소유주(임대인) 이름과 연락처를 같은 순서로 ", "로 이어 적습니다. (예: 이름 "홍길동, 김철수" / 연락처 "010-1111-1111, 010-2222-2222")');
  L.push('· 급매는 urgent:true, 타부동산은 other_prop:true 입니다.');
  L.push('');
  L.push('5) unit_key 규칙 — {동번호}-{호라인}-{층}');
  L.push('· 센텀르엘 101동 2501호 → 101-1-25   · 해운대아이파크 1동 2501호 → 1-1-25');
  L.push('· 제니스는 화면의 101~103동이 내부 201~203 → 제니스 101동 2501호 → 201-1-25');
  L.push('· 아델리스도 화면의 101~103동이 내부 301~303 → 아델리스 103동 2505호 → 303-5-25');
  L.push('· 써밋리미티드남천은 화면의 101~105동이 내부 401~405 → 써밋 101동 2501호 → 401-1-25');
  L.push('· 베뉴브해운대는 화면의 101~103동이 내부 501~503 → 베뉴브 103동 205호 → 503-2-5');
  L.push('· 트럼프월드마린은 화면의 A·B동이 내부 601·602, C·D동이 내부 701·702 → A동 1501호 → 601-1-15 / C동 1503호 → 701-3-15');
  L.push('· 우신골든스위트는 화면의 서관동이 내부 801, 동관동이 내부 802. 4층을 건너뛰고 호수가 5xx부터라');
  L.push('  표시 호수 앞자리 = 층+1 → 서관동 3801호 → 801-1-37 / 동관동 1505호 → 802-5-14');
  L.push('  (2501호 = 1호라인 25층)');
  L.push('');
  L.push('[분양가 참고]');
  L.push('· 배치표 분양가는 입주자모집공고 공급금액(대지비+건축비+부가세)이며, 분양권 매매가·프리미엄과는 별개입니다.');
  L.push('· 베뉴브해운대 조합원·보류지 31세대(102동·103동 2호 30~40·47·48층, 103동 1호 39·48층, 103동 5호 28~30층)는 분양가가 공개되지 않았습니다.');
  return L.join('\n');
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return new Promise(function (res, rej) {
    try {
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.left = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      if (ok) res(); else rej(new Error('copy failed'));
    } catch (e) { rej(e); }
  });
}
if ($('me-pickle-copy')) $('me-pickle-copy').onclick = function () {
  var b = this, t0 = b.textContent;
  meMsg('me-pickle-msg', '');
  copyText(pickleGuide()).then(function () {
    meMsg('me-pickle-msg', '복사했습니다. 쓰고 계신 피클(AI)에게 그대로 붙여 넣어 주세요.', true);
    toast('피클 연동 안내를 복사했습니다.');
  }).catch(function () {
    meMsg('me-pickle-msg', '복사하지 못했습니다. 한 번 더 눌러 주세요.');
  });
  b.textContent = t0;
};

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

/* 등록 이메일 변경 — 바뀐 주소가 비밀번호 찾기·재설정을 받는 주소가 된다 */
if ($('me-mail-go')) $('me-mail-go').onclick = async function () {
  var b = this;
  var v = String($('me-mail').value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { meMsg('me-mail-msg', '이메일 형식을 확인해 주세요.'); $('me-mail').focus(); return; }
  if (isIdEmail(v)) { meMsg('me-mail-msg', '내부 주소는 쓸 수 없습니다. 실제로 쓰는 이메일을 넣어 주세요.'); $('me-mail').focus(); return; }
  if (!LIVE) { meMsg('me-mail-msg', '데모 모드에서는 이메일을 바꿀 수 없습니다.'); return; }
  /* 예전에 아이디만으로 만든 계정은 인증 서버가 내부 주소(u_...@id.centumleel.local)를
     '유효하지 않은 주소'로 보고 변경을 거부한다. 서버까지 보내지 않고 운영자에게 요청하도록 안내한다. */
  if (isIdEmail(S.user && S.user.email)) {
    meMsg('me-mail-msg', '이 계정은 예전에 아이디만으로 만들어져 등록된 이메일이 없습니다. 등록 이메일은 운영자가 바꿔 드립니다. 아이디 ' + (((S.profile && S.profile.username) || '') || '(상호명)') + ' 와 바꿀 주소를 매물콕 운영자에게 알려 주세요.');
    return;
  }
  if (b.disabled) return;
  var t0 = b.textContent;
  b.disabled = true; b.textContent = '변경 중…'; meMsg('me-mail-msg', '');
  try {
    var u = await S.sb.auth.updateUser({ email: v });
    if (u && u.error) throw u.error;
    var pend = realMail(u && u.data && u.data.user && u.data.user.new_email);
    if (pend) {
      /* 인증 서버가 새 주소 확인을 먼저 요구하는 경우 — 확인 전에는 계정 주소가 그대로다 */
      meMsg('me-mail-msg', '확인 메일을 ' + maskEmail(pend) + ' 로 보냈습니다. 메일함의 확인 링크를 누르면 그 주소로 바뀌고, 비밀번호 재설정 메일도 그 주소로 갑니다.', true);
      toast('확인 메일을 보냈습니다.');
    } else {
      /* 이메일 확인을 끈 프로젝트에서는 곧바로 바뀐다 */
      S.user = S.user || {};
      S.user.email = v;
      $('me-mail').value = v;
      meMsg('me-mail-msg', '등록 이메일을 ' + v + ' 로 바꿨습니다. 이제 비밀번호 찾기·재설정 메일이 이 주소로 갑니다.', true);
      toast('등록 이메일을 바꿨습니다.');
      await saveProfileEmail(v);
    }
  } catch (e) {
    var em = String((e && (e.message || e)) || '');
    if (/is invalid/i.test(em) && isIdEmail(S.user && S.user.email)) {
      meMsg('me-mail-msg', '이 계정은 예전에 아이디만으로 만들어져 등록된 이메일이 없습니다. 등록 이메일은 운영자가 바꿔 드립니다. 아이디와 바꿀 주소를 매물콕 운영자에게 알려 주세요.');
    } else {
      meMsg('me-mail-msg', '바꾸지 못했습니다: ' + em);
    }
  } finally {
    b.disabled = false; b.textContent = t0;
  }
};

/* profiles.email 도 같이 맞춘다 (관리자 콘솔·다른 화면이 함께 보는 값).
   실패해도 로그인·재설정은 auth 쪽 주소를 쓰므로 흐름을 막지 않는다. */
async function saveProfileEmail(mail) {
  if (!LIVE || !S.sb || !S.user) return;
  try {
    var r = await S.sb.from('profiles').update({ email: mail }).eq('id', S.user.id);
    if (r && r.error) console.warn('profiles.email', r.error);
  } catch (e) { console.warn('profiles.email', e); }
}

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
var F_LBL = { status: '상태', statuses: '복합 상태', other_prop: '타부동산', prices: '상태별 금액', price: '금액', owner_name: '소유주', tenant_name: '임차인', phone: '연락처', tenant_phone: '임차인 연락처', lease_end_date: '만기일', urgent: '급매', memo: '메모' };
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
  return dongLabel(p[0]) + ' ' + hoNum(parseInt(p[2], 10), parseInt(p[1], 10), cxByKey(k)) + '호';
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
  if (f === 'other_prop') return v ? '타부동산' : '없음';
  if (f === 'statuses') return v ? statesLabel(v) : '없음';
  if (f === 'prices') return (v && typeof v === 'object') ? (priceText(Object.keys(v), v) || '없음') : '없음';
  if (v == null || String(v).trim() === '') return '없음';
  return cut(v, 40);
}
function admFields(d, list) {
  return (list || ['status', 'statuses', 'prices', 'price', 'owner_name', 'tenant_name', 'phone', 'tenant_phone', 'lease_end_date', 'other_prop', 'memo'])
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
  ['status', 'statuses', 'prices', 'price', 'owner_name', 'tenant_name', 'phone', 'tenant_phone', 'lease_end_date', 'urgent', 'other_prop', 'memo'].forEach(function (f) {
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
  var cnt = { sale: 0, jeonse: 0, wolse: 0, done: 0, none: 0, urg: 0, op: 0 };
  rows.forEach(function (r) {
    var ss = rowStates(r);
    if (!ss.length) cnt.none++; else ss.forEach(function (s) { if (cnt[s] != null) cnt[s]++; });
    if (r.urgent) cnt.urg++;
    if (r.other_prop) cnt.op++;
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
    + '<span class="of-chip">타부동산 <b>' + cnt.op + '</b></span>'
    + '<span class="of-chip">기타 <b>' + cnt.none + '</b></span></div>';
  var table = rows.length ? ('<div class="of-tw"><table class="of-table"><thead><tr>'
    + '<th>호실</th><th>상태</th><th>금액</th><th>소유주</th><th>임차인</th><th>연락처</th><th>임차인 연락처</th><th>만기일</th><th>메모</th><th>수정</th>'
    + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>'
        + '<td class="num-c">' + esc(admUnit(r.unit_key)) + (r.urgent ? ' <span class="al-act delete" style="padding:0 5px">급</span>' : '')
        + (r.other_prop ? ' <span class="al-act" style="padding:0 5px;color:#0f766e;background:#dcfce7">✓</span>' : '') + '</td>'
        + '<td>' + esc(statesLabel(rowStates(r))) + '</td>'
        + '<td>' + esc(priceText(rowStates(r), r.prices || {}) || str(r.price) || '—') + '</td>'
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
  if (cur) { hideCard(); selectCell(null); }
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
  if (cur) { hideCard(); selectCell(null); }
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
        statuses: d.statuses || null,
        prices: (d.prices && typeof d.prices === 'object') ? d.prices : null,
        other_prop: !!d.other_prop,
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
