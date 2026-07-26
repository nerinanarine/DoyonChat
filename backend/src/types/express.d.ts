import 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      auth?: { oid?: string };
    }
  }
}
