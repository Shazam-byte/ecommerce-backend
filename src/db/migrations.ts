import { query } from "./connection";
import bcrypt from "bcrypt";

// Mutex flag to prevent simultaneous execution within the same Node process
let isMigrating = false;

export async function runMigrations() {
  if (isMigrating) {
    console.log("DB_MIGRATIONS: Migration already in progress, skipping duplicate call.");
    return;
  }
  isMigrating = true;

  try {
    console.log("DB_MIGRATIONS: Starting database initialization...");

    // 1. Users Table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // 2. Categories Table
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // 3. Products Table
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

    // 4. Cart Items Table
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

    // 5. Orders Table
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

    // 6. Order Items Table
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

    // 7. Reviews Table
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

    console.log("DB_MIGRATIONS: [OK] Schema created/verified.");

    // 8. Seed Data safely
    await seedInitialData();

    console.log("DB_MIGRATIONS: All migrations passed and database synchronized.");
  } catch (error) {
    console.error("DB_MIGRATIONS: Migration failure!", error);
    throw error;
  } finally {
    isMigrating = false;
  }
}

async function seedInitialData() {
  // 1. Seed Categories using INSERT IGNORE (safe against duplicates)
  const defaultCategories = [
    ["Electronics", "electronics"],
    ["Apparel", "apparel"],
    ["Books", "books"],
    ["Home & Kitchen", "home-kitchen"]
  ];

  for (const [name, slug] of defaultCategories) {
    await query(
      "INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)",
      [name, slug]
    );
  }

  // Build ID mapping directly from DB after ensuring rows exist
  const categoriesRowsResult: any = await query("SELECT id, name FROM categories");
  const rows = Array.isArray(categoriesRowsResult[0]) ? categoriesRowsResult[0] : categoriesRowsResult;
  const categoriesMap: { [key: string]: number } = {};

  if (Array.isArray(rows)) {
    rows.forEach((row: any) => {
      categoriesMap[row.name] = row.id;
    });
  }

  // 2. Seed Products (if table is empty)
  const checkProductResult: any = await query("SELECT COUNT(*) as count FROM products");
  const firstRow = Array.isArray(checkProductResult) 
    ? (Array.isArray(checkProductResult[0]) ? checkProductResult[0][0] : checkProductResult[0]) 
    : checkProductResult;
  const productCount = parseInt(firstRow?.count ?? firstRow?.["COUNT(*)"] ?? 0, 10);

  if (productCount === 0) {
    console.log("DB_MIGRATIONS: Seeding catalog products...");

    const productsToSeed = [
      {
        category_id: categoriesMap["Electronics"],
        name: "iPhone 15 Pro Max",
        slug: "iphone-15-pro-max",
        description: "The ultimate Titanium design iPhone, featuring the groundbreaking A17 Pro chip, a customizable Action button, and the most powerful iPhone camera system ever.",
        price: 1199.99,
        stock: 12,
        images: JSON.stringify(["https://picsum.photos/600/400?random=101", "https://picsum.photos/600/400?random=102"]),
      },
      {
        category_id: categoriesMap["Electronics"],
        name: "Sony WH-1000XM5 Headphones",
        slug: "sony-wh-1000xm5-headphones",
        description: "Industry leading noise-canceling wireless headphones. Refined design with 30 hours of battery life and dual processors controlling multiple microphones.",
        price: 348.00,
        stock: 18,
        images: JSON.stringify(["https://picsum.photos/600/400?random=103", "https://picsum.photos/600/400?random=104"]),
      },
      {
        category_id: categoriesMap["Apparel"],
        name: "Classic Bomber Jacket",
        slug: "classic-bomber-jacket",
        description: "A timeless, water-resistant outerwear option fabricated with pre-washed sturdy canvas, complete with zip details and comfortable ribbed-knit finishes.",
        price: 129.50,
        stock: 7,
        images: JSON.stringify(["https://picsum.photos/600/400?random=105", "https://picsum.photos/600/400?random=106"]),
      },
      {
        category_id: categoriesMap["Apparel"],
        name: "Breathable Knit Runner Sneakers",
        slug: "knit-runner-sneakers",
        description: "Ultra-comfy daily athletic trainers engineered with an elastic woven upper, cushioning foam mid-sole, and durable rubber impact tracks.",
        price: 89.00,
        stock: 25,
        images: JSON.stringify(["https://picsum.photos/600/400?random=107", "https://picsum.photos/600/400?random=108"]),
      },
      {
        category_id: categoriesMap["Books"],
        name: "Clean Code",
        slug: "clean-code-book",
        description: "A Handbook of Agile Software Craftsmanship by Robert C. Martin. Even bad code can function. But if code isn't clean, it can bring a development organization to its knees.",
        price: 39.99,
        stock: 32,
        images: JSON.stringify(["https://picsum.photos/600/400?random=109"]),
      },
      {
        category_id: categoriesMap["Home & Kitchen"],
        name: "Ergonomic Mesh Office Chair",
        slug: "mesh-office-chair",
        description: "Ergonomic desk chair showcasing high-tensile mesh back support, 3D adjustable armrests, fully customizable tilt tension, and pneumatic height selectors.",
        price: 249.99,
        stock: 10,
        images: JSON.stringify(["https://picsum.photos/600/400?random=110", "https://picsum.photos/600/400?random=111"]),
      }
    ];

    for (const p of productsToSeed) {
      if (!p.category_id) continue;
      await query(
        `INSERT IGNORE INTO products (category_id, name, slug, description, price, stock, images) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [p.category_id, p.name, p.slug, p.description, p.price, p.stock, p.images]
      );
    }
  }

  // 3. Seed Initial Users using INSERT IGNORE
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const userPasswordHash = await bcrypt.hash("user123", 10);

  await query(
    "INSERT IGNORE INTO users (email, password_hash, role) VALUES (?, ?, ?)",
    ["admin@catalog.com", adminPasswordHash, "admin"]
  );
  await query(
    "INSERT IGNORE INTO users (email, password_hash, role) VALUES (?, ?, ?)",
    ["user@catalog.com", userPasswordHash, "user"]
  );
  console.log("DB_MIGRATIONS: Seeded default categories, products, and user accounts.");
}