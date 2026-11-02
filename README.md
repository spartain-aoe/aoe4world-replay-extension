# AoE4 Replay Launcher

Watch any AoE4 ranked game replay directly from [aoe4world.com](https://aoe4world.com) with one click. Optionally inject custom charts (army composition, resource gathered, combat value, and villager efficiency) and in-game player colors.

![Games list with Watch Replay buttons](assets/screenshot-3.png)

## Features

- **One-click replay launching** from any game on aoe4world.com
- **Save replays** — star games to keep them locally for offline viewing
- **Custom charts** — army composition, resource gathered, army value lead, destroyed value, and villager efficiency timelines on game summary pages (on by default)
- **Combat value stats** — adds K/D Cost beside K/D using authoritative unit costs
- **In-game player colors** — recolors aoe4world's default swatches with actual replay colors (on by default)
- **Patch-aware** — warns when a replay is from a previous patch, shows "Replay Unavailable" for older patches
- **DLC support** — handles new civs and colors automatically
- **Works with Chrome and Edge**

## Setup

### 1. Install the Chrome/Edge extension

**From the Chrome Web Store:** [AoE4 Replay Launcher](https://chromewebstore.google.com/detail/ckkbdeejodfnpehhllhmhhannpgojfec)

Or load manually:
1. Download the latest `chrome-extension-store.zip` from [Releases](https://github.com/spartain-aoe/aoe4world-replay-extension/releases/latest)
2. Extract it
3. Open `chrome://extensions/` (or `edge://extensions/`)
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** → select the extracted folder

### 2. Install the native host (for replay launching)

1. Download `aoe4-replay-launcher.zip` from [Releases](https://github.com/spartain-aoe/aoe4world-replay-extension/releases/latest)
2. Extract it anywhere
3. Run `install.bat`
4. Files are installed to `%LOCALAPPDATA%\AoE4ReplayLauncher`

### 3. Feature settings

Click the extension icon to open settings:

- **Parse additional game data** — master toggle for chart/color features
  - **Inject custom charts** — adds army composition, resource, value, and villager efficiency charts to game pages
  - **Use in-game player colors** — recolors swatches with actual replay colors

Charts and in-game player colors are **on by default**. Open the settings panel to turn any of them off. Replay launching works regardless of these settings.

K/D Cost is exact for 1v1 games when typed destruction events match the native combat counters. A leading `≈` marks games where recorded destruction counts differ and the typed value is proportionally reconciled to those counters. It remains unavailable when a destroyed unit has no authoritative cost.

Army Composition can switch between Count and Value modes. Value keeps the chart resource-weighted while showing every legend metric as `cost (count)` without a resource suffix; zero-cost and unknown-cost units remain visible as `0 (count)` instead of disappearing.

Villager Efficiency compares each player's actual living villagers with uninterrupted production from every observed villager-producing structure. The dashed ideal plateaus at the editable target (120 by default). Cumulative amber Missed Production and red Killed bands stack downward from Ideal. When cumulative debt matches the Ideal–Actual gap, the bands fill it exactly; when debt is larger than the current gap, shading continues below Actual or zero without ever extending above Ideal. Unmatched production opportunities accrue while actual living villagers are below the target, pause at or above it, and resume if villager losses pull actual below target. A loss only reopens accrual; it does not itself count as missed production. The top-right controls can crop the vertical scale to the target or optionally make the Ideal line drop with villager deaths and recover with later ideal production opportunities. The legend acts as a player radio selector so the chart displays one player at a time; hovering another player temporarily previews them. Civilization-specific train times and mechanics include dynamic bonuses such as Chinese Song Dynasty, French age scaling, Viking Falkr's Village Saga, Tughlaq governors, Japanese Town Center Yorishiro, and Jin Dynasty tributary build-limit increases.

## Development

```bash
npm ci                  # install dependencies
npm run build           # build all bundles + pbgid-map
npm run dev             # watch mode (rebuilds on file changes)
npm run typecheck       # tsc --noEmit
npm test                # fixtures + adversarial + build + unit + regression tests
```

### Project structure

```
src/
  content/       # content script modules (TypeScript)
  background/    # service worker + replay parser
  popup/         # popup UI
build/           # esbuild bundler + pbgid-map builder
tests/
  unit/          # unit tests
  regression/    # regression tests (bundle smoke, favorites bugs)
  fixtures/      # HTML page fixtures for DOM tests
    replay/      # .gz replay files for parser tests
  check-*.mjs    # fixture + adversarial parser tests
chrome-extension/  # extension manifest, icons, styles, built outputs (gitignored JS)
native-host/       # replay launcher installer (PowerShell)
```

## Uninstall

1. Run `install.bat uninstall`
2. Remove the extension from `chrome://extensions/`

## Requirements

- Windows
- Age of Empires IV installed via Steam
- PowerShell 5.1+
- Chrome or Edge

## Privacy

No user data is collected. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)
