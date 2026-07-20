import { query } from "./connection.js";
import bcrypt from "bcrypt";

/**
 * Runs the MySQL database migrations sequentially and logs success/failure for each table.
 * It also seeds the initial admin user if not already present.
 */
export async function runMySQLMigrations() {
  console.log("MIGRATE_JS: Starting MySQL database migrations sequentially...");

  // 1. Create Users Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'users' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'users' table:", err.message);
    throw err;
  }

  // 2. Create Categories Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'categories' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'categories' table:", err.message);
    throw err;
  }

  // 3. Create Products Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INT DEFAULT 0 NOT NULL,
        images TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'products' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'products' table:", err.message);
    throw err;
  }

  // 4. Create Cart Items Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_product UNIQUE (user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'cart_items' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'cart_items' table:", err.message);
    throw err;
  }

  // 5. Create Orders Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        order_number VARCHAR(100) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        shipping_address TEXT NOT NULL,
        payment_status VARCHAR(50) NOT NULL DEFAULT 'paid',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'orders' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'orders' table:", err.message);
    throw err;
  }

  // 6. Create Order Items Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT,
        product_name VARCHAR(255) NOT NULL,
        product_price DECIMAL(10,2) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'order_items' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'order_items' table:", err.message);
    throw err;
  }

  // 7. Create Reviews Table
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        rating INT NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_product_review UNIQUE (user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("MIGRATE_JS: [SUCCESS] Created 'reviews' table.");
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to create 'reviews' table:", err.message);
    throw err;
  }

  // 8. Add Initial Admin User
  try {
    const adminEmail = "admin@admin.com";
    // Fix: Use ? instead of $1 for MySQL, and destructure rows array directly
    const [rows] = await query("SELECT id FROM users WHERE email = ?", [adminEmail]);
    if (!rows || rows.length === 0) {
      const adminPasswordHash = await bcrypt.hash("admin123", 10);
      await query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
        [adminEmail, adminPasswordHash, "admin"]
      );
      console.log(`MIGRATE_JS: [SUCCESS] Seeded default administrator account: ${adminEmail}`);
    } else {
      console.log(`MIGRATE_JS: [INFO] Admin user '${adminEmail}' already exists.`);
    }
  } catch (err) {
    console.error("MIGRATE_JS: [FAILURE] Failed to seed admin user:", err.message);
    throw err;
  }

  console.log("MIGRATE_JS: All MySQL migrations completed successfully.");
}
