import axios from 'axios';

const BASE = 'http://localhost:8000';

// ─── Auth instance: /api/users/* ───
const authApi = axios.create({
  baseURL: `${BASE}/api/users`,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Main instance: /api/* (areas, scoring, market) ───
const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Profile instance: /api/profile/* ───
const profileApi = axios.create({
  baseURL: `${BASE}/api/profile`,
  headers: { 'Content-Type': 'application/json' },
});

// JWT interceptors on all instances
const attachJwt = (config: any) => {
  const token = localStorage.getItem('avenir_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};
api.interceptors.request.use(attachJwt);
authApi.interceptors.request.use(attachJwt);
profileApi.interceptors.request.use(attachJwt);

// 401 global redirect
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('avenir_token');
      localStorage.removeItem('avenir_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
export { profileApi };

// ─── Auth ───────────────────────────────────────────────────────────────────

export const loginUser = (email: string, password: string) =>
  authApi.post('/login', { email, password });

export const registerUser = (name: string, email: string, password: string) =>
  authApi.post('/register', { name, email, password });

/** Sign in / register via Google OAuth access_token (implicit flow) */
export const googleLogin = (token: string) =>
  authApi.post('/google-login', { token });

/** Verify email address after registration (uses query params per backend spec) */
export const verifyEmail = (email: string, otp_code: string) =>
  authApi.post(`/verify-email?email=${encodeURIComponent(email)}&otp_code=${encodeURIComponent(otp_code)}`);

/** Verify 2FA OTP after login (uses query params per backend spec) */
export const verifyLoginOtp = (email: string, otp_code: string) =>
  authApi.post(`/verify-login-otp?email=${encodeURIComponent(email)}&otp_code=${encodeURIComponent(otp_code)}`);

/** Resend email-verification OTP */
export const resendVerification = (email: string) =>
  authApi.post(`/resend-verification?email=${encodeURIComponent(email)}`);

/** Step 1 of password reset: send OTP to email */
export const forgotPassword = (email: string) =>
  authApi.post('/forgot-password', { email });

/** Step 2 of password reset: verify OTP and set new password */
export const resetPasswordOtp = (email: string, otp_code: string, new_password: string) =>
  authApi.post('/reset-password-otp', { email, otp_code, new_password });

export const resetPassword = (token: string, new_password: string) =>
  authApi.post('/reset-password', { token, new_password });
/** Enable Two-Factor Authentication for the current user */
export const enable2FA = () => authApi.post('/enable-2fa');

/** Disable Two-Factor Authentication for the current user */
export const disable2FA = () => authApi.post('/disable-2fa');
// ─── Profile ────────────────────────────────────────────────────────────────

export const getProfile = () => profileApi.get('/');

export const createProfile = (data: {
  has_children?: boolean;
  relies_on_public_transport?: boolean;
  prefers_vibrant_lifestyle?: boolean;
  safety_priority?: boolean;
  profile_picture?: string;
}) => profileApi.post('/', data);

export const updateProfile = (data: {
  has_children?: boolean;
  relies_on_public_transport?: boolean;
  prefers_vibrant_lifestyle?: boolean;
  safety_priority?: boolean;
  profile_picture?: string;
}) => profileApi.put('/', data);

export const changePassword = (current_password: string, new_password: string) =>
  profileApi.post('/change-password', { current_password, new_password });

// ─── Areas ──────────────────────────────────────────────────────────────────

export const getAreas = () => api.get('/areas');
export const getArea = (id: number) => api.get(`/areas/${id}`);

// ─── Infrastructure ──────────────────────────────────────────────────────────

export const getCustomInfrastructureLocations = () => api.get('/areas/infrastructure/custom');
export const streamAreaInfrastructure = (id: number) => api.get(`/areas/${id}/infrastructure/stream`);
export const getAreaStatus = (id: number) => api.get(`/areas/${id}/status`);
export const triggerInfrastructureFetch = (id: number) => api.post(`/areas/${id}/infrastructure/fetch`);
export const getAreaInfrastructure = (id: number) => api.get(`/areas/${id}/infrastructure`);
export const getAreaInfrastructureLocations = (id: number) => api.get(`/areas/${id}/infrastructure/locations`);

// ─── Scoring ────────────────────────────────────────────────────────────────

export const getCustomScore = (lat: number, lon: number) =>
  api.get('/areas/score/custom', { params: { lat, lon } });

export const getAIRecommendation = (data: {
  locality_name: string;
  final_score: number;
  category_scores: Record<string, number>;
  infrastructure: Record<string, number>;
  profile_context: Record<string, unknown> | null;
  lat?: number | null;
  lon?: number | null;
}) => api.post('/areas/score/recommend', data);

export const getAreaScore = (id: number) => api.get(`/areas/${id}/score`);

// ─── Market Data ────────────────────────────────────────────────────────────

export const getMarketListings = (area?: string) =>
  api.get('/market/listings', { params: area ? { area } : {} });

export const getMarketAreas = () => api.get('/market/areas');

export const getMarketSummary = (area?: string) =>
  api.get('/market/summary', { params: area ? { area } : {} });

export const compareMarketAreas = (area1: string, area2: string) =>
  api.get('/market/compare', { params: { area1, area2 } });

// ─── Map View ────────────────────────────────────────────────────────────────

/** Fetch all 13 amenity category counts for the map view (radius fixed to 2000 m server-side) */
export const getMapViewData = (lat: number, lon: number) =>
  api.post('/map-view/data', { lat, lon });

// ─── Health ────────────────────────────────────────────────────────────────

export const getHealth = () => axios.get(`${BASE}/health`);
