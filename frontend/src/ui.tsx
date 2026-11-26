import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, Search, X } from 'lucide-react';
import { api, errorText, type Data, type Page } from './api';

export const logo = '/images/identidad.jpeg';
export const human = (value: unknown) => String(value ?? '').replaceAll('_', ' ').replace(/^./, first => first.toUpperCase());
const es: Record<string, string> = { critica: 'Crítica', policia: 'Policía', transito: 'Tránsito', medica: 'Médica', inundacion: 'Inundación', en_ejecucion: 'En ejecución', en_evaluacion: 'En evaluación', en_atencion: 'En atención', en_revision: 'En revisión', verificada: 'Verificada' };
export const label = (value: unknown) => es[String(value)] ?? human(value);
export const localDate = (value: unknown) => {
  if (!value) return '—';
  const raw = String(value);
  const time = new Date(raw.length === 10 ? raw + 'T12:00:00Z' : raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(time.valueOf()) ? raw : new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', ...(raw.length > 10 ? { timeStyle: 'short' } : {}), timeZone: 'America/La_Paz' }).format(time);
};
export function fieldTime(value: unknown) {
  if (!value) return '';
  const raw = String(value);
  const time = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  if (Number.isNaN(time.valueOf())) return '';
  return new Date(time.valueOf() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const statusLabel = (value: unknown) => <span className={'status status-' + value}>{label(value)}</span>;
export function Spinner() { return <div className="loading" role="status"><LoaderCircle size={20} aria-hidden /> Cargando…</div>; }
export function Failure({ message }: { message: string }) { return <p className="error" role="alert"><CircleAlert size={17} aria-hidden />{message}</p>; }
export function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p>; }
export function PageTitle({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</header>;
}
export function Dialog({ title, close, children, narrow = false }: { title: string; close: () => void; children: ReactNode; narrow?: boolean }) {
  const node = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = node.current;
    dialog?.showModal();
    heading.current?.focus();
    return () => dialog?.close();
  }, []);
  return <dialog ref={node} className={narrow ? 'dialog narrow' : 'dialog'} aria-labelledby={headingId} onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id={headingId} ref={heading} tabIndex={-1}>{title}</h2><button className="icon" aria-label="Cerrar" onClick={close}><X size={22} /></button></header>
    <section>{children}</section>
  </dialog>;
}
export function useLoad<T>(path: string | null, revision = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(Boolean(path));
  useEffect(() => {
    if (!path) { setPending(false); setData(undefined); setError(''); return; }
    const abort = new AbortController();
    setPending(true);
    setError('');
    api.get<T>(path, { signal: abort.signal }).then(result => setData(result.data)).catch(error => {
      if (!abort.signal.aborted) setError(errorText(error));
    }).finally(() => {
      if (!abort.signal.aborted) setPending(false);
    });
    return () => abort.abort();
  }, [path, revision]);
  return { data, pending, error };
}
export const queryString = (values: Record<string, string | number | undefined>) => {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)]);
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
};
export function SearchBox({ search, onChange, placeholder = 'Buscar por nombre' }: { search: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search"><Search size={17} aria-hidden /><input aria-label="Buscar" placeholder={placeholder} value={search} onChange={event => onChange(event.target.value)} /></label>;
}
export function Pagination({ page, change }: { page: Page; change: (value: number) => void }) {
  return <nav className="pagination" aria-label="Paginación"><span>{page.total} {page.total === 1 ? 'registro' : 'registros'}</span>
    <button className="icon" aria-label="Anterior" disabled={page.page <= 1} onClick={() => change(page.page - 1)}><ChevronLeft size={18} /></button>
    <span>Página {page.page}</span>
    <button className="icon" aria-label="Siguiente" disabled={page.page * page.limit >= page.total} onClick={() => change(page.page + 1)}><ChevronRight size={18} /></button>
  </nav>;
}
export type Column = { key: string; name: string; render?: (value: unknown, row: Data) => ReactNode };
export function Table({ columns, data, action }: { columns: Column[]; data: Data[]; action?: (row: Data) => ReactNode }) {
  if (!data.length) return <Empty>No hay registros para esta consulta.</Empty>;
  return <div className="table-scroll" tabIndex={0}><table><thead><tr>{columns.map(col => <th key={col.key} scope="col">{col.name}</th>)}{action && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
    <tbody>{data.map((row, index) => <tr key={row.id ?? index}>{columns.map(col => <td key={col.key} data-label={col.name}>{col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}</td>)}{action && <td>{action(row)}</td>}</tr>)}</tbody>
  </table></div>;
}
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent, callback: () => Promise<void>) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await callback(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return { busy, error, submit };
}
