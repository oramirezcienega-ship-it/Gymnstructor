import { createClient } from '@supabase/supabase-js';

// Usar variables de entorno de Vite. El fallback apunta a la IP local configurada.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://192.168.100.253:8050';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummykey'; // Clave temporal dummy si no se define

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
