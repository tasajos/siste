import 'dotenv/config';
import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

export const env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().default('127.0.0.1'), DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().regex(/^\w+$/).default('mi_comunidad_segura'), DB_USER: z.string().default('comunidad_app'),
  DB_PASSWORD: z.string().min(1), JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  SECURE_COOKIES: z.enum(['true', 'false']).default('false'),
}).parse(process.env);
export const origins = env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean);
export const pool = mysql.createPool({
  host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER,
  password: env.DB_PASSWORD, charset: 'utf8mb4', connectionLimit: 10,
  decimalNumbers: true, dateStrings: true, timezone: 'Z',
});
type Database = typeof pool | PoolConnection;
type Params = (string | number | boolean | Buffer | null)[];
export type Row = RowDataPacket & Record<string, unknown>;
export async function rows<T extends Row = Row>(sql: string, params: Params = [], db: Database = pool) {
  return (await db.execute<T[]>(sql, params))[0];
}
export async function run(sql: string, params: Params = [], db: Database = pool) {
  return (await db.execute<ResultSetHeader>(sql, params))[0];
}
export async function transaction<T>(work: (db: PoolConnection) => Promise<T>) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
export async function audit(db: PoolConnection, actor: number, entity: string, id: number, action: string) {
  await run('INSERT INTO auditorias (usuario_id,entidad,registro_id,accion) VALUES (?,?,?,?)', [actor, entity, id, action], db);
}
