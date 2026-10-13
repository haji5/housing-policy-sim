import { observe } from './observe.ts';
import { developers } from './systems/developers.ts';
import { applyEnforcement, updateDerived } from './systems/enforcement.ts';
import { exogenousUpdate } from './systems/exogenous.ts';
import { hostDecisions } from './systems/hosts.ts';
import { householdUpdate } from './systems/households.ts';
import { rentalMarket } from './systems/rentalMarket.ts';
import type { SimState, TickRecord } from './types.ts';
import { emptyAcc } from './world.ts';

/**
 * Advance one monthly tick. Subsystems run in the fixed order of ODD §3:
 * exogenous -> policy/enforcement -> hosts -> developers -> rental market -> households ->
 * observe. Agents are always iterated in ascending id order.
 */
export function stepSim(state: SimState): TickRecord {
  state.acc = emptyAcc(state.zones.length);
  exogenousUpdate(state);
  updateDerived(state);
  applyEnforcement(state);
  hostDecisions(state);
  developers(state);
  rentalMarket(state);
  householdUpdate(state);
  updateDerived(state);
  const record = observe(state);
  state.history.push(record);
  state.tick++;
  return record;
}
