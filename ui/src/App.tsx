import { Component, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Onboarding } from "./pages/Onboarding";
import { Chat } from "./pages/Chat";
import { Settings } from "./pages/Settings";
import { ToastContainer } from "./components/Toast";
import { GatewayProvider } from "./hooks/GatewayContext";
import { useConfig } from "./hooks/useConfig";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[口袋龙虾] Uncaught error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
          <p className="text-lg font-medium text-gray-700">出错了，请刷新页面重试</p>
          <button
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireConfig({ children }: { children: React.ReactNode }) {
  const { loading, isConfigured } = useConfig();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }
  if (!isConfigured) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <GatewayProvider>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/settings" element={<Settings />} />
          <Route
            path="/*"
            element={
              <RequireConfig>
                <Chat />
              </RequireConfig>
            }
          />
        </Routes>
        <ToastContainer />
      </GatewayProvider>
    </ErrorBoundary>
  );
}
