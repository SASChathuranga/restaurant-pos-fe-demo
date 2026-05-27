import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import Sidebar from './Sidebar';

type LayoutContextValue = {
  hasSidebar: boolean;
  isMobileSidebarOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout() {
  return useContext(LayoutContext);
}

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isEmbedded =
    new URLSearchParams(location.search).get('embedded') === '1' ||
    (typeof window !== 'undefined' && window.self !== window.top);

  // ⚠️ useMemo MUST be called before any early return (Rules of Hooks)
  const layoutContextValue = useMemo<LayoutContextValue>(() => {
    const hasSidebar = !isEmbedded;
    return {
      hasSidebar,
      isMobileSidebarOpen: hasSidebar ? isMobileSidebarOpen : false,
      openMobileSidebar: () => setIsMobileSidebarOpen(true),
      closeMobileSidebar: () => setIsMobileSidebarOpen(false),
      toggleMobileSidebar: () => setIsMobileSidebarOpen((open) => !open),
    };
  }, [isEmbedded, isMobileSidebarOpen]);

  // Guard: redirect to login if not authenticated
  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (isEmbedded) {
    return (
      <LayoutContext.Provider value={layoutContextValue}>
        <div className="h-screen bg-slate-50">
          <main className="h-screen overflow-auto">
            {children}
          </main>
        </div>
      </LayoutContext.Provider>
    );
  }

  return (
    <LayoutContext.Provider value={layoutContextValue}>
      <div className="flex h-screen bg-slate-50">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile sidebar */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 h-full w-full bg-slate-900/50"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="relative h-full w-64">
              <Sidebar onNavigate={() => setIsMobileSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </LayoutContext.Provider>
  );
}

export default Layout;

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const layout = useLayout();

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {layout?.hasSidebar && (
            <button
              type="button"
              aria-label="Open sidebar"
              onClick={layout.toggleMobileSidebar}
              className="mt-0.5 inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}

          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-900">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-slate-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export function PageContent({ children, className = '' }: PageContentProps) {
  return <div className={`p-4 sm:p-6 ${className}`}>{children}</div>;
}
