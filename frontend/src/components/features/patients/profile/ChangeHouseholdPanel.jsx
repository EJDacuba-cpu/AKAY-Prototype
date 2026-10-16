import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import ModalShell from "../../../common/modals/ModalShell";
import { Button } from "../../../ui/button";
import FamilyRegistryField from "../FamilyRegistryField";
import useBhcHouseholdScope from "../../../../hooks/useBhcHouseholdScope";
import useHouseholdSearch from "../../../../hooks/useHouseholdSearch";
import { changePatientHousehold, getHouseholdById } from "../../../../services/householdService";
import { connectionForPatient, householdForConnection, patientName, validateConnection, validateHeadReplacement } from "../../../../services/familyRegistry";
import { householdRegistry, normalizeHouseholdPatient, registrationErrors } from "../../../../utils/householdData";
import { changeHouseholdPayload, isUnchangedHousehold } from "../../../../utils/changeHousehold";
import { isAcceptedLabel } from "../../../../utils/relationshipLabels";
import { queryKeys } from "../../../../utils/queryKeys";

// Moves one patient to another existing household. It sends only the household command, so the patient's
// identity and clinical information are untouched, and the address follows the new household on the server.
export default function ChangeHouseholdPanel({ patient, onClose }) {
  const scope = useBhcHouseholdScope();
  const client = useQueryClient();
  const subject = useMemo(() => normalizeHouseholdPatient(patient), [patient]);
  const saved = useMemo(() => connectionForPatient(subject), [subject]);
  const current = useQuery({ queryKey: [...scope.key, "detail", subject.householdId], queryFn: () => getHouseholdById(subject.householdId), enabled: Boolean(subject.householdId), retry: false });
  const lookup = useHouseholdSearch(scope);
  const registry = useMemo(() => householdRegistry([...lookup.results, current.data], subject), [lookup.results, current.data, subject]);
  const [connection, setConnection] = useState(null);
  const [headReplacement, setHeadReplacement] = useState(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: () => changePatientHousehold(subject.id, changeHouseholdPayload(connection, registry, headReplacement)),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.patientDetails("bhc", subject.id) }),
        client.invalidateQueries({ queryKey: queryKeys.patients("bhc") }),
        client.invalidateQueries({ queryKey: scope.key }),
      ]);
      toast.success("Household changed.");
      onClose();
    },
    onError: (error) => {
      if (error.status === 409) setErrors({ household: "This household changed. Close this window, reopen it, and try again." });
      else {
        const mapped = registrationErrors(error);
        setErrors({ household: mapped.familySerialNumber, relationship: mapped.relationshipToHouseholdHead, form: mapped.form });
        if (!mapped.familySerialNumber && !mapped.relationshipToHouseholdHead) setErrors({ household: Object.values(mapped)[0] });
      }
    },
  });

  const target = householdForConnection(registry, connection);
  const currentSerial = saved ? householdForConnection(registry, saved)?.serialNumber || subject.familySerialNumber : "";
  const unchanged = isUnchangedHousehold(connection, saved);

  function submit() {
    if (!connection || mutation.isPending) return;
    const problems = { ...validateConnection(registry, connection, subject.id, undefined, isAcceptedLabel), ...validateHeadReplacement(registry, subject.id, connection, headReplacement, isAcceptedLabel) };
    if (Object.keys(problems).length) {
      setErrors({ household: problems.household || problems.serialNumber || problems.headPatientId, relationship: problems.relationship });
      return;
    }
    setErrors({});
    mutation.mutate();
  }

  return <ModalShell title="Change Household" size="lg" onClose={() => !mutation.isPending && onClose()} closeDisabled={mutation.isPending}
    footer={<>
      <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
      <Button type="button" disabled={!connection || reviewPending || unchanged || mutation.isPending} onClick={submit}>{mutation.isPending ? "Saving…" : "Save Household Change"}</Button>
    </>}>
    <div className="space-y-4 text-sm text-gray-950">
      <p className="text-gray-600">Move {patientName(subject)} to another household. Their name, birth date, and clinical records are not changed. The address follows the new household.</p>
      <FamilyRegistryField live allowCreate={false} registry={registry} patient={subject}
        connection={connection} savedConnection={saved} headReplacement={headReplacement}
        onChange={(next, replacement) => { setConnection(next); setHeadReplacement(replacement || null); setErrors({}); }}
        onPendingChange={setReviewPending} error={errors.household || errors.form} relationshipError={errors.relationship}
        onSearch={lookup.search} searchResults={lookup.results} searchLoading={lookup.loading} searchError={lookup.error}
        refreshError={Boolean(current.error)} onRefresh={() => current.refetch()} />
      {connection && target && !reviewPending && !unchanged && <p role="status" className="text-xs text-gray-600">
        {currentSerial ? `${patientName(subject)} will move from ${currentSerial} to ${target.serialNumber}.` : `${patientName(subject)} will join ${target.serialNumber}.`}
      </p>}
      {unchanged && <p role="status" className="text-xs text-gray-600">This is already the patient&apos;s household and relationship.</p>}
    </div>
  </ModalShell>;
}
