import { z } from 'zod';

/**
 * Historic app metadata used "Page" for an App Page navigation entry.
 * Decode only that known legacy spelling; parsed metadata remains canonical.
 * Other unknown values still fail validation.
 */
export const appNavigationEntrySchema = z.object({
  type: z.preprocess(
    (value) => value === 'Page' ? 'App Page' : value,
    z.enum(['Object', 'App Page'])
  ),
  apiName: z.string().min(1)
});
