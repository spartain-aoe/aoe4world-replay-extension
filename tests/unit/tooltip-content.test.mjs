import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import * as armyLegendMetrics from '../../src/content/army-legend-metrics.ts';

globalThis.__aoe4CombatMetrics = armyLegendMetrics;

const {
  appendVillagerEfficiencyTooltipRows,
  appendUpgradeTooltipLabel,
  readableTooltipAccentColor,
} = await import('../../src/content/tooltip-content.ts');

describe('tooltip-content upgrade labels', () => {
  it('brightens dark player colors for tooltip accents', () => {
    const readable = readableTooltipAccentColor('#166534');

    assert.notEqual(readable, '#166534');
    assert.match(readable, /^#[0-9A-F]{6}$/);
  });

  it('keeps already-readable light colors as accents', () => {
    assert.equal(readableTooltipAccentColor('#FACC15'), '#FACC15');
  });

  it('renders upgrade text with readable classes instead of coloring the full row', () => {
    const { document } = parseHTML('<div id="tooltip"></div>');
    globalThis.document = document;
    const tooltip = document.getElementById('tooltip');

    const row = appendUpgradeTooltipLabel(tooltip, 'Twon LEGEND', 'Hardened Atgeirmadr', '#166534', true);

    assert.equal(row.textContent, '⬆Twon LEGEND: Hardened Atgeirmadr');
    assert.equal(row.className, 'aoe4-summary-tooltip-upgrade');
    assert.ok(row.querySelector('.aoe4-summary-tooltip-upgrade-marker'));
    assert.equal(row.querySelector('.aoe4-summary-tooltip-upgrade-player')?.textContent, 'Twon LEGEND');
    assert.equal(row.querySelector('.aoe4-summary-tooltip-upgrade-name')?.textContent, 'Hardened Atgeirmadr');
    assert.ok(!String(row.getAttribute('style') || '').includes('color:'));
    assert.ok(row.style.getPropertyValue('--aoe4-upgrade-accent'));
  });
});

describe('tooltip-content villager efficiency rows', () => {
  it('groups actual, ideal, missed, and killed values by player without leader deltas', () => {
    const { document } = parseHTML('<div id="tooltip"></div>');
    globalThis.document = document;
    const tooltip = document.getElementById('tooltip');
    const row = (playerName, unitLabel, value, color) => ({
      item: {
        label: `${playerName}: ${unitLabel}`,
        unitLabel,
        playerName,
        color,
        values: [value],
      },
      value,
    });

    appendVillagerEfficiencyTooltipRows(tooltip, [
      row('Alpha', 'Actual', 42, '#0162FF'),
      row('Alpha', 'Ideal', 50, '#0162FF'),
      row('Alpha', 'Missed production', 5, '#F59E0B'),
      row('Alpha', 'Killed', 3, '#EF4444'),
      row('Bravo', 'Actual', 39, '#F60000'),
    ]);

    assert.deepEqual(
      [...tooltip.querySelectorAll('.aoe4-summary-tooltip-section')].map(node => node.textContent),
      ['Alpha', 'Bravo'],
    );
    assert.match(tooltip.textContent, /42.*Actual.*50.*Ideal.*5.*Missed production.*3.*Killed/s);
    assert.doesNotMatch(tooltip.textContent, /\([+-]?\d+\)/);
  });
});
