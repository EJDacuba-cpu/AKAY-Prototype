import { validateApiBaseUrl } from "../../config/environment";

export const API_BASE_URL = validateApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  { isProduction: import.meta.env.PROD },
);
