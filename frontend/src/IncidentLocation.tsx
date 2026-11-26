import { lazy, Suspense, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { LatLngTuple } from 'leaflet';
import type { Field } from './Fields';
import { Spinner } from './ui';

const LocationMap = lazy(() => import('./LocationMap'));
export const coordinateFields: Field[] = [
  { key: 'latitud', name: 'Latitud', type: 'number', optional: true, min: -90, max: 90, step: 'any' },
  { key: 'longitud', name: 'Longitud', type: 'number', optional: true, min: -180, max: 180, step: 'any' },
];

function asPosition(latitude: string, longitude: string): LatLngTuple | null {
  if (!latitude || !longitude) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

function locationError(code: number) {
  if (code === 1) return 'El navegador bloqueó el permiso de ubicación. Actívalo para este sitio o marca el punto en el mapa.';
  if (code === 3) return 'Se agotó el tiempo para obtener tu ubicación. Intenta de nuevo o marca el punto en el mapa.';
  return 'El dispositivo no pudo determinar su ubicación. Puedes marcar el punto en el mapa.';
}

export function IncidentLocation({ initial }: { initial?: { latitud: number | null; longitud: number | null } }) {
  const [values, setValues] = useState({
    latitud: String(initial?.latitud ?? ''),
    longitud: String(initial?.longitud ?? ''),
  });
  const [focus, setFocus] = useState<LatLngTuple | null>(null);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const manualEdit = useRef(false);
  const position = asPosition(values.latitud, values.longitud);
  const secure = window.isSecureContext;
  const canLocate = secure && Boolean(navigator.geolocation);
  const localAppUrl = import.meta.env.VITE_LOCAL_APP_URL?.replace(/\/+$/, '');
  const localForm = localAppUrl ? localAppUrl + window.location.pathname + window.location.search : '';

  function cancelPendingLocation() {
    locationRequest.current++;
    setLocating(false);
  }

  function choosePoint(latitude: number, longitude: number, moveMap = false) {
    cancelPendingLocation();
    const point: LatLngTuple = [Number(latitude.toFixed(6)), Number(longitude.toFixed(6))];
    setValues({ latitud: String(point[0]), longitud: String(point[1]) });
    setMessage('Coordenadas añadidas al formulario.');
    if (moveMap) setFocus(point);
  }

  function locate() {
    const request = ++locationRequest.current;
    setLocating(true);
    setMessage('Obteniendo la ubicación del dispositivo…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (locationRequest.current === request) choosePoint(coords.latitude, coords.longitude, true);
    }, ({ code }) => {
      if (locationRequest.current !== request) return;
      setLocating(false);
      setMessage(locationError(code));
    }, { timeout: 12000, maximumAge: 30000 });
  }

  return <fieldset className="wide incident-location">
    <legend>Ubicación del incidente</legend>
    <p className="location-help">Marca un punto en el mapa o arrastra el marcador para ajustar las coordenadas.</p>
    <Suspense fallback={<Spinner />}>
      <LocationMap position={position} focus={focus} onSelect={choosePoint} />
    </Suspense>
    <div className="form-grid">
      {coordinateFields.map(field => {
        const key = field.key as keyof typeof values;
        return <label key={key}>{field.name}
          <input name={key} type="number" min={field.min} max={field.max} step={field.step} value={values[key]}
            required={Boolean(values[key === 'latitud' ? 'longitud' : 'latitud'])}
            onBlur={() => {
              if (manualEdit.current && position) setFocus(position);
              manualEdit.current = false;
            }}
            onChange={event => {
              cancelPendingLocation();
              manualEdit.current = true;
              setValues({ ...values, [key]: event.target.value });
              setMessage('');
            }}
          />
        </label>;
      })}
    </div>
    <div className="actions">
      {canLocate && <button className="button" type="button" onClick={locate} disabled={locating}><MapPin size={17} aria-hidden />Usar mi ubicación</button>}
      {!secure && localForm && <a className="button" href={localForm} target="_blank" rel="noopener noreferrer"><MapPin size={17} aria-hidden />Usar mi ubicación desde localhost</a>}
      {(values.latitud || values.longitud) && <button className="button" type="button" onClick={() => {
        cancelPendingLocation();
        setValues({ latitud: '', longitud: '' });
        setMessage('Coordenadas eliminadas del formulario.');
      }}>Quitar coordenadas</button>}
    </div>
    {!secure && <p className="location-help">La ubicación del dispositivo requiere HTTPS o localhost. Puedes marcar el punto en este mapa.</p>}
    {secure && !canLocate && <p className="location-help">El navegador no ofrece geolocalización. Puedes marcar el punto en el mapa.</p>}
    {message && <p className="location-help" role="status">{message}</p>}
  </fieldset>;
}
