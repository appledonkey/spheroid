# Spheroids

A 3D sphere-stacking puzzle game — digital adaptation of a physical board game. Players place colored spheres into an 11-slot hex pyramid to satisfy "condition cards" before a round timer expires. Runs as a single-page web app; mobile-first.

Originally lived as a single-file React prototype (`dimension_digital.jsx`, still at repo root for reference). Refactored into a proper Vite + React + TypeScript app; see below.

## Dev

```bash
npm run dev         # Vite dev server on :5173
npm run build       # tsc -b && vite build
npm run typecheck   # tsc --noEmit
```

## Stack (locked)

- **Vite 5** + **React 18** + **TypeScript 5** (strict, `noUnusedLocals`/`Parameters`)
- **Three.js 0.160** — 3D pyramid scene
- **Tailwind 3.4** — styling, including arbitrary values and container queries
- **localStorage** for all persistence (settings, game snapshot, bonus-token high scores, mute, daily scores)

No external asset files — every sound is Web Audio synthesis, textures are generated in canvases at runtime, SVG icons are inline. Keeps the bundle small and iteration fast.

## File structure

```
src/
├── App.tsx               Orchestrator — game state machine, all side effects, layout
├── main.tsx              Entry point
├── index.css             Tailwind + custom keyframes (deal-in, countdown-pop, score-delta,
│                          time-up, warning, felt texture, container-query ball sizes)
├── types.ts              Color, Task variants, Settings, GameState, RoundResult, Difficulty
│
├── audio/
│   ├── sfx.ts            Web Audio synthesis for every game cue; lazy AudioContext;
│   │                      named functions (place, remove, countdownTick, go, warning,
│   │                      timesUp, tokenEarned, gameOver, newBest); master mute flag
│   └── haptics.ts        Named navigator.vibrate patterns, mirrors sfx; respects mute
│
├── constants/
│   ├── colors.ts         COLORS, COLOR_GRADIENTS, COLOR_DISPLAY_NAME (for UI strings),
│   │                      sphereGradientStyle helper (ceramic look)
│   └── geometry.ts       HCP, NUM_SLOTS (11), POSITIONS_3D, SLOT_LAYER, ADJACENCIES,
│                          SUPPORTS, SUPPORTED_BY (inverse)
│
├── game/
│   ├── rules.ts          CANONICAL rule defs — do NOT reimplement elsewhere.
│   │                      checkPlacementRules, checkRemovalRules, evaluateTask,
│   │                      isTaskEngaged, liveTaskStatus, describeTask, relevantColors
│   ├── tasks.ts          Card generator. CLASSIC_PRESET, MAX_TASKS, INVENTORY_PER_COLOR,
│   │                      HARDER_TYPES, generateTasks (takes difficulty + optional seed
│   │                      for deterministic hands), cardsForRound, makeRng, roundSeed,
│   │                      wouldContradict (detects impossible hands pre-sample)
│   └── scoring.ts        scoreRound, BONUS_TOKEN_TABLE, convertBonusTokens,
│                          TIME_BONUS_SECONDS_PER_POINT, FAILED_TASK_PENALTY
│
├── hooks/
│   ├── useSettings.ts    Persistent settings via localStorage
│   ├── useMute.ts        Audio mute flag, synced with sfx module + localStorage
│   ├── useTabVisibility.ts   Pause timers when tab is hidden
│   └── useViewportLock.ts    Prevent page scroll / rubber-band
│
├── storage/
│   ├── settings.ts       DEFAULT_SETTINGS, SETTINGS_RANGES, load/save
│   ├── gameState.ts      Mid-game snapshot — persists across reloads
│   ├── scores.ts         BestScores {classic, escalation}, recordBestScore
│   └── daily.ts          Daily challenge scores + date→seed hash + todayDateStr
│
├── three/
│   └── Board3D.tsx       3D scene. propsRef pattern keeps RAF loop + event handlers
│                          reading latest props without scene teardown. Exposes
│                          applyZoomRef / resetViewRef via external refs for the
│                          on-canvas zoom/reset buttons (wheel + pinch also wired).
│                          Uses createWoodTexture() for the play-board grain.
│
└── components/
    ├── GameHeader.tsx        Round/score/timer + mute toggle + menu button
    ├── Menu.tsx              Title screen → Mode Chooser / How-to sub-views
    ├── ModeToggle.tsx        Generic 2-3 option toggle (reused for mode, growth, difficulty)
    ├── SettingRow.tsx        Label + -/+ stepper
    ├── Inventory.tsx         Ball racks (3 balls per color, depleted L→R), Finish Round
    ├── TaskCard.tsx          Condition card. 3D flip on tap to show plain-English rule.
    │                          SVG OmniBall + SplitBall (crisp slice/diagonal edges).
    │                          Container-queried content sizes.
    ├── RoundResult.tsx       Round recap + game-over panel with round-by-round grid
    │                          and bonus-token conversion curve
    ├── PauseMenu.tsx         Resume / Restart / How-to / Quit with confirmation steps
    ├── HowToView.tsx         Shared rules panel (pause menu + title menu both use)
    └── TaskDescriptionPopover.tsx   UNUSED — replaced by card flip, kept around
```

## Conventions (preserve intentionally)

- **Rules are canonical in `game/rules.ts`.** `Board3D.tsx`, `scoring.ts`, App.tsx all import from there. Never reimplement placement or adjacency logic elsewhere.
- **Strict TOUCH.** `TOUCH(A, B)` means *every A must touch a B AND every B must touch an A* — this is intentionally demanding, not a typo. Same-color TOUCH/NO_TOUCH are valid (generator emits `c1 === c2` cases).
- **Engagement ≠ completion.** `isTaskEngaged` = "at least one relevant color placed"; `evaluateTask` = "rule satisfied (vacuously or actually)". Current scoring is rulebook-faithful: **every failed task is −2 regardless of engagement**. Engagement only gates the live hint indicator (`liveTaskStatus` returns null when not engaged).
- **propsRef in Board3D.** The scene is built once in a mount-only `useEffect`. Props flow in via `propsRef.current` so the RAF loop and pointer handlers read the latest without rebuilding the scene. Do NOT convert this to effect deps.
- **Ref-bridged imperative controls.** Zoom, reset-view, (future) drag hit-test are exposed from Board3D via external `MutableRefObject`s populated inside the setup `useEffect`. Buttons in the component's JSX call those refs. Avoids re-rendering the 3D scene on every interaction.
- **localStorage, not window.storage.** The original prototype used an artifact-specific `window.storage`; we use `localStorage` everywhere. Keys are namespaced: `spheroids.settings`, `spheroids.gameState`, `spheroids.bestScores`, `spheroids.audio.muted`, `spheroids.daily`.
- **Task card container queries.** `.task-card` has `container-type: size`, and content classes (`.task-sphere`, `.task-num`, etc.) use `cqh` so elements scale with the card's actual rendered height. Keeps cards readable at any grid density.
- **Viewport lock.** `useViewportLock` blocks touchmove on the document. Elements that need to scroll use `data-allow-scroll`; the 3D canvas is exempt (it runs its own pointer handling).
- **Scrollbars globally hidden.** `* { scrollbar-width: none }` etc. in index.css. Scrolling still functional, just no visible track.
- **Color names: internal vs display.** Internal code uses `coral / amber / pine / iris / pearl`; all user-visible strings go through `COLOR_DISPLAY_NAME` which maps to `red / yellow / green / purple / white`.

## Game rules (what the code enforces)

**Board**: 11 slots in a hex pyramid.
- Layer 0 (base, 7 slots): 0 = centre, 1–6 = outer ring
- Layer 1 (mid, 3 slots): 7 rests on {0,1,2}, 8 on {0,3,4}, 9 on {0,5,6}
- Layer 2 (apex, 1 slot): 10 rests on {7,8,9}

**Placement**: layer-0 free; layer-1+ requires all supports filled.
**Removal**: only allowed if nothing is on top of the slot (via `SUPPORTED_BY`).

**Colors**: 5 (coral / amber / pine / iris / pearl). Starting inventory = 3 per color.

**Card types** (all generated by `generateTasks`, all evaluated by `evaluateTask`):
- `EXACT(c, n)` — place exactly n of colour c. n ∈ {1, 2}.
- `TOUCH(a, b)` — strict mutual adjacency (see conventions)
- `NO_TOUCH(a, b)` — no a adjacent to b
- `NOT_ON_TOP(c)` — c stays on base layer
- `NOT_UNDER(c)` — nothing may rest on top of c
- `MORE_THAN(a, b)` — count(a) > count(b)
- `LESS_THAN(a, b)` — count(a) < count(b)
- `SUM(a, b, n)` — count(a) + count(b) === n. n ∈ {2, 3, 4, 5}.

`wouldContradict` blocks numeric conflicts at pool-sample time (e.g. `EXACT(red, 3) + SUM(red, yellow, 2)`).

**Scoring (rulebook-faithful)**:
- +1 per sphere placed
- −2 per condition not met (any unmet task, engaged or not)
- +1 per 10 seconds remaining — only on rounds where all tasks passed
- +1 **bonus token** when all tasks pass AND all 5 colors used; tokens cash in at game end via `BONUS_TOKEN_TABLE = [-6, -3, -1, 0, 1, 3, 6]`. For round counts other than 6, `convertBonusTokens(count, totalRounds)` scales by ratio — break-even at 50% perfect rounds.

**Modes**:
- **Classic** — `CLASSIC_PRESET` = 6 cards, 120s rounds, 6 rounds. Non-customizable.
- **Escalation** — custom. Starting cards (4–8), growth (`every` / `every-other` / `random`), difficulty (`easy` drops math-heavy types, `expert` doubles them), live hints on/off, round time, total rounds.
- **Daily** (in progress) — classic-style preset with a date-seeded hand. One play per day. See WIP below.

## State machine

`menu → dealing → countdown → playing → round_over ⇄ (next) | game_over`

- **dealing** (~1.4–1.8s): task cards animate in staggered. Board dimmed.
- **countdown** (~5.6s): 5 → 4 → 3 → 2 → 1 → GO! Board dimmed. Pauses on pause-menu-open and tab-hidden.
- **playing**: timer ticks. Last 5s trigger warning beeps + haptic. Placements / removals fire sfx + haptics.
- On timer=0: 900ms "Time's up!" overlay → `endRound`.
- **round_over**: recap, "Next Round" / "Back to Menu".
- **game_over**: recap + round-by-round grid + bonus-token conversion + final score. "Play Again" / "Back to Menu". "New best!" badge if current run beat `BestScores[mode]`.

`endRound` appends to `roundHistory`. Pause-menu restart un-bakes the most recent entry and any token.

## Work in progress

Right now we're mid-implementation of a big batch of feel/gameplay upgrades. Status:

**Done this session** (post-audio):
- ✅ `audio/haptics.ts` with varied patterns per event, mirrors sfx mute
- ✅ Floating +N / −N score deltas from the header (`animate-score-delta` keyframe in index.css)
- ✅ Escalation difficulty tiers (Easy / Normal / Expert). `HARDER_TYPES` in tasks.ts drives pool trimming/weighting. `Difficulty` type, settings field, storage validation, Menu toggle, plumbed through `startRound`.
- ✅ Seeded RNG in `tasks.ts` (`makeRng`, `roundSeed`). `generateTasks` now takes an optional `seed: number`. Non-seeded calls still use `Math.random` — all existing call sites unchanged.
- ✅ `storage/daily.ts` with `todayDateStr`, `dateToSeed`, `getDailyScore`, `recordDaily`.

**Not yet wired** (next session):
- ⏳ **Daily challenge UI & flow** — title-screen button, already-played state, `isDaily` flag in App, pass date-derived seed through `startRound`, use `recordDaily` at game end. Probably present as a classic-like preset (6 rounds, ~90s). Score shown on title screen if today already played.
- ⏳ **Drag-and-drop placement** — ball pickup from inventory, HTML ghost following cursor, Board3D exposes a `hitTestRef((x, y) => slotId | null)` that raycasts against visible ghost meshes. On pointerup over a valid slot, reuse the existing `handleSlotClick` placement branch. Threshold-based: click-only still acts as tap-to-select. ~1–2 hr.

**Not started** (from the wider roadmap):
- PWA (manifest + service worker) — ~30 min, big mobile win
- Tutorial / first-run flow
- Keyboard navigation

## Things fixed (so we don't redo them)

- Bonus token curve scales with totalRounds (not just 6-round shape)
- Timer pauses on `visibilitychange` hidden
- Task generator detects numeric contradictions via `wouldContradict`
- Mid-game state persists to localStorage and restores on reload (`storage/gameState.ts`)
- Escalation's `random` growth reseeds per game (Date.now() on start)
- `restartCurrentRound` decrements `bonusTokens` + pops `roundHistory` tail if the round was already scored

## Debug notes

- If the 3D scene looks black or flat, check `clearcoat` / `roughness` — the ceramic look is `roughness: 1.0, clearcoat: 1.0, clearcoatRoughness: 0.28` on `MeshPhysicalMaterial`.
- If SVG balls (OmniBall / SplitBall) share gradient IDs across instances and render wrong, check `useId()` usage — each instance needs unique `-gloss` / `-edge` IDs.
- Deal-in scrollbar flash: if you add translate to the keyframe, the grid overflow-y may flash a scrollbar. Current keyframe is scale+rotate only and easing does NOT overshoot. Keep it that way.
- Mobile hidden scrollbars: enforced globally in index.css via `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`. Don't reintroduce per-component scrollbar-hide utilities.
