import Dexie from 'dexie';
import type { Table } from 'dexie';


export interface LocalProfile {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  synced: number; // 0 = false, 1 = true
}

export interface LocalRoutine {
  id: string;
  user_id: string;
  name: string;
  description: string;
  deleted: number; // 0 = false, 1 = true
  created_at: string;
  updated_at: string;
  synced: number; // 0 = false, 1 = true
}

export interface LocalExercise {
  id: string;
  routine_id: string;
  name: string;
  muscle_group: string;
  series: number;
  reps: number;
  weight: number;
  deleted: number; // 0 = false, 1 = true
  created_at: string;
  updated_at: string;
  synced: number; // 0 = false, 1 = true
}

export interface LocalWorkoutLog {
  id: string;
  exercise_id: string;
  weight_lifted: number;
  reps_done: number;
  logged_at: string;
  deleted: number; // 0 = false, 1 = true
  created_at: string;
  updated_at: string;
  synced: number; // 0 = false, 1 = true
}

class GymDatabase extends Dexie {
  profiles!: Table<LocalProfile>;
  routines!: Table<LocalRoutine>;
  exercises!: Table<LocalExercise>;
  workout_logs!: Table<LocalWorkoutLog>;

  constructor() {
    super('GymDatabase');
    this.version(1).stores({
      profiles: 'id, email, updated_at, synced',
      routines: 'id, user_id, name, deleted, updated_at, synced',
      exercises: 'id, routine_id, name, muscle_group, deleted, updated_at, synced',
      workout_logs: 'id, exercise_id, logged_at, deleted, updated_at, synced'
    });
  }
}

export const db = new GymDatabase();
