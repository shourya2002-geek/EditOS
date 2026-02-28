'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  FlaskConical, Plus, Play, Pause, CheckCircle2,
  BarChart3, TrendingUp, Users, Trophy, RefreshCw,
} from 'lucide-react';

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadExperiments();
  }, []);

  const loadExperiments = async () => {
    try {
      const data = await api.listExperiments();
      setExperiments(data.experiments ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await api.createExperiment({
        name: newName,
        variants: [
          { name: 'Control', config: {} },
          { name: 'Variant A', config: { pacingMultiplier: 1.2 } },
        ],
      });
      setNewName('');
      setShowCreate(false);
      loadExperiments();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="w-4 h-4 text-emerald-400" />;
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-brand-400" />;
      default: return <Pause className="w-4 h-4 text-white/30" />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A/B Experiments</h1>
          <p className="text-sm text-white/40 mt-1">
            Test editing strategies against each other with statistical rigor (Welch&apos;s t-test)
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadExperiments} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Experiment
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-md animate-slide-in space-y-4">
            <h2 className="text-lg font-semibold">Create Experiment</h2>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Experiment Name</label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Fast cuts vs. smooth transitions"
                autoFocus
              />
            </div>
            <div className="p-3 rounded-lg bg-surface-2 border border-surface-4/50">
              <p className="text-xs text-white/50 mb-2">Default variants:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-white/70">Control — baseline editing strategy</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-brand-400" />
                  <span className="text-white/70">Variant A — 1.2x pacing multiplier</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleCreate} className="btn-primary flex-1">Create</button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="text-xl font-bold">{experiments.length}</p>
            <p className="text-xs text-white/40">Total Experiments</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Play className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xl font-bold">{experiments.filter(e => e.status === 'running').length}</p>
            <p className="text-xs text-white/40">Running</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xl font-bold">{experiments.filter(e => e.winnerVariantId).length}</p>
            <p className="text-xs text-white/40">Winners Found</p>
          </div>
        </div>
      </div>

      {/* Experiment List */}
      {loading ? (
        <div className="card p-12 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="card p-16 text-center">
          <FlaskConical className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white/60">No experiments yet</h3>
          <p className="text-sm text-white/30 mt-1 mb-6">
            Create your first A/B test to optimize editing strategies
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Create First Experiment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <div key={exp.id} className="card-hover p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(exp.status)}
                  <div>
                    <h3 className="font-semibold">{exp.name}</h3>
                    <p className="text-xs text-white/30 font-mono mt-0.5">{exp.id}</p>
                  </div>
                </div>
                <span className={
                  exp.status === 'running' ? 'badge-green' :
                  exp.status === 'completed' ? 'badge-brand' :
                  'badge bg-white/5 text-white/40 border border-white/10'
                }>
                  {exp.status}
                </span>
              </div>

              {/* Variants */}
              {exp.variants && (
                <div className="grid grid-cols-2 gap-3">
                  {exp.variants.map((v: any, i: number) => (
                    <div
                      key={v.id || i}
                      className={`p-3 rounded-lg border ${
                        v.id === exp.winnerVariantId
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-surface-2 border-surface-4/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium">{v.name}</span>
                        {v.id === exp.winnerVariantId && (
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] text-white/30 block">Impressions</span>
                          <span className="text-xs font-medium">{v.impressions ?? 0}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/30 block">Conversions</span>
                          <span className="text-xs font-medium">{v.conversions ?? 0}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/30 block">Rate</span>
                          <span className="text-xs font-medium">{((v.conversionRate ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {exp.confidenceLevel != null && (
                <div className="mt-3 pt-3 border-t border-surface-4/30 flex items-center justify-between">
                  <span className="text-xs text-white/40">Statistical confidence</span>
                  <span className={`text-xs font-medium ${
                    exp.confidenceLevel >= 0.95 ? 'text-emerald-400' :
                    exp.confidenceLevel >= 0.90 ? 'text-amber-400' : 'text-white/50'
                  }`}>
                    {(exp.confidenceLevel * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
