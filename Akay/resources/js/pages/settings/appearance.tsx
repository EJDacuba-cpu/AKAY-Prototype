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
    Stethoscope,
    UserCog,
    UserPlus,
    Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type RoleId = 'bhc' | 'rhu' | 'mho';

type NavItem = {
    label: string;
    icon: LucideIcon;
};

type MetricCard = {
    title: string;
    value: string;
    subtitle: string;
    icon: LucideIcon;
    iconTone?: 'green' | 'gray' | 'blue' | 'amber' | 'red';
};

type ReferralRow = {
    patient: string;
    ageSex: string;
    category: string;
    status: 'Pending' | 'Received' | 'Completed' | 'For Follow-up' | 'No-Show';
};

type RoleConfig = {
    label: string;
    description: string;
    nav: NavItem[];
};

const PRIMARY = '#0B2E59';

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
            { label: 'Patient module', icon: Users },
            { label: 'Patient monitoring', icon: HeartPulse },
            { label: 'Referrals', icon: FileText },
            { label: 'RHU feedback', icon: Stethoscope },
            { label: 'RHU doctor schedule', icon: CalendarDays },
            { label: 'Printable slip', icon: QrCode },
            { label: 'Reports', icon: BarChart3 },
        ],
    },
    rhu: {
        label: 'RHU Staff',
        description: 'Rural Health Unit',
        nav: [
            { label: 'Dashboard', icon: BarChart3 },
            { label: 'Incoming referrals', icon: FileText },
            { label: 'QR / Tracking search', icon: QrCode },
            { label: 'Patient module', icon: Users },
            { label: 'Walk-in patients', icon: UserPlus },
            { label: 'RHU processing', icon: Stethoscope },
            { label: 'Doctor schedule', icon: CalendarDays },
            { label: 'Inventory', icon: Package },
            { label: 'Reports', icon: BarChart3 },
        ],
    },
    mho: {
        label: 'MHO / Admin',
        description: 'System Administrator',
        nav: [
            { label: 'Dashboard', icon: BarChart3 },
            { label: 'Account management', icon: UserCog },
            { label: 'Audit logs', icon: FileText },
            { label: 'Overall reports', icon: BarChart3 },
            { label: 'Users', icon: Users },
        ],
    },
};

const bhcMetrics: MetricCard[] = [
    {
        title: 'Completed Referrals',
        value: '10',
        subtitle: 'Successful referrals',
        icon: CheckCircle,
        iconTone: 'green',
    },
    {
        title: 'Pending Referrals',
        value: '12',
        subtitle: 'Awaiting RHU check-in',
        icon: Clock,
        iconTone: 'gray',
    },
    {
        title: 'RHU Patient Volume',
        value: 'Normal',
        subtitle: 'Standard waiting time · Updated: 5m ago',
        icon: HeartPulse,
        iconTone: 'green',
    },
];

const bhcReferrals: ReferralRow[] = [
    {
        patient: 'Juan Reyes',
        ageSex: '31 / M',
        category: 'B1',
        status: 'Pending',
    },
    {
        patient: 'Maria Rosa',
        ageSex: '31 / F',
        category: 'C2',
        status: 'Received',
    },
    {
        patient: 'John Cruz',
        ageSex: '45 / M',
        category: 'A1',
        status: 'Completed',
    },
];

const patientCategories = [
    { label: 'Pregnant women', value: '23' },
    { label: 'Children', value: '45' },
    { label: 'Immunization', value: '31' },
    { label: 'Senior citizens', value: '28' },
    { label: 'Hypertension', value: '19' },
    { label: 'For follow-up', value: '16' },
];

const doctorSchedule = [
    {
        doctor: 'Dr. Roldan',
        service: 'General consultation',
        schedule: 'Mon-Wed · 8:00 AM - 12:00 PM',
    },
    {
        doctor: 'RHU Midwife',
        service: 'Maternal care',
        schedule: 'Tue-Thu · 9:00 AM - 3:00 PM',
    },
    {
        doctor: 'RHU Nurse',
        service: 'Immunization',
        schedule: 'Friday · 8:00 AM - 11:00 AM',
    },
];

const rhuMetrics: MetricCard[] = [
    {
        title: 'Incoming Referrals',
        value: '56',
        subtitle: 'Across all barangays',
        icon: FileText,
        iconTone: 'blue',
    },
    {
        title: 'Walk-in Patients',
        value: '31',
        subtitle: 'Current RHU queue',
        icon: UserPlus,
        iconTone: 'amber',
    },
    {
        title: 'Doctors on Duty',
        value: '6',
        subtitle: '2 service areas available',
        icon: CalendarDays,
        iconTone: 'green',
    },
];

const mhoMetrics: MetricCard[] = [
    {
        title: 'Registered Users',
        value: '148',
        subtitle: 'BHC and RHU accounts',
        icon: UserCog,
        iconTone: 'blue',
    },
    {
        title: 'Audit Events',
        value: '214',
        subtitle: 'System activity today',
        icon: FileText,
        iconTone: 'amber',
    },
    {
        title: 'Monthly Referrals',
        value: '1,284',
        subtitle: 'All barangays total',
        icon: BarChart3,
        iconTone: 'green',
    },
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
            <Head title={`AKAY ${config.label} Demo`} />

            <div className="min-h-screen bg-[#F5F7FB] text-[#0B2E59]">
                <TopBar />

                <div className="flex min-h-[calc(100vh-36px)]">
                    <Sidebar
                        config={config}
                        activeItem={activeItem}
                        onSelect={setActiveItem}
                        onLogout={handleLogout}
                    />

                    <main className="flex-1 px-8 py-7">
                        {role === 'bhc' && <BHCDashboard />}
                        {role === 'rhu' && (
                            <SimpleRoleDashboard
                                title="RHU Staff Dashboard"
                                subtitle="Referral receiving, walk-in processing, doctor schedule, and inventory overview."
                                metrics={rhuMetrics}
                            />
                        )}
                        {role === 'mho' && (
                            <SimpleRoleDashboard
                                title="MHO / Admin Dashboard"
                                subtitle="Account management, audit logs, and municipal-level referral reports."
                                metrics={mhoMetrics}
                            />
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

    function submit(e: React.FormEvent) {
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
            <Head title="AKAY Demo Login" />

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
                            className="h-9 w-full border border-slate-300 px-3 pr-9 text-xs outline-none focus:border-[#0B2E59]"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500"
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
        <aside className="flex w-[185px] shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-5">
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

            <nav className="flex-1 py-3">
                {config.nav.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeItem === item.label;

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

            <div className="px-5 py-5">
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

function BHCDashboard() {
    return (
        <section>
            <h1 className="mb-7 text-4xl font-bold tracking-tight text-[#0B2E59]">
                Dashboard
            </h1>

            <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.1fr]">
                {bhcMetrics.map((metric) => (
                    <MetricCard key={metric.title} metric={metric} />
                ))}
            </div>

            <div className="mt-7 grid gap-6 xl:grid-cols-[1.8fr_0.9fr]">
                <div className="space-y-6">
                    <RecentReferralsTable />
                    <PatientMonitoringCard />
                    <PrintableSlipCard />
                </div>

                <div className="space-y-6">
                    <QuickActionsCard />
                    <RHUDoctorScheduleCard />
                    <MonthlyReportCard />
                </div>
            </div>
        </section>
    );
}

function MetricCard({ metric }: { metric: MetricCard }) {
    const Icon = metric.icon;

    const iconClass = {
        green: 'bg-green-100 text-green-600',
        gray: 'bg-slate-100 text-slate-500',
        blue: 'bg-[#EAF3FB] text-[#0B2E59]',
        amber: 'bg-amber-100 text-amber-600',
        red: 'bg-red-100 text-red-600',
    }[metric.iconTone ?? 'blue'];

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
            <p className="mt-1 text-[11px] text-slate-500">{metric.subtitle}</p>
        </div>
    );
}

function RecentReferralsTable() {
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
                    {bhcReferrals.map((row) => (
                        <tr
                            key={row.patient}
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

function QuickActionsCard() {
    const actions = [
        {
            title: 'New Referral',
            subtitle: 'Send a patient to RHU',
            icon: CirclePlus,
            color: 'bg-[#0B2E59] text-white',
        },
        {
            title: 'Search records',
            subtitle: 'Find records and history',
            icon: Search,
            color: 'bg-slate-100 text-slate-500',
        },
        {
            title: 'Patient monitoring',
            subtitle: 'View categories and follow-up',
            icon: HeartPulse,
            color: 'bg-green-100 text-green-700',
        },
        {
            title: 'Print referral slip',
            subtitle: 'Tracking ID and secured QR',
            icon: QrCode,
            color: 'bg-[#EAF3FB] text-[#0B2E59]',
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

function PatientMonitoringCard() {
    return (
        <div className="rounded-lg bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0B2E59]">
                    Patient Monitoring Categories
                </h2>
                <span className="rounded-full bg-[#EAF3FB] px-3 py-1 text-[10px] font-bold text-[#0B2E59]">
                    BHC Module
                </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {patientCategories.map((category) => (
                    <div
                        key={category.label}
                        className="rounded-md border border-slate-100 bg-[#F8FAFC] p-4"
                    >
                        <p className="text-[11px] font-bold text-slate-500">
                            {category.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-[#0B2E59]">
                            {category.value}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RHUDoctorScheduleCard() {
    return (
        <div className="rounded-lg bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0B2E59]">
                    RHU Doctor Schedule
                </h2>
                <CalendarDays className="h-4 w-4 text-[#0B2E59]" />
            </div>

            <div className="space-y-3">
                {doctorSchedule.map((schedule) => (
                    <div
                        key={schedule.doctor}
                        className="rounded-md border border-slate-100 bg-[#F8FAFC] p-3"
                    >
                        <p className="text-[11px] font-bold text-[#0B2E59] uppercase">
                            {schedule.doctor}
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-slate-700">
                            {schedule.service}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                            {schedule.schedule}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PrintableSlipCard() {
    return (
        <div className="rounded-lg bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-sm font-bold text-[#0B2E59]">
                        Printable Referral Slip
                    </h2>
                    <p className="mt-2 max-w-xl text-[12px] leading-5 text-slate-500">
                        Slip includes patient name, referral date, RHU location,
                        Tracking ID, and secured QR code. The QR stores the
                        Tracking ID only, not full patient information.
                    </p>
                </div>

                <div className="flex items-center gap-4 rounded-lg border border-dashed border-[#0B2E59]/40 bg-[#F8FAFC] p-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-md bg-white text-[#0B2E59] shadow-sm">
                        <QrCode className="h-9 w-9" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-[#0B2E59]">
                            REF-24045
                        </p>
                        <p className="text-[10px] text-slate-500">
                            RHU Bulakan · May 2026
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MonthlyReportCard() {
    const reports = [
        ['Monthly referrals', '27'],
        ['Follow-up', '7'],
        ['No-show', '3'],
        ['Completed', '42'],
    ];

    return (
        <div className="rounded-lg bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0B2E59]">
                    Monthly Report Preview
                </h2>
                <BarChart3 className="h-4 w-4 text-[#0B2E59]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                {reports.map(([label, value]) => (
                    <div key={label} className="rounded-md bg-[#F8FAFC] p-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">
                            {label}
                        </p>
                        <p className="mt-1 text-xl font-bold text-[#0B2E59]">
                            {value}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StatusPill({ status }: { status: ReferralRow['status'] }) {
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

function SimpleRoleDashboard({
    title,
    subtitle,
    metrics,
}: {
    title: string;
    subtitle: string;
    metrics: MetricCard[];
}) {
    return (
        <section>
            <h1 className="mb-2 text-4xl font-bold tracking-tight text-[#0B2E59]">
                {title}
            </h1>
            <p className="mb-7 text-sm text-slate-500">{subtitle}</p>

            <div className="grid gap-5 lg:grid-cols-3">
                {metrics.map((metric) => (
                    <MetricCard key={metric.title} metric={metric} />
                ))}
            </div>

            <div className="mt-7 rounded-lg bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <h2 className="text-lg font-bold text-[#0B2E59]">
                    Demo module preview
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                    This role uses the same visual direction. Full RHU and MHO
                    pages can be expanded after the BHC dashboard design is
                    finalized.
                </p>
            </div>
        </section>
    );
}
