import React from 'react';
import {
  FolderPlus,
  Trash2,
  Search,
  Clock,
  FileImage,
  ArrowUpDown,
  Plus,
  X,
  Database,
  Grid,
  Layers,
  Tag,
  Loader2,
} from 'lucide-react';
import { Project } from '../../types';
import { Card, Button, Badge, StatTile } from '../ui';
import CornerBrackets from '../CornerBrackets';

export interface DashboardViewProps {
  projects: Project[];
  projectsLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: 'created-desc' | 'created-asc' | 'name-asc' | 'images-desc';
  setSortBy: (sort: 'created-desc' | 'created-asc' | 'name-asc' | 'images-desc') => void;
  onOpenCreateModal: () => void;
  onSelectProjectToDelete: (project: Project) => void;
  onSelectProject: (projectId: string) => void;
}

export default function DashboardView({
  projects,
  projectsLoading,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  onOpenCreateModal,
  onSelectProjectToDelete,
  onSelectProject,
}: DashboardViewProps) {
  // Aggregate Metrics
  const totalProjects = projects.length;
  const totalImages = projects.reduce((acc, p) => acc + (p.imageCount || 0), 0);

  // Filter and Sort Projects
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'created-desc') return b.createdAt - a.createdAt;
    if (sortBy === 'created-asc') return a.createdAt - b.createdAt;
    if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
    if (sortBy === 'images-desc') return (b.imageCount || 0) - (a.imageCount || 0);
    return 0;
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col space-y-8 animate-fadeIn" id="dashboard-view">
      {/* 1. Header Dashboard Metrics (StatTiles) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Total Projects"
          value={totalProjects}
          unit="workspaces"
          subtext="SQLite synchronized"
          icon={<Grid size={18} />}
          accent="primary"
        />

        <StatTile
          label="Total Images"
          value={totalImages}
          unit="files"
          subtext="All active workspaces"
          icon={<FileImage size={18} />}
          accent="primary"
        />

        <StatTile
          label="Storage Mode"
          value="SERVER"
          subtext="FastAPI + SQLite"
          icon={<Database size={18} />}
          accent="success"
        />
      </div>

      {/* 2. Controls & Actions Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1B1F26] border border-[#2A2F38] p-4 rounded-xl shadow-elevation-low">
        {/* Search */}
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B93A1]" size={16} />
          <input
            type="text"
            placeholder="Filter projects by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-[#2A2F38] rounded-lg text-sm bg-[#101317] text-[#E6E9EF] placeholder-[#5A6270] focus:bg-[#14171C] focus:outline-none focus:ring-2 focus:ring-[#3DA9FC] focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B93A1] hover:text-[#E6E9EF] p-0.5 rounded cursor-pointer"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sorter and Create Action */}
        <div className="flex items-center space-x-3 self-end md:self-auto">
          <div className="flex items-center space-x-2 border border-[#2A2F38] rounded-lg px-3 py-2 bg-[#101317] text-xs text-[#E6E9EF]">
            <ArrowUpDown size={14} className="text-[#8B93A1]" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent focus:outline-none text-[#E6E9EF] font-medium cursor-pointer"
            >
              <option value="created-desc" className="bg-[#181C22]">Newest First</option>
              <option value="created-asc" className="bg-[#181C22]">Oldest First</option>
              <option value="name-asc" className="bg-[#181C22]">Alphabetical</option>
              <option value="images-desc" className="bg-[#181C22]">Most Images</option>
            </select>
          </div>

          <Button
            variant="primary"
            onClick={onOpenCreateModal}
            leftIcon={<FolderPlus size={15} />}
            id="new-project-btn"
          >
            New Project
          </Button>
        </div>
      </div>

      {/* 3. Projects Grid */}
      {projectsLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#8B93A1] space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#3DA9FC]" />
          <span className="text-xs font-mono">Loading projects from server...</span>
        </div>
      ) : sortedProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {sortedProjects.map((project) => {
            const projectClasses = project.classes || [];
            const hasClasses = projectClasses.length > 0;

            return (
              <Card
                key={project.id}
                elevation="low"
                interactive
                onClick={() => onSelectProject(project.id)}
                id={`project-card-${project.id}`}
                className="h-full flex flex-col justify-between overflow-hidden group cursor-pointer transition-all duration-200"
              >
                <CornerBrackets />

                {/* Card Top Banner with Subtle Visual Motif */}
                <div className="h-24 bg-[#14171C]/90 border-b border-[#2A2F38]/60 p-4 flex items-end justify-between relative overflow-hidden shrink-0">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-transform duration-300 pointer-events-none">
                    <Layers size={96} />
                  </div>

                  {/* Image Count Pill */}
                  <div className="flex items-center space-x-2 bg-[#1B1F26] px-2.5 py-1 rounded-md border border-[#2A2F38] shadow-xs">
                    <FileImage size={13} className="text-[#3DA9FC]" />
                    <span className="font-mono text-xs font-semibold text-[#E6E9EF] font-mono-numbers">
                      {project.imageCount || 0} images
                    </span>
                  </div>

                  {/* Monospace Project ID */}
                  <span className="font-mono text-[9px] text-[#8B93A1] tracking-wider uppercase bg-[#14171C] px-2 py-0.5 rounded border border-[#2A2F38]">
                    ID: {project.id.slice(0, 10)}
                  </span>
                </div>

                {/* Card Body with Equal-Height Flex Layout */}
                <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div>
                      <h3 className="font-sans font-semibold text-lg text-[#E6E9EF] group-hover:text-[#3DA9FC] transition-colors line-clamp-1">
                        {project.name}
                      </h3>
                      <div className="flex items-center space-x-1.5 text-[#8B93A1] mt-1 font-sans">
                        <Clock size={12} />
                        <span className="text-xs">Created {formatDate(project.createdAt)}</span>
                      </div>
                    </div>

                    {/* Class Color Indicators */}
                    <div className="pt-2">
                      {hasClasses ? (
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="text-[10px] font-mono text-[#8B93A1] uppercase tracking-wider mr-1">
                            Classes:
                          </span>
                          {projectClasses.slice(0, 6).map((cls) => (
                            <span
                              key={cls.id}
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#14171C] border border-[#2A2F38] text-[10px] font-medium"
                              title={cls.name}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: cls.color }}
                              />
                              <span className="text-[#E6E9EF] truncate max-w-[80px]">{cls.name}</span>
                            </span>
                          ))}
                          {projectClasses.length > 6 && (
                            <span className="text-[10px] font-mono text-[#8B93A1] bg-[#14171C] px-1.5 py-0.5 rounded border border-[#2A2F38]">
                              +{projectClasses.length - 6}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 text-[11px] text-[#5A6270] italic">
                          <Tag size={11} />
                          <span>No classes defined yet</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#2A2F38]/80 shrink-0">
                    <span className="text-xs text-[#8B93A1] font-medium group-hover:text-[#3DA9FC] transition-colors flex items-center gap-1">
                      Open Workspace <span>&rarr;</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProjectToDelete(project);
                      }}
                      className="p-1.5 rounded-md hover:bg-red-950/30 text-[#8B93A1] hover:text-[#FF4D4D] transition-colors cursor-pointer"
                      title="Delete Project"
                      aria-label="Delete Project"
                      id={`delete-btn-${project.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-16 bg-[#1B1F26] border border-dashed border-[#2A2F38] rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#14171C] border border-[#2A2F38] flex items-center justify-center mx-auto text-[#8B93A1]">
            <Grid size={20} />
          </div>
          <div>
            <h3 className="font-sans font-semibold text-base text-[#E6E9EF]">
              {searchQuery ? 'No matching projects found' : 'No projects yet'}
            </h3>
            <p className="text-xs text-[#8B93A1] max-w-sm mx-auto mt-1">
              {searchQuery
                ? 'No projects match your filter query. Try searching with a different name or keyword.'
                : 'Create your very first computer vision project to start tagging and collecting images.'}
            </p>
          </div>
          {!searchQuery && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenCreateModal}
              leftIcon={<Plus size={14} />}
            >
              Create Project
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
