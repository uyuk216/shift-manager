import { calcShift, toMin } from './calc.js';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = []; let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur); return out.join('\r\n');
}
const dt = (date, min) => {
  const d = new Date(`${date}T00:00:00`); d.setMinutes(min);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
};

// 時刻は「フローティング時刻」(TZなし)。端末のタイムゾーンでそのまま取り込まれる。
// UID がシフトIDで固定なので、再取り込みしても重複せず更新される。
export function buildICS(shifts, workplaces, st, now = new Date()) {
  const wp = new Map(workplaces.map((w) => [w.id, w]));
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//shift-manager//JA', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:シフト'];
  for (const s of shifts) {
    const w = wp.get(s.workplace_id);
    const c = calcShift(s, w, st);
    const start = toMin(s.start_time);
    L.push('BEGIN:VEVENT', `UID:${s.id}@shift-manager`, `DTSTAMP:${stamp}`,
      `DTSTART:${dt(s.date, start)}`, `DTEND:${dt(s.date, start + c.span)}`,
      `SUMMARY:${esc(`${w?.name ?? 'シフト'}`)}`,
      `DESCRIPTION:${esc([`休憩 ${c.brk}分`, s.note].filter(Boolean).join('\n'))}`, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
