// Builds packages/sim/src/scenarios/victoria.json. Run: node tools/scenario/build-victoria.mjs
// Provenance of every input is in docs/ASSUMPTIONS.md (V1-V12).
import { writeFileSync } from 'node:fs';

// V1 DATA: entire-home active listings by neighbourhood, Inside Airbnb Victoria 2023-08-27
// (bc-str-ban-analysis data/fixtures/calibration_anchors.json), grouped into zones.
// V2 VERIFY: 2021 Census populations (Wikipedia "Capital Regional District", citing StatCan).
// V3 ASSUMED: Downtown/Harris Green/James Bay = 20% of the City of Victoria's population.
// V4 ASSUMED: renter-household rates by zone (only the CRD total is data).
const victoriaCity = 91867;
const zones = [
  {
    name: 'Downtown & James Bay',
    hoods: { Downtown: 649, 'Harris Green': 72, 'James Bay': 126 },
    pop: 0.2 * victoriaCity,
    renterRate: 0.75,
    covered: true,
  },
  {
    name: 'Inner Victoria & Esquimalt',
    hoods: {
      Fairfield: 88,
      Fernwood: 54,
      'Victoria West': 51,
      Gonzales: 27,
      Oaklands: 24,
      'North Park': 25,
      Rockland: 25,
      'North Jubilee': 15,
      Burnside: 14,
      'Hillside/Quadra': 12,
      'South Jubilee': 7,
      Esquimalt: 117,
      'View Royal': 61,
    },
    pop: 0.8 * victoriaCity + 17533 + 11575,
    renterRate: 0.55,
    covered: true,
  },
  {
    name: 'Saanich & Oak Bay',
    hoods: { Saanich: 657, 'Oak Bay': 54 },
    pop: 117735 + 17990,
    renterRate: 0.3,
    covered: true,
  },
  {
    name: 'Westshore & Sooke',
    hoods: { Langford: 357, Colwood: 130, Metchosin: 42, Highlands: 8, Sooke: 219 },
    pop: 46584 + 18961 + 5067 + 2482 + 15086,
    renterRate: 0.28,
    covered: true,
  },
  {
    name: 'Saanich Peninsula',
    hoods: { 'North Saanich': 123, 'Central Saanich': 93, Sidney: 83 },
    pop: 12235 + 17385 + 12318,
    renterRate: 0.22,
    covered: true,
  },
  {
    name: 'Juan de Fuca',
    hoods: { 'Juan de Fuca': 334 },
    pop: 5531,
    renterRate: 0.15,
    covered: false,
  },
  {
    name: 'Southern Gulf Islands',
    hoods: { 'Southern Gulf Islands': 166 },
    pop: 6101,
    renterRate: 0.15,
    covered: false,
  },
  // V5 DATA: Salt Spring opted in to the principal-residence requirement from 1 Nov 2025
  // (bc-str-ban-analysis src/config.py) = tick 26 from Sep 2023.
  {
    name: 'Salt Spring Island',
    hoods: { 'Salt Spring Island': 258 },
    pop: 11635,
    renterRate: 0.18,
    covered: false,
    optInTick: 26,
  },
];

const TOTAL_DWELLINGS = 198435; // V6 VERIFY: CRD total private dwellings, 2021 (Wikipedia/StatCan)
const RENTER_HOUSEHOLDS = 66000; // V7 DATA: bc-str-ban-analysis docs/data/rent_bound.json
const popTotal = zones.reduce((a, z) => a + z.pop, 0);
const renterW = zones.reduce((a, z) => a + z.pop * z.renterRate, 0);

const scenario = {
  id: 'victoria',
  name: 'Victoria CRD 2023 (stylised, 8 zones)',
  start: { year: 2023, month: 9 },
  // V8 DATA: multi-listing-host share of Victoria entire homes, Aug 2023 (supply.json).
  multiHostShare: 0.4605,
  // ADR 0005: spin-up months before Jun 2022 (no policy; constants settle, then freeze).
  spinUpMonths: 24,
  initialSearchingShare: 0.03,
  rentDriftAnnual: 0.0,
  // Inside Airbnb snapshot months as ticks from Sep 2023 (supply.json), Jun 2022 - Jun 2026.
  // Mar 2026 (tick 30) is excluded: flagged incomplete in the first project.
  observation: {
    snapshotTicks: [-15, -12, -9, -3, -1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 33],
    refTick: -1,
  },
  zones: zones.map((z) => {
    const dwellings = Math.round((TOTAL_DWELLINGS * z.pop) / popTotal);
    return {
      name: z.name,
      covered: z.covered,
      ...(z.optInTick !== undefined ? { optInTick: z.optInTick } : {}),
      dwellings,
      renterHouseholds: Math.round((RENTER_HOUSEHOLDS * z.pop * z.renterRate) / renterW),
      strListings: Object.values(z.hoods).reduce((a, b) => a + b, 0),
      // V9 DATA-anchored: CMHC 2024 avg 2-bed rent $1,993 (cmhc_rms_benchmarks.csv), rounded.
      marketRent: 2.0,
      // V10 DATA: median entire-home nightly price Aug 2023, CRD ($179, calibration_anchors.json).
      nightlyRate: 0.179,
      // V11 ASSUMED: baseline occupancy.
      occupancy: 0.5,
      // V12 ASSUMED: zoning capacity 10% above the current stock (used from M5).
      capacity: Math.round(dwellings * 1.1),
    };
  }),
};
const covered = scenario.zones.filter((z) => z.covered).reduce((a, z) => a + z.strListings, 0);
const never = scenario.zones
  .filter((z) => !z.covered && z.optInTick === undefined)
  .reduce((a, z) => a + z.strListings, 0);
if (covered !== 3133 || never !== 500)
  throw new Error(`zone listings ${covered}/${never} != 3133/500`);
writeFileSync(
  new URL('../../packages/sim/src/scenarios/victoria.json', import.meta.url),
  JSON.stringify(scenario, null, 2) + '\n',
);
console.log(
  scenario.zones
    .map((z) => `${z.name}: D=${z.dwellings} R=${z.renterHouseholds} STR=${z.strListings}`)
    .join('\n'),
);
