import { render } from 'preact';
import { SIM_VERSION } from '@zoned-out/sim';

function App() {
  return (
    <main>
      <h1>Zoned Out</h1>
      <p>Hello. A housing-policy simulator is being built here (sim core v{SIM_VERSION}).</p>
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<App />, root);
