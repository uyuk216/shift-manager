import test from 'node:test';
import assert from 'node:assert/strict';
import { calcShift, summarize, DEFAULT_SETTINGS as S, autoBreak } from '../js/calc.js';
import { buildICS } from '../js/ics.js';

const wp = { id: 'w', name: 'A店', wage: 1000, weekday_wages: {} };
const sh = (start_time, end_time, extra = {}) => ({ id: 's1', date: '2026-10-05', start_time, end_time, workplace_id: 'w', ...extra });

test('休憩の自動判定', () => {
  assert.equal(autoBreak(360, S.break_rules), 0);
  assert.equal(autoBreak(361, S.break_rules), 45);
  assert.equal(autoBreak(481, S.break_rules), 60);
});
test('5時間 = 5000円', () => assert.equal(calcShift(sh('10:00', '15:00'), wp, S).pay, 5000));
test('7時間 休憩45分 → 6h15m', () => {
  const c = calcShift(sh('09:00', '16:00'), wp, S);
  assert.equal(c.work, 375); assert.equal(c.pay, 6250);
});
test('深夜割増 22-24の2h: 1000*2*1.25', () => {
  const c = calcShift(sh('20:00', '24:00', { break_min: 0 }), wp, S);
  assert.equal(c.night, 120); assert.equal(c.pay, 2000 + 2500);
});
test('日跨ぎ 23:00-02:00', () => {
  const c = calcShift(sh('23:00', '02:00'), wp, S);
  assert.equal(c.span, 180); assert.equal(c.night, 180); assert.equal(c.pay, 3750);
});
test('残業: 10h(休憩60) → 9h実働で1h残業', () => {
  const c = calcShift(sh('09:00', '19:00'), wp, S);
  assert.equal(c.work, 540); assert.equal(c.ot, 60); assert.equal(c.pay, 9000 + 250);
});
test('曜日別時給(月曜=1)', () => {
  const w = { ...wp, weekday_wages: { 1: 1500 } };
  assert.equal(calcShift(sh('10:00', '12:00'), w, S).pay, 3000);
});
test('交通費は同日同勤務先で1回', () => {
  const w = { ...wp, transport: 500 };
  const t = summarize([sh('10:00', '12:00'), { ...sh('13:00', '15:00'), id: 's2' }], [w], S);
  assert.equal(t.transport, 500); assert.equal(t.pay, 4000);
});
test('ICS', () => {
  const ics = buildICS([sh('23:00', '02:00')], [wp], S, new Date('2026-10-01T00:00:00Z'));
  assert.match(ics, /DTSTART:20261005T230000/); assert.match(ics, /DTEND:20261006T020000/);
  assert.match(ics, /UID:s1@shift-manager/);
});
