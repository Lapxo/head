import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { actsOf, allowedOf, isOpen } from '../src/core/act.ts';

const at = (n: number) => `receipt:2026-10-06T00:00:0${n}Z`;
const intent = (n: number) => ({ scope: 'act/api/op/aaaaaaaaaaaaaaaa', value: 'present', measure: 'status', at: at(n) });
const end = (word: string, n: number) => ({ scope: `act/api/op/aaaaaaaaaaaaaaaa/${word}`, value: 'sha256:00', measure: 'digest', at: at(n) });
const ends = ['done', 'closed'];
const request = 'aaaaaaaaaaaaaaaa'.padEnd(64, '0');

test('a request is open while it landed more intents than it got ends, and every end counts against the allowance', () => {
  deepStrictEqual([isOpen([intent(1)], 'act/api/op/aaaaaaaaaaaaaaaa', ends), isOpen([intent(1), end('closed', 2)], 'act/api/op/aaaaaaaaaaaaaaaa', ends)], [true, false]);
  deepStrictEqual(actsOf([intent(1), end('closed', 2), intent(3)], 'act', ends, 'api', 'op', request), { done: 1, open: true });
  deepStrictEqual(actsOf([intent(1), end('closed', 2), intent(3), end('done', 4)], 'act', ends, 'api', 'op', request), { done: 2, open: false });
});

test('an allowance is the person-s line for the operation, capped by their line for the API; without a line, nothing', () => {
  const allow = (scope: string, hi: number) => ({ scope, value: `0..${hi}`, measure: 'calls' });
  deepStrictEqual([allowedOf([], 'allow', 'api', 'op'), allowedOf([allow('allow/api/op', 3)], 'allow', 'api', 'op'), allowedOf([allow('allow/api/op', 3), allow('allow/api', 0)], 'allow', 'api', 'op')], [0, 3, 0]);
});
