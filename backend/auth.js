import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add your Neon connection string to backend/.env');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// The browser reaches /api/auth through the frontend's own domain (Vite proxy in dev,
// Vercel rewrite in production), so BETTER_AUTH_URL is the *frontend* URL. That keeps
// auth cookies first-party and makes Google's redirect land on the frontend domain.
const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:5173';

const extraOrigins = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions = {
  database: pool,
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [baseURL, ...extraOrigins],
  user: {
    deleteUser: {
      enabled: true,
      // player_stats also cascades on the FK; this keeps deletion explicit
      beforeDelete: async (user) => {
        await pool.query('DELETE FROM player_stats WHERE user_id = $1', [user.id]);
      }
    }
  },
  // Lets the game socket (which connects straight to the backend, without the
  // frontend-domain cookies) prove who it is with the session token
  plugins: [bearer()],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET
        }
      }
    : {}
};

export const auth = betterAuth(authOptions);
