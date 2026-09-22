import React from 'react';
import CornerBrackets from '../CornerBrackets';

export type StatTileAccent = 'neutral' | 'primary' | 'success' | 'warning';

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon?: React.ReactNode;
  accent?: StatTileAccent;
  withBrackets?: boolean;
  activeBracket?: boolean;
  className?: string;
}

const accentColors: Record<StatTileAccent, { text: string; iconBg: string; border: string }> = {
  neutral: {
    text: 'text-[#E6E9EF]',
    iconBg: 'text-[#8B93A1] bg-[#14171C] border-[#2A2F38]',
    border: 'slate',
  },
  primary: {
    text: 'text-[#E6E9EF]',
    iconBg: 'text-[#3DA9FC] bg-[#3DA9FC]/10 border-[#3DA9FC]/30',
    border: 'blue',
  },
  success: {
    text: 'text-[#E6E9EF]',
    iconBg: 'text-[#00E5A3] bg-[#00E5A3]/10 border-[#00E5A3]/30',
    border: 'blue',
  },
  warning: {
    text: 'text-[#E6E9EF]',
    iconBg: 'text-[#FFB020] bg-[#FFB020]/10 border-[#FFB020]/30',
    border: 'amber',
  },
};

export function StatTile({
  label,
  value,
  unit,
  subtext,
  icon,
  accent = 'primary',
  withBrackets = true,
  activeBracket,
  className = '',
}: StatTileProps) {
  const a = accentColors[accent];

  return (
    <div
      className={`group/bracket relative bg-[#1B1F26] border border-[#2A2F38] p-5 rounded-xl flex items-center justify-between shadow-elevation-low hover:border-[#3DA9FC]/40 transition-all duration-150 ${className}`}
    >
      {withBrackets && (
        <CornerBrackets
          color={a.border as 'blue' | 'amber' | 'slate'}
          active={activeBracket}
        />
      )}

      <div className="space-y-1 z-1">
        <p className="font-mono text-xs text-[#8B93A1] tracking-wider uppercase">
          {label}
        </p>
        <div className="flex items-baseline space-x-1.5">
          <p className="text-3xl font-bold tracking-tight text-[#E6E9EF] font-mono font-mono-numbers">
            {value}
          </p>
          {unit && (
            <span className="text-xs text-[#8B93A1] font-mono">{unit}</span>
          )}
        </div>
        {subtext && (
          <p className="text-[11px] text-[#8B93A1]/80 font-sans">{subtext}</p>
        )}
      </div>

      {icon && (
        <div
          className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 z-1 ${a.iconBg}`}
        >
          {icon}
        </div>
      )}
    </div>
  );
}
