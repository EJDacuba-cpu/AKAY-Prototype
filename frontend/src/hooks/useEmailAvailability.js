import { useCallback, useRef, useState } from "react";
import { apiRequest } from "../services/apiClient";
import { isValidEmail } from "../utils/accountForm";

/**
 * Asks the server whether an email belongs to another account (`ignoreId` is the account being edited).
 * Each address is asked once; a failed lookup is forgotten so the next blur or Save retries it.
 * `check(email)` resolves true (taken), false (free) or null (bad format, or the lookup failed).
 */
export default function useEmailAvailability({ ignoreId } = {}) {
  const lookups = useRef(new Map());
  const [taken, setTaken] = useState({});
  const [checking, setChecking] = useState(false);

  const check = useCallback(
    (value) => {
      const email = String(value || "").trim();
      const key = email.toLowerCase();
      if (!isValidEmail(email)) return Promise.resolve(null);

      if (!lookups.current.has(key)) {
        const query = new URLSearchParams({ email, ...(ignoreId ? { ignore: ignoreId } : {}) });
        lookups.current.set(
          key,
          apiRequest(`/users/email-available?${query}`)
            .then((result) => !result.available)
            .catch(() => null)
            .then((isTaken) => {
              if (isTaken === null) lookups.current.delete(key);
              else setTaken((map) => ({ ...map, [key]: isTaken }));
              return isTaken;
            }),
        );
      }
      return lookups.current.get(key);
    },
    [ignoreId],
  );

  const onBlur = useCallback(
    (value) => {
      setChecking(true);
      check(value).finally(() => setChecking(false));
    },
    [check],
  );

  const known = (value) => taken[String(value || "").trim().toLowerCase()];

  return { check, onBlur, checking, isTaken: (value) => known(value) === true, isFree: (value) => known(value) === false };
}
