/** Cached projections, each under head's key of the place when it was asked and the identity bound then gave it. */
const kept = new Map<string, { readonly key: string; identity?: string; readonly folded: Promise<unknown> }>();

/** While head's key has not moved, the kept fold answers, one asked meanwhile shares it, and bound is not asked; once it has, bound's identity decides: the same keeps the fold, another reads the text bound to it. A refused identity cannot validate an old answer. */
export const folded = <T>(kind: string, place: string, keyed: () => string, identity: () => Promise<string | undefined>, read: (expected?: string) => Promise<T>): Promise<T> => {
  const at = `${kind}\0${place}`, key = keyed(), held = kept.get(at);
  if (held?.key === key) return held.folded as Promise<T>;
  const entry: { key: string; identity?: string; folded: Promise<unknown> } = { key, folded: identity().then((current) => ((entry.identity = current) === undefined ? read() : held && held.identity === current ? held.folded : read(current))) };
  kept.set(at, entry);
  const forget = () => { if (kept.get(at) === entry) kept.delete(at); };
  entry.folded.then((result) => { if (entry.identity === undefined || (result && typeof result === 'object' && 'refused' in result)) forget(); }, forget);
  return entry.folded as Promise<T>;
};
