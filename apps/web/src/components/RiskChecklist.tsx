import React, { useState } from 'react';
import { recordOutcome } from '../lib/api';

interface RiskChecklistProps {
  shipmentId?: string;
  onOutcomeRecorded?: () => void;
}

export const RiskChecklist: React.FC<RiskChecklistProps> = ({ shipmentId = 'MSKU1234567', onOutcomeRecorded }) => {
  const [recorded, setRecorded] = useState(false);

  const handleRecordOutcome = async () => {
    // TODO (Frontend Owner): Trigger record outcome when user approves drafted action fix
    await recordOutcome({
      shipment_id: shipmentId,
      actual_outcome: { status: 'passed', resolved_discrepancy: true }
    });
    setRecorded(true);
    if (onOutcomeRecorded) onOutcomeRecorded();
  };

  return (
    <div className="p-6 rounded-xl border border-slate-700 bg-slate-900 text-white space-y-4">
      <h3 className="text-lg font-bold">2. Risk Checklist & Drafted Action Stub</h3>
      <p className="text-xs text-slate-400">
        Displays 4-item compliance checklist (Docs verified, HS code, Duty, CoO), AI reasoning, drafted action, and Approve & Send button.
      </p>

      <div className="p-4 rounded bg-slate-950 border border-amber-500/30 text-amber-300 text-xs space-y-2">
        <p className="font-bold">⚠️ High Risk (Score: 0.75): Unit Mismatch Detected</p>
        <p>AI Reasoning: Invoice lists 500 units, Packing List lists 480 units.</p>
      </div>

      <button
        onClick={handleRecordOutcome}
        className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm transition-colors"
      >
        {recorded ? '✓ Outcome Recorded (Immune Memory Updated)' : 'Approve & Send Fix (POST /record-outcome)'}
      </button>
    </div>
  );
};
