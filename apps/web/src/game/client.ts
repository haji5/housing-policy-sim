import type { PolicyEvent } from '@zoned-out/sim';
import type { Snapshot, WorkerRequest, WorkerResponse, WorldLayout } from './protocol.ts';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

/** Promise wrapper around the sim worker. One request in flight per id. */
export class SimClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL('../workers/sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.type === 'error') p.reject(new Error(ev.data.message));
      else p.resolve(ev.data);
    };
    this.worker.onerror = (ev) => {
      for (const p of this.pending.values()) p.reject(new Error(ev.message));
      this.pending.clear();
    };
  }

  private request(msg: DistributiveOmit<WorkerRequest, 'id'>): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id } as WorkerRequest);
    });
  }

  async init(scenario: string, seed: number): Promise<{ layout: WorldLayout; snapshot: Snapshot }> {
    const r = await this.request({ type: 'init', scenario, seed });
    if (r.type !== 'init') throw new Error('unexpected response');
    return { layout: r.layout, snapshot: r.snapshot };
  }

  async advance(events: PolicyEvent[], ticks: number): Promise<Snapshot> {
    const r = await this.request({ type: 'advance', events, ticks });
    if (r.type !== 'advance') throw new Error('unexpected response');
    return r.snapshot;
  }

  dispose(): void {
    this.worker.terminate();
  }
}
