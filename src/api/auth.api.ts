import api from './axios';
import type { LoginResponse, User } from '../types';

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    return res.data;
  },

  demoLogin: async () => {
    const res = await api.post<LoginResponse>('/auth/demo-login');
    return res.data;
  },

  getMe: async () => {
    const res = await api.get<{ user: User }>('/auth/me');
    return res.data.user;
  },
};
