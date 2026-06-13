/**
 * Tiny in-repo Gherkin runner for behaviour-driven backend tests.
 *
 * Why in-repo: the off-the-shelf vitest-cucumber package (6.5.0) ships a broken
 * ESM resolution, and we want zero surprises in CI. This is ~80 lines, reads real
 * `.feature` files, and maps each step to a registered definition, turning every
 * Scenario into a vitest `describe`/`it` so failures point at the failing step.
 *
 * Supported subset (enough for API behaviour specs):
 *   Feature, Scenario, Given/When/Then/And/But, Background, and a per-step
 *   shared `world` object passed to every step in a scenario.
 *
 * Usage:
 *   const feature = loadFeature(resolve(__dirname, 'features/x.feature'))
 *   runFeature(feature, ({ given, when, then }) => {
 *     given('a user named {string}', (world, name) => { ... })
 *     when('they GET {string}', async (world, path) => { ... })
 *     then('the response status is {int}', (world, code) => { ... })
 *   })
 */
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';

export type World = Record<string, unknown>;
type StepFn = (world: World, ...args: (string | number)[]) => void | Promise<void>;

interface Step { keyword: string; text: string }
interface Scenario { name: string; steps: Step[] }
export interface Feature { name: string; background: Step[]; scenarios: Scenario[] }

/** Parse a .feature file into a structured Feature. */
export function loadFeature(path: string): Feature {
  const lines = readFileSync(path, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const feature: Feature = { name: '', background: [], scenarios: [] };
  let bucket: 'background' | 'scenario' | null = null;
  let current: Scenario | null = null;
  for (const line of lines) {
    if (line.startsWith('Feature:')) { feature.name = line.slice(8).trim(); continue; }
    if (line.startsWith('Background:')) { bucket = 'background'; continue; }
    if (line.startsWith('Scenario:')) {
      current = { name: line.slice(9).trim(), steps: [] };
      feature.scenarios.push(current);
      bucket = 'scenario';
      continue;
    }
    const m = /^(Given|When|Then|And|But)\s+(.*)$/.exec(line);
    if (m) {
      const step = { keyword: m[1], text: m[2] };
      if (bucket === 'background') feature.background.push(step);
      else if (current) current.steps.push(step);
    }
  }
  return feature;
}

/** Turn a Gherkin step pattern ("a user named {string}") into a matcher. */
function compile(pattern: string): { re: RegExp } {
  const re = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{string\\\}/g, '"([^"]*)"')
    .replace(/\\\{int\\\}/g, '(-?\\d+)');
  return { re: new RegExp(`^${re}$`) };
}

interface Registry { steps: { re: RegExp; fn: StepFn }[] }

function resolveStep(reg: Registry, text: string): { fn: StepFn; args: (string | number)[] } {
  for (const s of reg.steps) {
    const match = s.re.exec(text);
    if (match) {
      const args = match.slice(1).map(a => (/^-?\d+$/.test(a) ? Number(a) : a));
      return { fn: s.fn, args };
    }
  }
  throw new Error(`No step definition matches: "${text}"`);
}

export interface StepApi {
  given: (pattern: string, fn: StepFn) => void;
  when: (pattern: string, fn: StepFn) => void;
  then: (pattern: string, fn: StepFn) => void;
}

/**
 * Run a parsed Feature against step definitions. Each Scenario is a single
 * vitest `it` that runs its Background + steps in order on one shared `world`,
 * so state flows naturally from Given → When → Then. A failing step throws with
 * its Gherkin line prefixed, so the report still points at the exact step.
 *
 * DB isolation is the test file's job: register a `beforeEach(resetTestDb)` so
 * every scenario starts from a clean database (mirrors the integration suites).
 */
export function runFeature(feature: Feature, define: (api: StepApi) => void): void {
  const reg: Registry = { steps: [] };
  const add = (pattern: string, fn: StepFn) => reg.steps.push({ ...compile(pattern), fn });
  define({ given: add, when: add, then: add });

  describe(`Feature: ${feature.name}`, () => {
    for (const scenario of feature.scenarios) {
      it(`Scenario: ${scenario.name}`, async () => {
        const world: World = {};
        for (const step of [...feature.background, ...scenario.steps]) {
          const { fn, args } = resolveStep(reg, step.text);
          try {
            await fn(world, ...args);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Step failed — ${step.keyword} ${step.text}\n  ${msg}`);
          }
        }
      });
    }
  });
}
