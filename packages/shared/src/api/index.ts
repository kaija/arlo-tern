/**
 * Types of the core service's HTTP API, for the core service and the mobile app to share.
 *
 * `openapi.generated.ts` is written by `pnpm api:generate` from `docs/api/openapi.yaml` and is
 * never edited by hand; `pnpm api:check` fails when the two disagree. This module is types
 * only: it has no runtime code and no imports, so the app can import it.
 */
import type { components } from './openapi.generated.js';

export type { components, operations, paths } from './openapi.generated.js';

/** A schema of the spec's `components.schemas` by name, for example `Schema<'Task'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];
