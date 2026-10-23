import { useEffect, useRef, useState, type FormEvent } from 'react';
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
const timeZoneOptions = Array.from(new Set([
  'UTC',
  ...(typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['Europe/London'])
])).sort();
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 ? '30' : '00';
  const period = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 || 12}:${minute} ${period}`;
});
const formatTime = (value: string) => {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) return '';
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
const parseTime = (value: string) => {
  const match = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
};
const timePattern = '(?:0?[1-9]|1[0-2]):[0-5][0-9]\\s*[AaPp][Mm]|(?:[01]?[0-9]|2[0-3]):[0-5][0-9]';
const blankCalendar = (): BusinessCalendar => ({
  fiscalYearStart: { month: 0, day: 0 },
  timezone: '',
  weeklyHours: Object.fromEntries(weekdays.map(([day]) =>
    [day, { closed: false, open: '', close: '' }])) as Record<string, Day>,
  holidays: []
});

function BusinessHoursTime({ day, label, value, disabled, onChange }: {
  day: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => formatTime(value));
  const lastValue = useRef(value);
  useEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    if (parseTime(draft) !== value) setDraft(formatTime(value));
  }, [draft, value]);
  return <label className="business-calendar-time-field">{label}
    <input type="text" list="business-calendar-time-options" inputMode="text"
      pattern={timePattern} title="Enter a time such as 9:00 AM or 09:31."
      required={!disabled} disabled={disabled} value={draft}
      aria-label={`${day} ${label.toLowerCase()}`}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        const parsed = parseTime(next);
        if (parsed) onChange(parsed);
      }} />
  </label>;
}

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
          <select required value={calendar.timezone}
            onChange={event => setCalendar(value => ({ ...value, timezone: event.target.value }))}>
            {!timeZoneOptions.includes(calendar.timezone) && calendar.timezone &&
              <option value={calendar.timezone}>{calendar.timezone}</option>}
            {timeZoneOptions.map(timeZone => <option key={timeZone} value={timeZone}>{timeZone}</option>)}
          </select>
        </label>
      </div>
      <div className="business-calendar-hours-heading">
        <div><h3>Weekly business hours</h3><p>Choose from 30-minute suggestions or type a custom time.</p></div>
        <button type="button" className="btn" disabled={saving || loading}
          onClick={() => setCalendar(value => ({
            ...value,
            weeklyHours: Object.fromEntries(weekdays.map(([day]) => [
              day, { ...value.weeklyHours.monday, closed: value.weeklyHours[day].closed }
            ])) as Record<string, Day>
          }))}>Copy Monday hours to all days</button>
      </div>
      <div className="business-calendar-days">
        {weekdays.map(([day, label]) => <div className="business-calendar-day" key={day}>
          <strong>{label}</strong>
          <label className="business-calendar-closed"><input type="checkbox" checked={calendar.weeklyHours[day].closed}
            onChange={event => setCalendar(value => ({ ...value, weeklyHours: {
              ...value.weeklyHours, [day]: { ...value.weeklyHours[day], closed: event.target.checked }
            } }))} /> Closed</label>
          <BusinessHoursTime day={label} label="Opens" value={calendar.weeklyHours[day].open}
            disabled={calendar.weeklyHours[day].closed}
            onChange={open => setCalendar(value => ({ ...value, weeklyHours: {
              ...value.weeklyHours, [day]: { ...value.weeklyHours[day], open }
            } }))} />
          <span className="business-calendar-time-separator" aria-hidden="true">to</span>
          <BusinessHoursTime day={label} label="Closes" value={calendar.weeklyHours[day].close}
            disabled={calendar.weeklyHours[day].closed}
            onChange={close => setCalendar(value => ({ ...value, weeklyHours: {
              ...value.weeklyHours, [day]: { ...value.weeklyHours[day], close }
            } }))} />
        </div>)}
        <datalist id="business-calendar-time-options">
          {timeOptions.map(time => <option key={time} value={time} />)}
        </datalist>
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
