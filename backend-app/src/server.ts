import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { load } from './db';
import { router } from './routes';

const PORT = Number(process.env.PORT ?? 8080);

/** Unset means any origin, which is only correct locally. Set to the deployed
 *  frontend URL (comma-separated for several) in production. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const corsOptions = ALLOWED_ORIGIN
  ? { origin: ALLOWED_ORIGIN.split(',').map((o) => o.trim()) }
  : {};

export const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', router);

// Same JSON envelope as every other error, so the client never parses HTML.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// Logged in full, but the response stays generic so stack traces and file paths
// never leave the process.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL' } });
});

// Load before listening so a missing or malformed data.json fails at boot rather
// than on the first request.
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
