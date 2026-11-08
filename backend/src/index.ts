import { createApp } from './app.js';
import { defaultDbPath, openDb } from './db.js';

const db = openDb(defaultDbPath);
const app = createApp({ db, now: () => new Date() });
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`API de reservas de pádel escuchando en http://localhost:${port}`);
});
