import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { RegistrationForm } from "../bhc/AddPatient";
import { createPatient, updatePatient, getPatientById } from "../../services/patientService";
import { householdRegistry } from "../../utils/householdData";
import { queryKeys } from "../../utils/queryKeys";

export default function RhuPatientRegistration(props) {
  return <RegistrationSource key={props.patientId || "new"} {...props} />;
}

function RegistrationSource({ patientId, ...props }) {
  const client = useQueryClient();
  const patient = useQuery({
    queryKey: [...queryKeys.patientDetails("rhu", patientId), "registration"],
    queryFn: () => getPatientById(patientId),
    enabled: Boolean(patientId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const saved = patient.data || undefined;
  const registry = householdRegistry([], saved);
  const mutation = useMutation({
    mutationFn: ({ id, data }) => (id ? updatePatient(id, data) : createPatient(data)),
  });

  async function save(data, _connection, id) {
    const payload = { ...data };
    delete payload.household;
    delete payload.head_replacement;
    const response = await mutation.mutateAsync({ id, data: payload });
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.patients("rhu") }),
      client.invalidateQueries({ queryKey: queryKeys.patientDetails("rhu", response?.id || id) }),
    ]);
    return response;
  }

  const waiting = Boolean(patientId) && patient.isPending;
  const error = Boolean(patientId) && !patient.data && patient.error;
  if (waiting || error) {
    return (
      <DashboardLayout role="rhu" title="Patient Registration">
        <div className="space-y-3 py-8">
          <p role={error ? "alert" : "status"}>
            {error ? "Unable to load registration details. Please retry." : "Loading registration details…"}
          </p>
          {error && <Button onClick={() => patient.refetch()}>Retry</Button>}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <RegistrationForm
      {...props}
      role="rhu"
      basePath="/rhu"
      patientId={patientId}
      registry={registry}
      savedPatientOverride={saved}
      savePatient={save}
      live
      householdEnabled={false}
    />
  );
}
