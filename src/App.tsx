import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import type { LocalRoutine, LocalExercise, LocalWorkoutLog } from './db/db';
import { useSync, GUEST_USER_ID } from './hooks/useSync';
import {
  Dumbbell,
  Plus,
  Trash2,
  Edit,
  Save,
  Cloud,
  CloudOff,
  RefreshCw,
  Calendar,
  Sparkles,
  Check,
  TrendingUp,
  Play,
  ArrowLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';


function App() {
  const { isOnline, isSyncing, pendingCount, syncError, triggerSync } = useSync();
  const [view, setView] = useState<'dashboard' | 'edit_routine' | 'workout' | 'history'>('dashboard');

  // Reactividad local mediante Dexie
  const routines = useLiveQuery(() => db.routines.where('deleted').equals(0).toArray());
  const exercises = useLiveQuery(() => db.exercises.where('deleted').equals(0).toArray());
  const workoutLogs = useLiveQuery(() => db.workout_logs.where('deleted').equals(0).sortBy('logged_at'));

  // Estados para CRUD de Rutinas
  const [activeRoutine, setActiveRoutine] = useState<LocalRoutine | null>(null);
  const [routineName, setRoutineName] = useState('');
  const [routineDescription, setRoutineDescription] = useState('');
  const [routineExercises, setRoutineExercises] = useState<Partial<LocalExercise>[]>([]);

  // Estados para el Entrenamiento en curso (Workout Session)
  const [workoutRoutine, setWorkoutRoutine] = useState<LocalRoutine | null>(null);
  const [workoutSessionLogs, setWorkoutSessionLogs] = useState<{
    [exerciseId: string]: { seriesIndex: number; weight: number; reps: number; completed: boolean }[];
  }>({});

  // Helper para generar UUIDs locales (con fallback para contextos HTTP no seguros)
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // --- GENERACIÓN DE PLANTILLAS POR DEFECTO ---
  const generateTemplateRoutine = async (type: 'Push' | 'Pull' | 'Legs' | 'Fullbody' | 'PechoTriceps') => {
    const routineId = generateUUID();
    const now = new Date().toISOString();

    let name = '';
    let description = '';
    let exercisesTemplate: { name: string; muscle_group: string; series: number; reps: number; weight: number }[] = [];

    if (type === 'Push') {
      name = 'Rutina de Empuje (Push)';
      description = 'Enfoque en pecho, hombros y tríceps.';
      exercisesTemplate = [
        { name: 'Press de Banca Plano', muscle_group: 'Pecho', series: 4, reps: 10, weight: 60 },
        { name: 'Press Militar con Barra', muscle_group: 'Hombros', series: 3, reps: 8, weight: 35 },
        { name: 'Fondos de Tríceps', muscle_group: 'Tríceps', series: 3, reps: 12, weight: 0 },
        { name: 'Aperturas con Mancuernas', muscle_group: 'Pecho', series: 3, reps: 12, weight: 14 }
      ];
    } else if (type === 'Pull') {
      name = 'Rutina de Tirón (Pull)';
      description = 'Enfoque en espalda, bíceps y deltoides posterior.';
      exercisesTemplate = [
        { name: 'Dominadas (o Polea Alta)', muscle_group: 'Espalda', series: 4, reps: 8, weight: 0 },
        { name: 'Remo con Barra', muscle_group: 'Espalda', series: 3, reps: 10, weight: 50 },
        { name: 'Curl de Bíceps con Barra', muscle_group: 'Bíceps', series: 3, reps: 10, weight: 25 },
        { name: 'Pájaros con Mancuerna', muscle_group: 'Hombros', series: 3, reps: 15, weight: 8 }
      ];
    } else if (type === 'Legs') {
      name = 'Rutina de Piernas (Legs)';
      description = 'Enfoque en cuádriceps, femorales y pantorrillas.';
      exercisesTemplate = [
        { name: 'Sentadilla Trasera con Barra', muscle_group: 'Piernas', series: 4, reps: 8, weight: 80 },
        { name: 'Peso Muerto Rumano', muscle_group: 'Piernas', series: 3, reps: 10, weight: 70 },
        { name: 'Prensa de Piernas', muscle_group: 'Piernas', series: 3, reps: 12, weight: 120 },
        { name: 'Elevación de Pantorrillas', muscle_group: 'Pantorrillas', series: 4, reps: 15, weight: 40 }
      ];
    } else if (type === 'PechoTriceps') {
      name = 'Pecho y tríceps';
      description = 'Rutina inicial enfocada en empuje horizontal y extensión de tríceps.';
      exercisesTemplate = [
        { name: 'Press banca en Smith', muscle_group: 'Pecho', series: 4, reps: 12, weight: 45 },
        { name: 'Press inclinado mancuernas', muscle_group: 'Pecho', series: 3, reps: 12, weight: 40 },
        { name: 'Cable crossover', muscle_group: 'Pecho', series: 3, reps: 15, weight: 22.5 },
        { name: 'Jalón tríceps en polea', muscle_group: 'Tríceps', series: 3, reps: 15, weight: 52 },
        { name: 'Fondos asistidos', muscle_group: 'Tríceps', series: 3, reps: 12, weight: 70 },
        { name: 'Jalón cuerda sobre cabeza', muscle_group: 'Tríceps', series: 3, reps: 12, weight: 42.5 }
      ];
    } else {
      name = 'Cuerpo Completo (Full Body)';
      description = 'Rutina general para todo el cuerpo.';
      exercisesTemplate = [
        { name: 'Sentadillas', muscle_group: 'Piernas', series: 3, reps: 10, weight: 60 },
        { name: 'Press de Banca', muscle_group: 'Pecho', series: 3, reps: 10, weight: 50 },
        { name: 'Remo con Mancuerna', muscle_group: 'Espalda', series: 3, reps: 10, weight: 20 },
        { name: 'Plancha Abdominal', muscle_group: 'Abdomen', series: 3, reps: 60, weight: 0 }
      ];
    }

    // Insertar en IndexedDB
    await db.routines.add({
      id: routineId,
      user_id: GUEST_USER_ID,
      name,
      description,
      deleted: 0,
      created_at: now,
      updated_at: now,
      synced: 0
    });

    for (const ex of exercisesTemplate) {
      await db.exercises.add({
        id: generateUUID(),
        routine_id: routineId,
        name: ex.name,
        muscle_group: ex.muscle_group,
        series: ex.series,
        reps: ex.reps,
        weight: ex.weight,
        deleted: 0,
        created_at: now,
        updated_at: now,
        synced: 0
      });
    }

    if (isOnline) {
      triggerSync();
    }
  };

  // --- CRUD ACCIONES ---
  const handleOpenCreateRoutine = () => {
    setActiveRoutine(null);
    setRoutineName('');
    setRoutineDescription('');
    setRoutineExercises([]);
    setView('edit_routine');
  };

  const handleOpenEditRoutine = (routine: LocalRoutine) => {
    setActiveRoutine(routine);
    setRoutineName(routine.name);
    setRoutineDescription(routine.description);
    
    // Filtrar los ejercicios de esta rutina que no estén borrados
    const existing = exercises?.filter(ex => ex.routine_id === routine.id && ex.deleted === 0) || [];
    setRoutineExercises(existing);
    setView('edit_routine');
  };

  const handleAddExerciseRow = () => {
    setRoutineExercises([
      ...routineExercises,
      {
        id: generateUUID(),
        name: '',
        muscle_group: 'Pecho',
        series: 3,
        reps: 10,
        weight: 0
      }
    ]);
  };

  const handleRemoveExerciseRow = (index: number) => {
    const copy = [...routineExercises];
    copy.splice(index, 1);
    setRoutineExercises(copy);
  };

  const handleExerciseChange = (index: number, field: string, value: any) => {
    const copy = [...routineExercises];
    copy[index] = { ...copy[index], [field]: value };
    setRoutineExercises(copy);
  };

  const handleSaveRoutine = async () => {
    if (!routineName.trim()) {
      alert('Por favor introduce un nombre para la rutina');
      return;
    }

    const now = new Date().toISOString();
    const routineId = activeRoutine ? activeRoutine.id : generateUUID();

    const routineData: LocalRoutine = {
      id: routineId,
      user_id: GUEST_USER_ID,
      name: routineName,
      description: routineDescription,
      deleted: 0,
      created_at: activeRoutine ? activeRoutine.created_at : now,
      updated_at: now,
      synced: 0
    };

    // Guardar o actualizar rutina
    await db.routines.put(routineData);

    // Obtener los ejercicios antiguos de IndexedDB para esta rutina
    const oldExercises = await db.exercises.where('routine_id').equals(routineId).toArray();

    // Marcar como borrados los ejercicios que ya no están en la lista actual
    for (const oldEx of oldExercises) {
      const stillExists = routineExercises.some(ex => ex.id === oldEx.id);
      if (!stillExists) {
        await db.exercises.update(oldEx.id, {
          deleted: 1,
          synced: 0,
          updated_at: now
        });
      }
    }

    // Guardar / actualizar los ejercicios de la lista actual
    for (const ex of routineExercises) {
      if (!ex.name?.trim()) continue;
      const exData: LocalExercise = {
        id: ex.id || generateUUID(),
        routine_id: routineId,
        name: ex.name,
        muscle_group: ex.muscle_group || 'Pecho',
        series: Number(ex.series) || 3,
        reps: Number(ex.reps) || 10,
        weight: Number(ex.weight) || 0,
        deleted: 0,
        created_at: ex.created_at || now,
        updated_at: now,
        synced: 0
      };
      await db.exercises.put(exData);
    }

    setView('dashboard');
    if (isOnline) {
      triggerSync();
    }
  };

  const handleDeleteRoutine = async (routineId: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta rutina?')) return;
    const now = new Date().toISOString();
    
    // Soft delete de la rutina
    await db.routines.update(routineId, {
      deleted: 1,
      synced: 0,
      updated_at: now
    });

    // Soft delete de sus ejercicios
    const rExercises = await db.exercises.where('routine_id').equals(routineId).toArray();
    for (const ex of rExercises) {
      await db.exercises.update(ex.id, {
        deleted: 1,
        synced: 0,
        updated_at: now
      });
    }

    if (isOnline) {
      triggerSync();
    }
  };

  // --- ENTRENAMIENTO ACTIVO ---
  const handleStartWorkout = (routine: LocalRoutine) => {
    setWorkoutRoutine(routine);
    const rExercises = exercises?.filter(ex => ex.routine_id === routine.id && ex.deleted === 0) || [];
    
    // Inicializar la estructura del registro de series
    const initialSession: typeof workoutSessionLogs = {};
    rExercises.forEach(ex => {
      initialSession[ex.id] = Array.from({ length: ex.series }).map(() => ({
        seriesIndex: 0,
        weight: ex.weight,
        reps: ex.reps,
        completed: false
      }));
    });
    
    setWorkoutSessionLogs(initialSession);
    setView('workout');
  };

  const handleToggleWorkoutSeries = (exerciseId: string, seriesIndex: number) => {
    const copy = { ...workoutSessionLogs };
    const series = copy[exerciseId][seriesIndex];
    series.completed = !series.completed;
    setWorkoutSessionLogs(copy);
  };

  const handleWorkoutValueChange = (exerciseId: string, seriesIndex: number, field: 'weight' | 'reps', value: number) => {
    const copy = { ...workoutSessionLogs };
    copy[exerciseId][seriesIndex][field] = value;
    setWorkoutSessionLogs(copy);
  };

  const handleFinishWorkout = async () => {
    if (!workoutRoutine) return;
    const now = new Date().toISOString();

    let logsAdded = 0;

    // Registrar logs de series completadas y actualizar peso de ejercicio
    for (const exerciseId of Object.keys(workoutSessionLogs)) {
      const seriesList = workoutSessionLogs[exerciseId];
      let maxWeightUsed = 0;
      let targetReps = 10;
      let targetSeries = seriesList.length;

      const completedSeries = seriesList.filter(s => s.completed);
      
      for (const s of completedSeries) {
        const logId = generateUUID();
        const logData: LocalWorkoutLog = {
          id: logId,
          exercise_id: exerciseId,
          weight_lifted: s.weight,
          reps_done: s.reps,
          logged_at: now,
          deleted: 0,
          created_at: now,
          updated_at: now,
          synced: 0
        };
        await db.workout_logs.add(logData);
        logsAdded++;

        if (s.weight > maxWeightUsed) {
          maxWeightUsed = s.weight;
          targetReps = s.reps;
        }
      }

      // Progresar la carga: Actualizar peso/reps por defecto para el ejercicio
      if (completedSeries.length > 0) {
        await db.exercises.update(exerciseId, {
          weight: maxWeightUsed,
          reps: targetReps,
          series: targetSeries,
          updated_at: now,
          synced: 0
        });
      }
    }

    if (logsAdded === 0) {
      alert('Registra al menos una serie completa para guardar el entrenamiento.');
      return;
    }

    setWorkoutRoutine(null);
    setWorkoutSessionLogs({});
    setView('dashboard');
    if (isOnline) {
      triggerSync();
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-12">
      {/* HEADER / BARRA DE CONEXIÓN */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Dumbbell className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white m-0 leading-none">Gym Instructor</h1>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Offline-First App</span>
          </div>
        </div>

        {/* Estatus e Interacción de Sincronización */}
        <div className="flex items-center gap-2">
          {/* Conexión */}
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
            isOnline 
              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20' 
              : 'bg-rose-950/30 text-rose-400 border-rose-500/20'
          }`}>
            {isOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Sincronización */}
          <button
            onClick={triggerSync}
            disabled={isSyncing || !isOnline}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
              pendingCount > 0
                ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 disabled:opacity-50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
            {pendingCount > 0 && (
              <span className="bg-slate-950 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* FEEDBACK DE ERROR DE SYNC */}
      {syncError && (
        <div className="mx-4 mt-3 p-3 bg-rose-950/40 border border-rose-500/20 rounded-2xl flex items-start gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error al sincronizar con Supabase:</p>
            <p className="opacity-90">{syncError}</p>
          </div>
        </div>
      )}

      {/* CUERPO PRINCIPAL */}
      <main className="flex-1 px-4 py-4 max-w-xl mx-auto w-full">

        {/* 1. DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Tarjeta de Progreso rápido */}
            <div className="glass-card rounded-3xl p-5 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 pointer-events-none">
                <Dumbbell className="w-40 h-40" />
              </div>
              <h2 className="text-xl font-extrabold text-white mb-1 flex items-center gap-1.5">
                <Sparkles className="w-5 h-5 text-emerald-400" /> ¡Entrena Hoy!
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Elige una de tus rutinas o genera plantillas prediseñadas instantáneamente.
              </p>

              {/* Botón de Nueva Rutina */}
              <button
                onClick={handleOpenCreateRoutine}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
              >
                <Plus className="w-5 h-5" /> Crear Nueva Rutina
              </button>
            </div>

            {/* Generador de Plantillas Rápidas */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Generador de Plantillas</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['Push', 'Pull', 'Legs', 'Fullbody', 'PechoTriceps'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => generateTemplateRoutine(type)}
                    className="glass-card hover:bg-slate-900/60 p-3 rounded-2xl text-left border border-slate-900 transition-all flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {type === 'Fullbody' ? 'Full Body' : type === 'PechoTriceps' ? 'Pecho & Tríceps' : type}
                      </p>
                      <p className="text-[10px] text-slate-400">Autogenerar ejercicios</p>
                    </div>
                    <Sparkles className="w-4 h-4 text-emerald-400/80" />
                  </button>
                ))}
              </div>
            </div>

            {/* Listado de Rutinas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mis Rutinas ({routines?.length || 0})</h3>
                <button 
                  onClick={() => setView('history')} 
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Calendar className="w-3.5 h-3.5" /> Historial
                </button>
              </div>

              {routines && routines.length > 0 ? (
                <div className="space-y-3">
                  {routines.map(routine => {
                    const rExercises = exercises?.filter(ex => ex.routine_id === routine.id && ex.deleted === 0) || [];
                    return (
                      <div 
                        key={routine.id} 
                        className="glass-card rounded-2xl p-4 border border-slate-900 hover:border-slate-800 transition-all flex flex-col justify-between"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-white text-base leading-snug">{routine.name}</h4>
                            <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{routine.description || 'Sin descripción.'}</p>
                          </div>
                          
                          {/* Sync indicator individual */}
                          {routine.synced === 0 && (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0">
                              Pendiente
                            </span>
                          )}
                        </div>

                        {/* Detalle de ejercicios */}
                        <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                          {rExercises.slice(0, 3).map((ex) => (
                            <span key={ex.id} className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-800/40">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                              {ex.name}
                            </span>
                          ))}
                          {rExercises.length > 3 && (
                            <span className="text-[10px] text-slate-500 self-center">+{rExercises.length - 3} más</span>
                          )}
                        </div>

                        {/* Botones de acción */}
                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-900/80">
                          <button
                            onClick={() => handleStartWorkout(routine)}
                            className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" /> Iniciar
                          </button>
                          <button
                            onClick={() => handleOpenEditRoutine(routine)}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all border border-slate-800 cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={() => handleDeleteRoutine(routine.id)}
                            className="bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center transition-all border border-slate-800 hover:border-rose-500/20 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-card rounded-3xl p-8 border border-slate-900 text-center">
                  <Dumbbell className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No tienes rutinas registradas.</p>
                  <p className="text-xs text-slate-500 mt-1">Usa las plantillas rápidas de arriba o crea una desde cero.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. CREAR / EDITAR RUTINA VIEW */}
        {view === 'edit_routine' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setView('dashboard')} 
                className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-white">
                {activeRoutine ? 'Editar Rutina' : 'Crear Rutina'}
              </h2>
            </div>

            <div className="glass-card rounded-2xl p-4 border border-slate-900 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nombre de la Rutina</label>
                <input
                  type="text"
                  placeholder="Ej: Empuje / Pecho & Tríceps"
                  value={routineName}
                  onChange={e => setRoutineName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Descripción (Opcional)</label>
                <textarea
                  placeholder="Notas breves sobre el enfoque de la rutina..."
                  value={routineDescription}
                  onChange={e => setRoutineDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 resize-none"
                />
              </div>
            </div>

            {/* Listado de Ejercicios en la Rutina */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ejercicios ({routineExercises.length})</h3>
                <button
                  onClick={handleAddExerciseRow}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir
                </button>
              </div>

              {routineExercises.length > 0 ? (
                <div className="space-y-2">
                  {routineExercises.map((ex, index) => (
                    <div key={ex.id} className="glass-card rounded-2xl p-4 border border-slate-900 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          placeholder="Nombre del Ejercicio (Ej: Press Banca)"
                          value={ex.name || ''}
                          onChange={e => handleExerciseChange(index, 'name', e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                        />
                        <button
                          onClick={() => handleRemoveExerciseRow(index)}
                          className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Músculo</label>
                          <select
                            value={ex.muscle_group || 'Pecho'}
                            onChange={e => handleExerciseChange(index, 'muscle_group', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500/50"
                          >
                            {['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Bíceps', 'Tríceps', 'Abdomen', 'Core'].map(group => (
                              <option key={group} value={group}>{group}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Series</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={ex.series || 3}
                            onChange={e => handleExerciseChange(index, 'series', parseInt(e.target.value) || 1)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px] text-center text-white focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reps</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={ex.reps || 10}
                            onChange={e => handleExerciseChange(index, 'reps', parseInt(e.target.value) || 1)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px] text-center text-white focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Peso (kg)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={ex.weight || 0}
                            onChange={e => handleExerciseChange(index, 'weight', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px] text-center text-white focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-6 border border-slate-900 text-center">
                  <p className="text-xs text-slate-400">Haz clic en Añadir para agregar ejercicios a la rutina.</p>
                </div>
              )}
            </div>

            {/* Guardar cambios */}
            <button
              onClick={handleSaveRoutine}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
            >
              <Save className="w-5 h-5" /> Guardar Rutina
            </button>
          </div>
        )}

        {/* 3. WORKOUT SESSION VIEW */}
        {view === 'workout' && workoutRoutine && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                  <TrendingUp className="w-5 h-5 text-emerald-400 animate-pulse" /> Entrenamiento Activo
                </h2>
              </div>
              <button
                onClick={() => {
                  if (confirm('¿Deseas cancelar el entrenamiento actual? No se guardará el historial.')) {
                    setWorkoutRoutine(null);
                    setWorkoutSessionLogs({});
                    setView('dashboard');
                  }
                }}
                className="text-xs bg-rose-950/30 hover:bg-rose-900/30 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            <div className="bg-slate-900/40 rounded-2xl p-4 border border-slate-900/60">
              <h3 className="font-extrabold text-white text-base leading-none">{workoutRoutine.name}</h3>
              <p className="text-xs text-slate-400 mt-1.5">{workoutRoutine.description || 'Registrando carga y series.'}</p>
            </div>

            {/* Lista de ejercicios para el entrenamiento */}
            <div className="space-y-4">
              {exercises
                ?.filter(ex => ex.routine_id === workoutRoutine.id && ex.deleted === 0)
                .map(ex => {
                  const series = workoutSessionLogs[ex.id] || [];
                  const allCompleted = series.length > 0 && series.every(s => s.completed);

                  return (
                    <div 
                      key={ex.id} 
                      className={`glass-card rounded-2xl border transition-all ${
                        allCompleted ? 'border-emerald-500/30 bg-emerald-950/5' : 'border-slate-900'
                      }`}
                    >
                      {/* Cabecera del ejercicio */}
                      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-900/40">
                        <div>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            {ex.muscle_group}
                          </span>
                          <h4 className="font-bold text-white text-sm mt-1">{ex.name}</h4>
                        </div>
                        {allCompleted && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>

                      {/* Lista de series */}
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-12 text-[10px] font-bold text-slate-500 uppercase px-2 mb-1">
                          <span className="col-span-2">Serie</span>
                          <span className="col-span-4 text-center">Peso (kg)</span>
                          <span className="col-span-4 text-center">Reps</span>
                          <span className="col-span-2 text-right">Completado</span>
                        </div>

                        {series.map((s, idx) => (
                          <div 
                            key={idx} 
                            className={`grid grid-cols-12 items-center gap-1 p-2 rounded-xl border transition-all ${
                              s.completed 
                                ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' 
                                : 'bg-slate-900/40 border-slate-800/40'
                            }`}
                          >
                            <span className="col-span-2 text-xs font-bold pl-2">{idx + 1}</span>
                            
                            {/* Inputs de Peso y Reps */}
                            <div className="col-span-4 flex justify-center">
                              <input
                                type="number"
                                step="0.5"
                                disabled={s.completed}
                                value={s.weight}
                                onChange={e => handleWorkoutValueChange(ex.id, idx, 'weight', parseFloat(e.target.value) || 0)}
                                className="w-16 bg-slate-950 border border-slate-800 rounded-lg py-1 text-xs text-center text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                              />
                            </div>
                            <div className="col-span-4 flex justify-center">
                              <input
                                type="number"
                                disabled={s.completed}
                                value={s.reps}
                                onChange={e => handleWorkoutValueChange(ex.id, idx, 'reps', parseInt(e.target.value) || 0)}
                                className="w-16 bg-slate-950 border border-slate-800 rounded-lg py-1 text-xs text-center text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                              />
                            </div>

                            {/* Botón Completado */}
                            <div className="col-span-2 flex justify-end pr-1">
                              <button
                                onClick={() => handleToggleWorkoutSeries(ex.id, idx)}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                                  s.completed
                                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                    : 'bg-slate-950 text-slate-600 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3px]" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Terminar Entrenamiento */}
            <button
              onClick={handleFinishWorkout}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
            >
              <Check className="w-5 h-5 stroke-[2.5]" /> Guardar y Terminar
            </button>
          </div>
        )}

        {/* 4. HISTORIAL VIEW */}
        {view === 'history' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setView('dashboard')} 
                className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                <Calendar className="w-5 h-5 text-emerald-400" /> Historial de Entrenamientos
              </h2>
            </div>

            {workoutLogs && workoutLogs.length > 0 ? (
              <div className="space-y-4">
                {/* Agrupar logs por día */}
                {Array.from(new Set(workoutLogs.map(log => new Date(log.logged_at).toLocaleDateString()))).reverse().map(dateString => {
                  const dateLogs = workoutLogs.filter(log => new Date(log.logged_at).toLocaleDateString() === dateString);
                  
                  return (
                    <div key={dateString} className="glass-card rounded-2xl p-4 border border-slate-900 space-y-3">
                      {/* Fecha cabecera */}
                      <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                        <span className="font-bold text-white text-sm">{dateString}</span>
                        <span className="text-[10px] text-slate-400 font-semibold bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                          {dateLogs.length} series registradas
                        </span>
                      </div>

                      {/* Lista de series del día */}
                      <div className="space-y-2">
                        {dateLogs.map(log => {
                          const associatedExercise = exercises?.find(ex => ex.id === log.exercise_id);
                          return (
                            <div key={log.id} className="flex justify-between items-center text-xs">
                              <div>
                                <span className="font-semibold text-slate-300">
                                  {associatedExercise ? associatedExercise.name : 'Ejercicio Eliminado'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-slate-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-900/60">
                                  {log.weight_lifted} kg
                                </span>
                                <span className="text-slate-500 font-medium">
                                  {log.reps_done} reps
                                </span>
                                {log.synced === 0 && (
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" title="Sincronización pendiente"></span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card rounded-3xl p-8 border border-slate-900 text-center">
                <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No hay entrenamientos completados aún.</p>
                <p className="text-xs text-slate-500 mt-1">Completa una rutina en el Dashboard para ver tus registros aquí.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
