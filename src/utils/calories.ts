import type { LocalExercise } from '../db/db';

// Estimación de calorías con la fórmula MET: kcal = MET × kg × horas
export const CARDIO_MINUTES = 30;
export const CARDIO_MUSCLE_GROUP = 'Cardio';
const CARDIO_MET = 7.0; // Cardio moderado (trote suave, elíptica, bici)
const STRENGTH_MET = 5.0; // Entrenamiento de pesas moderado-vigoroso
const MINUTES_PER_SERIES = 2.5; // ~45 s de trabajo + descanso entre series
export const DEFAULT_WEIGHT_KG = 70;

export const isCardioExercise = (ex?: Partial<LocalExercise> | null): boolean =>
  !!ex && (ex.muscle_group || '').trim().toLowerCase() === CARDIO_MUSCLE_GROUP.toLowerCase();

const kg = (weightKg?: number) => (weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG);

export const estimateStrengthKcal = (series: number, weightKg?: number) =>
  Math.round(STRENGTH_MET * kg(weightKg) * ((series * MINUTES_PER_SERIES) / 60));

export const estimateCardioKcal = (minutes: number, weightKg?: number) =>
  Math.round(CARDIO_MET * kg(weightKg) * (minutes / 60));

export const estimateRoutineCalories = (rExercises: Partial<LocalExercise>[], weightKg?: number) => {
  const totalSeries = rExercises
    .filter(ex => !isCardioExercise(ex))
    .reduce((sum, ex) => sum + (Number(ex.series) || 0), 0);
  const strengthMinutes = totalSeries * MINUTES_PER_SERIES;
  const strengthKcal = estimateStrengthKcal(totalSeries, weightKg);
  const cardioKcal = estimateCardioKcal(CARDIO_MINUTES, weightKg);
  return {
    strengthMinutes: Math.round(strengthMinutes),
    strengthKcal,
    cardioKcal,
    totalMinutes: Math.round(strengthMinutes + CARDIO_MINUTES),
    totalKcal: strengthKcal + cardioKcal,
    usedDefaultWeight: !(weightKg && weightKg > 0)
  };
};
