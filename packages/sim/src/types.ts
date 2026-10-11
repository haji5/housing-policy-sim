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

/** Host class of an investor unit (principal-residence hosts are SINGLE). */
export const HostClass = {
  SINGLE: 0,
  MULTI: 1,
  COMMERCIAL: 2,
} as const;
export type HostClassCode = (typeof HostClass)[keyof typeof HostClass];

/** Provincial registry status of a listing (Phase 2). */
export const RegStatus = {
  NONE: 0,
  REGISTERED: 1,
  /** Listing shows "Exempt" instead of a registration number. */
  EXEMPT_CLAIM: 2,
} as const;

/**
 * Who owns a dwelling's rental use (ADR 0008). Investor units make the STR/LTR/VACANT/SELL
 * choice; purpose-built rentals (completed rental construction) and non-market homes are always
 * long-term rentals, the latter at a below-market rent.
 */
export const RentalKind = {
  INVESTOR: 0,
  NON_MARKET: 1,
  PURPOSE_BUILT: 2,
} as const;

/** Rent-increase cap lever (PLAN §5.8): nominal annual caps in params.rental. */
export const RentCap = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
} as const;

/** Upzoning lever per zone: starts multipliers in params.dev, after a permit delay. */
export const Upzone = {
  NONE: 0,
  MODERATE: 1,
  AGGRESSIVE: 2,
} as const;

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
  /**
   * Share of those listings that are hosts' principal residences (legal under the rule).
   * Optional: when absent, params.host.prShare applies (a calibrated parameter).
   */
  prShareOfListings?: number;
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
  /**
   * Months of model spin-up before the first recorded tick (no policy; ASCs and matching
   * efficiencies adapt so STR shares and vacancy settle at their observed starting values).
   */
  spinUpMonths?: number;
  /** Share of all starting listings run by multi-listing hosts (DATA where available). */
  multiHostShare?: number;
  /** Researcher-view observation calendar used for calibration moments. */
  observation?: {
    /** Ticks with an Inside Airbnb-style snapshot (relative to the scenario start). */
    snapshotTicks: number[];
    /** Reference snapshot for indices and event studies (last pre-announcement snapshot). */
    refTick: number;
  };
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
    /** PR share of starting listings in zones whose scenario spec leaves it open. */
    prShare: number;
    /** Added to complianceBase for multi-listing and commercial hosts. */
    multiComplianceShift: number;
    /** Share of multi-listing investor units run by commercial operators. */
    commercialShareOfMulti: number;
    /** Revenue sensitivity multiplier of commercial operators. */
    commercialBetaMult: number;
    /**
     * Investor entry into zones without the rule: monthly probability that a non-listing
     * owner-occupied home is bought by an investor, per unit of proportional STR profit gain.
     */
    investorEntry: number;
    /** Starting share of investor-owned units held vacant off the market (calibrated). */
    vacantHeldShare: number;
    /** Annual share of investor units sold to owner-occupiers in the steady state (calibrated). */
    sellRateAnnual: number;
    /**
     * Years of expected rent growth foregone that investors weigh when a nominal rent cap is
     * below inflation plus expected real market growth (cuts expected LTR revenue).
     */
    capPenaltyYears: number;
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
    /** Months between the registry opening and platforms starting to de-list. */
    delistLagTicks: number;
    /** Monthly probability a legal, unregistered listing registers (registry regime). */
    regTakeup: number;
    /** Share of hosts who show "Exempt" in place of a registration number (fixed draw). */
    exemptClaimShare: number;
  };
  str: {
    occMax: number;
    /** Share of tourist demand displaced from covered zones that shifts to exempt zones. */
    demandSpillover: number;
    /** Common annual growth of tourist STR demand from tick 0 (all zones). */
    demandGrowthAnnual: number;
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
    /** General (all-items) inflation, annual. The model runs in real terms; caps are nominal. */
    inflationAnnual: number;
    /** Nominal annual rent-increase cap under the Low and High settings (Medium = rentCapAnnual). */
    rentCapLow: number;
    rentCapHigh: number;
    /** Tenants whose rent is below market move less: moveHazard * exp(-k * discount). */
    mobilityDiscountElasticity: number;
    /** Rent of non-market units as a share of the zone's market rent. */
    nonMarketRentShare: number;
  };
  dev: {
    /** Baseline housing starts per year as a share of each zone's starting stock. */
    startsAnnualShare: number;
    /** Construction lag, months, uniform on [lagMin, lagMax]. */
    lagMin: number;
    lagMax: number;
    /** Elasticity of starts to the zone's real asking rent (relative to its starting level). */
    rentElasticity: number;
    /** Semi-elasticity of starts to the policy rate, per percentage point above rateRef. */
    rateSemiElasticity: number;
    /** Policy rate (%) at which starts run at their baseline. */
    rateRef: number;
    /** Starts multipliers for Moderate and Aggressive upzoning (after the permit delay). */
    upzoneModerate: number;
    upzoneAggressive: number;
    /** Months between an upzoning decision and the new zoning being usable. */
    permitDelayTicks: number;
    /** Elasticity of rental starts to the rent-cap factor on expected LTR revenue. */
    capElasticity: number;
  };
  fiscal: {
    /** Assessed value of a typical home, $k (vacancy tax base). */
    assessedValue: number;
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

export type Lever =
  | 'strRegime'
  | 'enforcement'
  | 'announced'
  | 'vacancyTax'
  | 'rentCap'
  | 'upzone'
  | 'nonMarket'
  | 'shock';

/**
 * A change taking effect at `tick`. `zone` is required for 'upzone'. 'shock' events carry a
 * shock-card code (shocks.ts) as `value`; their effects last for the card's duration.
 */
export interface PolicyEvent {
  tick: number;
  lever: Lever;
  value: number;
  zone?: number;
}

export interface LeverState {
  strRegime: StrRegimeCode;
  enforcement: number;
  announced: number;
  /** Vacancy tax, percent of assessed value per year (0..3). */
  vacancyTax: number;
  /** RentCap code. */
  rentCap: number;
  /** Upzone code per zone (missing = NONE). */
  upzone: number[];
  /** Non-market homes started per quarter, real units. */
  nonMarket: number;
  /** Shock-card codes in force. */
  shocks: number[];
}

// ---------------------------------------------------------------------------------------------
// State

export interface Dwellings {
  n: number;
  /**
   * Stable RNG key of each dwelling: its index for the starting stock, a birth key (start tick,
   * zone, order) for construction. Keeps draws common across counterfactual runs even when the
   * number of starts differs (CRN).
   */
  key: Int32Array;
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
  /** RegStatus of the listing. */
  registered: Uint8Array;
  hostClass: Uint8Array;
  /** 1 if the host would claim "Exempt" on the registry (fixed draw). */
  claimsExempt: Uint8Array;
  /** Tick at which a CONSTRUCTION unit completes. */
  completeTick: Int32Array;
  /** 1 for units under construction that are destined for owner-occupiers. */
  forOwner: Uint8Array;
  /** RentalKind code (0 for the starting stock and owner-occupied construction). */
  rentalKind: Uint8Array;
  /** Tick at which an owner-occupied home is bought by a small investor (geometric waiting time). */
  buyTick: Int32Array;
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
  /** Alternative-specific constant for investor STR (vs LTR), per HostClass. */
  ascStr: number[];
  /** Tourist demand at tick 0, before common growth. */
  strDemand0: number;
  /** Net STR revenue at the start (reference for investor entry). */
  strNet0: number;
  /** Alternative-specific constant for principal-residence listing (vs not listing). */
  ascPr: number;
  baselineServedStr: number;
  /** ASCs of holding an investor unit vacant and of selling it, relative to LTR. */
  ascVac: number;
  ascSell: number;
  /** Monthly probability an owner-occupied, non-listing home is bought by an investor. */
  buyProb: number;
  /** Baseline starts per month (agents) and the asking rent they are referenced to. */
  startsBase: number;
  rentRef: number;
  /** Share of completions that become rentals (the zone's renter share of stock). */
  rentalShare: number;
}

export interface Derived {
  coveredNow: boolean[];
  detectProb: number;
  strNet: number[];
  ltrNet: number[];
  /** LTR vacancy rate per zone (vacant LTR / all LTR). */
  vacancy: number[];
  /** Policy rate (%) this tick, including shock adjustments. */
  policyRate: number;
  /** Vacancy tax per held-vacant unit, $k/month. */
  vacancyTaxMonthly: number;
  /** Upzoning starts multiplier per zone in force this tick (after the permit delay). */
  upzoneMult: number[];
  /** Expected-LTR-revenue factor from the rent cap (1 = cap does not bind). */
  capFactor: number[];
  /** Shock effects in force. */
  shock: ShockEffects;
}

/** Multipliers and shifts applied by active shock cards (1 / 0 = no effect). */
export interface ShockEffects {
  rateShift: number;
  arrivalsMult: number;
  incomeMult: number;
  detectMult: number;
  strDemandMult: number;
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
    strRegistered: number;
    strExemptClaim: number;
    strMulti: number;
    vacantHeld: number;
    construction: number;
    starts: number;
    completions: number;
    sales: number;
    nonMarket: number;
    dwellings: number;
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
  vacancyTaxRevenue: number;
  policyRate: number;
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
    /** Asking-rent level (fixed weights) that renter arrivals respond to. */
    askingRent: number;
    /** Bases of the reported indices (= 100); reset at the end of spin-up. */
    cpiIndexBase: number;
    askingIndexBase: number;
    arrivalsPerMonth: number;
    /** Initial renter households per zone: fixed Laspeyres weights and arrival zone preferences. */
    renterWeights: number[];
    /** Expected rental completions per month at reference conditions (arrivals grow with them). */
    rentalCompletionsPerMonth: number;
  };
  history: TickRecord[];
  /** Per-tick accumulators reset at the start of each tick. */
  acc: {
    fines: number;
    vacancyTax: number;
    starts: number[];
    completions: number[];
    sales: number[];
  };
}

// ---------------------------------------------------------------------------------------------
// Run I/O

export interface RunConfig {
  scenario: Scenario | string;
  params: Params;
  seed: number;
  policy: PolicyEvent[] | string;
  /** Run this many months before tick 0 (negative ticks), e.g. to observe pre-trends. */
  preTicks?: number;
}

export interface ZoneSeries {
  name: string;
  covered: boolean;
  optInTick?: number;
  strListings: number[];
  strPrincipal: number[];
  strIllegal: number[];
  ltrOccupied: number[];
  ltrVacant: number[];
  ownerOcc: number[];
  marketRent: number[];
  occupancy: number[];
  strRegistered: number[];
  strExemptClaim: number[];
  strMulti: number[];
  vacantHeld: number[];
  construction: number[];
  starts: number[];
  completions: number[];
  sales: number[];
  nonMarket: number[];
  dwellings: number[];
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
    /** Tick of the first recorded month (negative with pre-ticks). */
    firstTick: number;
    observation?: Scenario['observation'];
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
    vacancyTaxRevenue: number[];
    policyRate: number[];
  };
}
