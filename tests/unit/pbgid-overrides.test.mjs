import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pbgidUnitOverridesMap } from '../../src/content/pbgid-overrides.ts';

describe('pbgidUnitOverridesMap validation', () => {
  it('has numeric pbgids and well-formed display entries', () => {
    assert.ok(pbgidUnitOverridesMap.size > 0, 'override map should not be empty');
    for (const [pbgid, entry] of pbgidUnitOverridesMap) {
      assert.equal(typeof pbgid, 'number', `pbgid key should be numeric: ${pbgid}`);
      assert.ok(Number.isInteger(pbgid) && pbgid > 0, `pbgid should be positive integer: ${pbgid}`);
      assert.equal(typeof entry.n, 'string', `entry ${pbgid} missing name`);
      assert.ok(entry.n.trim(), `entry ${pbgid} has blank name`);
      assert.equal(typeof entry.k, 'string', `entry ${pbgid} missing merge key`);
      assert.ok(entry.k.trim(), `entry ${pbgid} has blank merge key`);
      if (entry.i != null) {
        assert.match(entry.i, /^https:\/\/data\.aoe4world\.com\/images\/units\/.+\.png$/, `entry ${pbgid} has invalid unit icon URL: ${entry.i}`);
      }
    }
  });
});
