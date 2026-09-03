import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const behaviorSchema = z.object({
  kind: z.enum(['normal', 'slow', 'timeout', 'empty', 'error', 'flaky']),
  delayMs: z.number().int().min(0).max(120_000).optional(),
  status: z.number().int().min(400).max(599).optional(),
  failures: z.number().int().min(0).max(10).optional(),
});

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Expected a date in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real calendar date');

export const searchRequestSchema = z
  .object({
    city: z.string().trim().min(2, 'City is required').max(80),
    checkIn: isoDate,
    checkOut: isoDate,
    simulation: z
      .object({ A: behaviorSchema.optional(), B: behaviorSchema.optional() })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const nights = nightsBetween(value.checkIn, value.checkOut);
    if (nights <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkOut'],
        message: 'Check-out must be at least one night after check-in',
      });
    } else if (nights > 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkOut'],
        message: 'Stays longer than 30 nights are not supported',
      });
    }
  });

export type ValidatedSearchRequest = z.infer<typeof searchRequestSchema>;

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/** Flattens Zod issues into `{ field: message }` for the form to consume. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
