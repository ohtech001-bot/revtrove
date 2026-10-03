import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import 'dotenv/config'
import { dbConfig } from './db.js'

const database = (process.env.MYSQL_DATABASE || 'revtrove').replace(/[^a-zA-Z0-9_]/g, '')
let connection
try {
  connection = await mysql.createConnection(dbConfig)
} catch (error) {
  if (error.code !== 'ER_BAD_DB_ERROR') throw error
  connection = await mysql.createConnection({ ...dbConfig, database: undefined })
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await connection.query(`USE \`${database}\``)
}
await connection.query(`CREATE TABLE IF NOT EXISTS admin_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB`)
await connection.query(`CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name_ar VARCHAR(190) NOT NULL,
  name_en VARCHAR(190) NOT NULL,
  name_he VARCHAR(190) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  description_he TEXT,
  category VARCHAR(80) NOT NULL DEFAULT 'wheel',
  price DECIMAL(10,2) NULL,
  images JSON NOT NULL,
  model_parts JSON NOT NULL,
  customizable_parts JSON NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_active (active), INDEX idx_products_category (category)
) ENGINE=InnoDB`)
await connection.query(`CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(32) NOT NULL UNIQUE,
  type ENUM('standard','custom') NOT NULL DEFAULT 'standard',
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  country_code VARCHAR(8) NOT NULL,
  country VARCHAR(100) NOT NULL,
  delivery_address VARCHAR(500) NOT NULL,
  notes TEXT,
  details JSON NOT NULL,
  reference_image VARCHAR(500) NULL,
  status ENUM('new','contacted','quoted','in_production','ready','awaiting_pickup','archived','completed','cancelled') NOT NULL DEFAULT 'new',
  quoted_price DECIMAL(10,2) NULL,
  production_eta VARCHAR(120) NULL,
  print_status ENUM('pending','queued','printed','failed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_status_created (status, created_at), INDEX idx_orders_phone (phone)
) ENGINE=InnoDB`)
await connection.query("ALTER TABLE orders MODIFY status ENUM('new','contacted','quoted','in_production','ready','awaiting_pickup','archived','completed','cancelled') NOT NULL DEFAULT 'new'")

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@revtrove.local').toLowerCase()
const [existingAdmins]=await connection.execute('SELECT id FROM admin_users WHERE email=? LIMIT 1',[adminEmail])
if(!existingAdmins.length){
  const initialPassword=process.env.ADMIN_PASSWORD
  if(!initialPassword||initialPassword.length<12||Buffer.byteLength(initialPassword,'utf8')>72)throw new Error('Set ADMIN_PASSWORD explicitly: at least 12 characters, at most 72 UTF-8 bytes.')
  const hash=await bcrypt.hash(initialPassword,12)
  await connection.execute('INSERT INTO admin_users (email,password_hash) VALUES (?,?)',[adminEmail,hash])
}

const products = [
  ['bmw-m3-cs','BMW M3 CS Wheel','BMW M3 CS Wheel','גלגל BMW M3 CS',129,'/assets/bmw/4e141d69-0cc6-47e3-84bb-5343aa265525.jpg','/models/bmw-rim.glb'],
  ['dodge-srt','Dodge SRT Wheel','Dodge SRT Wheel','גלגל Dodge SRT',119,'/assets/srt/76f7ea82-6eac-451c-9653-f3f16a770a6f.jpg','/models/srt-rim.glb'],
  ['porsche-gt3rs','Porsche GT3 RS Wheel','Porsche GT3 RS Wheel','גלגל Porsche GT3 RS',139,'/assets/porsche/24d3d0f8-fbef-474a-9fbb-845b245b9690.jpg','/models/bmw-rim.glb']
]
for (const [slug, ar, en, he, price, image, rim] of products) {
  const models = JSON.stringify({ rim, disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb' })
  const parts = JSON.stringify(['rim','disc','caliper','stand'])
  await connection.execute(`INSERT INTO products (slug,name_ar,name_en,name_he,description_ar,description_en,description_he,price,images,model_parts,customizable_parts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE slug=slug`, [slug,ar,en,he,'مجسم فاخر مطبوع ثلاثي الأبعاد ومصقول يدويًا.','A premium 3D-printed, hand-finished automotive model.','דגם רכב איכותי בהדפסת תלת־ממד ובגימור ידני.',price,JSON.stringify([image]),models,parts])
}
await connection.execute(`INSERT INTO products (slug,name_ar,name_en,name_he,description_ar,description_en,description_he,category,price,images,model_parts,customizable_parts)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE category=VALUES(category), images=VALUES(images), customizable_parts=VALUES(customizable_parts)`, [
  'bmw-m-turbo','مجسم تيربو BMW M','BMW M Turbo Display','דגם טורבו BMW M',
  'مجسم تيربو مطبوع ثلاثي الأبعاد مع فلتر ومروحة وقاعدة قابلة لتخصيص الألوان والنص.',
  'A detailed 3D-printed turbo display with customizable filter, fan, body and stand.',
  'דגם טורבו מודפס בתלת־ממד עם פילטר, מאוורר ומעמד בהתאמה אישית.',
  'turbo',149,
  JSON.stringify(['/assets/turbo/turbo-5.jpg','/assets/turbo/turbo-1.jpg','/assets/turbo/turbo-2.jpg','/assets/turbo/turbo-3.jpg','/assets/turbo/turbo-4.jpg']),
  JSON.stringify({}),JSON.stringify(['airFilter','turboBody','fan','stand'])
])
await connection.end()
console.log('Revtrove database initialized successfully.')

