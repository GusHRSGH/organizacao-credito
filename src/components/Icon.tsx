import type { ReactNode } from 'react'

export type IconName =
  | 'dashboard' | 'invoices' | 'settings' | 'sun' | 'moon' | 'plus' | 'check' | 'clock' | 'trash'
  | 'download' | 'upload' | 'database' | 'cloud' | 'trend-up' | 'trend-down' | 'wallet' | 'receipt' | 'sparkle'
  | 'edit' | 'copy' | 'users' | 'undo' | 'menu' | 'lock'

const PATHS: Record<IconName, ReactNode> = {
  dashboard: <>
    <rect className="i-bar i-bar-1" x="4" y="12" width="4" height="8" rx="1.4" />
    <rect className="i-bar i-bar-2" x="10" y="4" width="4" height="16" rx="1.4" />
    <rect className="i-bar i-bar-3" x="16" y="9" width="4" height="11" rx="1.4" />
  </>,
  invoices: <>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path className="i-line i-line-1" d="M9.5 8h5" />
    <path className="i-line i-line-2" d="M9.5 12h5" />
  </>,
  settings: <g className="i-gear">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </g>,
  sun: <g className="i-sun">
    <circle cx="12" cy="12" r="4" />
    <path className="i-rays" d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </g>,
  moon: <path className="i-moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  plus: <path className="i-plus" d="M12 5v14M5 12h14" />,
  check: <path className="i-check" d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: <>
    <circle cx="12" cy="12" r="8.5" />
    <path className="i-hand" d="M12 7.5V12l3 2" />
  </>,
  trash: <>
    <path d="M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13" />
    <path d="M10 11v5M14 11v5" />
  </>,
  download: <>
    <path className="i-arrow-down" d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </>,
  upload: <>
    <path className="i-arrow-up" d="M12 16V5M7.5 9.5L12 5l4.5 4.5" />
    <path d="M5 19.5h14" />
  </>,
  database: <>
    <ellipse cx="12" cy="6" rx="7" ry="2.8" />
    <path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
    <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
  </>,
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a4 4 0 0 1-.5 8z" />,
  'trend-up': <path className="i-trend" d="M3.5 16.5l6-6 4 4 7-7.5M15 7h5.5v5.5" />,
  'trend-down': <path className="i-trend" d="M3.5 7.5l6 6 4-4 7 7.5M15 17h5.5v-5.5" />,
  wallet: <>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z" />
    <circle cx="16" cy="13.5" r="1.1" />
  </>,
  receipt: <>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9.5 8h5M9.5 12h5" />
  </>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5" /><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.8.6 3 2.2 3.3 4.7" /></>,
  undo: <path d="M9 7L4.5 11.5 9 16M5 11.5h9.5a4.5 4.5 0 0 1 0 9H12" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
}

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`icon icon-${name} ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{PATHS[name]}</svg>
}

export function Logo({ size = 36 }: { size?: number }) {
  return <img className="logo" src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" />
}
