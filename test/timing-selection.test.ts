import { test } from 'node:test'; import { strict as assert } from 'node:assert'; import { timingOf, type TimingRow } from './timing-selection.ts';
const row = (side: 'sender'|'receiver', ms: number, verb='ask', lines=['said/head/answered state=done']) => ({ side, milliseconds:ms, verb, lines });
for(const domain of ['warehouse','observatory']) {
  test(domain+': sender, recipient and card/action elapsed never exchange coordinates',()=>{const got=timingOf([row('sender',6360.526),row('receiver',5770.682),row('receiver',9000,'act'),row('receiver',10000,'ask',['said/head/no-yes state=refused'])]);assert.deepEqual(got,{receiverMilliseconds:5771,senderMilliseconds:6361,redAnswerSeconds:0,receiverReadCount:1,senderReadCount:1})});
  test(domain+': external milliseconds never become native red seconds',()=>{const got=timingOf([row('receiver',5770.682),row('sender',15000,'ask',['said/head/red state=red scope="answer/seconds" seconds="8"'])]);assert.equal(got.redAnswerSeconds,8);assert.equal(got.receiverMilliseconds,5771)});
  test(domain+': absent recipient, invalid clock and malformed red are rejected',()=>{for(const rows of [[],[row('sender',1)],[row('receiver',NaN)],[row('receiver',-1)],[row('receiver',1,'ask',['said/head/answered state=done','said/head/red state=red scope="answer/seconds" seconds="1.5"'])]])assert.throws(()=>timingOf(rows as TimingRow[]))});
}
