import React from 'react';

interface CornerBracketsProps {
  /**
   * Controlled visibility. If undefined, relies on hover: group-hover/bracket:opacity-100 on the parent container.
   */
  active?: boolean;
  /**
   * Color of the corner lines. Defaults to our laser measurement signal blue (#3DA9FC).
   */
  color?: 'blue' | 'amber' | 'slate';
  /**
   * Length/size of the L-shape lines in pixels. Defaults to 8px.
   */
  size?: number;
  /**
   * Optional custom classes.
   */
  className?: string;
}

export default function CornerBrackets({
  active,
  color = 'blue',
  size = 8,
  className = ''
}: CornerBracketsProps) {
  const borderColors = {
    blue: 'border-[#3DA9FC]',
    amber: 'border-[#FFB020]',
    slate: 'border-[#2A2F38]'
  };

  const borderColor = borderColors[color];
  const styleLength = `${size}px`;

  // If active is undefined, we use parent hover trigger (group/bracket class required on parent)
  const visibilityClass = active === undefined
    ? 'opacity-0 group-hover/bracket:opacity-100 transition-all duration-150 scale-[1.01]'
    : active
      ? 'opacity-100 scale-[1.01]'
      : 'opacity-0 scale-95';

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-10 transition-all duration-150 ${visibilityClass} ${className}`}
      id="instrument-corner-brackets"
    >
      {/* Top Left Corner */}
      <div
        className={`absolute top-0 left-0 border-t-2 border-l-2 ${borderColor}`}
        style={{ width: styleLength, height: styleLength }}
      />
      {/* Top Right Corner */}
      <div
        className={`absolute top-0 right-0 border-t-2 border-r-2 ${borderColor}`}
        style={{ width: styleLength, height: styleLength }}
      />
      {/* Bottom Left Corner */}
      <div
        className={`absolute bottom-0 left-0 border-b-2 border-l-2 ${borderColor}`}
        style={{ width: styleLength, height: styleLength }}
      />
      {/* Bottom Right Corner */}
      <div
        className={`absolute bottom-0 right-0 border-b-2 border-r-2 ${borderColor}`}
        style={{ width: styleLength, height: styleLength }}
      />
    </div>
  );
}
