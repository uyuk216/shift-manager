import { store, isRemote } from './store.js';
import { DEFAULT_SETTINGS, STEP, calcShift, summarize, fmtHours, yen, toMin } from './calc.js';
import { buildICS } from './ics.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const COLORS = ['#3b6cf6', '#e2586b', '#2e9e6b', '#e0932b', '#8b5cf6', '#0ea5b7'];

const S = { session: null, tab: 'cal', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), settings: DEFAULT_SETTINGS, workplaces: [], shifts: [] };
const dlg = $('#dlg');

const wpOf = (id) => S.workplaces.find((w) => w.id === id);
const monthShifts = () => S.shifts.filter((s) => s.date.startsWith(`${S.month.getFullYear()}-${pad(S.month.getMonth() + 1)}`));
const byTime = (a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time);

async function boot() {
  store.onAuth(async (s) => { S.session = s; await refresh(); });
  S.session = await store.session();
  await refresh();
}
async function refresh() {
  if (S.session) {
    try { Object.assign(S, await store.load()); } catch (e) { alert('読み込み失敗: ' + e.message); }
  }
  render();
}
async function run(fn) { try { await fn(); await refresh(); } catch (e) { alert('保存失敗: ' + (e.message ?? e)); } }

// ---------- render ----------
function render() {
  const app = $('#app');
  if (!S.session) return (app.innerHTML = authView(), bindAuth());
  app.innerHTML = `
  <header><h1>📅 シフト管理</h1>
    <span class="mut">${esc(S.session.user?.email)}</span>
    ${isRemote ? '<button id="out">ログアウト</button>' : ''}</header>
  ${isRemote ? '' : '<div class="card mut">ローカルモード：データはこのブラウザにだけ保存されます。ログイン・端末間同期は js/config.js に Supabase を設定すると有効になります。</div>'}
  <div class="tabs">${[['cal', 'カレンダー'], ['sum', '集計・書き出し'], ['set', '設定']].map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${S.tab === 'cal' ? calView() : S.tab === 'sum' ? sumView() : setView()}`;
  $('#out')?.addEventListener('click', () => store.signOut());
  document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; render(); });
  ({ cal: bindCal, sum: bindSum, set: bindSet })[S.tab]();
}

function authView() {
  return `<div class="card" style="max-width:380px;margin:12vh auto;text-align:center">
  <h1 style="font-size:20px;margin-top:0">📅 シフト管理</h1>
  <p class="mut">Google アカウントでログインします</p>
  <div class="msg" id="am"></div>
  <button class="pri" id="gg" style="width:100%">Google でログイン</button></div>`;
}
function bindAuth() {
  $('#gg').onclick = async () => {
    const { error } = await store.signInGoogle();
    if (error) $('#am').textContent = error.message;
  };
}

function monthNav() {
  return `<div class="nav"><button data-m="-1">◀</button><b>${S.month.getFullYear()}年${S.month.getMonth() + 1}月</b><button data-m="1">▶</button></div>`;
}
function bindNav() {
  document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + +b.dataset.m, 1); render(); });
}

function calView() {
  const first = S.month, start = new Date(first); start.setDate(1 - first.getDay());
  const today = ymd(new Date());
  const t = summarize(monthShifts(), S.workplaces, S.settings);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const key = ymd(d);
    const chips = S.shifts.filter((s) => s.date === key).sort(byTime).map((s) =>
      `<span class="chip" data-edit="${s.id}" style="background:${wpOf(s.workplace_id)?.color ?? '#888'}">${s.start_time}-${s.end_time}</span>`).join('');
    cells += `<div class="day ${d.getMonth() !== first.getMonth() ? 'out' : ''} ${key === today ? 'today' : ''} ${d.getDay() === 0 ? 'sun' : ''}" data-day="${key}"><div class="n">${d.getDate()}</div>${chips}</div>`;
  }
  return `${monthNav()}
  <div class="card stats"><div class="stat"><small>勤務時間</small><b>${fmtHours(t.work)}</b></div><div class="stat"><small>給与（交通費込）</small><b>${yen(t.grand)}</b></div><div class="stat"><small>出勤日数</small><b>${t.days.size}日</b></div></div>
  <div class="grid">${'日月火水木金土'.split('').map((d) => `<div class="dow">${d}</div>`).join('')}${cells}</div>`;
}
function bindCal() {
  bindNav();
  document.querySelectorAll('[data-edit]').forEach((c) => c.onclick = (e) => { e.stopPropagation(); shiftDialog(S.shifts.find((s) => s.id === c.dataset.edit)); });
  document.querySelectorAll('[data-day]').forEach((c) => c.onclick = () => shiftDialog({ date: c.dataset.day }));
}

function sumView() {
  const ms = monthShifts().sort(byTime), t = summarize(ms, S.workplaces, S.settings);
  const rows = ms.map((s) => { const c = calcShift(s, wpOf(s.workplace_id), S.settings);
    return `<tr><td>${s.date.slice(5).replace('-', '/')}</td><td>${esc(wpOf(s.workplace_id)?.name)}</td><td>${s.start_time}-${s.end_time}</td><td class="r">${fmtHours(c.work)}${c.night ? ` <small class="mut">深夜${fmtHours(c.night)}</small>` : ''}</td><td class="r">${yen(c.pay)}</td></tr>`; }).join('');
  const wps = Object.values(t.byWp).map((g) => `<tr><td>${esc(g.wp?.name ?? '-')}</td><td class="r">${fmtHours(g.work)}</td><td class="r">${yen(g.pay)}</td><td class="r">${yen(g.transport)}</td></tr>`).join('');
  return `${monthNav()}
  <div class="card stats"><div class="stat"><small>実働</small><b>${fmtHours(t.work)}</b></div><div class="stat"><small>うち深夜</small><b>${fmtHours(t.night)}</b></div><div class="stat"><small>うち残業</small><b>${fmtHours(t.ot)}</b></div><div class="stat"><small>給与</small><b>${yen(t.pay)}</b></div><div class="stat"><small>交通費</small><b>${yen(t.transport)}</b></div><div class="stat"><small>合計</small><b>${yen(t.grand)}</b></div></div>
  <div class="card"><b>勤務先別</b><table><tr><th></th><th class="r">実働</th><th class="r">給与</th><th class="r">交通費</th></tr>${wps || '<tr><td class="mut">シフトなし</td></tr>'}</table></div>
  <div class="card"><b>明細</b><table>${rows || '<tr><td class="mut">シフトなし</td></tr>'}</table></div>
  <div class="card"><b>端末のカレンダーに反映</b><p class="mut">.ics ファイルを書き出し、開いて「すべて追加」すると iPhone / Android / Google / Outlook にまとめて入ります。再度取り込んでも同じシフトは重複せず更新されます。</p>
  <div class="actions" style="justify-content:flex-start"><button class="pri" id="ics-m">${S.month.getMonth() + 1}月分を書き出す</button><button id="ics-a">今日以降すべて</button></div></div>`;
}
function bindSum() {
  bindNav();
  const dl = (list, name) => {
    if (!list.length) return alert('書き出すシフトがありません');
    const url = URL.createObjectURL(new Blob([buildICS(list.sort(byTime), S.workplaces, S.settings)], { type: 'text/calendar' }));
    Object.assign(document.createElement('a'), { href: url, download: name }).click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  $('#ics-m').onclick = () => dl(monthShifts(), `shifts-${S.month.getFullYear()}-${pad(S.month.getMonth() + 1)}.ics`);
  $('#ics-a').onclick = () => dl(S.shifts.filter((s) => s.date >= ymd(new Date())), 'shifts-upcoming.ics');
}

function setView() {
  const s = S.settings, n = (k, l, step = 1) => `<label>${l}</label><input type="number" data-k="${k}" value="${s[k]}" min="0" step="${step}">`;
  const c = (k, l) => `<label class="chk"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}>${l}</label>`;
  return `<div class="card"><b>勤務先・時給</b>
  ${S.workplaces.map((w) => `<div class="wp"><i style="background:${w.color}"></i><span>${esc(w.name)}　${yen(w.wage)}/h</span><button data-wp="${w.id}">編集</button></div>`).join('')}
  <div class="actions" style="justify-content:flex-start"><button class="pri" id="wp-add">＋ 勤務先を追加</button></div></div>
  <div class="card"><b>計算ルール</b>
  <div class="row">${n('default_wage', '基本時給（円）')}${n('transport_default', '交通費/日（円）')}</div>
  ${c('night_enabled', '深夜割増')}<div class="row">${n('night_start', '開始（時）')}${n('night_end', '終了（時）')}${n('night_rate', '割増（%）')}</div>
  ${c('overtime_enabled', '残業割増（1日）')}<div class="row">${n('overtime_hours', '超過ライン（時間）')}${n('overtime_rate', '割増（%）')}</div>
  ${c('break_enabled', '休憩を自動で差し引く')}
  ${s.break_rules.map((r, i) => `<div class="row"><div><label>拘束が</label><input type="number" data-br="${i}" data-f="over" value="${r.over / 60}" step="0.5" min="0"></div><div><label>時間超なら休憩(分)</label><input type="number" data-br="${i}" data-f="minutes" value="${r.minutes}" step="${STEP}" min="0"></div><button data-brdel="${i}" class="dng" style="flex:none">削除</button></div>`).join('')}
  <div class="actions" style="justify-content:flex-start"><button id="br-add">＋ 休憩ルール</button></div>
  <p class="mut">深夜・残業が重なる時間は割増率を加算します（25%+25%=50%）。時刻は${STEP}分刻みです。</p>
  <div class="actions"><button class="pri" id="st-save">ルールを保存</button></div></div>`;
}
function bindSet() {
  $('#wp-add').onclick = () => wpDialog({});
  document.querySelectorAll('[data-wp]').forEach((b) => b.onclick = () => wpDialog(wpOf(b.dataset.wp)));
  const rules = () => S.settings.break_rules;
  $('#br-add').onclick = () => { rules().push({ over: 360, minutes: 45 }); render(); };
  document.querySelectorAll('[data-brdel]').forEach((b) => b.onclick = () => { rules().splice(+b.dataset.brdel, 1); render(); });
  $('#st-save').onclick = () => {
    const st = { ...S.settings };
    document.querySelectorAll('[data-k]').forEach((i) => st[i.dataset.k] = i.type === 'checkbox' ? i.checked : Number(i.value) || 0);
    st.break_rules = [...document.querySelectorAll('[data-br]')].reduce((a, i) => { (a[i.dataset.br] ??= {})[i.dataset.f] = i.dataset.f === 'over' ? Math.round(i.value * 60) : Number(i.value); return a; }, []);
    run(() => store.save('settings', st));
  };
}

// ---------- dialogs ----------
function openDlg(html) { dlg.innerHTML = `<form method="dialog">${html}</form>`; dlg.showModal(); }
const snap = (t) => { const m = Math.round(toMin(t) / STEP) * STEP; return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };

function shiftDialog(sh) {
  if (!S.workplaces.length) return alert('先に「設定」で勤務先を追加してください');
  const s = { start_time: '09:00', end_time: '17:00', workplace_id: S.workplaces[0].id, break_min: null, note: '', ...sh };
  openDlg(`<b>${s.id ? 'シフトを編集' : 'シフトを追加'}</b>
  <label>日付</label><input id="d" type="date" value="${s.date}" required>
  <label>勤務先</label><select id="w">${S.workplaces.map((w) => `<option value="${w.id}" ${w.id === s.workplace_id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
  <div class="row"><div><label>開始</label><input id="a" type="time" step="${STEP * 60}" value="${s.start_time}" required></div><div><label>終了（日跨ぎOK）</label><input id="b" type="time" step="${STEP * 60}" value="${s.end_time}" required></div></div>
  <label>休憩（分・空欄で自動）</label><input id="k" type="number" min="0" step="${STEP}" value="${s.break_min ?? ''}">
  <label>メモ</label><input id="n" value="${esc(s.note)}">
  <p class="mut" id="pv"></p>
  <div class="actions">${s.id ? '<button type="button" class="dng" id="del">削除</button>' : ''}<button type="button" id="x">キャンセル</button><button type="button" class="pri" id="ok">保存</button></div>`);
  const cur = () => ({ ...(s.id ? { id: s.id } : {}), date: $('#d').value, workplace_id: $('#w').value, start_time: snap($('#a').value || '09:00'), end_time: snap($('#b').value || '17:00'), break_min: $('#k').value === '' ? null : Number($('#k').value), note: $('#n').value });
  const pv = () => { const r = cur(); if (!r.date) return; const c = calcShift(r, wpOf(r.workplace_id), S.settings); $('#pv').textContent = `実働 ${fmtHours(c.work)}（休憩${c.brk}分）　${yen(c.pay)}`; };
  dlg.querySelectorAll('input,select').forEach((i) => i.oninput = pv); pv();
  $('#x').onclick = () => dlg.close();
  $('#ok').onclick = () => { const r = cur(); if (!r.date) return; dlg.close(); run(() => store.save('shifts', r)); };
  $('#del')?.addEventListener('click', () => { if (confirm('削除しますか？')) { dlg.close(); run(() => store.remove('shifts', s.id)); } });
}

function wpDialog(w) {
  const wd = w.weekday_wages ?? {};
  openDlg(`<b>${w.id ? '勤務先を編集' : '勤務先を追加'}</b>
  <label>名前</label><input id="nm" value="${esc(w.name)}">
  <div class="row"><div><label>時給（円）</label><input id="wg" type="number" min="0" value="${w.wage ?? S.settings.default_wage}"></div><div><label>交通費/日（空欄で共通設定）</label><input id="tr" type="number" min="0" value="${w.transport ?? ''}"></div></div>
  <label>曜日別の時給（空欄なら上の時給）</label>
  <div class="row" style="gap:4px">${'日月火水木金土'.split('').map((d, i) => `<div><small class="mut">${d}</small><input data-wd="${i}" type="number" min="0" value="${wd[i] ?? ''}" style="padding:6px 2px"></div>`).join('')}</div>
  <label>色</label><div class="row" style="justify-content:flex-start">${COLORS.map((c) => `<label class="chk" style="margin:0"><input type="radio" name="col" value="${c}" ${(w.color ?? COLORS[S.workplaces.length % 6]) === c ? 'checked' : ''}><i style="background:${c};width:18px;height:18px;border-radius:50%;display:inline-block"></i></label>`).join('')}</div>
  <div class="actions">${w.id ? '<button type="button" class="dng" id="del">削除</button>' : ''}<button type="button" id="x">キャンセル</button><button type="button" class="pri" id="ok">保存</button></div>`);
  $('#x').onclick = () => dlg.close();
  $('#ok').onclick = () => {
    const name = $('#nm').value.trim(); if (!name) return;
    const weekday_wages = {}; dlg.querySelectorAll('[data-wd]').forEach((i) => { if (i.value !== '') weekday_wages[i.dataset.wd] = Number(i.value); });
    const row = { ...(w.id ? { id: w.id } : {}), name, wage: Number($('#wg').value) || 0, transport: $('#tr').value === '' ? null : Number($('#tr').value), color: dlg.querySelector('[name=col]:checked').value, weekday_wages };
    dlg.close(); run(() => store.save('workplaces', row));
  };
  $('#del')?.addEventListener('click', () => { if (confirm('この勤務先のシフトもすべて消えます。削除しますか？')) { dlg.close(); run(() => store.remove('workplaces', w.id)); } });
}

boot();
