import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeCountValues,
  activeValueValues,
  collapseChartSeries,
} from '../../src/content/chart-utils.ts';

describe('activeValueValues', () => {
  test('returns cost-weighted active value at each label', () => {
    // Two events: unit A (cost 100) at t=10, unit B (cost 50) at t=20.
    // No deaths. At t=5 -> 0; t=15 -> 100; t=25 -> 150; t=99 -> 150.
    const values = activeValueValues(
      [0, 15, 25, 99],
      [10, 20],
      [100, 50],
      [],
      []
    );
    assert.deepEqual([...values], [0, 100, 150, 150]);
  });

  test('subtracts cost on destroyed events', () => {
    // unit A (100) at t=10, destroyed at t=30. unit B (50) at t=20.
    const values = activeValueValues(
      [0, 15, 25, 35, 45],
      [10, 20],
      [100, 50],
      [30],
      [100]
    );
    assert.deepEqual([...values], [0, 100, 150, 50, 50]);
  });

  test('never drops below zero on cost mismatches', () => {
    const values = activeValueValues(
      [0, 50],
      [],
      [],
      [10],
      [200]
    );
    assert.deepEqual([...values], [0, 0]);
  });

  test('missing cost entries are treated as 0', () => {
    const values = activeValueValues(
      [0, 15, 25],
      [10, 20],
      [50],
      [],
      []
    );
    // Only first event has cost; second is 0.
    assert.deepEqual([...values], [0, 50, 50]);
  });
});

describe('activeCountValues unchanged', () => {
  test('basic active count', () => {
    const values = activeCountValues([0, 10, 20, 30], [5, 15], [25]);
    assert.deepEqual([...values], [0, 1, 2, 1]);
  });
});

describe('collapseChartSeries', () => {
  const mkSeries = (label, values, opts = {}) => ({
    label,
    color: '#000',
    values,
    ...opts,
  });

  test('returns sorted (descending) when below limit, no Other bucket', () => {
    const series = [
      mkSeries('A', [0, 1, 2]),
      mkSeries('B', [0, 5, 3]),
    ];
    const out = collapseChartSeries(series, 5);
    assert.equal(out.length, 2);
    assert.equal(out[0].label, 'B');
    assert.equal(out[1].label, 'A');
  });

  test('collapses excess series into Other bucket summing values', () => {
    const series = [
      mkSeries('A', [10, 10]),
      mkSeries('B', [8, 8]),
      mkSeries('C', [2, 2]),
      mkSeries('D', [1, 1]),
    ];
    const out = collapseChartSeries(series, 3);
    assert.equal(out.length, 3);
    const other = out.find(s => s.label === 'Other');
    assert.ok(other, 'Other bucket exists');
    assert.deepEqual([...other.values], [3, 3], 'C + D values summed');
  });

  test('aggregates _countValues and _valueValues onto Other bucket when present', () => {
    const series = [
      mkSeries('A', [10, 10], { _countValues: [10, 10], _valueValues: [1000, 1000], _valueTotal: 2000, createdTotal: 10 }),
      mkSeries('B', [8, 8], { _countValues: [8, 8], _valueValues: [800, 800], _valueTotal: 1600, createdTotal: 8 }),
      mkSeries('C', [2, 2], {
        _countValues: [2, 2],
        _valueValues: [200, 200],
        _valueTotal: 400,
        createdTotal: 2,
        _finishedTimes: [30, 10],
        _finishedCosts: [80, 120],
        _destroyedTimes: [40],
        _destroyedCosts: [120],
      }),
      mkSeries('D', [1, 1], {
        _countValues: [1, 1],
        _valueValues: [100, 100],
        _valueTotal: 200,
        createdTotal: 1,
        _finishedTimes: [20],
        _finishedCosts: [100],
        _destroyedTimes: [35],
        _destroyedCosts: [100],
      }),
    ];
    const out = collapseChartSeries(series, 3);
    const other = out.find(s => s.label === 'Other');
    assert.ok(other);
    assert.deepEqual([...other._countValues], [3, 3], 'count arrays summed');
    assert.deepEqual([...other._valueValues], [300, 300], 'value arrays summed');
    assert.equal(other._valueTotal, 600, 'value totals summed');
    assert.equal(other.createdTotal, 3, 'createdTotal summed');
    assert.deepEqual([...other._finishedTimes], [10, 20, 30], 'finished events sorted');
    assert.deepEqual([...other._finishedCosts], [120, 100, 80], 'finished costs stay aligned with sorted event times');
    assert.deepEqual([...other._destroyedTimes], [35, 40], 'destroyed events sorted');
    assert.deepEqual([...other._destroyedCosts], [100, 120], 'destroyed costs stay aligned with sorted event times');
  });

  test('Other has no _countValues/_valueValues when none of the rest had them', () => {
    const series = [
      mkSeries('A', [10]),
      mkSeries('B', [8]),
      mkSeries('C', [2]),
      mkSeries('D', [1]),
    ];
    const out = collapseChartSeries(series, 3);
    const other = out.find(s => s.label === 'Other');
    assert.ok(other);
    assert.equal(other._countValues, undefined);
    assert.equal(other._valueValues, undefined);
  });
});
