import { create } from "zustand";
import type { User } from "../types";

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),

  login: (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null });
  },

  setUser: (user) => {
    localStorage.setItem("user", JSON.stringify(user));
    set({ user });
  },

  hasPermission: (permission) => {
    const { user } = get();
    if (!user) return false;
    // Super admin has all permissions
    if (user.role?.name === 'SUPER_ADMIN') return true;
    return user.permissions?.includes(permission) || false;
  },

  hasAnyPermission: (permissions) => {
    const { user } = get();
    if (!user) return false;
    // Super admin has all permissions
    if (user.role?.name === 'SUPER_ADMIN') return true;
    return permissions.some(p => user.permissions?.includes(p)) || false;
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role?.name === 'SUPER_ADMIN' || user?.role?.name === 'ADMIN';
  }
}));