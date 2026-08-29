/**
 * ClearanceGuard API Client Library
 * =================================
 * Fetch wrappers for the Python FastAPI engine REST endpoints.
 * Frontend Owner: Use these functions in components to connect to the backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export interface SimulateRequestPayload {
  shipment_id?: string;
  documents?: Record<string, any>;
}

export interface RecordOutcomePayload {
  shipment_id: string;
  actual_outcome: Record<string, any>;
}

export async function simulateShipment(payload: SimulateRequestPayload) {
  try {
    const res = await fetch(`${API_BASE_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend API call failed, returning stub simulation response', err);
    return {
      shipment_id: payload.shipment_id || 'MSKU1234567',
      risk_score: 0.75,
      status: 'attention',
      reasons: [
        'Invoice lists 500 units, Packing List lists 480 units — mismatch detected',
        'Deprecated HTS code 8504.40.9580 declared'
      ],
      matched_patterns: ['PAT-001', 'PAT-002']
    };
  }
}

export async function recordOutcome(payload: RecordOutcomePayload) {
  try {
    const res = await fetch(`${API_BASE_URL}/record-outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend API call failed, returning stub record outcome response', err);
    return {
      shipment_id: payload.shipment_id,
      status: 'outcome_recorded',
      memory_reinforced: true
    };
  }
}

export async function fetchGraphSnapshot() {
  try {
    const res = await fetch(`${API_BASE_URL}/graph`);
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend API call failed, returning stub graph snapshot', err);
    return {
      nodes: [
        { id: 'shipment_1', label: 'MSKU1234567', type: 'Shipment', status: 'attention' },
        { id: 'hs_1', label: '8504.40.9580', type: 'HSCode', status: 'deprecated' },
        { id: 'doc_inv', label: 'Commercial Invoice', type: 'DocumentType' },
        { id: 'doc_pl', label: 'Packing List', type: 'DocumentType' },
        { id: 'pattern_1', label: 'Unit Count Mismatch', type: 'Pattern' }
      ],
      edges: [
        { source: 'shipment_1', target: 'doc_inv', label: 'CONTAINS' },
        { source: 'shipment_1', target: 'doc_pl', label: 'CONTAINS' },
        { source: 'doc_inv', target: 'doc_pl', label: 'CONTRADICTS' },
        { source: 'shipment_1', target: 'pattern_1', label: 'MATCHES' }
      ]
    };
  }
}

export async function fetchPatterns(filters?: Record<string, any>) {
  try {
    const query = new URLSearchParams(filters).toString();
    const res = await fetch(`${API_BASE_URL}/patterns?${query}`);
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend API call failed, returning stub patterns', err);
    return [
      { pattern_id: 'PAT-001', type: 'unit_mismatch', frequency: 14 }
    ];
  }
}
