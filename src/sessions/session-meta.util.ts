import type { Request } from 'express';
import { SessionMeta } from './sessions.service';

/** Extrai IP e User-Agent crus de uma request, para registrar em Session. */
export function sessionMetaFrom(req: Request): SessionMeta {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}
