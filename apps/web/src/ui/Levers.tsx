import { RULES } from '@zoned-out/sim';
import type { CooldownLever, Decision, GameState, Quote } from '@zoned-out/sim';
import { capName, regimeName, upzoneName } from '../game/useGame.ts';

interface Props {
  draft: Decision;
  game: GameState;
  quote: Quote | null;
  zoneNames: string[];
  zoneCovered: boolean[];
  disabled: boolean;
  onChange: (d: Partial<Decision>) => void;
}

const REGIME_HELP = [
  'Anyone may run a short-term rental anywhere.',
  'In covered zones, only a host’s own principal residence may be rented short-term.',
  'As above, plus a provincial registry: platforms remove listings without a valid registration.',
];

const CAP_HELP = [
  'Sitting tenants’ rents can rise at most 1% a year.',
  'At most 3% a year.',
  'At most 6% a year.',
];

const num = (e: Event) => Number((e.target as HTMLInputElement).value);

/** "Locked for N more turns" when a lever is in its legislative cooldown, else null. */
function cooldownLeft(game: GameState, lever: CooldownLever): number | null {
  const left = RULES.cooldownTurns[lever] - (game.turn - game.lastChanged[lever]);
  return left > 0 ? left : null;
}

function Cooldown({ game, lever }: { game: GameState; lever: CooldownLever }) {
  const left = cooldownLeft(game, lever);
  if (left === null) return null;
  return (
    <small class="cooldown">
      Changed recently: locked for {left} more turn{left === 1 ? '' : 's'}.
    </small>
  );
}

export function Levers({ draft, game, quote, zoneNames, zoneCovered, disabled, onChange }: Props) {
  const cur = game.current;
  const regimeLocked = cooldownLeft(game, 'strRegime') !== null;
  const taxLocked = cooldownLeft(game, 'vacancyTax') !== null;
  const capLocked = cooldownLeft(game, 'rentCap') !== null;
  return (
    <section class="panel levers" aria-labelledby="levers-h">
      <h2 id="levers-h">Policy levers</h2>

      <fieldset disabled={disabled || regimeLocked}>
        <legend>
          Short-term rental rules <span class="cost">{RULES.capitalCost.strRegime} capital</span>
        </legend>
        {[0, 1, 2].map((v) => (
          <label class="radio" key={v}>
            <input
              type="radio"
              name="regime"
              value={v}
              checked={draft.strRegime === v}
              onChange={() => onChange({ strRegime: v })}
            />
            <span>
              <strong>{regimeName(v)}</strong>
              <small>{REGIME_HELP[v]}</small>
            </span>
          </label>
        ))}
        <Cooldown game={game} lever="strRegime" />
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>
          Enforcement budget{' '}
          <span class="cost">${RULES.enforcementCostPerLevel.toFixed(1)}M per level</span>
        </legend>
        <label class="slider">
          <span class="sr-only">Enforcement level</span>
          <input
            type="range"
            min={0}
            max={5}
            step={1}
            value={draft.enforcement}
            aria-valuetext={`level ${draft.enforcement} of 5`}
            onInput={(e) => onChange({ enforcement: num(e) })}
          />
          <output>{draft.enforcement} / 5</output>
        </label>
        <small>Raises the chance illegal listings are found and fined (diminishing returns).</small>
      </fieldset>

      <fieldset disabled={disabled || taxLocked}>
        <legend>
          Vacancy tax <span class="cost">{RULES.capitalCost.vacancyTax} capital per point</span>
        </legend>
        <label class="slider">
          <span class="sr-only">Vacancy tax rate</span>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={draft.vacancyTax}
            aria-valuetext={`${draft.vacancyTax}% of assessed value per year`}
            onInput={(e) => onChange({ vacancyTax: num(e) })}
          />
          <output>{draft.vacancyTax}%</output>
        </label>
        <small>Per year, on homes kept empty. Raises revenue; pushes owners to rent or sell.</small>
        <Cooldown game={game} lever="vacancyTax" />
      </fieldset>

      <fieldset disabled={disabled || capLocked}>
        <legend>
          Rent-increase cap <span class="cost">{RULES.capitalCost.rentCap} capital</span>
        </legend>
        {[0, 1, 2].map((v) => (
          <label class="radio" key={v}>
            <input
              type="radio"
              name="rentcap"
              value={v}
              checked={draft.rentCap === v}
              onChange={() => onChange({ rentCap: v })}
            />
            <span>
              <strong>{capName(v)}</strong>
              <small>{CAP_HELP[v]}</small>
            </span>
          </label>
        ))}
        <small>
          A tight cap protects sitting tenants but makes building rentals less attractive.
        </small>
        <Cooldown game={game} lever="rentCap" />
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>
          Upzoning <span class="cost">{RULES.capitalCost.upzone} capital per step</span>
        </legend>
        <small>
          Raises housing starts in a zone after a permit delay. <strong>Cannot be reversed.</strong>
        </small>
        <div class="upzone">
          {zoneNames.map((name, zi) => {
            const before = cur.upzone[zi] ?? 0;
            const id = `upzone-${zi}`;
            return (
              <div key={zi} class="upzone-row">
                <label for={id}>
                  {name}
                  {!zoneCovered[zi] && <small> (exempt)</small>}
                </label>
                <select
                  id={id}
                  value={draft.upzone[zi] ?? 0}
                  onChange={(e) => {
                    const upzone = [...draft.upzone];
                    upzone[zi] = num(e);
                    onChange({ upzone });
                  }}
                >
                  {[0, 1, 2].map((v) => (
                    <option key={v} value={v} disabled={v < before}>
                      {upzoneName(v)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>
          Non-market homes{' '}
          <span class="cost">${RULES.nonMarketSubsidy.toFixed(2)}M subsidy each</span>
        </legend>
        <label class="slider">
          <span class="sr-only">Non-market homes started per quarter</span>
          <input
            type="range"
            min={0}
            max={40}
            step={5}
            value={draft.nonMarket}
            aria-valuetext={`${draft.nonMarket} homes per quarter`}
            onInput={(e) => onChange({ nonMarket: num(e) })}
          />
          <output>{draft.nonMarket} / qtr</output>
        </label>
        <small>Started each quarter; rented below market once built.</small>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Data</legend>
        <label class="check">
          <input
            type="checkbox"
            checked={draft.buyData}
            onChange={(e) => onChange({ buyData: (e.target as HTMLInputElement).checked })}
          />
          <span>
            Buy asking-rent data (${RULES.dataCost.toFixed(2)}M per quarter)
            <small>
              Shows new-lease rents up to the end of the previous quarter. Without it you only see
              the published all-tenant rent index, which moves slowly.
            </small>
          </span>
        </label>
      </fieldset>

      {quote && (
        <div class="quote" aria-live="polite">
          <p>
            This quarter costs <strong>${quote.fiscal.toFixed(2)}M</strong> of $
            {game.budget.toFixed(2)}M and <strong>{quote.capital}</strong> of {game.capital}{' '}
            political capital.
          </p>
          {quote.errors.map((e) => (
            <p key={e} role="alert" class="error">
              {e}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
