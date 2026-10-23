import mysql from "mysql2/promise";

// Pre-4.1 password hashing, used when an old MySQL server asks the client to
// fall back to its legacy authentication (empty plugin name).
const hash323 = (text) => {
  let nr = 1345345333;
  let nr2 = 0x12345671;
  let add = 7;
  for (const c of text) {
    if (c === 32 || c === 9) continue;
    nr = (nr ^ (Math.imul((nr & 63) + add, c) + (nr << 8))) >>> 0;
    nr2 = (nr2 + ((nr2 << 8) ^ nr)) >>> 0;
    add += c;
  }
  return [nr & 0x7fffffff, nr2 & 0x7fffffff];
};

const scramble323 = (scramble, password) => {
  if (!password) return Buffer.from([0]);
  const max = 0x3fffffff;
  const [p1, p2] = hash323(Buffer.from(password));
  const [m1, m2] = hash323(scramble.subarray(0, 8));
  let seed1 = (p1 ^ m1) % max;
  let seed2 = (p2 ^ m2) % max;
  const rnd = () => {
    seed1 = (seed1 * 3 + seed2) % max;
    seed2 = (seed1 + seed2 + 33) % max;
    return seed1 / max;
  };
  const out = Buffer.alloc(9);
  for (let i = 0; i < 8; i++) out[i] = Math.floor(rnd() * 31) + 64;
  const extra = Math.floor(rnd() * 31);
  for (let i = 0; i < 8; i++) out[i] ^= extra;
  return out;
};

const oldPasswordPlugin =
  ({ connection, command }) =>
  () =>
    scramble323(command.handshake.authPluginData1, connection.config.password);

export const connect = (user, password, database) =>
  mysql.createConnection({
    host: "127.0.0.1",
    user,
    password,
    database,
    authPlugins: {
      "": oldPasswordPlugin,
      mysql_old_password: oldPasswordPlugin,
    },
  });

export const query = async (connection, sql, params = []) => {
  const [result] = await connection.query(sql, params);
  return result;
};
