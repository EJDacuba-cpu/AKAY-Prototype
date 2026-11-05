import { useNavigate } from "react-router";

import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";
import WalkInCheckInPanel from "./WalkInCheckInPanel";

/**
 * Queue entry for walk-in check-in. Search, confirm, and register live in the shared panel.
 * This shell stays until Today's Queue drops the walk-in CTA.
 */
export default function WalkInCheckInModal({ onClose, registerPath }) {
  const navigate = useNavigate();

  return (
    <ModalShell
      title="Check in walk-in patient"
      subtitle="Search first, so a returning patient keeps one record."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(registerPath)}>
            Register new patient
          </Button>
        </>
      }
    >
      <WalkInCheckInPanel registerPath={registerPath} onCheckedIn={onClose} />
    </ModalShell>
  );
}
