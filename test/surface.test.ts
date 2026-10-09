import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { matches } from '@lapxo/topos/wire';
import { fileURLToPath } from 'node:url';
import { members, declaredOf } from '../src/core/lock.ts';
import { fill, matchTemplate, redIn, refusedOn, surfaceOf } from '../src/core/surface.ts';
import { lockAt } from '../src/ports/place.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const surface = surfaceOf(lockAt(root));
const sources = (dir: string): readonly string[] => readdirSync(`${root}/${dir}`, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
const text = (file: string): string => readFileSync(`${root}/${file}`, 'utf8');
const modules = (family: string): readonly string[] => readdirSync(`${root}/src/${family}`).map((f) => f.replace(/\.ts$/, '')).sort();

test('surface/unmatched: every tool and resource line has its module, and every module its line', () => {
  deepStrictEqual(surface.tools.map((t) => t.name).sort(), modules('tools'));
  deepStrictEqual(surface.resources.map((r) => r.name).sort(), modules('resources'));
});

test('surface/sdk-importers: the protocol is spoken by one file', () => {
  deepStrictEqual(sources('src').filter((f) => text(f).includes('@modelcontextprotocol/sdk')), ['src/index.ts']);
});

test('surface/scheduled: no timer, no worker, no resident process', () => {
  deepStrictEqual(sources('src').filter((f) => /\b(setInterval|setTimeout|setImmediate|worker_threads|Worker|unref)\b/.test(text(f))), []);
});

test('surface/client-words: no client is named anywhere in head, adapters included — a channel is chosen by what the client declares', () => {
  const words = declaredOf(readFileSync(`${root}/TARGET.bound`, 'utf8')).find((l) => l.scope === 'surface/client-words/words')!.value!.split('|');
  deepStrictEqual([words.length > 0, sources('src').flatMap((f) => words.filter((w) => text(f).toLowerCase().includes(w)).map((w) => `${f}: ${w}`))], [true, []]);
});

test('surface/kind-words: no kind of source and no scheme is named outside the adapters; those words live in worlds and in one adapter each', () => {
  const words = declaredOf(readFileSync(`${root}/TARGET.bound`, 'utf8')).find((l) => l.scope === 'surface/kind-words/words')!.value!.split('|');
  const held = sources('src').filter((f) => !regionOf('adapters').includes(f)).flatMap((f) => words.filter((w) => text(f).toLowerCase().includes(w)).map((w) => `${f}: ${w}`));
  deepStrictEqual([words.length > 0, held], [true, []]);
});

const lines = (f: string): number => text(f).split('\n').length - 1;
const lock = declaredOf(text('TARGET.bound'));

test('a measure past its ceiling in head-s lock reads red, whole seconds, with the coordinate it ran at; within it, nothing', () => {
  const red = redIn(declaredOf(text('TARGET.bound')));
  deepStrictEqual([red('answer/seconds', 'answer/s/op@8', 0, 2999), red('answer/kept', 'answer/s/op@8', 0, 999), red('connect/seconds', 'connect/s', 0, 10_999)], [[], [], []]);
  deepStrictEqual([red('answer/seconds', 'answer/s/op@8', 0, 3000), red('answer/kept', 'answer/s/op@8', 0, 1000)],
    [['red: answer/s/op@8 took 3 s, over answer/seconds 0..2.'], ['red: answer/s/op@8 took 1 s, over answer/kept 0..0.']]);
});

test('a host the lock does not name is refused by name, every call, nothing done; the one it names is not', () => {
  deepStrictEqual([refusedOn(lock, 'darwin'), refusedOn(lock, 'linux'), refusedOn(lock, 'win32'), refusedOn(lock, 'freebsd')],
    [undefined, undefined, undefined, 'head runs on darwin|linux|win32; this host is freebsd: nothing was done. Its secret store and browser opener are none head carries.']);
});

/** The files of a region, as the lock's coordinates for it say: file paths follow the coordinates, never the other way. */
const regionOf = (name: string): readonly string[] => ((globs) => sources('src').filter((f) => globs.some((glob) => matches(glob, f))))(members(lock.find((l) => l.scope === `region/${name}` && l.measure === 'coordinates')?.value ?? ''));
const lined = lock.filter((l) => l.scope?.endsWith('/lines') && l.form === 'interval' && lock.some((r) => r.scope === `region/${l.scope!.split('/')[0]}` && r.measure === 'coordinates'));

test('each region the lock gives a lines ceiling stays under it — together, or file by file where it measures the lines of a file — and every source file lives in exactly one', () => {
  const over = lined.flatMap((l) => ((name, hi) => ((files) => (l.measure === 'file-lines' ? files.filter((f) => lines(f) > hi) : files.reduce((n, f) => n + lines(f), 0) > hi ? [name] : []))(regionOf(name)))(l.scope!.split('/')[0]!, Number(l.value!.split('..')[1])));
  deepStrictEqual([lined.length >= 4, over, sources('src').filter((f) => lined.filter((l) => regionOf(l.scope!.split('/')[0]!).includes(f)).length !== 1)], [true, [], []]);
});

test('tools/config: the tools that configure a place are the ones answered from the places or the sources region, the lock names each, and they stay under their ceiling', () => {
  const declared = members(lock.find((l) => l.scope === 'tools/config' && l.measure === 'id')?.value ?? '');
  const configuring = [...regionOf('places'), ...regionOf('sources')];
  const answeredFrom = (name: string) => /from '(\.\.\/[^']+)'/.exec(text(`src/tools/${name}.ts`))?.[1]?.replace('../', 'src/') ?? '';
  deepStrictEqual(modules('tools').filter((name) => configuring.includes(answeredFrom(name))).sort(), [...declared].sort());
  ok(declared.length > 0 && declared.length <= Number(lock.find((l) => l.scope === 'tools/config' && l.measure === 'count')!.value!.split('..')[1]));
});

test('duplicate/src: no body is said twice — a code line of 60 characters or more, or three consecutive lines of 120, in two places; imports, comments and declaration headers are no body', () => {
  const said = new Map<string, string[]>();
  const body = (l: string) => l.length > 8 && !/^(import |export |\/\*\*|\*|\/\/)/.test(l);
  for (const f of sources('src')) {
    const held = text(f).split('\n').map((l) => l.trim().replace(/\s+/g, ' '));
    held.forEach((l, i) => {
      const window = held.slice(i, i + 3);
      for (const key of [body(l) && l.length >= 60 ? l : '', window.length === 3 && window.every(body) && window.join(' ').length >= 120 ? window.join(' ⏎ ') : '']) if (key) (said.get(key) ?? said.set(key, []).get(key)!).push(`${f}:${i + 1}`);
    });
  }
  deepStrictEqual([...said].filter(([, at]) => at.length > 1).map(([key, at]) => `${at.join(' ')} · ${key.slice(0, 80)}`), []);
});

test('a prompt is read off its lines and filled only where it was asked', () => {
  const lock = declaredOf([
    'bound-lock/1 about="Say what X may do." at=t by=target form=alphabet measure=id role=writes scope=prompt/can value=who|limit',
    'bound-lock/1 about="who acts" at=t by=target form=alphabet measure=id role=writes scope=prompt/can/who value=string',
    'bound-lock/1 about="{who} can do it up to {limit} times" at=t by=target form=alphabet measure=id role=writes scope=prompt/can/text value=lock',
    'bound-lock/1 at=t by=target form=alphabet measure=id role=writes scope=prompt/can/required value=who',
  ].join('\n'));
  const [prompt] = surfaceOf(lock).prompts;
  deepStrictEqual(prompt?.fields.map((f) => [f.name, f.required]), [['who', true], ['limit', false]]);
  deepStrictEqual(fill(prompt!.text, { who: 'ana' }), 'ana can do it up to {limit} times');
});

test('a resource URI gives its template the fields it names, query fields optional and in any order, decoded', () => {
  const t = 'bound://view/{view}{?place,at}';
  deepStrictEqual(matchTemplate(t, 'bound://view/help'), { view: 'help' });
  deepStrictEqual(matchTemplate(t, 'bound://view/cells?at=1&place=%2Ftmp%2Fa%20b'), { view: 'cells', place: '/tmp/a b', at: '1' });
  deepStrictEqual(matchTemplate(t, 'bound://other/help'), undefined);
  deepStrictEqual(matchTemplate(t, 'bound://view/a/b'), undefined);
});
