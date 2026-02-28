'use client';

import { Bell, Search, ChevronDown, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Header() {
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/health');
        if (res.ok) setServerStatus('connected');
        else setServerStatus('disconnected');
      } catch {
        setServerStatus('disconnected');
      }
    };
    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 border-b border-surface-4/50 bg-surface-1/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search projects, strategies..."
          className="input pl-10 py-2 text-sm bg-surface-2/50"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Server Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-surface-4/50">
          <Wifi className={`w-3.5 h-3.5 ${
            serverStatus === 'connected' ? 'text-emerald-400' :
            serverStatus === 'disconnected' ? 'text-red-400' :
            'text-amber-400 animate-pulse'
          }`} />
          <span className="text-xs font-medium text-white/60">
            {serverStatus === 'connected' ? 'Engine Online' :
             serverStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
          </span>
        </div>

        {/* Notifications */}
        <button className="relative btn-ghost p-2">
          <Bell className="w-4.5 h-4.5 text-white/50" />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-500 text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        </button>

        {/* Profile */}
        <button className="flex items-center gap-2 btn-ghost">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-accent-cyan flex items-center justify-center text-xs font-bold">
            V
          </div>
          <span className="text-sm font-medium text-white/80">Creator</span>
          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
        </button>
      </div>
    </header>
  );
}
