import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Calls from './pages/Calls.jsx';
import AgentConfig from './pages/AgentConfig.jsx';
import Subscribers from './pages/Subscribers.jsx';
import Appointments from './pages/Appointments.jsx';
import Emails from './pages/Emails.jsx';
import Setup from './pages/Setup.jsx';

function ProtectedLayout() {
  const token = localStorage.getItem('wbcpa_token');
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <Outlet />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="calls" element={<Calls />} />
        <Route path="agent" element={<AgentConfig />} />
        <Route path="subscribers" element={<Subscribers />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="emails" element={<Emails />} />
        <Route path="setup" element={<Setup />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
