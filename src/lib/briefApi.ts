import { supabase } from './supabaseClient';

/** Lo que se guarda por pregunta: legible tal cual en el Table Editor. */
export interface BriefAnswer {
  pregunta: string;
  elegidas: string[];
  nota: string;
  /** Textos cortos de las preguntas de campos (nombre, fecha...). */
  campos?: Record<string, string>;
}

export type BriefAnswers = Record<string, BriefAnswer>;

function fail(error: { message?: string; code?: string } | null): never {
  // 54000: se alcanzó el tope de respuestas del formulario (ver la migración).
  if (error?.code === '54000') {
    throw new Error('Este formulario ya recibió el máximo de respuestas.');
  }
  throw new Error(`No pudimos enviar tus respuestas: ${error?.message ?? 'error desconocido'}`);
}

export async function submitClientBrief(
  slug: string,
  respondent: string,
  answers: BriefAnswers,
): Promise<string> {
  const { data, error } = await supabase.rpc('submit_client_brief', {
    p_slug: slug,
    p_respondent: respondent,
    p_answers: answers,
  });

  if (error) fail(error);
  return data as string;
}
