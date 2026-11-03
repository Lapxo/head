import { test } from 'node:test';
import { retentionCases } from './retained-fixture.ts';
for (const { name, check } of retentionCases) test(name, check);
