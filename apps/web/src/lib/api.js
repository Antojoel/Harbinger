import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const api = {
  config: () => client.get("/config").then((r) => r.data),
  stats: () => client.get("/stats").then((r) => r.data),
  shipments: (params = {}) => client.get("/shipments", { params }).then((r) => r.data),
  shipment: (id) => client.get(`/shipments/${id}`).then((r) => r.data),
  simulate: (shipment_id) => client.post("/simulate", { shipment_id }).then((r) => r.data),
  approveFix: (shipment_id, fix_id) =>
    client.post("/approve-fix", { shipment_id, fix_id }).then((r) => r.data),
  outcome: (shipment_id, actual_result, reason = "") =>
    client.post("/outcome", { shipment_id, actual_result, reason }).then((r) => r.data),
  graph: () => client.get("/graph").then((r) => r.data),
  voice: (shipment_id, question) =>
    client.post("/voice", { shipment_id, question }).then((r) => r.data),
  pricing: () => client.get("/pricing").then((r) => r.data),
  order: (tier_id, shipment_id) =>
    client.post("/payments/order", { tier_id, shipment_id }).then((r) => r.data),
  verify: (payload) => client.post("/payments/verify", payload).then((r) => r.data),
  emailLog: () => client.get("/email/log").then((r) => r.data),
  sendEmail: (payload) => client.post("/email/send", payload).then((r) => r.data),
  integrations: () => client.get("/integrations").then((r) => r.data),
};

export const fmtINR = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN");
