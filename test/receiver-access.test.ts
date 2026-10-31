import { test } from 'node:test';
import { ok } from 'node:assert/strict';
import { receiverAccess } from './receiver-access.ts';
const bundle = process.env['HEAD_RECEIVER_ACCESS_BUNDLE'];
test('received APIs use one persistent recipient keychain across import and access processes, without inheriting authority', { skip: bundle ? false : 'HEAD_RECEIVER_ACCESS_BUNDLE names no installed fixture' }, async () => {
  const result = await receiverAccess(bundle!);
  ok(result.persistentKeychain && result.domains.length === 2 && !result.coverageWidened && !result.productModified);
});
