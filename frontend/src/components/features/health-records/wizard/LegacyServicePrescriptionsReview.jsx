import { ClinicalCheckbox } from "../fields/ClinicalFields";
import RhuPrescriptionsSection from "./RhuPrescriptionsSection";
import { selectedCarePlanServices } from "../../../../utils/serviceNextActions";
import { legacyServiceOnlyPrescriptions } from "../../../../utils/serviceUsages";

/**
 * Drafts that still carry serviceKeys-only prescriptions (from the removed
 * Selected Health Services Prescriptions block) must be reviewed explicitly.
 * They stay as prescriptions — never silently deleted or reclassified as usage.
 */
export default function LegacyServicePrescriptionsReview({
  selectedPrograms = [],
  diagnoses = [],
  prescriptions = [],
  onPrescriptionsChange,
  prescriptionEditor = null,
  onPrescriptionEditorChange,
  reviewed = false,
  onReviewedChange,
  errors = {},
  disabled = false,
}) {
  const legacy = legacyServiceOnlyPrescriptions(prescriptions);
  if (legacy.length === 0) return null;

  const carePlanServices = selectedCarePlanServices(selectedPrograms);

  return (
    <div
      className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3"
      data-testid="legacy-service-prescriptions-review"
      role="region"
      aria-labelledby="legacy-service-rx-title"
    >
      <div>
        <h3 id="legacy-service-rx-title" className="text-sm font-semibold text-[#92400E]">
          Review legacy service prescriptions
        </h3>
        <p className="mt-1 text-xs text-[#92400E]">
          This draft still has prescriptions linked only to Selected Health Services.
          They remain visit prescriptions and will appear in To Dispense as prescriptions.
          Link them to a diagnosis, edit them, or remove them — they are not converted to
          service usage automatically.
        </p>
      </div>
      <RhuPrescriptionsSection
        serviceMode
        selectedServiceKeys={carePlanServices}
        diagnoses={diagnoses}
        prescriptions={prescriptions}
        onPrescriptionsChange={onPrescriptionsChange}
        errors={errors}
        disabled={disabled}
        editor={prescriptionEditor}
        onEditorChange={onPrescriptionEditorChange}
      />
      <ClinicalCheckbox
        checked={reviewed === true}
        disabled={disabled}
        onChange={(checked) => onReviewedChange?.(checked)}
        label="I reviewed these service-linked prescriptions. Keep them as prescriptions for To Dispense."
      />
      {errors.legacyServicePrescriptionReviewed ? (
        <p role="alert" className="text-xs text-[#B91C1C]">
          {errors.legacyServicePrescriptionReviewed}
        </p>
      ) : null}
    </div>
  );
}
