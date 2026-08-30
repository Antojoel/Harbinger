import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "harbinger_session_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const client = axios.create({ baseURL: API });

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  config: () => client.get("/config").then((r) => r.data),
  stats: () => client.get("/stats").then((r) => r.data),
  activity: (days = 7) => client.get("/activity", { params: { days } }).then((r) => r.data),
  patterns: (params = {}) => client.get("/patterns", { params }).then((r) => r.data),
  shipments: (params = {}) => client.get("/shipments", { params }).then((r) => r.data),
  shipment: (id) => client.get(`/shipments/${id}`).then((r) => r.data),
  createShipment: (payload) => client.post("/shipments", payload).then((r) => r.data),
  createShipmentFromDocuments: (payload) =>
    client.post("/shipments/from-documents", payload).then((r) => r.data),
  simulate: (shipment_id) => client.post("/simulate", { shipment_id }).then((r) => r.data),
  approveFix: (shipment_id, fix_id) =>
    client.post("/approve-fix", { shipment_id, fix_id }).then((r) => r.data),
  outcome: (shipment_id, actual_result, reason = "") =>
    client.post("/outcome", { shipment_id, actual_result, reason }).then((r) => r.data),
  graph: () => client.get("/graph").then((r) => r.data),
  transcribe: (audio_base64) =>
    client.post("/transcribe", { audio_base64 }).then((r) => r.data),
  voice: (shipment_id, question, page) =>
    client.post("/voice", { shipment_id, question, page }).then((r) => r.data),
  pricing: () => client.get("/pricing").then((r) => r.data),
  order: (tier_id, shipment_id) =>
    client.post("/payments/order", { tier_id, shipment_id }).then((r) => r.data),
  verify: (payload) => client.post("/payments/verify", payload).then((r) => r.data),
  emailLog: () => client.get("/email/log").then((r) => r.data),
  sendEmail: (payload) => client.post("/email/send", payload).then((r) => r.data),
  integrations: () => client.get("/integrations").then((r) => r.data),
  voiceQuery: (shipment_id, audio_base64, provider, llm_provider) =>
    client
      .post("/voice-query", { shipment_id, audio_base64, provider, llm_provider })
      .then((r) => r.data),

  googleLogin: (id_token) => client.post("/auth/google", { id_token }).then((r) => r.data),
  guestLogin: () => client.post("/auth/guest").then((r) => r.data),
  me: () => client.get("/auth/me").then((r) => r.data),
  markOnboardingSeen: () => client.post("/auth/onboarding-seen").then((r) => r.data),
};

export const fmtINR = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN");
