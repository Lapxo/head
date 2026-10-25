/** Source files owning scheduling primitives; shared by the surface test and its native reader. */
export const schedules = (source: string): boolean => /\b(setInterval|setTimeout|setImmediate|worker_threads|Worker|unref)\b/.test(source);

/** The native reader receives each declared source's current bytes and coordinate. */
export function observe(bytes: Uint8Array, coordinate: string) {
  const value = Number(schedules(new TextDecoder().decode(bytes)));
  if (value && coordinate !== 'src/ports/host.ts') throw Error(`REFUSE·surface/scheduled undeclared scheduling source ${coordinate}`);
  return [{ scope: 'surface/scheduled', role: 'writes', measure: 'count', bound: { kind: 'interval', lo: value, hi: value } }];
}
