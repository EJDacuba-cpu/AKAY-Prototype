/** The password rules shown beside a new-password field; the server enforces the same ones. */
export function passwordRules(password = "") {
  const value = String(password ?? "");
  return [
    { key: "length", label: "At least 8 characters", met: value.length >= 8 },
    { key: "case", label: "Upper and lower case", met: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { key: "number", label: "At least one number", met: /\d/.test(value) },
  ];
}

export function meetsPasswordRules(password = "") {
  return passwordRules(password).every((rule) => rule.met);
}
