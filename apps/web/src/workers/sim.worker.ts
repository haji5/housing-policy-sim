/// <reference lib="webworker" />
import {
  addPolicyEvents,
  collectOutput,
  createSim,
  ENSEMBLE,
  leversAt,
  outcomes,
  paramsForSeed,
  stepSim,
  tickToLabel,
} from '@zoned-out/sim';
import type { SimState } from '@zoned-out/sim';
import type { Snapshot, WorkerRequest, WorkerResponse } from '../game/protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

/** The player's sim and its no-policy twin (same seed, parameters and shocks), in lockstep. */
let player: SimState | null = null;
let base: SimState | null = null;

function snapshot(s: SimState): Snapshot {
  const dw = s.dwellings;
  const occupied = new Uint8Array(dw.n);
  for (let d = 0; d < dw.n; d++) occupied[d] = dw.tenant[d]! >= 0 ? 1 : 0;
  return {
    tick: s.tick,
    date: tickToLabel(s.scenario.start, s.tick),
    levers: leversAt(s.policy, s.tick),
    series: collectOutput(s).series,
    zone: dw.zone.slice(0, dw.n),
    tenure: dw.tenure.slice(0, dw.n),
    principalRes: dw.principalRes.slice(0, dw.n),
    occupied,
  };
}

function reply(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function buffers(s: Snapshot): Transferable[] {
  return [s.zone.buffer, s.tenure.buffer, s.principalRes.buffer, s.occupied.buffer];
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'init') {
      // Each seed plays one calibrated parameter set, so model uncertainty varies across games.
      const { params, member } = paramsForSeed(req.seed);
      player = createSim({ scenario: req.scenario, params, seed: req.seed, policy: [] });
      base = createSim({ scenario: req.scenario, params, seed: req.seed, policy: [] });
      addPolicyEvents(player, req.shocks);
      addPolicyEvents(base, req.shocks);
      const snap = snapshot(player);
      reply(
        {
          id: req.id,
          type: 'init',
          layout: {
            zoneNames: player.zones.map((z) => z.spec.name),
            zoneCovered: player.zones.map((z) => z.spec.covered),
            zoneDwellings: player.zones.map((z) => z.spec.dwellings),
            zoneRenters: player.zones.map((z) => z.spec.renterHouseholds),
            start: player.scenario.start,
            ensembleMember: member,
            ensembleSize: ENSEMBLE.sets.length,
            scale: player.params.scale,
          },
          snapshot: snap,
        },
        buffers(snap),
      );
      return;
    }
    if (!player || !base) throw new Error('Sim not initialised');
    if (req.type === 'finish') {
      reply({
        id: req.id,
        type: 'finish',
        final: { policy: outcomes(collectOutput(player)), base: outcomes(collectOutput(base)) },
      });
      return;
    }
    addPolicyEvents(player, req.events);
    for (let i = 0; i < req.ticks; i++) {
      stepSim(player);
      stepSim(base);
    }
    const snap = snapshot(player);
    reply({ id: req.id, type: 'advance', snapshot: snap }, buffers(snap));
  } catch (err) {
    reply({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
