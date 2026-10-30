/**
 * Which live-validation icon a field shows. An error wins, even before the field was left;
 * a field whose rule needs the server (`confirmed: false`) is not valid until the server agrees.
 */
export function fieldState({ touched, error, checking, confirmed }) {
  if (error) return "invalid";
  if (checking) return "checking";
  if (touched && confirmed !== false) return "valid";
  return undefined;
}
