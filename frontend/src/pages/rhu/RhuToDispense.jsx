import DashboardLayout from "../../components/layout/DashboardLayout";
import RhuToDispenseTab from "../../components/features/medicine/RhuToDispenseTab";

export default function RhuToDispense() {
  return (
    <DashboardLayout role="rhu" title="Medicine and Supply">
      <RhuToDispenseTab />
    </DashboardLayout>
  );
}
