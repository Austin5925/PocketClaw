import { Routes, Route } from "react-router-dom";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Settings } from "./pages/Settings";
import { ToastContainer } from "./components/Toast";
import { GatewayProvider } from "./hooks/GatewayContext";

export function App() {
  return (
    <GatewayProvider>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/*" element={<Chat />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <ToastContainer />
    </GatewayProvider>
  );
}
