import { useState } from 'react';
import { Link } from 'react-router';
import { Activity, ClipboardCheck, Download, House, MapPin, Package, Printer, Radio, ShieldAlert, Siren, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorText, type Data, type Page, type User } from './api';
import { IncidentFilters, type Filter } from './Incidents';
import { Empty, Failure, PageTitle, Pagination, localDate, queryString, Spinner, statusLabel, Table, useLoad, type Column } from './ui';

type Summary = { indicadores: Record<string, number>; porTipo: { nombre: string; total: number }[]; alertas: Data[]; activas: Data[]; recursosBajos: Data[] };
const figures = [
  { key: 'total', name: 'Emergencias', icon: Siren },
  { key: 'activas', name: 'Activas', icon: Activity },
  { key: 'criticas', name: 'Críticas activas', icon: ShieldAlert },
  { key: 'pendientes', name: 'Por verificar', icon: ClipboardCheck },
  { key: 'atendidas', name: 'Atendidas', icon: ClipboardCheck },
  { key: 'personas', name: 'Personas reportadas', icon: Users },
  { key: 'equipos', name: 'Equipos disponibles', icon: Users },
  { key: 'operaciones', name: 'Operaciones en ejecución', icon: Radio },
  { key: 'refugios', name: 'Refugios activos', icon: House },
  { key: 'recursos', name: 'Recursos', icon: Package },
];
export function Dashboard({ user, center = false }: { user: User; center?: boolean }) {
  const result = useLoad<Summary>(center ? '/centro-operaciones/resumen' : '/reportes/resumen');
  const data = result.data;
  return <>
    <PageTitle title={center ? 'Centro de Operaciones' : 'Panel principal'} description={center ? 'Seguimiento académico de incidentes, asignaciones y recursos.' : 'Hola, ' + user.nombre + '. Consulta el estado de las emergencias en Cochabamba.'}><Link className="button" to="/mapa"><MapPin size={17} />Ver mapa</Link></PageTitle>
    {result.error && <Failure message={result.error} />}{result.pending && <Spinner />}
    {data && <>
      <div className="metrics">{figures.filter(item => item.key in data.indicadores).map(({ key, name, icon: Icon }) => <article className="metric" key={key}><Icon size={21} aria-hidden /><strong>{data.indicadores[key]}</strong><span>{name}</span></article>)}</div>
      <div className="dashboard-grid">
        <section className="panel"><h2>Emergencias por tipo</h2>{!data.porTipo.length ? <Empty>Todavía no hay emergencias en tu vista.</Empty> : <div className="chart"><ResponsiveContainer width="100%" height={Math.max(190, data.porTipo.length * 32)}>
          <BarChart data={data.porTipo} layout="vertical" margin={{ left: 4, right: 20 }}><CartesianGrid stroke="#2c3b4b" horizontal={false} /><YAxis dataKey="nombre" type="category" width={135} tick={{ fill: '#ccd9e5', fontSize: 11 }} /><XAxis type="number" allowDecimals={false} tick={{ fill: '#ccd9e5' }} />
            <Tooltip contentStyle={{ background: '#15222f', borderColor: '#334453', color: '#fff' }} cursor={{ fill: '#223342' }} /><Bar dataKey="total" name="Emergencias" fill="#e9ae4b" radius={[0, 4, 4, 0]} /></BarChart>
        </ResponsiveContainer></div>}</section>
        <section className="panel"><h2>Últimas alertas verificadas</h2>{!data.alertas.length && <Empty>Por ahora no hay alertas públicas.</Empty>}{data.alertas.map(item => <article className="notice" key={item.id}>
          <div><Link className="table-link" to={'/emergencias/' + item.id}>{String(item.tipo)} · {String(item.municipio)}</Link><p>{localDate(item.fecha)} · {statusLabel(item.prioridad)}</p></div>
        </article>)}</section>
      </div>
      {center && <>
        <section className="panel"><h2>Incidentes abiertos y responsables</h2><Table data={data.activas} columns={[
          { key: 'codigo', name: 'Código', render: (value, row) => <Link className="table-link" to={'/emergencias/' + row.id}>{String(value)}</Link> },
          { key: 'titulo', name: 'Emergencia' }, { key: 'municipio', name: 'Municipio' }, { key: 'prioridad', name: 'Prioridad', render: statusLabel },
          { key: 'estado', name: 'Estado', render: statusLabel }, { key: 'responsable', name: 'Responsable' },
        ]} /></section>
        <section className="panel"><h2>Recursos con existencias bajas</h2><Table data={data.recursosBajos} columns={[{ key: 'nombre', name: 'Recurso' }, { key: 'cantidad', name: 'Existencia' }, { key: 'unidad', name: 'Unidad' }]} />
          <div className="actions"><Link className="button" to="/equipos">Equipos</Link><Link className="button" to="/operaciones">Operaciones</Link><Link className="button" to="/refugios">Refugios</Link><Link className="button" to="/contactos">Directorio</Link></div>
        </section>
      </>}
    </>}
  </>;
}
const reportColumns: Record<string, [string, string][]> = {
  emergencias: [['provincia','Provincia'],['municipio','Municipio'],['tipo','Tipo'],['prioridad','Prioridad'],['estado','Estado'],['total','Total']],
  personas: [['estado','Estado'],['verificacion','Verificación'],['total','Total']],
  recursos: [['categoria','Categoría'],['unidad','Unidad'],['registros','Registros'],['total','Existencias']],
  operaciones: [['estado','Estado'],['total','Total']],
  refugios: [['nombre','Refugio'],['municipio','Municipio'],['capacidad','Capacidad'],['ocupacion','Ocupación'],['disponibles','Disponibles']],
};
const csvValue = (value: unknown) => {
  const valueText = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(valueText) ? "'" + valueText : valueText;
  return '"' + safe.replaceAll('"', '""') + '"';
};
export function Reports() {
  const [kind, setKind] = useState('emergencias');
  const [filter, setFilter] = useState<Filter>({});
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const path = '/reportes/' + kind;
  const paginated = ['emergencias','refugios'].includes(kind);
  const permitted = kind === 'emergencias' ? filter : kind === 'personas' ? { municipio_id: filter.municipio_id, desde: filter.desde, hasta: filter.hasta } :
    kind === 'recursos' ? {} : { municipio_id: filter.municipio_id };
  const { data, pending, error } = useLoad<Data[] | Page>(path + queryString({ ...permitted, page }));
  const records = Array.isArray(data) ? data : data?.data ?? [];
  const columns: Column[] = reportColumns[kind].map(([key, name]) => ({ key, name, render: ['estado','prioridad','verificacion'].includes(key) ? statusLabel : undefined }));
  const municipalities = useLoad<Data[]>('/municipios');
  async function download() {
    setExportError(''); setExporting(true);
    try {
      const all: Data[] = [];
      if (paginated) {
        let current = 1;
        let next: Page;
        do {
          next = (await api.get<Page>(path + queryString({ ...permitted, limit: 100, page: current++ }))).data;
          all.push(...next.data);
        } while (all.length < next.total && next.data.length);
      } else all.push(...records);
      const csv = [columns.map(col => csvValue(col.name)).join(','), ...all.map(row => columns.map(col => csvValue(row[col.key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'comunidad-' + kind + '.csv'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(errorText(error)); } finally { setExporting(false); }
  }
  return <><PageTitle title="Reportes" description="Consulta datos agregados y descarga el resultado autorizado." />
    <section className="panel">
      <div className="filters"><label>Reporte<select value={kind} onChange={event => { setKind(event.target.value); setFilter({}); setPage(1); }}>
        <option value="emergencias">Emergencias</option><option value="personas">Personas reportadas</option><option value="recursos">Recursos</option>
        <option value="operaciones">Operaciones</option><option value="refugios">Ocupación de refugios</option></select></label>
      {kind !== 'emergencias' && kind !== 'recursos' && <label>Municipio<select value={filter.municipio_id ?? ''} onChange={event => { setFilter({ ...filter, municipio_id: event.target.value }); setPage(1); }}><option value="">Todos</option>{municipalities.data?.map(item => <option key={item.id} value={item.id}>{String(item.nombre)}</option>)}</select></label>}
      {kind === 'personas' && <><label>Desde<input type="date" value={filter.desde ?? ''} onChange={event => setFilter({ ...filter, desde: event.target.value })} /></label><label>Hasta<input type="date" value={filter.hasta ?? ''} onChange={event => setFilter({ ...filter, hasta: event.target.value })} /></label></>}
      </div>
      {kind === 'emergencias' && <IncidentFilters filter={filter} change={value => { setFilter(value); setPage(1); }} dates />}
      <div className="actions report-actions">
        <button className="button primary" onClick={download} disabled={pending || !records.length || exporting}><Download size={17} />{exporting ? 'Exportando…' : 'Exportar CSV'}</button>
        <button className="button" onClick={() => window.print()} disabled={pending || !records.length}><Printer size={17} />Imprimir página</button>
      </div>
      {(error || exportError) && <Failure message={error || exportError} />}{pending && <Spinner />}
      {data && !pending && !error && <><Table columns={columns} data={records} />{!Array.isArray(data) && <Pagination page={data} change={setPage} />}</>}
    </section>
  </>;
}
