export const STEP = 5; // 分刻み

export const DEFAULT_SETTINGS = {
  default_wage: 1100,
  transport_default: 0,
  night_enabled: true, night_start: 22, night_end: 5, night_rate: 25,
  overtime_enabled: true, overtime_hours: 8, overtime_rate: 25,
  break_enabled: true,
  break_rules: [{ over: 360, minutes: 45 }, { over: 480, minutes: 60 }], // 拘束が over 分を超えたら minutes 分
};

export const toMin = (t) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
export const fmtTime = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const fmtHours = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
export const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

export function shiftSpan(s) {
  const d = toMin(s.end_time) - toMin(s.start_time);
  return d <= 0 ? d + 1440 : d; // 日跨ぎ
}

export function autoBreak(span, rules) {
  let b = 0;
  for (const r of [...rules].sort((a, c) => a.over - c.over)) if (span > r.over) b = r.minutes;
  return b;
}

// 休憩は勤務の真ん中で取るものとして扱う
export function calcShift(shift, wp, st) {
  const span = shiftSpan(shift);
  const start = toMin(shift.start_time);
  let brk = shift.break_min ?? (st.break_enabled ? autoBreak(span, st.break_rules) : 0);
  brk = Math.min(brk, span);
  const bs = Math.floor((span - brk) / 2), be = bs + brk;
  const dow0 = new Date(`${shift.date}T00:00:00`).getDay();
  const ns = st.night_start * 60, ne = st.night_end * 60;
  const otLimit = st.overtime_hours * 60;
  let work = 0, night = 0, ot = 0, sum = 0;
  for (let i = 0; i < span; i++) {
    if (i >= bs && i < be) continue;
    const m = (start + i) % 1440;
    const isNight = st.night_enabled && (ns > ne ? m >= ns || m < ne : m >= ns && m < ne);
    const isOt = st.overtime_enabled && work >= otLimit;
    const dow = (dow0 + Math.floor((start + i) / 1440)) % 7;
    const wage = wp?.weekday_wages?.[dow] || wp?.wage || st.default_wage;
    sum += wage * (1 + (isNight ? st.night_rate / 100 : 0) + (isOt ? st.overtime_rate / 100 : 0));
    work++; if (isNight) night++; if (isOt) ot++;
  }
  return { span, brk, work, night, ot, pay: Math.floor(sum / 60) };
}

// 交通費は「同じ日・同じ勤務先」で1回だけ
export function summarize(shifts, workplaces, st) {
  const wpById = new Map(workplaces.map((w) => [w.id, w]));
  const total = { work: 0, night: 0, ot: 0, pay: 0, transport: 0, days: new Set(), byWp: {} };
  const seen = new Set();
  for (const s of shifts) {
    const wp = wpById.get(s.workplace_id);
    const c = calcShift(s, wp, st);
    const key = wp?.id ?? '-';
    const g = (total.byWp[key] ??= { wp, work: 0, pay: 0, transport: 0 });
    total.work += c.work; total.night += c.night; total.ot += c.ot; total.pay += c.pay;
    g.work += c.work; g.pay += c.pay;
    total.days.add(s.date);
    const tk = `${s.date}|${key}`;
    if (!seen.has(tk)) {
      seen.add(tk);
      const t = wp?.transport ?? st.transport_default ?? 0;
      total.transport += t; g.transport += t;
    }
  }
  total.grand = total.pay + total.transport;
  return total;
}
