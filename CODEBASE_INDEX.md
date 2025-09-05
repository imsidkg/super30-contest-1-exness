# Codebase Index - Trading Platform Monorepo

## Overview
This is a Turborepo monorepo containing a trading platform with multiple applications and shared packages. The system includes a backend server, trading engine, web applications, and shared UI/components.

## Project Structure

```
my-turborepo/
├── apps/
│   ├── server/                 # Express.js backend server
│   ├── create-order-engine/    # Kafka consumer for trade processing
│   ├── web/                    # Next.js web application
│   └── docs/                   # Next.js documentation site
├── packages/
│   ├── ui/                     # Shared React components
│   ├── typescript-config/      # Shared TypeScript configurations
│   └── eslint-config/          # Shared ESLint configurations
└── Configuration files
```

## Applications

### 1. Server (`apps/server/`)
**Purpose**: Express.js backend server for user authentication, trade creation, and WebSocket integration with Backpack Exchange.

**Key Features:**
- User authentication with JWT and magic links
- Trade creation API endpoints
- WebSocket connection to Backpack Exchange
- Kafka producer for trade data
- Redis integration for user data storage

**Dependencies:**
- `express`: Web framework
- `kafkajs`: Kafka client
- `ioredis`: Redis client
- `ws`: WebSocket client
- `nodemailer`: Email sending
- `jsonwebtoken`: JWT authentication
- `cookie-parser`: Cookie handling

**Main Files:**
- `src/index.ts`: Main server entry point
- `src/websockets/backpackWebsocket.ts`: WebSocket connection to Backpack Exchange
- `src/lib/redisClient.ts`: Redis client configuration

### 2. Create Order Engine (`apps/create-order-engine/`)
**Purpose**: Kafka consumer that processes trade orders and manages order lifecycle.

**Key Features:**
- Consumes messages from Kafka topic `recieved-backpack-data`
- Processes price updates from Backpack Exchange
- Creates and manages trading orders
- Calculates unrealized P&L in real-time
- Maintains order snapshots in JSON file

**Dependencies:**
- `kafkajs`: Kafka client
- `ioredis`: Redis client

**Main Files:**
- `src/index.ts`: Main consumer logic
- `src/createOrder.ts`: Order creation and P&L calculation logic

### 3. Web Application (`apps/web/`)
**Purpose**: Next.js frontend application (currently using default Turborepo template).

**Dependencies:**
- `next`: React framework
- `react`: UI library
- `@repo/ui`: Shared UI components

### 4. Documentation (`apps/docs/`)
**Purpose**: Next.js documentation site (currently using default Turborepo template).

**Dependencies:**
- `next`: React framework
- `react`: UI library
- `@repo/ui`: Shared UI components

## Shared Packages

### 1. UI Package (`packages/ui/`)
**Purpose**: Shared React components used across web applications.

**Components:**
- `button.tsx`: Basic button component
- `card.tsx`: Card component
- `code.tsx`: Code display component

### 2. TypeScript Config (`packages/typescript-config/`)
**Purpose**: Shared TypeScript configuration files.

**Configurations:**
- `base.json`: Base TypeScript configuration
- `nextjs.json`: Next.js specific configuration
- `react-library.json`: React library configuration

### 3. ESLint Config (`packages/eslint-config/`)
**Purpose**: Shared ESLint configuration files.

**Configurations:**
- `base.js`: Base ESLint configuration
- `next.js`: Next.js specific configuration
- `react-internal.js`: React internal configuration

## Core Functionality

### Trading System Flow
1. **User Authentication**: Users sign up via email magic links
2. **Trade Creation**: Users create trades via API endpoints
3. **Price Data**: Backpack Exchange WebSocket provides real-time price data
4. **Order Processing**: Create Order Engine processes trades and manages orders
5. **P&L Calculation**: Real-time unrealized P&L calculation
6. **Data Persistence**: Order snapshots saved to JSON file

### Key Data Structures
- **User**: `{ email: string, balance: number }`
- **Order**: `{ orderId: number, userEmail: string, asset: string, type: "long" | "short", margin: number, leverage: number, slippage: number, priceForSlippage: number, currentPrice: number, quantity: number, unrealizedPnL: number, userBalance: number }`
- **Price Update**: `{ asset: string, price: number, decimal: number }`

### Kafka Topics
- `recieved-backpack-data`: Used for both price updates and trade requests

## Development Commands

### Root Level Commands
```bash
npm run build        # Build all packages
npm run dev          # Develop all packages
npm run lint         # Lint all code
npm run format       # Format code with Prettier
npm run check-types  # Type check all packages
```

### Individual Package Commands
```bash
# Server
cd apps/server
npm run dev          # Start development server
npm run start        # Start production server

# Create Order Engine
cd apps/create-order-engine
npm run start        # Start the engine

# Web Application
cd apps/web
npm run dev          # Start development server

# Documentation
cd apps/docs
npm run dev          # Start development server
```

## Environment Variables

### Server Required Variables
```env
PORT=3001
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
JWT_SECRET=your-jwt-secret
BASE_URL=http://localhost:3001
NODE_ENV=development
```

### Infrastructure Requirements
- **Redis**: Required for user data storage
- **Kafka**: Required for message queue (broker at localhost:9092)
- **Backpack Exchange**: WebSocket connection for price data

## Architecture Patterns

1. **Microservices**: Separate services for API, order processing, and frontend
2. **Event-Driven**: Kafka-based message passing between services
3. **Monorepo**: Shared code and configurations across packages
4. **Real-time Updates**: WebSocket connections for live price data
5. **Stateless Authentication**: JWT-based authentication with Redis storage

## Potential Improvements
1. Add proper database integration (PostgreSQL/MongoDB)
2. Implement WebSocket connections for real-time UI updates
3. Add comprehensive testing suite
4. Implement proper error handling and logging
5. Add API documentation (Swagger/OpenAPI)
6. Implement proper security measures (rate limiting, input validation)
7. Add Docker configuration for easy deployment
8. Implement proper monitoring and alerting
