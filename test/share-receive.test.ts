import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask } from './client.ts';
import { said, text } from './place.ts';
import { tool, auth, jobs, digestOf, pinsOf, yes, sender, receiver, receive, resaid, bucket } from './share-fixture.ts';

test('one address, one yes: a package published at signed addresses — each byte at its own, half of them moved — is received from its lock-s address by its digest, every read with nothing attached and every byte held to its digest; a byte that hashes otherwise is refused by name before anything is asked', async () => {
  const from = await sender(), objects = new Map<string, string>(), store = await bucket(objects);
  try {
    const paths = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').trimEnd().split('\n').flatMap((l) => / needs=(\S+)/.exec(l)?.[1] ?? []);
    paths.forEach((p, n) => objects.set(`/blob/${n}`, readFileSync(join(from.pkg, p), 'utf8')));
    const [resaid] = await ask([tool('share', { place: from.place, to: from.pkg, urls: JSON.stringify(Object.fromEntries(paths.map((p, n) => [p, `${store.url}/signed/${n}?sig=s${n}&expires=2999`]))) })], [from.shared], from.env);
    const lock = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8'), digest = /sha256:[0-9a-f]{64}/.exec(text(resaid).split('\n')[0]!)![0];
    deepStrictEqual([digestOf(lock), lock.split('\n').filter((l) => / measure=id /.test(l)).length], [digest, paths.length], 'beside every digest that names bytes, the address they are read at');
    objects.set('/pkg/TARGET.bound', lock);
    const to = await receiver(), asked: string[] = [], at = `${store.url}/pkg/TARGET.bound?sig=lock&expires=2999`;
    const [got] = await ask([tool('connect', { place: to.place, document: at, digest })], [], to.env, yes(asked));
    match(text(got), said('received')); deepStrictEqual([asked.length, pinsOf(to.place)], [1, pinsOf(from.place)]);
    deepStrictEqual(store.seen.filter((r) => r.authorization).length, 0, 'nothing attached to any read');
    ok(store.seen.some((r) => r.url.startsWith('/blob/')), 'moved addresses followed, to the bytes their digest names');
    const other = await receiver(), one: string[] = [];
    objects.set(`/blob/${paths.indexOf('connected/jobs.json')}`, jobs.replace('list-jobs', 'list-everything'));
    const [opened] = await ask([tool('connect', { place: other.place, document: at, digest })], [], other.env, yes(one));
    match(text(opened), said('received-open')); match(text(opened), /\/signed\/\d+\?sig=/); deepStrictEqual([one.length, pinsOf(other.place)], [1, pinsOf(from.place).filter((p) => p.startsWith('uses/auth '))], 'a byte that hashes otherwise is not used: its source waits, the rest arrives');
  } finally { await store.close(); }
});

test('absence is not a refusal: a source whose bytes did not arrive, or hash otherwise, waits, with every source resting on it, as a demand the place holds naming them; the rest arrives on one yes; brought later, the same package connects it and the demand is paid', async () => {
  const from = await sender(), to = await receiver(), asked: string[] = [], jobsAt = join(from.pkg, 'connected', 'jobs.json'), jobsDigest = digestOf(jobs);
  writeFileSync(jobsAt, jobs.replace('list-jobs', 'list-everything'));
  const [first] = await receive(to, from.pkg, from.digest, asked, [from.shared]);
  match(text(first), said('received')); match(text(first), said('received-open')); match(text(first), new RegExp(`${jobsDigest} at \\S+connected/jobs\\.json`));
  deepStrictEqual([asked.length, pinsOf(to.place)], [1, pinsOf(from.place).filter((p) => p.startsWith('uses/auth '))], 'auth arrived; jobs, whose bytes hash otherwise, did not');
  const owed = () => readFileSync(join(to.place, 'TARGET.bound'), 'utf8').split('\n').filter((l) => / scope=needs\/bytes\/jobs /.test(l) && / role=demands /.test(l));
  ok(owed().some((l) => l.endsWith(`value=${jobsDigest}`)), 'the place holds the demand, naming the bytes it waits on');
  writeFileSync(jobsAt, jobs);
  const [second] = await receive(to, from.pkg, from.digest, asked, [from.shared]);
  match(text(second), said('received')); doesNotMatch(text(second), said('received-open'));
  deepStrictEqual(asked.length, 1, 'paying the demand asks nothing: the first yes said they connect when they arrive');
  deepStrictEqual(pinsOf(to.place), pinsOf(from.place), 'brought, the same pins');
  ok(owed().some((l) => l.endsWith('value=withdraw')), 'the demand is paid by its withdraw');

  const blocked = await receiver(), authAt = join(from.pkg, 'connected', 'auth.json');
  writeFileSync(authAt, auth.replace('login', 'logout'));
  const [neither] = await receive(blocked, from.pkg, from.digest, [], [from.shared]);
  doesNotMatch(text(neither), said('received')); match(text(neither), /said\/head\/received-open [^\n]*source="jobs" waits="auth"/);
  deepStrictEqual(pinsOf(blocked.place), [], 'a source resting on one that waits waits too');
  writeFileSync(authAt, auth);
});
