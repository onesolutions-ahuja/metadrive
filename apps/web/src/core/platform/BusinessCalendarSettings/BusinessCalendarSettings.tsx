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
  fiscalYearStart: { month: 1, day: 1 },
  timezone: 'Europe/London',
  weeklyHours: Object.fromEntries(weekdays.map(([day]) =>
    [day, { closed: day === 'saturday' || day === 'sunday', open: '09:00', close: '17:00' }])) as Record<string, Day>,
  holidays: []
});

export default function BusinessCalendarSettings({ request, permitted }: {
  request: Request;
  permitted: boolean;
}) {
  const [calendar, setCalendar] = useState(blankCalendar);
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
    void request<{ calendar: BusinessCalendar | null }>('/tenant/business-calendar')
      .then(({ calendar: saved }) => { if (active && saved) setCalendar(saved); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load business calendar');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, permitted, revision]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await request<{ calendar: BusinessCalendar }>('/tenant/business-calendar', {
        method: 'PUT', body: JSON.stringify(calendar)
      });
      setCalendar(result.calendar);
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
    <form onSubmit={(event) => void save(event)}>
      <div className="business-calendar-options">
        <label>Fiscal year starts
          <span><select aria-label="Fiscal year start month" value={calendar.fiscalYearStart.month}
            onChange={event => setCalendar(value => ({ ...value, fiscalYearStart: {
              ...value.fiscalYearStart, month: Number(event.target.value)
            } }))}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>
              {new Date(2000, index, 1).toLocaleString(undefined, { month: 'long' })}
            </option>)}
          </select>
          <input aria-label="Fiscal year start day" type="number" min={1} max={31}
            value={calendar.fiscalYearStart.day} onChange={event => setCalendar(value => ({
              ...value, fiscalYearStart: { ...value.fiscalYearStart, day: Number(event.target.value) }
            }))} /></span>
        </label>
        <label>Organization time zone
          <input value={calendar.timezone} maxLength={100}
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
          <label>Opens <input type="time" disabled={calendar.weeklyHours[day].closed}
            value={calendar.weeklyHours[day].open} onChange={event => setCalendar(value => ({
              ...value, weeklyHours: { ...value.weeklyHours, [day]: {
                ...value.weeklyHours[day], open: event.target.value
              } }
            }))} /></label>
          <label>Closes <input type="time" disabled={calendar.weeklyHours[day].closed}
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
