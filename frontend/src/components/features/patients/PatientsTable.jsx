import { Phone, Users, Inbox } from "lucide-react";
import ActionMenu from "../../common/tables/ActionMenu";
import TablePagination from "../../common/pagination/TablePagination";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../../utils/formatters";

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PatientsTable({
  patients = [], // Nilagyan ng default fallback array para ligtas sa .length at .map
  loading,
  currentPage = 1, // Fallback sa page 1 kung sakaling hindi agad maipasa ng parent Hook
  totalPages = 1, // Fallback sa kabuuang 1 pahina
  setCurrentPage = () => {}, // Fallback empty function para iwas sa "setCurrentPage is not a function"
}) {
  return (
    <div
      className="
        anim-fade-up
        relative
        z-0
        overflow-visible
        rounded-xl
        border border-[#E5E7EB]
        bg-white
        shadow-sm
        shadow-black/[0.02]
      "
    >
      {/* Header */}
      <div
        className="
          flex items-center
          justify-between
          border-b border-[#F1F5F9]
          px-4 py-3
        "
      >
        <div
          className="
            flex items-center gap-2
          "
        >
          <Users size={16} className="text-[#B91C1C]" />

          <h2
            className="
              text-sm
              font-semibold
              text-[#0F172A]
            "
          >
            Patient Records
          </h2>

          <span
            className="
              rounded-md
              border border-[#E5E7EB]
              bg-[#F8FAFC]
              px-2 py-1
              text-[10px]
              font-semibold
              text-[#64748B]
            "
          >
            {patients.length}
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div
          className="
            flex items-center
            justify-center
            py-16
          "
        >
          <p
            className="
              text-sm
              text-[#9CA3AF]
            "
          >
            Loading patients...
          </p>
        </div>
      ) : (
        <>
          {/* Table Container - IBINALIK ANG SCROLL AT BINIGYAN NG SAPAT NA MIN-WIDTH */}
          <div
            className="
              w-full
              overflow-x-auto
              overflow-y-visible
              scroll-smooth
              px-1 pb-2
              [&::-webkit-scrollbar]:h-2
              [&::-webkit-scrollbar-track]:rounded-full
              [&::-webkit-scrollbar-track]:bg-[#F8FAFC]
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-[#D6DEE8]
              hover:[&::-webkit-scrollbar-thumb]:bg-[#B8C4D3]
            "
          >
            <table
              className="
              w-full
              table-fixed
                w-full
                border-separate
                border-spacing-0
                text-left
              "
            >
              {/* Head */}
              <thead>
                <tr
                  className="
                    bg-[#F8FAFC]
                    text-[10px]
                    font-semibold
                    uppercase
                    tracking-wider
                    text-[#94A3B8]
                  "
                >
                  {/* Eksaktong lapad sa bawat kolum para may breathing room sila */}
                  <th className="px-4 py-3 whitespace-nowrap w-[150px]">ID</th>
                  <th className="px-4 py-3 whitespace-nowrap w-[220px]">
                    Patient Name
                  </th>

                  <th className="px-4 py-3 whitespace-nowrap w-[150px]">
                    Contact
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap w-[150px]">
                    Date Registered
                  </th>
                  <th
                    className="
                      border-l border-[#F1F5F9]
                      bg-[#F8FAFC]
                      px-4 py-3
                      text-right
                      w-[110px]
                    "
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-[#F8FAFC]">
                {patients.length === 0 ? (
                  <tr>
                  <td colSpan={5} className="px-4 py-12">
                      <div
                        className="
                          flex flex-col
                          items-center
                          justify-center
                          text-center
                        "
                      >
                        <div
                          className="
                            mb-4
                            flex h-14 w-14
                            items-center
                            justify-center
                            rounded-xl
                            bg-[#F8FAFC]
                          "
                        >
                          <Inbox size={24} className="text-[#BCC3CD]" />
                        </div>

                        <h3
                          className="
                            text-sm
                            font-semibold
                            text-[#0F172A]
                          "
                        >
                          No patients yet.
                        </h3>

                        <p
                          className="
                            mt-1
                            text-[13px]
                            text-[#9CA3AF]
                          "
                        >
                          Try adjusting filters or add a patient.
                        </p>
                      </div>
                    </td>
                  </tr>
              ) : (
                patients.map((patient) => {
                    const patientId = formatDisplayValue(patient.id, "");
                    const patientName = formatPatientName(
                      patient,
                      "Unnamed Patient",
                    );
                    const contact = formatDisplayValue(
                      patient.contact || patient.contactNumber,
                      "Not recorded",
                    );
                    const dateRegistered = formatDate(
                      patient.dateRegistered ||
                        patient.date_registered ||
                        patient.created_at ||
                        patient.createdAt,
                    );
                    return (
                    <tr
                      key={patient.id}
                      className="
                        group
                        transition-all duration-150
                        hover:bg-[#FAFBFD]
                      "
                    >
                      {/* ID */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className="
                            inline-flex
                            rounded-lg
                            border border-[#E5E7EB]
                            bg-[#F8FAFC]
                            px-2.5 py-1.5
                            font-mono
                            text-[11px]
                            font-semibold
                            text-[#B91C1C]
                          "
                        >
                          {patientId}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className="
                            block truncate
                            text-[13px]
                            font-semibold
                            text-[#0F172A]
                          "
                        >
                          {patientName}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className="
                            inline-flex
                            items-center
                            gap-1.5
                            text-[13px]
                            text-[#6B7280]
                          "
                        >
                          <Phone size={12} className="text-[#BCC3CD]" />
                          {contact}
                        </span>
                      </td>

                        {/* Date Registered */}
                        <td
                          className="
                            px-4 py-3.5
                            whitespace-nowrap
                            text-[13px]
                            text-[#6B7280]
                          "
                        >
                          {dateRegistered}
                        </td>

                      {/* Actions */}
                      <td className="border-l border-[#F1F5F9] bg-white px-4 py-3.5 text-right group-hover:bg-[#FAFBFD]">
                        <div className="relative flex justify-end">
                          <ActionMenu
                            title={patientName}
                            subtitle={patientId}
                            viewLink={`/bhc/patients/${patient.id}`}
                            viewLabel="View Details"
                            editPatientLink={`/bhc/patients/${patient.id}`}
                            editPatientLabel="Edit Patient"
                            editLink={`/bhc/health-records/add?patientId=${patient.id}`}
                            editLabel="Add Health Record"
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* DITO MAAYOS NA NAKAKABIT ANG DYNAMIC TRUNCATED PAGINATION MO */}
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
