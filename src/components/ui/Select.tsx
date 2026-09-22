import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
  isMono?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      isMono = false,
      className = '',
      id,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5 font-sans">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-[#8B93A1] uppercase tracking-wider font-mono"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={`w-full py-2 pl-3.5 pr-9 border rounded-lg text-sm bg-[#101317] text-[#E6E9EF] transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus:ring-2 focus:bg-[#14171C] appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isMono ? 'font-mono font-mono-numbers' : 'font-sans'
            } ${
              error
                ? 'border-[#FF4D4D] focus:ring-[#FF4D4D]/30 focus:border-[#FF4D4D]'
                : 'border-[#2A2F38] focus:ring-[#3DA9FC]/30 focus:border-[#3DA9FC]'
            } ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="bg-[#181C22] text-[#E6E9EF]"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <ChevronDown
            size={14}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8B93A1] pointer-events-none"
          />
        </div>

        {error && <p className="text-[11px] text-[#FF4D4D] font-sans">{error}</p>}
        {!error && helperText && (
          <p className="text-[11px] text-[#8B93A1] font-sans">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
