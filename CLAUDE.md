# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Plateforme Médecins-Patients** - API backend for doctor-patient platform in Côte d'Ivoire
- **Stack**: Node.js + Express.js, MySQL + Prisma ORM, JWT auth + OTP via SMS, LocalFileService
- **Author**: LYCORIS GROUP
- **Purpose**: Platform for connecting patients and doctors with appointment booking system
- **Status**: Production-ready with 38+ endpoints across 7 controllers
- **Features**: Complete medical platform with patient/doctor profiles, appointments, admin panel, file management

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
- **File Management**: LocalFileService for secure local file storage
- **Multi-role Auth**: Patient (OTP), Doctor (email/pass), Admin (email/pass)

### Key Directories Structure

```
├── bin/www                    # Server entry point with multi-env port config
├── config/
│   ├── const.js              # Global constants (JWT, SMS, OTP configs)
│   └── swagger.js            # API documentation configuration
├── controllers/              # Route orchestration by domain (7 controllers)
│   ├── AuthController.js     # Authentication routes
│   ├── AdminController.js    # Administration routes  
│   ├── MedecinController.js  # Doctor management
│   ├── PatientController.js  # Patient management
│   ├── DoctorController.js   # Doctor search/discovery
│   ├── AppointmentController.js # Appointment management
│   └── EvaluationController.js # Rating/review system
├── middleware/
│   ├── authMiddleware.js     # JWT authentication & role authorization
│   └── bodyFilterMiddleware.js # Request validation & sanitization
├── routes/                   # Specific endpoint implementations (38+ routes)
│   ├── v1.js                 # Main API router
│   ├── auth/                 # Auth routes (login, OTP, register, sessions)
│   ├── admin/                # Admin routes (doctors/cliniques management)
│   │   ├── doctors/          # Doctor admin (list, pending, validate, documents)
│   │   └── cliniques/        # Clinic management (CRUD)
│   ├── medecins/             # Doctor routes (profile, dashboard, photos)
│   ├── patients/             # Patient routes (profile, medical-data)
│   ├── doctors/              # Public doctor search (search, details)
│   ├── appointments/         # Appointment system (request, respond, cancel)
│   └── evaluations/          # Rating/review system
├── services/                 # Business logic & external integrations (6 services)
│   ├── ApiResponse.js        # Standardized HTTP responses
│   ├── TokenService.js       # JWT token management
│   ├── SmsService.js         # SMS integration (LeTexto API)
│   ├── LocalFileService.js   # Secure local file storage
│   ├── EmailService.js       # Email notifications
│   └── TemplateService.js    # Dynamic content templates
├── prisma/
│   ├── schema.prisma         # Database schema with extensive models
│   └── client.js             # Configured Prisma client instance
├── swagger/                  # OpenAPI 3.0 documentation files
│   ├── auth/                 # Authentication endpoints docs
│   ├── admin/                # Admin panel endpoints docs
│   ├── medecins/             # Doctor endpoints docs
│   ├── patients/             # Patient endpoints docs
│   ├── doctors/              # Public search endpoints docs
│   ├── appointments/         # Appointment system docs
│   ├── evaluations/          # Rating system docs
│   └── components/           # Reusable schemas
└── uploads/                  # Local file storage (secure)
    ├── medecins/             # Medical documents (diplomas, certificates)
    └── photos/               # Profile photos (doctors)
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
- `authorizeValidatedMedecin()` middleware for doctor-only endpoints

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
1. Define validation schema in route file using `BodyFilter.validate()`
2. Create route in `/routes/` with proper middleware chain
3. Mount route in appropriate controller
4. Add Swagger documentation in `/swagger/` following OpenAPI 3.0
5. Test endpoint manually and add automated tests

**Security Considerations**:
- Sensitive medical data is encrypted in database
- File uploads managed by `LocalFileService` with secure local storage
- Role-based access control throughout the application
- OTP system with attempt limits and expiration
- Photos restricted to validated doctors only (`authorizeValidatedMedecin`)

**File Management**:
- Use `LocalFileService` for all file operations (replaces old FileService)
- Supported types: PHOTO_PROFIL, PHOTO_CABINET, DIPLOME, CERTIFICATION
- Automatic directory structure: `uploads/photos/` and `uploads/medecins/`
- File validation: size limits, MIME types, image dimensions

**Current Endpoint Coverage**:
- **38+ endpoints** across 7 functional areas
- **Complete authentication** flow (OTP + traditional login)
- **Full CRUD** for patients, doctors, appointments, admin functions
- **File upload** for medical documents and profile photos
- **Advanced search** with filters and pagination
- **Rating/evaluation** system for doctor-patient feedback

## Key Patterns in This Codebase

**Authentication Middleware Usage**:
```javascript
// Standard pattern for protected endpoints
router.get('/endpoint',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT', 'MEDECIN']),
    async (req, res) => { /* logic */ }
);

// For validated doctors only (photos, advanced features)
router.post('/medecins/photo',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    AuthMiddleware.authorizeValidatedMedecin(),
    upload.single('photo'),
    async (req, res) => { /* logic */ }
);
```

**File Upload Pattern**:
```javascript
// Always use LocalFileService, never FileService
const LocalFileService = require('../../services/LocalFileService');

const uploadResult = await LocalFileService.uploadFile(
    buffer, originalname, mimetype, 'PHOTO_PROFIL', libelle
);

// Store with proper metadata
const fileData = {
    fileId: uploadResult.fileId,
    nom_fichier: uploadResult.filename,
    relative_path: uploadResult.relativePath,
    // ... other metadata
};
```

**API Response Pattern**:
```javascript
// Always use ApiResponse service for consistency
return ApiResponse.success(res, 'Success message', data);
return ApiResponse.badRequest(res, 'Error message', details);
return ApiResponse.notFound(res, 'Resource not found');
return ApiResponse.forbidden(res, 'Access denied');
return ApiResponse.serverError(res, 'Internal error');
```

**Current Development Status**:
- **Production ready** with comprehensive API coverage
- **All major features implemented** (auth, profiles, appointments, admin)
- **Secure file management** with LocalFileService
- **Complete validation** and error handling
- **Extensive Swagger documentation** for all endpoints