import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string;
    detail: string;
    icon: LucideIcon;
}

export default function StatCard({
    title,
    value,
    detail,
    icon,
}: StatCardProps) {
    const Icon = icon;

    return (
        <article className="rounded-2xl border border-[#bfdbfe] bg-white p-5 shadow-sm shadow-[#93c5fd]/20">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-[#1d4d8b]">
                        {title}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-[#0b2d57]">
                        {value}
                    </p>
                    <p className="mt-1 text-sm text-[#326ca6]">{detail}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dbeafe] text-[#1d4d8b]">
                    <Icon className="h-5 w-5" />
                </span>
            </div>
        </article>
    );
}
