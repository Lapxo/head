import { basename, join } from 'node:path';
import { canonical, parse } from '@lapxo/topos/wire';
import { PORTABLE_BIRTH_PROFILE, decodePortableBirth, encodePortableBirth, inspectPortableBirth } from '@lapxo/topos/contract';
import { semanticStandingBytes } from '@lapxo/topos/standing';
import { inStanding, type Asked, type Context } from '../core/answer.ts';
import { members, valueOf, type Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { digestIn } from '../core/worlds.ts';

const budget = (context: Context) => ({ bytes: Number(valueOf(context.lock, 'bound/printed').split('..')[1]), items: Number(valueOf(context.lock, 'share/birth-items').split('..')[1]) });
const refused = (context: Context, error: unknown) => [sayIn(context.lock)('birth-refused', { why: error instanceof Error ? error.message : String(error) })];

/** A separate public birth artifact. The source package, authority and personal birth journal are not its payload. */
export const sharedBirth = (context: Context, to: string, standing: readonly Said[]): readonly string[] => {
  const say = sayIn(context.lock), scopes = members(valueOf(context.lock, 'share/birth-scopes')), file = valueOf(context.lock, 'share/birth-file');
  const declarations = standing.filter(line => scopes.includes(line.scope ?? '')).map(({ by: _by, sig: _sig, epoch: _epoch, ...line }) => canonical(line));
  if (!declarations.length) return [say('birth-empty')];
  try {
    const record = encodePortableBirth({ origin: digestIn(context.lock)(semanticStandingBytes(standing.map(line => canonical(line)))), declarations }, budget(context)), bytes = new TextEncoder().encode(record);
    context.files.lay(to, file, bytes);
    return [say('birth-shared', { document: join(to, file), digest: digestIn(context.lock)(bytes), record })];
  } catch (error) { return refused(context, error); }
};

/** Inline or client-shared local birth bytes are inspected only; no transport, signer, file write or admission is acquired. */
export const receivedBirth = async (asked: Asked, context: Context): Promise<readonly string[] | undefined> => {
  const document = asked['document'] ?? '', inline = document.startsWith(PORTABLE_BIRTH_PROFILE.split('/')[0]! + '/');
  if (!inline && !(document.startsWith('/') && basename(document) === valueOf(context.lock, 'share/birth-file'))) return undefined;
  return inStanding(asked, context, async (place, standing) => {
    const say = sayIn(context.lock), bytes = inline ? new TextEncoder().encode(document) : (await context.files.read.documentOf(context, place, document))?.bytes;
    if (!bytes) return [say('birth-needs', { document })];
    if (asked['digest'] && digestIn(context.lock)(bytes) !== asked['digest']) return [say('document-digest', { document: inline ? PORTABLE_BIRTH_PROFILE : document, digest: asked['digest'], got: digestIn(context.lock)(bytes) })];
    try {
      const pack = decodePortableBirth(new TextDecoder().decode(bytes), budget(context)), allowed = members(valueOf(context.lock, 'share/birth-scopes'));
      if (pack.declarations.some(line => ((p) => p.kind !== 'fact' || !allowed.includes(p.value.fields.scope ?? ''))(parse(line)))) return [say('birth-refused', { why: 'declaration outside the public birth selection' })];
      const inspected = inspectPortableBirth(pack, [...new Set(standing.flatMap(line => line.scope ?? []))], budget(context));
      return [say('birth-inspected', { inspection: inspected.status, collisions: inspected.collisions.join(', ') || 'none', origin: pack.origin, declarations: pack.declarations.join('\n') })];
    } catch (error) { return refused(context, error); }
  }, context.policy);
};
