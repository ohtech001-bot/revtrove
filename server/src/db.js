import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(projectRoot, '.env') })

export const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'revtrove',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  charset: 'utf8mb4',
}

export const pool = mysql.createPool(dbConfig)

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params)
  return rows
}
