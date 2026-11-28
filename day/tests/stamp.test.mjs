import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVersion, currentVersion } from '../tools/stamp.mjs';

test('the offline worker’s VERSION matches the files it saves (run: node day/tools/stamp.mjs)', () => {
  assert.equal(currentVersion(), computeVersion());
});
