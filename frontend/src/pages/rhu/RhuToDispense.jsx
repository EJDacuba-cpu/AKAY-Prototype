import DashboardLayout from "../../components/layout/DashboardLayout";
import RhuToDispenseTab from "../../components/features/medicine/RhuToDispenseTab";

export default function RhuToDispense() {
  return (
    <DashboardLayout role="rhu" title="Medicine and Supply">
      <div className="space-y-4">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-ink-800">To Dispense</h1>
          <p className="mt-1 text-[13px] text-neutral-600">Review prescriptions and confirm medicines given.</p>
        </div>
        <RhuToDispenseTab />
      </div>
    </DashboardLayout>
  );
}
