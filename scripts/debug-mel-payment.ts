import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL as string);

  console.log("=== Latest 8 payment rows (by id) ===");
  const [latest] = await c.query(
    `SELECT id, rowIndex, paymentId, email, reference, amount, date, syncedAt
     FROM sheet_payments ORDER BY id DESC LIMIT 8`);
  console.table(latest);

  console.log("\n=== Rows where reference = 'mel' (exact, lowercased) ===");
  const [mel] = await c.query(
    `SELECT id, rowIndex, paymentId, email, reference, amount, date
     FROM sheet_payments WHERE LOWER(TRIM(reference))='mel' ORDER BY id DESC LIMIT 10`);
  console.table(mel);

  console.log("\n=== What the resolver (B1) WOULD return for ref='mel' ===");
  const [su] = await c.query(
    `SELECT id, paymentId, email, userEmail, name FROM sheet_users WHERE LOWER(TRIM(paymentId))='mel'`);
  console.log("sheet_users match:", su);
  const [u] = await c.query(
    `SELECT id, paymentId, email, name FROM users WHERE LOWER(TRIM(paymentId))='mel'`);
  console.log("users match:", u);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
