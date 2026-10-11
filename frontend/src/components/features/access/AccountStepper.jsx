import { Check, Lock } from "lucide-react";

/**
 * Account setup progress. Finished steps can be revisited; steps beyond `reached` stay locked until Continue.
 * Wide screens get a vertical list on the left; phones get a compact "Step n of m" bar.
 */
export default function AccountStepper({ steps, current, reached, onSelect }) {
  return (
    <nav aria-label="Account setup progress" className="md:sticky md:top-4 md:self-start">
      <div className="md:hidden">
        <p className="text-xs font-semibold text-slate-500">Step {current + 1} of {steps.length} · <span className="text-slate-800">{steps[current]}</span></p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {steps.map((label, i) => <span key={label} className={`h-1 flex-1 rounded-full ${i <= current ? "bg-red-700" : "bg-slate-200"}`} />)}
        </div>
      </div>
      <ol className="hidden md:block">
        {steps.map((label, i) => {
          const done = i < current;
          const locked = i > reached;
          return (
            <li key={label} className="relative pb-6 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden="true" className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px ${done ? "bg-red-300" : "bg-slate-200"}`} />}
              <button
                type="button"
                disabled={locked || i === current}
                aria-current={i === current ? "step" : undefined}
                onClick={() => onSelect(i)}
                className="group flex w-full items-center gap-3 text-left disabled:cursor-default"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                  i === current ? "border-red-700 bg-red-700 text-white" : done || i <= reached ? "border-red-300 bg-red-50 text-red-700 group-hover:bg-red-100" : "border-slate-200 bg-white text-slate-400"
                }`}>
                  {done ? <Check size={14} aria-hidden="true" /> : locked ? <Lock size={12} aria-hidden="true" /> : i + 1}
                </span>
                <span className={`text-sm font-semibold ${i === current ? "text-slate-900" : locked ? "text-slate-400" : "text-slate-600 group-hover:text-slate-900"}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
