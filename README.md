# HAKO - Backend API

A robust, scalable RESTful API and WebSocket server built with Express.js 5, MongoDB, and Socket.io. This backend demonstrates enterprise-level practices including security, performance optimization, real-time communication, file handling, and scheduled tasks.

## 🚀 Key Features

- **RESTful API**: Well-structured REST API with proper HTTP methods and status codes
- **Real-time Communication**: Socket.io integration for instant messaging, notifications, and live updates
- **Authentication & Authorization**: JWT-based authentication with Google OAuth support
- **File Upload & Processing**: Cloudinary integration for image/video uploads and processing
- **Video Processing**: FFmpeg integration for video transcoding and manipulation
- **Scheduled Tasks**: Node-cron for automated tasks (story archiving, cleanup)
- **Caching**: API response caching for improved performance
- **Security**: Helmet, CORS, rate limiting, and input validation
- **Scalability**: Modular architecture for easy scaling and maintenance

## 🛠 Technology Stack

### Core Framework
- **Express.js 5.1.0** - Fast, unopinionated web framework
- **Node.js** - JavaScript runtime
- **ES Modules** - Modern JavaScript module system

### Database
- **MongoDB** - NoSQL database
- **Mongoose 8.14.1** - MongoDB object modeling

### Real-time Communication
- **Socket.io 4.8.1** - Real-time bidirectional communication
- **WebSocket** - Persistent connections for live updates

### Authentication & Security
- **JWT (jsonwebtoken)** - Token-based authentication
- **bcrypt** - Password hashing
- **Google Auth Library** - OAuth 2.0 authentication
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing

### File Handling
- **Cloudinary** - Cloud-based image and video management
- **Multer** - File upload middleware
- **FFmpeg (fluent-ffmpeg)** - Video processing and transcoding

### Performance & Optimization
- **API Cache** - Response caching middleware
- **Compression** - Response compression
- **Connection Pooling** - Database connection optimization

### Communication
- **Twilio** - Voice and video communication services

### Utilities
- **dotenv** - Environment variable management
- **node-cron** - Task scheduler
- **express-session** - Session management
- **cookie-parser** - Cookie parsing middleware

## 📁 Project Structure

```
bach-end/
├── config/                 # Configuration files
│   ├── db.config.js       # MongoDB connection configuration
│   └── cloudinary.config.js # Cloudinary configuration
├── controllers/            # Route controllers (business logic)
│   ├── auth.controller.js  # Authentication logic
│   ├── post.controller.js  # Post management
│   ├── user.controller.js  # User management
│   ├── messenger.controller.js # Messaging logic
│   ├── story.controller.js # Story management
│   └── notification.controller.js # Notifications
├── middlewares/            # Express middlewares
│   ├── auth.middleware.js  # JWT authentication
│   ├── cors.middleware.js  # CORS configuration
│   ├── helmet.middleware.js # Security headers
│   ├── compression.middleware.js # Response compression
│   ├── cache.middleware.js # API caching
│   └── socket.middleware.js # Socket.io setup
├── models/                 # Mongoose models
│   ├── user.model.js       # User schema
│   ├── post.model.js       # Post schema
│   ├── comment.model.js    # Comment schema
│   ├── messenger.model.js  # Message schema
│   ├── story.model.js      # Story schema
│   └── notification.model.js # Notification schema
├── routes/                 # API routes
│   ├── index.routes.js     # Route aggregator
│   ├── auth.routes.js      # Authentication routes
│   ├── user.routes.js      # User routes
│   ├── post.routes.js      # Post routes
│   ├── messenger.routes.js # Messaging routes
│   └── story.routes.js     # Story routes
├── server/                 # Socket.io services
│   ├── message.service.js  # Real-time messaging
│   ├── notification.service.js # Real-time notifications
│   ├── comment.service.js  # Real-time comments
│   └── call.service.js     # Video call signaling
├── helper/                 # Helper functions
│   ├── cloudinary.js       # Cloudinary utilities
│   ├── ScanStory.js        # Story archiving logic
│   └── buffUserPostHome.js # Data buffering
├── utils/                  # Utility functions
│   └── cloudinaryUpload.js # File upload utilities
└── app.js                  # Application entry point
```

## 🏗 Architecture & Design Patterns

### MVC Architecture
- **Models**: Mongoose schemas for data structure
- **Views**: JSON responses (RESTful API)
- **Controllers**: Business logic and request handling

### Middleware Pattern
- **Authentication Middleware**: JWT verification
- **Error Handling**: Centralized error handling
- **Request Validation**: Input validation and sanitization
- **Response Compression**: Gzip compression for responses
- **Caching**: API response caching

### Service Layer
- **Socket Services**: Real-time communication logic
- **File Services**: File upload and processing
- **Notification Services**: Push notification logic

### Database Design
- **Schema Design**: Optimized MongoDB schemas
- **Indexing**: Database indexes for query optimization
- **Relationships**: Proper document relationships
- **Data Validation**: Mongoose validation

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- MongoDB 6.x or higher (local or MongoDB Atlas)
- FFmpeg (for video processing)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone git@github.com:khoatnn/HAKO_BackEnd.git
cd HAKO_BackEnd

# Install dependencies
npm install

# Run development server
npm run server
```

The server will run on `http://localhost:5000`

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/instagram-clone

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Session
SESSION_SECRET=your_session_secret

# Twilio (for video calls)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
```

## 📜 Available Scripts

```bash
# Development server with nodemon
npm run server

# Production server
npm start
```

## 🔐 Authentication & Authorization

### JWT Authentication
- Token-based authentication
- Refresh token mechanism
- Token expiration handling
- Secure token storage

### OAuth 2.0
- Google OAuth integration
- Social login support
- User profile synchronization

### Authorization
- Role-based access control
- Protected routes
- Permission checking

## 🔄 Real-time Features

### Socket.io Integration
- **Real-time Messaging**: Instant message delivery
- **Notifications**: Live notification updates
- **Comments**: Real-time comment updates
- **Online Status**: User online/offline tracking
- **Typing Indicators**: Real-time typing status

### WebSocket Events
- Message events (send, receive, read)
- Notification events
- User status events
- Call signaling events

## 📤 File Upload & Processing

### Cloudinary Integration
- Image upload and optimization
- Video upload and transcoding
- Automatic format conversion
- CDN delivery

### Video Processing
- FFmpeg integration for video processing
- Video transcoding
- Thumbnail generation
- Format conversion

## ⏰ Scheduled Tasks

### Automated Tasks
- **Story Archiving**: Automatic story archiving after 24 hours
- **Data Cleanup**: Periodic cleanup of temporary files
- **Cache Invalidation**: Scheduled cache refresh

### Cron Jobs
- Daily story archiving
- Periodic data cleanup
- Cache management

## 🔒 Security Features

### Security Headers
- Helmet.js for security headers
- XSS protection
- CSRF protection
- Content Security Policy

### Input Validation
- Request validation
- Input sanitization
- SQL injection prevention
- XSS prevention

### Authentication Security
- Password hashing with bcrypt
- JWT token security
- Secure session management
- Rate limiting

## 📈 Performance Optimization

### Caching Strategy
- API response caching
- Database query optimization
- Connection pooling
- Response compression

### Database Optimization
- Index optimization
- Query optimization
- Aggregation pipelines
- Data pagination

### Server Optimization
- Response compression
- Connection pooling
- Async/await patterns
- Error handling

## 🧪 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/google` - Google OAuth login

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile
- `POST /api/users/:id/follow` - Follow user
- `POST /api/users/:id/unfollow` - Unfollow user

### Posts
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create post
- `GET /api/posts/:id` - Get post by ID
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like/unlike post

### Messaging
- `GET /api/messenger/conversations` - Get conversations
- `GET /api/messenger/messages/:conversationId` - Get messages
- `POST /api/messenger/send` - Send message

### Stories
- `GET /api/stories` - Get all stories
- `POST /api/stories` - Create story
- `GET /api/stories/:id` - Get story by ID

## 🚀 Deployment

### Production Considerations
- Environment variables
- Database connection pooling
- Error logging
- Performance monitoring
- Security headers
- HTTPS configuration

### Deployment Options
- **Docker**: Containerized deployment
- **Heroku**: Platform as a Service
- **AWS**: Cloud deployment
- **DigitalOcean**: VPS deployment
- **Self-hosted**: Custom server

## 📊 Monitoring & Logging

- Error logging
- Request logging
- Performance monitoring
- Database query logging
- Socket.io event logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Copyright © 2025 khoatnn. All rights reserved.

## 👤 Author

**khoatnn**

- 📧 Email: [tokhoatnn@gmail.com](mailto:tokhoatnn@gmail.com)
- 📘 Facebook: [khoatnn63](https://www.facebook.com/khoatnn63/)
- 💻 GitHub: [@khoatnn](https://github.com/khoatnn)

---

Built with ❤️ using Express.js, MongoDB, and Socket.io
