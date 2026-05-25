import { Phone, Users, Inbox } from "lucide-react";
import ActionMenu from "../../common/tables/ActionMenu";
import TablePagination from "../../common/pagination/TablePagination";

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
        rounded-2xl
        border border-[#E8ECF0]
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
          border-b border-[#F3F4F6]
          px-6 py-4
        "
      >
        <div
          className="
            flex items-center gap-2
          "
        >
          <Users size={16} className="text-[#2563EB]" />

          <h2
            className="
              text-sm
              font-semibold
              text-[#0B2E59]
            "
          >
            Patient Records
          </h2>

          <span
            className="
              rounded-lg
              bg-[#F3F4F6]
              px-2 py-1
              text-[10px]
              font-semibold
              text-[#6B7280]
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
              px-1 pb-3
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
                min-w-[1250px]
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
                    bg-[#F9FAFB]
                    text-[10px]
                    font-semibold
                    uppercase
                    tracking-wider
                    text-[#9CA3AF]
                  "
                >
                  {/* Eksaktong lapad sa bawat kolum para may breathing room sila */}
                  <th className="px-6 py-4 whitespace-nowrap w-[150px]">ID</th>
                  <th className="px-6 py-4 whitespace-nowrap w-[260px]">
                    Patient Name
                  </th>
                  <th className="px-6 py-4 whitespace-nowrap w-[110px]">
                    Age / Sex
                  </th>
                  <th className="px-6 py-4 whitespace-nowrap w-[200px]">
                    Classification
                  </th>
                  <th className="px-6 py-4 whitespace-nowrap w-[180px]">
                    Contact
                  </th>
                  <th className="px-6 py-4 whitespace-nowrap w-[160px]">
                    Last Visit
                  </th>
                  <th
                    className="
                      border-l border-[#F3F4F6]
                      bg-[#F9FAFB]
                      px-6 py-4
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
                    <td colSpan={7} className="px-6 py-16">
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
                            rounded-2xl
                            bg-[#F8FAFC]
                          "
                        >
                          <Inbox size={24} className="text-[#BCC3CD]" />
                        </div>

                        <h3
                          className="
                            text-sm
                            font-semibold
                            text-[#0B2E59]
                          "
                        >
                          No patients found
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
                  patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="
                        group
                        transition-all duration-150
                        hover:bg-[#FAFBFD]
                      "
                    >
                      {/* ID */}
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span
                          className="
                            inline-flex
                            rounded-lg
                            border border-[#E8ECF0]
                            bg-[#FAFBFC]
                            px-2.5 py-1.5
                            font-mono
                            text-[11px]
                            font-semibold
                            text-[#0B2E59]
                          "
                        >
                          {patient.id}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span
                          className="
                            block truncate
                            text-[13px]
                            font-semibold
                            text-[#1A1A1A]
                          "
                        >
                          {patient.name}
                        </span>
                      </td>

                      {/* Age */}
                      <td
                        className="
                          px-6 py-5
                          whitespace-nowrap
                          text-[13px]
                          text-[#6B7280]
                        "
                      >
                        {patient.ageSex}
                      </td>

                      {/* Classification */}
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span
                          className="
                            inline-flex
                            rounded-full
                            bg-slate-100
                            px-2.5 py-1
                            text-[11px]
                            font-semibold
                            text-slate-700
                          "
                        >
                          {patient.category || patient.type || "General"}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="px-6 py-5 whitespace-nowrap">
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
                          {patient.contact}
                        </span>
                      </td>

                      {/* Last Visit */}
                      <td
                        className="
                          px-6 py-5
                          whitespace-nowrap
                          text-[13px]
                          text-[#6B7280]
                        "
                      >
                        {patient.lastVisit || "—"}
                      </td>

                      {/* Actions */}
                      <td className="border-l border-[#F3F4F6] bg-white px-6 py-5 text-right group-hover:bg-[#FAFBFD]">
                        <div className="relative flex justify-end">
                          <ActionMenu
                            title={patient.name}
                            subtitle={patient.id}
                            viewLink={`/bhc/patients/${patient.id}`}
                            viewLabel="View Details"
                            editPatientLink={`/bhc/patients/${patient.id}`}
                            editPatientLabel="Edit Patient"
                            editLink={`/bhc/health-records/add?patientId=${patient.id}`}
                            editLabel="Add Consultation"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
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

