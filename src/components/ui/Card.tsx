import React, { forwardRef } from 'react';
import CornerBrackets from '../CornerBrackets';

export type CardElevation = 'flat' | 'low' | 'mid' | 'high' | 'glass';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
  interactive?: boolean;
  withBrackets?: boolean;
  bracketColor?: 'blue' | 'amber' | 'slate';
  activeBracket?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const elevationStyles: Record<CardElevation, string> = {
  flat: 'bg-[#181C22] border border-[#2A2F38]',
  low: 'bg-[#1B1F26] border border-[#2A2F38] shadow-elevation-low',
  mid: 'bg-[#1C2128] border border-[#2A2F38] shadow-elevation-mid',
  high: 'bg-[#1E232D] border border-[#3B4350]/60 shadow-elevation-high',
  glass: 'glass-surface shadow-elevation-glass',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      elevation = 'low',
      interactive = false,
      withBrackets = false,
      bracketColor = 'slate',
      activeBracket,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`group/bracket relative rounded-xl transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${elevationStyles[elevation]} ${
          interactive
            ? 'card-hover-lift cursor-pointer hover:border-[#3DA9FC]/40'
            : ''
        } ${className}`}
        {...props}
      >
        {withBrackets && (
          <CornerBrackets color={bracketColor as 'blue' | 'amber' | 'slate'} active={activeBracket} />
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`p-5 pb-3 border-b border-[#2A2F38]/60 flex items-center justify-between gap-3 ${className}`}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', ...props }, ref) => (
    <h3
      ref={ref}
      className={`font-sans font-semibold text-sm tracking-tight text-[#E6E9EF] flex items-center gap-2 ${className}`}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className = '', ...props }, ref) => (
    <p
      ref={ref}
      className={`text-xs text-[#8B93A1] leading-relaxed mt-1 font-sans ${className}`}
      {...props}
    />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`p-5 ${className}`} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`p-4 pt-3 border-t border-[#2A2F38]/60 flex items-center justify-between gap-3 ${className}`}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';
