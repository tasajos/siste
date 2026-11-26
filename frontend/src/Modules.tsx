import { useState, type ReactNode } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { api, type Data, type Page, type User } from './api';
import { formValues, InputField, type Field } from './Fields';
import { Dialog, Empty, Failure, label, localDate, PageTitle, Pagination, queryString, SearchBox, Spinner, statusLabel, Table, useLoad, useSubmit, type Column } from './ui';

const field = (key: string, name: string, extra: Partial<Field> = {}): Field => ({ key, name, ...extra });
const str = (key: string, name: string, max: number, optional = false) => field(key, name, { max, optional });
const num = (key: string, name: string, min = 0, max = 100000000, optional = false) => field(key, name, { type: 'number', min, max, optional });
const choice = (key: string, name: string, choices: string[], value?: string) => field(key, name, { choices, value });
const ref = (key: string, name: string, path: string, optional = false) => field(key, name, { path, optional });
const memo = (key: string, name: string, max = 1000, optional = false) => field(key, name, { type: 'memo', max, optional });
const check = (key: string, name: string, value = false) => field(key, name, { type: 'check', value });
const date = (key: string, name: string, optional = false) => field(key, name, { type: 'time', optional, value: optional ? '' : new Date().toISOString() });
const toColumn = (key: string, name: string, render?: Column['render']): Column => ({ key, name, render });
const cols = (...items: [string, string][]) => items.map(([key, name]) => toColumn(key, name));
const typeStates = ['reportada','no_localizada','localizada','evacuada','en_refugio','derivada','cerrada'];
const verification = ['pendiente','en_revision','verificada','descartada'];
const emRef = ref('emergencia_id', 'Emergencia', '/emergencias?limit=100');
const userRef = ref('responsable_id', 'Responsable', '/responsables');
const municip = ref('municipio_id', 'Municipio', '/municipios');
const attention = ['disponible','asignado','en_operacion','no_disponible'];
const opStates = ['planificada','en_ejecucion','suspendida','finalizada','cancelada'];
const bool = (value: unknown) => value ? 'Sí' : 'No';
const tel = (value: unknown) => value ? <a href={'tel:' + String(value)}>{String(value)}</a> : '—';
const state = toColumn('estado', 'Estado', statusLabel);
const config: Record<string, { title: string; single: string; description: string; fields: Field[]; columns: Column[] }> = {
  personas: {
    title: 'Personas reportadas', single: 'persona', description: 'Registra y sigue casos con acceso restringido al personal autorizado.',
    columns: [...cols(['codigo','Código'],['nombre','Nombre'],['ubicacion','Última ubicación']), state, toColumn('verificacion','Verificación',statusLabel)],
    fields: [emRef, str('nombre','Nombre completo',120), num('edad','Edad',0,120,true), str('ubicacion','Última ubicación',240), date('fecha','Fecha del reporte'),
      { ...userRef, optional:true }, str('contacto','Contacto autorizado',120,true), memo('observaciones','Observaciones',1000,true)],
  },
  instituciones: {
    title: 'Instituciones autorizadas', single: 'institución', description: 'Organizaciones que coordinan equipos en los incidentes.',
    columns: [toColumn('nombre','Nombre'),toColumn('tipo','Tipo',label)],
    fields: [str('nombre','Nombre de la institución',100), choice('tipo','Tipo',['bomberos','policia','salud','defensa_civil','rescate','logistica','comunitaria'])],
  },
  equipos: {
    title: 'Equipos autorizados', single: 'equipo', description: 'Consulta disponibilidad y asignaciones con autorización.',
    columns: [...cols(['nombre','Equipo'],['responsable','Responsable'],['especialidad','Especialidad'],['integrantes','Integrantes']), state],
    fields: [str('nombre','Nombre del equipo',100),ref('institucion_id','Institución','/instituciones?limit=100'),str('responsable','Responsable',100),
      field('telefono','Teléfono',{ type:'tel',max:35,optional:true }),municip,str('especialidad','Especialidad',100,true),num('integrantes','Integrantes',1,65535),
      choice('estado','Disponibilidad',attention,'disponible')],
  },
  operaciones: {
    title: 'Operaciones', single: 'operación', description: 'Coordina asignaciones y registra avances de cada intervención.',
    columns: [...cols(['codigo','Código'],['nombre','Operación']),toColumn('inicio','Inicio',localDate),state],
    fields: [emRef,str('nombre','Nombre de la operación',120),userRef,memo('descripcion','Descripción',1200),date('inicio','Inicio',true),date('fin','Fin',true),
      choice('estado','Estado',opStates,'planificada'),memo('observaciones','Observaciones',1000,true)],
  },
  recursos: {
    title: 'Recursos', single: 'recurso', description: 'Registra existencias, entradas, salidas y asignaciones.',
    columns: [...cols(['nombre','Recurso'],['unidad','Unidad'],['cantidad','Existencia'],['minimo','Mínimo'],['ubicacion','Ubicación']),toColumn('categoria','Categoría',label)],
    fields: [str('nombre','Nombre del recurso',100),ref('categoria','Categoría','/catalogos/categorias_recursos'),str('unidad','Unidad',35),
      str('ubicacion','Ubicación',160),str('responsable','Responsable',100),{ ...num('minimo','Umbral de existencias'),value:0 }],
  },
  refugios: {
    title: 'Refugios', single: 'refugio', description: 'Consulta disponibilidad, capacidad y ocupación registrada.',
    columns: [...cols(['nombre','Refugio'],['direccion','Dirección'],['capacidad','Capacidad'],['ocupacion','Ocupación']),toColumn('activo','Estado',(_,row) => !row.activo ? 'Fuera de servicio' : Number(row.ocupacion) > Number(row.capacidad) ? 'Sobreocupado' : Number(row.ocupacion) === Number(row.capacidad) ? 'Capacidad completa' : Number(row.ocupacion) > 0 ? 'Ocupación parcial' : 'Disponible')],
    fields: [str('nombre','Nombre del refugio',120),municip,ref('comunidad_id','Comunidad','/comunidades',true),str('direccion','Dirección',200),
      { ...num('latitud','Latitud',-90,90),step:'any' },{ ...num('longitud','Longitud',-180,180),step:'any' },
      num('capacidad','Capacidad máxima',1),{ ...num('ocupacion','Ocupación actual'),value:0 },str('responsable','Responsable',100),
      field('telefono','Teléfono',{ type:'tel',max:35,optional:true }),memo('servicios','Servicios disponibles',500,true),
      check('activo','Refugio activo',true),memo('revision_ocupacion','Revisión autorizada si supera la capacidad',500,true)],
  },
  evacuaciones: {
    title: 'Evacuaciones', single: 'evacuación', description: 'Registra evacuaciones coordinadas por personal autorizado.',
    columns: [...cols(['origen','Origen'],['destino','Destino'],['personas','Personas']),toColumn('fecha','Fecha',localDate),state],
    fields: [emRef,str('origen','Origen',180),str('destino','Destino',180),ref('refugio_id','Refugio','/refugios?limit=100',true),
      num('personas','Personas evacuadas',1),ref('equipo_id','Equipo a cargo','/equipos?limit=100'),date('fecha','Fecha y hora'),
      choice('estado','Estado',['registrada','en_curso','completada','cancelada'],'registrada'),memo('observaciones','Observaciones',1000,true)],
  },
  contactos: {
    title: 'Directorio de contactos', single: 'contacto', description: 'Consulta servicios de apoyo y sus fuentes oficiales.',
    columns: [toColumn('nombre','Servicio'),toColumn('categoria','Categoría',label),toColumn('telefono','Teléfono',tel),toColumn('cobertura','Cobertura'),toColumn('verificado','Verificado',bool)],
    fields: [str('nombre','Nombre del servicio',120),choice('categoria','Categoría',['bomberos','policia','hospital','centro_salud','ambulancia','defensa_civil','municipio','apoyo']),
      field('telefono','Teléfono',{type:'tel',max:35}),str('direccion','Dirección',180,true),str('cobertura','Cobertura',180),
      field('web','Sitio oficial',{type:'url',max:500,optional:true}),field('fuente','URL de la fuente',{type:'url',max:500}),
      field('fecha_verificacion','Fecha de verificación',{type:'date',optional:true}),check('verificado','Contacto verificado'),
      { ...num('latitud','Latitud',-90,90,true),step:'any' },{ ...num('longitud','Longitud',-180,180,true),step:'any' }],
  },
};
function FormPanel({ fields, record, endpoint, mode = 'post', after, name = 'Guardar' }: {
  fields: Field[]; record?: Data; endpoint: string; mode?: 'post' | 'patch'; after: () => void; name?: string;
}) {
  const { submit, busy, error } = useSubmit();
  const [municipality, setMunicipality] = useState<string>();
  return <form className="form-grid" onSubmit={event => {
    const values = formValues(event.currentTarget, fields);
    void submit(event, async () => { await api[mode](endpoint, values); after(); });
  }}>
    {fields.map(item => item.key === 'comunidad_id' ?
      <InputField key={item.key + (municipality ?? '')} field={{ ...item, path: '/comunidades?municipio_id=' + (municipality ?? record?.municipio_id ?? 1) }} record={municipality === undefined ? record : undefined} /> :
      <InputField key={item.key} field={item} record={record} onChange={item.key === 'municipio_id' ? setMunicipality : undefined} />)}
    <div className="wide">{error && <Failure message={error} />}<button className="button primary" disabled={busy}>{busy ? 'Guardando…' : name}</button></div>
  </form>;
}
function SubRecords({ title, endpoint, columns, revision }: { title: string; endpoint: string; columns: Column[]; revision: number }) {
  const result = useLoad<Data[]>(endpoint, revision);
  return <section className="subsection"><h3>{title}</h3>{result.pending && <Spinner />}{result.error && <Failure message={result.error} />}{result.data && <Table columns={columns} data={result.data} />}</section>;
}
function ModuleDetails({ module, item, user, refresh, revision }: { module: string; item: Data; user: User; refresh: () => void; revision: number }) {
  const base = '/' + module + '/' + item.id;
  const limited = user.rol === 'equipo';
  const [action, setAction] = useState('');
  const [saved, setSaved] = useState(false);
  const assignments = useLoad<{ equipos: Data[]; recursos: Data[]; avances: Data[] }>(module === 'operaciones' ? base + '/asignaciones' : null, revision);
  const choices: { label: string; endpoint: string; fields: Field[]; mode?: 'patch' }[] = [];
  if (module === 'personas') choices.push({ label:'Registrar seguimiento',endpoint:'/seguimiento',
    fields:[choice('estado','Estado',typeStates,String(item.estado)),choice('verificacion','Verificación',verification,String(item.verificacion)),memo('observaciones','Detalle del seguimiento')] });
  if (module === 'equipos' && !limited) choices.push({ label:'Vincular integrante',endpoint:'/integrantes',fields:[ref('usuario_id','Usuario autorizado','/usuarios-equipo')] });
  if (module === 'equipos' && limited) choices.push({ label:'Cambiar disponibilidad',endpoint:'/disponibilidad',mode:'patch',fields:[choice('estado','Disponibilidad',['disponible','no_disponible'])] });
  if (module === 'operaciones') {
    choices.push({ label:'Registrar avance',endpoint:'/avances',fields:[memo('detalle','Detalle del avance',1500)] });
    if (!limited) choices.push(
      { label:'Asignar equipo',endpoint:'/equipos',fields:[ref('equipo_id','Equipo disponible','/equipos?limit=100')] },
      { label:'Asignar recursos',endpoint:'/recursos',fields:[ref('recurso_id','Recurso','/recursos?limit=100'),num('cantidad','Cantidad',1)] },
    );
  }
  if (module === 'recursos') choices.push({ label:'Registrar movimiento',endpoint:'/movimientos',
    fields:[choice('tipo','Tipo de movimiento',['entrada','salida']),num('cantidad','Cantidad',1),memo('detalle','Detalle',300,true)] });
  const selected = choices.find(item => item.endpoint === action);
  function display(value: unknown, type?: Field['type']): ReactNode {
    if (type === 'time' || type === 'date') return localDate(value);
    if (type === 'check') return bool(value);
    if (type === 'tel') return tel(value);
    if (type === 'url' && value && /^https?:\/\//i.test(String(value))) return <a href={String(value)} target="_blank" rel="noreferrer">Abrir sitio <ExternalLink size={14} /></a>;
    return value == null || value === '' ? '—' : String(value);
  }
  return <>
    <dl className="descriptions">{config[module].fields.filter(field => field.key in item).map(field => <div key={field.key}><dt>{field.name}</dt><dd>{display(item[field.key], field.type)}</dd></div>)}</dl>
    {module === 'refugios' && <p>Espacios disponibles · {Math.max(0, Number(item.capacidad) - Number(item.ocupacion))}</p>}
    {module === 'recursos' && <p>Existencia actual · {String(item.cantidad)} {String(item.unidad)}</p>}
    {module === 'personas' && <p>{statusLabel(item.estado)} {statusLabel(item.verificacion)}</p>}
    {module === 'personas' && <SubRecords title="Historial de seguimiento" endpoint={base + '/seguimiento'} revision={revision} columns={[toColumn('creado_en','Fecha',localDate),state,toColumn('verificacion','Verificación',statusLabel),...cols(['responsable','Registrado por'],['observaciones','Observaciones'])]} />}
    {module === 'recursos' && <SubRecords title="Movimientos de inventario" endpoint={base + '/movimientos'} revision={revision} columns={[toColumn('creado_en','Fecha',localDate),toColumn('tipo','Tipo',label),...cols(['cantidad','Cantidad'],['detalle','Detalle'])]} />}
    {assignments.pending && <Spinner />}{assignments.error && <Failure message={assignments.error} />}
    {assignments.data && <div className="subsection"><h3>Equipos asignados</h3><Table data={assignments.data.equipos} columns={[toColumn('nombre','Nombre'),state]} />
      <h3>Recursos asignados</h3><Table data={assignments.data.recursos} columns={cols(['nombre','Nombre'],['cantidad','Cantidad'],['unidad','Unidad'])} />
      <h3>Historial de avances</h3><Table data={assignments.data.avances} columns={[toColumn('creado_en','Fecha',localDate),toColumn('detalle','Avance')]} /></div>}
    {choices.length > 0 && <div className="actions">{choices.map(item => <button className="button" key={item.endpoint} onClick={() => { setAction(item.endpoint); setSaved(false); }}>{item.label}</button>)}</div>}
    {saved && <p className="success" role="status">Cambio guardado.</p>}
    {selected && <div className="subsection"><h3>{selected.label}</h3><FormPanel key={selected.endpoint} fields={selected.fields} endpoint={base + selected.endpoint} mode={selected.mode} after={() => { setAction(''); setSaved(true); refresh(); }} /></div>}
  </>;
}
export function ModulePage({ module, user }: { module: string; user: User }) {
  const [q, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<{ kind: 'create' | 'edit' | 'view'; item?: Data }>();
  const info = config[module];
  const canEdit = ['administrador','operador'].includes(user.rol);
  const update = () => setRevision(value => value + 1);
  const result = useLoad<Page>('/' + module + queryString({ q, page }), revision);
  const selected = useLoad<Data>(modal?.item?.id ? '/' + module + '/' + modal.item.id : null, revision);
  return <><PageTitle title={info.title} description={info.description}>{canEdit && <button className="button primary" onClick={() => setModal({ kind:'create' })}><Plus size={17} />Nuevo registro</button>}</PageTitle>
    <section className="panel"><SearchBox search={q} onChange={value => { setSearch(value); setPage(1); }} />
      {result.pending && <Spinner />}{result.error && <Failure message={result.error} />}
      {result.data && !result.pending && !result.error && <><Table columns={info.columns} data={result.data.data} action={item => <div className="actions">
        <button className="button small" onClick={() => setModal({ kind:'view',item })}>Ver ficha</button>
        {canEdit && <button className="button small" onClick={() => setModal({ kind:'edit',item })}>Editar</button>}
      </div>} /><Pagination page={result.data} change={setPage} /></>}
    </section>
    {modal && <Dialog title={modal.kind === 'create' ? 'Registrar ' + info.single : modal.kind === 'edit' ? 'Editar ' + info.single : 'Ficha de ' + info.single} close={() => setModal(undefined)}>
      {modal.kind === 'view' ? <ModuleDetails module={module} item={selected.data?.id === modal.item?.id ? selected.data! : modal.item!} user={user} revision={revision} refresh={update} /> :
        <FormPanel fields={info.fields} record={modal.item} endpoint={'/' + module + (modal.item ? '/' + modal.item.id : '')} mode={modal.kind === 'edit' ? 'patch' : 'post'} after={() => { update(); setModal(undefined); }} />}
    </Dialog>}
  </>;
}
export function CommunityPage() {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [municipality, setMunicipality] = useState('');
  const municipalities = useLoad<Data[]>('/municipios');
  const result = useLoad<Data[]>('/comunidades' + queryString({ municipio_id: municipality }), revision);
  return <><PageTitle title="Comunidades" description="Catálogo de comunidades con fuente territorial."><button className="button primary" onClick={() => setOpen(true)}><Plus size={17} />Registrar comunidad</button></PageTitle>
    <section className="panel"><div className="filters"><label>Municipio<select value={municipality} onChange={event => setMunicipality(event.target.value)}><option value="">Todos</option>{municipalities.data?.map(item => <option key={item.id} value={item.id}>{String(item.nombre)}</option>)}</select></label></div>
    {result.pending && <Spinner />}{result.error && <Failure message={result.error} />}{result.data && <Table data={result.data} columns={[
      toColumn('nombre','Comunidad'),toColumn('municipio_id','Municipio',id => String(municipalities.data?.find(item => item.id === id)?.nombre ?? id)),
      toColumn('fuente','Fuente',value => /^https?:\/\//i.test(String(value)) ? <a href={String(value)} rel="noreferrer" target="_blank">Consultar fuente</a> : String(value)),
    ]} />}</section>
    {open && <Dialog title="Registrar comunidad" close={() => setOpen(false)}><FormPanel fields={[municip,str('nombre','Nombre de la comunidad',100),field('fuente','URL de la fuente',{type:'url',max:500}),{ ...num('latitud','Latitud',-90,90,true),step:'any' },{ ...num('longitud','Longitud',-180,180,true),step:'any' }]} endpoint="/comunidades" after={() => {setRevision(value => value + 1);setOpen(false);}} /></Dialog>}
  </>;
}
export function UsersPage() {
  const [q, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [user, edit] = useState<Data>();
  const [auditView, setAuditView] = useState(false);
  const result = useLoad<Page>((auditView ? '/auditorias' : '/usuarios') + queryString({ page, q }), revision);
  return <><PageTitle title="Usuarios y roles" description="Administra el acceso y consulta el registro de cambios.">
    <button className="button" onClick={() => {setAuditView(!auditView);setPage(1);}}>{auditView ? 'Ver usuarios' : 'Ver auditoría'}</button></PageTitle>
    <section className="panel">{!auditView && <SearchBox search={q} onChange={value => {setSearch(value);setPage(1);}} />}
      {result.pending && <Spinner />}{result.error && <Failure message={result.error} />}{result.data && !result.pending && <><Table data={result.data.data} columns={auditView ?
        [toColumn('creado_en','Fecha',localDate),...cols(['nombre','Usuario'],['entidad','Entidad'],['registro_id','Registro'],['accion','Acción'])] :
        [...cols(['nombre','Nombre'],['correo','Correo']),toColumn('rol','Rol',label),toColumn('activo','Activo',bool)]}
        action={auditView ? undefined : item => <button className="button small" onClick={() => edit(item)}>Editar acceso</button>} />
      <Pagination page={result.data} change={setPage} /></>}</section>
    {user && <Dialog title="Editar acceso" close={() => edit(undefined)}><FormPanel fields={[str('nombre','Nombre',100),ref('rol','Rol','/catalogos/roles'),check('activo','Cuenta activa')]} record={user} endpoint={'/usuarios/' + user.id} mode="patch" after={() => {setRevision(value => value + 1);edit(undefined);}} /></Dialog>}
  </>;
}
