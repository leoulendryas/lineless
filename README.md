# Lineless

Lineless is a high-performance, real-time infrastructure monitoring platform designed to provide transparency into fuel and energy availability. By leveraging community-driven data and a trust-based reporting system, Lineless enables users to navigate urban infrastructure with precision, minimizing wait times and optimizing resource allocation.

## Core Features

### Real-Time Infrastructure Mapping
A high-fidelity interactive map interface powered by Leaflet, providing a comprehensive overview of fuel stations, EV charging nodes, parking facilities, and vehicle maintenance centers.

### Verified Community Reporting
Users can broadcast real-time updates regarding resource availability, queue depths, and pricing. Reports are linked to verified identities to ensure data integrity and reliability.

### Trust-Based Reputation System
A sophisticated scoring mechanism that evaluates contributor reliability based on community feedback. High-trust users provide the backbone of the platform's data accuracy.

### Telegram Authentication
Seamless and secure identity verification through Telegram's authentication API, eliminating the need for traditional password management while maintaining a high standard of security.

### Comprehensive Amenity Tracking
Beyond resource availability, the platform tracks essential station amenities, including retail shops, cafes, car wash services, and financial access points (ATMs).

## Technical Architecture

### Frontend
- Framework: Next.js 15+ (App Router)
- Language: TypeScript
- Library: React 19
- Styling: Tailwind CSS 4.0
- Mapping: Leaflet with React-Leaflet integration
- State Management: React Hooks and Context API

### Backend
- Database: SQLite (via Prisma ORM)
- API: Next.js Serverless Functions
- Authentication: Telegram OpenID / Widget Authentication

### Data Integration
- Infrastructure Data: OpenStreetMap (via Overpass API)
- Real-time Updates: Community-sourced via internal RESTful endpoints

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- npm or yarn
- A Telegram Bot Token (obtained via @BotFather)

### Environment Configuration
Create a .env file in the root directory with the following variables:
DATABASE_URL="file:./dev.db"
TELEGRAM_BOT_TOKEN="your_bot_token_here"

### Installation
1. Clone the repository:
   git clone git@github.com:leoulendryas/lineless.git
2. Install dependencies:
   npm install
3. Initialize the database:
   npx prisma migrate dev
4. Start the development server:
   npm run dev

## Data Model

The system architecture is built around four primary entities:
- User: Identity management and reputation tracking.
- Station: Physical infrastructure metadata and location.
- Report: Temporal snapshots of resource status and queue conditions.
- GlobalPrice: Standardized pricing benchmarks for various energy types.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
