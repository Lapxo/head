import { test, mock } from 'node:test';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { strict as a } from 'node:assert';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, chmodSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startupDiagnostic } from './installed-share.ts';
import { systemNode, relayToNode } from '../src/ports/executable.ts';

test('installed Node discovery: real executable, no relative PATH, missing/old/Electron candidates refuse without leaking output', () => {
  const root = mkdtempSync(join(tmpdir(), 'head-node-selection-'));
  try {
    const real = join(root, 'real'); mkdirSync(real); symlinkSync(process.execPath, join(real, 'node'));
    a.equal(systemNode([real]), process.execPath);
    a.throws(() => systemNode([]), /runtime\/node-required/);
    a.throws(() => systemNode(['.', 'relative']), /runtime\/node-required/);
    for (const [name, text] of [['old', '{"node":"20.0.0"}'], ['electron', '{"node":"24.0.0","electron":"1.0"}'], ['malformed', 'private-error-canary']]) {
      const dir = join(root, name); mkdirSync(dir); const at = join(dir, 'node'); writeFileSync(at, `#!/bin/sh\nprintf '%s' '${text}'\n`); chmodSync(at, 0o755);
      a.throws(() => systemNode([dir]), error => error instanceof Error && /runtime\/node-required/.test(error.message) && !error.message.includes('private-error-canary'));
      a.equal(systemNode([dir, real]), process.execPath);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('whole-entry relaunch preserves exit status and strips runtime injection variables', async () => {
  const root = mkdtempSync(join(tmpdir(), 'head-node-relay-')), before = process.env['NODE_OPTIONS'];
  try {
    const entry = join(root, 'child.mjs'); writeFileSync(entry, "if(process.env.NODE_OPTIONS || process.versions.electron) process.exit(2);process.exit(Number(process.argv[2]));\n");
    process.env['NODE_OPTIONS'] = '--require=/not/a/module';
    a.equal(await relayToNode(entry, ['7'], [dirname(process.execPath)]), 7);
  } finally { if (before === undefined) delete process.env['NODE_OPTIONS']; else process.env['NODE_OPTIONS'] = before; rmSync(root, { recursive: true, force: true }); }
});

test('relay uses virtual JavaScript streams: MessagePort input, byte-exact output, diagnostics and EOF never bypass the host', { timeout: 10000 }, async context => {
  const { spawn } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'head-stream-bridge-'));
  const wrapper = join(root, 'host.mjs'), child = join(root, 'echo.mjs');
  writeFileSync(child, "process.stdin.pipe(process.stdout,{end:false});process.stdin.once('end',()=>{process.stderr.write('neutral diagnostic\\n');process.exitCode=7;});\n");
  writeFileSync(wrapper, `import{Readable}from'node:stream';import{MessageChannel}from'node:worker_threads';import{relayToNode}from ${JSON.stringify(new URL('../src/ports/executable.ts', import.meta.url).href)};const{port1,port2}=new MessageChannel(),input=new Readable({read(){}});Object.defineProperty(process,'stdin',{value:input});process.stdout.write=(bytes,encoding,done)=>{if(bytes.length)port1.postMessage({type:'stdout',bytes:Buffer.from(bytes)});const cb=typeof encoding==='function'?encoding:done;if(cb)process.nextTick(cb);return true;};process.stderr.write=(bytes,encoding,done)=>{if(bytes.length)port1.postMessage({type:'stderr',bytes:Buffer.from(bytes)});const cb=typeof encoding==='function'?encoding:done;if(cb)process.nextTick(cb);return true;};port1.on('message',m=>input.push(m.type==='end'?null:Buffer.from(m.bytes)));port2.on('message',m=>{if(m.type==='done'){process.send(m,()=>{port1.close();port2.close();process.disconnect();});}else process.send(m);});process.on('message',m=>port2.postMessage(m));const result=relayToNode(${JSON.stringify(child)},[],[${JSON.stringify(dirname(process.execPath))}]);process.send({type:'ready'});port1.postMessage({type:'done',code:await result});\n`);
  const host = spawn(process.execPath, [wrapper], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'advanced' });
  context.signal.addEventListener('abort', () => host.kill());
  const stdout: Buffer[] = [], stderr: Buffer[] = [], physical: Buffer[] = [];
  const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { text: 'ñ🌐' + 'x'.repeat(262144) } }) + '\n');
  let code: number | undefined;
  host.stdout!.on('data', chunk => physical.push(chunk)); host.stderr!.on('data', chunk => physical.push(chunk));
  host.on('message', message => { const m = message as { type: string; bytes?: Uint8Array; code?: number }; if (m.type === 'ready') { host.send({ type: 'input', bytes: bytes.subarray(0, 72) }); host.send({ type: 'input', bytes: bytes.subarray(72) }); host.send({ type: 'end' }); } else if (m.type === 'stdout') stdout.push(Buffer.from(m.bytes!)); else if (m.type === 'stderr') stderr.push(Buffer.from(m.bytes!)); else if (m.type === 'done') code = m.code; });
  try { await new Promise<void>((resolve, reject) => { host.once('error', reject); host.once('close', status => status === 0 ? resolve() : reject(Error('neutral host exit ' + status))); }); a.equal(code, 7); a.equal(Buffer.concat(stdout).length, bytes.length); a.deepEqual(Buffer.concat(stdout), bytes); a.equal(Buffer.concat(stderr).toString(), 'neutral diagnostic\n'); a.equal(Buffer.concat(physical).length, 0); }
  finally { host.kill(); rmSync(root, { recursive: true, force: true }); }
});

test('runtime discovery chooses the greatest compatible version and finds unlinked Homebrew and home managers', async () => {
  const { nodeDirectories } = await import('../src/ports/executable.ts');
  const root = mkdtempSync(join(tmpdir(), 'head-node-managers-'));
  try {
    const locations = ['brew/opt/node@24/bin', 'home/.nvm/versions/node/v22.18.0/bin', 'home/.volta/bin', 'home/.local/share/fnm/node-versions/v24.1.0/installation/bin', 'home/.asdf/shims'];
    for (const location of locations) { const dir = join(root, location); mkdirSync(dir, { recursive: true }); symlinkSync(process.execPath, join(dir, 'node')); }
    const found = nodeDirectories({ platform: 'darwin', path: [], home: join(root, 'home'), brew: [join(root, 'brew')] });
    for (const location of locations) a.ok(found.includes(join(root, location)), location);
    a.equal(systemNode([join(root, locations[0]!)]), process.execPath);
    const candidates: string[] = [], versions = new Map<string, string>();
    for (const [name, version, electron] of [['low', '22.18.0', false], ['highest', '26.1.2', false], ['middle', '24.22.0', false], ['electron', '99.0.0', true]] as const) { const dir = join(root, name); mkdirSync(dir); const path = join(dir, 'node'); writeFileSync(path, 'neutral executable fixture\n'); chmodSync(path, 0o755); candidates.push(dir); versions.set(realpathSync(path), JSON.stringify({ node: version, ...(electron ? { electron: 'host' } : {}) })); }
    // Ranking uses controlled process responses; real installed probes above and the Electron gate remain real.
    const processPort = createRequire(import.meta.url)('node:child_process');
    const probe = mock.method(processPort, 'spawnSync', (file: string) => { a.ok(versions.has(file)); return { status: 0, stdout: versions.get(file), stderr: '' }; });
    syncBuiltinESMExports();
    try { a.equal(systemNode(candidates), realpathSync(join(candidates[1]!, 'node'))); a.equal(systemNode([...candidates].reverse()), realpathSync(join(candidates[1]!, 'node'))); a.equal(probe.mock.calls.length, 8); }
    finally { probe.mock.restore(); syncBuiltinESMExports(); }
    const windows = nodeDirectories({ platform: 'win32', path: [], home: join(root, 'empty'), programFiles: join(root, 'program-files') });
    a.ok(windows.includes(join(root, 'program-files/nodejs')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a probe timeout is incomplete discovery, never missing or a silent lower-version fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'head-node-incomplete-')), dirs: string[] = [];
  try {
    for (const name of ['slow', 'valid']) { const dir = join(root, name); mkdirSync(dir); writeFileSync(join(dir, 'node'), 'neutral probe fixture\n'); chmodSync(join(dir, 'node'), 0o755); dirs.push(dir); }
    const processPort = createRequire(import.meta.url)('node:child_process');
    const probe = mock.method(processPort, 'spawnSync', (file: string, _args: unknown, options: { timeout: number }) => {
      a.ok(options.timeout > 0 && options.timeout <= 250);
      return file === realpathSync(join(dirs[0]!, 'node')) ? { status: null, signal: 'SIGTERM', error: Object.assign(Error('private-error-canary'), { code: 'ETIMEDOUT' }), stdout: '', stderr: '' }
        : { status: 0, stdout: JSON.stringify({ node: '22.18.0' }), stderr: '' };
    });
    syncBuiltinESMExports();
    try { for (const order of [dirs, [...dirs].reverse(), [dirs[0]!]]) a.throws(() => systemNode(order), (e: any) => e.reason === 'budget' && !e.message.includes('private-error-canary')); }
    finally { probe.mock.restore(); syncBuiltinESMExports(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Electron probe telemetry is bounded and excludes paths, output, environment and private errors', () => {
  const { installProbeAudit } = createRequire(import.meta.url)('./electron-host/probe-audit.cjs');
  const canary = 'synthetic-private-probe-canary', events: any[] = [], failure = Object.assign(Error(canary), { code: canary });
  let throwing = false, invocations = 0;
  const port = { spawnSync: (..._args: unknown[]) => { invocations++; if (throwing) throw failure; return { status: null, signal: canary, error: Object.assign(Error(canary), { code: 'ETIMEDOUT' }), stdout: canary, stderr: canary }; } };
  const snapshot = installProbeAudit(port, (event: unknown) => events.push(event));
  a.ok(port.spawnSync(canary, ['not-a-version-probe'], { env: { TOKEN: canary } })); a.equal(events.length, 0);
  for (let i = 0; i < 40; i++) port.spawnSync(canary, ['-p', 'JSON.stringify(process.versions)'], { timeout: 250, env: { TOKEN: canary } });
  a.equal(events.length, 33); a.equal(events.filter(e => e.type === 'runtime-probe').length, 32); a.deepEqual(events.at(-1), { type: 'runtime-probe-limit', limit: 32 }); a.deepEqual(snapshot(), { recorded: 32, omitted: 8 }); a.ok(!JSON.stringify(events).includes(canary));
  throwing = true; a.throws(() => port.spawnSync(canary, ['-p', 'JSON.stringify(process.versions)'], {}), e => e === failure); a.equal(invocations, 42);
  const thrownEvents: any[] = [], thrownPort = { spawnSync: (..._args: unknown[]) => { throw failure; } };
  installProbeAudit(thrownPort, (event: unknown) => thrownEvents.push(event)); a.throws(() => thrownPort.spawnSync(canary, ['-p', 'JSON.stringify(process.versions)'], { timeout: 250 }), e => e === failure);
  a.equal(thrownEvents[0].errorCode, 'other'); a.equal(thrownEvents[0].threw, true); a.ok(!JSON.stringify(thrownEvents).includes(canary));
});


test('failed installed startup preserves its declared code and reason without arbitrary reply fields', () => {
  const canary = 'synthetic-private-reply-canary', profile = [{ scope: 'said/runtime-node-required', value: 'lock' }];
  const response = { result: { structuredContent: { cells: Array.from({ length: 20 }, () => ({ code: 'head/runtime-node-required', fields: { reason: 'budget', token: canary, instruction: canary, path: canary } })) } }, error: { message: canary } };
  const text = startupDiagnostic(response, profile); a.ok(!text.includes(canary)); a.ok(text.length <= 2000); const summary = JSON.parse(text); a.equal(summary.cells.length, 8); a.deepEqual(summary.cells[0], { code: 'head/runtime-node-required', reason: 'budget' }); a.equal(summary.rpcError, true);
  a.deepEqual(JSON.parse(startupDiagnostic({ result: { structuredContent: { cells: [{ code: canary, fields: { reason: canary } }, null] } } }, profile)).cells, [{ code: 'other' }, { code: 'other' }]);
});
