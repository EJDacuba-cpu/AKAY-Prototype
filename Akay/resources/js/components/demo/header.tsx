import { ArrowRightLeft, Menu } from 'lucide-react';

interface HeaderProps {
    roleLabel: string;
    activeItem: string;
    onOpenSidebar: () => void;
    onSwitchRole: () => void;
}

const todayDateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
}).format(new Date());

export default function Header({
    roleLabel,
    activeItem,
    onOpenSidebar,
    onSwitchRole,
}: HeaderProps) {
    return (
        <header className="sticky top-0 z-20 border-b border-[#bfdbfe] bg-white/95 px-4 py-3 backdrop-blur-sm md:px-8">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onOpenSidebar}
                        className="rounded-lg border border-[#bfdbfe] bg-[#eef6ff] p-2 text-[#1d4d8b] transition hover:bg-[#dbeafe] md:hidden"
                        aria-label="Open sidebar"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div>
                        <p className="text-sm font-semibold text-[#0b2d57]">
                            {roleLabel} Dashboard
                        </p>
                        <p className="text-xs text-[#326ca6]">
                            {activeItem} • {todayDateLabel}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onSwitchRole}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#bfdbfe] bg-[#eef6ff] px-3 py-2 text-sm font-medium text-[#0b2d57] transition hover:bg-[#dbeafe]"
                >
                    <ArrowRightLeft className="h-4 w-4" />
                    Switch Role
                </button>
            </div>
        </header>
    );
}
