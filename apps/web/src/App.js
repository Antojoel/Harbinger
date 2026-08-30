import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { GraphProvider } from "@/context/GraphContext";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import OnboardingTour from "@/components/OnboardingTour";
import Dashboard from "@/pages/Dashboard";
import ShipmentDetail from "@/pages/ShipmentDetail";
import Pricing from "@/pages/Pricing";
import EmailPage from "@/pages/EmailPage";
import Integrations from "@/pages/Integrations";
import { Loader2 } from "lucide-react";

// Auth gates the dashboard UI/onboarding experience only — the underlying
// REST API stays unauthenticated so MCP clients and other programmatic
// consumers aren't broken by a login wall. See routes.py's comment on this.
function AuthGate() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
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
      <OnboardingTour />
    </GraphProvider>
  );
}

function App() {
  return (
    <div className="App">
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <BrowserRouter>
          <AuthProvider>
            <AuthGate />
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
