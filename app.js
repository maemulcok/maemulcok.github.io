/* ============================================================
   센텀르엘 (매물) — 멀티유저 매물장
   - 로그인한 계정의 매물만 조회·수정 (Supabase RLS)
   - Supabase 미연결 시 '데모 모드' (이 브라우저에만 저장)
   ============================================================ */
(function () {
'use strict';

var CFG = window.CENTUM_CONFIG || {};
var BOARD = window.CENTUM_BOARD || { units: [], area: {}, meta: {} };
var LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && /^https?:\/\//.test(CFG.SUPABASE_URL));

/* ---------- 기본 상수 ---------- */
var DONGS = [101, 102, 103, 104, 105, 106];
var TOP = { 101: 67, 102: 67, 103: 67, 104: 48, 105: 67, 106: 67 };
var BOTTOM = 5;
var F1_LABEL = {
  101: '판매시설', 102: '판매시설', 103: '판매시설', 104: '판매시설',
  105: '판매시설, 어린이집', 106: '판매시설, 관리사무소'
};
var TYPE_COLOR = {
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
var ST_NAME = { none: '미확인', sale: '매매', jeonse: '전세', wolse: '월세', done: '보류·완료' };
var ST_COLOR = { none: '#ffffff', sale: '#FEF08A', jeonse: '#BAE6FD', wolse: '#E9D5FF', done: '#FCA5A5' };
var ST_BORDER = { none: '#b9c2cc', sale: '#d9b421', jeonse: '#56b6e0', wolse: '#c084fc', done: '#e88' };
var URG_RE = /급내|급매/;
var FIELDS = ['price', 'owner', 'tenant', 'phone'];

var COARSE = (function () { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
var MQ_NARROW = window.matchMedia('(max-width: 900px)');
function isNarrow() { return MQ_NARROW.matches; }

/* ---------- 상태 ---------- */
var S = {
  mode: LIVE ? 'live' : 'demo',
  sb: null,
  user: null,          // {id, email}
  profile: null,       // {agency_name, manager_name, approved}
  notes: {},           // key -> {s, price, owner, tenant, phone, memo, urgent, ut}
  pending: new Set(),
  chan: null,
  ready: false
};

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
var IDX = new Map(), LINE_TYPE = {}, DONG_CNT = {}, LINE_CNT = {}, AREA = BOARD.area || {};
(BOARD.units || []).forEach(function (u) {
  IDX.set(K(u[0], u[1], u[2]), { d: u[0], h: u[1], f: u[2], t: u[3], p: u[4] });
  DONG_CNT[u[0]] = (DONG_CNT[u[0]] || 0) + 1;
  LINE_CNT[u[0] + '-' + u[1]] = (LINE_CNT[u[0] + '-' + u[1]] || 0) + 1;
  if (u[3] !== '244') LINE_TYPE[u[0] + '-' + u[1]] = u[3];
});

/* ---------- 메모(매물) 판정 ---------- */
function stateOf(k) { var n = S.notes[k]; return n ? cleanState(n.s) : 'none'; }
function memoOf(k) { var n = S.notes[k]; return n && n.memo ? n.memo : ''; }
function hasInfo(k) {
  var n = S.notes[k];
  if (!n) return false;
  return !!(str(n.memo) || str(n.price) || str(n.owner) || str(n.tenant) || str(n.phone) || n.urgent);
}
function isEmpty(n) { return !n || !hasInfo(n) && cleanState(n.s) === 'none'; }
function isUrgent(k) {
  var n = S.notes[k];
  if (!n) return false;
  if (n.urgent) return true;
  return URG_RE.test(str(n.memo) + ' ' + str(n.price));
}
function fieldText(k) {
  var n = S.notes[k]; if (!n) return '';
  var st = cleanState(n.s), rental = (st === 'jeonse' || st === 'wolse'), parts = [];
  if (str(n.price)) parts.push((st === 'sale' ? '매매가' : rental ? '보증금·월세' : '금액') + ' P ' + str(n.price));
  if (str(n.owner)) parts.push((rental ? '임대인' : '소유주') + ' ' + str(n.owner));
  if (str(n.tenant)) parts.push('임차인 ' + str(n.tenant));
  if (str(n.phone)) parts.push('연락처 ' + str(n.phone));
  return parts.join(' · ');
}

/* ============================================================
   저장소 — 데모(브라우저) / 운영(Supabase)
   ============================================================ */
function noteToRow(k, n) {
  return {
    user_id: S.user.id,
    unit_key: k,
    status: cleanState(n.s),
    price: str(n.price) || null,
    owner_name: str(n.owner) || null,
    tenant_name: str(n.tenant) || null,
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
function markDirty(k) { S.pending.add(k); scheduleFlush(500); mirrorSoon(); }
function scheduleFlush(ms) {
  clearTimeout(flushT);
  flushT = setTimeout(flush, ms || 500);
}
async function flush() {
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
  clearTimeout(mirrorT);
  mirrorT = setTimeout(function () {
    try { localStorage.setItem(cacheKey(), JSON.stringify(S.notes)); } catch (e) {}
  }, 400);
}
function mirrorNow() {
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
var UNIT_FLOORS = (function () { var a = []; for (var f = 67; f >= BOTTOM; f--) a.push(f); return a; })();

function buildDong(d) {
  var box = document.createElement('div');
  box.className = 'dong';
  box.dataset.d = d;
  box.id = 'd' + d;

  var html = '<table class="grid"><colgroup><col class="fc">' + '<col>'.repeat(6) + '</colgroup>';
  html += '<thead><tr><th class="dh" colspan="7">' + d + '동'
        + '<span class="ds">' + DONG_CNT[d].toLocaleString('ko-KR') + '세대</span></th></tr></thead><tbody>';

  UNIT_FLOORS.forEach(function (f) {
    if (f > TOP[d]) {
      html += '<tr><th class="fc bz">' + f + '층</th><td class="blank" colspan="6"></td></tr>';
      return;
    }
    if (f === 19 || (f === 47 && d !== 104)) {
      html += '<tr><th class="fc evac">' + f + '층</th><td class="evac" colspan="6">' + f + 'F 피난안전구역 기계실</td></tr>';
      return;
    }
    var tr = '<tr><th class="fc">' + f + '층</th>';
    for (var h = 1; h <= 6; h++) {
      var u = IDX.get(K(d, h, f));
      if (u) {
        var span = (u.t === '244') ? 2 : 1;
        var ho = hoNum(f, h);
        tr += '<td class="c" colspan="' + span + '" data-k="' + K(d, h, f) + '" data-d="' + d
            + '" data-ho="' + h + '" data-f="' + f + '" data-t="' + u.t + '"'
            + ' aria-label="' + d + '동 ' + ho + '호 ' + u.t + '타입"><span class="num">' + ho + '</span></td>';
        if (span === 2) h++;
      } else {
        var ph = (f === BOTTOM && (h === 4 || h === 5));
        tr += '<td class="fx">' + (ph ? '필로티' : '') + '</td>';
      }
    }
    html += tr + '</tr>';
  });

  html += '<tr><th class="fc">4층</th><td class="fx">필로티</td><td class="fx">필로티</td><td class="fx">필로티</td>'
        + '<td class="fx lobby" colspan="2">로비</td><td class="fx">필로티</td></tr>';
  html += '<tr><th class="fc">3층</th><td class="fx under" colspan="6">부대복리시설</td></tr>';
  html += '<tr><th class="fc">2층</th><td class="fx salefloor" colspan="6">판매시설</td></tr>';
  html += '<tr><th class="fc">1층</th><td class="fx salefloor" colspan="6">' + (F1_LABEL[d] || '판매시설') + '</td></tr>';

  html += '<tr class="sum dongrow"><th>동</th><td colspan="6">' + d + '동'
        + '<span class="sub">(' + DONG_CNT[d].toLocaleString('ko-KR') + '세대)</span></td></tr>';

  html += '<tr class="sum typerow"><th>타입</th>';
  for (var j = 1; j <= 6; j++) {
    var t = LINE_TYPE[d + '-' + j] || '';
    var c = TYPE_COLOR[t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
    html += '<td style="background:' + c.bg + ';border-color:' + c.bd + ';color:' + c.fg + '" title="' + d + '동 ' + j + '호 라인 · ' + t + '타입">'
          + t + (j === 1 ? '<i class="b244">244</i>' : '') + '</td>';
  }
  html += '</tr>';
  html += '<tr class="sum linerow"><th>라인</th>';
  for (var k = 1; k <= 6; k++) html += '<td>' + k + '호</td>';
  html += '</tr>';
  html += '<tr class="sum cntrow"><th>세대수</th>';
  for (var m = 1; m <= 6; m++) html += '<td>' + (LINE_CNT[d + '-' + m] || 0) + '</td>';
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
  DONGS.forEach(function (d) { boardEl.appendChild(buildDong(d)); });

  /* 타입 색 범례 */
  var types = Array.from(new Set((BOARD.units || []).map(function (u) { return u[3]; })))
    .sort(function (a, b) { return parseInt(a) - parseInt(b) || a.localeCompare(b); });
  var tl = $('tlegend');
  tl.innerHTML = '';
  types.forEach(function (t) {
    var c = TYPE_COLOR[t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
    var s = document.createElement('span');
    s.className = 'tchip';
    s.style.background = c.bg; s.style.borderColor = c.bd; s.style.color = c.fg;
    s.textContent = t;
    tl.appendChild(s);
  });

  /* 필터 선택지 */
  var selT = $('sel-type');
  selT.length = 1;              /* 다시 로그인해도 선택지가 겹치지 않게 */
  types.forEach(function (t) {
    var o = document.createElement('option'); o.value = t; o.textContent = t + '타입'; selT.appendChild(o);
  });
  var selD = $('sel-dong');
  selD.length = 1;
  DONGS.forEach(function (d) {
    var o = document.createElement('option'); o.value = d; o.textContent = d + '동'; selD.appendChild(o);
  });

  /* 동 바로가기 (좁은 화면에서만 보임) */
  var tabs = $('tabs');
  tabs.innerHTML = '';
  DONGS.forEach(function (d) {
    var b = document.createElement('button');
    b.dataset.d = d;
    b.innerHTML = d + '동<span class="n">' + DONG_CNT[d].toLocaleString('ko-KR') + '</span>';
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
  } else if (el) { el.remove(); }
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
    var hay = norm(td.dataset.d + '동' + td.dataset.ho + '호' + td.dataset.f + '층'
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
  updateCounts();
}
function updateCounts() {
  var c = { sale: 0, jeonse: 0, wolse: 0, done: 0, memo: 0 };
  cellMap.forEach(function (td, k) {
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
  Object.keys(S.notes).forEach(function (k) { if (hasInfo(k) || stateOf(k) !== 'none') mine++; });
  $('c-seed').textContent = mine.toLocaleString('ko-KR');
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
  var st = stateOf(key), a = AREA[t] || [0, 0, 0, 0, 0];
  var memo = memoOf(key).replace(/\n+/g, ' · ').replace(/\s+/g, ' ').trim();
  var ft = fieldText(key), urg = isUrgent(key);
  tipEl.innerHTML = '<b>' + d + '동 ' + hoNum(f, h) + '호</b>' + (urg ? ' <em class="uu">(급)</em>' : '')
    + ' · ' + t + '타입 · <i>' + won(u.p) + '</i>'
    + '<span class="stx"><em style="background:' + ST_COLOR[st] + ';border:1px solid ' + ST_BORDER[st] + '"></em>' + ST_NAME[st] + '</span>'
    + (ft ? '<em class="fl">' + esc(ft) + '</em>' : '')
    + '<em class="ar">공급 <b>' + a[2].toFixed(2) + '㎡</b> (' + py(a[2]) + '평) · 전용 <b>' + a[0].toFixed(2) + '㎡</b> (' + py(a[0]) + '평)</em>'
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
var mcIn = { price: $('mc-price-in'), owner: $('mc-owner'), phone: $('mc-phone'), tenant: $('mc-tenant') };

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
  FIELDS.forEach(function (f) { mcIn[f].value = str(n[f]); });
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
function syncFieldUI(st) {
  var rental = (st === 'jeonse' || st === 'wolse');
  mcFields.classList.toggle('rental', rental);
  $('mc-lb-price').textContent = st === 'sale' ? '매매가 · P' : st === 'jeonse' ? '보증금 · P' : st === 'wolse' ? '보증금 · 월세' : '금액 · P';
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

  var a = AREA[u.t] || [0, 0, 0, 0, 0];
  mcHo.textContent = u.d + '동 ' + hoNum(u.f, u.h) + '호';
  mcType.textContent = u.t + '타입';
  var c = TYPE_COLOR[u.t] || { bg: '#f1f5f9', bd: '#d7dde3', fg: '#334155' };
  mcType.style.background = c.bg; mcType.style.borderColor = c.bd; mcType.style.color = c.fg;
  mcPrice.innerHTML = '<span class="mc-plabel">분양가</span>' + won(u.p);
  mcGy.innerHTML = '<b>' + a[2].toFixed(2) + '㎡</b><i>' + py(a[2]) + '평</i>';
  mcJn.innerHTML = '<b>' + a[0].toFixed(2) + '㎡</b><i>' + py(a[0]) + '평</i>';
  mcGye.innerHTML = '계약금 <b>5%</b> · <b>' + wonShort(Math.round(u.p * 0.05)) + '</b>';
  fillEditor(key);
  mcSaved.classList.remove('on');

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
  if (!cur) return;
  var sig = curSig();
  if (!force && sig === curBase) return;
  var txt = mcMemo.value, fld = readFields();
  var n = S.notes[cur] || { s: 'none' };
  n.memo = txt; n.price = fld.price || ''; n.owner = fld.owner || '';
  n.phone = fld.phone || ''; n.tenant = fld.tenant || '';
  if (isEmpty(n) && stateOf(cur) === 'none' && !n.urgent) {
    delete S.notes[cur];
  } else {
    S.notes[cur] = n;
  }
  curBase = sig;
  paintCell(cur); updateCounts(); markDirty(cur);
}

mcStat.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b || !cur) return;
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
  if (!cur) return;
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
mcMemo.addEventListener('blur', function () { writeNote(false); });
$('mc-x').onclick = closeCard;
ov.onclick = closeCard;
$('mc-del').onclick = function () {
  if (!cur) return;
  if (!confirm('이 호실의 메모·금액·연락처·색상을 모두 지울까요?')) return;
  delete S.notes[cur];
  mcMemo.value = ''; FIELDS.forEach(function (f) { mcIn[f].value = ''; });
  curBase = curSig();
  paintCell(cur); setStatusUI('none'); setUrgUI(false); updateCounts(); markDirty(cur);
  flashSaved('삭제됨');
};
document.addEventListener('click', function (e) {
  if (!cur || justOpened) return;
  var t = e.target;
  if (t && t.closest && (t.closest('#mc') || t.closest('#help') || t.closest('#ov2'))) return;
  closeCard();
});
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
  var needW = 138 * 6 + 5 * 6, availW = window.innerWidth - 24;
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
  var tail = isNarrow() ? '' : ' · 분양가 · 색상';
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
$('btn-export').onclick = function () {
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

function normNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var n = {
    s: cleanState(raw.s === 'memo' ? 'none' : raw.s),
    price: str(raw.price),
    owner: str(raw.owner),
    tenant: str(raw.tenant),
    phone: str(raw.phone),
    memo: str(raw.memo != null ? raw.memo : raw.m),
    urgent: raw.urgent ? 1 : 0,
    ut: +raw.ut || 0
  };
  /* 예전 매물장(단일 사용자판) 백업 읽기 */
  if (!n.phone && raw.ownerPhone) n.phone = str(raw.ownerPhone);
  if (raw.tenantPhone) {
    var t = '※ 임차인 연락처: ' + str(raw.tenantPhone);
    n.memo = n.memo ? n.memo + '\n' + t : t;
  }
  return isEmpty(n) ? null : n;
}

$('btn-import').onclick = function () { $('file').click(); };
$('file').addEventListener('change', function (e) {
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

$('btn-reset').onclick = async function () {
  if (!Object.keys(exportMap()).length) { toast('비울 매물이 없습니다.'); return; }
  if (!confirm('내 계정에 저장된 매물 기록을 모두 지웁니다.\n되돌릴 수 없습니다. 먼저 JSON으로 백업해 두셨나요?')) return;
  try {
    await Store().removeAll();
    S.notes = {}; S.pending.clear();
    paintAll(); applyFilters(); mirrorNow();
    if (cur) { curBase = curSig(); fillEditor(cur); }
    toast('내 매물을 모두 비웠습니다.');
  } catch (e) {
    alert('비우지 못했습니다: ' + (e.message || e));
  }
};

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
  if (e.key === 'Escape') { closeCard(); showHelp(false); hideTip(); admClose(); return; }
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
  admClose(); $('btn-admin').hidden = true;
  mc.classList.remove('on'); ov.classList.remove('on'); showHelp(false);
  $('app').hidden = true; $('pending').hidden = true;
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
var authTabs = ['login', 'signup', 'reset', 'newpw'];
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
function authErr(e) {
  var m = String((e && (e.message || e.error_description)) || e || '');
  if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (/Email not confirmed/i.test(m)) return '메일함의 확인 링크를 먼저 눌러 주세요.';
  if (/already registered|already been registered/i.test(m)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (/Password should be at least/i.test(m)) return '비밀번호는 6자 이상이어야 합니다.';
  if (/rate limit|too many/i.test(m)) return '시도가 너무 잦습니다. 잠시 뒤 다시 해 주세요.';
  if (/Unable to validate email|invalid format/i.test(m)) return '이메일 주소를 확인해 주세요.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  return m || '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
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
    showAuth(t);
  });
});

/* ---------- 데모 계정 ---------- */
var DK = 'cls.demo.v1';
function demoData() { try { return JSON.parse(localStorage.getItem(DK) || '{}') || {}; } catch (e) { return {}; } }
function demoUsers() { return demoData().users || {}; }
function demoSave(d) { localStorage.setItem(DK, JSON.stringify(d)); }
function demoLogin(email, pw) {
  var d = demoData(), u = (d.users || {})[email.toLowerCase()];
  if (!u) return '가입되지 않은 이메일입니다. 회원가입을 먼저 해 주세요.';
  if (u.pw !== pw) return '비밀번호가 맞지 않습니다.';
  d.session = email.toLowerCase(); demoSave(d);
  enterApp({ id: 'demo:' + email.toLowerCase(), email: email.toLowerCase() }, {
    agency_name: u.agency, manager_name: u.manager, approved: u.approved !== false
  });
  return '';
}
function demoSignup(email, pw, agency, manager, consent) {
  var d = demoData(); d.users = d.users || {};
  var key = email.toLowerCase();
  if (d.users[key]) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (!consent) return '백업·보관 동의에 체크해 주세요.';
  d.users[key] = { pw: pw, agency: agency, manager: manager, approved: true, consentAt: new Date().toISOString() };
  d.session = key; demoSave(d);
  enterApp({ id: 'demo:' + key, email: key }, { agency_name: agency, manager_name: manager, approved: true });
  return '';
}

$('demo-go').onclick = function () {
  var d = demoData(); d.users = d.users || {};
  var key = 'demo@example.com';
  if (!d.users[key]) d.users[key] = { pw: 'demo1234', agency: '데모공인중개사사무소', manager: '체험 계정', approved: true, consentAt: new Date().toISOString() };
  d.session = key; demoSave(d);
  enterApp({ id: 'demo:' + key, email: key }, { agency_name: d.users[key].agency, manager_name: d.users[key].manager, approved: true });
};

/* ---------- 로그인 ---------- */
$('form-login').addEventListener('submit', async function (e) {
  e.preventDefault();
  var email = str($('li-email').value), pw = $('li-pw').value;
  setMsg('li-msg', '');
  if (!email || !pw) { setMsg('li-msg', '이메일과 비밀번호를 입력해 주세요.'); return; }
  $('li-go').disabled = true;
  try {
    if (!LIVE) {
      var err = demoLogin(email, pw);
      if (err) setMsg('li-msg', err);
      return;
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
  var email = str($('su-email').value), pw = $('su-pw').value;
  var agency = str($('su-agency').value), manager = str($('su-manager').value);
  var consent = $('su-consent').checked;
  setMsg('su-msg', '');
  if (!email || !pw) { setMsg('su-msg', '이메일과 비밀번호를 입력해 주세요.'); return; }
  if (pw.length < 6) { setMsg('su-msg', '비밀번호는 6자 이상으로 정해 주세요.'); return; }
  if (!agency || !manager) { setMsg('su-msg', '사무소명과 담당자명을 입력해 주세요.'); return; }
  if (!consent) { setMsg('su-msg', '이용약관 및 데이터 보관 동의에 체크해 주세요.'); $('su-consent').focus(); return; }
  $('su-go').disabled = true;
  var consentAt = new Date().toISOString();
  try {
    if (!LIVE) {
      var err = demoSignup(email, pw, agency, manager, consent);
      if (err) setMsg('su-msg', err);
      return;
    }
    var res = await S.sb.auth.signUp({
      email: email, password: pw,
      options: {
        emailRedirectTo: siteUrl(),
        data: {
          agency_name: agency, manager_name: manager,
          consent: 'v1', consent_at: consentAt
        }
      }
    });
    if (res.error) { setMsg('su-msg', authErr(res.error)); return; }
    if (res.data.session) {
      await enterApp(res.data.user);
    } else {
      setMsg('su-msg', '가입 메일을 보냈습니다. 메일함에서 확인 링크를 누른 뒤 로그인해 주세요.', true);
      $('form-signup').reset();
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
  var email = str($('rs-email').value);
  setMsg('rs-msg', '');
  if (!email) { setMsg('rs-msg', '이메일을 입력해 주세요.'); return; }
  if (!LIVE) { setMsg('rs-msg', '데모 모드에는 비밀번호 재설정 메일이 없습니다. 새로 가입해 주세요.', true); return; }
  $('rs-go').disabled = true;
  try {
    var res = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (res.error) { setMsg('rs-msg', authErr(res.error)); return; }
    setMsg('rs-msg', '재설정 메일을 보냈습니다. 메일함의 링크를 눌러 새 비밀번호를 정해 주세요.', true);
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
  if (a.length < 6) { setMsg('np-msg', '비밀번호는 6자 이상으로 정해 주세요.'); return; }
  if (a !== b) { setMsg('np-msg', '두 비밀번호가 서로 다릅니다.'); return; }
  $('np-go').disabled = true;
  try {
    var res = await S.sb.auth.updateUser({ password: a });
    if (res.error) { setMsg('np-msg', authErr(res.error)); return; }
    setMsg('np-msg', '비밀번호를 바꿨습니다. 잠시 뒤 매물장으로 들어갑니다.', true);
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
      $('pending-who').textContent = (S.profile.agency_name || user.email) + ' · ' + (user.email || '');
      return;
    }

    $('auth').hidden = true; $('pending').hidden = true; $('app').hidden = false;
    $('ribbon').hidden = LIVE;

    var office = S.profile.agency_name || user.email.split('@')[0];
    $('hd-office').textContent = office;
    $('btn-admin').hidden = !admOk();
    $('hs-all').textContent = (BOARD.units || []).length.toLocaleString('ko-KR');
    document.title = office + ' · 센텀르엘 (매물)';

    buildBoard();
    S.ready = true;
    loadView();

    /* 이 기기에 남은 화면을 먼저 칠하고, 서버 기록으로 맞춘다 */
    S.notes = cachedNotes();
    paintAll();
    applyZoom();

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

    if (LIVE) {
      CloudStore.subscribe(onRemoteChange);
    } else {
      $('btn-sample').hidden = false;
    }
    setGuide();
    if (isNarrow()) setTab(101);
    $('boot').hidden = true;
  } catch (e) {
    console.error(e);
    $('boot').hidden = true;
    showAuth('login', authErr(e));
  }
}

async function loadProfile(user) {
  if (!LIVE) return { agency_name: '', manager_name: '', approved: true, role: 'user' };
  var res = await S.sb.from('profiles').select('agency_name,manager_name,approved,role').eq('id', user.id).maybeSingle();
  if (res.error && /role/i.test(res.error.message || '')) {
    /* 관리자 기능 이전에 만든 데이터베이스여도 앱은 그대로 열린다 */
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
  return { agency_name: m.agency_name || '', manager_name: m.manager_name || '', approved: true, role: 'user' };
}

function onRemoteChange(payload) {
  if (!S.user) return;
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
  if (!S.ready || !LIVE || S.pending.size) return;
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
var F_LBL = { status: '상태', price: '금액', owner_name: '소유주', tenant_name: '임차인', phone: '연락처', urgent: '급매', memo: '메모' };
var admEl = $('adm'), ov4 = $('ov4');
var adm = { on: false, tab: 'members', members: [], people: {}, logs: [], cursor: null,
            user: '', action: '', q: '', openUser: null, busy: false, logsLoaded: false };

function admOk() { return !!(LIVE && S.profile && S.profile.role === 'admin'); }

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
  return p[0] + '동 ' + hoNum(parseInt(p[2], 10), parseInt(p[1], 10)) + '호';
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
  return (list || ['status', 'price', 'owner_name', 'tenant_name', 'phone', 'memo'])
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
  ['status', 'price', 'owner_name', 'tenant_name', 'phone', 'urgent', 'memo'].forEach(function (f) {
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
  var res = await S.sb.from('profiles').select('id,agency_name,manager_name,email,role');
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
  admRenderMembers();
  admFillUserSelect();
}
function admRenderMembers() {
  var el = $('adm-members');
  if (!el) return;
  var q = norm($('adm-mq').value || '');
  var list = adm.members.filter(function (m) {
    return !q || norm([m.agency_name, m.manager_name, m.email].join(' ')).indexOf(q) >= 0;
  });
  if (!list.length) {
    el.innerHTML = '<div class="adm-empty">' + (adm.members.length ? '검색 결과가 없습니다.' : '아직 가입한 사무소가 없습니다.') + '</div>';
    return;
  }
  var head = '<div class="adm-mhead"><span>사무소</span><span>담당자</span><span>이메일</span><span style="text-align:right">매물</span><span style="text-align:right">마지막 활동</span><span style="text-align:right">권한</span></div>';
  el.innerHTML = head + list.map(function (m) {
    return '<button class="adm-mrow" type="button" data-uid="' + esc(m.user_id) + '">'
      + '<span class="am-name">' + esc(m.agency_name || '(사무소명 없음)') + '</span>'
      + '<span class="am-mgr">' + esc(m.manager_name || '—') + '</span>'
      + '<span class="am-mail">' + esc(m.email || '—') + '</span>'
      + '<span class="am-cnt">' + Number(m.listing_count || 0).toLocaleString('ko-KR') + '호실</span>'
      + '<span class="am-last">' + esc(admWhen(m.last_activity)) + '</span>'
      + (m.role === 'admin' ? '<span class="am-badge">관리자</span>' : '<span class="am-last">일반</span>')
      + '</button>';
  }).join('');  el.querySelectorAll('[data-uid]').forEach(function (b) {
    b.onclick = function () { admOpenOffice(b.dataset.uid); };
  });
}
function admFillUserSelect() {
  var sel = $('adm-user');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">전체 사무소</option>' + adm.members.map(function (m) {
    return '<option value="' + esc(m.user_id) + '">' + esc(m.agency_name || m.email || m.user_id) + '</option>';
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
  var head = '<div class="of-head">'
    + '<button class="btn" type="button" id="of-back">← 목록</button>'
    + '<b>' + esc(m.agency_name || p.agency_name || '(사무소명 없음)') + '</b>'
    + '<span>' + esc(m.manager_name || p.manager_name || '') + (p.email ? ' · ' + esc(p.email) : '') + '</span>'
    + '<span>가입 ' + esc(admWhen(m.created_at)) + '</span></div>';
  var chips = '<div class="of-chips">'
    + '<span class="of-chip">전체 <b>' + rows.length + '</b></span>'
    + '<span class="of-chip">매매 <b>' + cnt.sale + '</b></span>'
    + '<span class="of-chip">전세 <b>' + cnt.jeonse + '</b></span>'
    + '<span class="of-chip">월세 <b>' + cnt.wolse + '</b></span>'
    + '<span class="of-chip">보류·완료 <b>' + cnt.done + '</b></span>'
    + '<span class="of-chip">급매 <b>' + cnt.urg + '</b></span>'
    + '<span class="of-chip">기타 <b>' + cnt.none + '</b></span></div>';
  var table = rows.length ? ('<table class="of-table"><thead><tr>'
    + '<th>호실</th><th>상태</th><th>금액</th><th>소유주</th><th>임차인</th><th>연락처</th><th>메모</th><th>수정</th>'
    + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>'
        + '<td class="num-c">' + esc(admUnit(r.unit_key)) + (r.urgent ? ' <span class="al-act delete" style="padding:0 5px">급</span>' : '') + '</td>'
        + '<td>' + esc(ST_NAME[cleanState(r.status)] || '—') + '</td>'
        + '<td>' + esc(str(r.price) || '—') + '</td>'
        + '<td>' + esc(str(r.owner_name) || '—') + '</td>'
        + '<td>' + esc(str(r.tenant_name) || '—') + '</td>'
        + '<td>' + esc(str(r.phone) || '—') + '</td>'
        + '<td class="memo-c">' + esc(cut(r.memo || '', 60) || '—') + '</td>'
        + '<td>' + esc(admWhen(r.updated_at)) + '</td>'
        + '</tr>';
    }).join('') + '</tbody></table>') : '<div class="adm-empty">등록한 매물이 없습니다.</div>';
  box.innerHTML = head + chips + table;
  $('of-back').onclick = function () {
    box.hidden = true;
    $('adm-members').hidden = false;
    adm.openUser = null;
  };
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
  var g = adm.logs.filter(function (x) { return String(x.id) === String(id); })[0];
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

$('btn-admin').onclick = admOpen;
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
      enterApp({ id: 'demo:' + d.session, email: d.session }, { agency_name: u.agency, manager_name: u.manager, approved: u.approved !== false });
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
      if (event === 'PASSWORD_RECOVERY') { showAuth('newpw'); return; }
      if (event === 'SIGNED_OUT') { if (S.ready) signOut(); }
    });
    var got = await S.sb.auth.getSession();
    var session = got.data && got.data.session;
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
