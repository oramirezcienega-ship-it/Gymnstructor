import { useEffect, useState, useCallback } from 'react';
import { db } from '../db/db';
import { supabase } from '../supabaseClient';

export function useSync(
  currentUserId: string | null,
  currentUserEmail: string | null,
  currentUserName: string | null
) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Inicializar perfil del usuario localmente en IndexedDB
  const ensureUserProfile = useCallback(async () => {
    if (!currentUserId) return;
    const profile = await db.profiles.get(currentUserId);
    if (!profile) {
      const now = new Date().toISOString();
      await db.profiles.put({
        id: currentUserId,
        email: currentUserEmail || '',
        name: currentUserName || '',
        height: 0.0,
        gender: '',
        birth_date: '',
        created_at: now,
        updated_at: now,
        synced: 0,
      });
    } else if (currentUserName && !profile.name) {
      await db.profiles.update(currentUserId, { name: currentUserName });
    }
  }, [currentUserId, currentUserEmail, currentUserName]);

  // Contar registros del usuario actual pendientes de sincronizar
  const updatePendingCount = useCallback(async () => {
    if (!currentUserId) {
      setPendingCount(0);
      return;
    }
    const pProfiles = await db.profiles.where('id').equals(currentUserId).and(p => p.synced === 0).count();
    const pRoutines = await db.routines.where('user_id').equals(currentUserId).and(r => r.synced === 0).count();
    
    const userRoutines = await db.routines.where('user_id').equals(currentUserId).toArray();
    const routineIds = userRoutines.map(r => r.id);
    
    let pExercises = 0;
    let pLogs = 0;
    
    if (routineIds.length > 0) {
      pExercises = await db.exercises.where('synced').equals(0).and(ex => routineIds.includes(ex.routine_id)).count();
      
      const userExercises = await db.exercises.where('routine_id').anyOf(routineIds).toArray();
      const exerciseIds = userExercises.map(ex => ex.id);
      if (exerciseIds.length > 0) {
        pLogs = await db.workout_logs.where('synced').equals(0).and(log => exerciseIds.includes(log.exercise_id)).count();
      }
    }
    
    const pMetrics = await db.body_metrics.where('user_id').equals(currentUserId).and(m => m.synced === 0).count();
    setPendingCount(pProfiles + pRoutines + pExercises + pLogs + pMetrics);
  }, [currentUserId]);

  // Subir cambios locales del usuario actual a Supabase
  const pushLocalChanges = useCallback(async () => {
    if (!currentUserId) return;
    const errors: string[] = [];

    // 1. Sincronizar perfiles
    const unsyncedProfiles = await db.profiles
      .where('id')
      .equals(currentUserId)
      .and(p => p.synced === 0)
      .toArray();

    for (const profile of unsyncedProfiles) {
      const { data: serverProfile, error: getError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();

      if (getError) {
        console.error('Error fetching server profile:', getError);
        errors.push(`Perfil (obtener): ${getError.message}`);
        continue;
      }

      let success = false;
      if (serverProfile) {
        const localTime = new Date(profile.updated_at).getTime();
        const serverTime = new Date(serverProfile.updated_at).getTime();
        if (localTime > serverTime) {
          const { error: upsertError } = await supabase.from('profiles').upsert({
            id: profile.id,
            email: profile.email,
            name: profile.name || '',
            height: profile.height,
            gender: profile.gender,
            birth_date: profile.birth_date,
            updated_at: profile.updated_at,
          });
          if (!upsertError) success = true;
          else {
            console.error('Error upserting profile:', upsertError);
            errors.push(`Perfil (actualizar): ${upsertError.message}`);
          }
        } else {
          await db.profiles.put({ ...serverProfile, synced: 1 });
          success = true;
        }
      } else {
        const { error: insertError } = await supabase.from('profiles').insert({
          id: profile.id,
          email: profile.email,
          name: profile.name || '',
          height: profile.height,
          gender: profile.gender,
          birth_date: profile.birth_date,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        });
        if (!insertError) success = true;
        else {
          console.error('Error inserting profile:', insertError);
          errors.push(`Perfil (insertar): ${insertError.message}`);
        }
      }

      if (success) {
        await db.profiles.update(profile.id, { synced: 1 });
      }
    }

    // 2. Sincronizar rutinas
    const unsyncedRoutines = await db.routines
      .where('user_id')
      .equals(currentUserId)
      .and(r => r.synced === 0)
      .toArray();

    for (const routine of unsyncedRoutines) {
      const { data: serverRoutine, error: getError } = await supabase
        .from('routines')
        .select('*')
        .eq('id', routine.id)
        .maybeSingle();

      if (getError) {
        console.error('Error fetching server routine:', getError);
        errors.push(`Rutina (obtener): ${getError.message}`);
        continue;
      }

      let success = false;
      if (serverRoutine) {
        const localTime = new Date(routine.updated_at).getTime();
        const serverTime = new Date(serverRoutine.updated_at).getTime();
        if (localTime > serverTime) {
          const { error: upsertError } = await supabase.from('routines').upsert({
            id: routine.id,
            user_id: routine.user_id,
            name: routine.name,
            description: routine.description,
            deleted: routine.deleted === 1,
            updated_at: routine.updated_at,
          });
          if (!upsertError) success = true;
          else {
            console.error('Error upserting routine:', upsertError);
            errors.push(`Rutina (actualizar): ${upsertError.message}`);
          }
        } else {
          await db.routines.put({
            ...serverRoutine,
            deleted: serverRoutine.deleted ? 1 : 0,
            synced: 1,
          });
          success = true;
        }
      } else {
        const { error: insertError } = await supabase.from('routines').insert({
          id: routine.id,
          user_id: routine.user_id,
          name: routine.name,
          description: routine.description,
          deleted: routine.deleted === 1,
          created_at: routine.created_at,
          updated_at: routine.updated_at,
        });
        if (!insertError) success = true;
        else {
          console.error('Error inserting routine:', insertError);
          errors.push(`Rutina (insertar): ${insertError.message}`);
        }
      }

      if (success) {
        if (routine.deleted === 1) {
          await db.routines.delete(routine.id);
        } else {
          await db.routines.update(routine.id, { synced: 1 });
        }
      }
    }

    // Obtener rutinas de este usuario para sincronizar ejercicios y logs relacionados
    const userRoutines = await db.routines.where('user_id').equals(currentUserId).toArray();
    const routineIds = userRoutines.map(r => r.id);

    // 3. Sincronizar ejercicios
    if (routineIds.length > 0) {
      const unsyncedExercises = await db.exercises
        .where('synced')
        .equals(0)
        .and(ex => routineIds.includes(ex.routine_id))
        .toArray();

      for (const exercise of unsyncedExercises) {
        const { data: serverExercise, error: getError } = await supabase
          .from('exercises')
          .select('*')
          .eq('id', exercise.id)
          .maybeSingle();

        if (getError) {
          console.error('Error fetching server exercise:', getError);
          errors.push(`Ejercicio (obtener): ${getError.message}`);
          continue;
        }

        let success = false;
        if (serverExercise) {
          const localTime = new Date(exercise.updated_at).getTime();
          const serverTime = new Date(serverExercise.updated_at).getTime();
          if (localTime > serverTime) {
            const { error: upsertError } = await supabase.from('exercises').upsert({
              id: exercise.id,
              routine_id: exercise.routine_id,
              name: exercise.name,
              muscle_group: exercise.muscle_group,
              series: exercise.series,
              reps: exercise.reps,
              weight: exercise.weight,
              deleted: exercise.deleted === 1,
              updated_at: exercise.updated_at,
              image_data: exercise.image_data,
            });
            if (!upsertError) success = true;
            else {
              console.error('Error upserting exercise:', upsertError);
              errors.push(`Ejercicio (actualizar): ${upsertError.message}`);
            }
          } else {
            await db.exercises.put({
              ...serverExercise,
              deleted: serverExercise.deleted ? 1 : 0,
              synced: 1,
            });
            success = true;
          }
        } else {
          const { error: insertError } = await supabase.from('exercises').insert({
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
            image_data: exercise.image_data,
          });
          if (!insertError) success = true;
          else {
            console.error('Error inserting exercise:', insertError);
            errors.push(`Ejercicio (insertar): ${insertError.message}`);
          }
        }

        if (success) {
          if (exercise.deleted === 1) {
            await db.exercises.delete(exercise.id);
          } else {
            await db.exercises.update(exercise.id, { synced: 1 });
          }
        }
      }

      // 4. Sincronizar registros de entrenamiento (Workout Logs)
      const userExercises = await db.exercises.where('routine_id').anyOf(routineIds).toArray();
      const exerciseIds = userExercises.map(ex => ex.id);

      if (exerciseIds.length > 0) {
        const unsyncedLogs = await db.workout_logs
          .where('synced')
          .equals(0)
          .and(log => exerciseIds.includes(log.exercise_id))
          .toArray();

        for (const log of unsyncedLogs) {
          const { data: serverLog, error: getError } = await supabase
            .from('workout_logs')
            .select('*')
            .eq('id', log.id)
            .maybeSingle();

          if (getError) {
            console.error('Error fetching server workout log:', getError);
            errors.push(`Registro de entreno (obtener): ${getError.message}`);
            continue;
          }

          let success = false;
          if (serverLog) {
            const localTime = new Date(log.updated_at).getTime();
            const serverTime = new Date(serverLog.updated_at).getTime();
            if (localTime > serverTime) {
              const { error: upsertError } = await supabase.from('workout_logs').upsert({
                id: log.id,
                exercise_id: log.exercise_id,
                weight_lifted: log.weight_lifted,
                reps_done: log.reps_done,
                logged_at: log.logged_at,
                deleted: log.deleted === 1,
                updated_at: log.updated_at,
              });
              if (!upsertError) success = true;
              else {
                console.error('Error upserting workout log:', upsertError);
                errors.push(`Registro de entreno (actualizar): ${upsertError.message}`);
              }
            } else {
              await db.workout_logs.put({
                ...serverLog,
                deleted: serverLog.deleted ? 1 : 0,
                synced: 1,
              });
              success = true;
            }
          } else {
            const { error: insertError } = await supabase.from('workout_logs').insert({
              id: log.id,
              exercise_id: log.exercise_id,
              weight_lifted: log.weight_lifted,
              reps_done: log.reps_done,
              logged_at: log.logged_at,
              deleted: log.deleted === 1,
              created_at: log.created_at,
              updated_at: log.updated_at,
            });
            if (!insertError) success = true;
            else {
              console.error('Error inserting workout log:', insertError);
              errors.push(`Registro de entreno (insertar): ${insertError.message}`);
            }
          }

          if (success) {
            if (log.deleted === 1) {
              await db.workout_logs.delete(log.id);
            } else {
              await db.workout_logs.update(log.id, { synced: 1 });
            }
          }
        }
      }
    }

    // 5. Sincronizar métricas corporales (Body Metrics)
    const unsyncedMetrics = await db.body_metrics
      .where('user_id')
      .equals(currentUserId)
      .and(m => m.synced === 0)
      .toArray();

    for (const metric of unsyncedMetrics) {
      const { data: serverMetric, error: getError } = await supabase
        .from('body_metrics')
        .select('*')
        .eq('id', metric.id)
        .maybeSingle();

      if (getError) {
        console.error('Error fetching server body metric:', getError);
        errors.push(`Métricas corporales (obtener): ${getError.message}`);
        continue;
      }

      let success = false;
      if (serverMetric) {
        const localTime = new Date(metric.updated_at).getTime();
        const serverTime = new Date(serverMetric.updated_at).getTime();
        if (localTime > serverTime) {
          const { error: upsertError } = await supabase.from('body_metrics').upsert({
            id: metric.id,
            user_id: metric.user_id,
            weight: metric.weight,
            body_fat: metric.body_fat,
            muscle_mass: metric.muscle_mass,
            bmr: metric.bmr,
            visceral_fat: metric.visceral_fat,
            body_age: metric.body_age,
            logged_at: metric.logged_at,
            deleted: metric.deleted === 1,
            updated_at: metric.updated_at,
          });
          if (!upsertError) success = true;
          else {
            console.error('Error upserting body metric:', upsertError);
            errors.push(`Métricas corporales (actualizar): ${upsertError.message}`);
          }
        } else {
          await db.body_metrics.put({
            ...serverMetric,
            deleted: serverMetric.deleted ? 1 : 0,
            synced: 1,
          });
          success = true;
        }
      } else {
        const { error: insertError } = await supabase.from('body_metrics').insert({
          id: metric.id,
          user_id: metric.user_id,
          weight: metric.weight,
          body_fat: metric.body_fat,
          muscle_mass: metric.muscle_mass,
          bmr: metric.bmr,
          visceral_fat: metric.visceral_fat,
          body_age: metric.body_age,
          logged_at: metric.logged_at,
          deleted: metric.deleted === 1,
          created_at: metric.created_at,
          updated_at: metric.updated_at,
        });
        if (!insertError) success = true;
        else {
          console.error('Error inserting body metric:', insertError);
          errors.push(`Métricas corporales (insertar): ${insertError.message}`);
        }
      }

      if (success) {
        if (metric.deleted === 1) {
          await db.body_metrics.delete(metric.id);
        } else {
          await db.body_metrics.update(metric.id, { synced: 1 });
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Errores al subir cambios locales: ${errors.join('; ')}`);
    }
  }, [currentUserId]);

  // Descargar cambios desde el servidor
  const pullServerChanges = useCallback(async () => {
    if (!currentUserId) return;

    const lastSyncKey = `last_sync_timestamp_${currentUserId}`;
    const lastSync = localStorage.getItem(lastSyncKey) || new Date(0).toISOString();
    const currentSyncTime = new Date().toISOString();
    const errors: string[] = [];

    // 1. Descargar perfiles (sólo del usuario actual)
    const { data: serverProfiles, error: pullError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUserId)
      .gt('updated_at', lastSync);

    if (pullError) {
      console.error('Error pulling server profiles:', pullError);
      errors.push(`Descarga de perfiles: ${pullError.message}`);
    } else if (serverProfiles) {
      for (const sProfile of serverProfiles) {
        const local = await db.profiles.get(sProfile.id);
        if (!local || local.synced === 1 || new Date(sProfile.updated_at).getTime() > new Date(local.updated_at).getTime()) {
          await db.profiles.put({ ...sProfile, synced: 1 });
        }
      }
    }

    // 2. Descargar rutinas
    const { data: serverRoutines, error: routinesError } = await supabase
      .from('routines')
      .select('*')
      .eq('user_id', currentUserId)
      .gt('updated_at', lastSync);

    if (routinesError) {
      console.error('Error pulling server routines:', routinesError);
      errors.push(`Descarga de rutinas: ${routinesError.message}`);
    } else if (serverRoutines) {
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

    // Obtener los IDs de rutinas de este usuario para descargar ejercicios y logs relacionados
    const userRoutines = await db.routines.where('user_id').equals(currentUserId).toArray();
    const routineIds = userRoutines.map(r => r.id);

    // 3. Descargar ejercicios relacionados con las rutinas del usuario
    if (routineIds.length > 0) {
      const { data: serverExercises, error: exercisesError } = await supabase
        .from('exercises')
        .select('*')
        .in('routine_id', routineIds)
        .gt('updated_at', lastSync);

      if (exercisesError) {
        console.error('Error pulling server exercises:', exercisesError);
        errors.push(`Descarga de ejercicios: ${exercisesError.message}`);
      } else if (serverExercises) {
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
                image_data: sExercise.image_data,
              });
            }
          }
        }
      }

      // Descargar logs relacionados con los ejercicios del usuario
      const userExercises = await db.exercises.where('routine_id').anyOf(routineIds).toArray();
      const exerciseIds = userExercises.map(ex => ex.id);

      if (exerciseIds.length > 0) {
        const { data: serverLogs, error: logsError } = await supabase
          .from('workout_logs')
          .select('*')
          .in('exercise_id', exerciseIds)
          .gt('updated_at', lastSync);

        if (logsError) {
          console.error('Error pulling server workout logs:', logsError);
          errors.push(`Descarga de registros de entrenamiento: ${logsError.message}`);
        } else if (serverLogs) {
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
      }
    }

    // 5. Descargar métricas corporales
    const { data: serverMetrics, error: metricsError } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', currentUserId)
      .gt('updated_at', lastSync);

    if (metricsError) {
      console.error('Error pulling server body metrics:', metricsError);
      errors.push(`Descarga de métricas corporales: ${metricsError.message}`);
    } else if (serverMetrics) {
      for (const sMetric of serverMetrics) {
        const local = await db.body_metrics.get(sMetric.id);
        if (!local || local.synced === 1 || new Date(sMetric.updated_at).getTime() > new Date(local.updated_at).getTime()) {
          if (sMetric.deleted) {
            await db.body_metrics.delete(sMetric.id);
          } else {
            await db.body_metrics.put({
              id: sMetric.id,
              user_id: sMetric.user_id,
              weight: Number(sMetric.weight),
              body_fat: Number(sMetric.body_fat),
              muscle_mass: Number(sMetric.muscle_mass),
              bmr: sMetric.bmr ? Number(sMetric.bmr) : undefined,
              visceral_fat: sMetric.visceral_fat ? Number(sMetric.visceral_fat) : undefined,
              body_age: sMetric.body_age ? Number(sMetric.body_age) : undefined,
              logged_at: sMetric.logged_at,
              deleted: 0,
              created_at: sMetric.created_at,
              updated_at: sMetric.updated_at,
              synced: 1,
            });
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Errores al descargar datos del servidor: ${errors.join('; ')}`);
    }

    localStorage.setItem(lastSyncKey, currentSyncTime);
  }, [currentUserId]);

  // Forzar un reinicio de sincronización único para corregir fallos silenciosos previos
  const forceResetSyncStatus = useCallback(async () => {
    if (!currentUserId) return;
    const key = `forced_resync_v2_${currentUserId}`;
    if (localStorage.getItem(key)) return;

    try {
      // 1. Marcar todos los registros locales como no sincronizados para que se vuelvan a subir
      await db.profiles.where('id').equals(currentUserId).modify({ synced: 0 });
      await db.routines.where('user_id').equals(currentUserId).modify({ synced: 0 });
      
      const userRoutines = await db.routines.where('user_id').equals(currentUserId).toArray();
      const routineIds = userRoutines.map(r => r.id);
      if (routineIds.length > 0) {
        await db.exercises.where('routine_id').anyOf(routineIds).modify({ synced: 0 });
        
        const userExercises = await db.exercises.where('routine_id').anyOf(routineIds).toArray();
        const exerciseIds = userExercises.map(ex => ex.id);
        if (exerciseIds.length > 0) {
          await db.workout_logs.where('exercise_id').anyOf(exerciseIds).modify({ synced: 0 });
        }
      }
      await db.body_metrics.where('user_id').equals(currentUserId).modify({ synced: 0 });

      // 2. Limpiar la marca temporal del último pull para descargar todo el contenido del servidor
      const lastSyncKey = `last_sync_timestamp_${currentUserId}`;
      localStorage.removeItem(lastSyncKey);

      // 3. Marcar como completado el reset para este usuario
      localStorage.setItem(key, 'true');
      console.log('Forced resync initialized successfully');
    } catch (e) {
      console.error('Error during forced resync initialization:', e);
    }
  }, [currentUserId]);

  // Función principal de disparo de sincronización
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing || !currentUserId) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await forceResetSyncStatus();
      await ensureUserProfile();
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
  }, [currentUserId, forceResetSyncStatus, ensureUserProfile, pushLocalChanges, pullServerChanges, updatePendingCount, isSyncing]);

  // Manejo de eventos online/offline y conteo de carga inicial
  useEffect(() => {
    if (!currentUserId) return;

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    ensureUserProfile().then(() => {
      updatePendingCount();
      if (navigator.onLine) {
        triggerSync();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUserId, ensureUserProfile, updatePendingCount, triggerSync]);

  return { isOnline, isSyncing, pendingCount, syncError, triggerSync, updatePendingCount };
}
