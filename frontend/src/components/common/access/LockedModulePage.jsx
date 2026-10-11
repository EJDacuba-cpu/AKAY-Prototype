import DashboardLayout from "../../layout/DashboardLayout";
import RestrictedArea from "./RestrictedArea";
import { PageSkeletonLoader } from "../loading/SkeletonLoaders";
import { ACCESS_MODULES } from "../../../config/accessModules";

/** Shown instead of a page whose module is locked: the page never mounts, so none of its data is requested. */
export default function LockedModulePage({ role, module }) {
  const { label = "Module", skeleton } = ACCESS_MODULES[module] || {};

  return (
    <DashboardLayout role={role} title={label}>
      <RestrictedArea
        locked
        label={label}
        className="min-h-[calc(100dvh-11rem)] rounded-xl"
        placeholder={<PageSkeletonLoader variant={skeleton} message={label} />}
      />
    </DashboardLayout>
  );
}
