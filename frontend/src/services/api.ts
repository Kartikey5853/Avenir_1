import axios from 'axios';

const BASE = 'http://localhost:8000';

// ─── Auth instance: /api/users/* ───
const authApi = axios.create({
  baseURL: `${BASE}/api/users`,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Main instance: /api/* (areas, profile, scoring, market) ───
const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// JWT interceptors on both instances
const attachJwt = (config: any) => {
  const token = localStorage.getItem('avenir_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};
api.interceptors.request.use(attachJwt);
authApi.interceptors.request.use(attachJwt);

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

// ─── Auth ───────────────────────────────────────────────────────────────────

export const loginUser = (email: string, password: string) =>
  authApi.post('/login', { email, password });

export const registerUser = (name: string, email: string, password: string) =>
  authApi.post('/register', { name, email, password });

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

// ─── Profile ────────────────────────────────────────────────────────────────

export const getProfile = () => api.get('/users/profile');

export const createProfile = (data: {
  marital_status: string;
  has_parents: boolean;
  employment_status: string;
  income_range?: string;
  additional_info?: string;
  has_vehicle?: boolean;
  has_elderly?: boolean;
  has_children?: boolean;
  profile_picture?: string;
}) => api.post('/users/profile', data);

export const updateProfile = (data: {
  marital_status?: string;
  has_parents?: boolean;
  employment_status?: string;
  income_range?: string;
  additional_info?: string;
  has_vehicle?: boolean;
  has_elderly?: boolean;
  has_children?: boolean;
  profile_picture?: string;
}) => api.put('/users/profile', data);

export const changePassword = (current_password: string, new_password: string) =>
  api.post('/users/profile/change-password', { current_password, new_password });

// ─── Areas ──────────────────────────────────────────────────────────────────

export const getAreas = () => api.get('/areas');
export const getArea = (id: number) => api.get(`/areas/${id}`);

// ─── Infrastructure ──────────────────────────────────────────────────────────

export const getAreaInfrastructure = (id: number) => api.get(`/areas/${id}/infrastructure`);
export const getAreaInfrastructureLocations = (id: number) =>
  api.get(`/areas/${id}/infrastructure/locations`);

// ─── Scoring ────────────────────────────────────────────────────────────────

export const getAreaScore = (id: number) => api.get(`/areas/${id}/score`);
export const getCustomScore = (lat: number, lon: number, radius: number) =>
  api.get('/areas/score/custom', { params: { lat, lon, radius } });

export const getAIRecommendation = (data: {
  locality_name: string;
  final_score: number;
  category_scores: Record<string, number>;
  infrastructure: Record<string, number>;
  profile_context: Record<string, unknown> | null;
}) => api.post('/areas/score/recommend', data);

// ─── Market Data ────────────────────────────────────────────────────────────

export const getMarketListings = (area?: string) =>
  api.get('/market/listings', { params: area ? { area } : {} });

export const getMarketAreas = () => api.get('/market/areas');

export const getMarketSummary = (area?: string) =>
  api.get('/market/summary', { params: area ? { area } : {} });

export const compareMarketAreas = (area1: string, area2: string) =>
  api.get('/market/compare', { params: { area1, area2 } });
