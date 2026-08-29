import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GraphProvider } from "@/context/GraphContext";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import ShipmentDetail from "@/pages/ShipmentDetail";
import Pricing from "@/pages/Pricing";
import EmailPage from "@/pages/EmailPage";
import Integrations from "@/pages/Integrations";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <GraphProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shipment/:id" element={<ShipmentDetail />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/email" element={<EmailPage />} />
              <Route path="/integrations" element={<Integrations />} />
            </Routes>
          </Layout>
          <Toaster position="top-right" richColors />
        </GraphProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
