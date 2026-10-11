import { useState } from 'preact/hooks';
import { MANDATES, RULES } from '@zoned-out/sim';
import type { GameState, Quote } from '@zoned-out/sim';
import type { UiState } from '../game/useGame.ts';
import { TOTAL_TURNS } from '../game/useGame.ts';
import { AtlasSprite } from './AtlasSprite.tsx';
import { Logo } from './Logo.tsx';

/** Signed delta with a real minus sign, e.g. "+$1.2M" or "−3". */
function deltaText(v: number, money: boolean): string {
  const r = money ? Number(v.toFixed(1)) : Math.round(v);
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return money ? `${sign}$${Math.abs(r).toFixed(1)}M` : `${sign}${Math.abs(r)}`;
}

/**
 * A number that pops up under a counter after a turn and is removed when its animation ends.
 * It stays fully opaque (no fade), so its text keeps its contrast while shown. Decorative: the
 * counter itself and the live region carry the value.
 */
function FloaterOnce({ v, money }: { v: number; money: boolean }) {
  const [done, setDone] = useState(false);
  const r = money ? Number(v.toFixed(1)) : Math.round(v);
  if (r === 0 || done) return null;
  return (
    <span
      class={`floater ${r > 0 ? 'up' : 'down'}`}
      aria-hidden="true"
      onAnimationEnd={() => setDone(true)}
    >
      {deltaText(v, money)}
    </span>
  );
}

/** Keyed by turn, so each turn's delta mounts afresh and replays. */
function Floater({ turn, v, money }: { turn: number; v: number; money: boolean }) {
  return <FloaterOnce key={turn} v={v} money={money} />;
}

/** Political capital as 12 pips: available, about to be spent by the draft, and empty. */
function CapitalPips({ capital, pending }: { capital: number; pending: number }) {
  const spend = Math.min(pending, capital);
  return (
    <span class="pips" aria-hidden="true">
      {Array.from({ length: RULES.maxCapital }, (_, i) => (
        <span
          key={i}
          class={`pip ${i < capital - spend ? 'full' : i < capital ? 'spend' : 'empty'}`}
        />
      ))}
    </span>
  );
}

/** The term as 20 quarters in five yearly groups: done, current and to come. */
function TurnTrack({ turn }: { turn: number }) {
  return (
    <span class="track" aria-hidden="true">
      {Array.from({ length: TOTAL_TURNS / 4 }, (_, y) => (
        <span class="track-year" key={y}>
          {Array.from({ length: 4 }, (_, q) => {
            const i = y * 4 + q;
            return (
              <span key={q} class={`seg ${i < turn ? 'done' : i === turn ? 'now' : 'todo'}`} />
            );
          })}
        </span>
      ))}
    </span>
  );
}

export function Hud({
  state,
  g,
  quote,
  date,
}: {
  state: UiState;
  g: GameState;
  quote: Quote | null;
  date: string;
}) {
  const d = state.lastDelta;
  const shownTurn = Math.min(g.turn + 1, TOTAL_TURNS);
  const playing = state.phase === 'playing' || state.phase === 'busy';
  return (
    <header class="hud">
      <h1>
        <Logo scale={2} tone="light" />
      </h1>
      <div class="hud-item hud-turn">
        <AtlasSprite name="icon_calendar" />
        <span class="hud-stack">
          <span>
            Turn <strong data-testid="turn">{shownTurn}</strong> / {TOTAL_TURNS}
            <span class="hud-date">
              {' · '}
              <strong data-testid="date">{date}</strong>
            </span>
          </span>
          <TurnTrack turn={state.phase === 'over' ? TOTAL_TURNS : g.turn} />
        </span>
      </div>
      <div class="hud-item">
        <AtlasSprite name="icon_budget" />
        <span class="hud-stack">
          <span class="hud-label">Budget</span>
          <strong class="hud-value" data-testid="budget">
            ${g.budget.toFixed(1)}M
          </strong>
        </span>
        {d && <Floater turn={d.turn} v={d.budget} money />}
      </div>
      <div class="hud-item">
        <AtlasSprite name="icon_capital" />
        <span class="hud-stack">
          <span class="hud-label">
            <span class="hud-long">Political </span>capital{' '}
            <strong data-testid="capital">{g.capital}</strong> / {RULES.maxCapital}
          </span>
          <CapitalPips capital={g.capital} pending={playing ? (quote?.capital ?? 0) : 0} />
        </span>
        {d && <Floater turn={d.turn} v={d.capital} money={false} />}
      </div>
      <div class="hud-item hud-mandate">
        <span class="hud-stack">
          <span class="hud-label">Mandate</span>
          <strong>{MANDATES[g.mandate].name}</strong>
        </span>
      </div>
      <span class="sr-only" aria-live="polite">
        {d
          ? `Quarter ${d.turn} done. Budget ${deltaText(d.budget, true)}, political capital ${deltaText(d.capital, false)}.`
          : ''}
      </span>
    </header>
  );
}
