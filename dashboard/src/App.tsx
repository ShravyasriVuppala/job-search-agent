import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { JobDetail } from './pages/JobDetail';
import { Applications } from './pages/Applications';
import { AllJobs } from './pages/AllJobs';
import { SavedJobs } from './pages/SavedJobs';

function NotFound() {
  return (
    <div className="text-center py-24 text-gray-400">
      <p className="text-4xl font-bold mb-2">404</p>
      <p className="text-lg">Page not found</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/job/:jobId" element={<JobDetail />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/all-jobs" element={<AllJobs />} />
          <Route path="/saved-jobs" element={<SavedJobs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
