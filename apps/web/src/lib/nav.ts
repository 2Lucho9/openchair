export const TABS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'ajustes', label: 'Ajustes' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

/** "#/clientes" -> "clientes". Cualquier cosa desconocida cae en "hoy". */
export function parseTab(hash: string): TabId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const found = TABS.find((t) => t.id === id);
  return found ? found.id : 'hoy';
}

export function tabHash(id: TabId): string {
  return `#/${id}`;
}
