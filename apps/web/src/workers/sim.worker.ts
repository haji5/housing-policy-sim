/// <reference lib="webworker" />
import {
  addPolicyEvents,
  collectOutput,
  createSim,
  DEFAULT_PARAMS,
  leversAt,
  stepSim,
  tickToLabel,
} from '@zoned-out/sim';
import type { SimState } from '@zoned-out/sim';
import type { Snapshot, WorkerRequest, WorkerResponse } from '../game/protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

let sim: SimState | null = null;

function snapshot(s: SimState): Snapshot {
  const dw = s.dwellings;
  const occupied = new Uint8Array(dw.n);
  for (let d = 0; d < dw.n; d++) occupied[d] = dw.tenant[d]! >= 0 ? 1 : 0;
  return {
    tick: s.tick,
    date: tickToLabel(s.scenario.start, s.tick),
    levers: leversAt(s.policy, s.tick),
    series: collectOutput(s).series,
    tenure: dw.tenure.slice(0, dw.n),
    principalRes: dw.principalRes.slice(0, dw.n),
    occupied,
  };
}

function reply(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function buffers(s: Snapshot): Transferable[] {
  return [s.tenure.buffer, s.principalRes.buffer, s.occupied.buffer];
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'init') {
      sim = createSim({
        scenario: req.scenario,
        params: DEFAULT_PARAMS,
        seed: req.seed,
        policy: [],
      });
      const snap = snapshot(sim);
      reply(
        {
          id: req.id,
          type: 'init',
          layout: {
            zone: sim.dwellings.zone.slice(0, sim.dwellings.n),
            zoneNames: sim.zones.map((z) => z.spec.name),
            zoneCovered: sim.zones.map((z) => z.spec.covered),
            start: sim.scenario.start,
          },
          snapshot: snap,
        },
        buffers(snap),
      );
      return;
    }
    if (!sim) throw new Error('Sim not initialised');
    addPolicyEvents(sim, req.events);
    for (let i = 0; i < req.ticks; i++) stepSim(sim);
    const snap = snapshot(sim);
    reply({ id: req.id, type: 'advance', snapshot: snap }, buffers(snap));
  } catch (err) {
    reply({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
