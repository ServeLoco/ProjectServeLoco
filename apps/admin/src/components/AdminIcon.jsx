import React from 'react';

// Shared outline icons keep navigation and toolbar controls consistent.
const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  orders: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10 M8 5l8 4',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  riders: 'M3 16h13l4-7h-5l-3 7 M7 16l-3-7H2 M8 6h5 M7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  mobile: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 M10 5h4 M11 19h2',
  products: 'M3 3h8l10 10-8 8L3 11z M7 7h.01',
  combos: 'M3 4h7v7H3z M14 4h7v7h-7z M7 15h10v6H7z M6 11v4h12v-4',
  categories: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3',
  modes: 'M3 7h18 M3 17h18 M8 4v6 M16 14v6',
  shops: 'M3 10l2-7h14l2 7 M3 10v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0v-2 M5 15v6h14v-6 M10 21v-6h4v6',
  offers: 'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8H8a3 3 0 1 1 3-3z M12 8h4a3 3 0 1 0-3-3z',
  coupons: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M14 6v2 M14 11v2 M14 16v2',
  cards: 'M3 5h18v14H3z M3 10h18 M7 15h4',
  customers: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3 M19 4a3 3 0 0 1 0 6 M21 13a5 5 0 0 1 2 4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  bellOff: 'M3 3l18 18 M6 6a6 6 0 0 0 0 2c0 7-3 7-3 9h14 M9 3a6 6 0 0 1 9 5c0 3 .5 5 1.5 6 M10 21h4',
  images: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01',
  settings: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  reports: 'M5 3h10l4 4v14H5z M14 3v5h5 M9 12h6 M9 16h6',
  analytics: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-8',
  map: 'M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3z M8 2v17 M16 5v17',
  health: 'M2 12h5l3-8 4 16 3-8h5',
  areas: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  admins: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M9 12l2 2 4-4',
  library: 'M3 4h4v17H3z M10 4h4v17h-4z M16 5l3-1 4 16-3 1z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M18 6L6 18',
  chevron: 'M9 5l7 7-7 7',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M4 12a8 8 0 0 0 14 6',
  logout: 'M9 3H4v18h5 M13 7l5 5-5 5 M8 12h13',
  bolt: 'M13 2L4 14h7l-1 8 10-12h-7z',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6',
  warning: 'M12 3L2 21h20z M12 9v5 M12 17h.01',
  percentage: 'M5 19L19 5 M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
};

export default function AdminIcon({ name, size = 20, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name] || paths.dashboard} />
    </svg>
  );
}
