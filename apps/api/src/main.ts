import fs from 'fs';
import path from 'path';
import { config as loadDotenv } from 'dotenv';
import { startServer } from './shared/http/server';

const cwdEnv = path.resolve(process.cwd(), '.env');
const rootEnv = path.resolve(process.cwd(), '..', '..', '.env');
loadDotenv({ path: fs.existsSync(cwdEnv) ? cwdEnv : rootEnv });

startServer();
