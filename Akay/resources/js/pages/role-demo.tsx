import { Head } from '@inertiajs/react';
import {
    BarChart3,
    Bell,
    CalendarDays,
    CheckCircle,
    CirclePlus,
    Clock,
    FileText,
    HeartPulse,
    LogOut,
    Package,
    QrCode,
    Search,
    SlidersHorizontal,
    Stethoscope,
    UserCog,
    UserPlus,
    Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

type RoleId = 'bhc' | 'rhu' | 'mho';

type NavItem = {
    label: string;
    icon: LucideIcon;
};

type RoleConfig = {
    label: string;
    description: string;
    nav: NavItem[];
};

type MetricCard = {
    title: string;
    value: string;
    helper: string;
    icon: LucideIcon;
    tone: 'success' | 'muted' | 'primary';
};

type ReferralStatus =
    | 'Pending'
    | 'Received'
    | 'Completed'
    | 'For Follow-up'
    | 'No-Show';

type ReferralRow = {
    trackingId: string;
    patient: string;
    ageSex: string;
    category: string;
    status: ReferralStatus;
    updated: string;
};

const DEMO_CREDENTIALS: Record<string, { password: string; role: RoleId }> = {
    'bhc@akay.test': { password: 'password', role: 'bhc' },
    'rhu@akay.test': { password: 'password', role: 'rhu' },
    'mho@akay.test': { password: 'password', role: 'mho' },
};

const roleConfigs: Record<RoleId, RoleConfig> = {
    bhc: {
        label: 'BHC / BHW',
        description: 'Barangay Health Center',
        nav: [
            { label: 'Dashboard', icon: BarChart3 },
            { label: 'Patient Module', icon: Users },
            { label: 'Referrals', icon: FileText },
            { label: 'RHU Doctor Schedule', icon: CalendarDays },
            { label: 'Reports', icon: BarChart3 },
        ],
    },
    rhu: {
        label: 'RHU Staff',
        description: 'Rural Health Unit',
        nav: [
            { label: 'Dashboard', icon: BarChart3 },
            { label: 'Incoming Referrals', icon: FileText },
            { label: 'QR / Tracking Search', icon: QrCode },
            { label: 'Patient Module', icon: Users },
            { label: 'Walk-in Patients', icon: UserPlus },
            { label: 'RHU Processing', icon: Stethoscope },
            { label: 'Doctor Schedule', icon: CalendarDays },
            { label: 'Inventory', icon: Package },
            { label: 'Reports', icon: BarChart3 },
        ],
    },
    mho: {
        label: 'MHO / Admin',
        description: 'System Administrator',
        nav: [
            { label: 'Dashboard', icon: BarChart3 },
            { label: 'Account Management', icon: UserCog },
            { label: 'Audit Logs', icon: FileText },
            { label: 'Overall Reports', icon: BarChart3 },
            { label: 'Users', icon: Users },
        ],
    },
};

const bhcMetrics: MetricCard[] = [
    {
        title: 'Completed Referrals',
        value: '10',
        helper: 'Successful referrals',
        icon: CheckCircle,
        tone: 'success',
    },
    {
        title: 'Pending Referrals',
        value: '12',
        helper: 'Awaiting RHU check-in',
        icon: Clock,
        tone: 'muted',
    },
    {
        title: 'RHU Patient Volume',
        value: 'Normal',
        helper: 'Standard waiting time · Updated: 5m ago',
        icon: HeartPulse,
        tone: 'success',
    },
];

const bhcReferrals: ReferralRow[] = [
    {
        trackingId: 'AKY-2026-001',
        patient: 'Juan Reyes',
        ageSex: '31/M',
        category: 'B1',
        status: 'Pending',
        updated: '10 mins ago',
    },
    {
        trackingId: 'AKY-2026-002',
        patient: 'Maria Rosa',
        ageSex: '31/F',
        category: 'C2',
        status: 'Received',
        updated: '1 hour ago',
    },
    {
        trackingId: 'AKY-2026-003',
        patient: 'John Cruz',
        ageSex: '45/M',
        category: 'A1',
        status: 'Completed',
        updated: 'Yesterday',
    },
    {
        trackingId: 'AKY-2026-004',
        patient: 'David Perez',
        ageSex: '44/M',
        category: 'A2',
        status: 'Completed',
        updated: 'Yesterday',
    },
    {
        trackingId: 'AKY-2026-005',
        patient: 'Antonio Santos',
        ageSex: '29/M',
        category: 'B1',
        status: 'Completed',
        updated: '2 days ago',
    },
];

const patientRows = [
    [
        'Maria Dela Cruz',
        '28 / F',
        'Pregnant Women',
        'For Follow-up',
        'May 20, 2026',
    ],
    ['Juan Santos', '54 / M', 'Hypertension', 'Active', 'May 22, 2026'],
    ['Ana Reyes', '5 / F', 'Immunization', 'Completed', 'Done'],
    ['Carlos Mendoza', '45 / M', 'Injury Concern', 'Referred', 'Waiting RHU'],
];

const doctorSchedule = [
    [
        'Dr. Roldan',
        'General Consultation',
        'Mon-Wed · 8:00 AM - 12:00 PM',
        'Available',
    ],
    [
        'RHU Midwife',
        'Maternal Care',
        'Tue-Thu · 9:00 AM - 3:00 PM',
        'Available',
    ],
    ['RHU Nurse', 'Immunization', 'Friday · 8:00 AM - 11:00 AM', 'Limited'],
];

const reportCards = [
    ['Monthly Referrals', '27'],
    ['For Follow-up', '7'],
    ['No-show', '3'],
    ['Completed', '42'],
];

export default function RoleDemo() {
    const [role, setRole] = useState<RoleId | null>(null);
    const [activeItem, setActiveItem] = useState('Dashboard');

    useEffect(() => {
        const savedRole = localStorage.getItem(
            'akay_demo_role',
        ) as RoleId | null;

        if (savedRole === 'bhc' || savedRole === 'rhu' || savedRole === 'mho') {
            setRole(savedRole);
        }
    }, []);

    function handleLogin(selectedRole: RoleId) {
        localStorage.setItem('akay_demo_role', selectedRole);
        setRole(selectedRole);
        setActiveItem('Dashboard');
    }

    function handleLogout() {
        localStorage.removeItem('akay_demo_role');
        setRole(null);
        setActiveItem('Dashboard');
    }

    if (!role) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    const config = roleConfigs[role];

    return (
        <>
            <Head title={`AKAY ${config.label}`} />

            <div className="h-screen overflow-hidden bg-[#F5F7FB] text-[#0B2E59]">
                <TopBar />

                <div className="flex h-[calc(100vh-36px)] overflow-hidden">
                    <Sidebar
                        config={config}
                        activeItem={activeItem}
                        onSelect={setActiveItem}
                        onLogout={handleLogout}
                    />

                    <main className="flex-1 overflow-y-auto px-9 py-7">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-bold text-[#0B2E59]">
                                    {config.label} Dashboard
                                </p>
                                <p className="text-[11px] text-slate-500">
                                    {config.description}
                                </p>
                            </div>

                            <span className="rounded-full border border-[#BFD2E8] bg-white px-4 py-2 text-[11px] font-bold text-[#0B2E59]">
                                Demo Mode
                            </span>
                        </div>

                        {role === 'bhc' ? (
                            <BHCPage
                                activeItem={activeItem}
                                setActiveItem={setActiveItem}
                            />
                        ) : (
                            <GenericRolePage role={role} title={activeItem} />
                        )}
                    </main>
                </div>
            </div>
        </>
    );
}

function LoginScreen({ onLogin }: { onLogin: (role: RoleId) => void }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    function submit(e: FormEvent) {
        e.preventDefault();

        const account = DEMO_CREDENTIALS[email.trim().toLowerCase()];

        if (!account || account.password !== password) {
            setError('Invalid demo credentials.');
            return;
        }

        setError('');
        onLogin(account.role);
    }

    return (
        <>
            <Head title="AKAY Login" />

            <main className="flex min-h-screen items-center justify-center bg-[#F5F7FB] px-4">
                <form
                    onSubmit={submit}
                    className="w-full max-w-[350px] bg-white px-8 py-9 shadow-sm"
                >
                    <div className="mb-6 text-center">
                        <div className="mx-auto mb-3 flex items-center justify-center gap-2">
                            <div className="text-[15px] font-extrabold tracking-tight text-[#0B2E59]">
                                AK
                            </div>
                            <div className="text-left">
                                <p className="text-[10px] font-bold tracking-[0.22em] text-[#0B2E59]">
                                    AKAY
                                </p>
                                <p className="text-[7px] tracking-[0.1em] text-slate-500 uppercase">
                                    Health Care Center
                                </p>
                            </div>
                        </div>

                        <h1 className="text-lg font-bold text-[#0B2E59]">
                            Welcome to AKAY
                        </h1>
                    </div>

                    <label className="mb-1 block text-[11px] font-medium text-slate-700">
                        Email
                    </label>
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        type="email"
                        className="mb-3 h-9 w-full border border-slate-300 px-3 text-xs outline-none focus:border-[#0B2E59]"
                    />

                    <div className="mb-1 flex items-center justify-between">
                        <label className="block text-[11px] font-medium text-slate-700">
                            Password
                        </label>
                        <button
                            type="button"
                            className="text-[10px] font-semibold text-[#0B2E59]"
                        >
                            Forgot Password?
                        </button>
                    </div>

                    <div className="relative mb-4">
                        <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            type={showPassword ? 'text' : 'password'}
                            className="h-9 w-full border border-slate-300 px-3 pr-12 text-xs outline-none focus:border-[#0B2E59]"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-slate-500"
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>

                    {error && (
                        <div className="mb-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="h-10 w-full bg-[#0B2E59] text-xs font-bold text-white transition hover:bg-[#061B35]"
                    >
                        Login to System
                    </button>

                    <p className="mt-6 text-center text-[10px] text-slate-500">
                        Authorized personnel only
                    </p>

                    <div className="mt-6 border-t border-slate-100 pt-4 text-[10px] leading-5 text-slate-500">
                        <p className="font-bold text-[#0B2E59]">
                            Demo accounts
                        </p>
                        <p>BHC: bhc@akay.test / password</p>
                        <p>RHU: rhu@akay.test / password</p>
                        <p>MHO: mho@akay.test / password</p>
                    </div>
                </form>
            </main>
        </>
    );
}

function TopBar() {
    return (
        <header className="flex h-9 items-center justify-end bg-[#0B2E59] px-6 text-white">
            <Bell className="h-4 w-4" />
        </header>
    );
}

function Sidebar({
    config,
    activeItem,
    onSelect,
    onLogout,
}: {
    config: RoleConfig;
    activeItem: string;
    onSelect: (item: string) => void;
    onLogout: () => void;
}) {
    return (
        <aside className="flex h-full w-[185px] shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="shrink-0 border-b border-slate-200 px-5 py-5">
                <div className="flex items-center gap-2">
                    <div className="text-[15px] font-extrabold text-[#0B2E59]">
                        AK
                    </div>
                    <div>
                        <p className="text-[10px] font-bold tracking-[0.16em] text-[#0B2E59]">
                            AKAY
                        </p>
                        <p className="text-[7px] text-slate-500 uppercase">
                            Pitpitan Health Center
                        </p>
                    </div>
                </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto py-3">
                {config.nav.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                        activeItem === item.label ||
                        (activeItem === 'Create Referral' &&
                            item.label === 'Referrals');

                    return (
                        <button
                            key={item.label}
                            onClick={() => onSelect(item.label)}
                            className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold transition ${
                                isActive
                                    ? 'bg-[#0B2E59] text-white'
                                    : 'text-[#0B2E59] hover:bg-[#EAF3FB]'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {item.label}
                        </button>
                    );
                })}
            </nav>

            <div className="shrink-0 border-t border-slate-100 px-5 py-5">
                <p className="text-[11px] font-bold text-[#0B2E59]">
                    Lorna Reyes
                </p>
                <p className="text-[8px] text-slate-500 uppercase">
                    {config.description}
                </p>

                <button
                    onClick={onLogout}
                    className="mt-4 flex items-center gap-2 text-[11px] font-bold text-red-600"
                >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                </button>
            </div>
        </aside>
    );
}

function BHCPage({
    activeItem,
    setActiveItem,
}: {
    activeItem: string;
    setActiveItem: (item: string) => void;
}) {
    if (activeItem === 'Dashboard')
        return <BHCDashboard setActiveItem={setActiveItem} />;
    if (activeItem === 'Patient Module') return <PatientModule />;

    if (activeItem === 'Referrals')
        return <ReferralList setActiveItem={setActiveItem} />;
    if (activeItem === 'Create Referral')
        return <CreateReferral setActiveItem={setActiveItem} />;
    if (activeItem === 'RHU Doctor Schedule') return <RHUDoctorSchedule />;
    if (activeItem === 'Reports') return <Reports />;

    return <BHCDashboard setActiveItem={setActiveItem} />;
}

function BHCDashboard({
    setActiveItem,
}: {
    setActiveItem: (item: string) => void;
}) {
    return (
        <section>
            <h1 className="mb-7 text-4xl font-bold tracking-tight text-[#0B2E59]">
                Dashboard
            </h1>

            <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.1fr]">
                {bhcMetrics.map((metric) => (
                    <DashboardMetric key={metric.title} metric={metric} />
                ))}
            </div>

            <div className="mt-7 grid gap-6 xl:grid-cols-[1.8fr_0.9fr]">
                <RecentReferrals />
                <QuickActions setActiveItem={setActiveItem} />
            </div>
        </section>
    );
}

function DashboardMetric({ metric }: { metric: MetricCard }) {
    const Icon = metric.icon;

    const iconClass = {
        success: 'bg-green-100 text-green-600',
        muted: 'bg-slate-100 text-slate-500',
        primary: 'bg-[#EAF3FB] text-[#0B2E59]',
    }[metric.tone];

    return (
        <div className="min-h-[150px] rounded-lg bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between">
                <p className="text-[11px] font-bold tracking-[0.08em] text-slate-600 uppercase">
                    {metric.title}
                </p>
                <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${iconClass}`}
                >
                    <Icon className="h-3.5 w-3.5" />
                </span>
            </div>

            <p className="mt-9 text-3xl font-bold text-[#0B2E59]">
                {metric.value}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">{metric.helper}</p>
        </div>
    );
}

function RecentReferrals() {
    return (
        <div className="overflow-hidden rounded-lg bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="flex h-11 items-center justify-between bg-[#0B2E59] px-5 text-white">
                <h2 className="text-xs font-bold">Recent Referrals</h2>
                <button className="text-[10px] font-bold">View All</button>
            </div>

            <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-slate-100 bg-white text-[10px] tracking-wide text-slate-500 uppercase">
                        <th className="px-5 py-3 font-bold">Patient Name</th>
                        <th className="px-5 py-3 font-bold">Age/Sex</th>
                        <th className="px-5 py-3 font-bold">Category</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                        <th className="px-5 py-3 font-bold">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {bhcReferrals.slice(0, 3).map((row) => (
                        <tr
                            key={row.trackingId}
                            className="border-b border-slate-100 last:border-0"
                        >
                            <td className="px-5 py-4 text-[12px] font-medium text-[#0B2E59]">
                                {row.patient}
                            </td>
                            <td className="px-5 py-4 text-[11px] text-slate-500">
                                {row.ageSex}
                            </td>
                            <td className="px-5 py-4 text-[11px] font-semibold text-[#0B2E59]">
                                {row.category}
                            </td>
                            <td className="px-5 py-4">
                                <StatusPill status={row.status} />
                            </td>
                            <td className="px-5 py-4">
                                <button className="text-[11px] font-semibold text-[#8BA0B7] hover:text-[#0B2E59]">
                                    View Details
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function QuickActions({
    setActiveItem,
}: {
    setActiveItem: (item: string) => void;
}) {
    const actions = [
        {
            title: 'New Referral',
            subtitle: 'Send a patient to RHU',
            icon: CirclePlus,
            color: 'bg-[#0B2E59] text-white',
            onClick: () => setActiveItem('Create Referral'),
        },
        {
            title: 'Search records',
            subtitle: 'Find records and history',
            icon: Search,
            color: 'bg-slate-100 text-slate-500',
            onClick: () => setActiveItem('Referrals'),
        },
    ];

    return (
        <div>
            <h2 className="mb-3 text-xl font-bold text-[#0B2E59]">
                Quick Actions
            </h2>

            <div className="space-y-3">
                {actions.map((action) => {
                    const Icon = action.icon;

                    return (
                        <button
                            key={action.title}
                            onClick={action.onClick}
                            className="flex w-full items-center gap-4 rounded-lg bg-white px-5 py-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                            <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full ${action.color}`}
                            >
                                <Icon className="h-4 w-4" />
                            </span>

                            <span>
                                <span className="block text-[12px] font-bold text-[#0B2E59]">
                                    {action.title}
                                </span>
                                <span className="block text-[10px] text-slate-500">
                                    {action.subtitle}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ReferralList({
    setActiveItem,
}: {
    setActiveItem: (item: string) => void;
}) {
    return (
        <section>
            <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-[#0B2E59]">
                        Referral List
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        Managing active patient transfers.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                            placeholder="Search patient or referral..."
                            className="h-9 w-72 rounded-md border border-slate-200 bg-white pr-3 pl-9 text-[11px] outline-none focus:border-[#0B2E59]"
                        />
                    </div>

                    <button className="flex h-9 items-center gap-2 rounded-md bg-white px-4 text-[11px] font-bold text-slate-500 shadow-sm">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filter
                    </button>

                    <button
                        onClick={() => setActiveItem('Create Referral')}
                        className="flex h-9 items-center gap-2 rounded-md bg-[#0B2E59] px-4 text-[11px] font-bold text-white shadow-sm"
                    >
                        <CirclePlus className="h-3.5 w-3.5" />
                        New Referral
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="flex h-10 items-center bg-[#0B2E59] px-5 text-[11px] font-bold text-white">
                    Showing {bhcReferrals.length} records
                </div>

                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] tracking-wide text-slate-400 uppercase">
                            <th className="px-6 py-4 font-bold">Tracking ID</th>
                            <th className="px-6 py-4 font-bold">Patient</th>
                            <th className="px-6 py-4 font-bold">Age/Sex</th>
                            <th className="px-6 py-4 font-bold">Category</th>
                            <th className="px-6 py-4 text-right font-bold">
                                Status
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {bhcReferrals.map((row) => (
                            <tr
                                key={row.trackingId}
                                className="border-b border-slate-100 last:border-0"
                            >
                                <td className="px-6 py-5 text-[12px] font-bold text-[#0B2E59]">
                                    {row.trackingId}
                                </td>
                                <td className="px-6 py-5 text-[12px] font-medium text-[#0B2E59]">
                                    {row.patient}
                                </td>
                                <td className="px-6 py-5 text-[12px] text-slate-500">
                                    {row.ageSex}
                                </td>
                                <td className="px-6 py-5 text-[12px] text-[#0B2E59]">
                                    {row.category}
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <StatusPill status={row.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="flex items-center justify-between px-5 py-4">
                    <p className="text-[11px] text-slate-400">Page 1 of 5</p>
                    <div className="flex gap-2">
                        <button className="rounded-md bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500">
                            Prev
                        </button>
                        <button className="rounded-md bg-[#0B2E59] px-3 py-2 text-[10px] font-bold text-white">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function PatientModule() {
    return (
        <ModulePage
            title="Patient Module"
            subtitle="Central patient records for BHC monitoring, referral history, and follow-up notes."
        >
            <SimpleTable
                headers={[
                    'Patient Name',
                    'Age/Sex',
                    'Category',
                    'Monitoring Status',
                    'Follow-up Date',
                    'Action',
                ]}
                rows={patientRows.map((patient) => [
                    patient[0],
                    patient[1],
                    patient[2],
                    <SoftBadge key={`${patient[0]}-badge`}>
                        {patient[3]}
                    </SoftBadge>,
                    patient[4],
                    <button
                        key={`${patient[0]}-view`}
                        className="text-[11px] font-bold text-[#0B2E59]"
                    >
                        View Profile
                    </button>,
                ])}
            />
        </ModulePage>
    );
}

function CreateReferral({
    setActiveItem,
}: {
    setActiveItem: (item: string) => void;
}) {
    const [showReview, setShowReview] = useState(false);
    const [formError, setFormError] = useState('');

    const [form, setForm] = useState({
        referralCategory: 'B1',
        visitDate: '2025-10-12',
        visitTime: '08:30',
        firstName: '',
        middleName: '',
        lastName: '',
        dateOfBirth: '',
        age: '',
        gender: 'Male',
        civilStatus: 'Single',
        philHealthId: '',
        philHealthCategory: 'Indigent Member',
        contactNumber: '',
        streetAddress: '',
        barangay: 'Pitpitan',
        municipality: 'Bulakan',
        chiefComplaint: '',
        summaryPresentIllness: '',
        initialActionTaken: '',
        reasonForReferral: '',
        referringPractitioner: '',
    });

    const updateField = (field: keyof typeof form, value: string) => {
        if (field === 'dateOfBirth') {
            setForm((current) => ({
                ...current,
                dateOfBirth: value,
                age: calculateAge(value),
            }));

            return;
        }

        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const fullName = [form.firstName, form.middleName, form.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

    const requiredFields: Array<keyof typeof form> = [
        'referralCategory',
        'firstName',
        'lastName',
        'dateOfBirth',
        'age',
        'gender',
        'civilStatus',
        'philHealthId',
        'philHealthCategory',
        'streetAddress',
        'barangay',
        'municipality',
        'chiefComplaint',
        'summaryPresentIllness',
        'initialActionTaken',
        'reasonForReferral',
        'referringPractitioner',
    ];

    const handleSubmitForReview = () => {
        const hasMissingField = requiredFields.some(
            (field) => !form[field].trim(),
        );

        if (hasMissingField) {
            setFormError(
                'Please complete all required fields before final review.',
            );
            return;
        }

        setFormError('');
        setShowReview(true);
    };

    const handleConfirmSubmit = () => {
        setShowReview(false);
        setActiveItem('Referrals');
    };

    return (
        <section>
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0B2E59]">
                        Create Referral
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        Encode referral details before sending the patient to
                        RHU.
                    </p>
                </div>

                <button
                    onClick={() => setActiveItem('Referrals')}
                    className="rounded-md border border-slate-200 bg-white px-4 py-2 text-[11px] font-bold text-[#0B2E59]"
                >
                    Back to Referral List
                </button>
            </div>

            <div className="space-y-5">
                <FormSection title="Referral Category">
                    <div className="grid gap-4 md:grid-cols-3">
                        <FormSelect
                            label="Referral Category"
                            value={form.referralCategory}
                            onChange={(value) =>
                                updateField('referralCategory', value)
                            }
                            options={['B1', 'B2', 'C1', 'C2', 'A1', 'A2']}
                        />
                        <FormInput
                            label="Date of Visit"
                            type="date"
                            value={form.visitDate}
                            onChange={(value) =>
                                updateField('visitDate', value)
                            }
                        />
                        <FormInput
                            label="Time"
                            type="time"
                            value={form.visitTime}
                            onChange={(value) =>
                                updateField('visitTime', value)
                            }
                        />
                    </div>
                </FormSection>

                <FormSection title="Patient Information">
                    <div className="grid gap-4 md:grid-cols-3">
                        <FormInput
                            label="First Name"
                            value={form.firstName}
                            onChange={(value) =>
                                updateField('firstName', value)
                            }
                            placeholder="Enter first name"
                        />
                        <FormInput
                            label="Middle Name"
                            value={form.middleName}
                            onChange={(value) =>
                                updateField('middleName', value)
                            }
                            placeholder="Enter middle name"
                        />
                        <FormInput
                            label="Last Name"
                            value={form.lastName}
                            onChange={(value) => updateField('lastName', value)}
                            placeholder="Enter last name"
                        />
                        <FormInput
                            label="Date of Birth"
                            type="date"
                            value={form.dateOfBirth}
                            onChange={(value) =>
                                updateField('dateOfBirth', value)
                            }
                        />
                        <FormInput
                            label="Age"
                            value={form.age ? `${form.age} Years Old` : ''}
                            readOnly
                            placeholder="Auto-generated from birth date"
                        />
                        <FormSelect
                            label="Civil Status"
                            value={form.civilStatus}
                            onChange={(value) =>
                                updateField('civilStatus', value)
                            }
                            options={[
                                'Single',
                                'Married',
                                'Widowed',
                                'Separated',
                            ]}
                        />
                        <FormInput
                            label="PhilHealth Account Number"
                            value={form.philHealthId}
                            onChange={(value) =>
                                updateField('philHealthId', value)
                            }
                            placeholder="e.g. 12-000456789-0"
                        />
                        <FormSelect
                            label="PhilHealth Category"
                            value={form.philHealthCategory}
                            onChange={(value) =>
                                updateField('philHealthCategory', value)
                            }
                            options={[
                                'Indigent Member',
                                'Senior Citizen',
                                'Member',
                                'Dependent',
                            ]}
                        />
                        <div>
                            <p className="mb-2 text-[11px] font-bold text-[#0B2E59] uppercase">
                                Gender
                            </p>
                            <div className="flex h-10 items-center gap-5 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="gender"
                                        checked={form.gender === 'Male'}
                                        onChange={() =>
                                            updateField('gender', 'Male')
                                        }
                                    />
                                    Male
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="gender"
                                        checked={form.gender === 'Female'}
                                        onChange={() =>
                                            updateField('gender', 'Female')
                                        }
                                    />
                                    Female
                                </label>
                            </div>
                        </div>
                        <FormInput
                            label="Contact Number"
                            value={form.contactNumber}
                            onChange={(value) =>
                                updateField('contactNumber', value)
                            }
                            placeholder="Enter contact number"
                        />
                        <FormInput
                            label="Street Address"
                            value={form.streetAddress}
                            onChange={(value) =>
                                updateField('streetAddress', value)
                            }
                            placeholder="Enter street address"
                        />
                        <FormInput
                            label="Barangay"
                            value={form.barangay}
                            onChange={(value) => updateField('barangay', value)}
                        />
                        <FormInput
                            label="Municipality"
                            value={form.municipality}
                            onChange={(value) =>
                                updateField('municipality', value)
                            }
                        />
                    </div>
                </FormSection>

                <FormSection title="Clinical Data and Referral Details">
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormTextarea
                            label="Chief Complaint"
                            value={form.chiefComplaint}
                            onChange={(value) =>
                                updateField('chiefComplaint', value)
                            }
                            placeholder="Example: Severe persistent headache with blurred vision for 3 days."
                        />
                        <FormTextarea
                            label="Initial Diagnosis"
                            value={form.initialActionTaken}
                            onChange={(value) =>
                                updateField('initialActionTaken', value)
                            }
                            placeholder="Example: Acute appendicitis / initial assessment notes"
                        />
                    </div>

                    <div className="mt-4 grid gap-4">
                        <FormTextarea
                            label="Summary of Present Illness"
                            value={form.summaryPresentIllness}
                            onChange={(value) =>
                                updateField('summaryPresentIllness', value)
                            }
                            placeholder="Provide a detailed narrative of the illness progression and clinical findings..."
                        />
                        <FormTextarea
                            label="Initial Action Taken"
                            value={form.initialActionTaken}
                            onChange={(value) =>
                                updateField('initialActionTaken', value)
                            }
                            placeholder="Enter actions taken at BHC before referral"
                        />
                        <FormTextarea
                            label="Reason for Referral"
                            value={form.reasonForReferral}
                            onChange={(value) =>
                                updateField('reasonForReferral', value)
                            }
                            placeholder="State why the patient needs RHU assessment"
                        />
                        <FormInput
                            label="Referring Practitioner"
                            value={form.referringPractitioner}
                            onChange={(value) =>
                                updateField('referringPractitioner', value)
                            }
                            placeholder="Enter the full name of the practitioner"
                        />
                    </div>

                    {formError && (
                        <div className="mt-5 rounded-md bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                            {formError}
                        </div>
                    )}

                    <div className="mt-6 flex items-center justify-between gap-4">
                        <p className="max-w-xl text-[11px] leading-5 text-slate-500">
                            Please review that all required patient and referral
                            details are complete before submission.
                        </p>

                        <button
                            type="button"
                            onClick={handleSubmitForReview}
                            className="rounded-md bg-[#0B2E59] px-5 py-3 text-xs font-bold text-white"
                        >
                            Submit Referral
                        </button>
                    </div>
                </FormSection>
            </div>

            {showReview && (
                <FinalReviewModal
                    form={form}
                    fullName={fullName}
                    onClose={() => setShowReview(false)}
                    onBackToEdit={() => setShowReview(false)}
                    onConfirm={handleConfirmSubmit}
                />
            )}
        </section>
    );
}

function calculateAge(dateOfBirth: string) {
    if (!dateOfBirth) return '';

    const birthDate = new Date(dateOfBirth);
    const today = new Date();

    if (Number.isNaN(birthDate.getTime())) return '';

    let age = today.getFullYear() - birthDate.getFullYear();
    const hasBirthdayPassed =
        today.getMonth() > birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() &&
            today.getDate() >= birthDate.getDate());

    if (!hasBirthdayPassed) {
        age -= 1;
    }

    return String(age);
}

function FinalReviewModal({
    form,
    fullName,
    onClose,
    onBackToEdit,
    onConfirm,
}: {
    form: {
        referralCategory: string;
        visitDate: string;
        visitTime: string;
        firstName: string;
        middleName: string;
        lastName: string;
        dateOfBirth: string;
        age: string;
        gender: string;
        civilStatus: string;
        philHealthId: string;
        philHealthCategory: string;
        contactNumber: string;
        streetAddress: string;
        barangay: string;
        municipality: string;
        chiefComplaint: string;
        summaryPresentIllness: string;
        initialActionTaken: string;
        reasonForReferral: string;
        referringPractitioner: string;
    };
    fullName: string;
    onClose: () => void;
    onBackToEdit: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B2E59]/35 px-4 py-6">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-100 px-7 py-5">
                    <div>
                        <h2 className="text-xl font-bold text-[#0B2E59]">
                            Final Review
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                            Verify all details before submitting.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xl leading-none text-slate-500 hover:text-[#0B2E59]"
                    >
                        ×
                    </button>
                </div>

                <div className="max-h-[68vh] overflow-y-auto">
                    <div className="flex items-center justify-between bg-[#DFF2FF] px-7 py-3">
                        <p className="text-[11px] font-bold tracking-wide text-[#0B2E59] uppercase">
                            Referral Category
                        </p>
                        <span className="rounded-md bg-[#0B2E59] px-4 py-2 text-xs font-bold text-white">
                            {form.referralCategory}
                        </span>
                    </div>

                    <div className="space-y-6 px-7 py-6">
                        <ReviewSection title="Patient Profile">
                            <div className="grid gap-4 md:grid-cols-2">
                                <ReviewField
                                    label="Full Name"
                                    value={fullName || '—'}
                                />
                                <ReviewField label="Sex" value={form.gender} />
                                <ReviewField
                                    label="Birth Date"
                                    value={formatDate(form.dateOfBirth)}
                                />
                                <ReviewField
                                    label="Age"
                                    value={
                                        form.age ? `${form.age} Years Old` : '—'
                                    }
                                />
                                <ReviewField
                                    label="Address"
                                    value={`${form.streetAddress}, ${form.barangay}, ${form.municipality}`}
                                    wide
                                />
                            </div>
                        </ReviewSection>

                        <ReviewSection title="PhilHealth Details">
                            <div className="grid gap-4 md:grid-cols-2">
                                <ReviewField
                                    label="PhilHealth ID"
                                    value={form.philHealthId}
                                />
                                <ReviewField
                                    label="PhilHealth Category"
                                    value={form.philHealthCategory}
                                />
                            </div>
                        </ReviewSection>

                        <ReviewSection title="Clinical Summary">
                            <div className="space-y-4">
                                <ReviewField
                                    label="Chief Complaint"
                                    value={form.chiefComplaint}
                                />
                                <ReviewField
                                    label="Summary of Present Illness"
                                    value={form.summaryPresentIllness}
                                />
                                <ReviewField
                                    label="Initial Action Taken"
                                    value={form.initialActionTaken}
                                />
                                <ReviewField
                                    label="Reason for Referral"
                                    value={form.reasonForReferral}
                                />
                            </div>
                        </ReviewSection>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-[#EAF3FB] px-7 py-5">
                    <button
                        type="button"
                        onClick={onBackToEdit}
                        className="rounded-md bg-white px-5 py-3 text-xs font-bold text-[#0B2E59]"
                    >
                        Back to Edit
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="rounded-md bg-[#0B2E59] px-5 py-3 text-xs font-bold text-white"
                    >
                        Confirm & Submit Referral →
                    </button>
                </div>
            </div>
        </div>
    );
}

function ReviewSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section>
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-[11px] font-bold tracking-wide text-[#0B2E59] uppercase">
                {title}
            </h3>
            {children}
        </section>
    );
}

function ReviewField({
    label,
    value,
    wide,
}: {
    label: string;
    value: string;
    wide?: boolean;
}) {
    return (
        <div className={wide ? 'md:col-span-2' : ''}>
            <p className="text-[10px] font-bold text-slate-400 uppercase">
                {label}
            </p>
            <p className="mt-1 text-sm leading-6 font-semibold text-[#0B2E59]">
                {value || '—'}
            </p>
        </div>
    );
}

function formatDate(value: string) {
    if (!value) return '—';

    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(value));
}

function FormSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-lg bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#0B2E59]">
                <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                {title}
            </h2>
            {children}
        </section>
    );
}

function FormInput({
    label,
    value,
    onChange,
    placeholder,
    readOnly,
    type = 'text',
}: {
    label: string;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    type?: string;
}) {
    return (
        <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">
                {label}
            </span>
            <input
                type={type}
                value={value ?? ''}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={placeholder}
                readOnly={readOnly}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#0B2E59]"
            />
        </label>
    );
}

function FormSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value?: string;
    onChange?: (value: string) => void;
    options: string[];
}) {
    return (
        <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">
                {label}
            </span>
            <select
                value={value ?? ''}
                onChange={(event) => onChange?.(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#0B2E59]"
            >
                {options.map((option) => (
                    <option key={option}>{option}</option>
                ))}
            </select>
        </label>
    );
}

function FormTextarea({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">
                {label}
            </span>
            <textarea
                value={value ?? ''}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={placeholder}
                className="mt-1 min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0B2E59]"
            />
        </label>
    );
}

function RHUDoctorSchedule() {
    return (
        <ModulePage
            title="RHU Doctor Schedule"
            subtitle="Read-only RHU schedule information for BHC staff before referring patients."
        >
            <div className="grid gap-4 md:grid-cols-3">
                {doctorSchedule.map(([doctor, service, schedule, status]) => (
                    <div
                        key={doctor}
                        className="rounded-lg border border-slate-100 bg-[#F8FAFC] p-5"
                    >
                        <p className="text-[11px] font-bold text-[#0B2E59] uppercase">
                            {doctor}
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-700">
                            {service}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            {schedule}
                        </p>
                        <span className="mt-4 inline-flex rounded-full bg-green-50 px-3 py-1 text-[10px] font-bold text-green-600">
                            {status}
                        </span>
                    </div>
                ))}
            </div>
        </ModulePage>
    );
}

function Reports() {
    return (
        <ModulePage
            title="Reports"
            subtitle="Monthly referral summary, patient category counts, no-show cases, and completed referrals."
        >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {reportCards.map(([label, value]) => (
                    <div
                        key={label}
                        className="rounded-lg border border-slate-100 bg-[#F8FAFC] p-5"
                    >
                        <p className="text-[11px] font-bold text-slate-500 uppercase">
                            {label}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-[#0B2E59]">
                            {value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-[#0B2E59]" />
                <p className="mt-3 text-sm font-bold text-[#0B2E59]">
                    Monthly data visualization placeholder
                </p>
                <p className="mt-1 text-xs text-slate-500">
                    Charts can be added later after database integration.
                </p>
            </div>
        </ModulePage>
    );
}

function ModulePage({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle: string;
    children: ReactNode;
}) {
    return (
        <section>
            <div className="mb-6">
                <h1 className="text-4xl font-bold tracking-tight text-[#0B2E59]">
                    {title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    {subtitle}
                </p>
            </div>

            <div className="rounded-lg bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                {children}
            </div>
        </section>
    );
}

function SimpleTable({
    headers,
    rows,
}: {
    headers: string[];
    rows: Array<Array<ReactNode>>;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-slate-100">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-[#0B2E59] text-white">
                        {headers.map((header) => (
                            <th
                                key={header}
                                className="px-5 py-3 text-[10px] font-bold tracking-wide uppercase"
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr
                            key={index}
                            className="border-b border-slate-100 last:border-0"
                        >
                            {row.map((cell, cellIndex) => (
                                <td
                                    key={cellIndex}
                                    className="px-5 py-4 text-[12px] text-slate-600"
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SoftBadge({ children }: { children: ReactNode }) {
    return (
        <span className="rounded-full bg-[#EAF3FB] px-3 py-1 text-[10px] font-bold text-[#0B2E59]">
            {children}
        </span>
    );
}

function StatusPill({ status }: { status: ReferralStatus }) {
    const classes = {
        Pending: 'bg-slate-100 text-slate-500',
        Received: 'bg-blue-50 text-blue-600',
        Completed: 'bg-green-50 text-green-600',
        'For Follow-up': 'bg-amber-50 text-amber-600',
        'No-Show': 'bg-red-50 text-red-600',
    }[status];

    return (
        <span
            className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase ${classes}`}
        >
            {status}
        </span>
    );
}

function GenericRolePage({ role, title }: { role: RoleId; title: string }) {
    const metrics: MetricCard[] =
        role === 'rhu'
            ? [
                  {
                      title: 'Incoming Referrals',
                      value: '56',
                      helper: 'Across all barangays',
                      icon: FileText,
                      tone: 'primary',
                  },
                  {
                      title: 'Walk-in Patients',
                      value: '31',
                      helper: 'Current RHU queue',
                      icon: UserPlus,
                      tone: 'muted',
                  },
                  {
                      title: 'Doctors on Duty',
                      value: '6',
                      helper: '2 service areas available',
                      icon: CalendarDays,
                      tone: 'success',
                  },
              ]
            : [
                  {
                      title: 'Registered Users',
                      value: '148',
                      helper: 'BHC and RHU accounts',
                      icon: UserCog,
                      tone: 'primary',
                  },
                  {
                      title: 'Audit Events',
                      value: '214',
                      helper: 'System activity today',
                      icon: FileText,
                      tone: 'muted',
                  },
                  {
                      title: 'Monthly Referrals',
                      value: '1,284',
                      helper: 'All barangays total',
                      icon: BarChart3,
                      tone: 'success',
                  },
              ];

    if (title !== 'Dashboard') {
        return (
            <ModulePage
                title={title}
                subtitle={`${title} module preview for ${roleConfigs[role].label}.`}
            >
                <p className="text-sm text-slate-500">
                    This page is separated from the dashboard. You can expand
                    the full content after the main dashboard design is
                    finalized.
                </p>
            </ModulePage>
        );
    }

    return (
        <section>
            <h1 className="mb-7 text-4xl font-bold tracking-tight text-[#0B2E59]">
                {roleConfigs[role].label} Dashboard
            </h1>

            <div className="grid gap-5 lg:grid-cols-3">
                {metrics.map((metric) => (
                    <DashboardMetric key={metric.title} metric={metric} />
                ))}
            </div>
        </section>
    );
}
