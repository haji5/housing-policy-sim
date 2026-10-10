import { observe } from './observe.ts';
import { applyEnforcement, updateDerived } from './systems/enforcement.ts';
import { exogenousUpdate } from './systems/exogenous.ts';
import { hostDecisions } from './systems/hosts.ts';
import { householdUpdate } from './systems/households.ts';
import { rentalMarket } from './systems/rentalMarket.ts';
import type { SimState, TickRecord } from './types.ts';

/**
 * Advance one monthly tick. Subsystems run in the fixed order of PLAN §5.3:
 * exogenous -> policy/enforcement -> hosts -> (developers, M5) -> rental market -> households ->
 * observe. Agents are always iterated in ascending id order.
 */
export function stepSim(state: SimState): TickRecord {
  state.acc.fines = 0;
  exogenousUpdate(state);
  updateDerived(state);
  applyEnforcement(state);
  hostDecisions(state);
  rentalMarket(state);
  householdUpdate(state);
  updateDerived(state);
  const record = observe(state);
  state.history.push(record);
  state.tick++;
  return record;
}
