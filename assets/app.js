import { TRIP, PREP, DAYS, SPOTS, STAY, RESTAURANTS, FOOD, BUDGET, PHRASES, TIPS, EMERGENCY } from './data.js';

/* ================= helpers ================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = k => 'weihai.' + k;

const store = {
  get(k, d) { try { const v = localStorage.getItem(KEY(k)); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch {} },
  del(k)    { try { localStorage.removeItem(KEY(k)); } catch {} }
};

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1900);
}

async function copy(text, msg = '복사했습니다') {
  try {
    if (navigator.clipboard && isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(msg);
  } catch { toast('복사에 실패했습니다'); }
}

const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
const yuan = n => '¥' + Math.round(n).toLocaleString('ko-KR');

/* ================= state ================= */
const state = {
  rate:   store.get('rate', TRIP.defaultRate),
  pax:    store.get('pax', 4),
  tier:   store.get('tier', 'mid'),
  prep:   store.get('prep', {}),
  exp:    store.get('exp', []),
  flight: store.get('flight', {}),
  day:    1,
  phraseGroup: '전체'
};

/* apply shared settings from URL (?s=base64) */
(function applyShared() {
  try {
    const raw = new URLSearchParams(location.search).get('s');
    if (!raw) return;
    const json = decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))));
    const d = JSON.parse(json);
    if (d.rate)   { state.rate = +d.rate;   store.set('rate', state.rate); }
    if (d.pax)    { state.pax = +d.pax;     store.set('pax', state.pax); }
    if (d.flight) { state.flight = d.flight; store.set('flight', state.flight); }
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(() => toast('가족이 공유한 설정을 불러왔습니다'), 900);
  } catch {}
})();

/* ================= theme ================= */
(function theme() {
  const saved = store.get('theme', null);
  if (saved) document.documentElement.dataset.theme = saved;
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  });
})();

/* ================= router ================= */
const VIEWS = ['home', 'prep', 'days', 'spots', 'budget', 'tips'];
function go(name, opts = {}) {
  if (!VIEWS.includes(name)) name = 'home';
  VIEWS.forEach(v => { $('#view-' + v).hidden = v !== name; });
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === name));
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
addEventListener('hashchange', () => go(location.hash.slice(1)));

/* ================= HOME ================= */
function renderDday() {
  const start = new Date(TRIP.start + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(TRIP.end + 'T00:00:00');
  const diff = Math.round((start - today) / 86400000);
  const el = $('#dday');
  if (diff > 0)        el.textContent = `출발 D-${diff}`;
  else if (today <= end) {
    const n = Math.round((today - start) / 86400000) + 1;
    el.textContent = `여행 ${n}일차 진행 중`;
  } else               el.textContent = '여행 완료 🎉';
}

function renderWeather() {
  $('#wxSummary').textContent = TRIP.weather.summary;
  $('#wxPoints').innerHTML = TRIP.weather.points.map(p => `<li>${esc(p)}</li>`).join('');
}

function renderDayStrip() {
  $('#dayStrip').innerHTML = DAYS.map(d => `
    <button class="ds" data-day="${d.n}" type="button">
      <span class="ds-n">D${d.n}<br>${d.date.slice(5).replace('-', '.')}</span>
      <span class="ds-b">
        <span class="ds-t">${esc(d.title)}</span>
        <span class="ds-s">${d.date.slice(5).replace('-', '/')} ${d.dow} · ${esc(d.theme)} · 도보 ${esc(d.walk)}</span>
      </span>
      <span class="ds-x">›</span>
    </button>`).join('');
  $$('#dayStrip .ds').forEach(b => b.addEventListener('click', () => {
    state.day = +b.dataset.day; renderDay(); go('days');
  }));
}

function renderFlight() {
  const f = state.flight;
  const seg = (dir, no, dep, arr, from, to) => {
    if (!no && !dep && !arr) return `
      <div class="fl"><span class="fl-dir">${dir}</span>
        <span class="fl-body"><span class="fl-empty">아직 입력되지 않았습니다 — “수정”을 눌러 편명과 시각을 넣어주세요.</span></span>
      </div>`;
    return `
      <div class="fl"><span class="fl-dir">${dir}</span>
        <span class="fl-body">
          <span class="fl-route">${esc(from)} <i>→</i> ${esc(to)}</span>
          <span class="fl-meta">${[no && esc(no), (dep || arr) ? `${esc(dep || '--:--')} 출발 · ${esc(arr || '--:--')} 도착` : ''].filter(Boolean).join(' · ')}</span>
        </span>
      </div>`;
  };
  let html = seg('가는 편', f.outNo, f.outDep, f.outArr, '인천 ICN', '웨이하이 WEH')
           + seg('오는 편', f.retNo, f.retDep, f.retArr, '웨이하이 WEH', '인천 ICN');
  $('#flightView').innerHTML = html;
}


/* ---- 숙소 ---- */
function renderStay() {
  const manual = (state.flight.hotel || '').trim();

  if (!STAY.length && !manual) {
    $('#stayView').innerHTML = `
      <p class="lead">아직 등록된 숙소가 없습니다.</p>
      <p class="hint">확정되면 항공편 카드의 <b>수정</b>에서 숙소 이름·주소를 넣거나,
      <code>assets/data.js</code> 의 <b>STAY</b> 에 채워 넣으세요. 중국어 주소를 함께 넣으면
      택시 기사에게 화면을 그대로 보여줄 수 있습니다.</p>`;
    return;
  }

  const list = STAY.length ? STAY : [{ ko: manual, cn: '', addr: manual }];

  $('#stayView').innerHTML = list.map((h, i) => {
    const showable = h.addr || h.cn || h.ko;
    const meta = [
      h.ci && h.co ? `${h.ci.slice(5).replace('-', '/')} – ${h.co.slice(5).replace('-', '/')}` : '',
      h.book ? `예약 ${h.book}` : ''
    ].filter(Boolean).join(' · ');
    return `
      <div class="stay">
        <div class="stay-top">
          <div class="stay-name">${esc(h.ko || h.cn)}</div>
          ${h.cn && h.ko ? `<div class="stay-cn">${esc(h.cn)}</div>` : ''}
        </div>
        ${h.addr ? `<div class="stay-addr">${esc(h.addr)}</div>` : ''}
        ${h.addrKo ? `<div class="stay-addr-ko">${esc(h.addrKo)}</div>` : ''}
        ${meta ? `<div class="stay-meta">${esc(meta)}</div>` : ''}
        ${h.memo ? `<div class="stay-meta">${esc(h.memo)}</div>` : ''}
        <div class="spot-acts">
          <button data-stay="${i}" type="button">기사에게 보여주기</button>
          <button data-copy="${esc(showable)}" type="button">주소 복사</button>
          ${h.tel ? `<a href="tel:${esc(h.tel.replace(/[^+\d]/g, ''))}">호텔 전화</a>` : ''}
          <a href="https://www.amap.com/search?query=${encodeURIComponent(h.cn || h.addr || h.ko)}" target="_blank" rel="noopener">지도에서 열기</a>
        </div>
      </div>`;
  }).join('');

  $$('#stayView [data-stay]').forEach(b => b.addEventListener('click', () => {
    const h = list[+b.dataset.stay];
    showBig({ ko: '이 호텔로 가주세요 · 请送我去这家酒店', cn: h.addr || h.cn || h.ko, py: h.ko || '' });
  }));
  $$('#stayView [data-copy]').forEach(b =>
    b.addEventListener('click', () => copy(b.dataset.copy)));
}

/* ---- 식당 ---- */
function renderRestaurants(targetSel = '#restList', filterDay = null) {
  const el = $(targetSel);
  if (!el) return;
  const list = filterDay ? RESTAURANTS.filter(r => r.day === filterDay) : RESTAURANTS;

  if (!list.length) {
    el.innerHTML = filterDay ? '' : `
      <div class="card">
        <p class="lead">아직 등록된 식당이 없습니다.</p>
        <p class="hint">확정되면 <code>assets/data.js</code> 의 <b>RESTAURANTS</b> 에 채워 넣으세요.
        <b>day</b> 를 지정하면 해당 일차 일정 화면에도 자동으로 함께 표시됩니다.</p>
      </div>`;
    return;
  }

  el.innerHTML = list.map(r => `
    <div class="rest">
      <div class="rest-h">
        <div class="rest-b">
          <div class="rest-t">${esc(r.ko || r.cn)}${r.cn && r.ko ? `<em>${esc(r.cn)}</em>` : ''}</div>
          <div class="rest-sub">
            ${r.day ? `<span class="dayx">Day ${r.day}</span>` : ''}
            ${r.meal ? `<span class="tagx">${esc(r.meal)}</span>` : ''}
            ${r.area ? `<span class="rest-area">${esc(r.area)}</span>` : ''}
          </div>
        </div>
        ${r.price ? `<div class="food-p">${esc(r.price)}</div>` : ''}
      </div>
      ${r.menu ? `<div class="rest-menu">추천 · ${esc(r.menu)}</div>` : ''}
      ${r.memo ? `<div class="rest-memo">${esc(r.memo)}</div>` : ''}
      <div class="spot-acts">
        <button data-copy="${esc(r.cn || r.ko)}" type="button">상호 복사</button>
        <a href="https://www.amap.com/search?query=${encodeURIComponent(r.cn || r.ko)}" target="_blank" rel="noopener">지도에서 열기</a>
      </div>
    </div>`).join('');

  $$(`${targetSel} [data-copy]`).forEach(b =>
    b.addEventListener('click', () => copy(b.dataset.copy, `"${b.dataset.copy}" 복사 완료`)));
}

/* flight modal */
const FF = ['fOutNo','fOutDep','fOutArr','fRetNo','fRetDep','fRetArr','fHotel'];
const ffKey = id => id.replace(/^f/, '').replace(/^./, c => c.toLowerCase());

$('#flightEdit').addEventListener('click', () => {
  FF.forEach(id => { $('#' + id).value = state.flight[ffKey(id)] || ''; });
  $('#flightModal').hidden = false;
});
$('#flightCancel').addEventListener('click', () => { $('#flightModal').hidden = true; });
$('#flightForm').addEventListener('submit', e => {
  e.preventDefault();
  state.flight = Object.fromEntries(FF.map(id => [ffKey(id), $('#' + id).value.trim()]));
  store.set('flight', state.flight);
  $('#flightModal').hidden = true;
  renderFlight(); renderStay();
  toast('저장했습니다');
});

/* ================= PREP ================= */
function prepStats() {
  const total = PREP.reduce((a, g) => a + g.items.length, 0);
  const done = Object.values(state.prep).filter(Boolean).length;
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}
function renderPrepBars() {
  const { total, done, pct } = prepStats();
  ['#prepBar', '#prepBar2'].forEach(s => { const e = $(s); if (e) e.style.width = pct + '%'; });
  ['#prepTxt', '#prepTxt2'].forEach(s => { const e = $(s); if (e) e.textContent = `${done} / ${total} 완료`; });
  $('#prepPct').textContent = pct + '%';
}
function renderPrep() {
  $('#prepList').innerHTML = PREP.map((g, gi) => `
    <section class="grp${gi === 0 ? ' open' : ''}" data-grp="${g.id}">
      <button class="grp-h" type="button">
        <span class="grp-ic">${g.icon}</span>
        <span class="grp-t"><b>${esc(g.title)}</b><small>${g.items.length}개 항목 · <span class="gcount">0</span>개 완료</small></span>
        <span class="grp-x">▼</span>
      </button>
      <div class="grp-body">
        ${g.note ? `<p class="grp-note">${esc(g.note)}</p>` : ''}
        ${g.items.map((it, i) => {
          const id = `${g.id}-${i}`;
          return `<label class="chk">
            <input type="checkbox" data-k="${id}"${state.prep[id] ? ' checked' : ''}>
            <span class="box"></span>
            <span class="chk-t"><b>${esc(it.t)}</b>${it.d ? `<small>${esc(it.d)}</small>` : ''}</span>
          </label>`;
        }).join('')}
      </div>
    </section>`).join('');

  $$('#prepList .grp-h').forEach(h =>
    h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  $$('#prepList input[type=checkbox]').forEach(c =>
    c.addEventListener('change', () => {
      state.prep[c.dataset.k] = c.checked;
      store.set('prep', state.prep);
      renderPrepBars(); renderGroupCounts();
    }));
  renderGroupCounts(); renderPrepBars();
}
function renderGroupCounts() {
  PREP.forEach(g => {
    const n = g.items.filter((_, i) => state.prep[`${g.id}-${i}`]).length;
    const el = $(`[data-grp="${g.id}"] .gcount`);
    if (el) el.textContent = n;
  });
}
$('#prepReset').addEventListener('click', () => {
  if (!confirm('준비물 체크를 모두 지울까요?')) return;
  state.prep = {}; store.set('prep', state.prep); renderPrep(); toast('초기화했습니다');
});

/* ================= DAYS ================= */
function renderDayTabs() {
  $('#dayTabs').innerHTML = `<div class="daytabs-in">${
    DAYS.map(d => `<button class="dt${d.n === state.day ? ' on' : ''}" data-d="${d.n}" type="button">
      <b>D${d.n}</b><small>${d.date.slice(5).replace('-', '/')} ${d.dow}</small></button>`).join('')
  }</div>`;
  $$('#dayTabs .dt').forEach(b => b.addEventListener('click', () => {
    state.day = +b.dataset.d; renderDay();
    $('#view-days').scrollIntoView({ block: 'start' });
  }));
}
function renderDay() {
  renderDayTabs();
  const d = DAYS.find(x => x.n === state.day) || DAYS[0];
  $('#dayBody').innerHTML = `
    <div class="day-head">
      <h2>Day ${d.n} · ${esc(d.title)}</h2>
      <div class="dh-meta">
        <span class="pill">${d.date.replace(/-/g, '.')} (${d.dow})</span>
        <span class="pill">${esc(d.theme)}</span>
        <span class="pill">도보 ${esc(d.walk)}</span>
      </div>
      <p>${esc(d.summary)}</p>
    </div>
    <div class="tl">
      ${d.blocks.map(b => `
        <article class="tlx">
          <div class="tl-top">
            ${b.time ? `<span class="tl-time">${esc(b.time)}</span>` : ''}
            <span class="tl-tag" data-t="${esc(b.tag)}">${esc(b.tag)}</span>
            ${b.cost ? `<span class="tl-cost">${esc(b.cost)}</span>` : ''}
          </div>
          <h3>${esc(b.title)}</h3>
          ${b.desc ? `<p>${esc(b.desc)}</p>` : ''}
          ${b.spot ? `<button class="tl-link" data-spot="${b.spot}" type="button">코스 상세 보기 →</button>` : ''}
        </article>`).join('')}
    </div>`;
  const dayRest = RESTAURANTS.filter(r => r.day === d.n);
  if (dayRest.length) {
    $('#dayBody').insertAdjacentHTML('beforeend',
      `<div class="page-h" style="margin-top:22px"><h1 style="font-size:19px">Day ${d.n} 식당</h1></div><div id="dayRestList"></div>`);
    renderRestaurants('#dayRestList', d.n);
  }

  $$('#dayBody [data-spot]').forEach(b => b.addEventListener('click', () => {
    go('spots');
    setTimeout(() => {
      const el = $(`.spot[data-id="${b.dataset.spot}"]`);
      if (!el) return;
      el.classList.add('open');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }));
}

/* ================= SPOTS ================= */
function renderSpots() {
  $('#spotList').innerHTML = SPOTS.map(s => `
    <section class="spot" data-id="${s.id}">
      <button class="spot-h" type="button">
        <span class="spot-rank${s.rank <= 3 ? ' top' : ''}">${s.rank}</span>
        <span class="spot-b">
          <span class="spot-title">${esc(s.ko)} <em>${esc(s.cn)}</em></span>
          <span class="spot-sub">
            <span class="star">${'★'.repeat(s.star)}${'☆'.repeat(5 - s.star)}</span>
            <span class="tagx">${esc(s.tag)}</span>
            <span class="dayx">Day ${s.day}</span>
          </span>
        </span>
        <span class="grp-x">▼</span>
      </button>
      <div class="spot-body">
        <p class="spot-why">${esc(s.why)}</p>
        <div class="kv">
          <div><small>입장료</small><b>${esc(s.fee)}</b></div>
          <div><small>소요 시간</small><b>${esc(s.time)}</b></div>
        </div>
        <ul class="tiplist">${s.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="spot-acts">
          <button data-copy="${esc(s.cn)}" type="button">중국어 이름 복사</button>
          <a href="https://www.amap.com/search?query=${encodeURIComponent(s.cn)}" target="_blank" rel="noopener">高德지도에서 열기</a>
        </div>
      </div>
    </section>`).join('');

  $$('#spotList .spot-h').forEach(h =>
    h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  $$('#spotList [data-copy]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      copy(b.dataset.copy, `"${b.dataset.copy}" 복사 완료`);
    }));

  renderRestaurants();

  $('#foodList').innerHTML = FOOD.map(f => `
    <div class="food">
      <div class="food-b">
        <div class="food-t">${esc(f.ko)}<em>${esc(f.cn)}</em></div>
        <div class="food-d">${esc(f.desc)}</div>
      </div>
      <div class="food-p">${esc(f.price)}</div>
    </div>`).join('');
}

/* ================= BUDGET ================= */
function toKRW(v, unit) { return unit === 'CNY' ? v * state.rate : v; }

function renderBudget() {
  $('#budgetNote').textContent = BUDGET.note;
  $('#rateIn').value = state.rate;
  $('#paxIn').value = state.pax;
  $$('#tierSeg button').forEach(b => b.classList.toggle('on', b.dataset.tier === state.tier));

  let perPerson = 0;
  $('#budgetRows').innerHTML = BUDGET.rows.map(r => {
    const v = r[state.tier];
    const krw = toKRW(v, r.unit);
    perPerson += krw;
    return `<div class="brow">
      <div class="brow-b">
        <div class="brow-t">${esc(r.cat)}</div>
        <div class="brow-m">${esc(r.memo)}</div>
      </div>
      <div class="brow-v">
        <b>${won(krw)}</b>
        ${r.unit === 'CNY' ? `<small>${yuan(v)}</small>` : ''}
      </div>
    </div>`;
  }).join('');

  $('#perPerson').textContent = won(perPerson);
  $('#paxLabel').textContent = `${state.pax}명 전체 합계`;
  $('#totalAll').textContent = won(perPerson * state.pax);
  state.perPersonKRW = perPerson;
  renderExpenses();
}

$('#rateIn').addEventListener('input', e => {
  const v = +e.target.value;
  if (!v || v < 50) return;
  state.rate = v; store.set('rate', v); renderBudget();
});
$('#paxIn').addEventListener('input', e => {
  const v = Math.max(1, Math.min(12, +e.target.value || 1));
  state.pax = v; store.set('pax', v); renderBudget();
});
$$('#tierSeg button').forEach(b => b.addEventListener('click', () => {
  state.tier = b.dataset.tier; store.set('tier', state.tier); renderBudget();
}));

$('#expForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#expName').value.trim();
  const amt = +$('#expAmt').value;
  const cur = $('#expCur').value;
  if (!name || !(amt > 0)) return;
  state.exp.unshift({ id: Date.now(), name, amt, cur, at: new Date().toISOString() });
  store.set('exp', state.exp);
  $('#expName').value = ''; $('#expAmt').value = '';
  renderExpenses();
  toast('기록했습니다');
});
$('#expClear').addEventListener('click', () => {
  if (!state.exp.length) return;
  if (!confirm('지출 기록을 모두 지울까요?')) return;
  state.exp = []; store.set('exp', state.exp); renderExpenses();
});

function renderExpenses() {
  const totalKRW = state.exp.reduce((a, x) => a + (x.cur === 'CNY' ? x.amt * state.rate : x.amt), 0);
  $('#expTotal').textContent = won(totalKRW);
  const base = (state.perPersonKRW || 1) * state.pax;
  const pct = Math.min(999, Math.round(totalKRW / base * 100));
  $('#expRatio').textContent = pct + '%';
  $('#expBar').style.width = Math.min(100, pct) + '%';

  $('#expList').innerHTML = state.exp.length
    ? state.exp.map(x => {
        const krw = x.cur === 'CNY' ? x.amt * state.rate : x.amt;
        const d = new Date(x.at);
        return `<div class="exp">
          <div class="exp-b">
            <div class="exp-n">${esc(x.name)}</div>
            <div class="exp-d">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${x.cur === 'CNY' ? yuan(x.amt) : won(x.amt)}</div>
          </div>
          <div class="exp-a">${won(krw)}</div>
          <button class="exp-x" data-del="${x.id}" type="button" aria-label="삭제">×</button>
        </div>`;
      }).join('')
    : '<p class="empty">아직 기록이 없습니다.</p>';

  $$('#expList [data-del]').forEach(b => b.addEventListener('click', () => {
    state.exp = state.exp.filter(x => x.id !== +b.dataset.del);
    store.set('exp', state.exp); renderExpenses();
  }));
}

/* ================= TIPS / PHRASES / EMERGENCY ================= */
function renderTips() {
  $('#tipList').innerHTML = TIPS.map(t => `
    <div class="tip">
      <div class="tip-t"><span>${t.icon}</span>${esc(t.title)}</div>
      <p class="tip-b">${esc(t.body)}</p>
    </div>`).join('');

  const groups = ['전체', ...new Set(PHRASES.map(p => p.g))];
  $('#phraseSeg').innerHTML = groups.map(g =>
    `<button data-g="${esc(g)}" class="${g === state.phraseGroup ? 'on' : ''}" type="button">${esc(g)}</button>`).join('');
  $$('#phraseSeg button').forEach(b => b.addEventListener('click', () => {
    state.phraseGroup = b.dataset.g; renderTips();
  }));

  const list = PHRASES.filter(p => state.phraseGroup === '전체' || p.g === state.phraseGroup);
  $('#phraseList').innerHTML = list.map((p, i) => `
    <button class="ph" data-i="${PHRASES.indexOf(p)}" type="button">
      <span class="ph-b">
        <span class="ph-ko">${esc(p.ko)}</span>
        <span class="ph-cn">${esc(p.cn)}</span>
        <span class="ph-py">${esc(p.py)}</span>
      </span>
      <span class="ph-x">⤢</span>
    </button>`).join('');
  $$('#phraseList .ph').forEach(b => b.addEventListener('click', () => showBig(PHRASES[+b.dataset.i])));

  $('#emgList').innerHTML = EMERGENCY.map(e => `
    <a class="emg" href="tel:${e.num.replace(/[^+\d]/g, '')}">
      <span class="emg-b"><span class="emg-t">${esc(e.ko)}</span><span class="emg-d">${esc(e.desc)}</span></span>
      <span class="emg-n">${esc(e.num)}</span>
    </a>`).join('');
}
function showBig(p) {
  $('#bigKo').textContent = p.ko;
  $('#bigCn').textContent = p.cn;
  $('#bigPy').textContent = p.py;
  $('#bigCard').hidden = false;
}
$('#bigClose').addEventListener('click', () => { $('#bigCard').hidden = true; });
$('#bigCard').addEventListener('click', e => { if (e.target.id === 'bigCard') $('#bigCard').hidden = true; });

/* ================= share / settings ================= */
function shareURL() {
  const payload = { rate: state.rate, pax: state.pax, flight: state.flight };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_');
  return location.origin + location.pathname + '?s=' + b64;
}
$('#shareBtn').addEventListener('click', async () => {
  const url = shareURL();
  const text = `[웨이하이 가족여행 9/17-9/21]\n일정·준비물·예산을 여기서 같이 봐요 👇\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: '웨이하이 가족여행', text: '일정·준비물·예산 한눈에', url }); return; } catch {}
  }
  copy(text, '링크를 복사했습니다. 단톡방에 붙여넣으세요');
});
$('#exportBtn').addEventListener('click', () => copy(shareURL(), '설정이 담긴 링크를 복사했습니다'));
$('#wipeBtn').addEventListener('click', () => {
  if (!confirm('이 기기에 저장된 체크리스트·지출·설정을 모두 지울까요?')) return;
  ['prep', 'exp', 'flight', 'rate', 'pax', 'tier', 'theme'].forEach(store.del);
  location.reload();
});

/* PWA install prompt */
let deferredPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const b = $('#installBtn'); b.hidden = false;
  b.onclick = async () => { b.hidden = true; deferredPrompt.prompt(); deferredPrompt = null; };
});

/* ================= boot ================= */
renderDday();
renderWeather();
renderDayStrip();
renderFlight();
renderStay();
renderPrep();
renderDay();
renderSpots();
renderBudget();
renderTips();
go(location.hash.slice(1) || 'home', { keepScroll: true });

addEventListener('load', () => {
  setTimeout(() => $('#splash').classList.add('gone'), 620);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
