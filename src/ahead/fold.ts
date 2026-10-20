/** Cached projections are indexed only by identities returned by the instrument. */
const kept = new Map<string, { readonly identity: string; readonly folded: Promise<unknown> }>();

/** A refused identity cannot validate an old answer. The reader binds new text to the expected identity. */
export const folded = async <T>(kind: string, place: string, identity: () => Promise<string | undefined>, read: (expected?: string) => Promise<T>): Promise<T> => {
  const key = `${kind}\0${place}`, current = await identity(), held = kept.get(key);
  if (current === undefined) { kept.delete(key); return read(); }
  if (held?.identity === current) return held.folded as Promise<T>;
  const reading = read(current);
  kept.set(key, { identity: current, folded: reading });
  const forget = () => { if (kept.get(key)?.folded === reading) kept.delete(key); };
  reading.then((result) => { if (result && typeof result === 'object' && 'refused' in result) forget(); }, forget);
  return reading;
};
