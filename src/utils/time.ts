/**
 * Timestamps and duration helpers.
 */

export function nowISO(): string {
  return new Date().toISOString();
}

export function durationMs(startedAt: string, completedAt: string): number {
  return new Date(completedAt).getTime() - new Date(startedAt).getTime();
}
