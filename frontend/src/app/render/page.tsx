'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRenderProgress } from '@/lib/websocket';
import {
  Layers, Clock, Cpu, HardDrive, CheckCircle2, XCircle,
  AlertCircle, Loader2, Play, Pause, Trash2, RefreshCw,
} from 'lucide-react';

interface RenderJobRecord {
  id: string;
  projectId: string;
  status: string;
  progress: number;
  priority: string;
  createdAt: number;
  metadata: {
    estimatedDurationMs: number;
    useGpu: boolean;
  };
}

export default function RenderPage() {
  const [jobs, setJobs] = useState<RenderJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const renderProgress = useRenderProgress();

  useEffect(() => {
    loadJobs();
    renderProgress.connect();
    return () => renderProgress.disconnect();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await api.listRenderJobs();
      setJobs(data.queue ?? data.jobs ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="w-4 h-4 text-white/40" />;
      case 'processing': return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
      case 'rendering': return <Cpu className="w-4 h-4 text-brand-400 animate-pulse" />;
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <AlertCircle className="w-4 h-4 text-white/30" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued': return 'badge bg-white/5 text-white/50 border border-white/10';
      case 'processing': return 'badge-amber';
      case 'rendering': return 'badge-brand';
      case 'completed': return 'badge-green';
      case 'failed': return 'badge-red';
      default: return 'badge bg-white/5 text-white/40';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-400';
      case 'high': return 'text-amber-400';
      case 'normal': return 'text-white/60';
      case 'draft': return 'text-white/30';
      default: return 'text-white/40';
    }
  };

  const activeJobs = jobs.filter((j) => ['processing', 'rendering'].includes(j.status));
  const queuedJobs = jobs.filter((j) => j.status === 'queued');
  const completedJobs = jobs.filter((j) => ['completed', 'failed'].includes(j.status));

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Render Queue</h1>
          <p className="text-sm text-white/40 mt-1">Monitor and manage video rendering jobs</p>
        </div>
        <button onClick={loadJobs} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-white/30" />
            <span className="text-xs text-white/40">Total Jobs</span>
          </div>
          <p className="text-xl font-bold">{jobs.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-brand-400" />
            <span className="text-xs text-white/40">Active</span>
          </div>
          <p className="text-xl font-bold text-brand-300">{activeJobs.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-white/40">Queued</span>
          </div>
          <p className="text-xl font-bold text-amber-300">{queuedJobs.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-white/40">Completed</span>
          </div>
          <p className="text-xl font-bold text-emerald-300">{completedJobs.length}</p>
        </div>
      </div>

      {/* Active Renders */}
      {activeJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white/70 mb-3">Active Renders</h2>
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const wsProgress = renderProgress.jobs.get(job.id);
              const progress = wsProgress?.progress ?? job.progress;
              return (
                <div key={job.id} className="card p-4 border-brand-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <span className="text-sm font-medium font-mono">{job.id}</span>
                        <span className="text-xs text-white/30 ml-2">Project: {job.projectId}</span>
                      </div>
                    </div>
                    <span className={getStatusBadge(job.status)}>{job.status}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-cyan transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-white/40">{progress.toFixed(1)}%</span>
                    <div className="flex items-center gap-3 text-xs text-white/30">
                      {job.metadata.useGpu && (
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> GPU
                        </span>
                      )}
                      <span>~{Math.round(job.metadata.estimatedDurationMs / 1000)}s est.</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job List */}
      <div>
        <h2 className="text-sm font-semibold text-white/70 mb-3">All Jobs</h2>
        {loading ? (
          <div className="card p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="card p-12 text-center">
            <Layers className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">No render jobs yet</p>
            <p className="text-xs text-white/25 mt-1">Generate and apply a strategy to start rendering</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-4/50">
                  <th className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider px-4 py-3">Job ID</th>
                  <th className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider px-4 py-3">Priority</th>
                  <th className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider px-4 py-3">Progress</th>
                  <th className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-surface-4/20 hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-white/70">{job.id.slice(0, 20)}...</td>
                    <td className="px-4 py-3">
                      <span className={getStatusBadge(job.status)}>{job.status}</span>
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${getPriorityColor(job.priority)}`}>
                      {job.priority}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/40">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/30">{timeAgo(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
