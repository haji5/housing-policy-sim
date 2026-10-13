import type { Decision, PolicyEvent } from '@zoned-out/sim';
import type { ResearcherView } from './observe.ts';

/**
 * The quarterly briefing (ADR 0012): stakeholder headlines generated from templates. Flavour
 * only: nothing here feeds the score or the sim. Headlines use the player's own decisions and
 * the data the player can already see (scraped listing snapshots, the published rent index), never
 * the true series, so the paper cannot leak what the debrief reveals. Reactions are stakeholder
 * opinions about the direction of a decision, not claims about its effect.
 */

export type Mood = 'happy' | 'neutral' | 'angry';

export interface Reaction {
  who: string;
  mood: Mood;
  text: string;
}

export interface NewsItem {
  /** Turn (1-based) whose end produced this edition. */
  turn: number;
  headline: string;
  /** Short lines under the headline: what the published data showed this quarter. */
  lines: string[];
  reactions: Reaction[];
}

const pctText = (v: number) => `${Math.abs(v).toFixed(1)}%`;

/** Percentage change between the last two snapshots not flagged incomplete, if both exist. */
function lastChange(points: ResearcherView['covered']): number | null {
  const ok = points.filter((p) => !p.hollow);
  if (ok.length < 2) return null;
  const a = ok[ok.length - 2]!.y;
  const b = ok[ok.length - 1]!.y;
  return a > 0 ? (100 * (b - a)) / a : null;
}

interface Story {
  /** Higher = bigger news; the biggest becomes the headline. */
  weight: number;
  headline: string;
  reactions: Reaction[];
}

const R = (who: string, mood: Mood, text: string): Reaction => ({ who, mood, text });

const TENANTS = 'Tenants’ union';
const HOSTS = 'Short-term hosts’ group';
const TOURISM = 'Tourism board';
const BUILDERS = 'Home builders’ association';
const TREASURY = 'Regional treasurer';
const OWNERS = 'Homeowners’ association';

function story(e: PolicyEvent, before: Decision, zoneNames: string[]): Story | null {
  switch (e.lever) {
    case 'strRegime': {
      if (e.value === 0)
        return {
          weight: 10,
          headline: 'Short-term rental rules lifted across the region',
          reactions: [
            R(HOSTS, 'happy', 'Common sense at last. Hosts are part of this economy.'),
            R(TENANTS, 'angry', 'Every whole-home listing is a home a family cannot rent.'),
            R(TOURISM, 'happy', 'More beds for visitors this summer.'),
          ],
        };
      const stricter = e.value > before.strRegime;
      if (e.value === 1)
        return {
          weight: 10,
          headline: stricter
            ? 'Short-term rentals limited to hosts’ own homes in covered areas'
            : 'Registry scrapped; principal-residence rule stays',
          reactions: stricter
            ? [
                R(TENANTS, 'happy', 'Those homes belong on the long-term market.'),
                R(HOSTS, 'angry', 'Small operators are being punished for a supply problem.'),
                R(TOURISM, 'angry', 'Where will visitors stay in August?'),
              ]
            : [
                R(HOSTS, 'happy', 'Less paperwork for honest hosts.'),
                R(TENANTS, 'neutral', 'Without a registry, who checks the rule is followed?'),
              ],
        };
      return {
        weight: 10,
        headline: 'Provincial registry goes live: unregistered listings face removal',
        reactions: [
          R(TENANTS, 'happy', 'Platforms finally have to check who is renting what.'),
          R(HOSTS, 'angry', 'Another fee and another form for every host.'),
          R(TOURISM, 'neutral', 'We will be watching the bed count closely.'),
        ],
      };
    }
    case 'rentCap': {
      const tighter = e.value < before.rentCap;
      const pct = ['1%', '3%', '6%'][e.value] ?? '?';
      return {
        weight: 8,
        headline: tighter
          ? `Rent increases for sitting tenants capped at ${pct} a year`
          : `Rent-increase cap loosened to ${pct} a year`,
        reactions: tighter
          ? [
              R(TENANTS, 'happy', 'Breathing room for people already in their homes.'),
              R(BUILDERS, 'angry', 'Tighter caps make new rental buildings harder to finance.'),
            ]
          : [
              R(BUILDERS, 'happy', 'A signal that rental projects can pencil out again.'),
              R(TENANTS, 'angry', 'Sitting tenants will pay for this.'),
            ],
      };
    }
    case 'vacancyTax': {
      const up = e.value > before.vacancyTax;
      return {
        weight: 7,
        headline:
          e.value === 0
            ? 'Vacancy tax scrapped'
            : up
              ? `Vacancy tax raised to ${e.value}% on homes kept empty`
              : `Vacancy tax cut to ${e.value}%`,
        reactions: up
          ? [
              R(TREASURY, 'happy', 'New revenue, and an incentive to rent empty homes out.'),
              R(OWNERS, 'angry', 'Owners will be paying for paperwork as much as for empty homes.'),
            ]
          : [
              R(OWNERS, 'happy', 'A welcome relief for owners.'),
              R(TREASURY, 'neutral', 'That revenue will have to come from somewhere else.'),
            ],
      };
    }
    case 'upzone': {
      const zone = zoneNames[e.zone ?? 0] ?? 'A zone';
      return {
        weight: 6,
        headline:
          e.value === 2
            ? `${zone} upzoned aggressively: towers allowed near transit`
            : `${zone} upzoned: more homes allowed per lot`,
        reactions: [
          R(BUILDERS, 'happy', 'Permits take time, but this is how supply gets built.'),
          R(OWNERS, 'angry', 'Nobody asked the neighbourhood.'),
        ],
      };
    }
    case 'nonMarket': {
      const up = e.value > before.nonMarket;
      return {
        weight: 5,
        headline:
          e.value === 0
            ? 'Non-market building programme paused'
            : up
              ? `Region funds ${e.value} non-market homes a quarter`
              : `Non-market programme scaled back to ${e.value} homes a quarter`,
        reactions: up
          ? [
              R(TENANTS, 'happy', 'Homes priced for the people who live here.'),
              R(TREASURY, 'neutral', 'A real cost every quarter. We will keep count.'),
            ]
          : [
              R(TREASURY, 'happy', 'Spending under control.'),
              R(TENANTS, 'angry', 'The waiting list just got longer.'),
            ],
      };
    }
    case 'enforcement': {
      const up = e.value > before.enforcement;
      return {
        weight: 4,
        headline: up
          ? 'Bylaw officers step up short-term rental inspections'
          : 'Short-term rental inspections scaled back',
        reactions: up
          ? [
              R(TENANTS, 'happy', 'Rules only matter if someone checks.'),
              R(HOSTS, 'angry', 'Inspectors at the door for a weekend rental?'),
            ]
          : [
              R(TREASURY, 'happy', 'Lower enforcement costs this quarter.'),
              R(TENANTS, 'neutral', 'Fewer inspectors means fewer illegal listings found.'),
            ],
      };
    }
    default:
      return null;
  }
}

/** The edition printed at the end of `turn` (1-based). */
export function makeNews(opts: {
  turn: number;
  events: PolicyEvent[];
  before: Decision;
  zoneNames: string[];
  view: ResearcherView;
}): NewsItem {
  const stories = opts.events
    .map((e) => story(e, opts.before, opts.zoneNames))
    .filter((s): s is Story => s !== null)
    .sort((a, b) => b.weight - a.weight);

  // What the published data showed: a headline if nothing was decided, else a line under it.
  const latest = opts.view.covered[opts.view.covered.length - 1];
  const change = lastChange(opts.view.covered);
  let dataHeadline: string;
  let dataLine: string | null;
  if (latest?.hollow) {
    dataHeadline = 'Listing scrape comes back incomplete; analysts set it aside';
    dataLine = 'This quarter’s listing snapshot was flagged incomplete and is left out.';
  } else if (change === null) {
    dataHeadline = 'First listing scrape of the term is in';
    dataLine = null;
  } else if (Math.abs(change) < 3) {
    dataHeadline = 'Short-term rental listings little changed in the latest scrape';
    dataLine = `Covered-area listings ${change >= 0 ? '+' : '−'}${pctText(change)} on the quarter.`;
  } else {
    dataHeadline = `Covered-area short-term rental listings ${change > 0 ? 'up' : 'down'} ${pctText(change)} in the latest scrape`;
    dataLine = `Covered-area listings ${change > 0 ? 'rose' : 'fell'} ${pctText(change)} in the latest scrape.`;
  }
  const lines: string[] = [];
  // Without a story the headline already says it, except for the small change's number.
  if (dataLine && (stories.length > 0 || (change !== null && Math.abs(change) < 3)))
    lines.push(dataLine);
  const cpi = opts.view.cpi;
  if (cpi.length >= 2) {
    const d = cpi[cpi.length - 1]!.y - cpi[cpi.length - 2]!.y;
    lines.push(
      `Published rent index ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} points on the quarter (a noisy series).`,
    );
  }

  // Up to two reactions: from the biggest stories first, one per stakeholder.
  const reactions: Reaction[] = [];
  for (const s of stories)
    for (const r of s.reactions)
      if (reactions.length < 2 && !reactions.some((x) => x.who === r.who)) reactions.push(r);

  return {
    turn: opts.turn,
    headline: stories[0]?.headline ?? dataHeadline,
    lines,
    reactions,
  };
}
