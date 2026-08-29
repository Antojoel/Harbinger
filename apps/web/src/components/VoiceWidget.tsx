import React, { useState } from 'react';

export const VoiceWidget: React.FC = () => {
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState("What's blocking MSKU1234567?");
  const [response, setResponse] = useState("Shipment MSKU1234567 has a 20-unit mismatch between invoice and packing list.");

  return (
    <div className="p-6 rounded-xl border border-slate-700 bg-slate-900 text-white space-y-4">
      <h3 className="text-lg font-bold">4. Voice Query Widget Stub</h3>
      <p className="text-xs text-slate-400">
        Simulates Vertex AI voice interaction — mic input, transcript, and spoken customs query response.
      </p>

      <div className="flex items-center space-x-3">
        <button
          onClick={() => setActive(!active)}
          className={`px-4 py-2 rounded-full font-bold text-xs transition-all ${
            active ? 'bg-rose-600 text-white animate-pulse' : 'bg-brand-600 hover:bg-brand-500 text-white'
          }`}
        >
          {active ? '🎙️ Listening...' : '🎙️ Start Voice Query'}
        </button>

        {active && <span className="text-xs text-amber-400">Vertex AI Voice Stream Active</span>}
      </div>

      <div className="p-3 rounded bg-slate-950 text-xs space-y-2 font-mono">
        <p className="text-slate-400">User: "{transcript}"</p>
        <p className="text-emerald-400">Agent: "{response}"</p>
      </div>
    </div>
  );
};
