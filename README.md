# VELMORA — Isles of the Amber Sea

[![make.fun · the-poster-for-a-place-that-i-2-20261121-0539](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/FarizalMYaqub/velmora-poster/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/FarizalMYaqub/velmora-poster/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)

A program that draws a travel poster for a place that does not exist:
VELMORA, the Isles of the Amber Sea — floating islands above a golden
tide, an airship crossing a ringed planet's dusk, and a sun that never
quite sets.

## Run it

```sh
node main.ts
# writes /output/entry.png (1024x1024 PNG, under 1 MiB)
```

`main.ts` (Node 22, standard library only) renders the poster with a
hand-rolled rasterizer and PNG encoder — no dependencies, no network.
The output is deterministic: the same pixels on every run.
