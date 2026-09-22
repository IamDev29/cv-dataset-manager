import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isMono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      isMono = false,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5 font-sans">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-[#8B93A1] uppercase tracking-wider font-mono"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3.5 text-[#8B93A1] pointer-events-none flex items-center">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`w-full py-2 border rounded-lg text-sm bg-[#101317] text-[#E6E9EF] placeholder-[#5A6270] transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus:ring-2 focus:bg-[#14171C] disabled:opacity-40 disabled:cursor-not-allowed ${
              leftIcon ? 'pl-10' : 'pl-3.5'
            } ${rightIcon ? 'pr-10' : 'pr-3.5'} ${
              isMono ? 'font-mono font-mono-numbers' : 'font-sans'
            } ${
              error
                ? 'border-[#FF4D4D] focus:ring-[#FF4D4D]/30 focus:border-[#FF4D4D]'
                : 'border-[#2A2F38] focus:ring-[#3DA9FC]/30 focus:border-[#3DA9FC]'
            } ${className}`}
            {...props}
          />

          {rightIcon && (
            <span className="absolute right-3.5 text-[#8B93A1] flex items-center">
              {rightIcon}
            </span>
          )}
        </div>

        {error && <p className="text-[11px] text-[#FF4D4D] font-sans">{error}</p>}
        {!error && helperText && (
          <p className="text-[11px] text-[#8B93A1] font-sans">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
