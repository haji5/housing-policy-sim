/**
 * Core types. Agents are stored as struct-of-arrays (typed arrays) for speed; codes below are the
 * values stored in those arrays. Objects are `as const` maps (not enums) so Node can strip types.
 *
 * Money is in thousands of dollars per month throughout ($k/month).
 */

export const Tenure = {
  OWNER_OCC: 0,
  LTR: 1,
  STR: 2,
  VACANT: 3,
  CONSTRUCTION: 4,
} as const;
export type TenureCode = (typeof Tenure)[keyof typeof Tenure];

export const HouseholdStatus = {
  HOUSED: 0,
  SEARCHING: 1,
  DOUBLED_UP: 2,
  /** Left the region because of housing stress (searched longer than kLeave). Scored. */
  GONE: 3,
  /** Left the region for ordinary, non-housing reasons (exogenous hazard). Not scored. */
  LEFT: 4,
} as const;
export type HouseholdStatusCode = (typeof HouseholdStatus)[keyof typeof HouseholdStatus];

export const StrRegime = {
  OPEN: 0,
  PRINCIPAL_RESIDENCE: 1,
  PR_REGISTRY: 2,
} as const;
export type StrRegimeCode = (typeof StrRegime)[keyof typeof StrRegime];

// ---------------------------------------------------------------------------------------------
// Scenario (inputs describing a place and its starting state). Counts are real-world units and
// are multiplied by params.scale at world build.

export interface ZoneSpec {
  name: string;
  /** Principal-residence rule applies here when the regime is on. */
  covered: boolean;
  /** Tick at which an initially exempt zone opts in (e.g. Salt Spring, Nov 2025). */
  optInTick?: number;
  dwellings: number;
  renterHouseholds: number;
  /** Active entire-home STR listings at the start. */
  strListings: number;
  /** Share of those listings that are hosts' principal residences (legal under the rule). */
  prShareOfListings: number;
  /** Asking rent for a new lease, $k/month. */
  marketRent: number;
  /** Average nightly STR rate, $k/night. */
  nightlyRate: number;
  /** Baseline STR occupancy, 0..1. */
  occupancy: number;
  /** Max dwellings allowed by zoning (used from M5). */
  capacity: number;
}

export interface Scenario {
  id: string;
  name: string;
  start: { year: number; month: number };
  zones: ZoneSpec[];
  /** Share of renter households searching at the start (not housed). */
  initialSearchingShare: number;
  /** Exogenous drift in asking rents, annual (non-STR factors: incomes, rates, migration). */
  rentDriftAnnual: number;
}

// ---------------------------------------------------------------------------------------------
// Parameters (behavioural; calibrated from M3).

export interface Params {
  scale: number;
  host: {
    pReview: number;
    /** Utility per $k/month of net revenue. */
    beta: number;
    /** Gumbel scale of idiosyncratic taste shocks. */
    gumbelScale: number;
    /** Share of investor hosts who never operate an illegal STR. */
    complianceBase: number;
    /** STR operating costs as a share of gross (platform fees, cleaning, management). */
    strCostShare: number;
    strUpkeep: number;
    ltrUpkeep: number;
    /** Weight on expected penalty between announcement and the rule taking effect, 0..1. */
    anticipation: number;
    /** Monthly review probability of principal-residence hosts. */
    prReview: number;
    prBeta: number;
  };
  enforcement: {
    /** Monthly detection probability ceiling. */
    detectMax: number;
    /** Curvature of detection in the enforcement level (diminishing returns). */
    detectK: number;
    /** Fine per detection, $k. */
    fine: number;
    /** Monthly probability a platform removes an unregistered illegal listing (Phase 2). */
    delistProb: number;
    /** Registration cost for legal hosts, $k/month equivalent. */
    registrationCost: number;
  };
  str: {
    occMax: number;
    /** Share of tourist demand displaced from covered zones that shifts to exempt zones. */
    demandSpillover: number;
  };
  rental: {
    vStar: number;
    /** Monthly log-rent response to the vacancy gap (vStar - v). */
    kappa: number;
    rentCapAnnual: number;
    /** Partial adjustment of sitting-tenant rent toward market on anniversary. */
    phi: number;
    maxRentShare: number;
    moveHazard: number;
    exitHazard: number;
    searchOtherZoneProb: number;
    /** Unit quality spread: new-lease rent = marketRent * q, q ~ U(1-s, 1+s). */
    qualitySpread: number;
    /** Initial sitting-tenant discount below market, max share. */
    sittingDiscount: number;
    /** Elasticity of renter-household arrivals (in-migration + household formation) to asking rents. */
    arrivalRentElasticity: number;
    /** Semi-elasticity of arrivals to the LTR vacancy gap (v - vStar): damping of the rent cycle. */
    arrivalVacancySemiElasticity: number;
  };
  households: {
    kDouble: number;
    kLeave: number;
    /** Median renter household income, $k/month. */
    incomeMedian: number;
    /** Log-sd of renter household income. */
    incomeSigma: number;
  };
}

// ---------------------------------------------------------------------------------------------
// Policy

export type Lever = 'strRegime' | 'enforcement' | 'announced';

export interface PolicyEvent {
  tick: number;
  lever: Lever;
  value: number;
}

export interface LeverState {
  strRegime: StrRegimeCode;
  enforcement: number;
  announced: number;
}

// ---------------------------------------------------------------------------------------------
// State

export interface Dwellings {
  n: number;
  zone: Uint8Array;
  tenure: Uint8Array;
  principalRes: Uint8Array;
  /** 1 if the host never operates an illegal STR (fixed draw). */
  compliant: Uint8Array;
  /** 1 if the dwelling must make a use decision this tick (e.g. its tenant just left). */
  due: Uint8Array;
  quality: Float64Array;
  rent: Float64Array;
  tenant: Int32Array;
  leaseStart: Int32Array;
  registered: Uint8Array;
}

export interface Households {
  n: number;
  income: Float64Array;
  dwelling: Int32Array;
  status: Uint8Array;
  searchMonths: Uint16Array;
  prefZone: Uint8Array;
}

export interface ZoneState {
  spec: ZoneSpec;
  marketRent: number;
  /** Tourist demand in listing-equivalents (calibrated so occupancy starts at spec.occupancy). */
  strDemand: number;
  occupancy: number;
  /** Matching efficiency A in M = A * sqrt(S * V). */
  matchEff: number;
  /** Alternative-specific constant for investor STR (vs LTR). */
  ascStr: number;
  /** Alternative-specific constant for principal-residence listing (vs not listing). */
  ascPr: number;
  baselineServedStr: number;
}

export interface Derived {
  coveredNow: boolean[];
  detectProb: number;
  strNet: number[];
  ltrNet: number[];
  /** LTR vacancy rate per zone (vacant LTR / all LTR). */
  vacancy: number[];
}

export interface TickRecord {
  zones: {
    strListings: number;
    strPrincipal: number;
    strIllegal: number;
    ltrOccupied: number;
    ltrVacant: number;
    ownerOcc: number;
    marketRent: number;
    occupancy: number;
  }[];
  housed: number;
  searching: number;
  doubledUp: number;
  gone: number;
  left: number;
  cpiRentIndex: number;
  askingRentIndex: number;
  rentBurdenShare: number;
  fines: number;
}

export interface SimState {
  seed: number;
  tick: number;
  scenario: Scenario;
  params: Params;
  policy: PolicyEvent[];
  levers: LeverState;
  zones: ZoneState[];
  dwellings: Dwellings;
  households: Households;
  derived: Derived;
  /** Baseline values for indices. */
  base: {
    cpiQualityRent: number;
    askingRent: number;
    arrivalsPerMonth: number;
    /** Initial renter households per zone: fixed Laspeyres weights and arrival zone preferences. */
    renterWeights: number[];
  };
  history: TickRecord[];
  /** Per-tick accumulators reset at the start of each tick. */
  acc: { fines: number };
}

// ---------------------------------------------------------------------------------------------
// Run I/O

export interface RunConfig {
  scenario: Scenario | string;
  params: Params;
  seed: number;
  policy: PolicyEvent[] | string;
}

export interface ZoneSeries {
  name: string;
  covered: boolean;
  strListings: number[];
  strPrincipal: number[];
  strIllegal: number[];
  ltrOccupied: number[];
  ltrVacant: number[];
  ownerOcc: number[];
  marketRent: number[];
  occupancy: number[];
}

export interface RunOutput {
  meta: {
    scenario: string;
    seed: number;
    ticks: number;
    scale: number;
    agents: number;
    paramsHash: string;
    policy: PolicyEvent[];
  };
  series: {
    tick: number[];
    date: string[];
    zones: ZoneSeries[];
    housed: number[];
    searching: number[];
    doubledUp: number[];
    gone: number[];
    left: number[];
    cpiRentIndex: number[];
    askingRentIndex: number[];
    rentBurdenShare: number[];
    fines: number[];
  };
}
