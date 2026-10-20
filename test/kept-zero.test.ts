import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { codes, content, person } from './connected-person.ts';

test('yes, over two places: the connect reads its question ahead, so the question is handed that receipt-s body once; asked again in the same conversation it is kept — the source, the hour and the digests, no body and no receipt line — and nothing is called; a new conversation is handed the body once', async () => {
  const [a, b] = [await person(), await person()];
  const [[firstA, againA], [firstB, againB], [laterA]] = await (async () => { try { return [await a.asking(2), await b.asking(2), await a.asking()]; } finally { a.close(); b.close(); } })();
  deepStrictEqual([codes(firstA), codes(againA), codes(firstB), codes(againB)], [['head/answered', 'head/reused'], ['head/kept'], ['head/answered', 'head/reused'], ['head/kept']]);
  deepStrictEqual([content(againA), content(againB), a.reads(), b.reads()], [0, 0, 1, 1], 'what the model already holds is not sent again, and the source is called once, ahead');
  ok(codes(laterA).includes('head/reused') && content(laterA) > 0 && a.reads() === 1, JSON.stringify(codes(laterA)));
});
