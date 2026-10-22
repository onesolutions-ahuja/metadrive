import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import './BusinessCalendarSettings.css';

type Day = { closed: boolean; open: string; close: string };
type BusinessCalendar = {
  fiscalYearStart: { month: number; day: number };
  timezone: string;
  weeklyHours: Record<string, Day>;
  holidays: Array<{ date: string; label: string }>;
};
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const weekdays = [
  ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'],
  ['sunday', 'Sunday']
] as const;
const blankCalendar = (): BusinessCalendar => ({
  fiscalYearStart: { month: 0, day: 0 },
  timezone: '',
  weeklyHours: Object.fromEntries(weekdays.map(([day]) =>
    [day, { closed: false, open: '', close: '' }])) as Record<string, Day>,
  holidays: []
});

export default function BusinessCalendarSettings({ request, permitted }: {
  request: Request;
  permitted: boolean;
}) {
  const [calendar, setCalendar] = useState(blankCalendar);
  const [configured, setConfigured] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!permitted) return;
    let active = true;
    setLoading(true);
    setError('');
    setNotice('');
    void request<{ calendar: BusinessCalendar | null }>('/tenant/business-calendar')
      .then(({ calendar: saved }) => {
        if (active) { setCalendar(saved ?? blankCalendar()); setConfigured(Boolean(saved)); }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load business calendar');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, permitted, revision]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!calendar.timezone.trim() || !calendar.fiscalYearStart.month || !calendar.fiscalYearStart.day ||
      weekdays.some(([day]) => !calendar.weeklyHours[day].closed &&
        (!calendar.weeklyHours[day].open || !calendar.weeklyHours[day].close))) {
      setError('Set fiscal year, time zone and opening/closing times (or mark each day closed) before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await request<{ calendar: BusinessCalendar }>('/tenant/business-calendar', {
        method: 'PUT', body: JSON.stringify(calendar)
      });
      setCalendar(result.calendar);
      setConfigured(true);
      setNotice('Fiscal year, business hours and holidays saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save business calendar');
    } finally { setSaving(false); }
  };

  if (!permitted) return null;
  return <section className="business-calendar surface permission-section" aria-label="Business calendar">
    <header><div><h2>Fiscal year, business hours &amp; holidays</h2>
      <p>Shared organization calendar settings for scheduling, escalation and entitlement rules.</p></div>
      <button type="button" className="btn" disabled={loading || saving}
        onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} /> Refresh</button>
    </header>
    {loading && <p role="status">Loading business calendar…</p>}
    {error && <p className="business-calendar-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!loading && !error && !configured && <p role="status">Business calendar not configured. Enter and save your tenant settings.</p>}
    <form onSubmit={(event) => void save(event)}>
      <div className="business-calendar-options">
        <label>Fiscal year starts
          <span><select required aria-label="Fiscal year start month" value={calendar.fiscalYearStart.month}
            onChange={event => setCalendar(value => ({ ...value, fiscalYearStart: {
              ...value.fiscalYearStart, month: Number(event.target.value)
            } }))}>
            <option value={0}>Select month</option>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>
              {new Date(2000, index, 1).toLocaleString(undefined, { month: 'long' })}
            </option>)}
          </select>
          <input aria-label="Fiscal year start day" type="number" min={1} max={31} required
            value={calendar.fiscalYearStart.day} onChange={event => setCalendar(value => ({
              ...value, fiscalYearStart: { ...value.fiscalYearStart, day: Number(event.target.value) }
            }))} /></span>
        </label>
        <label>Organization time zone
          <input required placeholder="e.g. Europe/London" value={calendar.timezone} maxLength={100}
            onChange={event => setCalendar(value => ({ ...value, timezone: event.target.value }))} />
        </label>
      </div>
      <h3>Weekly business hours</h3>
      <div className="business-calendar-days">
        {weekdays.map(([day, label]) => <div className="business-calendar-day" key={day}>
          <strong>{label}</strong>
          <label><input type="checkbox" checked={calendar.weeklyHours[day].closed}
            onChange={event => setCalendar(value => ({ ...value, weeklyHours: {
              ...value.weeklyHours, [day]: { ...value.weeklyHours[day], closed: event.target.checked }
            } }))} /> Closed</label>
          <label>Opens <input type="time" required={!calendar.weeklyHours[day].closed} disabled={calendar.weeklyHours[day].closed}
            value={calendar.weeklyHours[day].open} onChange={event => setCalendar(value => ({
              ...value, weeklyHours: { ...value.weeklyHours, [day]: {
                ...value.weeklyHours[day], open: event.target.value
              } }
            }))} /></label>
          <label>Closes <input type="time" required={!calendar.weeklyHours[day].closed} disabled={calendar.weeklyHours[day].closed}
            value={calendar.weeklyHours[day].close} onChange={event => setCalendar(value => ({
              ...value, weeklyHours: { ...value.weeklyHours, [day]: {
                ...value.weeklyHours[day], close: event.target.value
              } }
            }))} /></label>
        </div>)}
      </div>
      <h3>Holidays</h3>
      <div className="business-calendar-holiday-entry">
        <label>Date <input type="date" value={holidayDate} onChange={event => setHolidayDate(event.target.value)} /></label>
        <label>Name <input value={holidayLabel} maxLength={120} onChange={event => setHolidayLabel(event.target.value)} /></label>
        <button type="button" className="btn" disabled={!holidayDate || !holidayLabel.trim() || calendar.holidays.length >= 500}
          onClick={() => {
            if (calendar.holidays.some(item => item.date === holidayDate)) {
              setError('A holiday is already configured for that date.');
              return;
            }
            setCalendar(value => ({ ...value, holidays: [...value.holidays,
              { date: holidayDate, label: holidayLabel.trim() }].sort((a, b) => a.date.localeCompare(b.date)) }));
            setHolidayDate(''); setHolidayLabel(''); setError('');
          }}>Add holiday</button>
      </div>
      {calendar.holidays.length > 0 && <ul className="business-calendar-holidays">
        {calendar.holidays.map(holiday => <li key={holiday.date}>
          <span><strong>{holiday.date}</strong> {holiday.label}</span>
          <button type="button" className="btn" aria-label={'Remove ' + holiday.label}
            onClick={() => setCalendar(value => ({ ...value,
              holidays: value.holidays.filter(item => item.date !== holiday.date) }))}>Remove</button>
        </li>)}
      </ul>}
      <button type="submit" className="btn btn-primary" disabled={saving || loading}>
        {saving ? 'Saving…' : 'Save business calendar'}
      </button>
    </form>
  </section>;
}
