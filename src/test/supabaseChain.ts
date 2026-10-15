/**
 * Constructor de consultas de Supabase simulado: cada método devuelve el mismo
 * objeto y registra la llamada; al hacer `await` se resuelve con `result`.
 */
export function chain(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return { proxy, calls, call: (name: string) => calls.find(([n]) => n === name)?.[1] };
}
