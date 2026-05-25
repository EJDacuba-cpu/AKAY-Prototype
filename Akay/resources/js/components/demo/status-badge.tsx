import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

const toneClasses: Record<StatusTone, string> = {
    success: 'border-[#86efac] bg-[#dcfce7] text-[#166534]',
    warning: 'border-[#fcd34d] bg-[#fef3c7] text-[#92400e]',
    info: 'border-[#93c5fd] bg-[#dbeafe] text-[#1e40af]',
    danger: 'border-[#fca5a5] bg-[#fee2e2] text-[#991b1b]',
    neutral: 'border-[#bae6fd] bg-[#e0f2fe] text-[#075985]',
};

interface StatusBadgeProps {
    label: string;
    tone?: StatusTone;
    className?: string;
}

export default function StatusBadge({
    label,
    tone = 'neutral',
    className,
}: StatusBadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
                toneClasses[tone],
                className,
            )}
        >
            {label}
        </span>
    );
}
