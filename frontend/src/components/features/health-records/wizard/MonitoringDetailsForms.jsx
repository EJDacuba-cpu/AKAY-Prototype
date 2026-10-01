import TbTreatmentCardForm from "../TbTreatmentCardForm";
import { MONITORING_DETAILS } from "../../../../utils/monitoringDetails";

function TbDotsDetails({ tbData, onTbDataChange, recordId }) {
  return <TbTreatmentCardForm value={tbData} onChange={onTbDataChange} recordId={recordId} />;
}

/**
 * monitoring_details key -> form. Adding a specialized workflow: declare the
 * key on the condition (backend registry), add its copy to
 * utils/monitoringDetails.js, its required fields to
 * App\Services\MonitoringDetails, and its form here.
 */
export const MONITORING_DETAIL_FORMS = {
  tb_dots: TbDotsDetails,
};

export default function MonitoringDetailsForms({ detailKeys = [], ...formProps }) {
  return (
    <div className="space-y-6">
      {detailKeys.map((key) => {
        const Form = MONITORING_DETAIL_FORMS[key];
        const details = MONITORING_DETAILS[key];
        if (!Form || !details) return null;
        return (
          <section key={key} aria-labelledby={`monitoring-details-${key}`}>
            <h2 id={`monitoring-details-${key}`} className="text-sm font-bold text-[#111827]">{details.label}</h2>
            <p className="mt-0.5 mb-3 text-xs leading-relaxed text-[#6B7280]">{details.description}</p>
            <Form {...formProps} />
          </section>
        );
      })}
    </div>
  );
}
