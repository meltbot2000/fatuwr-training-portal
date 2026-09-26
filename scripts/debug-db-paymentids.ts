import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);

  const needleSql = "(LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(email) LIKE ? OR LOWER(email) LIKE ? OR LOWER(paymentId) LIKE ? OR LOWER(paymentId) LIKE ? OR LOWER(paymentId) LIKE ?)";
  const needleArgs = ["%nurul%", "%jodie%", "%ice%", "%nurul%", "%jodie%", "%ice%", "%nurul%", "%jodie%", "%ice%"];

  console.log("\n================ `users` table (auth) — jodie/nurul/ice ================");
  const [u1] = await conn.query(
    `SELECT id, name, email, paymentId, memberStatus, createdAt FROM users WHERE ${needleSql} ORDER BY createdAt`,
    needleArgs
  );
  console.table(u1);

  console.log("\n================ `sheet_users` table — jodie/nurul/ice ================");
  const [s1] = await conn.query(
    `SELECT id, sheetId, name, email, userEmail, paymentId, memberStatus FROM sheet_users WHERE ${needleSql} ORDER BY id`,
    needleArgs
  );
  console.table(s1);

  console.log("\n================ `users`: 15 most recent by createdAt ================");
  const [u2] = await conn.query(
    `SELECT id, name, email, paymentId, createdAt FROM users ORDER BY createdAt DESC LIMIT 15`
  );
  console.table(u2);

  console.log("\n================ `users`: rows with EMPTY/NULL paymentId ================");
  const [u3] = await conn.query(
    `SELECT id, name, email, paymentId, createdAt FROM users WHERE paymentId IS NULL OR paymentId = '' ORDER BY createdAt DESC`
  );
  console.table(u3);

  console.log("\n================ `sheet_users`: rows with EMPTY/NULL paymentId ================");
  const [s3] = await conn.query(
    `SELECT id, name, email, paymentId FROM sheet_users WHERE paymentId IS NULL OR paymentId = '' ORDER BY id DESC`
  );
  console.table(s3);

  console.log("\n================ DUPLICATE paymentId in `users` (count>1) ================");
  const [u4] = await conn.query(
    `SELECT LOWER(TRIM(paymentId)) AS pid, COUNT(*) AS n, GROUP_CONCAT(name SEPARATOR ' | ') AS who
     FROM users WHERE paymentId IS NOT NULL AND paymentId <> ''
     GROUP BY LOWER(TRIM(paymentId)) HAVING n > 1 ORDER BY n DESC`
  );
  console.table(u4);

  console.log("\n================ DUPLICATE paymentId in `sheet_users` (count>1) ================");
  const [s4] = await conn.query(
    `SELECT LOWER(TRIM(paymentId)) AS pid, COUNT(*) AS n, GROUP_CONCAT(name SEPARATOR ' | ') AS who
     FROM sheet_users WHERE paymentId IS NOT NULL AND paymentId <> ''
     GROUP BY LOWER(TRIM(paymentId)) HAVING n > 1 ORDER BY n DESC`
  );
  console.table(s4);

  console.log("\n================ counts ================");
  const [c1] = await conn.query(`SELECT COUNT(*) AS users_total FROM users`);
  const [c2] = await conn.query(`SELECT COUNT(*) AS sheet_users_total FROM sheet_users`);
  console.log(c1, c2);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
