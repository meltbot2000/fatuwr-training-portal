import "dotenv/config";
import mysql from "mysql2/promise";
async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL as string);
  const [r] = await c.query(
    `SELECT id, rowIndex, paymentId, email, reference, amount, date FROM sheet_payments
     WHERE LOWER(reference) LIKE '%nurul%' OR LOWER(reference) LIKE '%jodie%' OR LOWER(reference) LIKE '%heo%'
        OR LOWER(reference) LIKE '%ice%' ORDER BY id`);
  console.table(r);
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
