# Deployment Guide — AWS Multi-Tier Setup

This guide documents the exact steps used to deploy this application on AWS. Follow in order — each phase depends on the one before it.

---

## Prerequisites

- AWS account with free tier access
- AWS CLI installed locally (optional but useful)
- Node.js 20+ installed locally
- Git installed locally
- A Visa/Mastercard debit card for AWS account verification

---

## Deployment Order

```
1. VPC + Networking
2. Security Groups
3. RDS MySQL
4. S3 Buckets + IAM Role
5. EC2 + Backend Deployment
6. Application Load Balancer
7. Frontend Build + S3 Upload
8. CloudFront
```

Never skip ahead. Each layer must exist before the next one references it.

---

## Phase 1 — VPC and Networking

### Create VPC
```
VPC → Your VPCs → Create VPC
Name: ecommerce-vpc
IPv4 CIDR: 10.0.0.0/16
Tenancy: Default
```

### Create Subnets (4 total)
```
Subnet 1 — ecommerce-public-1a
  AZ: us-east-1a | CIDR: 10.0.1.0/24

Subnet 2 — ecommerce-public-1b
  AZ: us-east-1b | CIDR: 10.0.2.0/24

Subnet 3 — ecommerce-private-1a
  AZ: us-east-1a | CIDR: 10.0.3.0/24

Subnet 4 — ecommerce-private-1b
  AZ: us-east-1b | CIDR: 10.0.4.0/24
```

### Create Internet Gateway
```
VPC → Internet Gateways → Create
Name: ecommerce-igw
After creation: Actions → Attach to VPC → ecommerce-vpc
```

### Create Route Tables

**Public route table:**
```
Name: ecommerce-public-rt
VPC: ecommerce-vpc

Routes:
  0.0.0.0/0 → ecommerce-igw

Subnet associations:
  ecommerce-public-1a
  ecommerce-public-1b
```

**Private route table:**
```
Name: ecommerce-private-rt
VPC: ecommerce-vpc

No internet route — leave default local route only

Subnet associations:
  ecommerce-private-1a
  ecommerce-private-1b
```

---

## Phase 2 — Security Groups

### ALB Security Group
```
Name: ecommerce-alb-sg
VPC: ecommerce-vpc

Inbound:
  HTTP  | TCP | 80  | 0.0.0.0/0
  HTTPS | TCP | 443 | 0.0.0.0/0
```

### EC2 Security Group
```
Name: ecommerce-ec2-sg
VPC: ecommerce-vpc

Inbound:
  Custom TCP | TCP | 5000 | ecommerce-alb-sg
  SSH        | TCP | 22   | My IP
```

### RDS Security Group
```
Name: ecommerce-rds-sg
VPC: ecommerce-vpc

Inbound:
  MySQL/Aurora | TCP | 3306 | ecommerce-ec2-sg
```

---

## Phase 3 — RDS MySQL

### Create DB Subnet Group
```
RDS → Subnet groups → Create DB subnet group
Name: ecommerce-db-subnet-group
VPC: ecommerce-vpc
Subnets: ecommerce-private-1a, ecommerce-private-1b
```

### Create RDS Instance
```
Engine: MySQL 8.0
Template: Free tier
Instance identifier: ecommerce-db
Master username: admin
Master password: [your password]
Instance class: db.t3.micro
Storage: 20 GB gp2 (autoscaling disabled)
VPC: ecommerce-vpc
Subnet group: ecommerce-db-subnet-group
Public access: No
Security group: ecommerce-rds-sg
Initial database name: ecommerce
Automatic backups: disabled
```

Wait for status: **Available**

Note the endpoint — you will need it as `DB_HOST` in your backend `.env`.

---

## Phase 4 — S3 Buckets and IAM Role

### Product Images Bucket
```
Name: ecommerce-product-images-shah
Region: us-east-1
Block public access: OFF (uncheck all)

Bucket policy:
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::ecommerce-product-images-shah/*"
  }]
}
```

### Frontend Bucket
```
Name: ecommerce-frontend-shah
Region: us-east-1
Block public access: OFF (uncheck all)

Static website hosting:
  Enable: Yes
  Index document: index.html
  Error document: index.html

Bucket policy:
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::ecommerce-frontend-shah/*"
  }]
}
```

### IAM Role for EC2
```
IAM → Roles → Create role
Trusted entity: AWS service → EC2
Policy: AmazonS3FullAccess
Name: ecommerce-ec2-s3-role
```

---

## Phase 5 — EC2 and Backend Deployment

### Launch Instance
```
Name: ecommerce-backend
AMI: Amazon Linux 2023
Instance type: t2.micro
Key pair: create new → ecommerce-keypair (RSA, .pem) — save this file
Network: ecommerce-vpc
Subnet: ecommerce-public-1a
Auto-assign public IP: Enable
Security group: ecommerce-ec2-sg
IAM instance profile: ecommerce-ec2-s3-role
```

### SSH Into Instance
```bash
chmod 400 ecommerce-keypair.pem
ssh -i ecommerce-keypair.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

### Install Dependencies
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git
sudo npm install -g pm2
```

### Deploy Backend
```bash
git clone https://github.com/Shazam-byte/ecommerce-backend.git
cd ecommerce-backend
npm install
```

### Create .env File
```bash
nano .env
```

```
PORT=5000
DB_HOST=your-rds-endpoint.us-east-1.rds.amazonaws.com
DB_PORT=3306
DB_NAME=ecommerce
DB_USER=admin
DB_PASSWORD=yourpassword
JWT_SECRET=your_long_random_secret_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=ecommerce-product-images-shah
NODE_ENV=production
```

### Run Database Migrations
```bash
node migrate.js
# or if using raw SQL:
mysql -h YOUR_RDS_ENDPOINT -u admin -p ecommerce < schema.sql
```

### Start with PM2
```bash
pm2 start index.js --name ecommerce-backend
pm2 startup
# copy and run the command it outputs
pm2 save
```

### Verify
```bash
pm2 status          # should show: online
pm2 logs ecommerce-backend --lines 20    # should show: no errors
curl http://localhost:5000/api/health    # should return: 200 OK
```

---

## Phase 6 — Application Load Balancer

### Create Target Group
```
EC2 → Target Groups → Create
Target type: Instances
Name: ecommerce-tg
Protocol: HTTP
Port: 5000
VPC: ecommerce-vpc
Health check path: /api/health

Register targets:
  Select ecommerce-backend instance
  Port: 5000
```

### Create Load Balancer
```
EC2 → Load Balancers → Create → Application Load Balancer
Name: ecommerce-alb
Scheme: Internet-facing
VPC: ecommerce-vpc
Subnets: ecommerce-public-1a, ecommerce-public-1b
Security group: ecommerce-alb-sg
Listener: HTTP port 80 → forward to ecommerce-tg
```

Wait for state: **Active**

### Verify
```bash
curl http://YOUR_ALB_DNS/api/health
# should return: 200 OK
```

The ALB DNS name is your production backend URL. Update your frontend `.env` with this value.

---

## Phase 7 — Frontend Build and Upload

### Update Frontend .env
```
VITE_API_URL=http://your-alb-dns.us-east-1.elb.amazonaws.com
```

### Build
```bash
cd frontend
npm install
npm run build
```

### Upload to S3
```
S3 → ecommerce-frontend-shah → Upload
Upload contents of dist/ folder (not the folder itself)
```

### Verify
Open the S3 website endpoint URL in your browser. The app should load and products should be visible.

---

## Phase 8 — CloudFront

### Create Distribution
```
CloudFront → Create distribution
Origin domain: paste S3 website endpoint URL manually
  (do NOT select from dropdown — causes routing issues with React Router)
Origin protocol: HTTP only
Viewer protocol policy: Redirect HTTP to HTTPS
Cache policy: CachingOptimized
Default root object: index.html
Price class: Use only North America and Europe
```

### Add Custom Error Pages
```
Distribution → Error pages → Create custom error response

Error 1:
  HTTP error code: 403
  Response page path: /index.html
  HTTP response code: 200

Error 2:
  HTTP error code: 404
  Response page path: /index.html
  HTTP response code: 200
```

These fix React Router — without them, direct URLs like `/products/5` return errors instead of loading the app.

### Update Backend CORS
SSH into EC2 and add the CloudFront domain to allowed origins in your backend:

```javascript
app.use(cors({
  origin: [
    'https://your-cloudfront-domain.cloudfront.net',
    'http://ecommerce-frontend-shah.s3-website-us-east-1.amazonaws.com',
    'http://localhost:5173'
  ],
  credentials: true
}))
```

```bash
pm2 restart ecommerce-backend
```

Wait for CloudFront deployment (~10 minutes). Status changes from **Deploying** to **Enabled**.

### Verify
Open `https://your-cloudfront-domain.cloudfront.net` — app loads over HTTPS.

---

## Cost Control

**Stop resources when not in use:**

```bash
# Stop EC2 (no charge while stopped, storage still billed)
EC2 → Instances → select → Instance state → Stop

# Stop RDS (free for 7 days, auto-restarts after)
RDS → Databases → select → Actions → Stop temporarily
```

**To bring back up for a demo:**
Start RDS first (takes 2-3 min), then start EC2. App is live again in under 5 minutes.

**Always running monthly cost estimate:** see [COST.md](./COST.md)

---

## Updating the Backend

```bash
# Local machine
git add .
git commit -m "your message"
git push origin main

# SSH into EC2
ssh -i ecommerce-keypair.pem ec2-user@YOUR_EC2_PUBLIC_IP
cd ecommerce-backend
git pull origin main
npm install
pm2 restart ecommerce-backend
```

## Updating the Frontend

```bash
# Local machine — after making changes
npm run build
# Re-upload contents of dist/ to S3

# Invalidate CloudFront cache so changes go live immediately
CloudFront → Distribution → Invalidations → Create
  Paths: /*
```
