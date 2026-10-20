/** Cached projections, each under the identity bound gave it and head's key of the place when it was kept. */
const kept = new Map<string, { readonly key: string; readonly identity: string; readonly folded: Promise<unknown> }>();

/** While head's key has not moved, the kept fold answers and bound is not asked; once it has, bound's identity decides: the same keeps the fold, another reads the text bound to it. A refused identity cannot validate an old answer. */
export const folded = async <T>(kind: string, place: string, keyed: () => string, identity: () => Promise<string | undefined>, read: (expected?: string) => Promise<T>): Promise<T> => {
  const at = `${kind}\0${place}`, key = keyed(), held = kept.get(at);
  if (held?.key === key) return held.folded as Promise<T>;
  const current = await identity();
  if (current === undefined) { kept.delete(at); return read(); }
  if (held?.identity === current) { kept.set(at, { ...held, key }); return held.folded as Promise<T>; }
  const reading = read(current);
  kept.set(at, { key, identity: current, folded: reading });
  const forget = () => { if (kept.get(at)?.folded === reading) kept.delete(at); };
  reading.then((result) => { if (result && typeof result === 'object' && 'refused' in result) forget(); }, forget);
  return reading;
};
