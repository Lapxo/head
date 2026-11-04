import { createHash } from 'node:crypto';
import { canonical, parse } from '@lapxo/topos/wire';
export type File = { readonly path: string; readonly bytes: Uint8Array };
const patterns: Readonly<Record<string, RegExp>> = {
  'literal/key': /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_\w{40,}|\bnpm_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}|\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.|\bsk-[A-Za-z0-9]{20,}/g,
  'literal/path': /\/Users\/[^/\s"'`]+|\/home\/[^/\s"'`]+\/|\/Volumes\/|[A-Z]:\\\\Users\\\\|\/private\/var\/folders\//g,
};
/**
 * The reader of the lock's literal ceilings, over what a pack carries — the package, the lock, its receipts and the source
 * the package is built from: keys and tokens, one machine's paths, hosts beyond loopback and the lock's own sources,
 * private organisations named in a list kept outside the repository, and a world's bytes in the package. Counts by name.
 */
export type References = { readonly origins: readonly string[]; readonly documents: ReadonlyMap<string, string> };
export const scan = (carried: readonly File[], packed: readonly File[], hosts: ReadonlySet<string>, words: readonly string[], worlds: ReadonlySet<string>, references?: References) => {
  const found: Record<string, string[]> = { 'literal/key': [], 'literal/path': [], 'literal/host': [], 'literal/org': [], 'package/world-bytes': [] };
  for (const { path, bytes } of carried) {
    const text = Buffer.from(bytes).toString('utf8');
    for (const [name, pattern] of Object.entries(patterns)) for (const m of text.matchAll(pattern)) found[name]!.push(`${path}: ${name} match`);
    const publicHosts = new Set([...hosts, ...(references?.origins ?? []).map(origin => { const url = new URL(origin); if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw Error('REFUSE·literal/reference-origin'); return url.hostname.toLowerCase(); })]);
    const chunks = path === 'TARGET.bound' && references ? text.split('\n').flatMap(line => {
      const row = parse(line); if (row.kind !== 'fact') return [{ text: line, allowed: hosts }]; const fields = row.value.fields;
      const field = fields.role === 'writes' && fields.scope?.startsWith('prose/') && fields.measure === 'text' && fields.shape && references.documents.get(fields.shape) === fields.about ? 'about'
        : fields.role === 'writes' && fields.scope === 'literal/public-reference-origins' && fields.measure === 'id' && fields.value === references.origins.join('|') ? 'value' : undefined;
      if (!field) return [{ text: line, allowed: hosts }];
      return [{ text: canonical(Object.fromEntries(Object.entries(fields).filter(([key]) => key !== field))), allowed: hosts }, { text: fields[field] ?? '', allowed: publicHosts }];
    }) : [{ text, allowed: references?.documents.get(path) === text ? publicHosts : hosts }];
    for (const chunk of chunks) for (const m of chunk.text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) if (!chunk.allowed.has(m[1]!.toLowerCase())) found['literal/host']!.push(`${path}: ${m[1]}`);
    for (const word of words) if (text.toLowerCase().includes(word.toLowerCase())) found['literal/org']!.push(`${path}: one private name`);
  }
  for (const { path, bytes } of packed) if (path.startsWith('vectors/') || worlds.has(`sha256:${createHash('sha256').update(bytes).digest('hex')}`)) found['package/world-bytes']!.push(path);
  return found;
};

