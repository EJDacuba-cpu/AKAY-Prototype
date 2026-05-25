import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SidebarItem {
    id: string;
    label: string;
    icon: LucideIcon;
}

interface SidebarProps {
    roleLabel: string;
    roleDescription: string;
    items: SidebarItem[];
    activeItem: string;
    isMobileOpen: boolean;
    onItemClick: (label: string) => void;
    onCloseMobile: () => void;
}

export default function Sidebar({
    roleLabel,
    roleDescription,
    items,
    activeItem,
    isMobileOpen,
    onItemClick,
    onCloseMobile,
}: SidebarProps) {
    return (
        <>
            <div
                className={cn(
                    'fixed inset-0 z-30 bg-[#0b2d57]/55 transition-opacity md:hidden',
                    isMobileOpen
                        ? 'opacity-100'
                        : 'pointer-events-none opacity-0',
                )}
                onClick={onCloseMobile}
                aria-hidden="true"
            />

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 w-72 border-r border-[#1d4d8b]/30 bg-[#0b2d57] text-white transition-transform md:translate-x-0',
                    isMobileOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                <div className="flex items-start justify-between border-b border-[#326ca6] px-5 py-5">
                    <div>
                        <p className="text-xs tracking-[0.2em] text-[#bfdbfe] uppercase">
                            AKAY System
                        </p>
                        <h2 className="mt-2 text-lg leading-tight font-semibold">
                            {roleLabel}
                        </h2>
                        <p className="mt-1 text-xs text-[#93c5fd]">
                            {roleDescription}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCloseMobile}
                        className="rounded-lg p-1 text-[#93c5fd] transition hover:bg-[#1d4d8b] hover:text-white md:hidden"
                        aria-label="Close menu"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="space-y-1 p-4">
                    {items.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeItem === item.label;

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onItemClick(item.label)}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
                                    isActive
                                        ? 'bg-[#dbeafe] text-[#0b2d57]'
                                        : 'text-[#dbeafe] hover:bg-[#1d4d8b] hover:text-white',
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="absolute right-4 bottom-4 left-4 rounded-xl border border-[#1d4d8b] bg-[#103a6e] p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-[#dbeafe]">
                        <ShieldCheck className="h-4 w-4" />
                        Demo mode enabled
                    </p>
                    <p className="mt-1 text-xs text-[#bfdbfe]">
                        Data displayed is mock data for capstone presentation.
                    </p>
                </div>
            </aside>
        </>
    );
}
