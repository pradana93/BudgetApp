import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { SessionProvider } from "@/hooks/useSession";
import { ToastProvider } from "@/components/ui/toast";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Budgets from "@/pages/Budgets";
import BudgetDetail from "@/pages/BudgetDetail";
import Requests from "@/pages/Requests";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Notifications from "@/pages/Notifications";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export default function App(){
  return <QueryClientProvider client={qc}>
    <LanguageProvider>
    <SessionProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/budgets" element={<ProtectedRoute><Layout><Budgets /></Layout></ProtectedRoute>} />
            <Route path="/budgets/:id" element={<ProtectedRoute><Layout><BudgetDetail /></Layout></ProtectedRoute>} />
            <Route path="/requests" element={<ProtectedRoute><Layout><Requests /></Layout></ProtectedRoute>} />
            <Route path="/requests/new" element={<ProtectedRoute><Layout><NewRequest /></Layout></ProtectedRoute>} />
            <Route path="/requests/:id" element={<ProtectedRoute><Layout><RequestDetail /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute ownerOnly><Layout><Admin /></Layout></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </SessionProvider>
    </LanguageProvider>
  </QueryClientProvider>;
}
