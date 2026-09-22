import React from 'react';
import { ChevronRight, Database, ExternalLink } from 'lucide-react';
import { Badge, Button } from '../ui';
import BoxelLogo from '../BoxelLogo';

export interface TopBarProps {
  projectName?: string;
  projectId?: string;
  activeSectionTitle?: string;
  onOpenStyleGuide?: () => void;
  onNavigateHome?: () => void;
}

export default function TopBar({
  projectName,
  projectId,
  activeSectionTitle,
  onOpenStyleGuide,
  onNavigateHome,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 bg-[#1B1F26]/95 backdrop-blur-md border-b border-[#2A2F38] px-4 md:px-6 py-3 flex items-center justify-between shadow-elevation-low">
      {/* Left side: Breadcrumb & App Identity */}
      <div className="flex items-center space-x-2.5 overflow-hidden">
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex items-center space-x-2 text-[#E6E9EF] hover:text-[#3DA9FC] transition-colors cursor-pointer shrink-0"
        >
          <BoxelLogo size="sm" />
          <span className="font-sans font-bold text-sm tracking-tight hidden sm:inline-block">
            boxel<span className="text-[#3DA9FC] font-extrabold ml-0.5">.</span>
          </span>
        </button>

        {projectName ? (
          <>
            <ChevronRight size={14} className="text-[#5A6270] shrink-0" />
            <span className="font-mono text-xs text-[#8B93A1] uppercase tracking-wider hidden sm:inline-block shrink-0">
              Workspace
            </span>
            <ChevronRight size={14} className="text-[#5A6270] shrink-0 hidden sm:inline-block" />
            <div className="flex items-center space-x-2 min-w-0">
              <span className="font-sans font-semibold text-xs text-[#E6E9EF] truncate">
                {projectName}
              </span>
              {projectId && (
                <Badge variant="outline" size="sm" className="hidden md:inline-flex">
                  ID: {projectId.slice(0, 10)}
                </Badge>
              )}
            </div>
            {activeSectionTitle && (
              <>
                <ChevronRight size={14} className="text-[#5A6270] shrink-0 hidden lg:inline-block" />
                <span className="font-mono text-xs text-[#3DA9FC] font-medium uppercase tracking-wider hidden lg:inline-block shrink-0">
                  {activeSectionTitle}
                </span>
              </>
            )}
          </>
        ) : (
          <>
            <ChevronRight size={14} className="text-[#5A6270] shrink-0" />
            <span className="font-mono text-xs text-[#8B93A1] uppercase tracking-wider">
              Dashboard
            </span>
          </>
        )}
      </div>

      {/* Right side: Status badges & Style Guide */}
      <div className="flex items-center space-x-3 shrink-0">
        {onOpenStyleGuide && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenStyleGuide}
            className="text-xs"
            title="Open Design System Tokens & Style Guide"
          >
            <span className="hidden md:inline">Design System</span>
            <span className="md:hidden">Tokens</span>
          </Button>
        )}

        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#14171C] border border-[#2A2F38] text-[#8B93A1] font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E5A3]"></span>
          <span>Server Active</span>
        </div>

        <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#14171C] border border-[#2A2F38] text-[#8B93A1] font-mono text-[11px]">
          <Database size={12} className="text-[#3DA9FC]" />
          <span>SQLite</span>
        </div>
      </div>
    </header>
  );
}
