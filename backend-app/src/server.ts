import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { load } from './db';
import { router } from './routes';

const PORT = Number(process.env.PORT ?? 8080);

/**
 * Wide-open CORS is fine locally but wrong in production. Set ALLOWED_ORIGIN to
 * the deployed frontend URL (comma-separated for more than one) to lock it down;
 * leaving it unset keeps the permissive behaviour local development needs.
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const corsOptions = ALLOWED_ORIGIN
  ? { origin: ALLOWED_ORIGIN.split(',').map((o) => o.trim()) }
  : {};

export const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', router);

// Anything that is not a known route gets the same JSON error envelope as
// everything else, so the client never has to parse an HTML error page.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// Final safety net. Errors are logged in full server-side but the response stays
// generic, so internal detail (file paths, stack traces) never leaves the process.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL' } });
});

// Load the data before accepting traffic: if data.json is missing or malformed we
// want to fail loudly at boot, not on a user's first request.
load()
  .then((store) => {
    app.listen(PORT, () => {
      console.log(
        `Server running on port ${PORT} (${store.recipes.length} recipes, ` +
          `${store.ingredients.length} ingredients, ` +
          `CORS: ${ALLOWED_ORIGIN ?? 'any origin'})`,
      );
    });
  })
  .catch((err: unknown) => {
    console.error('[api] failed to load database:', err);
    process.exit(1);
  });
