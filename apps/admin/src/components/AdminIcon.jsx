import React from 'react';
import { ICON_PATHS } from './adminIconPaths';


export default function AdminIcon({ name, size = 20, className = '', strokeWidth = 1.75 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[name] || ICON_PATHS.dashboard} />
    </svg>
  );
}
