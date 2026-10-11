/**
 * Evidence badges (PLAN §6.3) and the glossary (§6.5). Each badge ties a lever or a displayed
 * effect to where its behaviour comes from, using the tags in docs/ASSUMPTIONS.md.
 */

export type Evidence = 'measured' | 'literature' | 'assumed';

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  measured: 'Measured here',
  literature: 'Literature',
  assumed: 'Assumed',
};

export const EVIDENCE_HELP: Record<Evidence, string> = {
  measured:
    'Calibrated to the Bill 35 listing data from the first project (bc-str-ban-analysis): the model reproduces the measured fall in covered-area listings.',
  literature: 'Based on published research, cited in docs/ASSUMPTIONS.md.',
  assumed:
    'Not measured for this region. The size of the effect is a modelling assumption with wide uncertainty; treat it as a plausible story, not a forecast.',
};

/** Evidence for each lever, with a one-line reason shown in the tooltip. */
export const LEVER_EVIDENCE: Record<string, { level: Evidence; why: string }> = {
  strRegime: {
    level: 'measured',
    why: 'The listing response to the principal-residence rule and the registry is calibrated to Victoria 2023-2026 (T1-T7).',
  },
  enforcement: {
    level: 'measured',
    why: 'Detection and de-listing rates are pinned down by the same listing data; the cost per level is a game rule.',
  },
  vacancyTax: {
    level: 'assumed',
    why: 'How many homes are held empty and how owners respond to a tax are assumed (ASSUMPTIONS I2, I8).',
  },
  rentCap: {
    level: 'assumed',
    why: 'Research finds rent control reduces rental supply (Diamond, McQuade and Qian 2019); the size here is assumed (D10, I5).',
  },
  upzone: {
    level: 'assumed',
    why: 'Starts multipliers are assumed, informed by Auckland’s 2016 upzoning (not checked for this region; D8).',
  },
  nonMarket: {
    level: 'assumed',
    why: 'Below-market rent and build times are assumptions (ADR 0008).',
  },
};

export const GLOSSARY: Record<string, { term: string; text: string }> = {
  str: {
    term: 'Short-term rental (STR)',
    text: 'A whole home rented to visitors by the night (Airbnb, Vrbo). The game counts entire homes only.',
  },
  principal: {
    term: 'Principal-residence rule',
    text: 'Bill 35 (BC, May 2024): in covered areas, only the home a host lives in may be rented short-term.',
  },
  registry: {
    term: 'Provincial registry',
    text: 'From May 2025, listings need a provincial registration number; platforms remove those without one.',
  },
  asking: {
    term: 'Asking rent',
    text: 'What a new lease costs. It reacts quickly to the market but is not published officially; you can buy it.',
  },
  cpi: {
    term: 'All-tenant (CPI) rent',
    text: 'The average rent all tenants pay, as in Statistics Canada’s consumer price index. Most leases are old, so it moves slowly, and the published series is noisy.',
  },
  did: {
    term: 'Difference-in-differences (DiD)',
    text: 'Compares the change in covered areas with the change in exempt areas over the same time. If exempt areas are affected too (spillover), the estimate is biased.',
  },
  counterfactual: {
    term: 'No-policy run',
    text: 'The same city, seed, model variant and shocks with the levers left alone. Your score is the difference between your run and this one.',
  },
  variant: {
    term: 'Model variant',
    text: 'One of 300 calibrated parameter sets. They all fit the data about equally well but disagree on what the data cannot pin down.',
  },
  burden: {
    term: 'Rent burden',
    text: 'Share of renter households paying more than 30% of their income in rent.',
  },
  stress: {
    term: 'Housing stress',
    text: 'Households that searched too long: they doubled up with others or left the region.',
  },
  snapshot: {
    term: 'Scraped snapshot',
    text: 'Listing counts collected by scraping the platforms (like Inside Airbnb). Some scrapes are incomplete; analysts drop a snapshot when it is below 75% of its neighbours.',
  },
};
