import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resourceCostTotal } from '../../build/resource-cost.mjs';

test('resourceCostTotal preserves authoritative zero-cost units', () => {
  assert.equal(resourceCostTotal({
    food: 0,
    wood: 0,
    gold: 0,
    stone: 0,
    total: 0,
  }), 0);
});

test('resourceCostTotal sums resource components when total is null', () => {
  assert.equal(resourceCostTotal({
    food: 0,
    wood: 0,
    gold: 250,
    stone: 0,
    total: null,
  }), 250);
});

test('resourceCostTotal returns null when no resource cost is supplied', () => {
  assert.equal(resourceCostTotal({ time: 20, popcap: 1 }), null);
});
