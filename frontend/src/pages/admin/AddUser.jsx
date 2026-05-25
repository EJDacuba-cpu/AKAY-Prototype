import { useNavigate } from "react-router";

import { ShieldCheck, UserPlus } from "lucide-react";

import useForm from "../../hooks/useForm";
import useNotification from "../../hooks/useNotification";

import FormGroup from "../../components/atoms/FormGroup";
import Input from "../../components/atoms/Input";
import Select from "../../components/atoms/Select";
import Button from "../../components/atoms/Button";

import DashboardLayout from "../../layouts/DashboardLayout";

import { validators } from "../../utils/validators";

const FACILITIES = [
  "Municipality of Bulakan",
  "Rural Health Unit Bulakan",
  "Pitpitan Health Center",
  "Taliptip Health Center",
  "San Jose Health Center",
  "Bagumbayan Health Center",
  "Bambang Health Center",
  "Balubad Health Center",
  "Matungao Health Center",
  "Maysantol Health Center",
  "Perez Health Center",
  "San Francisco Health Center",
  "San Nicolas Health Center",
  "Santa Ana Health Center",
  "Santa Ines Health Center",
  "Tibig Health Center",
];

const ROLES = ["Admin", "BHC", "RHU"];
const STATUSES = ["Active", "Inactive"];
const SETUP_METHODS = [
  "Send setup link to email",
  "Require password reset on first login",
];

export default function AddUser() {
  const navigate = useNavigate();
  const { success } = useNotification();

  const form = useForm(
    {
      fullName: "",
      email: "",
      role: "",
      position: "",
      facility: "",
      status: "Active",
      contactNumber: "",
      setupMethod: "Send setup link to email",
    },
    async (values) => {
      // Frontend demo - Later connects to Laravel API
      // Backend creates user account and sends setup/reset link by email
      success("User account created successfully");
      navigate("/admin/users");
    },
    {
      fullName: validators.required,
      email: validators.email,
      role: validators.required,
      position: validators.required,
      facility: validators.required,
    },
  );

  return (
    <DashboardLayout role="admin" title="Add User">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Add User Account
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Create an authorized account for BHC, RHU, or MHO/Admin personnel.
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <UserPlus size={22} />
        </div>
      </div>

      <form onSubmit={form.handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Account Information
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Enter the user’s basic account details.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <FormGroup label="Full Name" error={form.errors.fullName} required>
              <Input
                name="fullName"
                value={form.values.fullName}
                onChange={form.handleChange}
                placeholder="Example: Juan Dela Cruz"
              />
            </FormGroup>

            <FormGroup label="Email Address" error={form.errors.email} required>
              <Input
                name="email"
                type="email"
                value={form.values.email}
                onChange={form.handleChange}
                placeholder="example@akay.local"
              />
            </FormGroup>

            <FormGroup label="Contact Number" error={form.errors.contactNumber}>
              <Input
                name="contactNumber"
                value={form.values.contactNumber}
                onChange={form.handleChange}
                placeholder="09XXXXXXXXX"
              />
            </FormGroup>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Role and Assignment
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Assign the user’s role, position, facility, and account status.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <FormGroup label="Role" error={form.errors.role} required>
              <Select
                name="role"
                value={form.values.role}
                onChange={form.handleChange}
                options={[
                  { value: "", label: "Select role" },
                  ...ROLES.map((role) => ({ value: role, label: role })),
                ]}
              />
            </FormGroup>

            <FormGroup label="Position" error={form.errors.position} required>
              <Input
                name="position"
                value={form.values.position}
                onChange={form.handleChange}
                placeholder="Example: Barangay Health Worker"
              />
            </FormGroup>

            <FormGroup
              label="Facility / Assignment"
              error={form.errors.facility}
              required
            >
              <Select
                name="facility"
                value={form.values.facility}
                onChange={form.handleChange}
                options={[
                  { value: "", label: "Select facility" },
                  ...FACILITIES.map((facility) => ({
                    value: facility,
                    label: facility,
                  })),
                ]}
              />
            </FormGroup>

            <FormGroup label="Account Status">
              <Select
                name="status"
                value={form.values.status}
                onChange={form.handleChange}
                options={STATUSES.map((status) => ({
                  value: status,
                  label: status,
                }))}
              />
            </FormGroup>

            <FormGroup label="Password Setup">
              <Select
                name="setupMethod"
                value={form.values.setupMethod}
                onChange={form.handleChange}
                options={SETUP_METHODS.map((method) => ({
                  value: method,
                  label: method,
                }))}
              />
            </FormGroup>
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex gap-3">
            <ShieldCheck size={18} className="text-[#0B2E59]" />
            <p className="text-xs leading-relaxed text-[#4B5563]">
              <span className="font-semibold text-[#0B2E59]">
                Security Note:
              </span>{" "}
              Admin should create accounts and assign roles, but passwords
              should be set through the user’s registered email. Admin should
              not view or know user passwords.
            </p>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate("/admin/users")}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={form.isSubmitting}>
            Save User Account
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
