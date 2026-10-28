import { describe, expect, it } from 'vitest';
import { canonicalJSON, exerciseSchema, syncMutationSchema, workoutSchema } from './index';

const id = '72c2f433-8d5c-4b07-8fda-43474724625e';
const exercise = {
  id,
  name: 'Leg press',
  equipment: 'machine',
  muscleGroup: 'legs',
  notes: '',
  archived: false,
};
const workout = {
  id,
  title: 'Training',
  status: 'active',
  startedAt: '2026-10-27T12:00:00.000Z',
  finishedAt: null,
  notes: '',
  exercises: [],
};

describe('shared input contracts', () => {
  it('normalizes exercise names but rejects blank and unknown fields', () => {
    expect(exerciseSchema.parse({ ...exercise, name: '  Leg press  ' }).name).toBe('Leg press');
    expect(exerciseSchema.safeParse({ ...exercise, name: '  ' }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...exercise, owner: 'someone' }).success).toBe(false);
  });
  it('requires completion timestamps and consistent chronology', () => {
    expect(workoutSchema.safeParse(workout).success).toBe(true);
    expect(workoutSchema.safeParse({ ...workout, status: 'completed' }).success).toBe(false);
    expect(
      workoutSchema.safeParse({
        ...workout,
        status: 'completed',
        finishedAt: '2026-10-26T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });
  it('binds mutations to an expected account and a valid version', () => {
    const mutation = {
      ownerId: 'alice',
      mutationId: id,
      baseVersion: 0,
      entity: { kind: 'exercise', data: exercise },
    };
    expect(syncMutationSchema.safeParse(mutation).success).toBe(true);
    expect(syncMutationSchema.safeParse({ ...mutation, ownerId: '' }).success).toBe(false);
    expect(syncMutationSchema.safeParse({ ...mutation, baseVersion: -1 }).success).toBe(false);
  });
  it('fingerprints equivalent objects consistently without depending on key order', () => {
    expect(canonicalJSON({ a: 1, b: [true, { c: 2 }] })).toBe(
      canonicalJSON({ b: [true, { c: 2 }], a: 1 }),
    );
    expect(canonicalJSON({ a: 1 })).not.toBe(canonicalJSON({ a: 2 }));
  });
});
