import React, { forwardRef } from 'react';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  showValue?: boolean;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      label,
      value,
      min = 0,
      max = 100,
      step = 1,
      unit = '',
      showValue = true,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const sliderId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    return (
      <div className={`w-full space-y-2 font-sans ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
        {(label || showValue) && (
          <div className="flex items-center justify-between text-xs">
            {label && (
              <label
                htmlFor={sliderId}
                className="font-mono text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wider"
              >
                {label}
              </label>
            )}
            {showValue && (
              <span className="font-mono font-mono-numbers font-bold text-[#3DA9FC] text-xs">
                {value}
                {unit}
              </span>
            )}
          </div>
        )}

        <div className="relative flex items-center h-4">
          {/* Background Track */}
          <div className="absolute w-full h-1.5 bg-[#101317] border border-[#2A2F38] rounded-full overflow-hidden">
            {/* Active Fill in Signal Blue */}
            <div
              className="h-full bg-[#3DA9FC] rounded-full transition-all duration-75"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Actual range input */}
          <input
            ref={ref}
            type="range"
            id={sliderId}
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            className="absolute w-full h-4 opacity-0 cursor-pointer z-10"
            {...props}
          />

          {/* Precision Custom Thumb */}
          <div
            className="absolute w-3.5 h-3.5 bg-[#E6E9EF] border-2 border-[#3DA9FC] rounded-full shadow-elevation-mid pointer-events-none transition-all duration-75 -translate-x-1/2 hover:scale-125"
            style={{ left: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Slider.displayName = 'Slider';
