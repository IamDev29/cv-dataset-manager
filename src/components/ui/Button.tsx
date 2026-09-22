import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[#3DA9FC] hover:bg-[#2E98EB] active:bg-[#1D85D7] text-[#14171C] font-semibold shadow-elevation-low hover:shadow-glow-primary border border-[#3DA9FC]/20',
  secondary:
    'bg-[#1B1F26] hover:bg-[#222731] active:bg-[#181C22] text-[#E6E9EF] font-medium border border-[#2A2F38] hover:border-[#3DA9FC]/40 shadow-elevation-low',
  ghost:
    'bg-transparent hover:bg-[#1B1F26] active:bg-[#14171C] text-[#8B93A1] hover:text-[#E6E9EF] font-medium border border-transparent hover:border-[#2A2F38]',
  destructive:
    'bg-[#FF4D4D]/10 hover:bg-[#FF4D4D]/20 active:bg-[#FF4D4D]/30 text-[#FF4D4D] font-semibold border border-[#FF4D4D]/30 shadow-elevation-low',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-md min-h-[28px]',
  md: 'px-3.5 py-2 text-xs font-semibold gap-2 rounded-lg min-h-[36px]',
  lg: 'px-5 py-2.5 text-sm font-semibold gap-2.5 rounded-xl min-h-[42px]',
  icon: 'p-2 text-xs rounded-lg min-h-[36px] min-w-[36px] justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center select-none cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:transform-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            {children && <span>{children}</span>}
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
            {children && <span>{children}</span>}
            {rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
