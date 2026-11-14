/**
 * Configuración y adaptador de Supabase del worker de archivo (ver archivar.mjs). Separado del CLI para
 * probarlo con un fetch falso.
 */

export const BUCKET = 'party-photos';

export class ConfigError extends Error {}

const fail = (message) => {
  throw new ConfigError(message);
};

export function readConfig(argv, env) {
  const known = new Set(['--una-vez', '--conservar-en-storage']);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) fail(`opción desconocida: ${unknown.join(' ')}`);

  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FOTOS_DIR'].filter((k) => !env[k]);
  if (missing.length > 0) fail(`faltan variables: ${missing.join(', ')}`);

  const intervalS = Number(env.FOTOS_INTERVALO_S ?? 15);
  const limit = Number(env.FOTOS_LOTE ?? 20);
  if (!Number.isInteger(intervalS) || intervalS < 1) fail('FOTOS_INTERVALO_S debe ser un entero de 1 o más');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail('FOTOS_LOTE debe ser un entero entre 1 y 200');

  return {
    once: argv.includes('--una-vez'),
    keepInStorage: argv.includes('--conservar-en-storage'),
    url: env.SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
    dir: env.FOTOS_DIR,
    intervalS,
    limit,
  };
}

/** ¿Storage dice explícitamente que el objeto no existe? Cualquier otro error se reintenta en la vuelta siguiente. */
export function isNotFound(error) {
  return error?.statusCode === '404' || error?.status === 404 || /object not found/i.test(error?.message ?? '');
}

export function supabaseDeps(supabase, log) {
  const storage = supabase.storage.from(BUCKET);
  return {
    log,
    listPending: async (limit, after) => {
      let query = supabase
        .from('photos')
        .select('id,storage_path,event_id,guest_id,created_at')
        .is('original_archived_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      // Cursor (created_at, id): las fotos que siguen a la última de la vuelta anterior.
      if (after) {
        query = query.or(`created_at.gt.${after.created_at},and(created_at.eq.${after.created_at},id.gt.${after.id})`);
      }
      const { data, error } = await query;
      if (error) throw new Error(`no se pudo leer la lista de fotos: ${error.message}`);
      return data;
    },
    download: async (storagePath) => {
      const { data, error } = await storage.download(storagePath);
      if (error) {
        if (isNotFound(error)) return null;
        throw new Error(`descarga: ${error.message}`);
      }
      return Buffer.from(await data.arrayBuffer());
    },
    remove: async (storagePath) => {
      const { data, error } = await storage.remove([storagePath]);
      if (error) throw new Error(`borrado en Storage: ${error.message}`);
      if (!data || data.length === 0) throw new Error('Storage no borró nada (¿otro proceso ya lo hizo o faltan permisos?)');
    },
    markArchived: async (id) => {
      const { data, error } = await supabase
        .from('photos')
        .update({ original_archived_at: new Date().toISOString() })
        .eq('id', id)
        .is('original_archived_at', null)
        .select('id');
      if (error) throw new Error(`marcar archivada: ${error.message}`);
      if (!data || data.length === 0) throw new Error('la foto no se marcó (¿ya estaba archivada o faltan permisos?)');
    },
  };
}

