import React, { useEffect, useState } from 'react';
import { fetchGraphSnapshot } from '../lib/api';

export const GraphVisualization: React.FC = () => {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadGraph = async () => {
    setLoading(true);
    const data = await fetchGraphSnapshot();
    setGraphData(data);
    setLoading(false);
  };

  useEffect(() => {
    loadGraph();
  }, []);

  return (
    <div className="p-6 rounded-xl border border-slate-700 bg-slate-900 text-white space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">3. Neo4j Knowledge Graph Visualization Stub</h3>
          <p className="text-xs text-slate-400">
            Renders nodes & edges from GET /api/graph. Re-fetch after record-outcome to show memory growing!
          </p>
        </div>
        <button
          onClick={loadGraph}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
        >
          {loading ? 'Refreshing...' : 'Refresh Graph (GET /graph)'}
        </button>
      </div>

      {/* Graph Render Area Stub */}
      <div className="h-64 rounded bg-slate-950 border border-slate-800 flex items-center justify-center p-4">
        {graphData ? (
          <div className="text-center space-y-2">
            <p className="text-xs text-emerald-400 font-mono">
              Loaded {graphData.nodes?.length || 0} Nodes & {graphData.edges?.length || 0} Edges
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {graphData.nodes?.map((node: any) => (
                <span key={node.id} className="px-2.5 py-1 rounded-full bg-slate-800 text-[11px] font-mono border border-slate-700">
                  {node.label} ({node.type})
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Loading Neo4j Graph Snapshot...</p>
        )}
      </div>
    </div>
  );
};
