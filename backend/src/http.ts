import type { RequestHandler } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireFound<T>(record: T | undefined): T {
  if (!record) throw new HttpError(404, 'No encontramos el registro.');
  return record;
}
export const id = z.coerce.number().int().positive().max(4294967295);
export const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
export const date = z.iso.date();
export const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString().slice(0, 19).replace('T', ' '));
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});
export function pageResult<T>(data: T[], page: number, limit: number, total: number) {
  return { data, page, limit, total };
}
export const noCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
