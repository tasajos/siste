import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import { password } from './auth.js';
import { pool, run } from './db.js';

try {
  const correo = z.email().parse(process.argv[2]).toLowerCase();
  const nombre = z.string().trim().min(2).max(100).parse(process.argv[3] ?? 'Administración');
  const input = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  if (process.stdin.isTTY) console.log('Escribe la contraseña (10 a 72 bytes) y pulsa Enter.');
  const [line] = await input[Symbol.asyncIterator]().next().then(result => [result.value]);
  input.close();
  const clave = password.parse(line);
  await run('INSERT INTO usuarios (nombre,correo,password_hash,rol) VALUES (?,?,?,?)', [nombre, correo, await bcrypt.hash(clave, 12), 'administrador']);
  console.log('Cuenta de administrador creada.');
} catch {
  console.error('No se pudo crear la cuenta. Comprueba los datos, la base de datos y si el correo ya existe.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
