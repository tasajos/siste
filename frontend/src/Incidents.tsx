import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileImage, MapPin, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { api, type Data, type Page } from './api';
import { InputField, formValues, type Field } from './Fields';
import { coordinateFields, IncidentLocation } from './IncidentLocation';
import { Empty, Failure, label, localDate, PageTitle, Pagination, queryString, SearchBox, Spinner, statusLabel, Table, useLoad, useSubmit } from './ui';

export type Incident = Data & { id: number; codigo: string; titulo: string; tipo: string; municipio: string; provincia: string; prioridad: string; estado: string; verificacion: string; fecha: string; latitud: number | null; longitud: number | null };
export type Filter = { q?: string; tipo?: string; estado?: string; prioridad?: string; verificacion?: string; municipio_id?: string; provincia_id?: string; desde?: string; hasta?: string };
export function IncidentFilters({ filter, change, dates = false }: { filter: Filter; change: (value: Filter) => void; dates?: boolean }) {
  const types = useLoad<Data[]>('/catalogos/tipos_emergencia');
  const provinces = useLoad<Data[]>('/provincias');
  const municipalities = useLoad<Data[]>('/municipios' + queryString({ provincia_id: filter.provincia_id }));
  const category = (name: string, field: keyof Filter, values: string[]) =>
    <label>{name}<select value={filter[field] ?? ''} onChange={event => change({ ...filter, [field]: event.target.value })}><option value="">Todos</option>
    {values.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>;
  return <div className="filters">
    <SearchBox search={filter.q ?? ''} onChange={q => change({ ...filter, q })} placeholder="Buscar código, tipo o municipio" />
    <label>Provincia<select value={filter.provincia_id ?? ''} onChange={event => change({ ...filter, provincia_id: event.target.value, municipio_id: '' })}><option value="">Todas</option>
      {provinces.data?.map(item => <option value={item.id} key={item.id}>{String(item.nombre)}</option>)}</select></label>
    <label>Municipio<select value={filter.municipio_id ?? ''} onChange={event => change({ ...filter, municipio_id: event.target.value })}><option value="">Todos</option>
      {municipalities.data?.map(item => <option value={item.id} key={item.id}>{String(item.nombre)}</option>)}</select></label>
    <label>Tipo<select value={filter.tipo ?? ''} onChange={event => change({ ...filter, tipo: event.target.value })}><option value="">Todos</option>
      {types.data?.map(item => <option key={String(item.clave)} value={String(item.clave)}>{String(item.nombre)}</option>)}</select></label>
    {category('Prioridad', 'prioridad', ['baja','media','alta','critica'])}
    {category('Estado', 'estado', ['reportada','en_evaluacion','en_atencion','controlada','cerrada','cancelada'])}
    {category('Verificación', 'verificacion', ['pendiente','en_revision','verificada','descartada'])}
    {dates && <><label>Desde<input type="date" value={filter.desde ?? ''} onChange={event => change({ ...filter, desde: event.target.value })} /></label>
    <label>Hasta<input type="date" value={filter.hasta ?? ''} onChange={event => change({ ...filter, hasta: event.target.value })} /></label></>}
  </div>;
}
export function EmergencyList() {
  const [filter, setFilter] = useState<Filter>({});
  const [page, setPage] = useState(1);
  const result = useLoad<Page<Incident>>('/emergencias' + queryString({ ...filter, page }));
  return <>
    <PageTitle title="Emergencias" description="Consulta tus reportes y los incidentes que tu cuenta puede ver."><Link className="button primary" to="/emergencias/nueva"><Plus size={18} />Nuevo reporte</Link></PageTitle>
    <section className="panel"><IncidentFilters filter={filter} change={value => { setFilter(value); setPage(1); }} dates />
      {result.pending && <Spinner />}{result.error && <Failure message={result.error} />}
      {result.data && !result.pending && !result.error && <><Table data={result.data.data} columns={[
        { key: 'codigo', name: 'Código', render: (value, row) => <Link className="table-link" to={'/emergencias/' + row.id}>{String(value)}</Link> },
        { key: 'titulo', name: 'Incidente' }, { key: 'municipio', name: 'Municipio' },
        { key: 'prioridad', name: 'Prioridad', render: statusLabel }, { key: 'estado', name: 'Estado', render: statusLabel },
        { key: 'verificacion', name: 'Verificación', render: statusLabel }, { key: 'fecha', name: 'Fecha', render: localDate },
      ]} /><Pagination page={result.data} change={setPage} /></>}
    </section></>;
}
function Evidence({ incident }: { incident: number }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    api.get('/emergencias/' + incident + '/evidencia', { responseType: 'blob' }).then(({ data }) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [incident]);
  return failed ? <Failure message="No se pudo cargar la fotografía." /> : url ? <img className="evidence" src={url} alt="Evidencia fotográfica del incidente" /> : <Spinner />;
}
export function IncidentDetail({ user }: { user: { id: number; rol: string } }) {
  const { id } = useParams();
  const result = useLoad<Incident & { evidencias: Data[] }>('/emergencias/' + id);
  const incident = result.data;
  const staff = ['administrador','operador'].includes(user.rol);
  const history = useLoad<Data[]>(incident && (staff || incident.usuario_id === user.id) ? '/emergencias/' + id + '/historial' : null);
  return <><Link className="back" to="/emergencias"><ArrowLeft size={17} /> Volver a emergencias</Link>
    {result.pending && <Spinner />}{result.error && <Failure message={result.error} />}
    {incident && <><PageTitle title={incident.titulo} description={incident.codigo + ' · ' + localDate(incident.fecha)}>{staff && <Link className="button primary" to={'/emergencias/' + id + '/editar'}><Pencil size={17} />Editar incidente</Link>}</PageTitle>
      <section className="panel detail">
        <div className="actions">{statusLabel(incident.prioridad)}{statusLabel(incident.estado)}{statusLabel(incident.verificacion)}{Boolean(incident.alerta_publica) && <span className="status status-verificada"><ShieldCheck size={15} /> Alerta publicada</span>}</div>
        <p><MapPin size={18} />{[incident.comunidad, incident.municipio, incident.provincia].filter(Boolean).join(', ')}</p>
        {Boolean(incident.direccion) && <p>{String(incident.direccion)}</p>}
        {incident.latitud !== null && incident.longitud !== null && <p>Coordenadas · {incident.latitud}, {incident.longitud}</p>}
        {Boolean(incident.descripcion) && <p className="preline">{String(incident.descripcion)}</p>}
        {Boolean(incident.recomendaciones) && <div className="info"><strong>Indicaciones autorizadas</strong><p>{String(incident.recomendaciones)}</p></div>}
        {Boolean(incident.observaciones) && <p>Observaciones · {String(incident.observaciones)}</p>}
        {incident.evidencias.length > 0 && <Evidence incident={incident.id} />}
      </section>
      {history.data && <section className="panel"><h2>Historial de cambios</h2>{!history.data.length && <Empty>Sin cambios registrados.</Empty>}
        {history.data.map(item => <article className="notice" key={item.id}><div><strong>{localDate(item.creado_en)}</strong><p>{Object.entries((item.detalle ?? {}) as Record<string, unknown>).map(([key, value]) => label(key) + ' · ' + label(value)).join(' / ') || 'Edición del reporte'}</p></div></article>)}</section>}
      {history.error && <Failure message={history.error} />}
    </>}
  </>;
}
function photoData(file: File) {
  return new Promise<{ mime: string; contenido: string }>((resolve, reject) => {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      reject(new Error('Elige una fotografía JPEG, PNG o WebP de hasta 2 MB.')); return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ mime: file.type, contenido: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(file);
  });
}
export function IncidentEditor({ user }: { user: { rol: string } }) {
  const { id } = useParams();
  const record = useLoad<Incident>(id ? '/emergencias/' + id : null);
  const incident = record.data?.id === Number(id) ? record.data : undefined;

  return <>
    <Link className="back" to={id ? '/emergencias/' + id : '/emergencias'}><ArrowLeft size={17} /> Volver</Link>
    <PageTitle title={id ? 'Editar emergencia' : 'Reportar emergencia'} description="Describe el incidente y registra la ubicación para facilitar su revisión." />
    {record.error && <Failure message={record.error} />}{record.pending && <Spinner />}
    {(!id || incident) && <IncidentForm key={id ?? 'nueva'} user={user} incident={incident} />}
  </>;
}

function IncidentForm({ user, incident }: { user: { rol: string }; incident?: Incident }) {
  const id = incident?.id;
  const [municipality, setMunicipality] = useState<string | null>(null);
  const navigate = useNavigate();
  const { busy, error, submit } = useSubmit();
  const selected = municipality ?? String(incident?.municipio_id ?? '');
  const fields: Field[] = [
    { key: 'titulo', name: 'Título del incidente', min: 4, max: 120 },
    { key: 'tipo', name: 'Tipo de emergencia', path: '/catalogos/tipos_emergencia' },
    { key: 'municipio_id', name: 'Municipio', path: '/municipios' },
    { key: 'comunidad_id', name: 'Comunidad', path: '/comunidades?municipio_id=' + (selected || '1'), optional: true },
    { key: 'direccion', name: 'Dirección o referencia', optional: true, max: 240 },
    { key: 'fecha', name: 'Fecha y hora del incidente', type: 'time', value: new Date().toISOString() },
    { key: 'prioridad', name: id ? 'Prioridad' : 'Prioridad preliminar', path: '/catalogos/prioridades', value: 'media' },
    { key: 'descripcion', name: 'Describe lo ocurrido', type: 'memo', min: 10, max: 2500 },
  ];
  if (id && user.rol !== 'ciudadano') fields.push(
    { key: 'estado', name: 'Estado de atención', path: '/catalogos/estados_emergencia' },
    { key: 'verificacion', name: 'Verificación', path: '/catalogos/estados_verificacion' },
    { key: 'responsable_id', name: 'Responsable', path: '/responsables', optional: true },
    { key: 'observaciones', name: 'Observaciones internas', type: 'memo', optional: true },
    { key: 'alerta_publica', name: 'Autorizar y difundir alerta pública verificada', type: 'check' },
    { key: 'recomendaciones', name: 'Indicaciones públicas aprobadas', type: 'memo', optional: true, max: 500 },
  );

  return <form className="panel form-grid" onSubmit={event => {
    const form = event.currentTarget;
    const body = formValues(form, [...fields, ...coordinateFields]);
    const file = new FormData(form).get('evidencia');
    void submit(event, async () => {
      if (!id && file instanceof File && file.size) body.evidencia = await photoData(file);
      if (id) { await api.patch('/emergencias/' + id, body); navigate('/emergencias/' + id); }
      else { const { data } = await api.post('/emergencias', body); navigate('/emergencias/' + data.id); }
    });
  }}>
    {fields.map(field => {
      const key = field.key;
      if (key === 'comunidad_id') return <InputField key={key + selected} field={field} record={municipality === null ? incident : undefined} />;
      return <InputField key={key} field={field} record={incident} onChange={key === 'municipio_id' ? setMunicipality : undefined} />;
    })}
    <IncidentLocation initial={incident} />
    {!id && <label className="wide"><span><FileImage size={17} /> Fotografía opcional, hasta 2 MB</span><input type="file" name="evidencia" accept="image/jpeg,image/png,image/webp" /></label>}
    <div className="wide">{error && <Failure message={error} />}<button className="button primary" disabled={busy}>{busy ? 'Guardando…' : id ? 'Guardar cambios' : 'Enviar reporte'}</button></div>
  </form>;
}
