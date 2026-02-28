'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  User, TrendingUp, Zap, BarChart3, Target,
  Film, Music, Type, Palette, RefreshCw,
} from 'lucide-react';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const [p, a] = await Promise.allSettled([
        api.getCreatorProfile('dev-creator'),
        api.getCreatorAnalytics('dev-creator'),
      ]);
      if (p.status === 'fulfilled') setProfile(p.value);
      if (a.status === 'fulfilled') setAnalytics(a.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Creator Profile</h1>
          <p className="text-sm text-white/40 mt-1">Your editing style DNA — the learning moat that gets smarter over time</p>
        </div>
        <button onClick={loadProfile} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Profile Card */}
      <div className="card p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center text-2xl font-bold shadow-lg shadow-brand-500/20">
            V
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">VIRCUT Creator</h2>
            <p className="text-sm text-white/40 mt-0.5">Creator ID: dev-creator</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="badge-brand">AI-Enhanced</span>
              <span className="badge-green">Learning Active</span>
              <span className="badge-cyan">Style Indexed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Style Preferences Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StyleCard
          icon={Zap}
          title="Pacing"
          value={profile?.pacing?.preferredStyle ?? 'Adaptive'}
          description="Average cut interval and energy curve preferences"
          details={[
            { label: 'Cut Interval', value: profile?.pacing?.avgCutInterval ?? '2.5s' },
            { label: 'Energy Curve', value: profile?.pacing?.energyCurve ?? 'rising' },
            { label: 'Rhythm', value: profile?.pacing?.rhythm ?? 'on-beat' },
          ]}
          color="brand"
        />
        <StyleCard
          icon={Type}
          title="Captions"
          value={profile?.captions?.style ?? 'Bold'}
          description="Caption style, animation, and placement preferences"
          details={[
            { label: 'Style', value: profile?.captions?.preferredStyle ?? 'word-by-word' },
            { label: 'Font Size', value: profile?.captions?.fontSize ?? 'large' },
            { label: 'Position', value: profile?.captions?.position ?? 'center' },
          ]}
          color="amber"
        />
        <StyleCard
          icon={Palette}
          title="Visual Style"
          value={profile?.visual?.style ?? 'Dynamic'}
          description="Zoom patterns, transitions, and color preferences"
          details={[
            { label: 'Transitions', value: profile?.visual?.transitions ?? 'hard cut' },
            { label: 'Zoom', value: profile?.visual?.zoom ?? 'subtle' },
            { label: 'Color Grade', value: profile?.visual?.color ?? 'vibrant' },
          ]}
          color="cyan"
        />
        <StyleCard
          icon={Music}
          title="Audio Style"
          value={profile?.audio?.style ?? 'Music-driven'}
          description="Music selection, ducking, and SFX preferences"
          details={[
            { label: 'Music Pref', value: profile?.audio?.musicPref ?? 'electronic' },
            { label: 'SFX Usage', value: profile?.audio?.sfx ?? 'moderate' },
            { label: 'Ducking', value: profile?.audio?.ducking ?? 'auto' },
          ]}
          color="green"
        />
      </div>

      {/* Performance Metrics */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Avg. Retention"
            value={profile?.performance?.avgRetention ?? '72%'}
            trend="+3.2%"
            trendPositive
          />
          <MetricCard
            label="Engagement Rate"
            value={profile?.performance?.engagementRate ?? '8.5%'}
            trend="+1.1%"
            trendPositive
          />
          <MetricCard
            label="Edits Made"
            value={profile?.performance?.totalEdits ?? '0'}
            trend="—"
          />
          <MetricCard
            label="Style Confidence"
            value={profile?.performance?.styleConfidence ?? '85%'}
            trend="+5%"
            trendPositive
          />
        </div>
      </div>

      {/* Top Performing Traits */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Top Performing Traits</h2>
        <div className="card p-5">
          <div className="space-y-3">
            {(profile?.topTraits ?? [
              { trait: 'Fast-paced intros (< 1s hook)', score: 92 },
              { trait: 'Word-by-word caption animations', score: 88 },
              { trait: 'Bass-drop synced cuts', score: 85 },
              { trait: 'Zoom emphasis on key moments', score: 82 },
              { trait: 'Emotional arc — tension → release', score: 78 },
            ]).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-xs text-white/50 w-6 text-right">{i + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white/80">{item.trait}</span>
                    <span className="text-xs font-mono text-brand-300">{item.score}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-cyan"
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Preferred Platforms */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Platform Preferences</h2>
        <div className="grid grid-cols-5 gap-3">
          {[
            { name: 'TikTok', active: true, color: 'border-brand-500/40 bg-brand-500/10' },
            { name: 'YouTube Shorts', active: true, color: 'border-red-500/40 bg-red-500/10' },
            { name: 'Instagram Reels', active: false, color: '' },
            { name: 'YouTube', active: false, color: '' },
            { name: 'Twitter/X', active: false, color: '' },
          ].map((platform) => (
            <div
              key={platform.name}
              className={`card p-4 text-center ${
                platform.active
                  ? platform.color + ' border'
                  : 'opacity-40'
              }`}
            >
              <Film className="w-5 h-5 mx-auto mb-2 text-white/40" />
              <span className="text-xs font-medium">{platform.name}</span>
              {platform.active && (
                <span className="block text-[10px] text-emerald-400 mt-1">Active</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StyleCard({ icon: Icon, title, value, description, details, color }: {
  icon: any;
  title: string;
  value: string;
  description: string;
  details: Array<{ label: string; value: string }>;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${colorMap[color]} border flex items-center justify-center`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-white/40">{value}</p>
        </div>
      </div>
      <p className="text-xs text-white/30 mb-3">{description}</p>
      <div className="space-y-1.5">
        {details.map((detail) => (
          <div key={detail.label} className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">{detail.label}</span>
            <span className="text-[10px] font-medium text-white/60">{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, trendPositive }: {
  label: string;
  value: string;
  trend: string;
  trendPositive?: boolean;
}) {
  return (
    <div className="card p-4">
      <span className="text-xs text-white/40 block mb-1">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-xl font-bold">{value}</span>
        <span className={`text-[10px] font-medium mb-0.5 ${
          trendPositive ? 'text-emerald-400' : 'text-white/30'
        }`}>
          {trend}
        </span>
      </div>
    </div>
  );
}
