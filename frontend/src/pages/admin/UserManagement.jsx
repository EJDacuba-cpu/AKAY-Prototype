import { Link } from "react-router";
import { useState } from "react";
import {
  Activity,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  UserX,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function UserManagement() {
  const [showForm, setShowForm] = useState(false);

  const [users, setUsers] = useState([
    {
      id: "USR-001",
      name: "Lorna Reyes",
      email: "bhc@akay.local",
      role: "BHC",
      position: "Barangay Health Worker",
      facility: "Pitpitan Health Center",
      status: "Active",
    },
    {
      id: "USR-002",
      name: "Joshua Pio",
      email: "rhu@akay.local",
      role: "RHU",
      position: "RHU Staff",
      facility: "Rural Health Unit Bulakan",
      status: "Active",
    },
    {
      id: "USR-003",
      name: "Dr. Maria Santos",
      email: "doctor@akay.local",
      role: "RHU",
      position: "Doctor",
      facility: "Rural Health Unit Bulakan",
      status: "Active",
    },
    {
      id: "USR-004",
      name: "Admin MHO",
      email: "admin@akay.local",
      role: "Admin",
      position: "Municipal Health Officer",
      facility: "Municipality of Bulakan",
      status: "Active",
    },
    {
      id: "USR-005",
      name: "Ana Cruz",
      email: "ana.bhc@akay.local",
      role: "BHC",
      position: "BHC Staff",
      facility: "Taliptip Health Center",
      status: "Inactive",
    },
  ]);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    position: "",
    facility: "",
    status: "Active",
  });

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleAddUser(e) {
    e.preventDefault();

    const newUser = {
      id: `USR-${String(users.length + 1).padStart(3, "0")}`,
      ...form,
    };

    setUsers((prev) => [newUser, ...prev]);

    setForm({
      name: "",
      email: "",
      role: "",
      position: "",
      facility: "",
      status: "Active",
    });

    setShowForm(false);
  }

  function updateStatus(id, newStatus) {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === id ? { ...user, status: newStatus } : user,
      ),
    );
  }

  const activeUsers = users.filter((user) => user.status === "Active").length;
  const inactiveUsers = users.filter(
    (user) => user.status === "Inactive",
  ).length;
  const bhcUsers = users.filter((user) => user.role === "BHC").length;
  const rhuUsers = users.filter((user) => user.role === "RHU").length;

  return (
    <DashboardLayout role="admin" title="User Management">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            User Management
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Create and manage BHC, RHU, and MHO/Admin user accounts.
          </p>
        </div>

        <Link
          to="/admin/users/add"
          className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#092347]"
        >
          <Plus size={15} />
          Add User
        </Link>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active Users"
          value={activeUsers}
          icon={<UserCheck size={17} />}
          color="green"
        />
        <StatCard
          title="Inactive Users"
          value={inactiveUsers}
          icon={<UserX size={17} />}
          color="red"
        />
        <StatCard
          title="BHC Users"
          value={bhcUsers}
          icon={<Users size={17} />}
          color="blue"
        />
        <StatCard
          title="RHU Users"
          value={rhuUsers}
          icon={<ShieldCheck size={17} />}
          color="navy"
        />
      </div>

      {showForm && (
        <form
          onSubmit={handleAddUser}
          className="mb-6 rounded-xl border border-[#E8ECF0] bg-white p-6"
        >
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Create User Account
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              Assign the user role, facility, and initial account status.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="Full Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Example: Juan Dela Cruz"
              required
            />

            <FieldInput
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="example@akay.local"
              required
            />

            <FieldSelect
              label="Role"
              name="role"
              value={form.role}
              onChange={handleChange}
              required
            >
              <option value="">Select role</option>
              <option>Admin</option>
              <option>BHC</option>
              <option>RHU</option>
            </FieldSelect>

            <FieldInput
              label="Position"
              name="position"
              value={form.position}
              onChange={handleChange}
              placeholder="Example: BHC Staff"
              required
            />

            <FieldSelect
              label="Facility / Assignment"
              name="facility"
              value={form.facility}
              onChange={handleChange}
              required
            >
              <option value="">Select facility</option>
              <option>Municipality of Bulakan</option>
              <option>Rural Health Unit Bulakan</option>
              <option>Pitpitan Health Center</option>
              <option>Taliptip Health Center</option>
              <option>San Jose Health Center</option>
              <option>Bagumbayan Health Center</option>
              <option>Bambang Health Center</option>
              <option>Balubad Health Center</option>
              <option>Maysantol Health Center</option>
              <option>Matungao Health Center</option>
              <option>Perez Health Center</option>
              <option>San Francisco Health Center</option>
              <option>San Nicolas Health Center</option>
              <option>Santa Ana Health Center</option>
              <option>Santa Ines Health Center</option>
              <option>Tibig Health Center</option>
            </FieldSelect>

            <FieldSelect
              label="Account Status"
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option>Active</option>
              <option>Inactive</option>
            </FieldSelect>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
            >
              Save User
            </button>
          </div>
        </form>
      )}

      <div className="mb-6 rounded-xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search User
            </label>
            <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                className="h-9 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search name or email..."
              />
            </div>
          </div>

          <FilterSelect label="Role">
            <option>All Roles</option>
            <option>Admin</option>
            <option>BHC</option>
            <option>RHU</option>
          </FilterSelect>

          <FilterSelect label="Facility">
            <option>All Facilities</option>
            <option>Rural Health Unit Bulakan</option>
            <option>Pitpitan Health Center</option>
            <option>Taliptip Health Center</option>
            <option>San Jose Health Center</option>
          </FilterSelect>

          <FilterSelect label="Status">
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </FilterSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              User Accounts
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              MHO/Admin can activate, deactivate, and review user assignments.
            </p>
          </div>

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {users.length} users
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">User ID</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-6 py-3.5">
                    <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0B2E59]">
                      {user.id}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B2E59] text-[10px] font-bold text-white">
                        {user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>

                      <p className="text-sm font-semibold text-[#1A1A1A]">
                        {user.name}
                      </p>
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <Mail size={13} className="text-[#9CA3AF]" />
                      {user.email}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <RoleBadge role={user.role} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {user.position}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {user.facility}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <StatusBadge status={user.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-xs font-semibold text-[#0B2E59] hover:bg-[#F9FAFB]">
                        <UserCog size={14} />
                      </button>

                      {user.status === "Active" ? (
                        <button
                          onClick={() => updateStatus(user.id, "Inactive")}
                          className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(user.id, "Active")}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <div className="flex gap-3">
          <Activity size={18} className="text-[#0B2E59]" />
          <p className="text-xs leading-relaxed text-[#4B5563]">
            <span className="font-semibold text-[#0B2E59]">Note:</span> In the
            backend version, user creation, status changes, and role assignment
            should be recorded in Audit Logs for accountability.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FieldInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      >
        {children}
      </select>
    </div>
  );
}

function FilterSelect({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select className="h-9 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none">
        {children}
      </select>
    </div>
  );
}

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#0B2E59] text-[#0B2E59] bg-blue-50",
    blue: "border-t-blue-500 text-blue-700 bg-blue-50",
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
  };

  const selected = map[color] || map.navy;
  const parts = selected.split(" ");
  const border = parts[0];
  const iconStyle = parts.slice(1).join(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 ${border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div className={`flex-shrink-0 rounded-lg p-2 ${iconStyle}`}>
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

function RoleBadge({ role }) {
  const map = {
    Admin: "bg-purple-50 text-purple-700",
    BHC: "bg-blue-50 text-blue-700",
    RHU: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[role] || "bg-slate-100 text-slate-600"
      }`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    Active: "bg-emerald-50 text-emerald-700",
    Inactive: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}
