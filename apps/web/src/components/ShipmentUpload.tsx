import React, { useState } from 'react';
import { simulateShipment } from '../lib/api';

interface ShipmentUploadProps {
  onSimulateComplete?: (result: any) => void;
}

export const ShipmentUpload: React.FC<ShipmentUploadProps> = ({ onSimulateComplete }) => {
  const [shipmentId, setShipmentId] = useState('MSKU1234567');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSimulate = async () => {
    setLoading(true);
    // TODO (Frontend Owner): Collect 4 document uploads (Commercial Invoice, Packing List, BOL, Certificate of Origin)
    const res = await simulateShipment({
      shipment_id: shipmentId,
      documents: { invoice: "INV_SAMPLE.pdf", packing_list: "PL_SAMPLE.pdf" }
    });
    setResult(res);
    setLoading(false);
    if (onSimulateComplete) onSimulateComplete(res);
  };

  return (
    <div className="p-6 rounded-xl border border-slate-700 bg-slate-900 text-white space-y-4">
      <h3 className="text-lg font-bold">1. Shipment & Document Upload Stub</h3>
      <p className="text-xs text-slate-400">
        Upload 4 document types (Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin) and trigger risk simulation.
      </p>

      <div className="flex items-center space-x-3">
        <input
          type="text"
          value={shipmentId}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShipmentId(e.target.value)}
          className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm font-mono text-white"
          placeholder="Shipment ID"
        />

        <button
          onClick={handleSimulate}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition-colors"
        >
          {loading ? 'Simulating Risk...' : 'Run Simulation (POST /simulate)'}
        </button>
      </div>

      {result && (
        <pre className="p-3 rounded bg-slate-950 text-xs font-mono text-emerald-400 overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};
