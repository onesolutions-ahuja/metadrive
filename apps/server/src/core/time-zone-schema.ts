import { z } from 'zod';

/** Reusable IANA timezone validation for Core and optional applications. */
export const sharedTimeZoneSchema = z.string().min(1).refine(value => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}, 'A valid IANA time zone is required');
