import { useState, type ReactNode } from 'react';
import { type Data, type Page } from './api';
import { fieldTime, label, useLoad } from './ui';

export type Option = { value: string | number; name: string };
export type Field = {
  key: string; name: string; type?: 'number' | 'memo' | 'time' | 'date' | 'check' | 'url' | 'tel';
  choices?: string[] | Option[]; path?: string; optional?: boolean; max?: number; min?: number; step?: string;
  value?: string | number | boolean; omitEmpty?: boolean;
};
const optionRows = (input: Data[] | Page | undefined): Option[] => {
  const list = Array.isArray(input) ? input : input?.data ?? [];
  return list.map(row => ({ value: String(row.clave ?? row.id), name: String(row.nombre ?? row.titulo ?? row.codigo ?? ('#' + row.id)) }));
};
function Choice({ field, current, onChange }: { field: Field; current: unknown; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(String(current ?? ''));
  const source = useLoad<Data[] | Page>(field.path ?? null);
  const options = field.path ? optionRows(source.data) : (field.choices ?? []).map(value => typeof value === 'string' ? { value, name: label(value) } : value);
  const missingOption = current != null && current !== '' && !options.some(option => String(option.value) === String(current));
  return <select aria-label={field.name} name={field.key} value={value} required={!field.optional} onChange={event => { setValue(event.target.value); onChange?.(event.target.value); }}>
    <option value="">{source.pending ? 'Cargando…' : 'Selecciona una opción'}</option>
    {missingOption && <option value={String(current)}>#{String(current)}</option>}
    {options.map(({ value, name }) => <option key={value} value={value}>{name}</option>)}
  </select>;
}
export function InputField({ field, record, onChange }: { field: Field; record?: Data; onChange?: (value: string) => void }) {
  const current = record?.[field.key] ?? field.value;
  if (field.type === 'check') return <label className="check"><input type="checkbox" name={field.key} defaultChecked={Boolean(current)} />{field.name}</label>;
  let input: ReactNode;
  if (field.path || field.choices) input = <Choice field={field} current={current} onChange={onChange} />;
  else if (field.type === 'memo') input = <textarea name={field.key} defaultValue={String(current ?? '')} minLength={field.min} maxLength={field.max ?? 1000} rows={4} required={!field.optional} />;
  else input = <input name={field.key} type={field.type === 'time' ? 'datetime-local' : field.type ?? 'text'}
    defaultValue={field.type === 'time' ? fieldTime(current) : String(current ?? '')} required={!field.optional}
    min={field.type === 'number' ? field.min : undefined} max={field.type === 'number' ? field.max : undefined}
    minLength={!field.type ? field.min : undefined} maxLength={!field.type || field.type === 'tel' || field.type === 'url' ? field.max : undefined} step={field.step}
    onChange={onChange ? event => onChange(event.target.value) : undefined} />;
  return <label className={field.type === 'memo' ? 'wide' : undefined}>{field.name}{input}</label>;
}
export function formValues(form: HTMLFormElement, fields: Field[]) {
  const raw = new FormData(form);
  return Object.fromEntries<unknown>(fields.flatMap<[string, unknown]>(field => {
    const value = String(raw.get(field.key) ?? '').trim();
    if (field.type === 'check') return [[field.key, raw.has(field.key)]];
    if (!value) return field.omitEmpty ? [] : [[field.key, null]];
    if (field.type === 'number' || field.key.endsWith('_id')) return [[field.key, Number(value)]];
    if (field.type === 'time') return [[field.key, new Date(value).toISOString()]];
    return [[field.key, value]];
  }));
}
