import { useState } from 'preact/hooks';
import { AtlasSprite } from './AtlasSprite.tsx';

/**
 * Onboarding (ADR 0011): one tip per turn for the first four turns, introducing one idea at a
 * time. Skippable; the choice is remembered in this browser only (a convenience, not game state).
 */
const STEPS = [
  {
    title: 'Turn 1: the short-term rental rules',
    text: 'Each turn is a quarter. Start with the STR rules: the principal-residence rule is what BC did in May 2024. Watch the listings chart: covered areas (solid orange line) against exempt areas (dashed green line). Changes cost political capital, shown in the top bar.',
  },
  {
    title: 'Turn 2: two rent indices',
    text: 'The published all-tenant rent index moves slowly and is noisy, because most tenants are on old leases. Asking rents for new leases react faster, but you only see them if you buy the data (the Data card in the Policies tab).',
  },
  {
    title: 'Turn 3: shocks and money',
    text: 'From now on, shock cards (rate hikes, recessions, tourism booms) can arrive. They hit the comparison run too, so they never change your score. Enforcement and non-market homes cost budget every quarter; fines and the vacancy tax bring money in.',
  },
  {
    title: 'Turn 4: the map and the score',
    text: 'The map shows sampled homes: pins are short-term rentals, padlocks are homes held empty, scaffolds are construction. At the end of your term every objective is compared with the no-policy run, weighted by your mandate.',
  },
];

const KEY = 'zonedout.tutorial.skipped';

function skippedBefore(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function Tutorial({ turn }: { turn: number }) {
  const [skipped, setSkipped] = useState(skippedBefore);
  const [dismissed, setDismissed] = useState<number[]>([]);
  if (skipped || turn >= STEPS.length || dismissed.includes(turn)) return null;
  const step = STEPS[turn]!;
  const skip = () => {
    setSkipped(true);
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      // Storage blocked (private mode): skipping still works for this session.
    }
  };
  return (
    <aside class="tutorial" aria-labelledby="tut-h" data-testid="tutorial">
      <div class="advisor" aria-hidden="true">
        <AtlasSprite name="face_happy" scale={3} />
        <span>Advisor</span>
      </div>
      <div class="tutorial-body">
        <h2 id="tut-h">{step.title}</h2>
        <p>{step.text}</p>
        <div class="tutorial-actions">
          <button type="button" onClick={() => setDismissed((d) => [...d, turn])}>
            Got it
          </button>
          <button type="button" onClick={skip}>
            Skip the tutorial
          </button>
          <span class="muted">
            Tip {turn + 1} of {STEPS.length}
          </span>
        </div>
      </div>
    </aside>
  );
}
