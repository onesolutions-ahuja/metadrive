/** Civil-time conversion shared by Flows, formulas, and dashboard schedules. */
export function dashboardLocalParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function flowLocalDateTimeToInstant(civilDate: Date, hour: number, minute: number, timeZone: string): Date | undefined {
  const targetCivil = Date.UTC(civilDate.getUTCFullYear(), civilDate.getUTCMonth(), civilDate.getUTCDate(), hour, minute);
  let candidate = targetCivil;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dashboardLocalParts(new Date(candidate), timeZone);
    const representedCivil = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const difference = targetCivil - representedCivil;
    if (!difference) break;
    candidate += difference;
  }
  const result = new Date(candidate);
  const parts = dashboardLocalParts(result, timeZone);
  if (Number(parts.year) !== civilDate.getUTCFullYear()
    || Number(parts.month) !== civilDate.getUTCMonth() + 1
    || Number(parts.day) !== civilDate.getUTCDate()
    || Number(parts.hour) !== hour || Number(parts.minute) !== minute) return undefined;
  return result;
}

