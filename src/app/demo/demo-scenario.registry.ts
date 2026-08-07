import { DemoScenarioDefinition } from './demo-scenario.interface';
import { DemoScenarioId } from './demo-scenario.types';
import { newlyCreatedScenario } from './scenarios/newly-created.scenario';
import { firstSalesScenario } from './scenarios/first-sales.scenario';
import { goodPaceScenario } from './scenarios/good-pace.scenario';
import { eventDayScenario } from './scenarios/event-day.scenario';
import { finishedScenario } from './scenarios/finished.scenario';

const ALL_SCENARIOS: DemoScenarioDefinition[] = [
  newlyCreatedScenario,
  firstSalesScenario,
  goodPaceScenario,
  eventDayScenario,
  finishedScenario,
];

const BY_ID = new Map<DemoScenarioId, DemoScenarioDefinition>(
  ALL_SCENARIOS.map((s) => [s.meta.id, s]),
);

export function getAllDemoScenarios(): DemoScenarioDefinition[] {
  return ALL_SCENARIOS;
}

export function getDemoScenario(id: DemoScenarioId): DemoScenarioDefinition | undefined {
  return BY_ID.get(id);
}

export function getDefaultDemoScenario(): DemoScenarioDefinition {
  return goodPaceScenario;
}
