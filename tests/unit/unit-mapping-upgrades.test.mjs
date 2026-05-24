import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUnitGroupForUpgrade, isBuildingUpgrade } from '../../src/content/unit-mapping.ts';
import { pbgidTechsMap } from '../../src/content/pbgid-map.ts';

function makeGrouped(entries) {
  const m = new Map();
  for (const [key, label] of entries) m.set(key, { label, key });
  return m;
}

test('findUnitGroupForUpgrade: direct merge-key match', () => {
  const grouped = makeGrouped([['archer', 'Archer']]);
  const got = findUnitGroupForUpgrade('upgrades/archer_upgrade', null, grouped);
  assert.equal(got?.label, 'Archer');
});

test('findUnitGroupForUpgrade: tries snake/kebab variants', () => {
  const groupedKebab = makeGrouped([['royal-knight', 'Royal Knight']]);
  const got = findUnitGroupForUpgrade('upgrades/royal_knight', null, groupedKebab);
  assert.equal(got?.label, 'Royal Knight');

  const groupedSnake = makeGrouped([['royal_knight', 'Royal Knight']]);
  const got2 = findUnitGroupForUpgrade('upgrades/royal-knight', null, groupedSnake);
  assert.equal(got2?.label, 'Royal Knight');
});

test('findUnitGroupForUpgrade: strips tech_/research_/upgrade_ prefixes', () => {
  const grouped = makeGrouped([['ghulam', 'Ghulam']]);
  assert.equal(findUnitGroupForUpgrade('tech_research_ghulam', null, grouped)?.label, 'Ghulam');
  assert.equal(findUnitGroupForUpgrade('upgrade_ghulam', null, grouped)?.label, 'Ghulam');
  assert.equal(findUnitGroupForUpgrade('research_ghulam', null, grouped)?.label, 'Ghulam');
});

test('findUnitGroupForUpgrade: token-substring match for elite/veteran prefixes', () => {
  const grouped = makeGrouped([['ghulam', 'Ghulam']]);
  const got = findUnitGroupForUpgrade('upgrades/elite_ghulam_research', null, grouped);
  assert.equal(got?.label, 'Ghulam');
});

test('findUnitGroupForUpgrade: token match avoids substring traps', () => {
  // "watch_tower_research" should NOT match unit "tower" via substring,
  // because the strategy requires a token boundary; verify it does match
  // legitimately here (whole-token).
  const grouped = makeGrouped([['tower', 'Tower']]);
  const got = findUnitGroupForUpgrade('upgrades/watch_tower_research', null, grouped);
  assert.equal(got?.label, 'Tower');
});

test('findUnitGroupForUpgrade: display-name suffix match (plurals)', () => {
  const grouped = makeGrouped([['rk', 'Royal Knight']]);
  assert.equal(findUnitGroupForUpgrade('upgrades/lancer_3', 'Veteran Royal Knights', grouped)?.label, 'Royal Knight');
  assert.equal(findUnitGroupForUpgrade('upgrades/lancer_3', 'Elite Royal Knight', grouped)?.label, 'Royal Knight');
});

test('findUnitGroupForUpgrade: display-name handles "men" → "man"', () => {
  const grouped = makeGrouped([['ma', 'Man-at-Arms']]);
  // pluralization rule covers "men"→"man"
  const got = findUnitGroupForUpgrade('upgrades/foo', 'Veteran Man-at-Arms', grouped);
  assert.equal(got?.label, 'Man-at-Arms');
});

test('findUnitGroupForUpgrade: returns null when no match', () => {
  const grouped = makeGrouped([['archer', 'Archer']]);
  assert.equal(findUnitGroupForUpgrade('upgrades/totally_unknown', 'Something Else', grouped), null);
  assert.equal(findUnitGroupForUpgrade('', '', grouped), null);
});

test('findUnitGroupForUpgrade: iconAliasMap routes legacy icon → canonical group', () => {
  // French upgrades use lancer icons but the unit group is keyed by royal-knight.
  const grouped = makeGrouped([['royal-knight', 'Royal Knight']]);
  const aliasMap = new Map([['lancer', 'royal-knight']]);
  const got = findUnitGroupForUpgrade('upgrades/lancer_3', null, grouped, null, aliasMap);
  assert.equal(got?.label, 'Royal Knight');
});

test('isBuildingUpgrade identifies emplacement/tower defensive upgrades', () => {
  assert.equal(isBuildingUpgrade('technologies/springald_emplacement_3', 'Springald Emplacement'), true);
  assert.equal(isBuildingUpgrade('technologies/cannon-emplacement-4.png', 'Cannon Emplacement'), true);
  assert.equal(isBuildingUpgrade('icons/races/common/upgrades/springald', 'Springald'), true);
  assert.equal(isBuildingUpgrade('technologies/handcannon_slits_2', 'Handcannon Slits'), true);
  assert.equal(isBuildingUpgrade('technologies/tower_shields_4', 'Tower Shields'), true);
  assert.equal(isBuildingUpgrade('technologies/springald_crews_3', 'Springald Crews'), false);
  assert.equal(isBuildingUpgrade('upgrades/tower_elephant_3', 'Elite Tower Elephant'), false);
});

test('findUnitGroupForUpgrade: omits Springald Emplacement from Springald unit dots', () => {
  const grouped = makeGrouped([['springald', 'Springald']]);
  const got = findUnitGroupForUpgrade('technologies/springald_emplacement_3', 'Springald Emplacement', grouped);
  assert.equal(got, null);
});

test('findUnitGroupForUpgrade: omits outpost Springald upgrades that only expose generic springald icon/name', () => {
  const grouped = makeGrouped([['springald', 'Springald']]);
  const got = findUnitGroupForUpgrade('icons/races/common/upgrades/springald', 'Springald', grouped, 127329);
  assert.equal(got, null);
});

test('findUnitGroupForUpgrade: omits building upgrades even when pbgid tech map has the canonical key', () => {
  const previous = pbgidTechsMap.get(127371);
  pbgidTechsMap.set(127371, {
    n: 'Springald Emplacement',
    k: 'springald-emplacement',
    i: 'https://data.aoe4world.com/images/technologies/springald-emplacement-3.png',
  });
  try {
    const grouped = makeGrouped([['springald', 'Springald']]);
    const got = findUnitGroupForUpgrade('technologies/springald_3', 'Springald', grouped, 127371);
    assert.equal(got, null);
  } finally {
    if (previous) pbgidTechsMap.set(127371, previous);
    else pbgidTechsMap.delete(127371);
  }
});

test('findUnitGroupForUpgrade: still allows non-building Springald unit upgrades', () => {
  const grouped = makeGrouped([['springald', 'Springald']]);
  const got = findUnitGroupForUpgrade('technologies/springald_crews_3', 'Springald Crews', grouped);
  assert.equal(got?.label, 'Springald');
});
