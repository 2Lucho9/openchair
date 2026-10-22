import type { ReactNode } from 'react';
import { TABS, tabHash, type TabId } from '../lib/nav';

const ICONS: Record<TabId, string> = {
  hoy: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
  agenda: 'M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  clientes: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  servicios: 'M6 3l12 12M18 3L6 15M6 21a3 3 0 100-6 3 3 0 000 6zM18 21a3 3 0 100-6 3 3 0 000 6z',
  ajustes: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6.5 8.5 4.5 8l-1 3 2 1v0l-2 1 1 3 2-.5L8 17.5l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
};

export function Shell(props: {
  tab: TabId;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>{props.title}</h1>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
        <span className="brand">OpenChair</span>
      </header>
      <main className="content">{props.children}</main>
      <nav className="tabbar" aria-label="Navegación principal">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={tabHash(t.id)}
            className={t.id === props.tab ? 'tab active' : 'tab'}
            aria-current={t.id === props.tab ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={ICONS[t.id]} />
            </svg>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
