import type { ReactNode } from 'react'

export type IconName =
  | 'dashboard' | 'invoices' | 'settings' | 'sun' | 'moon' | 'plus' | 'check' | 'clock' | 'trash'
  | 'download' | 'upload' | 'database' | 'cloud' | 'trend-up' | 'trend-down' | 'wallet' | 'receipt' | 'sparkle'
  | 'edit' | 'copy' | 'users' | 'undo' | 'menu' | 'lock'
  | 'food' | 'car' | 'bag' | 'heart' | 'ticket' | 'repeat' | 'bank' | 'tag' | 'user' | 'shield' | 'pie' | 'search'

const PATHS: Record<IconName, ReactNode> = {
  search: <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
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
  food: <><path d="M7 3v6a2.5 2.5 0 0 0 5 0V3M9.5 3v18" /><path d="M17 3c-2 2-2.5 5-2.5 8h2.5v10" /></>,
  car: <><path d="M5 16v-5l2-5h10l2 5v5M3.5 16h17M5.5 11h13" /><circle cx="8" cy="17.5" r="1.6" /><circle cx="16" cy="17.5" r="1.6" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  ticket: <><path d="M4 7.5h16v3a1.8 1.8 0 0 0 0 3.5V17H4v-3a1.8 1.8 0 0 0 0-3.5z" /><path d="M14 7.5v9" strokeDasharray="2 2" /></>,
  repeat: <path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1" />,
  bank: <path d="M3.5 9.5L12 4l8.5 5.5M5.5 10v7M10 10v7M14 10v7M18.5 10v7M4 19.5h16" />,
  tag: <><path d="M3.5 12.5v-8h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.7-3.6 3.4-5.5 7-5.5s6.3 1.9 7 5.5" /></>,
  shield: <><path d="M12 3l7 3v5.5c0 4.3-3 7.7-7 9.5-4-1.8-7-5.2-7-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  pie: <><path d="M12 3v9h9" /><path d="M20.4 15A8.5 8.5 0 1 1 9 3.6" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
}

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`icon icon-${name} ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{PATHS[name]}</svg>
}

export function Logo({ size = 36 }: { size?: number }) {
  return <img className="logo" src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" />
}

/** Logo só com o símbolo, nas cores do tema. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return <svg className="logo-mark" width={size} height={size} viewBox="0 0 256 256" fill="none" role="img" aria-label="Organização do Crédito">
    <circle cx="98" cy="128" r="44" stroke="var(--primary)" strokeWidth="22" />
    <path d="M196 100a44 44 0 1 0 0 56" stroke="var(--primary-strong)" strokeWidth="22" strokeLinecap="round" />
  </svg>
}

/** Bolinha com a inicial da pessoa, numa cor estável por nome. */
export function PersonDot({ name }: { name: string }) {
  const colors = ['#8b5cf6', '#22b8d4', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb923c']
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return <span className="person-dot" style={{ background: colors[hash % colors.length] }} aria-hidden="true">{(name.trim()[0] ?? '?').toUpperCase()}</span>
}
