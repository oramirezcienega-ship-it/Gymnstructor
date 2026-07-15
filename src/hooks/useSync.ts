import { useEffect, useState, useCallback } from 'react';
import { db } from '../db/db';
import { supabase } from '../supabaseClient';

export const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';
export const GUEST_USER_EMAIL = 'invitado@gyminstructor.local';

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Inicializar perfil de invitado localmente
  const ensureGuestProfile = useCallback(async () => {
    const guest = await db.profiles.get(GUEST_USER_ID);
    if (!guest) {
      const now = new Date().toISOString();
      await db.profiles.put({
        id: GUEST_USER_ID,
        email: GUEST_USER_EMAIL,
        created_at: now,
        updated_at: now,
        synced: 0,
      });
    }
  }, []);

  // Contar registros pendientes de sincronizar
  const updatePendingCount = useCallback(async () => {
    const pProfiles = await db.profiles.where('synced').equals(0).count();
    const pRoutines = await db.routines.where('synced').equals(0).count();
    const pExercises = await db.exercises.where('synced').equals(0).count();
    const pLogs = await db.workout_logs.where('synced').equals(0).count();
    setPendingCount(pProfiles + pRoutines + pExercises + pLogs);
  }, []);

  // Subir cambios locales a Supabase
  const pushLocalChanges = useCallback(async () => {
    // 1. Sincronizar perfiles
    const unsyncedProfiles = await db.profiles.where('synced').equals(0).toArray();
    for (const profile of unsyncedProfiles) {
      const { data: serverProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();

      if (serverProfile) {
        const localTime = new Date(profile.updated_at).getTime();
        const serverTime = new Date(serverProfile.updated_at).getTime();
        if (localTime > serverTime) {
          await supabase.from('profiles').upsert({
            id: profile.id,
            email: profile.email,
            updated_at: profile.updated_at,
          });
        } else {
          await db.profiles.put({ ...serverProfile, synced: 1 });
        }
      } else {
        await supabase.from('profiles').insert({
          id: profile.id,
          email: profile.email,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        });
      }
      await db.profiles.update(profile.id, { synced: 1 });
    }

    // 2. Sincronizar rutinas
    const unsyncedRoutines = await db.routines.where('synced').equals(0).toArray();
    for (const routine of unsyncedRoutines) {
      const { data: serverRoutine } = await supabase
        .from('routines')
        .select('*')
        .eq('id', routine.id)
        .maybeSingle();

      if (serverRoutine) {
        const localTime = new Date(routine.updated_at).getTime();
        const serverTime = new Date(serverRoutine.updated_at).getTime();
        if (localTime > serverTime) {
          await supabase.from('routines').upsert({
            id: routine.id,
            user_id: routine.user_id,
            name: routine.name,
            description: routine.description,
            deleted: routine.deleted === 1,
            updated_at: routine.updated_at,
          });
        } else {
          await db.routines.put({
            ...serverRoutine,
            deleted: serverRoutine.deleted ? 1 : 0,
            synced: 1,
          });
        }
      } else {
        await supabase.from('routines').insert({
          id: routine.id,
          user_id: routine.user_id,
          name: routine.name,
          description: routine.description,
          deleted: routine.deleted === 1,
          created_at: routine.created_at,
          updated_at: routine.updated_at,
        });
      }

      if (routine.deleted === 1) {
        await db.routines.delete(routine.id);
      } else {
        await db.routines.update(routine.id, { synced: 1 });
      }
    }

    // 3. Sincronizar ejercicios
    const unsyncedExercises = await db.exercises.where('synced').equals(0).toArray();
    for (const exercise of unsyncedExercises) {
      const { data: serverExercise } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exercise.id)
        .maybeSingle();

      if (serverExercise) {
        const localTime = new Date(exercise.updated_at).getTime();
        const serverTime = new Date(serverExercise.updated_at).getTime();
        if (localTime > serverTime) {
          await supabase.from('exercises').upsert({
            id: exercise.id,
            routine_id: exercise.routine_id,
            name: exercise.name,
            muscle_group: exercise.muscle_group,
            series: exercise.series,
            reps: exercise.reps,
            weight: exercise.weight,
            deleted: exercise.deleted === 1,
            updated_at: exercise.updated_at,
          });
        } else {
          await db.exercises.put({
            ...serverExercise,
            deleted: serverExercise.deleted ? 1 : 0,
            synced: 1,
          });
        }
      } else {
        await supabase.from('exercises').insert({
          id: exercise.id,
          routine_id: exercise.routine_id,
          name: exercise.name,
          muscle_group: exercise.muscle_group,
          series: exercise.series,
          reps: exercise.reps,
          weight: exercise.weight,
          deleted: exercise.deleted === 1,
          created_at: exercise.created_at,
          updated_at: exercise.updated_at,
        });
      }

      if (exercise.deleted === 1) {
        await db.exercises.delete(exercise.id);
      } else {
        await db.exercises.update(exercise.id, { synced: 1 });
      }
    }

    // 4. Sincronizar registros de entrenamiento (Workout Logs)
    const unsyncedLogs = await db.workout_logs.where('synced').equals(0).toArray();
    for (const log of unsyncedLogs) {
      const { data: serverLog } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('id', log.id)
        .maybeSingle();

      if (serverLog) {
        const localTime = new Date(log.updated_at).getTime();
        const serverTime = new Date(serverLog.updated_at).getTime();
        if (localTime > serverTime) {
          await supabase.from('workout_logs').upsert({
            id: log.id,
            exercise_id: log.exercise_id,
            weight_lifted: log.weight_lifted,
            reps_done: log.reps_done,
            logged_at: log.logged_at,
            deleted: log.deleted === 1,
            updated_at: log.updated_at,
          });
        } else {
          await db.workout_logs.put({
            ...serverLog,
            deleted: serverLog.deleted ? 1 : 0,
            synced: 1,
          });
        }
      } else {
        await supabase.from('workout_logs').insert({
          id: log.id,
          exercise_id: log.exercise_id,
          weight_lifted: log.weight_lifted,
          reps_done: log.reps_done,
          logged_at: log.logged_at,
          deleted: log.deleted === 1,
          created_at: log.created_at,
          updated_at: log.updated_at,
        });
      }

      if (log.deleted === 1) {
        await db.workout_logs.delete(log.id);
      } else {
        await db.workout_logs.update(log.id, { synced: 1 });
      }
    }
  }, []);

  // Descargar cambios desde el servidor
  const pullServerChanges = useCallback(async () => {
    const lastSync = localStorage.getItem('last_sync_timestamp') || new Date(0).toISOString();
    const currentSyncTime = new Date().toISOString();

    // 1. Descargar perfiles
    const { data: serverProfiles } = await supabase
      .from('profiles')
      .select('*')
      .gt('updated_at', lastSync);

    if (serverProfiles) {
      for (const sProfile of serverProfiles) {
        await db.profiles.put({ ...sProfile, synced: 1 });
      }
    }

    // 2. Descargar rutinas
    const { data: serverRoutines } = await supabase
      .from('routines')
      .select('*')
      .gt('updated_at', lastSync);

    if (serverRoutines) {
      for (const sRoutine of serverRoutines) {
        const local = await db.routines.get(sRoutine.id);
        if (!local || local.synced === 1 || new Date(sRoutine.updated_at).getTime() > new Date(local.updated_at).getTime()) {
          if (sRoutine.deleted) {
            await db.routines.delete(sRoutine.id);
          } else {
            await db.routines.put({
              id: sRoutine.id,
              user_id: sRoutine.user_id,
              name: sRoutine.name,
              description: sRoutine.description || '',
              deleted: 0,
              created_at: sRoutine.created_at,
              updated_at: sRoutine.updated_at,
              synced: 1,
            });
          }
        }
      }
    }

    // 3. Descargar ejercicios
    const { data: serverExercises } = await supabase
      .from('exercises')
      .select('*')
      .gt('updated_at', lastSync);

    if (serverExercises) {
      for (const sExercise of serverExercises) {
        const local = await db.exercises.get(sExercise.id);
        if (!local || local.synced === 1 || new Date(sExercise.updated_at).getTime() > new Date(local.updated_at).getTime()) {
          if (sExercise.deleted) {
            await db.exercises.delete(sExercise.id);
          } else {
            await db.exercises.put({
              id: sExercise.id,
              routine_id: sExercise.routine_id,
              name: sExercise.name,
              muscle_group: sExercise.muscle_group,
              series: sExercise.series,
              reps: sExercise.reps,
              weight: Number(sExercise.weight),
              deleted: 0,
              created_at: sExercise.created_at,
              updated_at: sExercise.updated_at,
              synced: 1,
            });
          }
        }
      }
    }

    // 4. Descargar registros de entrenamiento
    const { data: serverLogs } = await supabase
      .from('workout_logs')
      .select('*')
      .gt('updated_at', lastSync);

    if (serverLogs) {
      for (const sLog of serverLogs) {
        const local = await db.workout_logs.get(sLog.id);
        if (!local || local.synced === 1 || new Date(sLog.updated_at).getTime() > new Date(local.updated_at).getTime()) {
          if (sLog.deleted) {
            await db.workout_logs.delete(sLog.id);
          } else {
            await db.workout_logs.put({
              id: sLog.id,
              exercise_id: sLog.exercise_id,
              weight_lifted: Number(sLog.weight_lifted),
              reps_done: sLog.reps_done,
              logged_at: sLog.logged_at,
              deleted: 0,
              created_at: sLog.created_at,
              updated_at: sLog.updated_at,
              synced: 1,
            });
          }
        }
      }
    }

    localStorage.setItem('last_sync_timestamp', currentSyncTime);
  }, []);

  // Función principal de disparo de sincronización
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await ensureGuestProfile();
      // 1. PUSH
      await pushLocalChanges();
      // 2. PULL
      await pullServerChanges();
      // 3. Actualizar conteo
      await updatePendingCount();
    } catch (error: any) {
      console.error('Error durante la sincronización:', error);
      setSyncError(error.message || 'Error desconocido de sincronización');
    } finally {
      setIsSyncing(false);
    }
  }, [ensureGuestProfile, pushLocalChanges, pullServerChanges, updatePendingCount, isSyncing]);

  // Manejo de eventos online/offline y conteo de carga inicial
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    ensureGuestProfile().then(() => {
      updatePendingCount();
      // Sincronizar al iniciar si está online
      if (navigator.onLine) {
        triggerSync();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isSyncing, pendingCount, syncError, triggerSync, updatePendingCount };
}
