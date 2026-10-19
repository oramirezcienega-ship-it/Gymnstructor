import React, { useState, useMemo } from 'react';
import type { LocalWorkoutLog, LocalExercise, LocalRoutine } from '../db/db';
import { db } from '../db/db';
import {
  Calendar,
  Dumbbell,
  Play,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  ArrowLeft,
  Sparkles,
  Layers
} from 'lucide-react';

interface WorkoutHistoryViewProps {
  workoutLogs: LocalWorkoutLog[] | undefined;
  exercises: LocalExercise[] | undefined;
  routines: LocalRoutine[] | undefined;
  onBack: () => void;
  onStartWorkoutWithRoutine?: (routine: LocalRoutine) => void;
  triggerSync: (force?: boolean) => void;
  isOnline: boolean;
}

interface GroupedExerciseLog {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  orderIndex: number;
  series: {
    id: string;
    weight: number;
    reps: number;
    synced: number;
    logged_at: string;
  }[];
  totalVolume: number;
  maxWeight: number;
  totalReps: number;
}

interface WorkoutSessionGroup {
  sessionId: string;
  dateKey: string;
  dateDisplay: string;
  dayOfWeek: string;
  timeDisplay: string;
  routineName: string;
  routineId?: string;
  exercises: GroupedExerciseLog[];
  totalVolume: number;
  totalSeries: number;
  totalReps: number;
  allSynced: boolean;
  logIds: string[];
}

export const WorkoutHistoryView: React.FC<WorkoutHistoryViewProps> = ({
  workoutLogs,
  exercises,
  routines,
  onBack,
  onStartWorkoutWithRoutine,
  triggerSync,
  isOnline,
}) => {
  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRoutineFilter, setSelectedRoutineFilter] = useState<string>('all');
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());

  // Mapa rápido de ejercicios para lookup O(1)
  const exerciseMap = useMemo(() => {
    const map = new Map<string, LocalExercise>();
    (exercises || []).forEach(ex => map.set(ex.id, ex));
    return map;
  }, [exercises]);

  // Mapa rápido de rutinas
  const routineMap = useMemo(() => {
    const map = new Map<string, LocalRoutine>();
    (routines || []).forEach(r => map.set(r.id, r));
    return map;
  }, [routines]);

  // Agrupamiento inteligente de logs en Sesiones de Entrenamiento
  const sessions = useMemo(() => {
    const activeLogs = (workoutLogs || [])
      .filter(l => l.deleted === 0)
      .slice()
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());

    if (activeLogs.length === 0) return [];

    const sessionClusters: LocalWorkoutLog[][] = [];
    let currentCluster: LocalWorkoutLog[] = [];

    // Agrupar por ventana temporal (series dentro de 75 minutos o el mismo día y rutina)
    for (const log of activeLogs) {
      if (currentCluster.length === 0) {
        currentCluster.push(log);
        continue;
      }

      const prevLog = currentCluster[currentCluster.length - 1];
      const prevTime = new Date(prevLog.logged_at).getTime();
      const currTime = new Date(log.logged_at).getTime();
      const diffMinutes = Math.abs(currTime - prevTime) / (1000 * 60);

      const prevDate = prevLog.logged_at.split('T')[0];
      const currDate = log.logged_at.split('T')[0];

      if (prevDate === currDate && diffMinutes <= 75) {
        currentCluster.push(log);
      } else {
        sessionClusters.push(currentCluster);
        currentCluster = [log];
      }
    }

    if (currentCluster.length > 0) {
      sessionClusters.push(currentCluster);
    }

    // Convertir cada cluster en una sesión estructurada
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const builtSessions: WorkoutSessionGroup[] = sessionClusters.map(cluster => {
      const firstLog = cluster[0];
      const dateObj = new Date(firstLog.logged_at);
      const isDateValid = !isNaN(dateObj.getTime());

      let dayOfWeek = '';
      let dateDisplay = '';
      let timeDisplay = '';
      let dateKey = '';

      if (isDateValid) {
        dayOfWeek = daysOfWeek[dateObj.getDay()];
        dateDisplay = `${dateObj.getDate()} de ${months[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        timeDisplay = `${hours}:${minutes} hrs`;
        dateKey = dateObj.toISOString().split('T')[0];
      } else {
        dateDisplay = firstLog.logged_at.split('T')[0] || 'Fecha desconocida';
        dateKey = dateDisplay;
      }

      // Agrupar por ejercicio dentro de la sesión
      const exerciseGroupMap = new Map<string, GroupedExerciseLog>();

      for (const log of cluster) {
        const associatedEx = exerciseMap.get(log.exercise_id);
        const exId = log.exercise_id;
        const exName = associatedEx ? associatedEx.name : 'Ejercicio Eliminado';
        const muscleGroup = associatedEx ? associatedEx.muscle_group : 'General';
        const orderIndex = associatedEx && associatedEx.order_index !== undefined ? associatedEx.order_index : 999;

        if (!exerciseGroupMap.has(exId)) {
          exerciseGroupMap.set(exId, {
            exerciseId: exId,
            exerciseName: exName,
            muscleGroup: muscleGroup,
            orderIndex,
            series: [],
            totalVolume: 0,
            maxWeight: 0,
            totalReps: 0
          });
        }

        const exGroup = exerciseGroupMap.get(exId)!;
        exGroup.series.push({
          id: log.id,
          weight: log.weight_lifted,
          reps: log.reps_done,
          synced: log.synced,
          logged_at: log.logged_at
        });

        exGroup.totalVolume += (log.weight_lifted * log.reps_done);
        if (log.weight_lifted > exGroup.maxWeight) {
          exGroup.maxWeight = log.weight_lifted;
        }
        exGroup.totalReps += log.reps_done;
      }

      // Ordenar ejercicios respetando orderIndex
      const groupedExercises = Array.from(exerciseGroupMap.values()).sort((a, b) => a.orderIndex - b.orderIndex);

      // Determinar la rutina a la que pertenece esta sesión
      let routineName = 'Entrenamiento Libre';
      let routineId: string | undefined = undefined;

      const firstEx = exerciseMap.get(firstLog.exercise_id);
      if (firstEx && firstEx.routine_id) {
        const foundRoutine = routineMap.get(firstEx.routine_id);
        if (foundRoutine) {
          routineName = foundRoutine.name;
          routineId = foundRoutine.id;
        }
      }

      const totalVolume = cluster.reduce((sum, l) => sum + (l.weight_lifted * l.reps_done), 0);
      const totalSeries = cluster.length;
      const totalReps = cluster.reduce((sum, l) => sum + l.reps_done, 0);
      const allSynced = cluster.every(l => l.synced === 1);
      const logIds = cluster.map(l => l.id);

      return {
        sessionId: `${dateKey}_${firstLog.id}`,
        dateKey,
        dateDisplay,
        dayOfWeek,
        timeDisplay,
        routineName,
        routineId,
        exercises: groupedExercises,
        totalVolume,
        totalSeries,
        totalReps,
        allSynced,
        logIds
      };
    });

    // Ordenar sesiones: más recientes primero
    return builtSessions.reverse();
  }, [workoutLogs, exerciseMap, routineMap]);

  // Estadísticas globales del historial
  const globalStats = useMemo(() => {
    const totalSessions = sessions.length;
    const totalSeries = sessions.reduce((sum, s) => sum + s.totalSeries, 0);
    const totalVolume = sessions.reduce((sum, s) => sum + s.totalVolume, 0);
    const lastSessionDate = sessions.length > 0 ? sessions[0].dateDisplay : null;

    return {
      totalSessions,
      totalSeries,
      totalVolume,
      lastSessionDate
    };
  }, [sessions]);

  // Filtrado de sesiones por búsqueda y rutina
  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      // Filtro por rutina
      if (selectedRoutineFilter !== 'all') {
        if (session.routineName !== selectedRoutineFilter) return false;
      }

      // Filtro por texto de búsqueda
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesDate = session.dateDisplay.toLowerCase().includes(query) || session.dayOfWeek.toLowerCase().includes(query);
        const matchesRoutine = session.routineName.toLowerCase().includes(query);
        const matchesExercise = session.exercises.some(ex =>
          ex.exerciseName.toLowerCase().includes(query) || ex.muscleGroup.toLowerCase().includes(query)
        );

        if (!matchesDate && !matchesRoutine && !matchesExercise) return false;
      }

      return true;
    });
  }, [sessions, selectedRoutineFilter, searchQuery]);

  // Expandir / colapsar sesión
  const toggleSession = (sessionId: string) => {
    setExpandedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleAllSessions = () => {
    if (expandedSessionIds.size >= filteredSessions.length) {
      setExpandedSessionIds(new Set());
    } else {
      setExpandedSessionIds(new Set(filteredSessions.map(s => s.sessionId)));
    }
  };

  // Eliminar sesión completa
  const handleDeleteSession = async (session: WorkoutSessionGroup) => {
    if (!confirm(`¿Eliminar todo el registro de este entrenamiento del ${session.dateDisplay} (${session.totalSeries} series)?`)) {
      return;
    }

    const now = new Date().toISOString();
    try {
      for (const logId of session.logIds) {
        await db.workout_logs.update(logId, {
          deleted: 1,
          synced: 0,
          updated_at: now
        });
      }
      if (isOnline) triggerSync();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar la sesión.');
    }
  };

  // Eliminar una serie individual
  const handleDeleteSingleLog = async (logId: string) => {
    if (!confirm('¿Eliminar esta serie?')) return;
    const now = new Date().toISOString();
    try {
      await db.workout_logs.update(logId, {
        deleted: 1,
        synced: 0,
        updated_at: now
      });
      if (isOnline) triggerSync();
    } catch (err) {
      console.error(err);
    }
  };

  // Lista única de rutinas para el filtro
  const availableRoutines = useMemo(() => {
    const list = Array.from(new Set(sessions.map(s => s.routineName)));
    return list.filter(Boolean);
  }, [sessions]);

  return (
    <div className="space-y-6">
      {/* HEADER DE HISTORIAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
              <span className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Calendar className="w-5 h-5" />
              </span>
              Historial de Entrenamientos
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sesiones agrupadas por día y ejercicio con volumen levantado y detalle de series.
            </p>
          </div>
        </div>

        {/* Botón expandir/colapsar todo */}
        {filteredSessions.length > 0 && (
          <button
            onClick={toggleAllSessions}
            className="self-start sm:self-center bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {expandedSessionIds.size >= filteredSessions.length ? 'Colapsar todo' : 'Expandir todo'}
            </span>
          </button>
        )}
      </div>

      {/* KPI STATS BAR (DESKTOP OPTIMIZADO) */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total Sesiones */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Entrenamientos</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-white">{globalStats.totalSessions}</span>
              <span className="text-xs font-bold text-emerald-400">completados</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {globalStats.lastSessionDate ? `Último: ${globalStats.lastSessionDate.split(' de ')[0]}` : ''}
            </span>
          </div>

          {/* Volumen Total */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Volumen Acumulado</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-white">
                {globalStats.totalVolume.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-400">lb</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">peso total desplazado</span>
          </div>

          {/* Series Totales */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Series Realizadas</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-white">{globalStats.totalSeries}</span>
              <span className="text-xs font-bold text-cyan-400">series</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">con repeticiones registradas</span>
          </div>

          {/* Promedio de Series por Sesión */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Intensidad Media</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-white">
                {globalStats.totalSessions > 0
                  ? Math.round(globalStats.totalSeries / globalStats.totalSessions)
                  : 0}
              </span>
              <span className="text-xs font-bold text-amber-400">series / sesión</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">constancia de trabajo</span>
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      {sessions.length > 0 && (
        <div className="glass-card rounded-2xl p-3 border border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Input de Búsqueda */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por ejercicio, rutina o fecha..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro por Rutina */}
          {availableRoutines.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedRoutineFilter}
                onChange={e => setSelectedRoutineFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="all">Todas las rutinas</option>
                {availableRoutines.map(rName => (
                  <option key={rName} value={rName}>{rName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* LISTADO DE SESIONES AGRUPADAS */}
      {filteredSessions.length > 0 ? (
        <div className="space-y-4">
          {filteredSessions.map(session => {
            // Por defecto, las primeras 2 sesiones están expandidas si el set está vacío
            const isExpanded = expandedSessionIds.has(session.sessionId) || (expandedSessionIds.size === 0);

            return (
              <div
                key={session.sessionId}
                className="glass-card rounded-2xl border border-slate-800/80 overflow-hidden shadow-lg transition-all hover:border-slate-700"
              >
                {/* CABECERA DE LA SESIÓN */}
                <div
                  onClick={() => toggleSession(session.sessionId)}
                  className="p-4 sm:p-5 bg-slate-950/60 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none border-b border-slate-900"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                      <Dumbbell className="w-5 h-5" />
                    </div>

                    <div>
                      {/* Fecha y Día */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-black text-white tracking-tight">
                          {session.dayOfWeek ? `${session.dayOfWeek}, ${session.dateDisplay}` : session.dateDisplay}
                        </span>
                        {session.timeDisplay && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                            {session.timeDisplay}
                          </span>
                        )}
                        {!session.allSynced && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                            Pendiente sync
                          </span>
                        )}
                      </div>

                      {/* Nombre de la Rutina y Métricas Resumen */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {session.routineName}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-300 font-semibold">
                          {session.exercises.length} {session.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-300 font-semibold">
                          {session.totalSeries} series
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-300 font-bold">
                          {session.totalVolume.toLocaleString()} lb <span className="text-[10px] text-slate-500 font-normal">volumen</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Acciones de la Sesión */}
                  <div className="flex items-center gap-2 self-end md:self-center" onClick={e => e.stopPropagation()}>
                    {session.routineId && onStartWorkoutWithRoutine && (
                      <button
                        onClick={() => {
                          const r = routineMap.get(session.routineId!);
                          if (r) onStartWorkoutWithRoutine(r);
                        }}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                        title="Repetir este entrenamiento"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span className="hidden sm:inline">Repetir</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteSession(session)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                      title="Eliminar este entrenamiento completo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => toggleSession(session.sessionId)}
                      className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* DETALLE DE EJERCICIOS Y SERIES (CUERPO DESPLEGABLE) */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-4 bg-slate-950/20 divide-y divide-slate-800/40">
                    {session.exercises.map((ex, exIdx) => (
                      <div key={ex.exerciseId} className={exIdx > 0 ? 'pt-4' : ''}>
                        {/* Cabecera del Ejercicio */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-500">#{exIdx + 1}</span>
                            <h4 className="text-sm font-bold text-white tracking-wide">
                              {ex.exerciseName}
                            </h4>
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                              {ex.muscleGroup}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>
                              Peso máx: <strong className="text-emerald-400 font-extrabold">{ex.maxWeight} lb</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Volumen: <strong className="text-slate-200 font-bold">{ex.totalVolume.toLocaleString()} lb</strong>
                            </span>
                          </div>
                        </div>

                        {/* Chips / Cuadrícula de Series Realizadas */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                          {ex.series.map((s, sIdx) => (
                            <div
                              key={s.id}
                              className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between group hover:border-slate-700 transition-all"
                            >
                              <div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                                  Serie {sIdx + 1}
                                </span>
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className="text-sm font-black text-white">{s.weight}</span>
                                  <span className="text-[10px] text-slate-400 font-bold">lb</span>
                                  <span className="text-xs text-slate-500 mx-0.5">×</span>
                                  <span className="text-xs font-bold text-emerald-400">{s.reps}</span>
                                  <span className="text-[10px] text-slate-500">reps</span>
                                </div>
                              </div>

                              <button
                                onClick={() => handleDeleteSingleLog(s.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-400 rounded transition-all cursor-pointer"
                                title="Eliminar serie"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-12 border border-slate-900 text-center space-y-3">
          <Dumbbell className="w-12 h-12 text-slate-700 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">
            {searchQuery || selectedRoutineFilter !== 'all'
              ? 'No se encontraron entrenamientos con los filtros aplicados'
              : 'No hay entrenamientos completados aún'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || selectedRoutineFilter !== 'all'
              ? 'Prueba modificando la búsqueda o el filtro de rutina.'
              : 'Inicia y completa una rutina desde el Dashboard para ver tu registro detallado aquí.'}
          </p>
          {(searchQuery || selectedRoutineFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedRoutineFilter('all');
              }}
              className="text-xs text-emerald-400 hover:underline font-bold mt-2 inline-block cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
};
export default WorkoutHistoryView;
