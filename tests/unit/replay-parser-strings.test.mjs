import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePlayerColorStringsByPlayerId } from '../../src/background/replay-parser.ts';

test('mergePlayerColorStringsByPlayerId replaces heuristic mojibake names with structural strings', () => {
  const heuristic = [
    {
      slot: 0,
      name: 'ँ',
      civilization: null,
      playerId: '76561199070324001',
      color: 6,
      colorName: 'Orange',
    },
    {
      slot: 1,
      name: 'ナスCreator',
      civilization: 'malian',
      playerId: '76561198335271485',
      color: 9,
      colorName: 'Dark Green',
    },
  ];
  const structural = [
    {
      slot: 0,
      name: 'May',
      civilization: 'sultanate',
      playerId: '76561199070324001',
      color: 6,
      colorName: 'Orange',
    },
    {
      slot: 1,
      name: 'ナスCreator',
      civilization: 'malian',
      playerId: '76561198335271485',
      color: 9,
      colorName: 'Dark Green',
    },
  ];

  assert.deepEqual(mergePlayerColorStringsByPlayerId(heuristic, structural), structural);
});
