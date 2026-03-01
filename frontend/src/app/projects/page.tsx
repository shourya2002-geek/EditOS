'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Plus, FolderOpen, Film, Clock, MoreVertical, Search,
  Upload, Trash2, ArrowUpRight,
} from 'lucide-react';

interface ProjectRecord {
  id: string;
  name: string;
  status: string;
  platform?: string;
  createdAt: number;
  updatedAt: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');


  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await api.listProjects();
      setProjects(data.projects ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await api.createProject({ name: newName });
      setNewName('');
      setShowCreate(false);
      loadProjects();
    } catch (err) {
      console.error(err);
    }
  };



  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-white/40 mt-1">Manage your video editing projects</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-md animate-slide-in space-y-4">
            <h2 className="text-lg font-semibold">Create Project</h2>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Project Name</label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Awesome Edit"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleCreate} className="btn-primary flex-1">
                Create
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-16 text-center">
          <FolderOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white/60">No projects yet</h3>
          <p className="text-sm text-white/30 mt-1 mb-6">
            Create your first project to start editing with AI
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Create First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/editor/${project.id}`}
              className="card-hover p-5 group"
            >
              {/* Thumbnail placeholder */}
              <div className="aspect-video rounded-lg bg-surface-3 mb-4 flex items-center justify-center overflow-hidden relative">
                <Film className="w-8 h-8 text-white/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-1/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                  <span className="text-xs font-medium text-white/80 flex items-center gap-1">
                    Open Editor <ArrowUpRight className="w-3 h-3" />
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{project.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-white/30">
                      {timeAgo(project.createdAt)}
                    </span>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full mt-1.5 ${
                  project.status === 'published' ? 'bg-emerald-400' :
                  project.status === 'rendering' ? 'bg-amber-400 animate-pulse' :
                  'bg-white/20'
                }`} />
              </div>
            </Link>
          ))}
        </div>
      )}
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
