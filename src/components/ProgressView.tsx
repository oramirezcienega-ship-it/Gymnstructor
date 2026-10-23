import React, { useState, useMemo } from 'react';
import type { LocalBodyMetric } from '../db/db';
import { db } from '../db/db';
import {
  TrendingUp,
  TrendingDown,
  User,
  Save,
  Scale,
  Plus,
  Calendar,
  Trash2,
  Edit,
  X,
  Table as TableIcon,
  LayoutGrid,
  ArrowUpDown,
  Sparkles,
  Droplets,
  Zap,
  Flame,
  Clock,
  HeartPulse,
  Activity,
  CheckCircle2,
  Brain,
  Award,
  Target,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ProgressViewProps {
  userHeight: number;
  setUserHeight: (val: number) => void;
  userGender: string;
  setUserGender: (val: string) => void;
  userBirthDate: string;
  setUserBirthDate: (val: string) => void;
  handleSavePhysicalProfile: () => Promise<void>;
  isSavingProfile: boolean;
  bodyMetrics: LocalBodyMetric[] | undefined;
  currentUserId: string | undefined;
  onSignOut: () => void;
  triggerSync: (force?: boolean) => void;
  isOnline: boolean;
}

export type MetricKey = 'weight' | 'body_fat' | 'muscle_mass' | 'bmi' | 'bmr' | 'body_age' | 'visceral_fat';

interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  isDesirableLower: boolean;
  step: string;
  description: string;
  placeholder: string;
}

const METRIC_CONFIGS: Record<MetricKey, MetricConfig> = {
  weight: {
    key: 'weight',
    label: 'Peso Corporal',
    shortLabel: 'Peso',
    unit: 'kg',
    color: '#10b981', // emerald
    icon: Scale,
    isDesirableLower: true,
    step: '0.1',
    description: 'Evolución del peso corporal total.',
    placeholder: 'Ej: 75.4',
  },
  body_fat: {
    key: 'body_fat',
    label: '% Grasa Corporal',
    shortLabel: '% Grasa',
    unit: '%',
    color: '#f59e0b', // amber
    icon: Droplets,
    isDesirableLower: true,
    step: '0.1',
    description: 'Porcentaje de masa adiposa en el cuerpo.',
    placeholder: 'Ej: 15.2',
  },
  muscle_mass: {
    key: 'muscle_mass',
    label: '% Músculo Esquelético',
    shortLabel: '% Músculo',
    unit: '%',
    color: '#06b6d4', // cyan
    icon: Zap,
    isDesirableLower: false,
    step: '0.1',
    description: 'Porcentaje de músculo activo y motor del metabolismo.',
    placeholder: 'Ej: 42.1',
  },
  bmi: {
    key: 'bmi',
    label: 'Índice de Masa Corporal (IMC)',
    shortLabel: 'IMC',
    unit: '',
    color: '#a855f7', // purple
    icon: Activity,
    isDesirableLower: true,
    step: '0.1',
    description: 'Relación estándar entre peso y estatura (kg/m²).',
    placeholder: 'Ej: 24.2',
  },
  bmr: {
    key: 'bmr',
    label: 'Metabolismo Basal (RM)',
    shortLabel: 'Metab. Basal',
    unit: 'kcal',
    color: '#f43f5e', // rose
    icon: Flame,
    isDesirableLower: false,
    step: '1',
    description: 'Calorías requeridas en reposo absoluto para funciones vitales.',
    placeholder: 'Ej: 1650',
  },
  body_age: {
    key: 'body_age',
    label: 'Edad Corporal',
    shortLabel: 'Edad Corp.',
    unit: 'años',
    color: '#6366f1', // indigo
    icon: Clock,
    isDesirableLower: true,
    step: '1',
    description: 'Edad biológica calculada según la composición corporal.',
    placeholder: 'Ej: 28',
  },
  visceral_fat: {
    key: 'visceral_fat',
    label: 'Grasa Visceral',
    shortLabel: 'Grasa Visc.',
    unit: 'nivel',
    color: '#ef4444', // red
    icon: HeartPulse,
    isDesirableLower: true,
    step: '1',
    description: 'Nivel de grasa en la cavidad abdominal (ideal: 1 a 9).',
    placeholder: 'Ej: 5',
  },
};

// Formato de fecha larga DD/MM/YYYY
const formatDate = (dateValue: string | Date | undefined | null): string => {
  if (!dateValue) return '';
  if (typeof dateValue === 'string' && dateValue.includes('T')) {
    const parts = dateValue.split('T')[0].split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
  }
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Formato de fecha corta para ejes y gráficos (ej. "19 oct")
const formatShortDate = (dateValue: string | Date | undefined | null): string => {
  if (!dateValue) return '';
  let dayStr = '';
  let monthIndex = -1;
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  if (typeof dateValue === 'string' && dateValue.includes('T')) {
    const parts = dateValue.split('T')[0].split('-');
    if (parts.length === 3) {
      dayStr = parts[2];
      monthIndex = parseInt(parts[1], 10) - 1;
    }
  }

  if (monthIndex < 0 || monthIndex > 11) {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (isNaN(date.getTime())) return '';
    dayStr = String(date.getDate());
    monthIndex = date.getMonth();
  }

  return `${parseInt(dayStr, 10)} ${monthNames[monthIndex]}`;
};

// Helper micro-componente para renderizar la variación (Delta)
interface DeltaBadgeProps {
  delta: number | null | undefined;
  unit?: string;
  isDesirableLower?: boolean;
  className?: string;
}

const DeltaBadge: React.FC<DeltaBadgeProps> = ({ delta, unit = '', isDesirableLower = true, className = '' }) => {
  if (delta === null || delta === undefined || isNaN(delta)) return null;
  if (Math.abs(delta) < 0.01) {
    return (
      <span className={`inline-flex items-center text-[10px] font-semibold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ${className}`}>
        = 0.0
      </span>
    );
  }

  const isPositive = delta > 0;
  // Si bajar es deseable (peso, grasa, edad, grasa visceral):
  // negativo es BUENO (verde), positivo es ALERTA (ámbar/rojo)
  const isFavorable = isDesirableLower ? !isPositive : isPositive;
  const formattedVal = Math.abs(delta).toFixed(unit === 'kcal' || unit === 'nivel' || unit === 'años' ? 0 : 1);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
        isFavorable
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      } ${className}`}
    >
      {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {isPositive ? '+' : '-'}{formattedVal}{unit ? `${unit}` : ''}
    </span>
  );
};

export const ProgressView: React.FC<ProgressViewProps> = ({
  userHeight,
  setUserHeight,
  userGender,
  setUserGender,
  userBirthDate,
  setUserBirthDate,
  handleSavePhysicalProfile,
  isSavingProfile,
  bodyMetrics,
  currentUserId,
  onSignOut,
  triggerSync,
  isOnline,
}) => {
  // Estado para la métrica activa en el gráfico de evolución
  const [activeMetric, setActiveMetric] = useState<MetricKey>('weight');
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  // Estados para vista del histórico (tabla vs tarjetas y orden)
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'cards'>('table');
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');

  // Estados para secciones contraíbles (por defecto contraídas para optimizar espacio y visualización)
  const [isAiAnalysisOpen, setIsAiAnalysisOpen] = useState(false);
  const [isGeneralDataOpen, setIsGeneralDataOpen] = useState(false);
  const [isNewMetricOpen, setIsNewMetricOpen] = useState(false);

  // Estados del formulario para nueva medición
  const [weightInput, setWeightInput] = useState<string>('');
  const [bmiInput, setBmiInput] = useState<string>('');
  const [fatInput, setFatInput] = useState<string>('');
  const [muscleInput, setMuscleInput] = useState<string>('');
  const [bmrInput, setBmrInput] = useState<string>('');
  const [visceralFatInput, setVisceralFatInput] = useState<string>('');
  const [bodyAgeInput, setBodyAgeInput] = useState<string>('');
  const [metricDate, setMetricDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Estado para modal de edición de medición
  const [editingMetric, setEditingMetric] = useState<LocalBodyMetric | null>(null);
  const [editWeight, setEditWeight] = useState<string>('');
  const [editBmi, setEditBmi] = useState<string>('');
  const [editFat, setEditFat] = useState<string>('');
  const [editMuscle, setEditMuscle] = useState<string>('');
  const [editBmr, setEditBmr] = useState<string>('');
  const [editVisceralFat, setEditVisceralFat] = useState<string>('');
  const [editBodyAge, setEditBodyAge] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');

  // Mediciones activas (no eliminadas) ordenadas cronológicamente (más antiguo -> más reciente)
  const chronologicalMetrics = useMemo(() => {
    if (!bodyMetrics) return [];
    return bodyMetrics
      .filter(m => m.deleted === 0)
      .slice()
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
  }, [bodyMetrics]);

  // Mapa de deltas calculados con respecto a la medición inmediatamente anterior
  const metricsWithDeltas = useMemo(() => {
    return chronologicalMetrics.map((current, idx) => {
      const prev = idx > 0 ? chronologicalMetrics[idx - 1] : null;

      // Cálculo de BMI si no existe
      const currentBmi = current.bmi || (userHeight > 0 && current.weight > 0
        ? Number((current.weight / ((userHeight / 100) ** 2)).toFixed(1))
        : undefined);
      
      const prevBmi = prev ? (prev.bmi || (userHeight > 0 && prev.weight > 0
        ? Number((prev.weight / ((userHeight / 100) ** 2)).toFixed(1))
        : undefined)) : undefined;

      return {
        ...current,
        calculatedBmi: currentBmi,
        deltas: {
          weight: prev ? current.weight - prev.weight : null,
          body_fat: prev && prev.body_fat > 0 && current.body_fat > 0 ? current.body_fat - prev.body_fat : null,
          muscle_mass: prev && prev.muscle_mass > 0 && current.muscle_mass > 0 ? current.muscle_mass - prev.muscle_mass : null,
          bmi: prev && prevBmi !== undefined && currentBmi !== undefined ? currentBmi - prevBmi : null,
          bmr: prev && prev.bmr && current.bmr ? current.bmr - prev.bmr : null,
          body_age: prev && prev.body_age && current.body_age ? current.body_age - prev.body_age : null,
          visceral_fat: prev && prev.visceral_fat && current.visceral_fat ? current.visceral_fat - prev.visceral_fat : null,
        }
      };
    });
  }, [chronologicalMetrics, userHeight]);

  // Lista para el histórico según orden seleccionado (descendente o ascendente)
  const displayedHistory = useMemo(() => {
    const list = [...metricsWithDeltas];
    if (historySortOrder === 'desc') {
      return list.reverse();
    }
    return list;
  }, [metricsWithDeltas, historySortOrder]);

  // Guardar nueva medición
  const handleSaveMetric = async () => {
    if (!currentUserId) return;
    if (!weightInput || isNaN(Number(weightInput)) || Number(weightInput) <= 0) {
      alert('Introduce un valor de peso válido (en kg).');
      return;
    }

    const now = new Date().toISOString();
    const metricId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

    try {
      const calculatedBmi = bmiInput
        ? Number(bmiInput)
        : userHeight > 0 && weightInput
        ? Number((Number(weightInput) / ((userHeight / 100) * (userHeight / 100))).toFixed(1))
        : undefined;

      await db.body_metrics.add({
        id: metricId,
        user_id: currentUserId,
        weight: Number(weightInput),
        bmi: calculatedBmi,
        body_fat: Number(fatInput) || 0,
        muscle_mass: Number(muscleInput) || 0,
        bmr: Number(bmrInput) || undefined,
        body_age: Number(bodyAgeInput) || undefined,
        visceral_fat: Number(visceralFatInput) || undefined,
        logged_at: metricDate.includes('T') ? metricDate : new Date(`${metricDate}T12:00:00`).toISOString(),
        deleted: 0,
        created_at: now,
        updated_at: now,
        synced: 0
      });

      setWeightInput('');
      setBmiInput('');
      setFatInput('');
      setMuscleInput('');
      setBmrInput('');
      setVisceralFatInput('');
      setBodyAgeInput('');
      alert('Medición registrada con éxito.');
      if (isOnline) triggerSync();
    } catch (err) {
      console.error(err);
      alert('Error al registrar la medición.');
    }
  };

  // Abrir modal de edición
  const handleOpenEditModal = (metric: LocalBodyMetric) => {
    setEditingMetric(metric);
    setEditWeight(String(metric.weight || ''));
    setEditBmi(metric.bmi ? String(metric.bmi) : '');
    setEditFat(metric.body_fat > 0 ? String(metric.body_fat) : '');
    setEditMuscle(metric.muscle_mass > 0 ? String(metric.muscle_mass) : '');
    setEditBmr(metric.bmr ? String(metric.bmr) : '');
    setEditVisceralFat(metric.visceral_fat ? String(metric.visceral_fat) : '');
    setEditBodyAge(metric.body_age ? String(metric.body_age) : '');
    setEditDate(metric.logged_at ? metric.logged_at.split('T')[0] : '');
  };

  // Guardar edición
  const handleSaveEdit = async () => {
    if (!editingMetric) return;
    if (!editWeight || isNaN(Number(editWeight)) || Number(editWeight) <= 0) {
      alert('El peso debe ser un número válido.');
      return;
    }

    const now = new Date().toISOString();
    try {
      const calculatedBmi = editBmi
        ? Number(editBmi)
        : userHeight > 0 && editWeight
        ? Number((Number(editWeight) / ((userHeight / 100) * (userHeight / 100))).toFixed(1))
        : undefined;

      await db.body_metrics.update(editingMetric.id, {
        weight: Number(editWeight),
        bmi: calculatedBmi,
        body_fat: Number(editFat) || 0,
        muscle_mass: Number(editMuscle) || 0,
        bmr: Number(editBmr) || undefined,
        body_age: Number(editBodyAge) || undefined,
        visceral_fat: Number(editVisceralFat) || undefined,
        logged_at: editDate.includes('T') ? editDate : new Date(`${editDate}T12:00:00`).toISOString(),
        synced: 0,
        updated_at: now
      });

      setEditingMetric(null);
      if (isOnline) triggerSync();
    } catch (err) {
      console.error(err);
      alert('Error al actualizar la medición.');
    }
  };

  // Eliminar medición
  const handleDeleteMetric = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta medición?')) return;
    const now = new Date().toISOString();
    try {
      await db.body_metrics.update(id, {
        deleted: 1,
        synced: 0,
        updated_at: now
      });
      if (isOnline) triggerSync();
    } catch (err) {
      console.error(err);
    }
  };

  // Puntos del gráfico para la métrica seleccionada
  const activeMetricConfig = METRIC_CONFIGS[activeMetric];

  const chartPoints = useMemo(() => {
    return chronologicalMetrics
      .map(m => {
        let val: number | undefined;
        if (activeMetric === 'weight') val = m.weight;
        else if (activeMetric === 'body_fat') val = m.body_fat > 0 ? m.body_fat : undefined;
        else if (activeMetric === 'muscle_mass') val = m.muscle_mass > 0 ? m.muscle_mass : undefined;
        else if (activeMetric === 'bmi') {
          val = m.bmi || (userHeight > 0 && m.weight > 0
            ? Number((m.weight / ((userHeight / 100) ** 2)).toFixed(1))
            : undefined);
        } else if (activeMetric === 'bmr') val = m.bmr && m.bmr > 0 ? m.bmr : undefined;
        else if (activeMetric === 'body_age') val = m.body_age && m.body_age > 0 ? m.body_age : undefined;
        else if (activeMetric === 'visceral_fat') val = m.visceral_fat && m.visceral_fat > 0 ? m.visceral_fat : undefined;

        return {
          id: m.id,
          logged_at: m.logged_at,
          val: val
        };
      })
      .filter((p): p is { id: string; logged_at: string; val: number } => p.val !== undefined && p.val > 0);
  }, [chronologicalMetrics, activeMetric, userHeight]);

  // Estadísticas clave de la métrica activa
  const activeMetricStats = useMemo(() => {
    if (chartPoints.length === 0) return null;
    const values = chartPoints.map(p => p.val);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const latestPoint = chartPoints[chartPoints.length - 1];
    const firstPoint = chartPoints[0];
    const prevPoint = chartPoints.length > 1 ? chartPoints[chartPoints.length - 2] : null;

    const deltaRecent = prevPoint ? latestPoint.val - prevPoint.val : 0;
    const deltaTotal = chartPoints.length > 1 ? latestPoint.val - firstPoint.val : 0;

    return {
      current: latestPoint.val,
      currentDate: latestPoint.logged_at,
      min: minVal,
      max: maxVal,
      deltaRecent,
      deltaTotal,
      count: chartPoints.length
    };
  }, [chartPoints]);

  // Dimensiones del SVG del gráfico
  const svgWidth = 880;
  const svgHeight = 260;
  const paddingLeft = 55;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 40;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const svgData = useMemo(() => {
    if (chartPoints.length < 2) return null;

    const vals = chartPoints.map(p => p.val);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const spread = rawMax - rawMin;
    const buffer = spread > 0 ? spread * 0.15 : (rawMin * 0.05 || 1);
    const yMin = Math.max(0, rawMin - buffer);
    const yMax = rawMax + buffer;
    const yRange = yMax - yMin || 1;

    const points = chartPoints.map((p, idx) => {
      const x = paddingLeft + (idx / (chartPoints.length - 1)) * plotWidth;
      const y = (paddingTop + plotHeight) - ((p.val - yMin) / yRange) * plotHeight;
      return { ...p, x, y };
    });

    const pathD = `M ${points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(paddingTop + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(paddingTop + plotHeight).toFixed(1)} Z`;

    // Selección de fechas a mostrar en eje X para no saturar
    const dateIndices = new Set<number>();
    if (points.length <= 7) {
      points.forEach((_, i) => dateIndices.add(i));
    } else {
      dateIndices.add(0);
      dateIndices.add(points.length - 1);
      const step = Math.ceil(points.length / 5);
      for (let i = step; i < points.length - 1; i += step) {
        dateIndices.add(i);
      }
    }

    // Guías horizontales de referencia
    const gridLines = [
      { y: paddingTop, val: yMax },
      { y: paddingTop + plotHeight * 0.33, val: yMin + yRange * 0.67 },
      { y: paddingTop + plotHeight * 0.67, val: yMin + yRange * 0.33 },
      { y: paddingTop + plotHeight, val: yMin }
    ];

    return { points, pathD, areaD, dateIndices, gridLines, yMin, yMax };
  }, [chartPoints, plotWidth, plotHeight, paddingLeft, paddingTop]);

  // Cálculo de diagnóstico de IMC actual
  const latestMetric = chronologicalMetrics.length > 0 ? chronologicalMetrics[chronologicalMetrics.length - 1] : null;
  const currentBmiData = useMemo(() => {
    if (!latestMetric || !userHeight || userHeight <= 0) return null;
    const heightM = userHeight / 100;
    const bmi = latestMetric.weight / (heightM * heightM);

    let classification = '';
    let colorClass = '';
    let bgClass = '';
    let sliderPercent = 0;

    if (bmi < 18.5) {
      classification = 'Bajo Peso';
      colorClass = 'text-blue-400';
      bgClass = 'bg-blue-500/10 border-blue-500/20';
      sliderPercent = Math.max(0, Math.min(100, ((bmi - 14) / 22) * 100));
    } else if (bmi >= 18.5 && bmi < 25) {
      classification = 'Rango Saludable';
      colorClass = 'text-emerald-400';
      bgClass = 'bg-emerald-500/10 border-emerald-500/20';
      sliderPercent = Math.max(0, Math.min(100, ((bmi - 14) / 22) * 100));
    } else if (bmi >= 25 && bmi < 30) {
      classification = 'Sobrepeso';
      colorClass = 'text-amber-400';
      bgClass = 'bg-amber-500/10 border-amber-500/20';
      sliderPercent = Math.max(0, Math.min(100, ((bmi - 14) / 22) * 100));
    } else {
      classification = 'Obesidad';
      colorClass = 'text-rose-400';
      bgClass = 'bg-rose-500/10 border-rose-500/20';
      sliderPercent = Math.max(0, Math.min(100, ((bmi - 14) / 22) * 100));
    }

    const minHealthyWeight = (18.5 * (heightM * heightM)).toFixed(1);
    const maxHealthyWeight = (24.9 * (heightM * heightM)).toFixed(1);

    return {
      bmi: bmi.toFixed(1),
      classification,
      colorClass,
      bgClass,
      sliderPercent,
      minHealthyWeight,
      maxHealthyWeight,
      weight: latestMetric.weight
    };
  }, [latestMetric, userHeight]);

  // --- MOTOR DE ANÁLISIS INTELIGENTE DE PROGRESO CON IA (EVOLUCIÓN & LOGROS) ---
  const aiAnalysis = useMemo(() => {
    if (chronologicalMetrics.length === 0) {
      return {
        hasData: false,
        totalMeasurements: 0,
        title: 'Sin mediciones registradas',
        summary: 'Comienza registrando tu primer peso y métricas biométricas para activar el análisis inteligente de evolución.',
        achievements: [],
        coachTip: 'Registra tus datos con regularidad (por ejemplo cada 1 o 2 semanas en ayunas) para obtener un análisis de alta precisión.',
        deltas: null,
        firstMetrics: null,
        latestMetrics: null,
        timespanDays: 0
      };
    }

    if (chronologicalMetrics.length === 1) {
      const first = chronologicalMetrics[0];
      return {
        hasData: true,
        isBaseline: true,
        totalMeasurements: 1,
        timespanDays: 0,
        firstDate: first.logged_at,
        lastDate: first.logged_at,
        title: 'Línea Base Biológica Registrada',
        summary: `Has establecido tu medición de partida con ${first.weight} kg${first.body_fat > 0 ? ` y ${first.body_fat}% de grasa` : ''}${first.muscle_mass > 0 ? ` (${first.muscle_mass}% músculo)` : ''}. La IA comenzará a trazar tu curva evolutiva, cambios metabólicos y logros en cuanto registres tu siguiente medición.`,
        achievements: [
          {
            id: 'first_step',
            title: 'Punto de Partida',
            description: 'Primera medición establecida en el sistema',
            badgeText: 'Base lista',
            type: 'positive' as const
          }
        ],
        coachTip: 'El mejor momento para registrar mediciones corporales es por la mañana, en ayunas y después de ir al baño, para maximizar la consistencia de los datos.',
        deltas: null,
        firstMetrics: first,
        latestMetrics: first
      };
    }

    // Análisis con 2 o más mediciones
    const first = chronologicalMetrics[0];
    const latest = chronologicalMetrics[chronologicalMetrics.length - 1];
    const prev = chronologicalMetrics[chronologicalMetrics.length - 2];

    const timespanMs = Math.abs(new Date(latest.logged_at).getTime() - new Date(first.logged_at).getTime());
    const timespanDays = Math.max(1, Math.round(timespanMs / (1000 * 60 * 60 * 24)));

    const deltaWeight = Number((latest.weight - first.weight).toFixed(2));
    const deltaFat = first.body_fat > 0 && latest.body_fat > 0 ? Number((latest.body_fat - first.body_fat).toFixed(1)) : null;
    const deltaMuscle = first.muscle_mass > 0 && latest.muscle_mass > 0 ? Number((latest.muscle_mass - first.muscle_mass).toFixed(1)) : null;
    const deltaVisceral = first.visceral_fat && latest.visceral_fat ? latest.visceral_fat - first.visceral_fat : null;
    const deltaBodyAge = first.body_age && latest.body_age ? latest.body_age - first.body_age : null;
    const deltaBmr = first.bmr && latest.bmr ? latest.bmr - first.bmr : null;

    // Deltas recientes vs la penúltima medición
    const recentDeltaWeight = Number((latest.weight - prev.weight).toFixed(2));

    // Determinar Logros Desbloqueados
    const achievements: {
      id: string;
      title: string;
      description: string;
      badgeText: string;
      type: 'positive' | 'neutral' | 'muscle' | 'fire';
    }[] = [];

    // 1. Logro de Peso
    if (deltaWeight < -0.5) {
      achievements.push({
        id: 'weight_loss',
        title: 'Pérdida de Peso Sostenida',
        description: `Has reducido ${Math.abs(deltaWeight)} kg en ${timespanDays} días`,
        badgeText: `-${Math.abs(deltaWeight)} kg`,
        type: 'positive'
      });
    } else if (deltaWeight > 1.0 && deltaMuscle !== null && deltaMuscle > 0) {
      achievements.push({
        id: 'lean_bulk',
        title: 'Ganancia Muscular Neta',
        description: `Subiste +${deltaWeight} kg acompañado de aumento en masa muscular`,
        badgeText: `+${deltaWeight} kg`,
        type: 'muscle'
      });
    }

    // 2. Logro de Grasa Visceral
    if (deltaVisceral !== null && deltaVisceral < 0) {
      achievements.push({
        id: 'visceral_drop',
        title: 'Reducción de Grasa Visceral',
        description: `Grasa visceral reducida de nivel ${first.visceral_fat} a ${latest.visceral_fat}`,
        badgeText: `${deltaVisceral} nivel${Math.abs(deltaVisceral) > 1 ? 'es' : ''}`,
        type: 'positive'
      });
    }

    // 3. Logro de Edad Corporal
    if (deltaBodyAge !== null && deltaBodyAge < 0) {
      achievements.push({
        id: 'body_age_rejuvenation',
        title: 'Rejuvenecimiento Biológico',
        description: `Edad corporal reducida de ${first.body_age} a ${latest.body_age} años`,
        badgeText: `${deltaBodyAge} años`,
        type: 'positive'
      });
    }

    // 4. Logro de Grasa Corporal
    if (deltaFat !== null && deltaFat < 0) {
      achievements.push({
        id: 'body_fat_drop',
        title: 'Oxidación Adiposa Efectiva',
        description: `Porcentaje graso reducido de ${first.body_fat}% a ${latest.body_fat}%`,
        badgeText: `${deltaFat}%`,
        type: 'fire'
      });
    }

    // 5. Logro de Masa Muscular
    if (deltaMuscle !== null && deltaMuscle > 0) {
      achievements.push({
        id: 'muscle_gain',
        title: 'Incremento Muscular Magro',
        description: `Masa muscular aumentada de ${first.muscle_mass}% a ${latest.muscle_mass}%`,
        badgeText: `+${deltaMuscle}%`,
        type: 'muscle'
      });
    } else if (deltaMuscle !== null && Math.abs(deltaMuscle) <= 0.3 && deltaWeight < -1.0) {
      achievements.push({
        id: 'muscle_shield',
        title: 'Blindaje de Masa Muscular',
        description: `Mantienes ${latest.muscle_mass}% de músculo íntegro mientras pierdes peso`,
        badgeText: `Músculo Protegido`,
        type: 'muscle'
      });
    }

    // 6. Constancia
    if (chronologicalMetrics.length >= 5) {
      achievements.push({
        id: 'consistency',
        title: 'Disciplina y Constancia',
        description: `${chronologicalMetrics.length} registros biométricos continuos completados`,
        badgeText: `${chronologicalMetrics.length} registros`,
        type: 'positive'
      });
    }

    // Diagnóstico narrativo general
    let title = 'Evolución Corporal Positiva';
    let summary = '';
    let coachTip = '';

    if (deltaWeight < 0 && (deltaFat === null || deltaFat <= 0) && (deltaMuscle === null || deltaMuscle >= -0.5)) {
      title = 'Recomposición Corporal Favorable en Progreso';
      summary = `Tu evolución muestra una reducción neta de ${Math.abs(deltaWeight)} kg${deltaFat !== null && deltaFat < 0 ? ` y ${Math.abs(deltaFat)}% de grasa corporal` : ''}${deltaVisceral !== null && deltaVisceral < 0 ? `, disminuyendo la grasa visceral a nivel ${latest.visceral_fat}` : ''}. Tu masa muscular se mantiene sólida en ${latest.muscle_mass ? `${latest.muscle_mass}%` : 'rango óptimo'}, confirmando una pérdida selectiva de tejido graso sin degradación muscular.`;
      coachTip = 'Sigue priorizando la ingesta de proteína (~1.6 - 2.0g por kg de peso corporal) y la sobrecarga progresiva en el gimnasio para estimular la síntesis proteica muscular durante el déficit calórico.';
    } else if (deltaWeight > 0 && deltaMuscle !== null && deltaMuscle > 0) {
      title = 'Fase de Hipertrofia y Construcción Magra';
      summary = `Has aumentado ${deltaWeight} kg acompañados de un incremento de +${deltaMuscle}% en músculo esquelético. Esta tendencia refleja una respuesta anabólica positiva a tu entrenamiento de fuerza.`;
      coachTip = 'Mantén el control sobre el consumo de carbohidratos complejos y grasas saludables para maximizar la construcción de tejido muscular magro evitando picos innecesarios de grasa adiposa.';
    } else if (deltaWeight < 0 && deltaMuscle !== null && deltaMuscle < -0.8) {
      title = 'Atención a la Preservación Muscular';
      summary = `Has bajado ${Math.abs(deltaWeight)} kg, pero se detecta una ligera disminución en el % de músculo esquelético (${deltaMuscle}%). Es recomendable ajustar la intensidad de entrenamiento y la nutrición.`;
      coachTip = 'Eleva tu consumo de proteínas y asegúrate de no estar en un déficit calórico demasiado agresivo (>25%). Entrenar con pesos exigentes ayuda al cuerpo a retener masa muscular.';
    } else {
      title = 'Fase de Adaptación y Mantenimiento';
      summary = `Tu composición corporal se mantiene estable en ${latest.weight} kg${latest.body_fat > 0 ? ` con ${latest.body_fat}% de grasa` : ''}${latest.muscle_mass > 0 ? ` y ${latest.muscle_mass}% de músculo` : ''}. La estabilidad es fundamental para consolidar adaptaciones metabólicas a largo plazo.`;
      coachTip = 'Si tu meta es definir más o construir volumen, introduce un ajuste moderado en tus calorías diarias (+/- 250 kcal) o incrementa el volumen de series en tus ejercicios principales.';
    }

    return {
      hasData: true,
      isBaseline: false,
      totalMeasurements: chronologicalMetrics.length,
      timespanDays,
      firstDate: first.logged_at,
      lastDate: latest.logged_at,
      title,
      summary,
      deltas: {
        weight: deltaWeight,
        bodyFat: deltaFat,
        muscleMass: deltaMuscle,
        visceralFat: deltaVisceral,
        bodyAge: deltaBodyAge,
        bmr: deltaBmr,
        recentWeight: recentDeltaWeight
      },
      firstMetrics: first,
      latestMetrics: latest,
      achievements,
      coachTip
    };
  }, [chronologicalMetrics]);

  return (
    <div className="space-y-6">
      {/* HEADER DE LA SECCIÓN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-900">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
            <span className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </span>
            Mi Progreso Físico
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Panel de analítica y composición corporal: peso, grasa, masa muscular y métricas bioeléctricas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-xl">
            {chronologicalMetrics.length} {chronologicalMetrics.length === 1 ? 'medición' : 'mediciones'} registradas
          </span>
          <button
            onClick={onSignOut}
            className="text-[11px] text-slate-400 hover:text-rose-400 font-medium bg-slate-900 border border-slate-800 hover:border-rose-500/20 px-3 py-1 rounded-xl transition-all cursor-pointer"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* ================= PANEL DE ANÁLISIS INTELIGENTE DE IA & LOGROS (CONTRAÍBLE) ================= */}
      {aiAnalysis.hasData && (
        <div className="glass-card rounded-3xl p-4 sm:p-5 border border-emerald-500/30 bg-gradient-to-br from-slate-900/95 via-emerald-950/20 to-slate-900/90 shadow-2xl shadow-emerald-500/5 relative overflow-hidden transition-all duration-300">
          {/* Decoración de fondo sutil con brillo */}
          <div className="absolute top-0 right-0 -translate-y-8 translate-x-8 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

          {/* Cabecera del Panel IA (Clickeable para expandir/contraer) */}
          <div 
            onClick={() => setIsAiAnalysisOpen(!isAiAnalysisOpen)}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 cursor-pointer select-none transition-colors group ${
              isAiAnalysisOpen ? 'pb-4 border-b border-slate-800/80' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/10 shrink-0 group-hover:scale-105 transition-transform">
                <Brain className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Análisis de IA
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {aiAnalysis.timespanDays ? `Trayectoria de ${aiAnalysis.timespanDays} días (${aiAnalysis.totalMeasurements} mediciones)` : 'Medición de partida'}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                  {aiAnalysis.title}
                </h3>
              </div>
            </div>

            {/* Resumen rápido de progreso y botón toggle */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
              {aiAnalysis.deltas && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1 text-center">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Peso</span>
                    <span className={`text-[11px] font-black ${aiAnalysis.deltas.weight <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {aiAnalysis.deltas.weight > 0 ? `+${aiAnalysis.deltas.weight}` : aiAnalysis.deltas.weight} kg
                    </span>
                  </div>
                  {aiAnalysis.deltas.bodyFat !== null && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1 text-center">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">% Grasa</span>
                      <span className={`text-[11px] font-black ${aiAnalysis.deltas.bodyFat <= 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                        {aiAnalysis.deltas.bodyFat > 0 ? `+${aiAnalysis.deltas.bodyFat}` : aiAnalysis.deltas.bodyFat}%
                      </span>
                    </div>
                  )}
                  {aiAnalysis.deltas.muscleMass !== null && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1 text-center">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">% Músculo</span>
                      <span className={`text-[11px] font-black ${aiAnalysis.deltas.muscleMass >= 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
                        {aiAnalysis.deltas.muscleMass > 0 ? `+${aiAnalysis.deltas.muscleMass}` : aiAnalysis.deltas.muscleMass}%
                      </span>
                    </div>
                  )}
                </div>
              )}

              <button 
                type="button"
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1.5 rounded-xl transition-all shrink-0 ml-auto sm:ml-0 cursor-pointer"
              >
                {isAiAnalysisOpen ? (
                  <>Contraer <ChevronUp className="w-3.5 h-3.5" /></>
                ) : (
                  <>Ver análisis <ChevronDown className="w-3.5 h-3.5" /></>
                )}
              </button>
            </div>
          </div>

          {/* Cuerpo del Análisis: Texto diagnóstico y Consejos (visible si isAiAnalysisOpen === true) */}
          {isAiAnalysisOpen && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-4 relative z-10 animate-in fade-in duration-200">
              {/* Diagnóstico narrativo */}
              <div className="lg:col-span-8 space-y-3">
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                  {aiAnalysis.summary}
                </p>

                {/* Logros / Hitos alcanzados */}
                {aiAnalysis.achievements.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" /> Logros e Hitos Detectados
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {aiAnalysis.achievements.map(ach => (
                        <div 
                          key={ach.id}
                          className="bg-slate-950/60 border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-2.5 flex items-start justify-between gap-2 transition-all"
                        >
                          <div>
                            <p className="text-xs font-bold text-white leading-tight">{ach.title}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{ach.description}</p>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border shrink-0 ${
                            ach.type === 'positive' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : ach.type === 'muscle'
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                              : ach.type === 'fire'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {ach.badgeText}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Consejo del Coach IA */}
              <div className="lg:col-span-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-emerald-400" /> Siguiente Paso Recomendado
                  </span>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {aiAnalysis.coachTip}
                  </p>
                </div>

                {aiAnalysis.latestMetrics && (
                  <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Último análisis: {formatDate(aiAnalysis.latestMetrics.logged_at)}</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Estado Óptimo
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DASHBOARD PRINCIPAL EN GRID DESKTOP (2 COLUMNAS EN LG+) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ================= COLUMNA IZQUIERDA: DATOS DEL ATLETA & REGISTRO (4 COLS EN DESKTOP) ================= */}
        <div className="lg:col-span-4 space-y-6">

          {/* 1. FICHA GENERAL DE PERFIL FÍSICO (CONTRAÍBLE) */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800/80 transition-all duration-300">
            <div 
              onClick={() => setIsGeneralDataOpen(!isGeneralDataOpen)}
              className="flex items-center justify-between cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider group-hover:text-white transition-colors">
                    Datos Generales
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {userHeight ? `${userHeight} cm` : 'Sin altura'} • {userGender || 'Sin definir'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300 hidden sm:inline">
                  {isGeneralDataOpen ? 'Contraer' : 'Editar'}
                </span>
                <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-emerald-400 transition-colors">
                  {isGeneralDataOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>
            </div>

            {isGeneralDataOpen && (
              <div className="space-y-4 pt-4 border-t border-slate-800/60 mt-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Altura (cm)</label>
                    <input
                      type="number"
                      value={userHeight || ''}
                      onChange={e => setUserHeight(Number(e.target.value) || 0)}
                      placeholder="Ej: 175"
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sexo Biológico</label>
                    <select
                      value={userGender}
                      onChange={e => setUserGender(e.target.value)}
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 font-medium"
                    >
                      <option value="">Selecciona</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nacimiento</label>
                    <input
                      type="date"
                      value={userBirthDate}
                      onChange={e => setUserBirthDate(e.target.value)}
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-2 py-2 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 text-center"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSavePhysicalProfile}
                  disabled={isSavingProfile}
                  className="w-full bg-slate-900 hover:bg-slate-850 text-slate-200 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/30 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  {isSavingProfile ? 'Guardando...' : 'Guardar Datos Físicos'}
                </button>
              </div>
            )}
          </div>

          {/* 2. DIAGNÓSTICO INTELIGENTE DE IMC */}
          {currentBmiData && (
            <div className={`glass-card rounded-2xl p-4 sm:p-5 border ${currentBmiData.bgClass} space-y-3`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Diagnóstico de IMC Actual</p>
                  <h4 className={`text-xl font-black ${currentBmiData.colorClass} mt-0.5 tracking-tight`}>
                    {currentBmiData.bmi} <span className="text-xs font-medium text-slate-300">— {currentBmiData.classification}</span>
                  </h4>
                </div>
                <div className={`p-2 rounded-xl bg-slate-950/60 border border-slate-800 ${currentBmiData.colorClass}`}>
                  <Scale className="w-5 h-5" />
                </div>
              </div>

              {/* Slider visual indicador de IMC */}
              <div className="space-y-1.5 pt-1">
                <div className="w-full h-2 rounded-full bg-slate-900 relative border border-slate-800">
                  <div
                    className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-rose-500"
                    style={{ width: '100%', opacity: 0.4 }}
                  />
                  <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-950 shadow-lg -top-0.5 transition-all"
                    style={{ left: `${currentBmiData.sliderPercent}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-slate-400 font-bold">
                  <span>14 (Bajo)</span>
                  <span>18.5 (Saludable)</span>
                  <span>25 (Sobrepeso)</span>
                  <span>30+ (Obesidad)</span>
                </div>
              </div>

              {/* Rango saludable sugerido */}
              <div className="pt-2 border-t border-slate-800/40 text-[11px] text-slate-300 flex items-center justify-between">
                <span className="text-slate-400">Peso saludable estimado:</span>
                <span className="font-bold text-emerald-400">
                  {currentBmiData.minHealthyWeight} - {currentBmiData.maxHealthyWeight} kg
                </span>
              </div>
            </div>
          )}

          {/* 3. FORMULARIO PARA REGISTRAR NUEVA MEDICIÓN (CONTRAÍBLE) */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800/80 transition-all duration-300">
            <div 
              onClick={() => setIsNewMetricOpen(!isNewMetricOpen)}
              className="flex items-center justify-between cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider group-hover:text-white transition-colors">
                    Registrar Nueva Medición
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Bioimpedancia / Báscula</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-emerald-400 group-hover:text-emerald-300 hidden sm:inline">
                  {isNewMetricOpen ? 'Contraer' : '+ Nuevo registro'}
                </span>
                <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-emerald-400 transition-colors">
                  {isNewMetricOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>
            </div>

            {isNewMetricOpen && (
              <div className="space-y-4 pt-4 border-t border-slate-800/60 mt-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* 1. PESO / WEIGHT */}
                  <div className="col-span-2 sm:col-span-1 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Scale className="w-3 h-3" /> 1. Peso (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ej: 75.4"
                      value={weightInput}
                      onChange={e => {
                        const w = e.target.value;
                        setWeightInput(w);
                        if (userHeight > 0 && w && !isNaN(Number(w))) {
                          const calc = (Number(w) / ((userHeight / 100) * (userHeight / 100))).toFixed(1);
                          setBmiInput(calc);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-black text-center"
                    />
                  </div>

                  {/* 2. IMC */}
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-purple-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> 2. IMC / BMI
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ej: 24.2"
                      value={bmiInput}
                      onChange={e => setBmiInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-bold text-center"
                    />
                  </div>

                  {/* 3. % GRASA */}
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Droplets className="w-3 h-3" /> 3. % Grasa
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ej: 15.2"
                      value={fatInput}
                      onChange={e => setFatInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold text-center"
                    />
                  </div>

                  {/* 4. % MÚSCULO ESQUELÉTICO */}
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> 4. % Mús. Esq.
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ej: 42.1"
                      value={muscleInput}
                      onChange={e => setMuscleInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-bold text-center"
                    />
                  </div>

                  {/* 5. METABOLISMO BASAL */}
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Flame className="w-3 h-3" /> 5. Metab. (kcal)
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: 1650"
                      value={bmrInput}
                      onChange={e => setBmrInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 font-bold text-center"
                    />
                  </div>

                  {/* 6. EDAD CORPORAL */}
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 6. Edad Corp.
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: 28"
                      value={bodyAgeInput}
                      onChange={e => setBodyAgeInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold text-center"
                    />
                  </div>

                  {/* 7. GRASA VISCERAL */}
                  <div className="col-span-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <label className="block text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <HeartPulse className="w-3 h-3" /> 7. Grasa Visceral (nivel 1-30)
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: 5"
                      value={visceralFatInput}
                      onChange={e => setVisceralFatInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 font-bold text-center"
                    />
                  </div>
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha de Medición</label>
                  <input
                    type="date"
                    value={metricDate}
                    onChange={e => setMetricDate(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-medium"
                  />
                </div>

                <button
                  onClick={handleSaveMetric}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer text-xs"
                >
                  <Plus className="w-4 h-4" /> Registrar Peso / Mediciones
                </button>
              </div>
            )}
          </div>
        </div>


        {/* ================= COLUMNA DERECHA: ANALÍTICA, GRÁFICOS Y HISTORIAL (8 COLS EN DESKTOP) ================= */}
        <div className="lg:col-span-8 space-y-6">

          {/* 1. CENTRO ANALÍTICO MULTI-MÉTRICA & GRÁFICA EVOLUTIVA */}
          <div className="glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/80 space-y-5">
            {/* Cabecera del Centro Analítico */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2 tracking-tight">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Evolución de Composición Corporal
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selecciona cualquier indicador para examinar su curva de progreso histórico y variaciones.
                </p>
              </div>

              {activeMetricStats && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                    {activeMetricStats.count} mediciones con {activeMetricConfig.shortLabel}
                  </span>
                </div>
              )}
            </div>

            {/* SELECTOR DE INDICADORES (PILLS HORIZONTALES) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {(Object.keys(METRIC_CONFIGS) as MetricKey[]).map(key => {
                const conf = METRIC_CONFIGS[key];
                const IconComponent = conf.icon;
                const isSelected = activeMetric === key;

                return (
                  <button
                    key={key}
                    onClick={() => setActiveMetric(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-800 text-white shadow-md'
                        : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                    style={isSelected ? { borderColor: conf.color, color: conf.color } : {}}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span>{conf.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* TARJETAS RESUMEN DE LA MÉTRICA SELECCIONADA */}
            {activeMetricStats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* 1. Valor Actual */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Último Registro</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-black text-white">{activeMetricStats.current}</span>
                    <span className="text-[10px] font-bold text-slate-400">{activeMetricConfig.unit}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium block mt-0.5">
                    {formatShortDate(activeMetricStats.currentDate)}
                  </span>
                </div>

                {/* 2. Última Variación */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cambio Reciente</span>
                  <div className="mt-1">
                    <DeltaBadge
                      delta={activeMetricStats.deltaRecent}
                      unit={activeMetricConfig.unit}
                      isDesirableLower={activeMetricConfig.isDesirableLower}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium block mt-0.5">vs medición previa</span>
                </div>

                {/* 3. Cambio Total */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cambio Total</span>
                  <div className="mt-1">
                    <DeltaBadge
                      delta={activeMetricStats.deltaTotal}
                      unit={activeMetricConfig.unit}
                      isDesirableLower={activeMetricConfig.isDesirableLower}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium block mt-0.5">desde el inicio</span>
                </div>

                {/* 4. Rango Histórico */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Rango Mín / Máx</span>
                  <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-slate-200">
                    <span className="text-emerald-400">{activeMetricStats.min}</span>
                    <span className="text-slate-600">—</span>
                    <span className="text-amber-400">{activeMetricStats.max}</span>
                    <span className="text-[10px] text-slate-400">{activeMetricConfig.unit}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium block mt-0.5">extremos registrados</span>
                </div>
              </div>
            ) : null}

            {/* GRÁFICO SVG RESPONSIVE PARA DESKTOP & MOBILE */}
            {svgData ? (
              <div className="relative pt-2">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible select-none">
                  <defs>
                    <linearGradient id={`gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeMetricConfig.color} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={activeMetricConfig.color} stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Líneas de cuadrícula horizontal con valores de referencia */}
                  {svgData.gridLines.map((line, idx) => (
                    <g key={idx}>
                      <line
                        x1={paddingLeft}
                        y1={line.y}
                        x2={svgWidth - paddingRight}
                        y2={line.y}
                        stroke="#1e293b"
                        strokeDasharray={idx === svgData.gridLines.length - 1 ? 'none' : '3 3'}
                        strokeWidth={idx === svgData.gridLines.length - 1 ? '1.5' : '1'}
                      />
                      <text
                        x={paddingLeft - 8}
                        y={line.y + 3.5}
                        fill="#64748b"
                        fontSize="9.5"
                        fontWeight="600"
                        textAnchor="end"
                      >
                        {line.val.toFixed(activeMetricConfig.unit === 'kcal' || activeMetricConfig.unit === 'nivel' || activeMetricConfig.unit === 'años' ? 0 : 1)}
                      </text>
                    </g>
                  ))}

                  {/* Área degradada bajo la curva */}
                  <path d={svgData.areaD} fill={`url(#gradient-${activeMetric})`} />

                  {/* Línea principal trazada */}
                  <path
                    d={svgData.pathD}
                    fill="none"
                    stroke={activeMetricConfig.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Puntos y etiquetas interactivas */}
                  {svgData.points.map((p, idx) => {
                    const isLast = idx === svgData.points.length - 1;
                    const isMin = p.val === activeMetricStats?.min;
                    const isMax = p.val === activeMetricStats?.max;
                    const isHovered = hoveredPointId === p.id;
                    const showValueAlways = isLast || isMin || isMax || svgData.points.length <= 6;

                    return (
                      <g
                        key={p.id || idx}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPointId(p.id)}
                        onMouseLeave={() => setHoveredPointId(null)}
                        onClick={() => setHoveredPointId(prev => (prev === p.id ? null : p.id))}
                      >
                        {/* Línea guía vertical al pasar el cursor */}
                        {isHovered && (
                          <line
                            x1={p.x}
                            y1={paddingTop}
                            x2={p.x}
                            y2={paddingTop + plotHeight}
                            stroke={activeMetricConfig.color}
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            opacity="0.6"
                          />
                        )}

                        {/* Círculo de impacto táctil / hover invisible */}
                        <circle cx={p.x} cy={p.y} r="14" fill="transparent" />

                        {/* Círculo visible del punto */}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 6 : isLast ? 5 : 4}
                          fill={isHovered || isLast ? activeMetricConfig.color : '#020617'}
                          stroke={activeMetricConfig.color}
                          strokeWidth={isHovered ? 3 : 2}
                        />

                        {/* Etiqueta de valor sobre el punto */}
                        {(showValueAlways || isHovered) && (
                          <g>
                            <rect
                              x={p.x - 24}
                              y={p.y - 23}
                              width="48"
                              height="17"
                              rx="5"
                              fill="#090d16"
                              stroke={isHovered || isLast ? activeMetricConfig.color : '#334155'}
                              strokeWidth={isHovered || isLast ? '1.5' : '1'}
                            />
                            <text
                              x={p.x}
                              y={p.y - 11}
                              fill={isHovered || isLast ? activeMetricConfig.color : '#f1f5f9'}
                              fontSize="9.5"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {p.val} {activeMetricConfig.unit}
                            </text>
                          </g>
                        )}

                        {/* Etiqueta de fecha en el eje X */}
                        {svgData.dateIndices.has(idx) && (
                          <text
                            x={p.x}
                            y={paddingTop + plotHeight + 20}
                            fill={isHovered ? activeMetricConfig.color : '#94a3b8'}
                            fontSize="9.5"
                            fontWeight={isHovered ? '700' : '500'}
                            textAnchor="middle"
                          >
                            {formatShortDate(p.logged_at)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="py-12 px-4 flex flex-col items-center justify-center bg-slate-900/30 rounded-2xl border border-slate-800/80 border-dashed text-center">
                <activeMetricConfig.icon className="w-10 h-10 text-slate-700 mb-2.5" />
                <h4 className="text-sm font-bold text-slate-300">
                  Sin suficientes registros para {activeMetricConfig.label}
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Registra al menos 2 mediciones con este dato para generar el gráfico de evolución y el análisis de variaciones.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= 2. HISTORIAL DE MEDICIONES OPTIMIZADO (A TODO LO ANCHO EN DESKTOP) ================= */}
      <div className="w-full space-y-4 pt-2">
            {/* Header del Historial con Controles */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  Historial de Mediciones
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Registros completos con comparativas vs medición previa y sincronización.
                </p>
              </div>

              {/* Botonera de visualización (Tabla / Tarjetas) y Orden */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center">
                  <button
                    onClick={() => setHistoryViewMode('table')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      historyViewMode === 'table'
                        ? 'bg-slate-800 text-emerald-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Vista en tabla para análisis detallado"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tabla</span>
                  </button>

                  <button
                    onClick={() => setHistoryViewMode('cards')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      historyViewMode === 'cards'
                        ? 'bg-slate-800 text-emerald-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Vista en tarjetas compactas"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tarjetas</span>
                  </button>
                </div>

                <button
                  onClick={() => setHistorySortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 cursor-pointer"
                  title="Cambiar orden cronológico"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{historySortOrder === 'desc' ? 'Más recientes' : 'Más antiguos'}</span>
                </button>
              </div>
            </div>

            {/* CONTENIDO DEL HISTORIAL */}
            {displayedHistory.length > 0 ? (
              historyViewMode === 'table' ? (
                /* ================= VISTA TABLA (DESKTOP OPTIMIZADA) ================= */
                <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-3.5 whitespace-nowrap">Fecha</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">1. Peso (kg)</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">2. IMC</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">3. % Grasa</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">4. % Mús. Esq.</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">5. Metab. Basal</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">6. Edad Corp.</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">7. Grasa Visc.</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">Estado</th>
                          <th className="py-3 px-3.5 text-right whitespace-nowrap">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {displayedHistory.map(m => (
                          <tr key={m.id} className="hover:bg-slate-900/40 transition-colors">
                            {/* Fecha */}
                            <td className="py-3 px-3.5 whitespace-nowrap font-bold text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-emerald-400 opacity-70" />
                                <span>{formatDate(m.logged_at)}</span>
                              </div>
                            </td>

                            {/* 1. Peso */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-white">{m.weight}</span>
                                <DeltaBadge delta={m.deltas.weight} unit="kg" isDesirableLower={true} />
                              </div>
                            </td>

                            {/* 2. IMC */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.calculatedBmi ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-purple-300">{m.calculatedBmi}</span>
                                  <DeltaBadge delta={m.deltas.bmi} isDesirableLower={true} />
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            {/* 3. % Grasa */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.body_fat > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-amber-300">{m.body_fat}%</span>
                                  <DeltaBadge delta={m.deltas.body_fat} unit="%" isDesirableLower={true} />
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            {/* 4. % Mús. Esq. */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.muscle_mass > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-cyan-300">{m.muscle_mass}%</span>
                                  <DeltaBadge delta={m.deltas.muscle_mass} unit="%" isDesirableLower={false} />
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            {/* 5. Metab. Basal */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.bmr && m.bmr > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-rose-300">{m.bmr} <span className="text-[10px] text-slate-500">kcal</span></span>
                                  <DeltaBadge delta={m.deltas.bmr} unit="kcal" isDesirableLower={false} />
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            {/* 6. Edad Corp. */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.body_age && m.body_age > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-indigo-300">{m.body_age} <span className="text-[10px] text-slate-500">años</span></span>
                                  <DeltaBadge delta={m.deltas.body_age} unit="a" isDesirableLower={true} />
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            {/* 7. Grasa Visceral */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.visceral_fat && m.visceral_fat > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-red-300">{m.visceral_fat}</span>
                                  <DeltaBadge delta={m.deltas.visceral_fat} isDesirableLower={true} />
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            {/* Estado Sync */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {m.synced === 0 ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                                  Pendiente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  Listo
                                </span>
                              )}
                            </td>

                            {/* Acciones */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEditModal(m)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Editar medición"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMetric(m.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Eliminar medición"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ================= VISTA TARJETAS (RESPONSIVE GRID) ================= */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayedHistory.map(m => (
                    <div
                      key={m.id}
                      className="glass-card rounded-2xl p-4 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all shadow-sm"
                    >
                      {/* Cabecera de la Tarjeta */}
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Calendar className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white tracking-wide block">
                              {formatDate(m.logged_at)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {formatShortDate(m.logged_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {m.synced === 0 && (
                            <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                              Pendiente
                            </span>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(m)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Editar medición"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMetric(m.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar medición"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Cuadrícula de 7 Métricas con Micro-Deltas */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {/* 1. Peso */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">1. Peso</span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-xs font-black text-emerald-400">{m.weight}</span>
                            <span className="text-[9px] font-semibold text-emerald-500/80">kg</span>
                          </div>
                          <div className="mt-1">
                            <DeltaBadge delta={m.deltas.weight} unit="kg" isDesirableLower={true} />
                          </div>
                        </div>

                        {/* 2. IMC */}
                        {m.calculatedBmi ? (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">2. IMC</span>
                            <span className="text-xs font-black text-purple-300 block mt-0.5">
                              {m.calculatedBmi}
                            </span>
                            <div className="mt-1">
                              <DeltaBadge delta={m.deltas.bmi} isDesirableLower={true} />
                            </div>
                          </div>
                        ) : null}

                        {/* 3. % Grasa */}
                        {m.body_fat > 0 ? (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">3. % Grasa</span>
                            <span className="text-xs font-black text-amber-300 block mt-0.5">
                              {m.body_fat} <span className="text-[9px] font-semibold text-amber-500/80">%</span>
                            </span>
                            <div className="mt-1">
                              <DeltaBadge delta={m.deltas.body_fat} unit="%" isDesirableLower={true} />
                            </div>
                          </div>
                        ) : null}

                        {/* 4. % Mús. Esq. */}
                        {m.muscle_mass > 0 ? (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">4. % Mús.</span>
                            <span className="text-xs font-black text-cyan-300 block mt-0.5">
                              {m.muscle_mass} <span className="text-[9px] font-semibold text-cyan-500/80">%</span>
                            </span>
                            <div className="mt-1">
                              <DeltaBadge delta={m.deltas.muscle_mass} unit="%" isDesirableLower={false} />
                            </div>
                          </div>
                        ) : null}

                        {/* 5. Metab. Basal */}
                        {m.bmr && m.bmr > 0 ? (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">5. Basal</span>
                            <span className="text-xs font-black text-rose-300 block mt-0.5">
                              {m.bmr} <span className="text-[9px] font-semibold text-rose-500/80">kcal</span>
                            </span>
                            <div className="mt-1">
                              <DeltaBadge delta={m.deltas.bmr} unit="kcal" isDesirableLower={false} />
                            </div>
                          </div>
                        ) : null}

                        {/* 6. Edad Corp. */}
                        {m.body_age && m.body_age > 0 ? (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">6. Edad Corp.</span>
                            <span className="text-xs font-black text-indigo-300 block mt-0.5">
                              {m.body_age} <span className="text-[9px] font-semibold text-indigo-500/80">a</span>
                            </span>
                            <div className="mt-1">
                              <DeltaBadge delta={m.deltas.body_age} unit="a" isDesirableLower={true} />
                            </div>
                          </div>
                        ) : null}

                        {/* 7. Grasa Visceral */}
                        {m.visceral_fat && m.visceral_fat > 0 ? (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">7. Grasa Visc.</span>
                            <span className="text-xs font-black text-red-300 block mt-0.5">
                              {m.visceral_fat}
                            </span>
                            <div className="mt-1">
                              <DeltaBadge delta={m.deltas.visceral_fat} isDesirableLower={true} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="glass-card rounded-2xl p-8 border border-slate-800 text-center">
                <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Aún no hay mediciones registradas.</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Usa el formulario lateral para registrar tu primer peso y métricas.</p>
              </div>
            )}
          </div>

      {/* MODAL DE EDICIÓN DE MEDICIÓN */}
      {editingMetric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Editar Medición</h3>
                  <p className="text-[10px] text-slate-400">Corrige cualquier valor erróneo o fecha</p>
                </div>
              </div>
              <button
                onClick={() => setEditingMetric(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs del Modal */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Fecha de la Medición
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 text-center"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                  1. Peso (kg) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editWeight}
                  onChange={e => setEditWeight(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">
                  2. IMC
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editBmi}
                  onChange={e => setEditBmi(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                  3. % Grasa
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editFat}
                  onChange={e => setEditFat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                  4. % Mús. Esq.
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editMuscle}
                  onChange={e => setEditMuscle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">
                  5. Metab. Basal (kcal)
                </label>
                <input
                  type="number"
                  value={editBmr}
                  onChange={e => setEditBmr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">
                  6. Edad Corp. (años)
                </label>
                <input
                  type="number"
                  value={editBodyAge}
                  onChange={e => setEditBodyAge(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 text-center font-bold"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">
                  7. Grasa Visceral (nivel)
                </label>
                <input
                  type="number"
                  value={editVisceralFat}
                  onChange={e => setEditVisceralFat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 text-center font-bold"
                />
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="flex gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingMetric(null)}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10"
              >
                <Save className="w-3.5 h-3.5" /> Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProgressView;
