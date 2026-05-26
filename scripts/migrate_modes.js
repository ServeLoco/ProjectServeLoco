const { pool } = require('../Backend-V1/src/db/mysql');
const fs = require('fs');

async function migrate() {
  console.log("Starting Migration...");

  // 1. Migrate Combos
  const [combos] = await pool.query('SELECT id, name FROM combos WHERE deleted = 0');
  for (const combo of combos) {
    const [items] = await pool.query(`
      SELECT p.category_id, c.type as category_type
      FROM combo_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ci.combo_id = ?
    `, [combo.id]);

    let packedCount = 0;
    let fastFoodCount = 0;

    for (const item of items) {
      if (item.category_type === 'packed') packedCount++;
      if (item.category_type === 'fast_food') fastFoodCount++;
    }

    let mode = 'packed'; // Default
    if (fastFoodCount > 0 && packedCount === 0) mode = 'fast_food';
    if (fastFoodCount > 0 && packedCount > 0) {
      console.log(`WARNING: Combo "${combo.name}" has mixed products. Defaulting to packed. Needs manual fix.`);
    }

    await pool.query('UPDATE combos SET store_type = ? WHERE id = ?', [mode, combo.id]);
  }
  console.log("Combos migrated.");

  // 2. Migrate Offers
  await pool.query('UPDATE offers SET store_type = "packed" WHERE store_type = "all" OR store_type IS NULL');
  console.log("Offers migrated.");

  // 3. Migrate Dashboard Sections
  const [sections] = await pool.query('SELECT * FROM dashboard_sections WHERE store_type = "all" AND deleted_at IS NULL');
  for (const section of sections) {
    console.log(`Duplicating legacy "all" section: ${section.title}`);
    
    // Convert current to packed
    await pool.query('UPDATE dashboard_sections SET store_type = "packed" WHERE id = ?', [section.id]);
    
    // Duplicate to fast_food
    const [res] = await pool.query(`
      INSERT INTO dashboard_sections (
        title, slug, section_type, store_type, active, display_order, 
        max_visible_items, show_see_all, linked_category_id, linked_offer_id, starts_at, ends_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      section.title,
      section.slug, // Unique constraint is (slug, store_type, deleted_at) so this is allowed
      section.section_type,
      'fast_food',
      section.active,
      section.display_order,
      section.max_visible_items,
      section.show_see_all,
      section.linked_category_id,
      section.linked_offer_id,
      section.starts_at,
      section.ends_at
    ]);

    // Duplicate section items
    const [items] = await pool.query('SELECT * FROM dashboard_section_items WHERE section_id = ? AND deleted_at IS NULL', [section.id]);
    for (const item of items) {
      let valid = true;
      if (item.item_type === 'product') {
        const [prod] = await pool.query('SELECT c.type FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [item.item_id]);
        if (prod.length > 0 && prod[0].type !== 'fast_food') valid = false;
      }
      if (item.item_type === 'category') {
        const [cat] = await pool.query('SELECT type FROM categories WHERE id = ?', [item.item_id]);
        if (cat.length > 0 && cat[0].type !== 'fast_food') valid = false;
      }
      if (item.item_type === 'combo') {
        const [cmb] = await pool.query('SELECT store_type FROM combos WHERE id = ?', [item.item_id]);
        if (cmb.length > 0 && cmb[0].store_type !== 'fast_food') valid = false;
      }

      if (valid) {
        await pool.query(`
          INSERT INTO dashboard_section_items (section_id, item_type, item_id, display_order, active, starts_at, ends_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [res.insertId, item.item_type, item.item_id, item.display_order, item.active, item.starts_at, item.ends_at]);
      }
    }
  }
  console.log("Dashboard sections migrated.");

  console.log("Migration Complete.");
  process.exit(0);
}

migrate().catch(console.error);
