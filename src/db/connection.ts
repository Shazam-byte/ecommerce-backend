import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

console.log("DB_CONNECTION: Initializing MySQL Connection Pool...");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ecommerce",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  insertId?: number;
}

/**
 * Generic Raw SQL Query executor for MySQL
 */
export async function query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  // Translate Postgres placeholders `$1, $2` to MySQL `?`
  let mysqlText = text.replace(/\$(\d+)/g, "?");

  // Translate ILIKE to case-insensitive LIKE (MySQL is case-insensitive by default with standard collations)
  if (mysqlText.includes("ILIKE")) {
    mysqlText = mysqlText.replace(/ILIKE/gi, "LIKE");
  }

  try {
    const [result] = await pool.query(mysqlText, params);
    
    let rows: T[] = [];
    let rowCount = 0;
    let insertId: number | undefined;

    if (Array.isArray(result)) {
      rows = result as T[];
      rowCount = rows.length;
    } else if (result) {
      rowCount = (result as any).affectedRows || 0;
      insertId = (result as any).insertId;
    }

    return {
      rows,
      rowCount,
      insertId,
    };
  } catch (err: any) {
    console.error("MYSQL_QUERY_ERROR:", err.message, "SQL:", mysqlText, "PARAMS:", params);
    throw err;
  }
}

/**
 * Close database connections gracefully
 */
export async function close(): Promise<void> {
  console.log("DB_CONNECTION: Closing MySQL connection pool...");
  await pool.end();
  console.log("DB_CONNECTION: MySQL connection pool closed.");
}
