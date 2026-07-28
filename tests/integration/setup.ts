import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { requireDisposableTestDatabase } from "./database-guard";

process.env.DATABASE_URL = requireDisposableTestDatabase();
