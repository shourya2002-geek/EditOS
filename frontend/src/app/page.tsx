'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { HealthResponse } from '@/lib/types';
import {
  Film,
  Layers,
  Zap,
  TrendingUp,
  Clock,
  Plus,
  ArrowRight,
  Activity,
  Cpu,
  Brain,
  Mic,
  Sparkles,
} from 'lucide-react';

interface Stats {
  projects: number;
  sessions: number;
  renders: number;
  uptime: string;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<Stats>({ projects: 0, sessions: 0, renders: 0, uptime: '0s' });

  useEffect(() => {
    const load = async () => {
      try {
        const [h, p] = await Promise.all([
          api.health(),
          api.listProjects(),
        ]);
        setHealth(h);
        setStats((prev) => ({
          ...prev,
          projects: p.total,
          uptime: formatUptime(h.uptime),
        }));
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900/60 via-surface-1 to-surface-2 border border-brand-500/20 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-500/10 via-transparent to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-brand-400" />
            <span className="badge-brand">AI-Powered</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-accent-cyan">VIRCUT Engine</span>
          </h1>
          <p className="text-white/50 max-w-2xl text-sm leading-relaxed">
            Production-grade voice-enabled agentic AI video editor. Upload a video, describe your vision,
            and let our AI agents craft a professional edit with the instincts of a top 1% short-form editor.
          </p>
          <div className="flex gap-3 mt-6">
            <Link href="/projects" className="btn-primary">
              <Plus className="w-4 h-4" />
              New Project
            </Link>
            <Link href="/editor/new" className="btn-secondary">
              <Film className="w-4 h-4" />
              Open Editor
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Film}
          label="Projects"
          value={stats.projects.toString()}
          color="brand"
        />
        <StatCard
          icon={Layers}
          label="Render Queue"
          value={stats.renders.toString()}
          color="cyan"
        />
        <StatCard
          icon={Activity}
          label="Engine Status"
          value={health ? 'Online' : 'Offline'}
          color={health ? 'green' : 'red'}
        />
        <StatCard
          icon={Clock}
          label="Uptime"
          value={stats.uptime}
          color="amber"
        />
      </div>

      {/* Features Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Core Capabilities</h2>
        <div className="grid grid-cols-3 gap-4">
          <FeatureCard
            icon={Brain}
            title="Editing Brain"
            description="Hook detection, pacing optimization, caption generation, and visual composition powered by encoded heuristics."
            href="/editor/new"
          />
          <FeatureCard
            icon={Mic}
            title="Voice Pipeline"
            description="Real-time voice commands via WebSocket streaming. Describe edits naturally and watch them apply instantly."
            href="/editor/new"
          />
          <FeatureCard
            icon={Zap}
            title="Agent Architecture"
            description="5 specialized Mistral AI agents — orchestrator, intent, strategy, collaboration, and publishing."
            href="/experiments"
          />
          <FeatureCard
            icon={Cpu}
            title="GPU Render Engine"
            description="Hardware-accelerated FFmpeg pipeline with intelligent codec selection and multi-pass rendering."
            href="/render"
          />
          <FeatureCard
            icon={TrendingUp}
            title="Learning Moat"
            description="Builds creator style profiles over time. A/B testing engine optimizes edits for engagement."
            href="/profile"
          />
          <FeatureCard
            icon={Sparkles}
            title="Strategy DSL"
            description="Declarative editing language compiled from creative intent into executable timeline operations."
            href="/editor/new"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <QuickAction
            title="Generate Strategy from Intent"
            description="Type a creative prompt and get a full editing strategy"
            href="/editor/new"
          />
          <QuickAction
            title="View Render Queue"
            description="Monitor active renders and queue status"
            href="/render"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div className="card p-5">
      <div className={`w-10 h-10 rounded-lg ${colorMap[color]} border flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-white/40 mt-0.5">{label}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, href }: {
  icon: any;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className="card-hover p-5 group">
      <Icon className="w-5 h-5 text-brand-400 mb-3" />
      <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
      <p className="text-xs text-white/40 leading-relaxed">{description}</p>
      <div className="mt-3 flex items-center gap-1 text-xs text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity">
        Explore <ArrowRight className="w-3 h-3" />
      </div>
    </Link>
  );
}

function QuickAction({ title, description, href }: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className="card-hover p-5 flex items-center justify-between group">
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-white/40 mt-1">{description}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-brand-400 transition-colors" />
    </Link>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d`;
}
