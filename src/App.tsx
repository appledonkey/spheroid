import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Board, Color, GameState, Inventory as InventoryType,
  RoundResult as RoundResultType, Settings, Task, TaskStatus,
} from './types';
import { NUM_SLOTS, SLOT_LAYER } from './constants/geometry';
import { checkPlacementRules, checkRemovalRules, evaluateTask, liveTaskStatus } from './game/rules';
import { CLASSIC_PRESET, cardsForRound, generateTasks, roundSeed } from './game/tasks';
import { convertBonusTokens, scoreRound } from './game/scoring';
import { useSettings } from './hooks/useSettings';
import { useViewportLock } from './hooks/useViewportLock';
import { useTabVisible } from './hooks/useTabVisibility';
import { useMute } from './hooks/useMute';
import { sfx } from './audio/sfx';
import { haptics } from './audio/haptics';
import { clearGameSnapshot, loadGameSnapshot, saveGameSnapshot } from './storage/gameState';
import { loadBestScores, recordBestScore, type BestScores } from './storage/scores';
import { dateToSeed, getDailyEntry, getDailyScore, recordDaily, todayDateStr } from './storage/daily';
import { buildShareText, shareText } from './game/share';
import { codeToSeed } from './multiplayer/room';
import { useMultiplayerRoom } from './multiplayer/useMultiplayerRoom';
import { Board3D } from './three/Board3D';
import { TaskCard } from './components/TaskCard';
import { Menu } from './components/Menu';
import { Inventory } from './components/Inventory';
import { RoundResult } from './components/RoundResult';
import { GameHeader } from './components/GameHeader';
import { PauseMenu } from './components/PauseMenu';
import { Lobby } from './components/Lobby';
import { MultiplayerResults, MultiplayerWaiting } from './components/MultiplayerResults';
import { Celebration, type CelebrationVariant } from './components/Celebration';

const STARTING_INVENTORY: InventoryType = { coral: 3, amber: 3, pine: 3, iris: 3, pearl: 3 };
const emptyBoard = (): Board => Array(NUM_SLOTS).fill(null);
const freshInventory = (): InventoryType => ({ ...STARTING_INVENTORY });

const PLACEMENT_FX_DURATION_MS = 600;

// Pre-round sequencing. DEAL_STAGGER_MS must match TaskCard.tsx's value and
// DEAL_ANIM_MS must match the CSS animation duration in index.css.
const DEAL_STAGGER_MS = 200;
const DEAL_ANIM_MS = 800;
const COUNTDOWN_START = 5;
const COUNTDOWN_TICK_MS = 1000;
const GO_DURATION_MS = 600;
const TIME_UP_DURATION_MS = 900; // How long "Time's up!" lingers before the recap
const FLOATING_DELTA_MS = 1500;  // Duration of +N / −N float-fade

export default function App() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [round, setRound] = useState(1);
  const [totalScore, setTotalScore] = useState(0);
  const [settings, updateSetting] = useSettings();
  const [timer, setTimer] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [inventory, setInventory] = useState<InventoryType>(freshInventory);
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResultType | null>(null);
  const [lastPlaced, setLastPlaced] = useState<number | null>(null);
  // Transient — set when the user taps a slot that rejected the placement.
  // Drives the red shake/flash in Board3D. Cleared after the animation.
  const [lastInvalid, setLastInvalid] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  // Brief "Time's up!" overlay between timer-hits-0 and the recap showing.
  const [timeUpShowing, setTimeUpShowing] = useState(false);
  // Compact per-round log — shown on the game-over screen as a breakdown
  // grid and used to build the spoiler-free share emoji grid for Daily runs.
  const [roundHistory, setRoundHistory] = useState<Array<{
    total: number;
    bonusTokenEarned: boolean;
    allTasksPassed: boolean;
    taskCount: number;
    passedCount: number;
    spheres: number;
  }>>([]);
  // All-time high scores per mode, persisted to localStorage. Displayed on
  // the title screen and celebrated on the game-over screen.
  const [bestScores, setBestScores] = useState<BestScores>(() => loadBestScores());
  // True when the just-completed game set a new best for its mode. Drives
  // the "New best!" badge on the game-over screen.
  const [newBestSet, setNewBestSet] = useState(false);
  // Floating score deltas that rise from the header when totalScore changes.
  // Each delta carries its own id so multiple can coexist during rapid updates.
  const [floatingDeltas, setFloatingDeltas] = useState<Array<{ id: number; value: number }>>([]);
  // Brief toast after Share button — confirms the clipboard or native share
  // handoff. Auto-clears after 2s; lives here so both game-over and future
  // in-menu share entrypoints can reuse.
  const [shareToast, setShareToast] = useState<string | null>(null);
  // Celebration overlay — incrementing counter fires a new celebration. The
  // variant drives the headline text (BONUS TOKEN! vs WINNER!) and particle
  // palette. Fires when you earn a bonus token, or when you win a MP room.
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  const [celebrationVariant, setCelebrationVariant] = useState<CelebrationVariant>('bonus-token');
  // Rulebook: bonus tokens accumulate across rounds and convert to a final
  // score adjustment at game end (see BONUS_TOKEN_TABLE in scoring.ts).
  const [bonusTokens, setBonusTokens] = useState(0);
  // Refreshed on each new game. Feeds the deterministic-but-per-game PRNG
  // used by escalation's "random" growth, so two games with the same config
  // don't produce identical card-count sequences.
  const [gameSeed, setGameSeed] = useState(() => Date.now());
  // The settings actually driving the current game. Menu.onStart writes this
  // when the game starts (with Classic preset or user-customized Escalation).
  // Separating from persisted `settings` lets Classic be a fixed preset without
  // overwriting the user's Escalation customizations in localStorage.
  const [activeSettings, setActiveSettings] = useState<Settings>(settings);
  // True when the current run is a Daily Challenge — drives the deterministic
  // hand seeding each round and the recordDaily call at game end. Daily uses
  // the Classic preset for its settings; this flag is the extra bit.
  const [isDaily, setIsDaily] = useState(false);
  // Multiplayer is driven by the PartyKit-backed hook. We set `mpSession`
  // (code + name) to trigger a connect; the hook returns the authoritative
  // room state via websocket. `mpRoom` downstream consumers use is the
  // server's view, not local mutable state.
  const [mpSession, setMpSession] = useState<{ code: string; name: string } | null>(null);
  const { room: mpRoom, send: mpSend, error: mpError } = useMultiplayerRoom(
    mpSession?.code ?? null,
    mpSession?.name ?? null,
  );
  // Pulled off the URL once on mount — if present, Menu opens the Join flow
  // with this code prefilled. Consumed after the first render.
  const [initialRoomCode] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const code = new URLSearchParams(window.location.search).get('room');
    if (!code) return undefined;
    const trimmed = code.toUpperCase().trim().slice(0, 4);
    return trimmed.length === 4 ? trimmed : undefined;
  });
  // Track previous score so we can emit floating deltas when it changes.
  const prevScoreRef = useRef(0);

  useViewportLock();
  const tabVisible = useTabVisible();
  const [muted, setMuted] = useMute();

  // Emit a floating delta whenever totalScore moves. Fires on every change,
  // including the "restart round" rewind (prev - roundResult.total) — the
  // negative delta is helpful feedback there too.
  useEffect(() => {
    const delta = totalScore - prevScoreRef.current;
    prevScoreRef.current = totalScore;
    if (delta === 0) return;
    const id = Date.now() + Math.random();
    setFloatingDeltas(prev => [...prev, { id, value: delta }]);
    const t = setTimeout(() => {
      setFloatingDeltas(prev => prev.filter(d => d.id !== id));
    }, FLOATING_DELTA_MS);
    return () => clearTimeout(t);
  }, [totalScore]);

  // --- Mid-game state persistence -----------------------------------------
  // Guards save writes until after the one-shot restore runs, so we don't
  // stomp a real snapshot with an empty initial-state one.
  const restoredRef = useRef(false);

  // One-shot restore on mount. If a saved mid-game snapshot exists, rehydrate
  // every piece of state from it before rendering. If the snapshot was in the
  // 'dealing' animation, jump straight to 'countdown' so we don't replay.
  useEffect(() => {
    if (restoredRef.current) return;
    const snap = loadGameSnapshot();
    restoredRef.current = true;
    if (!snap) return;
    if (snap.gameState === 'menu') { clearGameSnapshot(); return; }
    setActiveSettings(snap.activeSettings);
    setRound(snap.round);
    setTotalScore(snap.totalScore);
    setBonusTokens(snap.bonusTokens);
    setGameSeed(snap.gameSeed);
    setIsDaily(snap.isDaily);
    setTasks(snap.tasks);
    setBoard(snap.board);
    setInventory(snap.inventory);
    setSelectedColor(snap.selectedColor);
    setTimer(snap.timer);
    setCountdown(snap.countdown);
    setRoundResult(snap.roundResult);
    // Dealing is a purely visual animation — no point replaying it.
    setGameState(snap.gameState === 'dealing' ? 'countdown' : snap.gameState);
  }, []);

  // Save a snapshot whenever the game state meaningfully changes. Skipped
  // before restore runs (avoids wiping a real snapshot with default state)
  // and cleared entirely whenever we're back on the menu.
  useEffect(() => {
    if (!restoredRef.current) return;
    if (gameState === 'menu') {
      clearGameSnapshot();
      return;
    }
    saveGameSnapshot({
      gameState, round, totalScore, bonusTokens, gameSeed, isDaily,
      tasks, board, inventory, selectedColor, timer, countdown,
      activeSettings, roundResult,
    });
  }, [
    gameState, round, totalScore, bonusTokens, gameSeed, isDaily,
    tasks, board, inventory, selectedColor, timer, countdown,
    activeSettings, roundResult,
  ]);

  const endRound = useCallback(() => {
    const result = scoreRound(board, tasks);
    setRoundResult(result);
    const nextTotal = totalScore + result.total;
    const nextTokens = bonusTokens + (result.bonusTokenEarned ? 1 : 0);
    setTotalScore(nextTotal);
    if (result.bonusTokenEarned) {
      setBonusTokens(nextTokens);
      sfx.tokenEarned();
      haptics.tokenEarned();
      setCelebrationVariant('bonus-token');
      setCelebrationTrigger(k => k + 1);
    }
    const passedCount = result.tasks.filter(t => t.passed).length;
    const historyEntry = {
      total: result.total,
      bonusTokenEarned: result.bonusTokenEarned,
      allTasksPassed: result.allTasksPassed,
      taskCount: result.tasks.length,
      passedCount,
      spheres: result.spheres,
    };
    setRoundHistory(prev => [...prev, historyEntry]);
    const isGameOver = round >= activeSettings.totalRounds;
    // In multiplayer we leave the per-game state machine entirely at the end
    // of the round — the lobby-flavored "waiting" / "results" screens take
    // over via the gameState==='menu' + mpRoom routing.
    if (mpRoom && isGameOver) {
      setGameState('menu');
    } else {
      setGameState(isGameOver ? 'game_over' : 'round_over');
    }
    if (isGameOver) {
      // Final score = sum of round totals + end-of-game token conversion.
      const finalScore = nextTotal + convertBonusTokens(nextTokens, activeSettings.totalRounds);
      // Daily runs have their own scoreboard — they don't touch the per-mode
      // Classic / Escalation bests so a strong daily doesn't shadow those.
      // Multiplayer runs also skip both — scoring lives on the room roster.
      let isNewBest = false;
      if (mpRoom) {
        // Broadcast the score to the server; it'll flip our player to
        // finished=true and advance the room phase when everyone's done.
        mpSend({ type: 'finish', finalScore });
      } else if (isDaily) {
        // roundHistory state hasn't been committed yet (setState above), so
        // build the final list locally by appending the just-scored entry.
        recordDaily(todayDateStr(), finalScore, [...roundHistory, historyEntry]);
      } else {
        isNewBest = recordBestScore(activeSettings.mode, finalScore).isNewBest;
        setBestScores(loadBestScores());
      }
      setNewBestSet(isNewBest);
      // Delay slightly so the game-over cue doesn't collide with the
      // token-earned chime when the final round also earns a token.
      const delay = result.bonusTokenEarned ? 650 : 0;
      setTimeout(() => {
        if (isNewBest) { sfx.newBest(); haptics.newBest(); }
        else { sfx.gameOver(); haptics.gameOver(); }
      }, delay);
    }
  }, [board, tasks, timer, round, totalScore, bonusTokens, activeSettings.totalRounds, activeSettings.mode, isDaily, mpRoom, roundHistory]);

  // Mirror of endRound for the timer effect — keeps effect deps minimal so
  // per-placement board changes don't reset the setTimeout.
  const endRoundRef = useRef(endRound);
  endRoundRef.current = endRound;

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (menuOpen) return;  // Pause while the in-game menu is open
    if (!tabVisible) return; // Pause while the tab is hidden (switched away / locked screen)
    if (timer === 0) {
      // Flash "Time's up!" over the board, then transition to the recap.
      setTimeUpShowing(true);
      sfx.timesUp();
      haptics.timesUp();
      const t = setTimeout(() => {
        setTimeUpShowing(false);
        endRoundRef.current();
      }, TIME_UP_DURATION_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, timer, menuOpen, tabVisible]);

  // Warning cues in the last 5 seconds — rising-pitch beep each tick +
  // haptic buzz (triple-pulse pattern) each time. Keeps time pressure felt
  // even without looking at the clock.
  useEffect(() => {
    if (gameState !== 'playing') return;
    if (timer < 1 || timer > 5) return;
    sfx.warning(timer);
    haptics.warning();
  }, [gameState, timer]);

  // Dealing → countdown. Fire-and-forget — cards animate via CSS, we just
  // wait for the last card's stagger + anim to finish, then advance.
  useEffect(() => {
    if (gameState !== 'dealing') return;
    const dealTotalMs = Math.max(0, tasks.length - 1) * DEAL_STAGGER_MS + DEAL_ANIM_MS;
    const t = setTimeout(() => setGameState('countdown'), dealTotalMs);
    return () => clearTimeout(t);
  }, [gameState, tasks.length]);

  // Countdown ticks 5 → 4 → 3 → 2 → 1 → 0 (shown as "GO!") → playing.
  // Pauses on both the in-game menu and when the tab is hidden. Each tick
  // plays a short pitched beep; the "GO!" frame plays the triad stab.
  useEffect(() => {
    if (gameState !== 'countdown') return;
    if (menuOpen) return;
    if (!tabVisible) return;
    if (countdown === 0) {
      sfx.go();
      haptics.go();
      const t = setTimeout(() => setGameState('playing'), GO_DURATION_MS);
      return () => clearTimeout(t);
    }
    sfx.countdownTick(countdown);
    haptics.countdownTick();
    const t = setTimeout(() => setCountdown(c => c - 1), COUNTDOWN_TICK_MS);
    return () => clearTimeout(t);
  }, [gameState, countdown, menuOpen, tabVisible]);

  // `overrideSettings` lets the caller start a round with settings that haven't
  // yet been flushed through React (e.g., right after `updateSetting('mode', …)`
  // from the Menu). Without it, React state batching means `settings` in this
  // closure is still the old value and `cardsForRound` would use the old mode.
  const startRound = (
    forRound = round,
    overrideSettings?: Settings,
    overrideSeed?: number,
    overrideIsDaily?: boolean,
  ) => {
    const s = overrideSettings ?? activeSettings;
    const seed = overrideSeed ?? gameSeed;
    const daily = overrideIsDaily ?? isDaily;
    // Classic → always normal. Escalation + Multiplayer → honor the selected
    // difficulty (MP stores its difficulty in escalationDifficulty's slot so
    // we don't need another Settings field). Daily is classic, so also normal.
    const honorsDifficulty = s.mode === 'escalation' || (mpRoom !== null && !daily);
    const difficulty = honorsDifficulty ? s.escalationDifficulty : 'normal';
    // Daily challenges want reproducible hands — everyone sees the same cards
    // for a given date. Non-daily runs keep using Math.random so repeats vary.
    const handSeed = daily ? roundSeed(seed, forRound) : undefined;
    setTasks(generateTasks(cardsForRound(s, forRound, seed), difficulty, handSeed));
    setBoard(emptyBoard());
    setInventory(freshInventory());
    setSelectedColor(null);
    setTimer(s.roundTime);
    setRoundResult(null);
    setLastPlaced(null);
    setCountdown(COUNTDOWN_START);
    // Enter the pre-round deal animation; effect below will advance to
    // countdown after the cards finish landing, and then to playing.
    setGameState('dealing');
  };

  const triggerPlaceFx = (id: number) => {
    setLastPlaced(id);
    haptics.place();
    setTimeout(() => setLastPlaced(null), PLACEMENT_FX_DURATION_MS);
  };

  const flagInvalid = useCallback((id: number) => {
    setLastInvalid(id);
    sfx.invalid();
    haptics.invalid();
    // Must clear to null so a second tap on the same slot retriggers the
    // animation (otherwise the prop won't change and the scene won't see it).
    setTimeout(() => setLastInvalid(prev => (prev === id ? null : prev)), 380);
  }, []);

  const handleSlotClick = useCallback((id: number) => {
    if (gameState !== 'playing') return;
    const current = board[id];
    if (current !== null) {
      if (checkRemovalRules(id, board)) {
        const nb = [...board]; nb[id] = null;
        setBoard(nb);
        setInventory(p => ({ ...p, [current]: p[current] + 1 }));
        haptics.remove();
        sfx.remove();
      } else {
        flagInvalid(id);
      }
    } else if (selectedColor && inventory[selectedColor] > 0) {
      if (checkPlacementRules(id, board)) {
        const nb = [...board]; nb[id] = selectedColor;
        setBoard(nb);
        setInventory(p => ({ ...p, [selectedColor]: p[selectedColor] - 1 }));
        triggerPlaceFx(id);
        // Base/mid/apex layer drives the pitch — the pyramid audibly climbs.
        sfx.place(SLOT_LAYER[id] as 0 | 1 | 2);
      } else {
        flagInvalid(id);
      }
    } else {
      // Tapped an empty slot with no color selected (or out of inventory).
      // Still worth the nudge — it tells the user "pick a color first".
      flagInvalid(id);
    }
  }, [gameState, board, selectedColor, inventory, flagInvalid]);

  const nextRound = () => { const next = round + 1; setRound(next); startRound(next); };
  const restartGame = () => {
    const newSeed = Date.now();
    setTotalScore(0);
    setBonusTokens(0);
    setRoundHistory([]);
    setNewBestSet(false);
    setGameSeed(newSeed);
    setRound(1);
    startRound(1, undefined, newSeed);
  };
  const backToMenu = () => {
    setRound(1);
    setTotalScore(0);
    setBonusTokens(0);
    setRoundHistory([]);
    setNewBestSet(false);
    setIsDaily(false);
    setMpSession(null);
    setMenuOpen(false);
    setGameState('menu');
    // Strip ?room= off the URL so "Back to Menu" doesn't re-snap to Join view
    // on the next mount / reload.
    if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // ignore — query param stripping is a polish, not load-bearing
      }
    }
  };

  const resumeFromMenu = () => setMenuOpen(false);

  // Surface server errors (room full, game already started) as the same
  // toast we use for share confirmations. Bounce the session back to the menu
  // so the user can try a different code.
  useEffect(() => {
    if (!mpError) return;
    setShareToast(mpError);
    setMpSession(null);
    const t = setTimeout(() => setShareToast(null), 2500);
    return () => clearTimeout(t);
  }, [mpError]);

  // Fire the celebration overlay when MP results land and the local player
  // is the top scorer. Guarded by a ref so we only fire once per results
  // transition (not every time state updates while on the results screen).
  const mpWinnerFiredRef = useRef(false);
  useEffect(() => {
    if (!mpRoom) { mpWinnerFiredRef.current = false; return; }
    if (mpRoom.phase !== 'results') {
      mpWinnerFiredRef.current = false;
      return;
    }
    if (mpWinnerFiredRef.current) return;
    // Sort descending by score; if the top player is us, celebrate.
    const ranked = [...mpRoom.players].sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
    if (ranked.length > 0 && ranked[0].id === mpRoom.selfId) {
      mpWinnerFiredRef.current = true;
      // Delay slightly so the celebration lands after the reveal animation
      // starts — feels like the payoff of the building tension.
      setTimeout(() => {
        setCelebrationVariant('mp-winner');
        setCelebrationTrigger(k => k + 1);
      }, 350);
    }
  }, [mpRoom]);

  // When the server broadcasts that the game started, kick off our local game
  // loop with the room's seed + card count. The hook returns the latest room
  // on every state broadcast; we only want to START the local game once per
  // transition into 'playing', not on every subsequent broadcast.
  const mpStartedRef = useRef(false);
  useEffect(() => {
    if (!mpRoom) { mpStartedRef.current = false; return; }
    if (mpRoom.phase === 'playing' && !mpStartedRef.current) {
      mpStartedRef.current = true;
      // Server-authoritative settings — everyone in the room agrees on these
      // via the state broadcast. We use 'classic' mode because multiplayer
      // doesn't currently do escalation growth; difficulty is pulled through
      // via the escalationDifficulty slot since that's what generateTasks reads.
      const effective: Settings = {
        ...settings,
        mode: 'classic',
        numTasks: mpRoom.settings.numTasks,
        roundTime: mpRoom.settings.roundTime,
        totalRounds: mpRoom.settings.totalRounds,
        escalationDifficulty: mpRoom.settings.difficulty,
      };
      const seed = codeToSeed(mpRoom.code);
      setActiveSettings(effective);
      setTotalScore(0);
      setBonusTokens(0);
      setRoundHistory([]);
      setNewBestSet(false);
      setIsDaily(false);
      setGameSeed(seed);
      setRound(1);
      startRound(1, effective, seed, true);
    }
    if (mpRoom.phase === 'lobby') {
      // Reset the "we started the local game" guard so a subsequent playAgain
      // starts fresh.
      mpStartedRef.current = false;
    }
  }, [mpRoom, settings]);

  // --- Multiplayer handlers (Phase 2: server-backed via PartyKit) ---------

  const handleCreateRoom = (name: string, code: string) => {
    // No special server call to "create" — connecting to a room with no
    // prior occupants creates it implicitly. The first joiner becomes host.
    setMpSession({ code, name });
  };

  const handleJoinRoom = (name: string, code: string) => {
    setMpSession({ code, name });
  };

  const handleToggleReady = () => {
    mpSend({ type: 'toggleReady' });
  };

  const handleUpdateSettings = (patch: Partial<import('./types').MultiplayerSettings>) => {
    mpSend({ type: 'updateSettings', settings: patch });
  };

  const handleMpStart = () => {
    // Server validates everyone-is-ready and host-only; we just send the intent.
    mpSend({ type: 'start' });
  };

  const handleMpLeave = () => {
    setMpSession(null); // tears down the websocket via the hook's effect cleanup
    backToMenu();
  };

  const handleMpPlayAgain = () => {
    mpSend({ type: 'playAgain' });
    setGameState('menu');  // Lobby lives outside the game state machine
  };

  const handleShareDaily = useCallback(async () => {
    const finalScore = totalScore + convertBonusTokens(bonusTokens, activeSettings.totalRounds);
    const text = buildShareText(todayDateStr(), finalScore, roundHistory);
    const result = await shareText(text);
    if (result === 'copied') setShareToast('Copied to clipboard');
    else if (result === 'shared') setShareToast('Shared');
    else setShareToast('Share failed');
    setTimeout(() => setShareToast(null), 2000);
  }, [totalScore, bonusTokens, activeSettings.totalRounds, roundHistory]);

  const restartCurrentRound = () => {
    setMenuOpen(false);
    // If this round was already scored (user opened the pause menu from
    // round_over/game_over), un-bake its total AND any bonus token it earned
    // before replaying, so nothing double-counts when the replay ends. Also
    // drop the last entry from the round-history log.
    if (roundResult) {
      setTotalScore(prev => prev - roundResult.total);
      if (roundResult.bonusTokenEarned) setBonusTokens(prev => Math.max(0, prev - 1));
      setRoundHistory(prev => prev.slice(0, -1));
    }
    startRound(round);
  };

  if (gameState === 'menu') {
    // Multiplayer lobby / waiting / results screens live outside the regular
    // game state machine — they're shown when the player's in a room and not
    // currently playing a round.
    // Connecting — session asked for, room snapshot not yet received. Brief,
    // but worth a placeholder so the user doesn't see a flash of the Menu.
    if (mpSession && !mpRoom) {
      return (
        <div className="bg-emerald-950 flex flex-col items-center justify-center p-4 fixed inset-0 overflow-hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 p-6 text-center">
            <div className="w-10 h-10 mx-auto mb-3 relative">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-200" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
            </div>
            <p className="text-sm text-slate-700 font-semibold">Connecting to room {mpSession.code}…</p>
          </div>
        </div>
      );
    }
    if (mpRoom && mpRoom.phase === 'lobby') {
      return (
        <Lobby
          room={mpRoom}
          onToggleReady={handleToggleReady}
          onUpdateSettings={handleUpdateSettings}
          onStart={handleMpStart}
          onLeave={handleMpLeave} />
      );
    }
    if (mpRoom && mpRoom.phase === 'waiting') {
      return <MultiplayerWaiting players={mpRoom.players} selfId={mpRoom.selfId} />;
    }
    if (mpRoom && mpRoom.phase === 'results') {
      return (
        <MultiplayerResults
          players={mpRoom.players}
          selfId={mpRoom.selfId}
          onPlayAgain={handleMpPlayAgain}
          onBackToMenu={handleMpLeave} />
      );
    }

    const today = todayDateStr();
    const dailyScore = getDailyScore(today);
    const onShareDailyFromMenu = async () => {
      const entry = getDailyEntry(today);
      if (!entry) return;
      const text = buildShareText(today, entry.score, entry.rounds);
      const result = await shareText(text);
      if (result === 'copied') setShareToast('Copied to clipboard');
      else if (result === 'shared') setShareToast('Shared');
      else setShareToast('Share failed');
      setTimeout(() => setShareToast(null), 2000);
    };
    return (
      <>
      <Menu
        settings={settings}
        onUpdateSetting={updateSetting}
        dailyScore={dailyScore}
        onShareDaily={onShareDailyFromMenu}
        initialJoinCode={initialRoomCode}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onStart={(mode) => {
          updateSetting('mode', mode);
          // Classic ignores user settings and uses the baked-in preset.
          // Escalation uses whatever the user customized in the mode chooser.
          const effective: Settings = mode === 'classic'
            ? { ...settings, ...CLASSIC_PRESET, mode: 'classic' }
            : { ...settings, mode: 'escalation' };
          const newSeed = Date.now();
          setActiveSettings(effective);
          setTotalScore(0);
          setBonusTokens(0);
          setRoundHistory([]);
          setNewBestSet(false);
          setIsDaily(false);
          setGameSeed(newSeed);
          setRound(1);
          startRound(1, effective, newSeed, false);
        }}
        onStartDaily={() => {
          // Daily is a 1-round bite-sized challenge. Card count is randomized
          // 4-8 per day (seeded by the date, so everyone sees the same count).
          // Time stays at Classic's 120s so high-card days aren't unfair.
          const seed = dateToSeed(today);
          const dailyCards = 4 + (seed % 5);
          const effective: Settings = {
            ...settings,
            ...CLASSIC_PRESET,
            mode: 'classic',
            numTasks: dailyCards,
            totalRounds: 1,
          };
          setActiveSettings(effective);
          setTotalScore(0);
          setBonusTokens(0);
          setRoundHistory([]);
          setNewBestSet(false);
          setIsDaily(true);
          setGameSeed(seed);
          setRound(1);
          startRound(1, effective, seed, true);
        }} />
      {shareToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center z-50">
          <div className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg border border-slate-700">
            {shareToast}
          </div>
        </div>
      )}
      <Celebration trigger={celebrationTrigger} variant={celebrationVariant} />
      </>
    );
  }

  return (
    <div className="bg-emerald-950 flex flex-col max-w-6xl mx-auto fixed inset-0 overflow-hidden shadow-2xl shadow-black/50"
         style={{ overscrollBehavior: 'none' }}>
      <div className="relative">
        <GameHeader
          round={round}
          totalRounds={activeSettings.totalRounds}
          totalScore={totalScore}
          timer={timer}
          isPlaying={gameState === 'playing'}
          muted={muted}
          onToggleMute={() => setMuted(!muted)}
          onMenuClick={() => setMenuOpen(true)}
        />
        {/* Floating +N / −N rising out of the Score area. Positioned over
            roughly where the "Score" label sits (left edge of header). */}
        <div className="pointer-events-none absolute left-12 lg:left-20 top-6 lg:top-10 z-30">
          {floatingDeltas.map(d => (
            <span
              key={d.id}
              className={`animate-score-delta absolute top-0 left-0 text-xl lg:text-2xl font-bold tabular-nums drop-shadow-sm ${
                d.value > 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}>
              {d.value > 0 ? '+' : '−'}{Math.abs(d.value)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-4 p-2 lg:p-3 lg:pt-1 min-h-0">
        {/* Conditions */}
        <div className="lg:w-1/4 flex flex-col gap-1 lg:gap-2 order-1 min-h-0">
          <div className="hidden lg:flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-emerald-100 uppercase tracking-wider">Conditions</h2>
            {gameState === 'playing' && tasks.length > 0 && (
              <span className="text-xs font-semibold text-emerald-200 tabular-nums">
                {tasks.filter(t => evaluateTask(t, board)).length} / {tasks.length} ✓
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5 lg:gap-2 max-h-[34vh] lg:max-h-none lg:flex-1 lg:min-h-0 lg:[grid-auto-rows:minmax(120px,240px)] overflow-x-hidden overflow-y-auto" data-allow-scroll>
            {tasks.map((task, i) => {
              // Escalation can suppress live hints — pass/fail only reveal on
              // the round summary. Classic (always) and Escalation with hints on
              // show live ✓ / ! indicators as placements happen.
              const hintsOn = activeSettings.mode === 'classic' || activeSettings.escalationHints;
              // Rulebook scoring: every failed task is a −2, whether or not
              // its colors were touched. Recap reflects that — red for any
              // failure, green for pass.
              const status: TaskStatus =
                roundResult ? (roundResult.tasks[i].passed ? 'pass' : 'fail')
                : gameState === 'playing' && hintsOn ? liveTaskStatus(task, board)
                : null;
              // Key by round so cards remount each round — this replays the
              // deal-in animation. dealIndex triggers the staggered entrance.
              return (
                <TaskCard
                  key={`${round}-${i}`}
                  task={task}
                  status={status}
                  dealIndex={i} />
              );
            })}
          </div>
        </div>

        {/* Board */}
        <div className={`felt-texture lg:w-2/4 rounded-2xl border border-emerald-900 overflow-hidden order-2 flex-1 min-h-0 relative shadow-xl shadow-black/40 ${
          gameState === 'playing' && timer > 0 && timer <= 5 ? 'animate-play-area-warning' : ''
        }`}>
          <Board3D
            board={board}
            selectedColor={selectedColor}
            gameState={gameState}
            onSlotClick={handleSlotClick}
            lastPlaced={lastPlaced}
            lastInvalid={lastInvalid}
          />
          {gameState === 'playing' && !selectedColor && board.every(s => s === null) && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/85 text-white text-xs font-semibold px-3 py-1.5 rounded-full pointer-events-none">
              Pick a color, then tap a slot
            </div>
          )}
          <div className="absolute top-2 right-2 bg-white/80 backdrop-blur text-[10px] text-slate-600 font-semibold px-2 py-1 rounded-full pointer-events-none">
            Drag to rotate
          </div>

          {(gameState === 'dealing' || gameState === 'countdown') && (
            <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-20">
              {gameState === 'countdown' && (
                <div
                  key={countdown}
                  className="text-7xl lg:text-9xl font-bold text-outlined animate-countdown-pop tracking-tight"
                  style={{ WebkitTextStroke: '3px #000' }}>
                  {countdown === 0 ? 'GO!' : countdown}
                </div>
              )}
            </div>
          )}

          {timeUpShowing && (
            <div className="absolute inset-0 bg-rose-900/55 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-20">
              <div
                className="text-5xl lg:text-8xl font-bold text-outlined animate-countdown-pop tracking-tight text-center leading-none"
                style={{ WebkitTextStroke: '3px #000' }}>
                Time&apos;s up!
              </div>
            </div>
          )}
        </div>

        {/* Side panel — mirrors the left panel's "label → card grid" layout:
            label is a Conditions-style emerald-100 h2 sitting above a white
            container that flexes to fill the remaining column height. */}
        <div className="lg:w-1/4 flex flex-col gap-1 lg:gap-2 order-3 min-h-0" data-allow-scroll style={{ overflowY: 'auto' }}>
          {(gameState === 'dealing' || gameState === 'countdown' || gameState === 'playing') && (
            <>
              <h2 className="hidden lg:block text-sm font-bold text-emerald-100 uppercase tracking-wider">Inventory</h2>
              <Inventory
                inventory={inventory}
                selectedColor={selectedColor}
                onSelect={setSelectedColor}
                onFinishRound={endRound}
                canFinish={gameState === 'playing'}
              />
            </>
          )}

          {(gameState === 'round_over' || gameState === 'game_over') && roundResult && (
            <>
              <h2 className="hidden lg:block text-sm font-bold text-emerald-100 uppercase tracking-wider">
                {gameState === 'game_over' ? 'Final' : 'Results'}
              </h2>
              <RoundResult
                roundResult={roundResult}
                totalRounds={activeSettings.totalRounds}
                totalScore={totalScore}
                bonusTokens={bonusTokens}
                roundHistory={roundHistory}
                isNewBest={newBestSet}
                modeBest={bestScores[activeSettings.mode]}
                isGameOver={gameState === 'game_over'}
                isDaily={isDaily}
                onShare={handleShareDaily}
                onNext={nextRound}
                onRestart={restartGame}
                onBackToMenu={backToMenu}
              />
            </>
          )}
        </div>
      </div>

      {menuOpen && (
        <PauseMenu
          onResume={resumeFromMenu}
          onRestartRound={restartCurrentRound}
          onQuitToMenu={backToMenu}
        />
      )}

      {shareToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center z-50">
          <div className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg border border-slate-700">
            {shareToast}
          </div>
        </div>
      )}

      <Celebration trigger={celebrationTrigger} variant={celebrationVariant} />
    </div>
  );
}
