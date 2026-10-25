import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { availableParallelism, loadavg } from 'node:os';
import { cooled } from '../../src/ports/host.ts';
import { asked, timeless, twins } from '../warm.ts';

const median = (all: readonly number[]) => [...all].sort((x, y) => x - y)[all.length >> 1]!;

test('host, the time measured apart: each read timed from when it is asked, by a process started then and through the place-s fold host, the host-s start timed on its own; the answers the same', async (run) => {
  run.diagnostic(`environment: load ${loadavg().map((n) => n.toFixed(2)).join(' ')} on ${availableParallelism()} cpus · node ${process.version} · ${process.platform} · run alone, after the suite`);
  const rounds = 5, { copies, env, asks } = twins(2 * rounds), reads = asks.filter((args) => args[0] === 'fold');
  const [cold, warm, start] = [new Map<string, number[]>(), new Map<string, number[]>(), [] as number[]];
  try {
    for (let i = 0; i < rounds; i += 1) {
      const [a, b] = [copies[2 * i]!, copies[2 * i + 1]!];
      cooled(); start.push((await asked('warm', b, ['fold', '--as', 'lines'], env)).ms);
      for (const args of reads) {
        const key = args.join(' ');
        const [one, two] = i % 2 ? [await asked('warm', b, args, env), await asked('cold', a, args, env)] : [await asked('cold', a, args, env), await asked('warm', b, args, env)];
        deepStrictEqual([two.printed.code, two.printed.out.map((l) => timeless(l, i % 2 ? a : b))], [one.printed.code, one.printed.out.map((l) => timeless(l, i % 2 ? b : a))]);
        const [c, w] = i % 2 ? [two, one] : [one, two];
        cold.set(key, [...(cold.get(key) ?? []), c.ms]); warm.set(key, [...(warm.get(key) ?? []), w.ms]);
      }
    }
  } finally { cooled(); }
  for (const key of cold.keys()) run.diagnostic(`MEASURED host/seconds ${key}: a process started as asked ${median(cold.get(key)!).toFixed(0)} ms · through the place-s host ${median(warm.get(key)!).toFixed(0)} ms (medians of ${rounds}, alternating which goes first)`);
  run.diagnostic(`MEASURED host/start the first read of a place, its host started for it: ${median(start).toFixed(0)} ms (median of ${start.length})`);
});
