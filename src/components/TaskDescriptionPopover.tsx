import { describeTask } from '../game/rules';
import { TaskCard } from './TaskCard';
import type { Task } from '../types';

export type TaskDescriptionPopoverProps = {
  task: Task;
  onClose: () => void;
};

// Shown when a task card is tapped. Re-uses TaskCard for the visual, so the
// popover always matches the card the player tapped.
export function TaskDescriptionPopover({ task, onClose }: TaskDescriptionPopoverProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      style={{ touchAction: 'none' }}
      role="dialog"
      aria-modal="true">
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-28 h-28 mx-auto">
          <TaskCard task={task} status={null} />
        </div>
        <p className="text-slate-700 text-center text-sm lg:text-base leading-relaxed">
          {describeTask(task)}
        </p>
        <button
          onClick={onClose}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98]">
          Got it
        </button>
      </div>
    </div>
  );
}
