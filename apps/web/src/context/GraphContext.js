import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";

const GraphContext = createContext(null);

export const useGraph = () => useContext(GraphContext);

export const GraphProvider = ({ children }) => {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [newIds, setNewIds] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const g = await api.graph();
      setGraph(g);
    } catch (e) {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // called after recording an outcome: mark new ids, refresh, then clear highlight
  const markGrowth = useCallback(
    async (nodeIds = [], edgeIds = []) => {
      setNewIds({ nodes: nodeIds, edges: edgeIds });
      await refresh();
      setTimeout(() => setNewIds({ nodes: [], edges: [] }), 2600);
    },
    [refresh]
  );

  return (
    <GraphContext.Provider value={{ graph, newIds, loading, refresh, markGrowth }}>
      {children}
    </GraphContext.Provider>
  );
};
