'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  FolderOpen,
  Film,
  Layers,
  User,
  FlaskConical,
  Settings,
  Zap,
  Mic,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/editor/new', label: 'Editor', icon: Film },
  { href: '/render', label: 'Render Queue', icon: Layers },
  { href: '/profile', label: 'Creator Profile', icon: User },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-3 left-3 z-[60] p-2 rounded-lg bg-surface-2 border border-surface-4/50 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-white/70" />
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed left-0 top-0 bottom-0 w-64 bg-surface-1 border-r border-surface-4/50 flex flex-col z-[80] transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        )}
      >
        {/* Close button (mobile) */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-3 text-white/40 lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">VIRCUT</h1>
            <p className="text-[10px] font-medium tracking-widest text-brand-300 uppercase">Engine</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-brand-500/10 text-brand-300 border border-brand-500/20'
                    : 'text-white/50 hover:text-white/80 hover:bg-surface-3 border border-transparent'
                )}
              >
                <Icon className={clsx('w-4.5 h-4.5', isActive ? 'text-brand-400' : 'text-white/40')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Voice Status */}
        <div className="mx-3 mb-3 p-3 rounded-xl bg-surface-2 border border-surface-4/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-white/70">Voice Ready</span>
          </div>
          {pathname.startsWith('/editor/') && pathname !== '/editor/new' ? (
            <p className="text-[10px] text-white/40 text-center">Use the toolbar above to start a voice session</p>
          ) : (
            <button
              onClick={() => router.push('/projects')}
              className="btn-primary w-full text-xs py-2"
            >
              <Mic className="w-3.5 h-3.5" />
              Start Voice Session
            </button>
          )}
        </div>

        {/* Settings */}
        <div className="px-3 pb-4">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-surface-3 transition-all"
          >
            <Settings className="w-4.5 h-4.5" />
            Settings
          </Link>
        </div>
      </aside>
    </>
  );
}
