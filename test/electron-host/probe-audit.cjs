const MAX_PROBES = 32;
/** Test-host telemetry only: never record commands, arguments, environment or process output. */
exports.installProbeAudit = (processPort, publish) => {
  const original = processPort.spawnSync; let total = 0;
  const bytes = value => typeof value === 'string' || Buffer.isBuffer(value) ? Buffer.byteLength(value) : 0;
  const error = value => ['ETIMEDOUT', 'EACCES', 'EPERM', 'ENOENT', 'EAGAIN', 'ENOMEM'].includes(value) ? value : value ? 'other' : null;
  const signal = value => ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGINT', 'SIGSEGV'].includes(value) ? value : value ? 'other' : null;
  processPort.spawnSync = function (command, args, options) {
    if (!Array.isArray(args) || args.length !== 2 || args[0] !== '-p' || args[1] !== 'JSON.stringify(process.versions)') return original.apply(this, arguments);
    const ordinal = ++total, started = performance.now();
    const record = (result, thrown) => {
      if (ordinal > MAX_PROBES) { if (ordinal === MAX_PROBES + 1) publish({ type: 'runtime-probe-limit', limit: MAX_PROBES }); return; }
      publish({ type: 'runtime-probe', ordinal, timeoutMs: Number.isFinite(options?.timeout) ? options.timeout : null,
        elapsedMs: Math.round((performance.now() - started) * 1000) / 1000, status: Number.isInteger(result?.status) ? result.status : null,
        signal: signal(result?.signal), errorCode: error(thrown?.code ?? result?.error?.code),
        stdoutBytes: bytes(result?.stdout), stderrBytes: bytes(result?.stderr), threw: !!thrown });
    };
    try { const result = original.apply(this, arguments); record(result); return result; }
    catch (thrown) { record(undefined, thrown); throw thrown; }
  };
  return () => ({ recorded: Math.min(total, MAX_PROBES), omitted: Math.max(total - MAX_PROBES, 0) });
};
