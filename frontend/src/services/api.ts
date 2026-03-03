import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('avenir_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('avenir_token');
      localStorage.removeItem('avenir_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ───
export const loginUser = (email: string, password: string) =>
  api.post('/login', { email, password });

export const registerUser = (name: string, email: string, password: string) =>
  api.post('/register', { name, email, password });

export const forgotPassword = (email: string) =>
  api.post('/forgot-password', { email });

export const resetPassword = (token: string, new_password: string) =>
  api.post('/reset-password', { token, new_password });

// ─── Profile ───
export const getProfile = () => api.get('/profile');

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
}) => api.post('/profile', data);

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
}) => api.put('/profile', data);

export const changePassword = (current_password: string, new_password: string) =>
  api.post('/profile/change-password', { current_password, new_password });

// ─── Areas ───
export const getAreas = () => api.get('/areas');
export const getArea = (id: number) => api.get(`/areas/${id}`);

// ─── Infrastructure ───
export const getAreaInfrastructure = (id: number) => api.get(`/areas/${id}/infrastructure`);
export const getAreaInfrastructureLocations = (id: number) => api.get(`/areas/${id}/infrastructure/locations`);

// ─── Scoring ───
export const getAreaScore = (id: number) => api.get(`/areas/${id}/score`);
export const getCustomScore = (lat: number, lon: number, radius: number) =>
  api.get(`/areas/score/custom`, { params: { lat, lon, radius } });

export const getAIRecommendation = (data: {
  locality_name: string;
  final_score: number;
  category_scores: Record<string, number>;
  infrastructure: Record<string, number>;
  profile_context: Record<string, unknown> | null;
}) => api.post('/areas/score/recommend', data);

// ─── Market Data ───
export const getMarketListings = (area?: string) =>
  api.get('/market/listings', { params: area ? { area } : {} });

export const getMarketAreas = () => api.get('/market/areas');

export const getMarketSummary = (area?: string) =>
  api.get('/market/summary', { params: area ? { area } : {} });

export const compareMarketAreas = (area1: string, area2: string) =>
  api.get('/market/compare', { params: { area1, area2 } });
