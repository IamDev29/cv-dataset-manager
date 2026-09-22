import React from 'react';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulseDot?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
  neutral: {
    container: 'bg-[#14171C] text-[#8B93A1] border border-[#2A2F38]',
    dot: 'bg-[#8B93A1]',
  },
  primary: {
    container: 'bg-[#3DA9FC]/15 text-[#3DA9FC] border border-[#3DA9FC]/35 font-semibold',
    dot: 'bg-[#3DA9FC]',
  },
  success: {
    container: 'bg-[#00E5A3]/15 text-[#00E5A3] border border-[#00E5A3]/35 font-semibold',
    dot: 'bg-[#00E5A3]',
  },
  warning: {
    container: 'bg-[#FFB020]/15 text-[#FFB020] border border-[#FFB020]/35 font-semibold',
    dot: 'bg-[#FFB020]',
  },
  destructive: {
    container: 'bg-[#FF4D4D]/15 text-[#FF4D4D] border border-[#FF4D4D]/35 font-semibold',
    dot: 'bg-[#FF4D4D]',
  },
  outline: {
    container: 'bg-transparent text-[#8B93A1] border border-[#2A2F38]',
    dot: 'bg-[#8B93A1]',
  },
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[9px] px-1.5 py-0.5 rounded gap-1 tracking-wider',
  md: 'text-[10px] px-2 py-0.5 rounded-md gap-1.5 tracking-wider',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  pulseDot = false,
  icon,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const v = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center select-none font-mono uppercase transition-colors ${v.container} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.dot} ${
            pulseDot ? 'animate-pulse' : ''
          }`}
        />
      )}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children && <span className="truncate">{children}</span>}
    </span>
  );
}
