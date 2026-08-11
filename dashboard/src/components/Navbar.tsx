import { NavLink } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-1.5 rounded-control text-label hover:text-heading hover:bg-surface-2 transition-colors"
    >
      {isDark ? (
        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364 6.364-1.06-1.06M6.697 6.697l-1.06-1.06m12.727 0-1.06 1.06M6.697 17.303l-1.06 1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
    </button>
  );
}

export function Navbar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-1.5 rounded-pill transition-colors ${
      isActive
        ? 'bg-surface dark:bg-surface-2 text-heading shadow-sm dark:shadow-none'
        : 'text-label hover:text-heading hover:bg-surface-2'
    }`;

  return (
    <nav className="bg-base dark:bg-surface border-b border-subtle sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/15 text-accent">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <span className="font-semibold text-heading">Job Search Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>Dashboard</NavLink>
          <NavLink to="/all-jobs" className={linkClass}>All jobs</NavLink>
          <NavLink to="/saved-jobs" className={linkClass}>Saved</NavLink>
          <NavLink to="/applications" className={linkClass}>Applications</NavLink>
          <NavLink to="/runs" className={linkClass}>Run history</NavLink>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-subtle" />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
