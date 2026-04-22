import { useState } from 'react';
import { HowToView } from './HowToView';

export type PauseMenuProps = {
  onResume: () => void;
  onRestartRound: () => void;
  onQuitToMenu: () => void;
};

type View = 'root' | 'how-to' | 'confirm-restart' | 'confirm-quit';

export function PauseMenu({ onResume, onRestartRound, onQuitToMenu }: PauseMenuProps) {
  const [view, setView] = useState<View>('root');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
         style={{ touchAction: 'none' }}
         role="dialog"
         aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
        {view === 'root' && (
          <RootView
            onResume={onResume}
            onShowHowTo={() => setView('how-to')}
            onRestart={() => setView('confirm-restart')}
            onQuit={() => setView('confirm-quit')} />
        )}
        {view === 'how-to' && <HowToView onBack={() => setView('root')} />}
        {view === 'confirm-restart' && (
          <ConfirmView
            title="Restart this round?"
            body="The board and timer reset. Score from previous rounds is kept."
            confirmLabel="Restart"
            onConfirm={onRestartRound}
            onCancel={() => setView('root')} />
        )}
        {view === 'confirm-quit' && (
          <ConfirmView
            title="Quit to main menu?"
            body="Your current game will be discarded."
            confirmLabel="Quit"
            danger
            onConfirm={onQuitToMenu}
            onCancel={() => setView('root')} />
        )}
      </div>
    </div>
  );
}

type RootViewProps = {
  onResume: () => void;
  onShowHowTo: () => void;
  onRestart: () => void;
  onQuit: () => void;
};

function RootView({ onResume, onShowHowTo, onRestart, onQuit }: RootViewProps) {
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-2xl font-bold text-slate-900 mb-4 text-center">Paused</h2>
      <button
        onClick={onResume}
        style={{ touchAction: 'manipulation' }}
        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
        Resume
      </button>
      <button
        onClick={onRestart}
        style={{ touchAction: 'manipulation' }}
        className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
        Restart Round
      </button>
      <button
        onClick={onShowHowTo}
        style={{ touchAction: 'manipulation' }}
        className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
        How to Play
      </button>
      <button
        onClick={onQuit}
        style={{ touchAction: 'manipulation' }}
        className="w-full bg-white hover:bg-rose-50 text-rose-600 font-semibold py-2.5 px-4 rounded-xl border border-rose-200 transition-colors active:scale-[0.98]">
        Quit to Menu
      </button>
    </div>
  );
}

type ConfirmViewProps = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmView({ title, body, confirmLabel, danger, onConfirm, onCancel }: ConfirmViewProps) {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-600 text-sm leading-relaxed">{body}</p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          style={{ touchAction: 'manipulation' }}
          className="flex-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          style={{ touchAction: 'manipulation' }}
          className={`flex-1 text-white font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98] ${
            danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'
          }`}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
