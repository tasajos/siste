import axios from 'axios';

export type User = { id: number; nombre: string; correo: string; rol: 'administrador' | 'operador' | 'equipo' | 'ciudadano' };
export type Data = Record<string, unknown> & { id?: number };
export type Page<T = Data> = { data: T[]; page: number; limit: number; total: number };
type Session = { token: string; usuario: User };
const baseURL = import.meta.env.VITE_API_URL || '/api/v1';
export const api = axios.create({ baseURL, withCredentials: true, timeout: 15000 });
let currentToken = '';
let refreshing: Promise<Session> | undefined;
export const token = () => currentToken;
export function setToken(value: string) { currentToken = value; }
export function refresh() {
  refreshing ??= api.post<Session>('/auth/refresh').then(({ data }) => {
    setToken(data.token);
    return data;
  }).finally(() => { refreshing = undefined; });
  return refreshing;
}
api.interceptors.request.use(config => {
  if (currentToken && !config.url?.match(/^\/auth\/(login|register|refresh|logout)$/)) config.headers.set('Authorization', 'Bearer ' + currentToken);
  return config;
});
api.interceptors.response.use(undefined, async error => {
  const config = error.config as (typeof error.config & { retried?: boolean }) | undefined;
  if (error.response?.status !== 401 || !config || config.retried || config.url?.match(/^\/auth\/(login|register|refresh|logout)$/)) throw error;
  config.retried = true;
  try {
    await refresh();
  } catch {
    setToken('');
    window.dispatchEvent(new Event('comunidad:sesion'));
    throw error;
  }
  return api(config);
});
export function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const { error: message, campos } = error.response?.data ?? {};
    if (Array.isArray(campos) && campos.length) return String(message) + ' ' + campos.map(({ campo, mensaje }) => (campo ? campo + ' · ' : '') + mensaje).join(' ');
    return typeof message === 'string' ? message : 'No pudimos comunicarnos con el servidor. Intenta nuevamente.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la solicitud.';
}
