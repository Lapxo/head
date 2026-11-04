import { ChildProcess } from 'node:child_process';
import { appendFileSync } from 'node:fs';
type Spawning = ChildProcess & { spawn: (...args: any[]) => any };
const prototype = ChildProcess.prototype as Spawning;
const start = prototype.spawn;
prototype.spawn = function(this: Spawning, ...args: any[]) {
  const result = Reflect.apply(start, this, args);
  if (this.send) {
    const send = this.send;
    this.send = function(this: Spawning, message: any, ...rest: any[]) {
      if (process.env['HEAD_RECEIVE_TRACE'] && message?.kind === 'request') appendFileSync(process.env['HEAD_RECEIVE_TRACE'], JSON.stringify(message.command) + '\n');
      return Reflect.apply(send, this, [message, ...rest]);
    } as typeof send;
  }
  return result;
} as typeof start;
