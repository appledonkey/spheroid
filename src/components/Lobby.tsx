import { useState } from 'react';
import type { MultiplayerRoom, MultiplayerSettings } from '../types';
import { SettingRow } from './SettingRow';
import { ModeToggle } from './ModeToggle';

export type LobbyProps = {
  room: MultiplayerRoom;
  // Toggle local player's ready state — sends a message to the server.
  onToggleReady: () => void;
  // Host-only: update any subset of room settings. Server validates + clamps,
  // broadcasts the sanitized values back to everyone (including host).
  onUpdateSettings: (patch: Partial<MultiplayerSettings>) => void;
  // Start the game. Only host sees the Start button, server re-validates.
  onStart: () => void;
  // Quit lobby — disconnects the websocket and returns to the menu.
  onLeave: () => void;
};

// Client-side knowledge of the server's ranges. Kept in sync with
// partykit/server.ts's RANGES constant — grep if you change either.
const RANGES = {
  numTasks:    { min: 4,  max: 8,   step: 1 },
  roundTime:   { min: 30, max: 180, step: 15 },
  totalRounds: { min: 1,  max: 5,   step: 1 },
};

export function Lobby({ room, onToggleReady, onUpdateSettings, onStart, onLeave }: LobbyProps) {
  const self = room.players.find(p => p.id === room.selfId);
  const amHost = self?.isHost ?? false;
  const allReady = room.players.length >= 1 && room.players.every(p => p.ready);
  const [copied, setCopied] = useState(false);

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/?room=${room.code}` : '';

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Best-effort — the code is already visible to read off the screen.
    }
  };

  return (
    <div className="bg-emerald-950 flex flex-col items-center justify-center p-4 fixed inset-0 overflow-hidden"
         style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <button
            onClick={onLeave}
            aria-label="Leave room"
            style={{ touchAction: 'manipulation' }}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-slate-900">Room Lobby</h2>
          <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{room.settings.numTasks} cards · {room.settings.totalRounds}r</span>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto" data-allow-scroll>
          {/* Room code — the hero element on this screen. Big, mono, highly
              readable from across a room so someone can read it verbally. */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Room code</div>
            <div className="text-4xl font-bold font-mono tracking-[0.3em] text-slate-900 my-1">{room.code}</div>
            <button
              onClick={onCopyLink}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-full transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>

          {/* Roster */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
              <span>Players ({room.players.length})</span>
              <span>{room.players.filter(p => p.ready).length} ready</span>
            </div>
            <ul className="space-y-1.5">
              {room.players.map(p => (
                <li
                  key={p.id}
                  className={`flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2 border ${
                    p.id === room.selfId ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'
                  }`}>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.ready ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    title={p.ready ? 'Ready' : 'Not ready'} />
                  <span className="font-semibold text-slate-800 text-sm truncate">{p.name}</span>
                  {p.isHost && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Host</span>
                  )}
                  {p.id === room.selfId && (
                    <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">You</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Game settings — host can edit; non-hosts see the values read-only.
              Any change un-readies everyone (server enforces) so the room has
              to re-confirm what they're about to play. */}
          <MpSettingsPanel
            settings={room.settings}
            isHost={amHost}
            onUpdate={onUpdateSettings} />

          {/* Ready toggle (for self) + Start (host only) */}
          <div className="space-y-2">
            <button
              onClick={onToggleReady}
              style={{ touchAction: 'manipulation' }}
              className={`w-full font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98] ${
                self?.ready
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}>
              {self?.ready ? '✓ Ready' : 'Ready up'}
            </button>
            {amHost && (
              <button
                onClick={onStart}
                disabled={!allReady}
                style={{ touchAction: 'manipulation' }}
                className={`w-full font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98] ${
                  allReady
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}>
                {allReady ? 'Start Game' : 'Waiting for everyone to ready up…'}
              </button>
            )}
            {!amHost && (
              <p className="text-xs text-slate-500 text-center">
                Waiting for the host to start the game.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

function MpSettingsPanel({
  settings, isHost, onUpdate,
}: {
  settings: MultiplayerSettings;
  isHost: boolean;
  onUpdate: (patch: Partial<MultiplayerSettings>) => void;
}) {
  // Non-host read-only view is intentionally the same visual layout as the
  // editable one, just with dummy onChange handlers — keeps the lobby feeling
  // identical for everyone and avoids a layout shift when host promotion
  // changes who's editing.
  const handleChange = (patch: Partial<MultiplayerSettings>) => {
    if (!isHost) return;
    onUpdate(patch);
  };
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
        <span>Game settings</span>
        {!isHost && (
          <span className="normal-case tracking-normal text-[10px] text-slate-400">
            Host controls
          </span>
        )}
      </div>
      <div className={isHost ? '' : 'opacity-70 pointer-events-none'}>
        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <SettingRow
            label="Cards"
            value={settings.numTasks}
            min={RANGES.numTasks.min}
            max={RANGES.numTasks.max}
            step={RANGES.numTasks.step}
            onChange={(v) => handleChange({ numTasks: v })} />
          <SettingRow
            label="Rounds"
            value={settings.totalRounds}
            min={RANGES.totalRounds.min}
            max={RANGES.totalRounds.max}
            step={RANGES.totalRounds.step}
            onChange={(v) => handleChange({ totalRounds: v })} />
        </div>
        <div className="mb-1.5">
          <SettingRow
            label="Time"
            suffix="s"
            value={settings.roundTime}
            min={RANGES.roundTime.min}
            max={RANGES.roundTime.max}
            step={RANGES.roundTime.step}
            onChange={(v) => handleChange({ roundTime: v })} />
        </div>
        <ModeToggle
          label="Difficulty"
          value={settings.difficulty}
          onChange={(v) => handleChange({ difficulty: v })}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'normal', label: 'Normal' },
            { value: 'expert', label: 'Expert' },
          ]} />
      </div>
    </div>
  );
}
