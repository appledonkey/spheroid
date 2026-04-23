import { useEffect, useState } from 'react';
import type { EscalationGrowth, GameMode, Settings } from '../types';
import type { UpdateSetting } from '../hooks/useSettings';
import { SETTINGS_RANGES } from '../storage/settings';
import { CLASSIC_PRESET, MAX_TASKS } from '../game/tasks';
import { ModeToggle } from './ModeToggle';
import { SettingRow } from './SettingRow';
import { HowToView } from './HowToView';
import { loadPlayerName, savePlayerName } from '../storage/player';
import { generateRoomCode, looksLikeValidCode } from '../multiplayer/room';

type View = 'title' | 'mode-chooser' | 'how-to' | 'daily-done'
  | 'mp-chooser' | 'mp-create' | 'mp-join';

export type MenuProps = {
  settings: Settings;
  onUpdateSetting: UpdateSetting;
  onStart: (mode: GameMode) => void;
  onStartDaily: () => void;
  // null = not played today; number = today's score. Drives the daily button's
  // label and whether tapping it starts a run or shows the "come back tomorrow" view.
  dailyScore: number | null;
  // Called when the user shares from DailyDoneView — App knows the full
  // round history for building the spoiler-free grid.
  onShareDaily: () => void;
  // Multiplayer entry points. `code` is 4-letter uppercase; `name` is the
  // display name the local player picked. App handles room creation / join.
  onCreateRoom: (name: string, code: string) => void;
  onJoinRoom: (name: string, code: string) => void;
  // If arrived via ?room=CODE, Menu auto-opens mp-join with this prefilled.
  initialJoinCode?: string;
};

export function Menu({
  settings, onUpdateSetting, onStart, onStartDaily, dailyScore, onShareDaily,
  onCreateRoom, onJoinRoom, initialJoinCode,
}: MenuProps) {
  const [view, setView] = useState<View>(initialJoinCode ? 'mp-join' : 'title');

  // If the URL room code arrives after mount (won't in practice, but defensive
  // against future routing changes), still jump to the join view.
  useEffect(() => {
    if (initialJoinCode) setView('mp-join');
  }, [initialJoinCode]);

  return (
    <div className="bg-emerald-950 flex flex-col items-center justify-center p-4 fixed inset-0 overflow-hidden"
         style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      {view === 'title' && (
        <TitleView
          dailyScore={dailyScore}
          onPlay={() => setView('mode-chooser')}
          onDaily={() => {
            if (dailyScore !== null) setView('daily-done');
            else onStartDaily();
          }}
          onPlayWithFriends={() => setView('mp-chooser')}
          onOpenHowTo={() => setView('how-to')} />
      )}
      {view === 'mode-chooser' && (
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
          <ModeChooserView
            settings={settings}
            onUpdateSetting={onUpdateSetting}
            onStart={onStart}
            onBack={() => setView('title')} />
        </div>
      )}
      {view === 'how-to' && (
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
          <HowToView onBack={() => setView('title')} />
        </div>
      )}
      {view === 'daily-done' && (
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
          <DailyDoneView
            score={dailyScore ?? 0}
            onShare={onShareDaily}
            onBack={() => setView('title')} />
        </div>
      )}
      {view === 'mp-chooser' && (
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
          <MpChooserView
            onCreate={() => setView('mp-create')}
            onJoin={() => setView('mp-join')}
            onBack={() => setView('title')} />
        </div>
      )}
      {view === 'mp-create' && (
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
          <MpCreateView
            onCreate={(name) => onCreateRoom(name, generateRoomCode())}
            onBack={() => setView('mp-chooser')} />
        </div>
      )}
      {view === 'mp-join' && (
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
          <MpJoinView
            initialCode={initialJoinCode ?? ''}
            onJoin={onJoinRoom}
            onBack={() => setView(initialJoinCode ? 'title' : 'mp-chooser')} />
        </div>
      )}
    </div>
  );
}

type TitleViewProps = {
  dailyScore: number | null;
  onPlay: () => void;
  onDaily: () => void;
  onPlayWithFriends: () => void;
  onOpenHowTo: () => void;
};

function TitleView({ dailyScore, onPlay, onDaily, onPlayWithFriends, onOpenHowTo }: TitleViewProps) {
  const playedToday = dailyScore !== null;
  return (
    <>
      <h1 className="text-5xl font-bold text-outlined mb-6 tracking-tight">Spheroids</h1>

      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 space-y-3">
        <button
          onClick={onPlay}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
          Play
        </button>
        <button
          onClick={onDaily}
          style={{ touchAction: 'manipulation' }}
          className={`w-full font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 ${
            playedToday
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}>
          <DailyIcon />
          {playedToday ? (
            <span className="flex items-center gap-2">
              Daily Challenge
              <span className="text-xs font-semibold bg-white/70 text-emerald-900 px-2 py-0.5 rounded-full tabular-nums">Today: {dailyScore}</span>
            </span>
          ) : (
            <>Daily Challenge</>
          )}
        </button>
        <button
          onClick={onPlayWithFriends}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2">
          <FriendsIcon />
          Play with Friends
        </button>
        <button
          onClick={onOpenHowTo}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
          How to Play
        </button>
      </div>
    </>
  );
}

function FriendsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function DailyDoneView({ score, onShare, onBack }: { score: number; onShare: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col max-h-[92vh]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ touchAction: 'manipulation' }}
          className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-slate-900">Daily Challenge</h2>
      </div>
      <div className="p-6 space-y-4 text-center">
        <div className="inline-flex items-center gap-2 text-emerald-700 font-semibold text-sm uppercase tracking-wider">
          <DailyIcon /> Today&apos;s result
        </div>
        <div className="bg-slate-900 text-white rounded-2xl py-6 px-4">
          <div className="text-xs uppercase tracking-wider text-slate-300 font-bold">Final score</div>
          <div className="text-6xl font-bold tabular-nums mt-1">{score}</div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          You&apos;ve played today&apos;s challenge. Come back tomorrow for a fresh hand.
        </p>
        <button
          onClick={onShare}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg transition-colors active:scale-[0.98] flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share result
        </button>
        <button
          onClick={onBack}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-lg border border-slate-300 transition-colors active:scale-[0.98]">
          Back
        </button>
      </div>
    </div>
  );
}

function DailyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

type ModeChooserViewProps = {
  settings: Settings;
  onUpdateSetting: UpdateSetting;
  onStart: (mode: GameMode) => void;
  onBack: () => void;
};

// "Play > choose mode > game starts" — user picks a mode here and the game
// kicks off immediately. Mode-specific knobs live inside each mode's card;
// shared knobs (round time, total rounds) are below for either mode.
function ModeChooserView({ settings, onUpdateSetting, onStart, onBack }: ModeChooserViewProps) {
  return (
    <div className="flex flex-col max-h-[92vh]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ touchAction: 'manipulation' }}
          className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-slate-900">Choose a Mode</h2>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto" data-allow-scroll>
        {/* Classic — baked-in preset. Stacked layout with a full-width Start
            button to match Escalation's visual weight — we want both modes to
            feel equally inviting, not one as a "secondary" option. */}
        <section className="border-2 border-slate-200 rounded-xl p-2.5 space-y-2">
          <div>
            <div className="font-bold text-slate-900 text-sm">Classic</div>
            <div className="text-[11px] text-slate-500 leading-tight">
              {CLASSIC_PRESET.numTasks} cards · {formatRoundTime(CLASSIC_PRESET.roundTime)} · {CLASSIC_PRESET.totalRounds} rounds · live hints on
            </div>
          </div>
          <button
            onClick={() => onStart('classic')}
            style={{ touchAction: 'manipulation' }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-lg transition-colors active:scale-[0.98] text-sm">
            Start Classic
          </button>
        </section>

        {/* Escalation — fully customizable. Dropped the description/hint lines
            and put Round time / Total rounds side-by-side so the whole block
            fits without scrolling. */}
        <section className="border-2 border-slate-200 rounded-xl p-2.5 space-y-1.5">
          <div className="font-bold text-slate-900 text-sm">Escalation</div>
          <SettingRow
            label="Starting cards"
            value={settings.escalationStart}
            min={SETTINGS_RANGES.escalationStart.min}
            max={SETTINGS_RANGES.escalationStart.max}
            step={SETTINGS_RANGES.escalationStart.step}
            onChange={(v) => onUpdateSetting('escalationStart', v)} />
          <ModeToggle
            label="Growth"
            value={settings.escalationGrowth}
            onChange={(v) => onUpdateSetting('escalationGrowth', v)}
            options={[
              { value: 'every', label: 'Every' },
              { value: 'every-other', label: 'Every 2' },
              { value: 'random', label: 'Random' },
            ]} />
          <ModeToggle
            label="Difficulty"
            value={settings.escalationDifficulty}
            onChange={(v) => onUpdateSetting('escalationDifficulty', v)}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'normal', label: 'Normal' },
              { value: 'expert', label: 'Expert' },
            ]} />
          <div className="grid grid-cols-2 gap-1.5">
            <SettingRow
              label="Time"
              value={settings.roundTime} suffix="s"
              min={SETTINGS_RANGES.roundTime.min}
              max={SETTINGS_RANGES.roundTime.max}
              step={SETTINGS_RANGES.roundTime.step}
              onChange={(v) => onUpdateSetting('roundTime', v)} />
            <SettingRow
              label="Rounds"
              value={settings.totalRounds}
              min={SETTINGS_RANGES.totalRounds.min}
              max={SETTINGS_RANGES.totalRounds.max}
              step={SETTINGS_RANGES.totalRounds.step}
              onChange={(v) => onUpdateSetting('totalRounds', v)} />
          </div>
          <ToggleRow
            label="Live hints"
            value={settings.escalationHints}
            onChange={(v) => onUpdateSetting('escalationHints', v)} />
          <p className="text-[10px] text-slate-500 px-1 leading-tight">
            {escalationHint(settings.escalationStart, settings.escalationGrowth)}
          </p>
          <button
            onClick={() => onStart('escalation')}
            style={{ touchAction: 'manipulation' }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-lg transition-colors active:scale-[0.98] text-sm">
            Start Escalation
          </button>
        </section>
      </div>
    </div>
  );
}

type ToggleRowProps = {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
};

function ToggleRow({ label, sublabel, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1 gap-2">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-700">{label}</div>
        {sublabel && <div className="text-[10px] text-slate-500 leading-tight">{sublabel}</div>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{ touchAction: 'manipulation' }}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// "120" → "2-minute", "45" → "45-second"
function formatRoundTime(s: number): string {
  if (s >= 60 && s % 60 === 0) return `${s / 60}-minute`;
  return `${s}-second`;
}

function escalationHint(start: number, growth: EscalationGrowth): string {
  const cap = MAX_TASKS;
  if (growth === 'every') {
    const r1 = start;
    const r2 = Math.min(cap, start + 1);
    const r3 = Math.min(cap, start + 2);
    return `R1: ${r1}, R2: ${r2}, R3+: ${r3}${r3 < cap ? ` (cap ${cap})` : ''}`;
  }
  if (growth === 'every-other') {
    const a = start;
    const b = Math.min(cap, start + 1);
    const c = Math.min(cap, start + 2);
    return `R1–R2: ${a}, R3–R4: ${b}, R5+: ${c} (cap ${cap})`;
  }
  return `Starts at ${start}, randomly grows each round (cap ${cap})`;
}

// ---------- Multiplayer views ----------

function MpChooserHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
      <button
        onClick={onBack}
        aria-label="Back"
        style={{ touchAction: 'manipulation' }}
        className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
    </div>
  );
}

function MpChooserView({ onCreate, onJoin, onBack }: { onCreate: () => void; onJoin: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col">
      <MpChooserHeader title="Play with Friends" onBack={onBack} />
      <div className="p-4 space-y-2.5">
        <button
          onClick={onCreate}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
          Create Room
        </button>
        <button
          onClick={onJoin}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
          Join with Code
        </button>
        <p className="text-xs text-slate-500 px-1 leading-relaxed pt-1">
          Create a room to get a 4-letter code you can send to friends. Everyone plays the same hand at the same time, and the winner is revealed at the end.
        </p>
      </div>
    </div>
  );
}

function MpNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Your name</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={16}
        placeholder="e.g. James"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
    </div>
  );
}

function MpCreateView({ onCreate, onBack }: { onCreate: (name: string) => void; onBack: () => void }) {
  const [name, setName] = useState(() => loadPlayerName());
  const ready = name.trim().length > 0;
  return (
    <div className="flex flex-col">
      <MpChooserHeader title="Create Room" onBack={onBack} />
      <div className="p-4 space-y-3">
        <MpNameInput value={name} onChange={setName} />
        <button
          onClick={() => { if (ready) { savePlayerName(name.trim()); onCreate(name.trim()); } }}
          disabled={!ready}
          style={{ touchAction: 'manipulation' }}
          className={`w-full font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98] ${
            ready
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}>
          Create Room
        </button>
      </div>
    </div>
  );
}

function MpJoinView({
  initialCode, onJoin, onBack,
}: {
  initialCode: string;
  onJoin: (name: string, code: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(() => loadPlayerName());
  const [code, setCode] = useState(initialCode.toUpperCase());
  const codeValid = looksLikeValidCode(code);
  const ready = name.trim().length > 0 && codeValid;
  return (
    <div className="flex flex-col">
      <MpChooserHeader title="Join Room" onBack={onBack} />
      <div className="p-4 space-y-3">
        <MpNameInput value={name} onChange={setName} />
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Room code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="ABCD"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 font-mono tracking-[0.3em] text-center text-2xl uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
        </div>
        <button
          onClick={() => { if (ready) { savePlayerName(name.trim()); onJoin(name.trim(), code); } }}
          disabled={!ready}
          style={{ touchAction: 'manipulation' }}
          className={`w-full font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98] ${
            ready
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}>
          Join Room
        </button>
      </div>
    </div>
  );
}
