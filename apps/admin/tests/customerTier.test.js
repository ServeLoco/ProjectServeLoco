import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCustomerTier } from '../src/utils/customerTier.js';

test('customer tiers use delivered order count boundaries', () => {
  for (const [count, label] of [[0, 'New'], [1, 'Starter'], [5, 'Starter'], [6, 'Regular'], [15, 'Regular'], [16, 'Loyal'], [100, 'Loyal']]) {
    assert.deepEqual(getCustomerTier(count), { count, label });
  }
  assert.deepEqual(getCustomerTier('6'), { count: 6, label: 'Regular' });
});

test('missing or invalid history does not label a customer New', () => {
  for (const count of [undefined, null, -1, 1.5, 'invalid']) {
    assert.equal(getCustomerTier(count), null);
  }
});
