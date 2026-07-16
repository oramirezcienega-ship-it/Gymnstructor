import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import type { LocalRoutine, LocalExercise, LocalWorkoutLog } from './db/db';
import { useSync } from './hooks/useSync';
import { supabase } from './supabaseClient';
import {
  Dumbbell,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  ChevronUp,
  ChevronDown,
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
  AlertCircle,
  Lock,
  Scale,
  User
} from 'lucide-react';

const getExerciseImage = (name: string): string | null => {
  const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar acentos
  if (norm.includes('banca') || norm.includes('bench press') || norm.includes('smith')) {
    return '/exercises/press_banca.png';
  }
  if (norm.includes('sentadilla') || norm.includes('squat')) {
    return '/exercises/sentadilla.png';
  }
  return null;
};

function App() {
  // Estados para Autenticación
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot_password'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Estados nuevos para Perfil y Recuperación de Contraseña
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState<string>('');
  const [isRecoveringPassword, setIsRecoveringPassword] = useState<boolean>(false);
  const [passwordResetEmailSent, setPasswordResetEmailSent] = useState<boolean>(false);
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<boolean>(false);

  // Inputs del perfil de usuario en el modal
  const [profileNameInput, setProfileNameInput] = useState<string>('');
  const [profileBirthDateInput, setProfileBirthDateInput] = useState<string>('');

  // Función para calcular la edad dinámicamente
  const calculateAge = (birthDateStr: string): number | null => {
    if (!birthDateStr) return null;
    const birthDate = new Date(birthDateStr);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const currentUserId = user?.id || '';

  const { isOnline, isSyncing, pendingCount, syncError, triggerSync } = useSync(
    currentUserId || null,
    user?.email || null,
    user?.user_metadata?.name || null
  );
  const [view, setView] = useState<'dashboard' | 'edit_routine' | 'workout' | 'history' | 'progress'>('dashboard');

  // Reactividad local mediante Dexie
  const routines = useLiveQuery(
    () => {
      if (!currentUserId) return [];
      return db.routines.where('user_id').equals(currentUserId).and(r => r.deleted === 0).toArray();
    },
    [currentUserId]
  );
  const exercises = useLiveQuery(() => db.exercises.where('deleted').equals(0).toArray());
  const workoutLogs = useLiveQuery(() => db.workout_logs.where('deleted').equals(0).sortBy('logged_at'));
  const profile = useLiveQuery(
    () => {
      if (!currentUserId) return undefined;
      return db.profiles.get(currentUserId);
    },
    [currentUserId]
  );
  const bodyMetrics = useLiveQuery(
    () => {
      if (!currentUserId) return [];
      return db.body_metrics.where('user_id').equals(currentUserId).and(m => m.deleted === 0).toArray();
    },
    [currentUserId]
  );

  const userRoutines = routines || [];
  const userRoutineIds = userRoutines.map(r => r.id);
  const userExercises = exercises?.filter(ex => userRoutineIds.includes(ex.routine_id)) || [];
  const userExerciseIds = userExercises.map(ex => ex.id);
  const userWorkoutLogs = workoutLogs?.filter(log => userExerciseIds.includes(log.exercise_id)) || [];

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

  // Estado para expandir la imagen del ejercicio
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);

  // Estados para el registro de indicadores físicos en "Mi Progreso"
  const [weightInput, setWeightInput] = useState<string>('');
  const [fatInput, setFatInput] = useState<string>('');
  const [muscleInput, setMuscleInput] = useState<string>('');
  const [metricDate, setMetricDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  
  // Inputs del perfil físico
  const [userHeight, setUserHeight] = useState<number>(0);
  const [userGender, setUserGender] = useState<string>('');
  const [userBirthDate, setUserBirthDate] = useState<string>('');

  // Estado para expandir/colapsar plantillas de ejercicios en el Dashboard
  const [isTemplatesExpanded, setIsTemplatesExpanded] = useState<boolean>(false);

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

  // Estado local para los ejercicios en curso (permite reordenar dinámicamente)
  const [workoutExercises, setWorkoutExercises] = useState<LocalExercise[]>([]);

  // Compresión y conversión de imágenes para almacenamiento local ligero y sincronización
  const compressAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 450;
          const MAX_HEIGHT = 450;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Comprimir al 70% de calidad en JPEG para reducir huella en BD (IndexedDB y Supabase)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Función para reordenar dinámicamente el orden de los ejercicios en el entrenamiento activo
  const handleMoveExercise = (exerciseId: string, direction: 'up' | 'down') => {
    const index = workoutExercises.findIndex(ex => ex.id === exerciseId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= workoutExercises.length) return;

    const copy = [...workoutExercises];
    // Intercambiar
    const temp = copy[index];
    copy[index] = copy[newIndex];
    copy[newIndex] = temp;

    setWorkoutExercises(copy);
  };

  // Prefilar valores de altura, sexo y fecha de nacimiento en el estado al cargar el perfil
  useEffect(() => {
    if (profile) {
      setUserHeight(profile.height || 0);
      setUserGender(profile.gender || '');
      setUserBirthDate(profile.birth_date || '');
    }
  }, [profile]);

  // Inicializar inputs del modal de perfil cuando se abre
  useEffect(() => {
    if (showProfileModal && profile) {
      setProfileNameInput(profile.name || '');
      setProfileBirthDateInput(profile.birth_date || '');
      // Reiniciar estados del formulario de cambio de contraseña
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setPasswordChangeError(null);
      setPasswordChangeSuccess(false);
    }
  }, [showProfileModal, profile]);

  // Escuchar estado de autenticación de Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const session = data?.session;
      setUser(session?.user ?? null);
      setIsAuthenticated(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      setUser(session?.user ?? null);
      setIsAuthenticated(!!session);
      
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const getErrorMessage = (err: any): string => {
    if (!err) return 'Error desconocido';
    if (typeof err === 'string') return err;
    if (err.message && typeof err.message === 'string') {
      if (err.message === '{}' || err.message.trim() === '') {
        return 'Error de conexión o de credenciales (Servidor Supabase no responde o clave inválida).';
      }
      return err.message;
    }
    if (err.error_description && typeof err.error_description === 'string') return err.error_description;
    return JSON.stringify(err);
  };

  const handleSignIn = async () => {
    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError('Introduce tu correo y contraseña.');
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput,
        password: passwordInput
      });
      if (error) throw error;
      
      if (data.user) {
        // Buscar el perfil en el servidor
        const { data: serverProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        const now = new Date().toISOString();
        const profileName = serverProfile?.name || data.user.user_metadata?.name || '';
        
        // Guardar/Actualizar localmente en IndexedDB
        await db.profiles.put({
          id: data.user.id,
          email: data.user.email || '',
          name: profileName,
          height: serverProfile?.height || 0.0,
          gender: serverProfile?.gender || '',
          birth_date: serverProfile?.birth_date || '',
          created_at: serverProfile?.created_at || now,
          updated_at: serverProfile?.updated_at || now,
          synced: 1
        });

        // Limpiar inputs
        setEmailInput('');
        setPasswordInput('');
        setNameInput('');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!nameInput.trim() || !emailInput.trim() || !passwordInput.trim()) {
      setAuthError('Por favor completa todos los campos.');
      return;
    }
    if (passwordInput.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailInput,
        password: passwordInput,
        options: {
          data: {
            name: nameInput
          }
        }
      });
      if (error) throw error;
      
      if (data.user) {
        const now = new Date().toISOString();
        // Guardar perfil en Supabase
        const { error: dbError } = await supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email,
          name: nameInput,
          height: 0.0,
          gender: '',
          birth_date: '',
          created_at: now,
          updated_at: now
        });
        if (dbError) throw dbError;

        // Guardar perfil local en IndexedDB
        await db.profiles.put({
          id: data.user.id,
          email: data.user.email || '',
          name: nameInput,
          height: 0.0,
          gender: '',
          birth_date: '',
          created_at: now,
          updated_at: now,
          synced: 1
        });

        alert('Registro exitoso. ¡Bienvenido!');
        setEmailInput('');
        setPasswordInput('');
        setNameInput('');
        setAuthMode('login');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!confirm('¿Seguro que deseas cerrar la sesión?')) return;
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
      setView('dashboard');
      setShowProfileModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!emailInput.trim()) {
      setAuthError('Por favor introduce tu correo electrónico.');
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    setPasswordResetEmailSent(false);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailInput.trim(), {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setPasswordResetEmailSent(true);
    } catch (err: any) {
      console.error(err);
      setAuthError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (isRecoveryFlow: boolean) => {
    if (!newPasswordInput || !confirmNewPasswordInput) {
      const errMsg = 'Introduce y confirma tu nueva contraseña.';
      if (isRecoveryFlow) setAuthError(errMsg);
      else setPasswordChangeError(errMsg);
      return;
    }
    if (newPasswordInput.length < 6) {
      const errMsg = 'La contraseña debe tener al menos 6 caracteres.';
      if (isRecoveryFlow) setAuthError(errMsg);
      else setPasswordChangeError(errMsg);
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      const errMsg = 'Las contraseñas no coinciden.';
      if (isRecoveryFlow) setAuthError(errMsg);
      else setPasswordChangeError(errMsg);
      return;
    }

    if (isRecoveryFlow) setAuthError(null);
    else setPasswordChangeError(null);

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPasswordInput
      });
      if (error) throw error;
      
      if (isRecoveryFlow) {
        alert('Contraseña restablecida con éxito. Ya puedes iniciar sesión con tu nueva contraseña.');
        setIsRecoveringPassword(false);
        setAuthMode('login');
        setEmailInput('');
      } else {
        setPasswordChangeSuccess(true);
      }
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
    } catch (err: any) {
      console.error(err);
      const errMsg = getErrorMessage(err);
      if (isRecoveryFlow) setAuthError(errMsg);
      else setPasswordChangeError(errMsg);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveUserProfile = async () => {
    if (!currentUserId) return;
    setIsSavingProfile(true);
    const now = new Date().toISOString();
    try {
      await db.profiles.update(currentUserId, {
        name: profileNameInput.trim(),
        birth_date: profileBirthDateInput,
        updated_at: now,
        synced: 0
      });
      alert('Perfil actualizado con éxito.');
      setShowProfileModal(false);
    } catch (err) {
      console.error(err);
      alert('Error al guardar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
    if (isOnline) triggerSync();
  };

  // Guardar datos físicos generales del usuario
  const handleSavePhysicalProfile = async () => {
    if (!currentUserId) return;
    setIsSavingProfile(true);
    const now = new Date().toISOString();
    try {
      await db.profiles.update(currentUserId, {
        height: Number(userHeight) || 0,
        gender: userGender,
        birth_date: userBirthDate,
        updated_at: now,
        synced: 0
      });
      alert('Perfil físico actualizado correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error al guardar datos físicos.');
    } finally {
      setIsSavingProfile(false);
    }
    if (isOnline) triggerSync();
  };

  // Registrar una nueva medición histórica de peso / grasa / músculo
  const handleSaveBodyMetric = async () => {
    if (!currentUserId) return;
    if (!weightInput || isNaN(Number(weightInput)) || Number(weightInput) <= 0) {
      alert('Introduce un valor de peso válido (en kg).');
      return;
    }
    
    const now = new Date().toISOString();
    const metricId = generateUUID();
    
    try {
      await db.body_metrics.add({
        id: metricId,
        user_id: currentUserId,
        weight: Number(weightInput),
        body_fat: Number(fatInput) || 0,
        muscle_mass: Number(muscleInput) || 0,
        logged_at: new Date(metricDate).toISOString(),
        deleted: 0,
        created_at: now,
        updated_at: now,
        synced: 0
      });
      
      setWeightInput('');
      setFatInput('');
      setMuscleInput('');
      alert('Medición registrada con éxito.');
    } catch (err) {
      console.error(err);
      alert('Error al registrar la medición.');
    }
    
    if (isOnline) triggerSync();
  };

  // Eliminar medición histórica
  const handleDeleteBodyMetric = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta medición?')) return;
    const now = new Date().toISOString();
    try {
      await db.body_metrics.update(id, {
        deleted: 1,
        synced: 0,
        updated_at: now
      });
    } catch (err) {
      console.error(err);
    }
    if (isOnline) triggerSync();
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
        { name: 'Press de Banca Plano', muscle_group: 'Pecho', series: 4, reps: 10, weight: 135 },
        { name: 'Press Militar con Barra', muscle_group: 'Hombros', series: 3, reps: 8, weight: 75 },
        { name: 'Fondos de Tríceps', muscle_group: 'Tríceps', series: 3, reps: 12, weight: 0 },
        { name: 'Aperturas con Mancuernas', muscle_group: 'Pecho', series: 3, reps: 12, weight: 30 }
      ];
    } else if (type === 'Pull') {
      name = 'Rutina de Tirón (Pull)';
      description = 'Enfoque en espalda, bíceps y deltoides posterior.';
      exercisesTemplate = [
        { name: 'Dominadas (o Polea Alta)', muscle_group: 'Espalda', series: 4, reps: 8, weight: 0 },
        { name: 'Remo con Barra', muscle_group: 'Espalda', series: 3, reps: 10, weight: 115 },
        { name: 'Curl de Bíceps con Barra', muscle_group: 'Bíceps', series: 3, reps: 10, weight: 55 },
        { name: 'Pájaros con Mancuerna', muscle_group: 'Hombros', series: 3, reps: 15, weight: 15 }
      ];
    } else if (type === 'Legs') {
      name = 'Rutina de Piernas (Legs)';
      description = 'Enfoque en cuádriceps, femorales y pantorrillas.';
      exercisesTemplate = [
        { name: 'Sentadilla Trasera con Barra', muscle_group: 'Piernas', series: 4, reps: 8, weight: 175 },
        { name: 'Peso Muerto Rumano', muscle_group: 'Piernas', series: 3, reps: 10, weight: 155 },
        { name: 'Prensa de Piernas', muscle_group: 'Piernas', series: 3, reps: 12, weight: 265 },
        { name: 'Elevación de Pantorrillas', muscle_group: 'Pantorrillas', series: 4, reps: 15, weight: 90 }
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
        { name: 'Sentadillas', muscle_group: 'Piernas', series: 3, reps: 10, weight: 135 },
        { name: 'Press de Banca', muscle_group: 'Pecho', series: 3, reps: 10, weight: 115 },
        { name: 'Remo con Mancuerna', muscle_group: 'Espalda', series: 3, reps: 10, weight: 45 },
        { name: 'Plancha Abdominal', muscle_group: 'Abdomen', series: 3, reps: 60, weight: 0 }
      ];
    }

    // Insertar en IndexedDB
    await db.routines.add({
      id: routineId,
      user_id: currentUserId,
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
      user_id: currentUserId,
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
        synced: 0,
        image_data: ex.image_data
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
  const handleStartWorkout = async (routine: LocalRoutine) => {
    setWorkoutRoutine(routine);
    const rExercises = exercises?.filter(ex => ex.routine_id === routine.id && ex.deleted === 0) || [];
    
    // Inicializar la estructura del registro de series
    const initialSession: typeof workoutSessionLogs = {};
    
    for (const ex of rExercises) {
      // Buscar el último log de este ejercicio en IndexedDB
      const logs = await db.workout_logs
        .where('exercise_id')
        .equals(ex.id)
        .toArray();
      
      const activeLogs = logs.filter(l => l.deleted === 0);
      
      let defaultWeight = ex.weight;
      let defaultReps = ex.reps;
      
      if (activeLogs.length > 0) {
        // Ordenar por fecha descendente (más reciente primero)
        activeLogs.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
        defaultWeight = activeLogs[0].weight_lifted;
        defaultReps = activeLogs[0].reps_done;
      }

      initialSession[ex.id] = Array.from({ length: ex.series }).map(() => ({
        seriesIndex: 0,
        weight: defaultWeight,
        reps: defaultReps,
        completed: false
      }));
    }
    
    setWorkoutSessionLogs(initialSession);
    setWorkoutExercises(rExercises);
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

  if (isRecoveringPassword) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 selection:bg-emerald-500/30 font-sans">
        <div className="w-full max-w-sm glass-card rounded-3xl border border-slate-900 p-6 space-y-6 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center space-y-4 transition-all">
              <div className="w-20 h-20 rounded-full border border-emerald-500/20 flex items-center justify-center relative animate-pulse">
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                <Dumbbell className="w-10 h-10 text-emerald-400 animate-bounce" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white tracking-wide animate-pulse">Procesando...</p>
              </div>
            </div>
          )}

          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/5">
              <Dumbbell className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Gym Instructor</h1>
            <p className="text-xs text-slate-400">Restablecer tu contraseña</p>
          </div>

          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm font-bold text-white">Elige tu nueva contraseña</p>
              <p className="text-[10px] text-slate-400 mt-1">Escribe tu nueva contraseña de al menos 6 caracteres</p>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                placeholder="Nueva contraseña"
                value={newPasswordInput}
                onChange={e => setNewPasswordInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
              <input
                type="password"
                placeholder="Confirmar nueva contraseña"
                value={confirmNewPasswordInput}
                onChange={e => setConfirmNewPasswordInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {authError && <p className="text-[11px] text-rose-400 text-center font-medium leading-tight">{authError}</p>}

            <button
              onClick={() => handleUpdatePassword(true)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer text-xs"
            >
              Restablecer Contraseña
            </button>

            <div className="text-center pt-2">
              <button
                onClick={() => {
                  setIsRecoveringPassword(false);
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className="text-xs text-slate-400 hover:underline cursor-pointer"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 selection:bg-emerald-500/30 font-sans">
        <div className="w-full max-w-sm glass-card rounded-3xl border border-slate-900 p-6 space-y-6 relative overflow-hidden">
          
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center space-y-4 transition-all">
              <div className="w-20 h-20 rounded-full border border-emerald-500/20 flex items-center justify-center relative animate-pulse">
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                <Dumbbell className="w-10 h-10 text-emerald-400 animate-bounce" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white tracking-wide animate-pulse">Cargando...</p>
              </div>
            </div>
          )}

          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/5">
              <Dumbbell className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Gym Instructor</h1>
            <p className="text-xs text-slate-400">Tu compañero offline-first de gimnasio</p>
          </div>

          {authMode === 'login' ? (
            // PANTALLA DE INICIAR SESIÓN
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-bold text-white">Inicia sesión en tu cuenta</p>
                <p className="text-[10px] text-slate-400 mt-1">Introduce tus credenciales para sincronizar tus rutinas</p>
              </div>

              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {authError && <p className="text-[11px] text-rose-400 text-center font-medium leading-tight">{authError}</p>}

              <button
                onClick={handleSignIn}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer text-xs"
              >
                <Lock className="w-4 h-4" /> Iniciar Sesión
              </button>

              <div className="text-center pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError(null);
                  }}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  ¿No tienes una cuenta? Regístrate
                </button>
                <button
                  onClick={() => {
                    setAuthMode('forgot_password');
                    setAuthError(null);
                    setPasswordResetEmailSent(false);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-350 hover:underline cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>
          ) : authMode === 'forgot_password' ? (
            // PANTALLA DE OLVIDÉ MI CONTRASEÑA
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-bold text-white">Recuperar Contraseña</p>
                <p className="text-[10px] text-slate-400 mt-1">Te enviaremos un enlace a tu correo para restablecerla</p>
              </div>

              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {passwordResetEmailSent && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-center text-emerald-400 text-[11px] font-medium leading-tight">
                  ¡Enlace enviado! Revisa la bandeja de entrada de tu correo electrónico.
                </div>
              )}

              {authError && <p className="text-[11px] text-rose-450 text-center font-medium leading-tight">{authError}</p>}

              <button
                onClick={handleForgotPassword}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer text-xs"
              >
                Enviar enlace de recuperación
              </button>

              <div className="text-center pt-2">
                <button
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  Volver a Iniciar Sesión
                </button>
              </div>
            </div>
          ) : (
            // PANTALLA DE REGISTRO
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-bold text-white">Crea tu cuenta de Atleta</p>
                <p className="text-[10px] text-slate-400 mt-1">Regístrate para mantener tu historial a salvo en la nube</p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Tu Nombre"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {authError && <p className="text-[11px] text-rose-450 text-center font-medium leading-tight">{authError}</p>}

              <button
                onClick={handleSignUp}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer text-xs"
              >
                <User className="w-4 h-4" /> Registrarse
              </button>

              <div className="text-center pt-2">
                <button
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  ¿Ya tienes cuenta? Inicia Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-16 bg-slate-950">
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

          {/* Avatar estilo Netflix */}
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-600 to-emerald-400 text-slate-950 hover:scale-105 transition-all shadow-md shadow-emerald-500/10 cursor-pointer overflow-hidden relative group border border-emerald-500/20"
            title="Ver Perfil"
          >
            {/* Ojos y sonrisa estilo Netflix */}
            <svg viewBox="0 0 32 32" className="w-6 h-6 fill-slate-950 opacity-90">
              <circle cx="10" cy="11" r="2.5" />
              <circle cx="22" cy="11" r="2.5" />
              <path d="M 6 18 C 6 18, 9 24, 16 24 C 23 24, 26 18, 26 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </svg>
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
                <Sparkles className="w-5 h-5 text-emerald-400" /> ¡Hola, {profile?.name || 'Atleta'}!
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
              <button
                onClick={() => setIsTemplatesExpanded(!isTemplatesExpanded)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-450 uppercase tracking-widest px-1 py-1 hover:text-white transition-colors cursor-pointer"
              >
                <span>Generador de Plantillas</span>
                {isTemplatesExpanded ? <ChevronUp className="w-4 h-4 text-slate-450" /> : <ChevronDown className="w-4 h-4 text-slate-450" />}
              </button>
              
              {isTemplatesExpanded && (
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
              )}
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
                        
                        {/* Subir/Ver Imagen de Referencia */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {ex.image_data ? (
                            <div className="relative w-8 h-8 rounded-lg border border-slate-850 overflow-hidden group" title="Haz clic en la X para eliminar">
                              <img src={ex.image_data} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleExerciseChange(index, 'image_data', undefined)}
                                className="absolute inset-0 bg-rose-950/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="w-8 h-8 rounded-lg border border-dashed border-slate-800 hover:border-emerald-500/50 flex items-center justify-center cursor-pointer text-slate-500 hover:text-emerald-400 transition-all" title="Subir imagen de referencia">
                              <Plus className="w-3.5 h-3.5" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    try {
                                      const base64 = await compressAndConvertToBase64(file);
                                      handleExerciseChange(index, 'image_data', base64);
                                    } catch (err) {
                                      console.error("Error al cargar imagen", err);
                                      alert("Error al procesar la imagen");
                                    }
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>

                        <button
                          onClick={() => handleRemoveExerciseRow(index)}
                          className="p-2 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
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
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Peso (lb)</label>
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
              {workoutExercises.map((ex, idx) => {
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
                          {/* Sugerencia de la última sesión */}
                          {series.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">
                              Sugerido (último): <span className="text-emerald-400 font-semibold">{series[0].weight} lb</span> × <span className="text-emerald-400 font-semibold">{series[0].reps} reps</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Botones de Reordenamiento */}
                          <div className="flex items-center gap-1 mr-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveExercise(ex.id, 'up')}
                              className="p-1 rounded-lg bg-slate-950 border border-slate-900 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors cursor-pointer"
                              title="Subir orden"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === workoutExercises.length - 1}
                              onClick={() => handleMoveExercise(ex.id, 'down')}
                              className="p-1 rounded-lg bg-slate-950 border border-slate-900 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors cursor-pointer"
                              title="Bajar orden"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {allCompleted && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          )}
                        </div>
                      </div>

                      {/* Imagen o Ilustración de Referencia */}
                      {(() => {
                        const imgUrl = ex.image_data || getExerciseImage(ex.name);
                        const isExpanded = expandedExerciseId === ex.id;
                        return imgUrl ? (
                          <div 
                            onClick={() => setExpandedExerciseId(isExpanded ? null : ex.id)}
                            className={`w-full overflow-hidden bg-slate-950 relative border-b border-slate-900/40 flex items-center justify-center cursor-pointer transition-all duration-300 ${isExpanded ? 'h-72' : 'h-32'}`}
                          >
                            <img 
                              src={imgUrl} 
                              alt={ex.name} 
                              className={`w-full h-full opacity-80 transition-all duration-300 ${isExpanded ? 'object-contain' : 'object-cover'}`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent pointer-events-none"></div>
                            
                            {/* Indicador visual de zoom */}
                            <div className="absolute top-2 right-2 bg-slate-950/80 px-2 py-0.5 rounded-md text-[8px] font-bold text-slate-400 border border-slate-900 pointer-events-none tracking-wider uppercase">
                              {isExpanded ? 'Ver menos' : 'Ampliar'}
                            </div>
                          </div>
                        ) : (
                          // Placeholder estilizado con mancuerna
                          <div className="w-full h-16 bg-slate-950/40 border-b border-slate-900/40 flex items-center gap-3 px-4 py-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                              <Dumbbell className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Ilustración Genérica</p>
                              <p className="text-xs text-slate-300">Mantén buena técnica y rango completo</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Lista de series */}
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-12 text-[10px] font-bold text-slate-500 uppercase px-2 mb-1">
                          <span className="col-span-2">Serie</span>
                          <span className="col-span-4 text-center">Peso (lb)</span>
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

            {userWorkoutLogs && userWorkoutLogs.length > 0 ? (
              <div className="space-y-4">
                {/* Agrupar logs por día */}
                {Array.from(new Set(userWorkoutLogs.map(log => new Date(log.logged_at).toLocaleDateString()))).reverse().map(dateString => {
                  const dateLogs = userWorkoutLogs.filter(log => new Date(log.logged_at).toLocaleDateString() === dateString);
                  
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
                                  {log.weight_lifted} lb
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

        {/* 5. MI PROGRESO VIEW */}
        {view === 'progress' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Mi Progreso Físico
              </h2>
              {/* Botón Cerrar Sesión */}
              <button
                onClick={handleSignOut}
                className="text-[10px] text-slate-400 hover:text-rose-400 font-medium bg-slate-900 border border-slate-800 hover:border-rose-500/20 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
              >
                Cerrar Sesión
              </button>
            </div>

            {/* Ficha General de Perfil Físico */}
            <div className="glass-card rounded-2xl p-4 border border-slate-900 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-400" /> Datos Generales
              </h3>
              
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Altura (cm)</label>
                  <input
                    type="number"
                    value={userHeight || ''}
                    onChange={e => setUserHeight(Number(e.target.value) || 0)}
                    placeholder="Ej: 175"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sexo Biológico</label>
                  <select
                    value={userGender}
                    onChange={e => setUserGender(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="">Selecciona</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nacimiento</label>
                  <input
                    type="date"
                    value={userBirthDate}
                    onChange={e => setUserBirthDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                </div>
              </div>

              <button
                onClick={handleSavePhysicalProfile}
                disabled={isSavingProfile}
                className="w-full bg-slate-900 hover:bg-slate-855 text-slate-200 border border-slate-800 hover:border-emerald-500/30 text-xs font-bold py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" /> Guardar Datos Físicos
              </button>
            </div>

            {/* Cálculo y Diagnóstico de IMC */}
            {(() => {
              const latestMetric = bodyMetrics && bodyMetrics.filter(m => m.deleted === 0).pop();
              if (!latestMetric || !userHeight || userHeight <= 0) return null;
              
              const heightMeters = userHeight / 100;
              const weightKg = latestMetric.weight * 0.45359237;
              const bmi = weightKg / (heightMeters * heightMeters);
              
              let classification = '';
              let bmiColor = '';
              let bmiBg = '';
              let bmiPercentage = 0; // Para el slider visual (de 15 a 35 de IMC)

              if (bmi < 18.5) {
                classification = 'Bajo Peso';
                bmiColor = 'text-blue-400';
                bmiBg = 'bg-blue-500/10 border-blue-500/20';
                bmiPercentage = Math.max(0, Math.min(100, ((bmi - 15) / 20) * 100));
              } else if (bmi >= 18.5 && bmi < 25) {
                classification = 'Rango Saludable';
                bmiColor = 'text-emerald-400';
                bmiBg = 'bg-emerald-500/10 border-emerald-500/20';
                bmiPercentage = Math.max(0, Math.min(100, ((bmi - 15) / 20) * 100));
              } else if (bmi >= 25 && bmi < 30) {
                classification = 'Sobrepeso';
                bmiColor = 'text-amber-400';
                bmiBg = 'bg-amber-500/10 border-amber-500/20';
                bmiPercentage = Math.max(0, Math.min(100, ((bmi - 15) / 20) * 100));
              } else {
                classification = 'Obesidad';
                bmiColor = 'text-rose-400';
                bmiBg = 'bg-rose-500/10 border-rose-500/20';
                bmiPercentage = Math.max(0, Math.min(100, ((bmi - 15) / 20) * 100));
              }

              return (
                <div className={`glass-card rounded-2xl p-4 border ${bmiBg} space-y-3`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cálculo de IMC</p>
                      <h4 className={`text-base font-black ${bmiColor} mt-0.5`}>
                        {bmi.toFixed(1)} — {classification}
                      </h4>
                    </div>
                    <Scale className={`w-7 h-7 ${bmiColor} opacity-80`} />
                  </div>
                  
                  {/* Slider visual indicador de IMC */}
                  <div className="space-y-1">
                    <div className="w-full h-2 rounded-full bg-slate-900 relative border border-slate-800">
                      <div 
                        className={`absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-rose-500`}
                        style={{ width: '100%', opacity: 0.3 }}
                      ></div>
                      <div 
                        className={`absolute w-3 h-3 rounded-full bg-white border-2 border-slate-950 shadow-md -top-0.5 transition-all`}
                        style={{ left: `${bmiPercentage}%`, transform: 'translateX(-50%)' }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[8px] text-slate-500 font-bold">
                      <span>15 (Bajo)</span>
                      <span>22 (Normal)</span>
                      <span>28 (Sobrepeso)</span>
                      <span>35 (Obeso)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Formulario para registrar una nueva medición */}
            <div className="glass-card rounded-2xl p-4 border border-slate-900 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Nueva Medición</h3>
              
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Peso (lb)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej: 75.4"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">% Grasa (Opc.)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej: 15.2"
                    value={fatInput}
                    onChange={e => setFatInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">% Músculo (Opc.)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej: 42.1"
                    value={muscleInput}
                    onChange={e => setMuscleInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Medición</label>
                <input
                  type="date"
                  value={metricDate}
                  onChange={e => setMetricDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
                />
              </div>

              <button
                onClick={handleSaveBodyMetric}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-955 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer text-xs"
              >
                <Plus className="w-4 h-4" /> Registrar Peso / Mediciones
              </button>
            </div>

            {/* Gráfico evolutivo en SVG */}
            {(() => {
              const activeMetrics = bodyMetrics && bodyMetrics.filter(m => m.deleted === 0);
              if (!activeMetrics || activeMetrics.length < 2) {
                return (
                  <div className="h-44 flex flex-col items-center justify-center bg-slate-900/20 rounded-2xl border border-slate-900 border-dashed p-4 text-center">
                    <TrendingUp className="w-8 h-8 text-slate-700 mb-2" />
                    <p className="text-xs text-slate-400 font-semibold">Gráfica de Evolución</p>
                    <p className="text-[10px] text-slate-500 mt-1">Registra al menos 2 mediciones en días diferentes para ver tu evolución gráfica de peso.</p>
                  </div>
                );
              }
              
              const padding = 30;
              const chartWidth = 350;
              const chartHeight = 150;
              
              const weights = activeMetrics.map(m => m.weight);
              const minWeight = Math.min(...weights) - 2;
              const maxWeight = Math.max(...weights) + 2;
              const weightRange = maxWeight - minWeight || 1;
              
              const points = activeMetrics.map((m, idx) => {
                const x = padding + (idx / (activeMetrics.length - 1)) * (chartWidth - padding * 2);
                const y = chartHeight - padding - ((m.weight - minWeight) / weightRange) * (chartHeight - padding * 2);
                return { x, y, ...m };
              });
              
              const pathD = `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
              
              return (
                <div className="glass-card p-4 rounded-2xl border border-slate-900 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Evolución de Peso</h4>
                  <div className="relative">
                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
                      {/* Grid Lines */}
                      <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="#1e293b" strokeDasharray="3" />
                      <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#1e293b" strokeDasharray="3" />
                      
                      {/* Line */}
                      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      
                      {/* Points */}
                      {points.map((p, idx) => (
                        <g key={p.id}>
                          <circle cx={p.x} cy={p.y} r="3" fill="#020617" stroke="#10b981" strokeWidth="2" />
                          {/* Tooltip on last weight */}
                          {idx === points.length - 1 && (
                            <text x={p.x} y={p.y - 8} fill="#10b981" fontSize="8" fontWeight="bold" textAnchor="middle">
                              {p.weight} lb
                            </text>
                          )}
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
              );
            })()}

            {/* Listado Histórico de Mediciones */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Historial de Mediciones</h3>
              {bodyMetrics && bodyMetrics.filter(m => m.deleted === 0).length > 0 ? (
                <div className="space-y-2">
                  {bodyMetrics
                    .filter(m => m.deleted === 0)
                    .slice()
                    .reverse()
                    .map(m => (
                      <div key={m.id} className="glass-card rounded-xl p-3 border border-slate-900 flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-450 font-semibold">{new Date(m.logged_at).toLocaleDateString()}</p>
                          <div className="flex gap-4 text-xs font-bold text-white">
                            <span>Peso: <span className="text-emerald-400">{m.weight} lb</span></span>
                            {m.body_fat > 0 && <span>Grasa: <span className="text-emerald-400">{m.body_fat}%</span></span>}
                            {m.muscle_mass > 0 && <span>Músculo: <span className="text-emerald-400">{m.muscle_mass}%</span></span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.synced === 0 && (
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" title="Sincronización pendiente"></span>
                          )}
                          <button
                            onClick={() => handleDeleteBodyMetric(m.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-6 border border-slate-900 text-center">
                  <p className="text-xs text-slate-500">Registra tu primera medición arriba.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM NAVIGATION BAR (Persistente en vistas principales) */}
      {(view === 'dashboard' || view === 'progress' || view === 'history') && (
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-lg border-t border-slate-900 px-6 py-2 flex items-center justify-around z-30">
          <button
            onClick={() => setView('dashboard')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
              view === 'dashboard' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Dumbbell className="w-5 h-5" />
            <span className="text-[10px] font-bold">Rutinas</span>
          </button>
          
          <button
            onClick={() => setView('progress')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
              view === 'progress' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[10px] font-bold">Progreso</span>
          </button>

          <button
            onClick={() => setView('history')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
              view === 'history' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] font-bold">Historial</span>
          </button>
        </nav>
      )}

      {/* MODAL DE PERFIL ESTILO NETFLIX */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Perfil de Atleta</h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Netflix Avatar y Datos Generales */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 relative overflow-hidden">
                <svg viewBox="0 0 32 32" className="w-14 h-14 fill-slate-950 opacity-95">
                  <circle cx="10" cy="11" r="2.5" />
                  <circle cx="22" cy="11" r="2.5" />
                  <path d="M 6 18 C 6 18, 9 24, 16 24 C 23 24, 26 18, 26 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-black text-white">{profile?.name || 'Atleta'}</h4>
                <p className="text-xs text-slate-450 font-medium">{user?.email}</p>
                {profile?.birth_date ? (
                  <p className="text-xs text-emerald-400 font-bold mt-1">
                    {calculateAge(profile.birth_date)} años
                  </p>
                ) : (
                  <p className="text-xs text-amber-500 font-semibold mt-1">
                    Edad sin definir (añade tu nacimiento)
                  </p>
                )}
              </div>
            </div>

            {/* Inputs de Edición de Perfil */}
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre del Atleta</label>
                <input
                  type="text"
                  placeholder="Tu Nombre"
                  value={profileNameInput}
                  onChange={e => setProfileNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha de Nacimiento</label>
                <input
                  type="date"
                  value={profileBirthDateInput}
                  onChange={e => setProfileBirthDateInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 text-center"
                />
                {profileBirthDateInput && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Edad calculada: {calculateAge(profileBirthDateInput) ?? 'Desconocida'} años
                  </p>
                )}
              </div>

              <button
                onClick={handleSaveUserProfile}
                disabled={isSavingProfile}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer text-xs"
              >
                <Save className="w-4 h-4" /> Guardar Cambios
              </button>
            </div>

            {/* Sección Cambiar Contraseña */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-450 uppercase tracking-widest px-1">Seguridad</h4>
              
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-850">
                <p className="text-[10px] text-slate-400 leading-normal">
                  Puedes cambiar tu contraseña de acceso a continuación (mínimo 6 caracteres).
                </p>
                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder="Nueva contraseña"
                    value={newPasswordInput}
                    onChange={e => setNewPasswordInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  />
                  <input
                    type="password"
                    placeholder="Confirmar nueva contraseña"
                    value={confirmNewPasswordInput}
                    onChange={e => setConfirmNewPasswordInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {passwordChangeError && (
                  <p className="text-[10px] text-rose-455 text-center font-medium leading-tight">{passwordChangeError}</p>
                )}

                {passwordChangeSuccess && (
                  <p className="text-[10px] text-emerald-400 text-center font-semibold leading-tight">¡Contraseña actualizada con éxito!</p>
                )}

                <button
                  onClick={() => handleUpdatePassword(false)}
                  disabled={isSavingPassword}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-emerald-500/30 text-xs font-semibold py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" /> Actualizar Contraseña
                </button>
              </div>
            </div>

            {/* Botón de Cerrar Sesión */}
            <div className="border-t border-slate-800 pt-4">
              <button
                onClick={handleSignOut}
                className="w-full bg-rose-500/10 hover:bg-rose-550/20 text-rose-400 border border-rose-500/20 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
