import assert from 'node:assert/strict';
import test from 'node:test';

import { outputSchemaFor, ProductSchema } from '../packages/contracts/src/index.js';
import {
  parseUnderstanding,
  productFromUnderstanding,
  savedProduct,
  UnderstandingSchema,
} from '../packages/core/src/understanding.js';
import { deliveryTickets } from '../packages/reporting/src/tickets.js';

const timer = {
  method: 'test' as const,
  criteria: 'Timer error under 1 s at T+1 h, T+12 h and T+24 h, against the flight sensor driver',
};
const understanding = {
  title: 'Flight software ready for TRR',
  overview: 'Flight software requirements verified before the test readiness review.',
  milestones: ['2026-11-24: Test readiness review'],
  deliveryPlan: [
    {
      id: 'F-1',
      title: 'Separation sequence',
      outcome: 'The spacecraft detects separation and starts its mission timer.',
      kind: 'feature' as const,
      rationale: 'Everything after launch depends on separation.',
      requirementIds: ['REQ-1', 'REQ-2'],
      dependsOn: [],
    },
  ],
  requirements: [
    {
      id: 'REQ-1',
      text: 'The mission elapsed timer starts at separation and stays within 1 s for 24 hours.',
      edgeCases: [],
      sourceId: 'FSW-103',
      verification: timer,
    },
    // A provider expresses an unstated source ID and verification as null.
    {
      id: 'REQ-2',
      text: 'Actuators stay inhibited after separation.',
      edgeCases: [],
      sourceId: null,
      verification: null,
    },
  ],
  calls: [],
  settledCalls: [],
  repositories: [],
  namedRepositories: [],
  namedBranches: [],
};

void test('source IDs and verification travel from understanding into the saved requirement', () => {
  const parsed = parseUnderstanding(understanding, null);
  const { product } = productFromUnderstanding(parsed);
  assert.equal(product.requirements[0]?.sourceId, 'FSW-103');
  assert.deepEqual(product.requirements[0]?.verification, timer);
  assert.equal('sourceId' in product.requirements[1]!, false, 'null means the source gave none');
  assert.equal('verification' in product.requirements[1]!, false);
  assert.deepEqual(ProductSchema.parse(product), product);
});

void test('requirements and checkpoints saved before traceability still load', () => {
  const legacy = {
    ...understanding,
    requirements: understanding.requirements.map(({ id, text, edgeCases }) => ({
      id,
      text,
      edgeCases,
    })),
  };
  const product = savedProduct(legacy);
  assert.equal(product.requirements[0]?.sourceId, undefined);
  assert.equal(product.requirements[0]?.verification, undefined);
  const old = { overview: 'Old', milestones: [], requirements: [{ id: 'REQ-1', text: 'Old.' }] };
  assert.deepEqual(ProductSchema.parse(old), old);
});

void test('the model schema requires both fields and invalid values are sent back', () => {
  const schema = outputSchemaFor(UnderstandingSchema) as {
    properties: { requirements: { items: { required: string[] } } };
  };
  const required = schema.properties.requirements.items.required;
  assert.ok(required.includes('sourceId') && required.includes('verification'));
  /** Understanding whose first requirement has one field replaced. */
  const withFirst = (patch: Record<string, unknown>) => ({
    ...understanding,
    requirements: [{ ...understanding.requirements[0]!, ...patch }, understanding.requirements[1]!],
  });
  assert.throws(() => parseUnderstanding(withFirst({ sourceId: 'FSW 103' }), null));
  assert.throws(() =>
    parseUnderstanding(withFirst({ verification: { method: 'review', criteria: 'x' } }), null),
  );
  assert.throws(() =>
    parseUnderstanding(withFirst({ verification: { method: 'test', criteria: ' ' } }), null),
  );
});

void test('delivery tickets name the source ID and how the requirement is verified', () => {
  const product = productFromUnderstanding(parseUnderstanding(understanding, null)).product;
  const markdown = deliveryTickets(product, undefined, [])[0]!.markdown;
  assert.match(markdown, /- REQ-1 \(FSW-103\): The mission elapsed timer/);
  assert.match(markdown, /- REQ-1 verified by test: Timer error under 1 s at T\+1 h/);
  assert.match(markdown, /- REQ-2: Actuators stay inhibited/);
  assert.doesNotMatch(markdown, /REQ-2 verified by/);
});
