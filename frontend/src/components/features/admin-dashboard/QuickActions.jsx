import {
  KeyRound,
  Mail,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

const ACTIONS = [
  {
    title: "Create Account",
    description: "Register BHC or RHU staff access.",
    icon: UserRoundPlus,
    href: "/admin/users/add",
  },
  {
    title: "Account Directory",
    description: "Update roles, facilities, and status.",
    icon: UsersRound,
    href: "/admin/users",
  },
  {
    title: "Review Invites",
    description: "Manage invitations needing attention.",
    icon: Mail,
    href: "/admin/account-invites",
  },
  {
    title: "Review Reset Requests",
    description: "Approve or reject password resets.",
    icon: KeyRound,
    href: "/admin/password-reset-requests",
  },
];

export default function QuickActions() {
  return (
    <Card className="h-full rounded-card shadow-card">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Frequent account administration tasks.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ACTIONS.map((action) => (
          <QuickActionRow key={action.href} {...action} />
        ))}
      </CardContent>
    </Card>
  );
}

function QuickActionRow({ title, description, href, icon: Icon }) {
  return (
    <Link
      to={href}
      className="bhc-quick-action flex items-start gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
    >
      <span className="bhc-quick-icon flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-ink-700">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="bhc-quick-title text-sm font-semibold text-neutral-900">{title}</p>
        <p className="bhc-quick-description mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
    </Link>
  );
}
