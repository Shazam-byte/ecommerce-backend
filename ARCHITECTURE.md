# Architecture — Design Decisions & Reasoning

This document explains the architectural decisions behind the AWS deployment of this e-commerce catalog application. Every choice here has a reason — this is the reasoning I would walk through in a technical interview.

---

## Architecture Diagram

```
                        ┌─────────────────────────────────────────────────┐
                        │                   Internet                       │
                        └───────────────────────┬─────────────────────────┘
                                                │
                                                ▼
                        ┌─────────────────────────────────────────────────┐
                        │              CloudFront (HTTPS/CDN)              │
                        └────────────┬────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
        ┌───────────────────────┐       ┌─────────────────────────────┐
        │  S3 — React frontend  │       │  Application Load Balancer  │
        │  (static website)     │       │  (public subnets 1a + 1b)   │
        └───────────────────────┘       └──────────────┬──────────────┘
                                                       │
                        ┌──────────────────────────────┼──────────────────────────────┐
                        │               VPC: 10.0.0.0/16                              │
                        │                              │                              │
                        │   ┌──────────────────────────▼─────────────────────────┐   │
                        │   │           Private Subnet — App Tier                │   │
                        │   │         (ecommerce-private-1a / 1b)                │   │
                        │   │                                                    │   │
                        │   │   ┌─────────────────┐   ┌─────────────────┐       │   │
                        │   │   │ EC2 — Node.js   │   │ EC2 — Node.js   │       │   │
                        │   │   │ backend (port   │   │ backend (port   │       │   │
                        │   │   │ 5000) AZ-a      │   │ 5000) AZ-b      │       │   │
                        │   │   └────────┬────────┘   └────────┬────────┘       │   │
                        │   │            │   Auto Scaling Group │                │   │
                        │   └────────────┼─────────────────────┼────────────────┘   │
                        │                │                     │                    │
                        │   ┌────────────▼─────────────────────▼────────────────┐   │
                        │   │           Private Subnet — Data Tier              │   │
                        │   │         (ecommerce-private-1a / 1b)               │   │
                        │   │                                                   │   │
                        │   │   ┌─────────────────┐   ┌─────────────────┐      │   │
                        │   │   │  RDS MySQL 8.0  │   │  S3 — Product   │      │   │
                        │   │   │  (port 3306)    │   │  Images Bucket  │      │   │
                        │   │   └─────────────────┘   └─────────────────┘      │   │
                        │   └───────────────────────────────────────────────────┘   │
                        └─────────────────────────────────────────────────────────  ┘
```

---

## Decision 1 — Why Three-Tier Architecture

**What it is:** Presentation tier (frontend), application tier (backend), data tier (database) deployed as completely separate layers.

**Why not a monolith:** A monolith bundles everything together — if one part crashes, everything crashes. Separate tiers can be scaled, updated, or replaced independently. The frontend can be updated without touching the backend. The database can be migrated without redeploying the app.

**Why not serverless:** Lambda + API Gateway would work but hides the infrastructure layer entirely. This project is deliberately built on EC2 and RDS to demonstrate understanding of VMs, networking, and managed databases — the concepts the AWS SAA-C03 exam and most cloud job interviews test.

---

## Decision 2 — Why Public and Private Subnets

The VPC has four subnets: two public, two private.

**Public subnets** (`10.0.1.0/24`, `10.0.2.0/24`) contain:
- Application Load Balancer
- NAT Gateway (if added later)

These need internet access — the ALB receives traffic from users, so it must be in a public subnet with a route to the Internet Gateway.

**Private subnets** (`10.0.3.0/24`, `10.0.4.0/24`) contain:
- EC2 instances (backend)
- RDS MySQL (database)

These have no route to the internet. The EC2 instances only receive traffic from the ALB. The database only receives traffic from EC2. This means even if someone found your EC2's private IP, they couldn't reach it directly from outside the VPC — and the database is completely unreachable from anywhere except the app tier.

**Why 2 Availability Zones:** AWS data centers are grouped into AZs. If one AZ goes down, your app keeps running in the other. ALB requires subnets in at least 2 AZs to distribute traffic. RDS multi-AZ failover also requires 2 AZs.

---

## Decision 3 — Why ALB Instead of Direct EC2 Access

Without an ALB, users would hit the EC2 instance directly. Problems with that:

- Single point of failure — if EC2 crashes, app goes down
- Can't scale horizontally — one IP means one server
- EC2's public IP changes every time it stops and starts
- Port 5000 exposed directly to the internet is a security smell

With the ALB:
- Traffic is distributed across multiple EC2 instances
- ALB has a stable DNS name that never changes
- EC2 security group only accepts traffic from the ALB — port 5000 is never exposed to the internet
- Health checks automatically route away from unhealthy instances

---

## Decision 4 — Why RDS Instead of MySQL on EC2

You could install MySQL directly on the EC2 instance. It would work. But:

| | MySQL on EC2 | RDS MySQL |
|---|---|---|
| Backups | Manual | Automated |
| Failover | Manual setup | Multi-AZ automatic |
| Patching | You manage | AWS manages |
| Monitoring | You set up | CloudWatch built-in |
| Storage scaling | Manual | Automatic |

RDS costs more but removes the operational burden. For a production application, the time saved managing a database outweighs the cost difference. This is the exact tradeoff the SAA-C03 exam tests.

---

## Decision 5 — Why RDS is in a Private Subnet With No Public Access

The database contains user data, order history, and hashed passwords. There is no scenario where it should be reachable from the internet.

Setting `Public access: No` on RDS means AWS does not assign it a public IP. Even if someone knew the endpoint, they couldn't connect — there is no network route to it from outside the VPC.

The only inbound rule on `ecommerce-rds-sg` is:
```
Port 3306 — Source: ecommerce-ec2-sg
```

Not even you can connect to it directly from your laptop. To query the database directly you would need to SSH into EC2 first and connect from there (SSH tunneling).

---

## Decision 6 — Why S3 + CloudFront for the Frontend

**Why not serve frontend from EC2:** EC2 is good at running dynamic backend logic. Serving static HTML/CSS/JS from EC2 wastes compute resources on something S3 does for almost nothing.

**Why S3:** Purpose-built for static file storage and serving. Infinitely scalable, 99.99% availability, essentially free at any reasonable traffic level.

**Why CloudFront in front of S3:**
- S3 website hosting only supports HTTP, not HTTPS. CloudFront adds HTTPS automatically.
- CloudFront caches files at edge locations globally — a user in Pakistan gets files served from a nearby edge location, not from us-east-1 every time.
- CloudFront provides DDoS protection via AWS Shield Standard at no extra cost.
- The S3 bucket URL is ugly. CloudFront gives a cleaner URL and supports custom domains.

---

## Decision 7 — Why IAM Role Instead of Access Keys for S3 Upload

The backend uploads product images to S3 using the AWS SDK. Two ways to authenticate:

**Option A — Access keys in .env:**
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

Bad. If the `.env` file ever gets committed to GitHub accidentally, those keys are compromised instantly. Bots scan GitHub for AWS credentials 24/7.

**Option B — IAM instance role:**
Attach a role to the EC2 instance with S3 permissions. The AWS SDK automatically picks up the role's credentials from the instance metadata service — no keys in code, no keys in `.env`, nothing to leak.

The IAM role (`ecommerce-ec2-s3-role`) has only `AmazonS3FullAccess`. In a production setup you would scope this further to only the specific bucket using a custom inline policy.

---

## Decision 8 — Security Group Layering

Each tier only accepts traffic from the tier directly above it:

```
ecommerce-alb-sg   → allows 80/443 from 0.0.0.0/0 (internet)
ecommerce-ec2-sg   → allows 5000 from ecommerce-alb-sg only
ecommerce-rds-sg   → allows 3306 from ecommerce-ec2-sg only
```

This is called defense in depth. Even if the ALB were somehow compromised, it still couldn't hit the database directly — it can only reach EC2, and EC2 is the only thing that can reach RDS.

---

## What Would Change in Production at Scale

This deployment is sized for portfolio/demo purposes. At real scale:

| Component | Current | Production |
|---|---|---|
| EC2 | t2.micro, 1 instance | t3.medium+, 3-10 instances in ASG |
| RDS | t3.micro, single AZ | r6g.large, Multi-AZ enabled |
| S3 images | Public bucket | Private bucket + CloudFront signed URLs |
| HTTPS on ALB | Not configured | ACM certificate on ALB listener |
| Secrets | .env file on EC2 | AWS Secrets Manager |
| Logging | PM2 logs | CloudWatch Logs agent on EC2 |
| CI/CD | Manual git pull | GitHub Actions → CodeDeploy |
| NAT Gateway | Not added | Required for EC2 to pull updates |
| WAF | Not configured | AWS WAF in front of CloudFront |
