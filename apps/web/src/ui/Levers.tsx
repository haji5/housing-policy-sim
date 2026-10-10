import type { Draft } from '../game/useGame.ts';
import { regimeName } from '../game/useGame.ts';

interface Props {
  draft: Draft;
  disabled: boolean;
  onChange: (d: Partial<Draft>) => void;
}

const REGIME_HELP = [
  'Anyone may run a short-term rental anywhere.',
  'In covered zones, only a host’s own principal residence may be rented short-term.',
  'As above, plus a provincial registry: platforms remove listings without a valid registration.',
];

export function Levers({ draft, disabled, onChange }: Props) {
  return (
    <section class="panel" aria-labelledby="levers-h">
      <h2 id="levers-h">Policy levers</h2>
      <fieldset disabled={disabled}>
        <legend>Short-term rental regime</legend>
        {[0, 1, 2].map((v) => (
          <label class="radio" key={v}>
            <input
              type="radio"
              name="regime"
              value={v}
              checked={draft.strRegime === v}
              onChange={() => onChange({ strRegime: v as Draft['strRegime'] })}
            />
            <span>
              <strong>{regimeName(v)}</strong>
              <small>{REGIME_HELP[v]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Enforcement budget</legend>
        <label class="slider">
          <input
            type="range"
            min={0}
            max={5}
            step={1}
            value={draft.enforcement}
            aria-valuetext={`level ${draft.enforcement} of 5`}
            onInput={(e) => onChange({ enforcement: Number((e.target as HTMLInputElement).value) })}
          />
          <output>{draft.enforcement} / 5</output>
        </label>
        <small>
          Raises the chance illegal listings are detected and fined (diminishing returns).
        </small>
      </fieldset>
    </section>
  );
}
