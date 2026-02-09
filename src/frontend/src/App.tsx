import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardView } from './views/DashboardView';
import { CaptainView } from './views/CaptainView';
import { TaskDetailView } from './views/TaskDetailView';
import { RefineryView } from './views/RefineryView';
import { ArtifactsView } from './views/ArtifactsView';
import { ChangeRequestsView } from './views/ChangeRequestsView';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardView />} />
        <Route path="/captain/:runId" element={<CaptainView />} />
        <Route path="/tasks/:runId/:taskId" element={<TaskDetailView />} />
        <Route path="/refinery/:runId/:taskId" element={<RefineryView />} />
        <Route path="/artifacts/:runId" element={<ArtifactsView />} />
        <Route path="/change-requests/:runId" element={<ChangeRequestsView />} />
        
        {/* Redirects for convenient access during dev */}
        <Route path="/captain" element={<Navigate to="/captain/current" replace />} />
        <Route path="/artifacts" element={<Navigate to="/artifacts/current" replace />} />
        <Route path="/change-requests" element={<Navigate to="/change-requests/current" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
