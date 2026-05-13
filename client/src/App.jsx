import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import MiltonWidget from './components/MiltonWidget.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import EscalationWatcher from './components/EscalationWatcher.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Calls from './pages/Calls.jsx';
import AgentConfig from './pages/AgentConfig.jsx';
import Subscribers from './pages/Subscribers.jsx';
import Appointments from './pages/Appointments.jsx';
import Emails from './pages/Emails.jsx';
import Setup from './pages/Setup.jsx';
import Profile from './pages/Profile.jsx';
import Escalations from './pages/Escalations.jsx';
import TaxDocs from './pages/TaxDocs.jsx';
import Milton from './pages/Milton.jsx';
import ClientUpload from './pages/ClientUpload.jsx';
import AdminPanel from './pages/admin/AdminPanel.jsx';
import TeamMembers from './pages/admin/TeamMembers.jsx';
import RolesMatrix from './pages/admin/RolesMatrix.jsx';
import ActivityLog from './pages/admin/ActivityLog.jsx';
import TaskBoard from './pages/admin/TaskBoard.jsx';
import CollaborationHub from './pages/admin/CollaborationHub.jsx';
import SystemSettings from './pages/admin/SystemSettings.jsx';

function ProtectedLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </div>
      <ErrorBoundary>
        <MiltonWidget />
      </ErrorBoundary>
      <ErrorBoundary>
        <EscalationWatcher />
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public — no auth, no layout */}
      <Route path="/upload/:token" element={<ClientUpload />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="calls" element={<Calls />} />
        <Route path="agent" element={<AgentConfig />} />
        <Route path="subscribers" element={<Subscribers />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="emails" element={<Emails />} />
        <Route path="escalations" element={<Escalations />} />
        <Route path="taxdocs" element={<TaxDocs />} />
        <Route path="milton" element={<Milton />} />
        <Route path="profile" element={<Profile />} />
        <Route path="setup" element={<Setup />} />
        <Route path="admin" element={<AdminPanel />}>
          <Route path="team" element={<TeamMembers />} />
          <Route path="roles" element={<RolesMatrix />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="tasks" element={<TaskBoard />} />
          <Route path="collaboration" element={<CollaborationHub />} />
          <Route path="settings" element={<SystemSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
