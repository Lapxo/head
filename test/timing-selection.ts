import { shapeOf } from '../src/ports/surface.ts';
export interface TimingRow { readonly side: 'sender' | 'receiver'; readonly verb: string; readonly milliseconds: number; readonly lines: readonly string[] }
/** Different coordinates stay separate: recipient reads, sender reads, and named native red observations. */
export function timingOf(rows: readonly TimingRow[]) {
  if (!rows.length) throw Error('REFUSE·timing/empty');
  const reads = { sender: [] as number[], receiver: [] as number[] }; let redAnswerSeconds = 0;
  for (const row of rows) {
    if (!['sender','receiver'].includes(row.side) || !Number.isFinite(row.milliseconds) || row.milliseconds < 0 || !Array.isArray(row.lines)) throw Error('REFUSE·timing/row');
    const cells = shapeOf(row.lines).cells;
    if (row.verb === 'ask' && cells.some(cell => cell.code === 'head/answered')) reads[row.side].push(row.milliseconds);
    for (const cell of cells) if (cell.state === 'red' && cell.fields['scope'] === 'answer/seconds') {
      const seconds = cell.fields['seconds']; if (seconds === undefined || !/^\d+$/.test(seconds) || !Number.isSafeInteger(Number(seconds))) throw Error('REFUSE·timing/red-seconds');
      redAnswerSeconds = Math.max(redAnswerSeconds, Number(seconds));
    }
  }
  if (!reads.receiver.length) throw Error('REFUSE·timing/no-recipient-read');
  return { receiverMilliseconds: Math.ceil(Math.max(...reads.receiver)), senderMilliseconds: reads.sender.length ? Math.ceil(Math.max(...reads.sender)) : null, redAnswerSeconds, receiverReadCount: reads.receiver.length, senderReadCount: reads.sender.length };
}
