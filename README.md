# E-Commerce Catalog — AWS Multi-Tier Deployment

A full-stack e-commerce catalog application deployed on AWS using a three-tier architecture. Built as a portfolio project demonstrating real-world cloud infrastructure design, network security, and AWS service integration.

**Live Demo:** https://d3g7a1twk7q2ux.cloudfront.net/

\---

## Architecture Overview

```
Internet
    │
    ▼
CloudFront (HTTPS, CDN, global edge caching)
    │
    ├──▶ S3 (React frontend — static website hosting)
    │
    └──▶ Application Load Balancer (public subnet, port 80)
              │
              ▼
         EC2 — Node.js backend (private subnet, port 5000)
         Auto Scaling Group (min 1, max 4)
              │
              ├──▶ RDS MySQL (private subnet, port 3306)
              │
              └──▶ S3 (product images bucket)
```

**VPC design:** All resources live inside a custom VPC (`10.0.0.0/16`) with public and private subnets across 2 Availability Zones. The database sits in a private subnet with no internet route — the only thing that can reach it is the EC2 backend via a locked-down security group rule.

\---

## AWS Services Used

|Service|Purpose|
|-|-|
|VPC|Isolated network with public/private subnet separation|
|EC2 (t2.micro)|Runs the Node.js/Express REST API|
|Application Load Balancer|Distributes traffic to EC2, single public entry point|
|Auto Scaling Group|Maintains availability, replaces unhealthy instances|
|RDS MySQL (t3.micro)|Managed relational database in private subnet|
|S3 (images)|Stores and serves product images publicly|
|S3 (frontend)|Hosts the React static build|
|CloudFront|CDN + HTTPS in front of the frontend S3 bucket|
|IAM|EC2 instance role for S3 access — no hardcoded credentials|
|Security Groups|Layered traffic control at every tier|

\---

## Tech Stack

**Frontend**

* React + Vite
* Tailwind CSS
* Hosted on S3 + CloudFront

**Backend**

* Node.js + Express
* JWT authentication (httpOnly cookies)
* bcrypt password hashing
* AWS SDK v3 for S3 image uploads
* Hosted on EC2 behind ALB

**Database**

* MySQL 8.0
* Hosted on RDS in private subnet
* Raw SQL via `mysql2` (no ORM)

\---

## Features

* Product catalog with pagination, category filter, price range filter, and search
* Product detail page with image gallery and related products
* Cart with persistent storage per user in the database
* Multi-step checkout (shipping → review → mock payment → confirmation)
* JWT-based auth — register, login, logout
* Admin panel (role-based access) — CRUD for products, categories, order management
* Product reviews — star rating + text, average rating displayed on catalog

\---

## Security Design

```
Internet  →  ALB only (port 80/443)
ALB       →  EC2 only (port 5000)
EC2       →  RDS only (port 3306)
EC2       →  S3 via IAM role (no access keys in code)
RDS       →  unreachable from internet
```

No hardcoded AWS credentials anywhere in the codebase. EC2 accesses S3 via an attached IAM instance role — the AWS SDK picks up permissions automatically.

\---

## Running with Docker

Make sure Docker and Docker Compose are installed.

\```bash

git clone https://github.com/Shazam-byte/ecommerce-app-complete-containerized.git

cd ecommerce-app-complete-containerized-main

docker-compose up --build

\```

Open http://localhost in your browser.

## Local Development

### Prerequisites

* Node.js 20+
* MySQL 8.0 running locally
* Git

### Backend setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in your local values in .env
npm run migrate
npm run dev
```

### Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE\_API\_URL=http://localhost:5000
npm run dev
```

\---

## Environment Variables

### Backend `.env`

```
PORT=5000
DB\_HOST=localhost
DB\_PORT=3306
DB\_NAME=ecommerce
DB\_USER=root
DB\_PASSWORD=yourpassword
JWT\_SECRET=your\_long\_random\_secret
AWS\_REGION=us-east-1
S3\_BUCKET\_NAME=ecommerce-product-images-shah
NODE\_ENV=development
```

### Frontend `.env`

```
VITE\_API\_URL=http://localhost:5000
```

In production, `VITE\_API\_URL` points to the ALB DNS name.

\---

## Database Schema

```
users           — id, name, email, password\_hash, role, created\_at
categories      — id, name, slug, description
products        — id, name, slug, description, price, stock, category\_id, created\_at
product\_images  — id, product\_id, image\_url, is\_primary
cart\_items      — id, user\_id, product\_id, quantity
orders          — id, user\_id, status, total, shipping\_address, created\_at
order\_items     — id, order\_id, product\_id, quantity, price\_at\_purchase
reviews         — id, user\_id, product\_id, rating, comment, created\_at
```

\---

## API Endpoints

|Method|Route|Auth|Purpose|
|-|-|-|-|
|POST|/api/auth/register|No|Register new user|
|POST|/api/auth/login|No|Login, sets JWT cookie|
|POST|/api/auth/logout|Yes|Clears JWT cookie|
|GET|/api/products|No|List products (filter, search, paginate)|
|GET|/api/products/:id|No|Product detail|
|GET|/api/categories|No|List all categories|
|POST|/api/cart|Yes|Add item to cart|
|GET|/api/cart|Yes|Get current user's cart|
|PUT|/api/cart/:id|Yes|Update cart item quantity|
|DELETE|/api/cart/:id|Yes|Remove cart item|
|POST|/api/orders|Yes|Place order|
|GET|/api/orders|Yes|Get current user's orders|
|POST|/api/reviews|Yes|Submit a review|
|GET|/api/reviews/:productId|No|Get reviews for a product|
|GET|/api/admin/products|Admin|List all products|
|POST|/api/admin/products|Admin|Create product with image upload|
|PUT|/api/admin/products/:id|Admin|Update product|
|DELETE|/api/admin/products/:id|Admin|Delete product|
|GET|/api/admin/orders|Admin|List all orders|
|PUT|/api/admin/orders/:id|Admin|Update order status|
|GET|/api/health|No|Health check (used by ALB)|

\---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full step-by-step AWS deployment guide.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions and architectural reasoning.

See [COST.md](./COST.md) for monthly cost breakdown.

\---

## Author

**Shahzaman Ajmal**

* GitHub: [github.com/Shazam-byte](https://github.com/Shazam-byte)
* LinkedIn: [linkedin.com/in/shahzaman-ajmal](https://linkedin.com/in/shahzaman-ajmal)
* Portfolio: [https://portfolio-ebon-beta-49.vercel.app/](https://portfolio-mu-lemon-24.vercel.app)

