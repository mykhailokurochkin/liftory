import { z } from 'zod';

export const equipmentSchema = z.enum([
  'machine',
  'barbell',
  'dumbbells',
  'bodyweight',
  'cable',
  'other',
]);
export const exerciseSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    equipment: equipmentSchema,
    muscleGroup: z.string().trim().max(60),
    notes: z.string().max(1000),
    archived: z.boolean(),
  })
  .strict();
export const setSchema = z
  .object({
    id: z.uuid(),
    weightKg: z.number().finite().min(0).max(2000).nullable(),
    reps: z.number().int().min(1).max(1000),
    completed: z.boolean(),
  })
  .strict();
export const workoutExerciseSchema = z
  .object({
    id: z.uuid(),
    exerciseId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    equipment: equipmentSchema,
    sets: z.array(setSchema).max(50),
  })
  .strict();
export const workoutSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(100),
    status: z.enum(['active', 'completed']),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    notes: z.string().max(2000),
    exercises: z.array(workoutExerciseSchema).max(50),
  })
  .strict()
  .superRefine((workout, context) => {
    if ((workout.status === 'completed') !== (workout.finishedAt !== null))
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Completed workouts require a finish time; active workouts must not have one.',
      });
    if (workout.finishedAt && workout.finishedAt < workout.startedAt)
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Finish time must follow start time.',
      });
    const ids = workout.exercises.flatMap((exercise) => [
      exercise.id,
      ...exercise.sets.map((set) => set.id),
    ]);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['exercises'],
        message: 'Exercise and set IDs must be unique.',
      });
  });
export const templateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    exercises: z.array(workoutExerciseSchema).max(50),
    archived: z.boolean(),
  })
  .strict();
export const recordDataSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exercise'), data: exerciseSchema }).strict(),
  z.object({ kind: z.literal('workout'), data: workoutSchema }).strict(),
  z.object({ kind: z.literal('template'), data: templateSchema }).strict(),
]);
export const syncMutationSchema = z
  .object({
    ownerId: z.string().min(1).max(200),
    mutationId: z.uuid(),
    baseVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    entity: recordDataSchema,
  })
  .strict();
export const serverRecordSchema = z
  .object({
    entity: recordDataSchema,
    version: z.number().int().min(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const syncAckSchema = z
  .object({ mutationId: z.uuid(), record: serverRecordSchema })
  .strict();
export const authUserSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  email: z.email(),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutSet = z.infer<typeof setSchema>;
export type WorkoutTemplate = z.infer<typeof templateSchema>;
export type RecordEntity = z.infer<typeof recordDataSchema>;
export type RecordKind = RecordEntity['kind'];
export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type ServerRecord = z.infer<typeof serverRecordSchema>;
export type SyncAck = z.infer<typeof syncAckSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;

export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + canonicalJSON((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
