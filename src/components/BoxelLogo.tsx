import React from 'react';

interface BoxelLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function BoxelLogo({ className = '', size = 'md' }: BoxelLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-14 h-14 rounded-2xl'
  };

  const svgSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`relative flex items-center justify-center bg-gradient-to-br from-[#1E1B4B] to-[#311042] border border-[#4338CA]/40 shadow-[0_0_15px_rgba(99,102,241,0.15)] group overflow-hidden transition-all duration-300 hover:border-[#6366F1]/50 ${sizeClasses[size]} ${className}`} id="boxel-logo-icon">
      {/* Dynamic background glow animation */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-[#10B981] to-[#6366F1] rounded-full blur-md opacity-25 group-hover:opacity-45 transition-opacity duration-300" />
      
      {/* Bounding box visual element */}
      <svg className={`${svgSizes[size]} text-slate-100 relative z-10 transition-transform duration-300 group-hover:scale-105`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Interior simulated bounding target box with dashed layout */}
        <rect 
          x="7.5" 
          y="7.5" 
          width="9" 
          height="9" 
          rx="1" 
          className="fill-[#4338CA]/15 stroke-indigo-400 stroke-[1.5] stroke-dasharray-[2_2]" 
        />
        
        {/* Outer Corner Handles (the distinguishing Feature of boxel) */}
        {/* Top Left */}
        <path d="M4 8V4H8" className="stroke-emerald-400 stroke-[2] stroke-linecap-round" />
        {/* Top Right */}
        <path d="M20 8V4H16" className="stroke-emerald-400 stroke-[2] stroke-linecap-round" />
        {/* Bottom Left */}
        <path d="M4 16V20H8" className="stroke-emerald-400 stroke-[2] stroke-linecap-round" />
        {/* Bottom Right */}
        <path d="M20 16V20H16" className="stroke-emerald-400 stroke-[2] stroke-linecap-round" />
        
        {/* Little anchor handles (bounding box nodes) */}
        <circle cx="4" cy="4" r="1.5" className="fill-slate-100 stroke-indigo-950 stroke-1" />
        <circle cx="20" cy="4" r="1.5" className="fill-slate-100 stroke-indigo-950 stroke-1" />
        <circle cx="4" cy="20" r="1.5" className="fill-slate-100 stroke-indigo-950 stroke-1" />
        <circle cx="20" cy="20" r="1.5" className="fill-slate-100 stroke-indigo-950 stroke-1" />
        
        {/* Hover accent center dot */}
        <circle cx="12" cy="12" r="1" className="fill-indigo-300 opacity-60 group-hover:opacity-100 group-hover:fill-emerald-400 group-hover:scale-125 transition-all" />
      </svg>
    </div>
  );
}
