import type { LeverState, Outcomes, PolicyEvent, RunOutput } from '@zoned-out/sim';

/** Messages between the UI thread and the sim worker. */
export type WorkerRequest =
  | { id: number; type: 'init'; scenario: string; seed: number; shocks: PolicyEvent[] }
  | { id: number; type: 'advance'; events: PolicyEvent[]; ticks: number }
  | { id: number; type: 'finish' };

export interface Snapshot {
  tick: number;
  date: string;
  levers: LeverState;
  /** The player's run so far (true series; the UI derives the researcher view from it). */
  series: RunOutput['series'];
  /** Zone per dwelling (grows with construction). */
  zone: Uint8Array;
  /** Tenure code per dwelling (copy, transferred). */
  tenure: Uint8Array;
  /** 1 if the dwelling is a host's principal residence. */
  principalRes: Uint8Array;
  /** Occupied (has a tenant) per dwelling. */
  occupied: Uint8Array;
}

export interface WorldLayout {
  zoneNames: string[];
  zoneCovered: boolean[];
  start: { year: number; month: number };
  /** Calibrated parameter set used for this game (-1 = uncalibrated defaults). */
  ensembleMember: number;
  ensembleSize: number;
  /** Agents per real unit (params.scale); divide counts by it to show real numbers. */
  scale: number;
}

/** End of term: outcomes of the player's run and of the paired no-policy run. */
export interface Final {
  policy: Outcomes;
  base: Outcomes;
}

export type WorkerResponse =
  | { id: number; type: 'init'; layout: WorldLayout; snapshot: Snapshot }
  | { id: number; type: 'advance'; snapshot: Snapshot }
  | { id: number; type: 'finish'; final: Final }
  | { id: number; type: 'error'; message: string };
