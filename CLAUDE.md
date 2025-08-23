# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Plateforme Médecins-Patients** - API backend for doctor-patient platform in Côte d'Ivoire
- **Stack**: Node.js + Express.js, MySQL + Prisma ORM, JWT auth + OTP via SMS
- **Author**: LYCORIS GROUP
- **Purpose**: Platform for connecting patients and doctors with appointment booking system

## Development Commands

```bash
# Development server with auto-reload
npm run dev

# Production server
npm start

# Database operations
npm run db:migrate     # Apply Prisma migrations
npm run db:generate    # Generate Prisma client
npm run db:seed        # Seed database with test data
```

## Architecture Overview

### Core Architecture Pattern
- **Controllers** → **Services** → **Prisma**: Clean separation of concerns
- **Middleware**: Authentication (JWT), validation (custom), CORS
- **API Structure**: RESTful endpoints under `/v1/` namespace
- **Database**: MySQL with Prisma ORM for type-safe database access

### Key Directories Structure

```
├── bin/www                    # Server entry point with multi-env port config
├── config/
│   ├── const.js              # Global constants (JWT, SMS, OTP configs)
│   └── swagger.js            # API documentation configuration
├── controllers/              # Route orchestration by domain
│   ├── AuthController.js     # Authentication routes
│   ├── PatientController.js  # Patient management
│   └── MedecinController.js  # Doctor management
├── middleware/
│   ├── authMiddleware.js     # JWT authentication & role authorization
│   └── bodyFilterMiddleware.js # Request validation & sanitization
├── routes/                   # Specific endpoint implementations
│   ├── v1.js                 # Main API router
│   └── auth/                 # Auth-specific routes (login, OTP, register)
├── services/                 # Business logic & external integrations
│   ├── ApiResponse.js        # Standardized HTTP responses
│   ├── TokenService.js       # JWT token management
│   └── SmsService.js         # SMS integration (LeTexto API)
├── prisma/
│   ├── schema.prisma         # Database schema with extensive models
│   └── client.js             # Configured Prisma client instance
└── swagger/                  # OpenAPI 3.0 documentation files
```

### Authentication System

**Multi-role authentication**:
- **Patients**: OTP-based auth (SMS), no password required
- **Doctors**: Email/password auth with admin validation required
- **Admins**: Email/password auth, no refresh tokens

**JWT Configuration**:
- Environment-specific secrets (DEV/TEST/PROD)
- Role-based token expiration times
- Refresh token support (except admins)

### Database Schema (Prisma)

**Key Models**:
- `User`: Base user model with roles (PATIENT, MEDECIN, ADMIN)
- `Patient`: Patient-specific profile data
- `Medecin`: Doctor profiles with validation status and specialties
- `RendezVous`: Appointment system with multiple consultation types
- `Consultation`: Medical consultation records with encrypted sensitive data
- `Ordonnance`: Digital prescriptions with security features

**Important Enums**:
- `StatutValidation`: Doctor validation states (EN_ATTENTE, VALIDE, REJETE)
- `TypeConsultation`: DOMICILE, CLINIQUE, TELECONSULTATION
- `StatutRendezVous`: Appointment workflow states

### Response Patterns

All API responses follow standardized format via `ApiResponse` service:
```javascript
// Success response
{
  "success": true,
  "message": "Operation successful",
  "data": {...},
  "timestamp": "2024-01-15T14:30:22.123Z"
}

// Error response
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Error description",
  "timestamp": "2024-01-15T14:30:22.123Z"
}
```

### Middleware Usage Patterns

**Authentication & Authorization**:
```javascript
// Authenticate user and check role
AuthMiddleware.authenticate(),
AuthMiddleware.authorize(['PATIENT']),

// Doctors only (with validation status check)
AuthMiddleware.authenticate(),
AuthMiddleware.authorizeValidatedMedecin(),
```

**Request Validation**:
```javascript
// Validate request body with schema
BodyFilter.validate(schemaObject),
```

### Environment Configuration

**Multi-environment setup** via `config/const.js`:
- Development: Port 3000, dev JWT secret, SMS test mode
- Test: Port 3001, test JWT secret, SMS sandbox
- Production: Port 8080, prod JWT secret, real SMS API

**Required Environment Variables**:
```bash
DATABASE_URL="mysql://..."
JWT_SECRET_DEV="..."
JWT_SECRET_PROD="..."
LETEXTO_API_URL="..."
LETEXTO_API_KEY="..."
```

## Testing & Documentation

- **API Documentation**: Available at `/v1/api-docs` (Swagger UI)
- **Test Endpoints**: `/v1/info` for connectivity, `/v1/ping` for health check
- **Test Structure**: Unit tests in `/test/` directory

## Development Guidelines

**Creating New Endpoints**:
1. Define validation schema in route file
2. Create route in `/routes/` with proper middleware chain
3. Mount route in appropriate controller
4. Add Swagger documentation in `/swagger/`
5. Test endpoint manually and add automated tests

**Security Considerations**:
- Sensitive medical data is encrypted in database
- File uploads use file paths instead of URLs for security
- Role-based access control throughout the application
- OTP system with attempt limits and expiration