import { z } from 'zod';

import { Secret } from './secret.js';

// Parsers for the value of one environment variable. Every rule carries its own message and
// no message contains the value, so a report built from them is safe to log. Parsing is
// strict on purpose: `Number('')` is 0 and `Number('0x10')` is 16, and neither should pass
// for a threshold.

/** The raw value. An unset variable never reaches a parser, see `readEnvironment`. */
function raw() {
  return z
    .string({ error: 'is required but not set' })
    .regex(/^\S(.*\S)?$/s, 'must not start or end with whitespace');
}

/** A non-empty string. */
export function text() {
  return raw();
}

interface Range {
  readonly min: number;
  readonly max: number;
}

function withinRange({ min, max }: Range) {
  return z.number().min(min, `must be at least ${min}`).max(max, `must be at most ${max}`);
}

/** A whole number in plain decimal digits, within an inclusive range. */
export function integer(range: Range) {
  return raw().regex(/^\d+$/, 'must be a whole number').transform(Number).pipe(withinRange(range));
}

/** A number such as `0.8`, within an inclusive range. */
export function decimal(range: Range) {
  return raw()
    .regex(/^\d+(\.\d+)?$/, 'must be a number such as 0.8')
    .transform(Number)
    .pipe(withinRange(range));
}

/** A number greater than zero, with no upper bound. */
export function positiveDecimal() {
  return raw()
    .regex(/^\d+(\.\d+)?$/, 'must be a number such as 0.8')
    .transform(Number)
    .pipe(z.number().positive('must be greater than 0'));
}

/** A local time as 24-hour `HH:mm`, the same format as `LocalTime` in the OpenAPI spec. */
export function localTime() {
  return raw().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time such as 22:00');
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim());
}

/** Comma-separated whole numbers without duplicates, returned in ascending order. */
export function integerList(range: Range) {
  return raw()
    .regex(/^\d+(\s*,\s*\d+)*$/, 'must be whole numbers separated by commas, such as 7,30,90')
    .transform((value) => splitList(value).map(Number))
    .pipe(
      z
        .array(withinRange(range))
        .refine((items) => new Set(items).size === items.length, 'must not repeat a number'),
    )
    .transform((items) => items.toSorted((a, b) => a - b));
}

/** Comma-separated non-empty strings without duplicates. */
export function textList() {
  return raw()
    .transform(splitList)
    .pipe(
      z
        .array(z.string().min(1, 'must not contain an empty item'))
        .refine((items) => new Set(items).size === items.length, 'must not repeat an item'),
    );
}

/** A secret string. The parsed value is wrapped so that it cannot be printed by accident. */
export function secret({ minLength = 1 }: { minLength?: number } = {}) {
  return raw()
    .min(minLength, `must be at least ${minLength} characters`)
    .transform((value) => new Secret(value));
}

const serviceAccount = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

/** A Google service-account key file, given as the JSON text of the file. */
export function serviceAccountJson() {
  return raw().transform((value, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      // The native error message quotes part of the input, so it is not passed on.
      parsed = undefined;
    }
    const result = serviceAccount.safeParse(parsed);
    if (!result.success) {
      context.addIssue({
        code: 'custom',
        message:
          'must be the JSON of a service-account key with project_id, client_email and private_key',
      });
      return z.NEVER;
    }
    return {
      projectId: result.data.project_id,
      clientEmail: result.data.client_email,
      privateKey: new Secret(result.data.private_key),
    };
  });
}
