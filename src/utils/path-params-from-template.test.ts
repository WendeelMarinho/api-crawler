import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePathParamsFromTemplate, inferPathParamTypeFromName } from './path-params-from-template.js';

test('resolvePathParamsFromTemplate preserves order and dedupes', () => {
  const p = resolvePathParamsFromTemplate('/persons/{personId}/documents/{docId}/{personId}');
  assert.equal(p.length, 2);
  assert.deepEqual(
    p.map((x) => x.name),
    ['personId', 'docId'],
  );
  assert.equal(p[0].required, true);
  assert.equal(p[0].in, 'path');
});

test('inferPathParamTypeFromName', () => {
  assert.equal(inferPathParamTypeFromName('accountId'), 'string');
  assert.equal(inferPathParamTypeFromName('pageOffset'), 'integer');
});
