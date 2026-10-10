# Zoned Out

A playable, browser-based housing-policy simulator: you are a provincial housing minister steering
a stylised city through a 5-year term. Underneath is an agent-based model of short-term rentals,
long-term rentals, owners and developers, to be calibrated to the causal estimates from
[bc-str-ban-analysis](https://github.com/haji5/bc-str-ban-analysis) (BC Bill 35).

> **Status:** early development. Not a forecast and not policy advice. Not affiliated with or
> commissioned by the Government of British Columbia.

## Develop

Requires Node ≥ 24 and pnpm.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm dev
```

See [docs/PLAN.md](docs/PLAN.md) for the build plan.

## Licence

Code: MIT (see [LICENSE](LICENSE)). Generated art: CC BY 4.0.
