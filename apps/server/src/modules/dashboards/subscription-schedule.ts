import { dashboardLocalParts } from '../../core/local-time.js';

export function nextDashboardSubscriptionRunAt(
  schedule: { frequency: string; localTime: string; timeZone: string; dayOfWeek?: number },
  after: Date
): string {
  const nowParts = dashboardLocalParts(after, schedule.timeZone);
  const localToday = new Date(Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day)));
  const [hour, minute] = schedule.localTime.split(':').map(Number);
  let dayOffset = 0;
  if (schedule.frequency === 'Daily') {
    if (`${nowParts.hour}:${nowParts.minute}` >= schedule.localTime) dayOffset = 1;
  } else {
    const currentDay = localToday.getUTCDay();
    dayOffset = ((schedule.dayOfWeek ?? 0) - currentDay + 7) % 7;
    if (dayOffset === 0 && `${nowParts.hour}:${nowParts.minute}` >= schedule.localTime) dayOffset = 7;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scheduledDay = new Date(localToday.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const targetCivil = Date.UTC(scheduledDay.getUTCFullYear(), scheduledDay.getUTCMonth(), scheduledDay.getUTCDate(), hour, minute);
    let candidate = targetCivil;
    for (let adjustment = 0; adjustment < 4; adjustment += 1) {
      const parts = dashboardLocalParts(new Date(candidate), schedule.timeZone);
      const representedCivil = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
      const difference = targetCivil - representedCivil;
      if (!difference) break;
      candidate += difference;
    }
    const actual = dashboardLocalParts(new Date(candidate), schedule.timeZone);
    if (Number(actual.year) === scheduledDay.getUTCFullYear()
      && Number(actual.month) === scheduledDay.getUTCMonth() + 1
      && Number(actual.day) === scheduledDay.getUTCDate()
      && Number(actual.hour) === hour && Number(actual.minute) === minute
      && candidate > after.getTime()) {
      return new Date(candidate).toISOString();
    }
    dayOffset += schedule.frequency === 'Daily' ? 1 : 7;
  }
  throw new Error(`Could not calculate the next dashboard run for time zone "${schedule.timeZone}".`);
}

