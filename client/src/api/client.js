import axios from 'axios';

/**
 * Single Axios instance for the whole app.
 * - Same-origin "/api" by default (Vite proxy in dev, Vercel rewrite in prod) so the
 *   httpOnly session cookie is first-party. No token is ever stored in JS.
 * - Responses are unwrapped to the API envelope: { success, data, meta }.
 * - Errors are normalised to ApiError with status, code, message and field details.
 */
export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** { "body.email": "message" } → { email: "message" } for form fields. */
  fieldErrors() {
    const out = {};
    for (const d of this.details ?? []) {
      const key = String(d.field).replace(/^(body|query|params)\./, '');
      if (!out[key]) out[key] = d.message;
    }
    return out;
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  timeout: 20000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response) {
      const body = err.response.data ?? {};
      const e = body.error ?? {};
      const apiErr = new ApiError({
        status: err.response.status,
        code: e.code ?? 'HTTP_ERROR',
        message: e.message ?? `Request failed (${err.response.status})`,
        details: e.details,
      });
      if (err.response.status === 401 && !String(err.config?.url).startsWith('/auth/')) {
        window.dispatchEvent(new CustomEvent('hp:unauthorized'));
      }
      return Promise.reject(apiErr);
    }
    const message = err.code === 'ECONNABORTED' ? 'The server took too long to respond. Please try again.' : 'Cannot reach the HotelPro server. Check your connection and try again.';
    return Promise.reject(new ApiError({ status: 0, code: 'NETWORK', message }));
  }
);

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  return err?.message || fallback;
}

/** Drops empty values so they are not sent as query parameters. */
export function cleanParams(params) {
  return Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

export default api;
