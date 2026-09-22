import React, { forwardRef } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = '', id, checked, disabled, ...props }, ref) => {
    const checkboxId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <label
        htmlFor={checkboxId}
        className={`flex items-start gap-3 select-none cursor-pointer group ${
          disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
        } ${className}`}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div
            className={`w-4 h-4 rounded border transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center ${
              checked
                ? 'bg-[#3DA9FC] border-[#3DA9FC] shadow-glow-primary'
                : 'bg-[#101317] border-[#2A2F38] group-hover:border-[#3DA9FC]/50 group-hover:bg-[#14171C]'
            }`}
          >
            {checked && <Check size={11} className="text-[#14171C] stroke-[3]" />}
          </div>
        </div>

        {(label || description) && (
          <div className="space-y-0.5">
            {label && (
              <span className="block text-xs font-medium text-[#E6E9EF] group-hover:text-white transition-colors">
                {label}
              </span>
            )}
            {description && (
              <span className="block text-[11px] text-[#8B93A1] leading-relaxed">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
