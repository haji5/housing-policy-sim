import { RULES } from '@zoned-out/sim';
import type { CooldownLever, Decision, GameState, Quote } from '@zoned-out/sim';
import { capName, regimeName, upzoneName } from '../game/useGame.ts';
import type { ComponentChildren } from 'preact';
import { AtlasSprite } from './AtlasSprite.tsx';
import { LEVER_EVIDENCE } from './evidence.ts';
import { Badge } from './Tips.tsx';

/** Evidence badge for a lever (PLAN §6.3). */
function LeverBadge({ lever }: { lever: keyof typeof LEVER_EVIDENCE }) {
  const e = LEVER_EVIDENCE[lever]!;
  return <Badge level={e.level} why={e.why} />;
}

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

/**
 * A lever card's legend: icon and name, then its cost, evidence badge and a "Changed" tag while
 * the draft differs from the policy in force (text, so it does not rely on the card's colour).
 */
function CardLegend({
  icon,
  title,
  cost,
  changed,
  children,
}: {
  icon: string;
  title: string;
  cost?: string;
  changed: boolean;
  children?: ComponentChildren;
}) {
  return (
    <legend>
      <span class="lever-title">
        <AtlasSprite name={icon} />
        {title}
      </span>
      <span class="lever-meta">
        {cost && <span class="cost">{cost}</span>}
        {children}
        {changed && <span class="changed-tag">Changed</span>}
      </span>
    </legend>
  );
}

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
  const card = (changed: boolean, locked = false) =>
    `lever-card${changed ? ' changed' : ''}${locked ? ' locked' : ''}`;
  const upzoneChanged = draft.upzone.some((u, i) => u !== (cur.upzone[i] ?? 0));
  return (
    <section class="levers" aria-labelledby="levers-h">
      <h2 id="levers-h" class="sr-only">
        Policy levers
      </h2>

      <fieldset
        class={card(draft.strRegime !== cur.strRegime, regimeLocked)}
        disabled={disabled || regimeLocked}
      >
        <CardLegend
          icon="icon_str"
          title="Short-term rental rules"
          cost={`${RULES.capitalCost.strRegime} capital`}
          changed={draft.strRegime !== cur.strRegime}
        >
          <LeverBadge lever="strRegime" />
        </CardLegend>
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

      <fieldset class={card(draft.enforcement !== cur.enforcement)} disabled={disabled}>
        <CardLegend
          icon="icon_enforcement"
          title="Enforcement budget"
          cost={`$${RULES.enforcementCostPerLevel.toFixed(1)}M per level`}
          changed={draft.enforcement !== cur.enforcement}
        >
          <LeverBadge lever="enforcement" />
        </CardLegend>
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

      <fieldset
        class={card(draft.vacancyTax !== cur.vacancyTax, taxLocked)}
        disabled={disabled || taxLocked}
      >
        <CardLegend
          icon="icon_vacant"
          title="Vacancy tax"
          cost={`${RULES.capitalCost.vacancyTax} capital per point`}
          changed={draft.vacancyTax !== cur.vacancyTax}
        >
          <LeverBadge lever="vacancyTax" />
        </CardLegend>
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

      <fieldset
        class={card(draft.rentCap !== cur.rentCap, capLocked)}
        disabled={disabled || capLocked}
      >
        <CardLegend
          icon="icon_rentcap"
          title="Rent-increase cap"
          cost={`${RULES.capitalCost.rentCap} capital`}
          changed={draft.rentCap !== cur.rentCap}
        >
          <LeverBadge lever="rentCap" />
        </CardLegend>
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

      <fieldset class={card(upzoneChanged)} disabled={disabled}>
        <CardLegend
          icon="icon_upzone"
          title="Upzoning"
          cost={`${RULES.capitalCost.upzone} capital per step`}
          changed={upzoneChanged}
        >
          <LeverBadge lever="upzone" />
        </CardLegend>
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

      <fieldset class={card(draft.nonMarket !== cur.nonMarket)} disabled={disabled}>
        <CardLegend
          icon="icon_nonmarket"
          title="Non-market homes"
          cost={`$${RULES.nonMarketSubsidy.toFixed(2)}M subsidy each`}
          changed={draft.nonMarket !== cur.nonMarket}
        >
          <LeverBadge lever="nonMarket" />
        </CardLegend>
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

      <fieldset class={card(draft.buyData !== cur.buyData)} disabled={disabled}>
        <CardLegend
          icon="icon_data"
          title="Data"
          cost={`$${RULES.dataCost.toFixed(2)}M per quarter`}
          changed={draft.buyData !== cur.buyData}
        />
        <label class="check">
          <input
            type="checkbox"
            checked={draft.buyData}
            onChange={(e) => onChange({ buyData: (e.target as HTMLInputElement).checked })}
          />
          <span>
            Buy asking-rent data
            <small>
              Shows new-lease rents up to the end of the previous quarter. Without it you only see
              the published all-tenant rent index, which moves slowly.
            </small>
          </span>
        </label>
      </fieldset>

      {quote && (
        <div class="quote" aria-live="polite" data-testid="quote">
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
