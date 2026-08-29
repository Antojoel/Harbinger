import React, { useState } from 'react';
import { ShipmentUpload } from './components/ShipmentUpload';
import { RiskChecklist } from './components/RiskChecklist';
import { GraphVisualization } from './components/GraphVisualization';
import { VoiceWidget } from './components/VoiceWidget';
import { PricingCheckout } from './components/PricingCheckout';

export function App() {
  const [currentShipment, setCurrentShipment] = useState<string>('MSKU1234567');
  const [refreshGraphKey, setRefreshGraphKey] = useState<number>(0);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-6 max-w-6xl mx-auto font-sans">
      
      {/* Header */}
      <header className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">ClearanceGuard Monorepo App</h1>
          <p className="text-xs text-slate-400">AI Customs Risk Agent • FastAPI + Neo4j + MCP + React</p>
        </div>
        <div className="text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
          Docker Compose Mesh Active
        </div>
      </header>

      {/* Grid of 5 Component Stubs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <ShipmentUpload
          onSimulateComplete={(res: any) => {
            if (res?.shipment_id) setCurrentShipment(res.shipment_id);
          }}
        />

        <RiskChecklist
          shipmentId={currentShipment}
          onOutcomeRecorded={() => setRefreshGraphKey((prev: number) => prev + 1)}
        />

        <div className="md:col-span-2">
          <GraphVisualization key={refreshGraphKey} />
        </div>

        <VoiceWidget />

        <PricingCheckout />

      </div>

      <footer className="pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
        ClearanceGuard Hackathon Scaffold • Run <code className="text-slate-300">docker-compose up</code> from repo root
      </footer>

    </div>
  );
}

export default App;
