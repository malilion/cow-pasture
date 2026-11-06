import { isMarketHours, taipeiParts } from '../../docs/js/logic.js';

export const CLOSE_CRON = '20 6 * * 1-5';
export function untilMinutes(until = '13:35') {
  if (!/^\d{2}:\d{2}$/.test(until)) throw new Error('MARKET_UNTIL_TAIPEI 必須為 HH:MM');
  const [hour, minute] = until.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('MARKET_UNTIL_TAIPEI 時間無效');
  return hour * 60 + minute;
}
export function pastUntil(now = new Date(), until = '13:35') {
  const p = taipeiParts(now);
  return Number(p.hour) * 60 + Number(p.minute) >= untilMinutes(until);
}
export function shouldLoop({ now = new Date(), eventName, schedule, until = '13:35' } = {}) {
  return !(eventName === 'schedule' && schedule === CLOSE_CRON) && isMarketHours(now, untilMinutes(until));
}
export function nextSleep(elapsedMs, { targetMs = 100_000, minMs = 90_000 } = {}) {
  return Math.max(0, Math.max(targetMs, minMs) - elapsedMs);
}
