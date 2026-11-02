import axios from "axios";

/** Shared HTTP boundary between the browser client and the Kenora API. */
export const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

/** Root API health lives outside the versioned API prefix. */
export const apiHealthUrl = `${API.replace(/\/api\/v1\/?$/, "")}/health`;
