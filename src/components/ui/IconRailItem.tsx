import React from 'react';

export interface IconRailItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  badgeCount?: number;
  shortcut?: string;
  compact?: boolean;
  className?: string;
  title?: string;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export function IconRailItem({
  icon,
  label,
  isActive = false,
  badgeCount,
  shortcut,
  compact = false,
  className = '',
  ...props
}: IconRailItemProps) {
  return (
    <button
      type="button"
      className={`group relative flex items-center w-full px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${
        isActive
          ? 'bg-[#3DA9FC]/15 text-[#3DA9FC] border border-[#3DA9FC]/30 shadow-glow-primary'
          : 'text-[#8B93A1] hover:text-[#E6E9EF] hover:bg-[#1B1F26] border border-transparent hover:border-[#2A2F38]'
      } ${className}`}
      {...props}
    >
      {/* Active left indicator accent bar */}
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#3DA9FC]" />
      )}

      <span className={`shrink-0 transition-transform duration-150 group-hover:scale-105 ${isActive ? 'text-[#3DA9FC]' : ''}`}>
        {icon}
      </span>

      {!compact && (
        <span className="ml-3 font-sans truncate font-medium flex-grow text-left">
          {label}
        </span>
      )}

      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ml-2 ${
            isActive
              ? 'bg-[#3DA9FC] text-[#14171C]'
              : 'bg-[#14171C] text-[#8B93A1] border border-[#2A2F38]'
          }`}
        >
          {badgeCount}
        </span>
      )}

      {shortcut && (
        <kbd className="hidden lg:inline-block ml-auto font-mono text-[9px] text-[#5A6270] bg-[#14171C] border border-[#2A2F38] px-1 py-0.2 rounded shadow-xs">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
