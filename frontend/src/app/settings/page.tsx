'use client';

import { useState } from 'react';
import { Settings, Save, Server, Key, Cpu, Palette, Bell, Globe } from 'lucide-react';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');

  const sections = [
    { key: 'general', label: 'General', icon: Settings },
    { key: 'api', label: 'API & Models', icon: Key },
    { key: 'render', label: 'Rendering', icon: Cpu },
    { key: 'appearance', label: 'Appearance', icon: Palette },
    { key: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex gap-6">
        {/* Nav */}
        <div className="w-48 shrink-0 space-y-1">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSection === s.key
                  ? 'bg-brand-500/10 text-brand-300'
                  : 'text-white/50 hover:text-white/70 hover:bg-surface-3'
              }`}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeSection === 'general' && (
            <div className="card p-6 space-y-5">
              <h2 className="text-lg font-semibold">General Settings</h2>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Backend URL</label>
                <input className="input" defaultValue="http://localhost:3000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Default Platform</label>
                <select className="input">
                  <option value="instagram_reels">Instagram Reels</option>
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="twitter">X (Twitter)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Auto-save interval</label>
                <select className="input">
                  <option value="10">Every 10 seconds</option>
                  <option value="30">Every 30 seconds</option>
                  <option value="60">Every minute</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
              <button className="btn-primary">
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          )}

          {activeSection === 'api' && (
            <div className="card p-6 space-y-5">
              <h2 className="text-lg font-semibold">API & Model Configuration</h2>
              <div className="p-3 rounded-lg bg-surface-2 border border-surface-4/50 text-xs text-white/40">
                <Server className="w-4 h-4 inline mr-1.5 text-white/30" />
                These settings are configured on the backend via environment variables.
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Orchestrator', model: 'mistral-large-latest', role: 'Task routing & coordination' },
                  { label: 'Intent Interpreter', model: 'ministral-8b-latest', role: 'Creative intent parsing' },
                  { label: 'Strategy Compiler', model: 'ministral-8b-latest', role: 'Editing strategy generation' },
                  { label: 'Collaboration', model: 'ministral-8b-latest', role: 'Real-time collaboration AI' },
                  { label: 'Publishing', model: 'ministral-3b-latest', role: 'Platform optimization' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-surface-4/50">
                    <div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-white/30 block mt-0.5">{item.role}</span>
                    </div>
                    <span className="badge-brand font-mono text-[10px]">{item.model}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'render' && (
            <div className="card p-6 space-y-5">
              <h2 className="text-lg font-semibold">Rendering Settings</h2>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Worker Concurrency</label>
                <input className="input" type="number" defaultValue={2} min={1} max={8} />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">GPU Acceleration</label>
                <select className="input">
                  <option value="auto">Auto-detect</option>
                  <option value="nvidia">NVIDIA (NVENC)</option>
                  <option value="amd">AMD (AMF)</option>
                  <option value="intel">Intel (QSV)</option>
                  <option value="apple">Apple (VideoToolbox)</option>
                  <option value="none">CPU Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Default Output Quality</label>
                <select className="input">
                  <option value="high">High (1080p, 5Mbps)</option>
                  <option value="medium">Medium (720p, 3Mbps)</option>
                  <option value="low">Low (480p, 1.5Mbps)</option>
                </select>
              </div>
              <button className="btn-primary">
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="card p-6 space-y-5">
              <h2 className="text-lg font-semibold">Appearance</h2>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Theme</label>
                <div className="flex gap-3">
                  <button className="flex-1 card p-4 text-center border-brand-500/40 bg-brand-500/5">
                    <span className="text-sm font-medium">Dark</span>
                    <span className="text-xs text-white/30 block mt-0.5">Active</span>
                  </button>
                  <button className="flex-1 card p-4 text-center opacity-40 cursor-not-allowed">
                    <span className="text-sm font-medium">Light</span>
                    <span className="text-xs text-white/30 block mt-0.5">Coming soon</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Timeline Height</label>
                <select className="input">
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                  <option value="expanded">Expanded</option>
                </select>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="card p-6 space-y-5">
              <h2 className="text-lg font-semibold">Notifications</h2>
              {[
                { label: 'Render completion', desc: 'Notify when renders finish', defaultChecked: true },
                { label: 'Experiment results', desc: 'Notify when A/B tests reach significance', defaultChecked: true },
                { label: 'Collaboration updates', desc: 'Notify on shared project changes', defaultChecked: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-surface-4/50">
                  <div>
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs text-white/30 block mt-0.5">{item.desc}</span>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input type="checkbox" defaultChecked={item.defaultChecked} className="sr-only peer" />
                    <div className="w-9 h-5 bg-surface-4 rounded-full peer peer-checked:bg-brand-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
