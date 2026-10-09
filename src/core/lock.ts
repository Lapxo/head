import { alphabet, parse, steps } from '@lapxo/topos/wire';

export type Said = Readonly<Record<string, string>>;

/** The lines head's own lock declares, decoded and nothing more: a withdraw has no place in it, and one there is refused, never folded here. */
export const declaredOf = (text: string): readonly Said[] => text.split('\n').flatMap((line) => ((got) => (got.kind === 'fact' ? [got.value.fields] : []))(parse(line)))
  .map((f) => { if (f.value === 'withdraw') throw Error(`REFUSE·lock head's own lock withdraws ${f.scope}: its lines are declared, never folded by head`); return f; });

export const said = (lock: readonly Said[], scope: string): Said | undefined => lock.find((f) => f.scope === scope);
export const valueOf = (lock: readonly Said[], scope: string): string => said(lock, scope)?.value ?? '';
export const aboutOf = (lock: readonly Said[], scope: string): string => said(lock, scope)?.about ?? '';
export const members = (value: string): readonly string[] => (value === '' ? [] : alphabet(value).members);

/** The lines exactly one step below a family: tool/look under tool, never tool/look/place. */
export const below = (lock: readonly Said[], family: string): readonly Said[] =>
  lock.filter((f) => ((at) => at.length === 2 && at[0] === family)(steps(f.scope ?? '')));
