import type { LeverState, PolicyEvent, RunOutput } from '@zoned-out/sim';

/** Messages between the UI thread and the sim worker. */
export type WorkerRequest =
  | { id: number; type: 'init'; scenario: string; seed: number }
  | { id: number; type: 'advance'; events: PolicyEvent[]; ticks: number };

export interface Snapshot {
  tick: number;
  date: string;
  levers: LeverState;
  series: RunOutput['series'];
  /** Tenure code per dwelling (copy, transferred). */
  tenure: Uint8Array;
  /** 1 if the dwelling is a host's principal residence. */
  principalRes: Uint8Array;
  /** Occupied (has a tenant) per dwelling. */
  occupied: Uint8Array;
}

export interface WorldLayout {
  zone: Uint8Array;
  zoneNames: string[];
  zoneCovered: boolean[];
  start: { year: number; month: number };
  /** Calibrated parameter set used for this game (-1 = uncalibrated defaults). */
  ensembleMember: number;
  ensembleSize: number;
}

export type WorkerResponse =
  | { id: number; type: 'init'; layout: WorldLayout; snapshot: Snapshot }
  | { id: number; type: 'advance'; snapshot: Snapshot }
  | { id: number; type: 'error'; message: string };
