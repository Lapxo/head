import { canonical } from '@lapxo/topos/wire';
import type { Asked, Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import type { Frame } from '../flows/call.ts';
import { rootIn } from '../flows/device.ts';

/** A body that answers nothing: no byte of it, or a list with no member. */
const nothing = (bytes: Uint8Array): boolean => ((text) => text === '' || /^\[\s*\]$/.test(text))(new TextDecoder().decode(bytes).trim());

/**
 * What a source answered kept apart from what it never sent. A body of nothing is an answer, the source's own: said with
 * its hour, as it holds it today, and landed with its receipt, never a body. No bytes at all is no answer and no receipt:
 * its cause is said and the read stays owed in the place, a need named for its source and operation, until a read of it
 * brings bytes and that need is withdrawn. A read ahead owes nothing.
 */
export const answering = (context: Context, place: string, asked: Asked, frame: Frame): Frame => {
  const need = `${valueOf(context.lock, 'place/needs')}/bytes/${frame.source}/${frame.operation}`, held = frame.lines.find((l) => l.scope === need && l.role === 'demands' && l.value !== 'withdraw');
  const owe = (line: string) => ((root) => ('said' in root ? undefined : context.landRoot(place, [line], root.account)))(rootIn(context, place));
  const withdrawn = ({ about: _about, sig: _sig, epoch: _epoch, ...l }: Readonly<Record<string, string>>) => canonical({ ...l, by: 'target', value: 'withdraw' });
  return { ...frame,
    typed: (status, bytes) => (nothing(bytes) ? Promise.resolve(frame.say('answered-nothing', { source: frame.source, operation: frame.operation, status, at: new Date(context.now()).toISOString() })) : frame.typed(status, bytes)),
    send: async (attachment) => {
      const got = await frame.send(attachment);
      if (asked['ahead'] !== 'true' && got.kind === 'failed' && held === undefined) await owe(canonical({ at: `policy:head/owed/${new Date(context.now()).toISOString()}`, by: 'target', form: 'alphabet', measure: 'id', role: 'demands', scope: need, value: frame.plan.origin }));
      if (got.kind === 'got' && held !== undefined) await owe(withdrawn(held));
      return got;
    },
  };
};
