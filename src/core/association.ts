import { canonical } from '@lapxo/topos/wire';
import type { Said } from './lock.ts';

export interface PackageIdentity { readonly id: string; readonly revision: string; readonly digest: string }
/** Receiver-local records only: no grants, source pins or sender keys. Use the existing wire fields and forms. */
export function associationFor(prefix: string, incoming: PackageIdentity, authenticated: readonly Said[]) {
  if (!/^[a-z][a-z0-9/-]*$/.test(prefix) || !/^[a-z][a-z0-9-]*$/.test(incoming.id) || !/^\d+\.\d+\.\d+$/.test(incoming.revision) || !/^sha256:[a-f0-9]{64}$/.test(incoming.digest)) throw Error('package/identity');
  const scope = `${prefix}/${incoming.id}`, names = [scope, `${scope}/revision`, `${scope}/place`];
  const previous = authenticated.filter(line => names.includes(line.scope ?? '') && line.value !== 'withdraw');
  if (names.some(name => previous.filter(line => line.scope === name).length > 1)) throw Error('package/association-ambiguous');
  if (previous.length && previous.length !== 3) throw Error('package/association-incomplete');
  const held = (at: string) => previous.find(line => line.scope === at)?.value;
  const state = !previous.length ? 'new' : held(scope) === incoming.digest && held(`${scope}/revision`) === incoming.revision ? 'same'
    : held(`${scope}/revision`) === incoming.revision ? 'collision' : 'revision';
  return { state, previous, incoming, scope, place: held(`${scope}/place`) } as const;
}
/** Ordinary recipient import must succeed before approval. Bound admits all exact withdrawals and records in one lot. */
export function associationLines(plan: ReturnType<typeof associationFor>, place: string, approved: boolean, act: string): readonly string[] {
  if (!approved) return [];
  if (plan.state === 'collision' || !place || !/^policy:[A-Za-z0-9/._:-]+$/.test(act)) throw Error('package/association-collision');
  if (plan.state === 'same' && plan.place === place) return [];
  const base = { at: act, by: 'target', role: 'writes', form: 'alphabet' };
  return [[plan.scope, 'digest', plan.incoming.digest], [`${plan.scope}/revision`, 'id', plan.incoming.revision], [`${plan.scope}/place`, 'id', place]].flatMap(([scope, measure, value]) => {
    const old = plan.previous.find(line => line.scope === scope);
    if (old?.measure === measure && old.value === value) return [];
    if (old?.at === act) throw Error('package/association-stale-act');
    return [...(old ? [canonical({ ...Object.fromEntries(Object.entries(old).filter(([key]) => !['sig', 'epoch'].includes(key))), by: 'target', value: 'withdraw' })] : []), canonical({ ...base, scope, measure, value })];
  });
}
