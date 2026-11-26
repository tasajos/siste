import { createServer } from 'node:http';
import { app } from './app.js';
import { env, pool } from './db.js';
import { attachSockets } from './notifications.js';

const server = createServer(app);
const io = attachSockets(server);
server.listen(env.PORT, env.HOST, () => console.log('Mi Comunidad Segura · ' + env.HOST + ':' + env.PORT));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  io.close(async () => { await pool.end(); });
});
