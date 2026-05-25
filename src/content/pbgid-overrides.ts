import type { PbgidEntry } from './types.ts';

const UNIT_IMAGE_BASE = 'https://data.aoe4world.com/images/units/';

// Replay summaries can contain fresh or civ-specific unit PBGIDs before they
// land in aoe4world/data. Generated data wins; this layer fills the gaps.
// Curated from observed aoe4world summaries/replays; append the smallest
// missing-PBGID mappings needed when new uncovered units are spotted.
function unit(name: string, key: string, slug: string): PbgidEntry {
  return { n: name, k: key, i: `${UNIT_IMAGE_BASE}${slug}.png` };
}

// Some units (Scorpion, Bannermen, Cattle, Trade Cart, Treasure Caravan,
// Fortress) have no icon on the aoe4world CDN. Omit `i` so the extension
// falls through to DOM-scraped icons from the page itself.
function unitNoIcon(name: string, key: string): PbgidEntry {
  return { n: name, k: key };
}

const BATTERING_RAM = unit('Battering Ram', 'battering-ram', 'battering-ram-2');
const KATANA_BANNERMAN = unit('Katana Bannerman', 'katana-bannerman', 'katana-bannerman-2');
const UMA_BANNERMAN = unit('Uma Bannerman', 'uma-bannerman', 'uma-bannerman-2');
const YUMI_BANNERMAN = unit('Yumi Bannerman', 'yumi-bannerman', 'yumi-bannerman-2');

export const pbgidUnitOverridesMap: Map<number, PbgidEntry> = new Map([
  [166629, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-2')],
  [166630, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-3')],
  [166631, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-4')],
  [2104165, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-2')],
  [2104166, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-3')],
  [2104167, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-4')],
  [2555054, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-2')],
  [7079241, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-3')],
  [8111470, unit('Zhuge Nu', 'zhuge-nu', 'zhuge-nu-4')],

  [137570, unit('Palace Guard', 'palace-guard', 'palace-guard-3')],
  [137574, unit('Palace Guard', 'palace-guard', 'palace-guard-4')],
  [2138270, unit('Palace Guard', 'palace-guard', 'palace-guard-2')],
  [2320449, unit('Palace Guard', 'palace-guard', 'palace-guard-4')],
  [4841125, unit('Palace Guard', 'palace-guard', 'palace-guard-3')],

  [9004160, unit('Horseman', 'horseman', 'horseman-2')],
  [9004164, unit('Horseman', 'horseman', 'horseman-3')],
  [9004165, unit('Horseman', 'horseman', 'horseman-4')],
  [9004188, unit('Mohe Tribesman', 'mohe-tribesman', 'mohe-tribesman-2')],
  [9004189, unit('Mohe Tribesman', 'mohe-tribesman', 'mohe-tribesman-3')],
  [9004190, unit('Mohe Tribesman', 'mohe-tribesman', 'mohe-tribesman-4')],
  // Jin "Horse Archer" is just the non-grassland name for Mohe Tribesman —
  // map both age-tier PBGIDs to the same family so the army series stays
  // labeled "Mohe Tribesman" with its mohe icon.
  [9003972, unit('Mohe Tribesman', 'mohe-tribesman', 'mohe-tribesman-2')],
  [9003973, unit('Mohe Tribesman', 'mohe-tribesman', 'mohe-tribesman-3')],
  [9003974, unit('Mohe Tribesman', 'mohe-tribesman', 'mohe-tribesman-4')],
  [9004731, unit('Iron Pagoda', 'iron-pagoda', 'iron-pagoda-2')],
  [9003926, unit('Iron Pagoda', 'iron-pagoda', 'iron-pagoda-3')],
  [9003927, unit('Iron Pagoda', 'iron-pagoda', 'iron-pagoda-4')],
  [9004734, unit('Iron Pagoda', 'iron-pagoda', 'iron-pagoda-2')],
  [9004191, unit('Iron Pagoda', 'iron-pagoda', 'iron-pagoda-3')],
  [9004192, unit('Iron Pagoda', 'iron-pagoda', 'iron-pagoda-4')],

  [3872959, unit('Keshik', 'keshik', 'keshik-2')],
  [8150218, unit('Keshik', 'keshik', 'keshik-3')],
  [8838814, unit('Keshik', 'keshik', 'keshik-4')],
  [2132734, unit('Desert Raider', 'desert-raider', 'desert-raider-3')],
  [2132735, unit('Desert Raider', 'desert-raider', 'desert-raider-4')],
  [2141247, unit('Dervish', 'dervish', 'dervish-2')],

  [132288, BATTERING_RAM],
  [132289, BATTERING_RAM],
  [133339, BATTERING_RAM],
  [133471, BATTERING_RAM],
  [134693, BATTERING_RAM],
  [134733, BATTERING_RAM],
  [135944, BATTERING_RAM],
  [136059, BATTERING_RAM],
  [137527, BATTERING_RAM],
  [142043, BATTERING_RAM],
  [166303, BATTERING_RAM],
  [166409, BATTERING_RAM],
  [199681, BATTERING_RAM],
  [199731, BATTERING_RAM],
  [2034651, BATTERING_RAM],
  [2046453, BATTERING_RAM],
  [2108158, BATTERING_RAM],
  [2108159, BATTERING_RAM],
  [2108160, BATTERING_RAM],
  [2108162, BATTERING_RAM],
  [2108163, BATTERING_RAM],
  [2108165, BATTERING_RAM],
  [2108166, BATTERING_RAM],
  [2108168, BATTERING_RAM],
  [2140595, BATTERING_RAM],
  [2145249, BATTERING_RAM],
  [2145250, BATTERING_RAM],
  [2288733, BATTERING_RAM],
  [2444402, BATTERING_RAM],
  [2917079, BATTERING_RAM],
  [2997701, BATTERING_RAM],
  [4086884, BATTERING_RAM],
  [4937577, BATTERING_RAM],
  [5000102, BATTERING_RAM],
  [5000110, BATTERING_RAM],
  [5197194, BATTERING_RAM],
  [5357892, BATTERING_RAM],
  [6256450, BATTERING_RAM],
  [7881271, BATTERING_RAM],
  [8130911, BATTERING_RAM],
  [8635755, BATTERING_RAM],
  [8930370, BATTERING_RAM],
  [8999925, BATTERING_RAM],
  [8999979, BATTERING_RAM],
  [8999983, BATTERING_RAM],
  [9004028, BATTERING_RAM],
  // ---- v3 generated additions (from ~300 sampled summaries) ----
  // Entries with verified aoe4world CDN icons:
  [2161903, unit('King', 'king', 'king-2')], // x49 crown_king [english]
  [2150983, unit('Shinto Priest', 'shinto-priest', 'shinto-priest-3')], // x46 shinto_priest [japanese]
  [9003946, unit('Scout', 'scout', 'scout-1')], // x40 scout [jin_dynasty]
  [2034642, unit('Mangonel', 'mangonel', 'mangonel-3')], // x30 mangonel [ottomans]
  [9001370, unit('Daimyo', 'daimyo', 'daimyo-2')], // x27 daimyo [sengoku_daimyo]
  [166301, unit('Mangonel', 'mangonel', 'mangonel-3')], // x23 mangonel [english]
  [9001312, unit('Kharash', 'kharash', 'kharash-2')], // x20 kharash [golden_horde]
  [9003922, unit('Horseman', 'horseman', 'horseman-2')], // x19 horseman_2 [jin_dynasty]
  [9000987, unit('Cheirosiphon', 'cheirosiphon', 'cheirosiphon-3')], // x17 chierosiphon [macedonian_dynasty]
  [9001032, unit('Cheirosiphon', 'cheirosiphon', 'cheirosiphon-3')], // x17 chierosiphon [macedonian_dynasty]
  [133030, unit('Warrior Monk', 'warrior-monk', 'warrior-monk-3')], // x16 warrior_monk [rus]
  [9003923, unit('Horseman', 'horseman', 'horseman-3')], // x15 horseman_3 [jin_dynasty]
  [8999978, unit('Mangonel', 'mangonel', 'mangonel-3')], // x14 mangonel [knights_templar]
  [9004114, unit('Hippodrome Horseman', 'hippodrome-horseman', 'hippodrome-horseman-1')], // x13 hippodrome_horseman [macedonian_dynasty]
  [9000377, unit('Mansa Musofadi Warrior', 'mansa-musofadi-warrior', 'mansa-musofadi-warrior-2')], // x12 musofadi_mansa [malians]
  [9004110, unit('Hippodrome Riddari', 'hippodrome-riddari', 'hippodrome-riddari-1')], // x12 hippodrome_riddari [macedonian_dynasty]
  [9004115, unit('Hippodrome Scout', 'hippodrome-scout', 'hippodrome-scout-1')], // x12 hippodrome_scout [macedonian_dynasty]
  [9005002, unit('Worker Elephant', 'worker-elephant', 'worker-elephant-2')], // x12 worker_elephant [tughlaq_dynasty]
  [132252, unit('Ribauldequin', 'ribauldequin', 'ribauldequin-4')], // x11 ribauldequin_4 [french]
  [165135, unit('Cannon', 'cannon', 'cannon-4')], // x11 cannon_4 [french]
  [5000071, unit('Lord of Lancaster', 'lord-of-lancaster', 'lord-of-lancaster-2')], // x11 lord_lancaster [house_of_lancaster]
  [132247, unit('Mangonel', 'mangonel', 'mangonel-3')], // x10 mangonel [french]
  [133501, unit('Horse Archer', 'horse-archer', 'horse-archer-4')], // x10 horsearcher_4 [rus]
  [7534048, unit('Mangonel', 'mangonel', 'mangonel-3')], // x10 mangonel [order_of_the_dragon]
  [2122503, unit('Cheirosiphon', 'cheirosiphon', 'cheirosiphon-3')], // x9 chierosiphon [byzantines]
  [2122504, unit('Cheirosiphon', 'cheirosiphon', 'cheirosiphon-3')], // x9 chierosiphon [byzantines]
  [6478544, unit('Mangonel', 'mangonel', 'mangonel-3')], // x9 mangonel [golden_horde]
  [9000525, unit('Horse Archer', 'horse-archer', 'horse-archer-3')], // x9 horsearcher_3 [ottomans]
  [200254, unit('Mangonel', 'mangonel', 'mangonel-3')], // x8 mangonel [abbasid_dynasty]
  [200258, unit('Mangonel', 'mangonel', 'mangonel-3')], // x8 mangonel [abbasid_dynasty]
  [9000105, unit('Khaganate Elite Horse Archer', 'khaganate-horse-archer', 'horse-archer-4')], // x8 turkic_archer_4 [mongols]
  [9001371, unit('Daimyo', 'daimyo', 'daimyo-2')], // x8 daimyo [sengoku_daimyo]
  [1905973, unit('Ribauldequin', 'ribauldequin', 'ribauldequin-4')], // x7 ribauldequin_4 [french]
  [2104795, unit('Warrior Monk', 'warrior-monk', 'warrior-monk-3')], // x6 warrior_monk [mongols]
  [2128934, unit('Imperial Official', 'imperial-official', 'imperial-official-1')], // x6 imperial_official [zhu_xis_legacy]
  [2143839, unit('Deployed Ozutsu', 'deployed-ozutsu', 'deployed-ozutsu-4')], // x6 deployed_ozutsu [japanese]
  [5000284, unit('Veteran Demilancer', 'demilancer', 'demilancer-1')], // x6 demilancer [house_of_lancaster]
  [9000509, unit('Mansa Javelineer', 'mansa-javelineer', 'mansa-javelineer-2')], // x6 javelin_thrower_mansa [malians]
  [129966, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x5 ram_2 [mongols]
  [129967, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x5 ram [mongols]
  [1905971, unit('Cannon', 'cannon', 'cannon-4')], // x5 cannon_4 [french]
  [2141248, unit('Dervish', 'dervish', 'dervish-2')], // x5 dervish [ayyubids]
  [2143867, unit('Deployed Bombard', 'deployed-bombard', 'deployed-bombard-4')], // x5 deployed_bombard [japanese]
  [9000376, unit('Mansa Javelineer', 'mansa-javelineer', 'mansa-javelineer-2')], // x5 javelin_thrower_mansa [malians]
  [133028, unit('Mangonel', 'mangonel', 'mangonel-3')], // x4 mangonel [rus]
  [2143869, unit('Deployed Ribauldequin', 'deployed-ribauldequin', 'deployed-ribauldequin-4')], // x4 deployed_ribauldequin [japanese]
  [5000282, unit('Veteran Demilancer', 'demilancer', 'demilancer-1')], // x4 demilancer [house_of_lancaster]
  [5271010, unit('Mangonel', 'mangonel', 'mangonel-3')], // x4 mangonel [ayyubids]
  [7804932, unit('Mangonel', 'mangonel', 'mangonel-3')], // x4 mangonel [ayyubids]
  [9000103, unit('Khaganate Elite Horse Archer', 'khaganate-horse-archer', 'horse-archer-3')], // x4 turkic_archer_3 [mongols]
  [9000508, unit('Musofadi Warrior', 'musofadi-warrior', 'musofadi-warrior-2')], // x4 musofadi_farimba [malians]
  [9000510, unit('Mansa Musofadi Warrior', 'mansa-musofadi-warrior', 'mansa-musofadi-warrior-2')], // x4 musofadi_mansa [malians]
  [9000526, unit('Horse Archer', 'horse-archer', 'horse-archer-4')], // x4 horsearcher_4 [ottomans]
  [9000640, unit('Great Bombard', 'great-bombard', 'great-bombard-4')], // x4 great_bombard [ottomans]
  [9005329, unit('Militia', 'militia', 'militia-2')], // x4 militia_handcannoneer [rus]
  [2108161, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x3 ram_2 [french]
  [2117336, unit('Counterweight Trebuchet', 'counterweight-trebuchet', 'counterweight-trebuchet-4')], // x3 trebuchet_4 [mongols]
  [2143533, unit('Ribauldequin', 'ribauldequin', 'ribauldequin-4')], // x3 ribauldequin_4 [japanese]
  [2619310, unit('Mangonel', 'mangonel', 'mangonel-3')], // x3 mangonel [malians]
  [3093419, unit('Transport Ship', 'transport-ship', 'transport-ship-2')], // x3 transport [japanese]
  [5000105, unit('Mangonel', 'mangonel', 'mangonel-3')], // x3 mangonel [house_of_lancaster]
  [5174026, unit('Shinobi', 'shinobi', 'shinobi-2')], // x3 shinobi [sengoku_daimyo]
  [7488845, unit('Mangonel', 'mangonel', 'mangonel-3')], // x3 mangonel [japanese]
  [8970697, unit('Mangonel', 'mangonel', 'mangonel-3')], // x3 mangonel [sengoku_daimyo]
  [9000101, unit('Khaganate Elite Horse Archer', 'khaganate-horse-archer', 'horse-archer-2')], // x3 turkic_archer [mongols]
  [9000375, unit('Musofadi Warrior', 'musofadi-warrior', 'musofadi-warrior-2')], // x3 musofadi_farimba [malians]
  [9000975, unit('Mangonel', 'mangonel', 'mangonel-3')], // x3 mangonel [macedonian_dynasty]
  [9000999, unit('Cheirosiphon', 'cheirosiphon', 'cheirosiphon-3')], // x3 chierosiphon [macedonian_dynasty]
  [134689, unit('Mangonel', 'mangonel', 'mangonel-3')], // x2 mangonel [holy_roman_empire]
  [135935, unit('Mangonel', 'mangonel', 'mangonel-3')], // x2 mangonel [delhi_sultanate]
  [193098, unit('Transport Ship', 'transport-ship', 'transport-ship-2')], // x2 transport [rus]
  [199673, unit('Mangonel', 'mangonel', 'mangonel-3')], // x2 mangonel [abbasid_dynasty]
  [1905972, unit('Culverin', 'culverin', 'culverin-4')], // x2 culverin_4 [french]
  [2057897, unit('General Ship', 'general-ship', 'general-ship')], // x2 general_ship [rus]
  [2108164, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x2 ram_2 [mongols]
  [2121981, unit('Shinobi', 'shinobi', 'shinobi-2')], // x2 shinobi [japanese]
  [2132733, unit('Desert Raider', 'desert-raider', 'desert-raider-2')], // x2 desert_rider_2 [ayyubids]
  [2138871, unit('Cannon', 'cannon', 'cannon-4')], // x2 cannon_4 [byzantines]
  [2659647, unit('Transport Ship', 'transport-ship', 'transport-ship-2')], // x2 transport [golden_horde]
  [3977756, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x2 ram_2 [tughlaq_dynasty]
  [4973958, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x2 ram_2 [sengoku_daimyo]
  [5000109, unit('Ribauldequin', 'ribauldequin', 'ribauldequin-4')], // x2 ribauldequin [house_of_lancaster]
  [8999975, unit('Transport Ship', 'transport-ship', 'transport-ship-2')], // x2 transport [knights_templar]
  [9002014, unit('Ozutsu', 'ozutsu', 'ozutsu-3')], // x2 ozutsu [sengoku_daimyo]
  [9003924, unit('Horseman', 'horseman', 'horseman-4')], // x2 horseman_4 [jin_dynasty]
  [9003942, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x2 ram [jin_dynasty]
  [9004011, unit('Battering Ram', 'battering-ram', 'battering-ram-2')], // x2 ram_2 [jin_dynasty]
  [174217, unit('Counterweight Trebuchet', 'counterweight-trebuchet', 'counterweight-trebuchet-3')], // x1 trebuchet_3 [mongols]
  [174222, unit('Counterweight Trebuchet', 'counterweight-trebuchet', 'counterweight-trebuchet-3')], // x1 trebuchet [mongols]
  [2937750, unit('Transport Ship', 'transport-ship', 'transport-ship-2')], // x1 transport [order_of_the_dragon]
  [4112474, unit('Mangonel', 'mangonel', 'mangonel-3')], // x1 mangonel [tughlaq_dynasty]
  [5037365, unit('Mangonel', 'mangonel', 'mangonel-3')], // x1 mangonel [ayyubids]
  [7625342, unit('Mangonel', 'mangonel', 'mangonel-3')], // x1 mangonel [byzantines]

  // Entries without a CDN icon - n/k only; icon resolved from page DOM:
  [5000214, unitNoIcon('Fortress', 'fortress')], // x66 fortress [knights_templar]
  [2059966, unitNoIcon('Cattle', 'cattle')], // x32 cattle [malians]
  [2138205, UMA_BANNERMAN], // x32 bannermen_siege [japanese]
  [2145966, UMA_BANNERMAN], // x31 bannermen_siege [japanese]
  [2138188, KATANA_BANNERMAN], // x25 bannermen_melee [japanese]
  [2143513, KATANA_BANNERMAN], // x17 bannermen_melee [japanese]
  [2145967, UMA_BANNERMAN], // x16 bannermen_siege [japanese]
  [2127468, unitNoIcon('Treasure Caravan', 'treasure-caravan')], // x13 treasure_caravan [japanese]
  [2138204, YUMI_BANNERMAN], // x11 bannermen_ranged [japanese]
  [2123482, unitNoIcon('Trade Cart', 'trade-cart')], // x10 trade_cart [french]
  [2143514, KATANA_BANNERMAN], // x8 bannermen_melee [japanese]
  [2143515, YUMI_BANNERMAN], // x8 bannermen_ranged [japanese]
  [166305, unitNoIcon('Scorpion', 'scorpion')], // x7 scorpion [english]
  [132253, unitNoIcon('Scorpion', 'scorpion')], // x6 scorpion [french]
  [9004030, unitNoIcon('Scorpion', 'scorpion')], // x6 scorpion [jin_dynasty]
  [2034659, unitNoIcon('Scorpion', 'scorpion')], // x5 scorpion [ottomans]
  [9004022, unitNoIcon('Scorpion', 'scorpion')], // x5 scorpion [jin_dynasty]
  [133033, unitNoIcon('Scorpion', 'scorpion')], // x4 scorpion [rus]
  [2143516, YUMI_BANNERMAN], // x4 bannermen_ranged [japanese]
  [6186377, unitNoIcon('Scorpion', 'scorpion')], // x4 scorpion [order_of_the_dragon]
  [8154466, unitNoIcon('Scorpion', 'scorpion')], // x4 scorpion [ayyubids]
  [8998849, unitNoIcon('Scorpion', 'scorpion')], // x4 scorpion [ayyubids]
  [8999981, unitNoIcon('Scorpion', 'scorpion')], // x4 scorpion [knights_templar]
  [3947566, unitNoIcon('Scorpion', 'scorpion')], // x3 scorpion [japanese]
  [129970, unitNoIcon('Scorpion', 'scorpion')], // x2 scorpion [mongols]
  [193924, unitNoIcon('Scorpion', 'scorpion')], // x2 scorpion_3 [french]
  [2138536, unitNoIcon('Treasure Caravan', 'treasure-caravan')], // x2 treasure_caravan [japanese]
  [2392943, unitNoIcon('Scorpion', 'scorpion')], // x2 scorpion [malians]
  [7392340, unitNoIcon('Scorpion', 'scorpion')], // x2 scorpion [byzantines]
  [8126634, unitNoIcon('Scorpion', 'scorpion')], // x2 scorpion [golden_horde]
  [8679792, unitNoIcon('Scorpion', 'scorpion')], // x2 scorpion [zhu_xis_legacy]
  [134705, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [holy_roman_empire]
  [199691, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [abbasid_dynasty]
  [200255, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [abbasid_dynasty]
  [200259, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [abbasid_dynasty]
  [5000114, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [house_of_lancaster]
  [5765782, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [sengoku_daimyo]
  [9003449, unitNoIcon('Trade Cart', 'trade-cart')], // x1 trade_cart [sengoku_daimyo]
  [9004031, unitNoIcon('Scorpion', 'scorpion')], // x1 scorpion [jin_dynasty]
]);
