import useMockFamilyRegistry from '../../hooks/useMockFamilyRegistry';
import { saveMockPatient } from '../../services/mockFamilyRegistry';
import { RegistrationForm } from '../bhc/AddPatient';

export default function PrototypeRegistration(props) {
  const registry=useMockFamilyRegistry();
  return <RegistrationForm {...props} registry={registry} savePatient={saveMockPatient} />;
}
