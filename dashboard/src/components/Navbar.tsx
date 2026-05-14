import { NavLink } from 'react-router-dom';

export function Navbar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <span className="font-bold text-gray-900">Job Search Agent</span>
        <div className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>Dashboard</NavLink>
          <NavLink to="/all-jobs" className={linkClass}>All Jobs</NavLink>
          <NavLink to="/saved-jobs" className={linkClass}>Saved</NavLink>
          <NavLink to="/applications" className={linkClass}>Applications</NavLink>
        </div>
      </div>
    </nav>
  );
}
