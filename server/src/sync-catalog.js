import { query, pool } from './db.js'
import { catalogAdditions, bmwAdditionalImages } from '../../shared/catalog-additions.mjs'

// Insert missing products only. Never overwrite prices, texts or deactivate rows.
try {
  for (const p of catalogAdditions) {
    await query(`INSERT INTO products (slug,name_ar,name_en,name_he,description_ar,description_en,description_he,category,price,images,model_parts,customizable_parts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE slug=slug`,
    [p.slug,p.name_ar,p.name_en,p.name_he,p.description_ar,p.description_en,p.description_he,p.category,p.price,JSON.stringify(p.images),JSON.stringify(p.model_parts),JSON.stringify(p.customizable_parts)])
  }
  const [bmw] = await query('SELECT id,images FROM products WHERE slug=?',['bmw-m3-cs'])
  if (bmw) {
    const previous = typeof bmw.images === 'string' ? JSON.parse(bmw.images) : bmw.images
    await query('UPDATE products SET images=? WHERE id=?',[JSON.stringify([...new Set([...previous,...bmwAdditionalImages])]),bmw.id])
  }
  console.log('Catalogue additions synchronized without replacing existing data.')
} finally { await pool.end() }
