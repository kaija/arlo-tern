/** Backend services in this monorepo (ADR-0019). */
export const SERVICE_NAMES = ['connector', 'core'] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];
