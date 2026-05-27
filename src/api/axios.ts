import axios from "axios";
import { useAuthStore } from "../store/auth.store";

const railwayBaseURL = "https://restaurantposbackend-production.up.railway.app/api";
const baseURL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "https://restaurantposbackend-production.up.railway.app/api")
  : railwayBaseURL;

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let hasHandledUnauthorized = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");

    if (status === 401 && !hasHandledUnauthorized && !url.includes("/auth/login")) {
      hasHandledUnauthorized = true;
      useAuthStore.getState().logout();

      if (window.location.pathname !== "/") {
        window.location.assign("/");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
