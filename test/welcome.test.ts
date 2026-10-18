import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { ask } from './client.ts';
import { lock } from './place.ts';

const first = ['welcome', 'what-i-have', 'what-next', 'why', 'what-happened'];
const words = /\b(REFUSE|epoch|standing|fold|lot|pin|coordinate)\b|·/;

test('the first prompts a client offers: start with the weather or any API, what I have, what next, why, what happened — each the words a person sends, none of them bound-s', async () => {
  const [listed, welcome, why] = await ask([{ method: 'prompts/list' }, { method: 'prompts/get', params: { name: 'welcome' } },
    { method: 'prompts/get', params: { name: 'why', arguments: { source: 'weather', operation: 'get-v1-forecast' } } }]);
  const names = (listed.result.prompts as { name: string }[]).map((p) => p.name);
  ok(first.every((name) => names.includes(name)), names.join(' '));
  const text = (got: any) => got.result.messages.map((m: any) => m.content.text).join('\n');
  ok(/the address of the document of an API/.test(text(welcome)) && !/https?:\/\//.test(text(welcome)), 'welcome asks for the person-s own API by the address of its document, and names none');
  ok(text(why).includes('get-v1-forecast') && text(why).includes('weather'), text(why));
  deepStrictEqual(first.flatMap((name) => ((said) => (words.test(said) ? [`${name}: ${said}`] : []))(lock.find((l) => l.scope === `prompt/${name}/text`)!.about!)), []);
});
