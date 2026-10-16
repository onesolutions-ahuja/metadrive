// Shared Flow schedule calculations independent of persisted state.
export function createFlowScheduleCalculations(localToInstant: (date: Date, hour: number, minute: number, timeZone: string) => Date | undefined, localParts: (date: Date, timeZone: string) => Record<string, string>) {
function scheduledOccurrence(flow: { startConfig: { startDate?: unknown; startTime?: unknown; timeZone?: unknown; frequency?: unknown } }, now: Date): Date | undefined {
  const startDate = String(flow.startConfig.startDate ?? '');
  const startTime = String(flow.startConfig.startTime ?? '');
  const timeZone = String(flow.startConfig.timeZone ?? 'UTC');
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!dateMatch || !timeMatch) return undefined;
  const startParts = dateMatch.slice(1).map(Number);
  const startCivil = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const startDay = new Date(startCivil);
  if (startDay.getUTCFullYear() !== startParts[0] || startDay.getUTCMonth() !== startParts[1] - 1
    || startDay.getUTCDate() !== startParts[2]) return undefined;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const start = localToInstant(startDay, hour, minute, timeZone);
  if (!start || now.getTime() < start.getTime()) return undefined;
  const frequency = String(flow.startConfig.frequency);
  if (frequency === 'Once') return start;
  const intervalDays = frequency === 'Daily' ? 1 : frequency === 'Weekly' ? 7 : 0;
  if (!intervalDays) return undefined;
  const nowParts = localParts(now, timeZone);
  const nowCivil = Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day));
  const elapsedDays = Math.floor((nowCivil - startCivil) / 86_400_000);
  if (elapsedDays < 0) return undefined;
  let offsetDays = Math.floor(elapsedDays / intervalDays) * intervalDays;
  if (offsetDays === elapsedDays && `${nowParts.hour}:${nowParts.minute}` < startTime) offsetDays -= intervalDays;
  for (let attempt = 0; offsetDays >= 0 && attempt < 8; attempt += 1, offsetDays -= intervalDays) {
    const civilDate = new Date(startCivil + offsetDays * 86_400_000);
    const occurrence = localToInstant(civilDate, hour, minute, timeZone);
    if (occurrence && occurrence.getTime() >= start.getTime() && occurrence.getTime() <= now.getTime()) return occurrence;
  }
  return undefined;
}

function nextScheduledOccurrence(flow: { startConfig: { startDate?: unknown; startTime?: unknown; timeZone?: unknown; frequency?: unknown } }, previous: Date, now: Date): Date | undefined {
  const frequency = String(flow.startConfig.frequency);
  const intervalDays = frequency === 'Daily' ? 1 : frequency === 'Weekly' ? 7 : 0;
  if (!intervalDays) return undefined;
  const timeZone = String(flow.startConfig.timeZone ?? 'UTC');
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(flow.startConfig.startTime ?? ''));
  if (!timeMatch) return undefined;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const previousParts = localParts(previous, timeZone);
  const previousCivil = Date.UTC(
    Number(previousParts.year), Number(previousParts.month) - 1, Number(previousParts.day)
  );
  for (let offset = intervalDays; offset <= 366 * intervalDays; offset += intervalDays) {
    const civilDate = new Date(previousCivil + offset * 86_400_000);
    const occurrence = localToInstant(civilDate, hour, minute, timeZone);
    if (occurrence && occurrence.getTime() > previous.getTime()) {
      return occurrence.getTime() <= now.getTime() ? occurrence : undefined;
    }
  }
  return undefined;
}


return { scheduledOccurrence, nextScheduledOccurrence };
}
