import { query } from "./connection";
import bcrypt from "bcrypt";

export async function runMigrations() {
  console.log("DB_MIGRATIONS: Starting database schema migrations...");

  try {
    // 1. Users Table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'users' table.");

    // 2. Categories Table
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'categories' table.");

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
        images TEXT, -- JSON string representing string array of URLs
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'products' table.");

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
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'cart_items' table.");

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
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'orders' table.");

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
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'order_items' table.");

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
      )
    `);
    console.log("DB_MIGRATIONS: [OK] Checked 'reviews' table.");

    // 8. Seeding categories and products if empty
    await seedInitialData();

    console.log("DB_MIGRATIONS: All migrations check passed and databases synchronized.");
  } catch (error) {
    console.error("DB_MIGRATIONS: Migration failure!", error);
    throw error;
  }
}

async function seedInitialData() {
  // Check if categories are already present
  const checkCategory = await query("SELECT COUNT(*) as count FROM categories");
  const categoryCount = parseInt(checkCategory.rows[0].count, 10);

  if (categoryCount === 0) {
    console.log("DB_MIGRATIONS: Database empty, seeding default categories...");
    
    // Seed Categories
    await query("INSERT INTO categories (name, slug) VALUES ($1, $2)", ["Electronics", "electronics"]);
    await query("INSERT INTO categories (name, slug) VALUES ($1, $2)", ["Apparel", "apparel"]);
    await query("INSERT INTO categories (name, slug) VALUES ($1, $2)", ["Books", "books"]);
    await query("INSERT INTO categories (name, slug) VALUES ($1, $2)", ["Home & Kitchen", "home-kitchen"]);

    // Fetch newly created categories to match IDs
    const categoriesRows = await query("SELECT id, name FROM categories");
    const categoriesMap: { [key: string]: number } = {};
    categoriesRows.rows.forEach((row) => {
      categoriesMap[row.name] = row.id;
    });

    console.log("DB_MIGRATIONS: Seeding catalog products...");

    // Seed Products
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
      await query(
        `INSERT INTO products (category_id, name, slug, description, price, stock, images) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.category_id, p.name, p.slug, p.description, p.price, p.stock, p.images]
      );
    }
  }

  // Check if users are seeded
  const checkUsers = await query("SELECT COUNT(*) as count FROM users");
  const usersCount = parseInt(checkUsers.rows[0].count, 10);

  if (usersCount === 0) {
    console.log("DB_MIGRATIONS: Seeding administrator and standard test accounts...");
    const adminPasswordHash = await bcrypt.hash("admin123", 10);
    const userPasswordHash = await bcrypt.hash("user123", 10);

    // Create Admin
    await query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)",
      ["admin@catalog.com", adminPasswordHash, "admin"]
    );
    // Create Normal User
    await query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)",
      ["user@catalog.com", userPasswordHash, "user"]
    );
    console.log("DB_MIGRATIONS: [DONE] Seeded admin@catalog.com (admin123) & user@catalog.com (user123).");
  }
}
