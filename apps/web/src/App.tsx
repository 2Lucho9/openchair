import { ENGINE_VERSION } from '@openchair/engine';

export default function App() {
  return (
    <main>
      <h1>OpenChair</h1>
      <p>Tu agenda, siempre con silla libre.</p>
      <small>motor v{ENGINE_VERSION}</small>
    </main>
  );
}
