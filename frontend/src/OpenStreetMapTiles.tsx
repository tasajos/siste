import { createElementObject, createTileLayerComponent, withPane, type LayerProps } from '@react-leaflet/core';
import { GridLayer, type Coords, type DoneCallback, type GridLayerOptions, type TileEvent } from 'leaflet';

async function loadTile(tile: HTMLImageElement, { x, y, z }: Coords, signal: AbortSignal) {
  const response = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
    signal, referrerPolicy: 'strict-origin-when-cross-origin',
  });
  if (!response.ok) throw new Error(`OpenStreetMap devolvió HTTP ${response.status}.`);

  const imageUrl = URL.createObjectURL(await response.blob());
  try {
    tile.src = imageUrl;
    await tile.decode();
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

class OpenStreetMapGrid extends GridLayer {
  private readonly requests = new WeakMap<HTMLElement, AbortController>();

  constructor(options: GridLayerOptions) {
    super(options);
    this.on('tileunload', ({ tile }: TileEvent) => {
      this.requests.get(tile)?.abort();
      this.requests.delete(tile);
    });
  }

  createTile(coords: Coords, done: DoneCallback) {
    const tile = document.createElement('img');
    tile.alt = '';
    const controller = new AbortController();
    this.requests.set(tile, controller);
    const timeout = window.setTimeout(() => controller.abort(new Error('Tiempo de espera del mapa agotado.')), 8000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      if (this.requests.delete(tile)) done(error, tile);
    };

    void loadTile(tile, coords, controller.signal).then(() => finish(), error => finish(error));
    return tile;
  }
}

export const OpenStreetMapTiles = createTileLayerComponent<OpenStreetMapGrid, LayerProps>(
  ({ eventHandlers: _eventHandlers, ...options }, context) => createElementObject(new OpenStreetMapGrid(withPane({
    ...options,
    maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }, context)), context),
);
