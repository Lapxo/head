import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { deviceOf } from '../src/core/device.ts';
import { valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { registryFor } from '../src/ports/signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { line, lock, text, viewOf } from './place.ts';
import { receiver, sender, tool } from './share-fixture.ts';

const cells = (answer: any): any[] => answer.result.structuredContent.cells;
const codes = (answer: any): string[] => cells(answer).map((c) => c.code).filter((c: string) => !['head/card', 'head/red'].includes(c));
const name = valueOf(lock, 'link/document');
/** Whether a place owes bytes: a demand for them that stands, its withdraw not landed. */
const owes = (place: string): boolean => viewOf(place, 'lines').split('\n').some((l) => / role=demands scope=needs\/bytes\//.test(l) && !/ value=withdraw( |$)/.test(l));

/** An address on this device that serves what the test says when it is asked, and counts each ask. */
const served = async (body: () => Buffer | undefined) => {
  let asked = 0;
  const server = createServer((_request, response) => { asked += 1; const bytes = body(); response.writeHead(bytes ? 200 : 404); response.end(bytes ?? ''); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${name}`, asked: () => asked, close: () => server.close() };
};
/** Lines a receiver's root signs, as its person would: through the keychain that holds it. */
const rooted = (to: { place: string; env: Record<string, string> }, lines: readonly string[]) => {
  const lot = join(mkdtempSync(join(tmpdir(), 'head-link-lot-')), 'lot.bound');
  writeFileSync(lot, `${lines.join('\n')}\n`);
  const [account, key, signer] = [fill(valueOf(lock, 'founding/root-account'), { place: basename(to.place) }), valueOf(lock, 'founding/root').split('/')[1]!, deviceOf(lock).signer];
  const landed = run('@lapxo/bound', to.place, ['land', lot, '--key', key, '--signer', signer], { ...to.env, BOUND_SIGNERS: registryFor(signer, `${deviceOf(lock).service}/${basename(to.env['HEAD_HOME']!).replace(/[^\w.-]+/g, '-')}`, account, key, valueOf(lock, 'founding/algorithm'), valueOf(lock, `platform/${process.platform}/store`)) });
  deepStrictEqual(landed?.code, 0, [...(landed?.out ?? []), ...(landed?.err ?? [])].join('\n'));
};
/** A receiver that admits a content transport over http too, its root signing it: a test serves on this device, never over https. */
const admitting = async () => { const to = await receiver(); rooted(to, [line('transport/http', 'id', 'fetch', { at: 'policy:person/transport' })]); return to; };
const from = await sender();
/** The sender's package shared again, its standing document's address given: the link it prints. */
const linkAt = async (url: string) => { const [packed] = await ask([tool('share', { place: from.place, to: from.pkg, urls: JSON.stringify({ [name]: url }) })], [from.shared], from.env); return cells(packed).find((c) => c.code === 'head/shared-link')?.fields.link as string; };
const inspect = (to: { place: string; env: Record<string, string> }, link: string) => ask([tool('connect', { place: to.place, document: link })], [], to.env).then((got) => got[0]);

test('no address, no link: share lays the standing document ready to publish and says a link needs where its bytes are published', () => {
  ok(/^said\/head\/shared-unlinked /m.test(from.packed) && !/shared-link /.test(from.packed) && existsSync(join(from.pkg, name)), from.packed.slice(0, 400));
});

test('yes, over two places: a link to the package-s standing is inspected where it is connected — what it names, its digest, not authenticated, its sharer not shown — and nothing is connected or granted', async () => {
  const address = await served(() => readFileSync(join(from.pkg, name)));
  try {
    const link = await linkAt(address.url);
    ok(link?.startsWith(valueOf(lock, 'link/prefix')), String(link));
    for (const to of [await admitting(), await admitting()]) {
      const seen = await inspect(to, link), inspected = cells(seen).find((c) => c.code === 'head/inspected');
      deepStrictEqual([codes(seen), inspected?.fields.sources.split(', ').sort()], [['head/inspected', 'head/sharer-unverified'], ['auth', 'jobs']], text(seen));
      ok(!/ scope=uses\/(jobs|auth) /.test(viewOf(to.place, 'lines')), 'nothing was connected');
      const [why] = await ask([tool('connect', { place: to.place, document: link, why: 'true' })], [], to.env);
      ok(codes(why).includes('head/why-transport') && / at=policy:head\/birth .* scope=transport\/https /.test(text(why)), text(why));
      ok(!readFileSync(join(to.place, valueOf(lock, 'founding/birth-file')), 'utf8').includes(' scope=transport/https '), 'the transport is the profile-s, never in the person-s file');
    }
  } finally { address.close(); }
});

test('no: what is published at the link-s address is not the document it names — the package-s files instead, or one byte altered — and it is refused by its integrity, nothing owed', async () => {
  const [files, altered] = [await served(() => readFileSync(join(from.pkg, 'TARGET.bound'))), await served(() => ((b) => (b[10] = b[10]! ^ 1, b))(Buffer.from(readFileSync(join(from.pkg, name)))))];
  try {
    for (const address of [files, altered]) {
      const to = await admitting(), seen = await inspect(to, await linkAt(address.url));
      ok(codes(seen).includes('head/link-refused') && !codes(seen).includes('head/inspected') && !owes(to.place), text(seen));
    }
  } finally { files.close(); altered.close(); }
});

test('no, then yes: bytes that do not arrive are owed by the link until they do; once they arrive, it is inspected and the debt is withdrawn', async () => {
  let up = false;
  const address = await served(() => (up ? readFileSync(join(from.pkg, name)) : undefined));
  try {
    const [to, link] = [await admitting(), await linkAt(address.url)];
    const owing = await inspect(to, link);
    ok(codes(owing).includes('head/link-owed') && owes(to.place), text(owing));
    up = true;
    const paid = await inspect(to, link);
    ok(codes(paid).includes('head/inspected') && !owes(to.place), text(paid));
  } finally { address.close(); }
});

test('no: a place that admits no content transport for the link-s address inspects nothing and is handed the lines that admit one, to sign', async () => {
  const address = await served(() => readFileSync(join(from.pkg, name)));
  try {
    const seen = await inspect(await receiver(), await linkAt(address.url)), missing = cells(seen).find((c) => c.code === 'head/transport-missing');
    ok(missing && missing.next.tool === 'ask' && /scope=wire\/transport /.test(missing.fields.lines) && address.asked() === 0, text(seen));
  } finally { address.close(); }
});
