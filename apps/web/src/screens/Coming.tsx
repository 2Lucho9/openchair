export function Coming({ what, phase }: { what: string; phase: string }) {
  return (
    <section className="card">
      <h2>{what}</h2>
      <p className="muted">Esta pantalla llega en la {phase}. La base de datos y las reglas ya están listas.</p>
    </section>
  );
}
