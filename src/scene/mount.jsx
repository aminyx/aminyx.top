import { createRoot } from 'react-dom/client';
import { createSim } from './sim.js';
import SystemApp from './SystemScene.jsx';

export function mount(rootEl) {
  const sim = createSim();
  createRoot(rootEl).render(<SystemApp sim={sim} />);
}
