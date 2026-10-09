import type { Answer } from '../core/answer.ts';
import { admissionOf, deviceOf } from '../core/device.ts';
import { aboutOf } from '../core/lock.ts';
import { deviceKey } from '../flows/device.ts';

/** The lines that admit this device: its key is read from the keychain, or made there once; only its public half goes out. */
export const answer: Answer = async (asked, context) => {
  const role = asked['who'] || undefined;
  if (!deviceOf(context.lock, role).account) return [aboutOf(context.lock, 'said/no-role')];
  const key = deviceKey(context, role);
  return key === undefined ? [aboutOf(context.lock, 'said/no-keychain')] : admissionOf(context.lock, key, role);
};
