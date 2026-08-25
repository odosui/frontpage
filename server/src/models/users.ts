import crypto from "crypto";
import { query } from "../db/pool";

/**
 * An account. There is no sign-up and no profile: a user is an email, a
 * password to check it against, and nothing else the app reads.
 */
export type User = {
  id: number;
  email: string;
  createdAt: string;
};

type Row = {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
};

const SELECT = `select id, email, password_hash, created_at from users`;

function toUser(row: Row): User {
  return {
    id: Number(row.id),
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function get(id: number): Promise<User | null> {
  const { rows } = await query<Row>(`${SELECT} where id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function all(): Promise<User[]> {
  const { rows } = await query<Row>(`${SELECT} order by id`);
  return rows.map(toUser);
}

/**
 * The account and the hash to check against, together: a login needs both, and
 * the hash must not leak into anything that answers a request.
 */
export async function byEmailWithHash(
  email: string,
): Promise<{ user: User; passwordHash: string } | null> {
  const { rows } = await query<Row>(`${SELECT} where email = $1`, [
    normalizeEmail(email),
  ]);
  const row = rows[0];
  return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
}

export async function create(email: string, password: string): Promise<User> {
  const { rows } = await query<Row>(
    `insert into users (email, password_hash) values ($1, $2) returning id, email, password_hash, created_at`,
    [normalizeEmail(email), hashPassword(password)],
  );
  return toUser(rows[0]!);
}

export async function setPassword(id: number, password: string) {
  await query(`update users set password_hash = $1 where id = $2`, [
    hashPassword(password),
    id,
  ]);
}

export async function remove(id: number) {
  await query(`delete from users where id = $1`, [id]);
}

// ===============
// PASSWORDS
// ===============

const KEY_LENGTH = 64;
// the cost is stored with the hash, so raising it later leaves old hashes valid
const SCRYPT_COST = 16384;

/** `scrypt$<cost>$<salt hex>$<key hex>` — everything a check needs. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST });
  return `scrypt$${SCRYPT_COST}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, cost, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !key) return false;

  const expected = Buffer.from(key, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "hex"), expected.length, {
    N: Number(cost),
  });
  // lengths match by construction, but timingSafeEqual throws if they ever do not
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
