import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { api, setToken, type User } from './api';
import { Failure, logo, useSubmit } from './ui';

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState('');
  const [correo, setEmail] = useState('');
  const [clave, setPassword] = useState('');
  const { busy, error, submit } = useSubmit();
  function switchMode(next: boolean) {
    setRegister(next);
    setPassword('');
    setVisible(false);
    setNotice('');
  }

  return <main className="auth-page">
    <div className="auth-layout">
      <section className="brand-panel" aria-label="Mi Comunidad Segura">
        <div className="brand-location"><MapPin size={16} aria-hidden /> Cochabamba, Bolivia</div>
        <div className="brand-art"><img src={logo} alt="Mi Comunidad Segura. Juntos, estamos más protegidos." width="547" height="530" /></div>
        <div className="brand-footer"><span className="flag" aria-hidden /><span>Plataforma de emergencias comunitarias</span></div>
      </section>
      <section className="auth-content">
        <div className="auth-card">
          <div className="auth-symbol"><ShieldCheck size={27} aria-hidden /></div>
          <h1>{register ? 'Crea tu cuenta' : 'Inicia sesión'}</h1>
          <p className="auth-intro">{register ? 'Regístrate para reportar emergencias y recibir alertas verificadas.' : 'Ingresa a tu cuenta para reportar emergencias y consultar alertas de tu comunidad.'}</p>
          <form className="auth-form" onSubmit={event => {
            const fields = new FormData(event.currentTarget);
            void submit(event, async () => {
              if (register) {
                await api.post('/auth/register', { nombre: fields.get('nombre'), correo: correo.trim(), clave });
                switchMode(false);
                setNotice('Tu cuenta está lista. Ya puedes iniciar sesión.');
              } else {
                const { data } = await api.post('/auth/login', { correo: correo.trim(), clave });
                setToken(data.token);
                onLogin(data.usuario);
              }
            });
          }}>
            {register && <label htmlFor="nombre">Nombre completo<span className="input-icon"><UserRound size={18} aria-hidden /><input id="nombre" name="nombre" autoComplete="name" placeholder="Tu nombre" minLength={2} maxLength={100} required /></span></label>}
            <label htmlFor="correo">Correo electrónico<span className="input-icon"><Mail size={18} aria-hidden /><input id="correo" type="email" autoComplete="email" placeholder="nombre@ejemplo.com" value={correo} onChange={event => setEmail(event.target.value)} maxLength={254} required /></span></label>
            <label htmlFor="clave">Contraseña<span className="input-icon"><LockKeyhole size={18} aria-hidden /><input id="clave" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'Mínimo 10 caracteres' : 'Tu contraseña'} value={clave} onChange={event => setPassword(event.target.value)} minLength={register ? 10 : undefined} maxLength={72} required /><button type="button" className="reveal" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
            {notice && <p className="success" role="status">{notice}</p>}
            {error && <Failure message={error} />}
            <button className="button primary auth-action" disabled={busy}>{busy ? 'Procesando…' : register ? 'Crear cuenta' : 'Ingresar'}<ArrowRight size={19} aria-hidden /></button>
          </form>
          <div className="auth-switch">{register ? <button className="text-button" onClick={() => switchMode(false)}><ArrowLeft size={16} /> Volver a iniciar sesión</button> : <><span>¿Primera vez aquí?</span> <button className="text-button" onClick={() => switchMode(true)}>Crea tu cuenta</button></>}</div>
        </div>
        <p className="auth-note"><ShieldCheck size={17} aria-hidden /> Proyecto académico de apoyo comunitario. Para una emergencia inmediata, contacta a los servicios oficiales.</p>
      </section>
    </div>
  </main>;
}
