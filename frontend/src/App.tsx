import { useEffect, useState, lazy, Suspense } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Activity, Bell, Building2, ClipboardList, ContactRound, House, LayoutDashboard, LogOut, Map, Menu, Package, Plus, Radio, Route as RouteIcon, Shield, Siren, Users, UserRound, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { api, errorText, refresh, setToken, token, type Data, type Page, type User } from './api';
import { Login } from './Login';
import { Dialog, Empty, Failure, label, localDate, logo, PageTitle, Pagination, Spinner, useLoad, useSubmit } from './ui';
import { EmergencyList, IncidentDetail, IncidentEditor } from './Incidents';
import { ModulePage, CommunityPage, UsersPage } from './Modules';

const MapPage = lazy(() => import('./MapPage'));
const Dashboard = lazy(() => import('./Dashboard').then(module => ({ default: module.Dashboard })));
const Reports = lazy(() => import('./Dashboard').then(module => ({ default: module.Reports })));
const nav = [
  { path: '/', title: 'Panel principal', icon: LayoutDashboard },
  { path: '/emergencias', title: 'Emergencias', icon: Siren },
  { path: '/mapa', title: 'Mapa de incidentes', icon: Map },
  { path: '/centro', title: 'Centro de Operaciones', icon: Radio, access: 'staff' },
  { path: '/personas', title: 'Personas reportadas', icon: Users, access: 'staff' },
  { path: '/instituciones', title: 'Instituciones', icon: Building2, access: 'staff' },
  { path: '/equipos', title: 'Equipos', icon: Shield, access: 'team' },
  { path: '/operaciones', title: 'Operaciones', icon: ClipboardList, access: 'team' },
  { path: '/recursos', title: 'Recursos', icon: Package, access: 'staff' },
  { path: '/refugios', title: 'Refugios', icon: House },
  { path: '/evacuaciones', title: 'Evacuaciones', icon: RouteIcon, access: 'staff' },
  { path: '/contactos', title: 'Directorio', icon: ContactRound },
  { path: '/comunidades', title: 'Comunidades', icon: Map, access: 'staff' },
  { path: '/reportes', title: 'Reportes', icon: Activity, access: 'staff' },
  { path: '/usuarios', title: 'Usuarios y roles', icon: UserRound, access: 'admin' },
];
const isStaff = (user: User) => ['administrador','operador'].includes(user.rol);
const visible = (access: string | undefined, user: User) => !access || (access === 'staff' && isStaff(user)) || (access === 'team' && (isStaff(user) || user.rol === 'equipo')) || (access === 'admin' && user.rol === 'administrador');

function Profile({ user, update }: { user: User; update: (user: User) => void }) {
  const { submit, busy, error } = useSubmit();
  const [saved, setSaved] = useState(false);
  return <><PageTitle title="Mi perfil" /><form className="panel form-grid" onSubmit={event => {
    const name = new FormData(event.currentTarget).get('nombre');
    void submit(event, async () => {
      const result = await api.patch<User>('/auth/me', { nombre: name });
      update(result.data);
      setSaved(true);
    });
  }}><label>Nombre<input name="nombre" defaultValue={user.nombre} minLength={2} maxLength={100} required /></label>
    <label>Correo<input value={user.correo} readOnly /></label><p>Rol · {label(user.rol)}</p>
    <div className="wide">{error && <Failure message={error} />}{saved && !error && <p className="success">Perfil actualizado.</p>}<button className="button primary" disabled={busy}>Guardar</button></div></form></>;
}
type Notice = Data & { id: number; tipo: string; titulo: string; mensaje: string; emergencia_id: number | null; leida: number; creado_en: string };
function MemberApp({ user, setUser }: { user: User; setUser: (value: User | null) => void }) {
  const [menu, setMenu] = useState(false);
  const [noticeVersion, setVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [ignored, setIgnored] = useState<number[]>([]);
  const [noticeError, setNoticeError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const latest = useLoad<Page<Notice>>('/notificaciones?limit=25', noticeVersion);
  const inbox = useLoad<Page<Notice>>(location.pathname === '/notificaciones' ? '/notificaciones?page=' + page : null, noticeVersion);
  const urgent = latest.data?.data.find(item => !item.leida && item.tipo === 'alerta_critica' && !ignored.includes(item.id));
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, { auth: { token: token() } });
    const update = () => setVersion(value => value + 1);
    socket.on('notificaciones:cambio', update);
    socket.on('connect', update);
    socket.on('disconnect', async reason => {
      if (reason !== 'io server disconnect') return;
      try { await refresh(); socket.auth = { token: token() }; socket.connect(); }
      catch { window.dispatchEvent(new Event('comunidad:sesion')); }
    });
    return () => { socket.disconnect(); };
  }, [user.id]);
  async function acknowledge(item: Notice, details: boolean) {
    setNoticeError('');
    try {
      await api.patch('/notificaciones/' + item.id + '/leer');
      setIgnored(current => [...current, item.id]);
      setVersion(value => value + 1);
      if (details && item.emergencia_id) navigate('/emergencias/' + item.emergencia_id);
    } catch (error) {
      setNoticeError(errorText(error));
    }
  }
  async function logout() {
    try {
      await api.post('/auth/logout');
      setToken('');
      setUser(null);
      navigate('/');
    } catch (error) { setNoticeError(errorText(error)); }
  }
  return <div className="shell">
    <a href="#contenido" className="skip">Saltar al contenido</a>
    <aside className={menu ? 'sidebar open' : 'sidebar'} aria-label="Navegación principal">
      <NavLink to="/" className="app-brand" onClick={() => setMenu(false)}><img src={logo} alt="" width="44" height="44" /> <strong>Mi Comunidad<br />Segura</strong></NavLink>
      <nav>{nav.filter(item => visible(item.access, user)).map(({ path, title, icon: Icon }) =>
        <NavLink key={path} end={path === '/'} to={path} onClick={() => setMenu(false)}><Icon size={18} aria-hidden />{title}</NavLink>)}</nav>
      <span className="side-footer">Cochabamba, Bolivia</span>
    </aside>
    {menu && <button className="shade" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
    <div className="shell-main">
      <header className="topbar">
        <button className="icon menu-toggle" aria-label={menu ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={21} /> : <Menu size={21} />}</button>
        <NavLink to="/emergencias/nueva" className="button primary top-report"><Plus size={18} /> <span>Reportar emergencia</span></NavLink>
        <div className="top-actions">
          <NavLink to="/notificaciones" aria-label="Notificaciones" className="icon bell"><Bell size={21} />{latest.data?.data.some(item => !item.leida) && <i />}</NavLink>
          <NavLink to="/perfil" className="profile-link"><UserRound size={19} /><span>{user.nombre}</span></NavLink>
          <button className="icon" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout}><LogOut size={20} /></button>
        </div>
      </header>
      <main id="contenido" className="content" tabIndex={-1}>
        {noticeError && !urgent && <Failure message={noticeError} />}
        <Suspense fallback={<Spinner />}><Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/emergencias" element={<EmergencyList />} />
          <Route path="/emergencias/nueva" element={<IncidentEditor user={user} />} />
          <Route path="/emergencias/:id" element={<IncidentDetail user={user} />} />
          <Route path="/emergencias/:id/editar" element={isStaff(user) ? <IncidentEditor user={user} /> : <Navigate to="/emergencias" replace />} />
          <Route path="/mapa" element={<Suspense fallback={<Spinner />}><MapPage /></Suspense>} />
          {isStaff(user) && <Route path="/centro" element={<Dashboard user={user} center />} />}
          {isStaff(user) && <Route path="/reportes" element={<Reports />} />}
          {isStaff(user) && <Route path="/comunidades" element={<CommunityPage />} />}
          {user.rol === 'administrador' && <Route path="/usuarios" element={<UsersPage />} />}
          {nav.filter(item => visible(item.access, user) && ['/personas','/instituciones','/equipos','/operaciones','/recursos','/refugios','/evacuaciones','/contactos'].includes(item.path)).map(item =>
            <Route key={item.path} path={item.path} element={<ModulePage key={item.path} module={item.path.slice(1)} user={user} />} />)}
          <Route path="/perfil" element={<Profile user={user} update={setUser} />} />
          <Route path="/notificaciones" element={<>
            <PageTitle title="Notificaciones" description="Cambios en tus reportes, alertas y asignaciones." />
            {inbox.pending && <Spinner />}{inbox.error && <Failure message={inbox.error} />}
            {inbox.data && <section className="panel">
              {!inbox.data.data.length && <Empty>Por ahora no hay notificaciones.</Empty>}
              {inbox.data.data.map(item => <article className="notice" key={item.id}><div><strong>{item.titulo}</strong><p>{item.mensaje}</p><small>{localDate(item.creado_en)} · {item.leida ? 'Leída' : 'Sin leer'}</small></div>
                <div className="actions">{item.emergencia_id && <button className="button" onClick={() => void acknowledge(item, true)}>Ver detalles</button>}{!item.leida && <button className="button" onClick={() => void acknowledge(item, false)}>Marcar como leída</button>}</div>
              </article>)}
              <Pagination page={inbox.data} change={setPage} />
            </section>}
          </>} />
          <Route path="*" element={<PageTitle title="Página no disponible"><NavLink className="button" to="/">Ir al panel</NavLink></PageTitle>} />
        </Routes></Suspense>
      </main>
    </div>
    {urgent && <Dialog title="Alerta crítica verificada" close={() => void acknowledge(urgent, false)} narrow><div className="urgent"><img src={logo} alt="" width="68" height="68" /><Siren size={30} aria-hidden /><h3>{urgent.titulo}</h3><p>{urgent.mensaje}</p><small>{localDate(urgent.creado_en)}</small>{noticeError && <Failure message={noticeError} />}
      <div className="actions">{urgent.emergencia_id && <button className="button primary" onClick={() => void acknowledge(urgent, true)}>Ver detalles</button>}<button className="button" onClick={() => void acknowledge(urgent, false)}>Cerrar</button></div></div></Dialog>}
  </div>;
}
export function App() {
  const [user, setUser] = useState<User | null>();
  useEffect(() => {
    let active = true;
    const expired = () => setUser(null);
    window.addEventListener('comunidad:sesion', expired);
    refresh().then(({ usuario }) => { if (active) setUser(usuario); }).catch(() => { if (active) setUser(null); });
    return () => { active = false; window.removeEventListener('comunidad:sesion', expired); };
  }, []);
  if (user === undefined) return <Spinner />;
  return user ? <MemberApp user={user} setUser={setUser} /> : <Login onLogin={setUser} />;
}
