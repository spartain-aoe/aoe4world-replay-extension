# Villager Efficiency research

This branch originally explored adding Villager Efficiency next to Idle TC time,
but only the Idle TC metric is ready to ship.

## Confirmed data

- The in-game caster overlay exposes separate native model properties for
  `TownCentersIdleTime`, `VillagersEfficiency`, and `AvgBuilderIdleTime`.
- The downloadable `datatype=1` stats file stores `TownCentersIdleTime` in the
  STPD v2034 tail field currently parsed as `townCenterIdleSeconds`.
- On match `234538529`, that field matches the in-game timer column exactly:
  `FerdiFerdi = 1:43`, `spartain = 0:07`, `lwl = 0:12`,
  `trabzonlol = 0:11`.

## Why Villager Efficiency is deferred

The visible Villager Efficiency percentage is not reproduced by combining
`TownCentersIdleTime` with the available villager-alive-seconds field. For
match `234538529`, `1 - TownCentersIdleTime / totalVillagerAliveSeconds`
produces about `99.9%` for most players, while the in-game overlay shows
`99.0%`, `97.4%`, `99.3%`, and `98.8%`.

A command-gap replay parser was prototyped, but it was not reliable enough:
villagers can gather for long stretches without new commands, and the replay
command stream does not directly record simulation-side transitions like
resource depletion, auto-acquire, construction completion, or a villager
becoming idle.

## Future direction

To implement Villager Efficiency accurately, use `STLS.createdEntities` and
`STLS.lostEntities` to identify actual villager entity IDs and lifetimes, then
build a real villager state machine from replay commands plus simulation
inference. Do not treat command gaps alone as idle time.
