/**
 * Lightweight BDD-style helpers over vitest for the non-Gherkin half of the
 * hybrid suite. Same Given/When/Then vocabulary, but written inline in
 * TypeScript (no .feature file) — handy for data-heavy fork features.
 *
 *   Feature('Visitor insights', () => {
 *     Scenario('a visit is recorded', async () => {
 *       const w: any = {}
 *       await Given('a published journey', () => { ... })
 *       await When('an anonymous visit is posted', async () => { ... })
 *       await Then('the insight is stored', () => { ... })
 *     })
 *   })
 */
import { describe, it } from 'vitest';

export function Feature(name: string, body: () => void): void {
  describe(`Feature: ${name}`, body);
}

export function Scenario(name: string, body: () => void | Promise<void>): void {
  it(`Scenario: ${name}`, body);
}

async function step(keyword: string, text: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Step failed — ${keyword} ${text}\n  ${msg}`);
  }
}

export const Given = (text: string, fn: () => void | Promise<void>) => step('Given', text, fn);
export const When = (text: string, fn: () => void | Promise<void>) => step('When', text, fn);
export const Then = (text: string, fn: () => void | Promise<void>) => step('Then', text, fn);
export const And = (text: string, fn: () => void | Promise<void>) => step('And', text, fn);
