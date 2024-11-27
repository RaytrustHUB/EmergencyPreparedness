import express from 'express';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs/promises';

// Initialize environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security Configuration
const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://*", "/api/placeholder/*"],
            connectSrc: ["'self'", "https://api.openweathermap.org"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'none'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
};

// Cache Configuration
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const weatherCache = new Map();

// Rate Limiting Configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

// Middleware
app.use(helmet(helmetConfig));
app.use(compression());
app.use(express.json());
app.use(cors());
app.use(morgan('dev')); // Logging in development
app.use(express.static('public'));
app.use('/api', limiter);

// Weather Data Class
class WeatherData {
    constructor(city, description, temperature, humidity, windSpeed, alerts = [], icon = '') {
        this.city = city;
        this.description = description;
        this.temperature = temperature;
        this.humidity = humidity;
        this.windSpeed = windSpeed;
        this.alerts = alerts;
        this.icon = icon;
        this.timestamp = new Date();
        this.feels_like = null;
        this.sunrise = null;
        this.sunset = null;
    }

    isExpired() {
        return (new Date() - this.timestamp) > CACHE_DURATION;
    }

    toJSON() {
        return {
            city: this.city,
            description: this.description,
            temperature: this.temperature,
            humidity: this.humidity,
            windSpeed: this.windSpeed,
            alerts: this.alerts,
            icon: this.icon,
            feels_like: this.feels_like,
            sunrise: this.sunrise,
            sunset: this.sunset,
            timestamp: this.timestamp
        };
    }
}

// API Routes
app.get('/api/weather', async (req, res, next) => {
    try {
        const city = req.query.city || 'Vero Beach';
        const weatherData = await getWeatherData(city);
        res.json(weatherData);
    } catch (error) {
        next(error);
    }
});

app.get('/api/weather/alerts', async (req, res, next) => {
    try {
        const city = req.query.city || 'Vero Beach';
        const alerts = await getWeatherAlerts(city);
        res.json(alerts);
    } catch (error) {
        next(error);
    }
});

// Placeholder Image API
app.get('/api/placeholder/:width/:height', (req, res) => {
    const { width, height } = req.params;
    res.set('Content-Type', 'image/svg+xml');
    res.send(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#e0e0e0"/>
            <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#666" 
                  dominant-baseline="middle" text-anchor="middle">
                ${width}x${height}
            </text>
        </svg>
    `);
});

// Cache Management Routes
app.post('/api/weather/cache/clear', limiter, (req, res) => {
    weatherCache.clear();
    res.json({ message: 'Cache cleared successfully', timestamp: new Date() });
});

app.get('/api/weather/cache/status', (req, res) => {
    const cacheStatus = {
        size: weatherCache.size,
        cities: Array.from(weatherCache.keys()),
        oldestEntry: null,
        newestEntry: null
    };

    if (weatherCache.size > 0) {
        const entries = Array.from(weatherCache.values());
        cacheStatus.oldestEntry = new Date(Math.min(...entries.map(e => e.timestamp)));
        cacheStatus.newestEntry = new Date(Math.max(...entries.map(e => e.timestamp)));
    }

    res.json(cacheStatus);
});

// Weather Data Functions
async function getWeatherData(city) {
    // Check cache first
    const cachedData = weatherCache.get(city);
    if (cachedData && !cachedData.isExpired()) {
        return cachedData;
    }

    try {
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) {
            throw new Error('OpenWeather API key not configured');
        }

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Weather API error: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();

        const weatherData = new WeatherData(
            city,
            data.weather[0].description,
            Math.round(data.main.temp),
            data.main.humidity,
            Math.round(data.wind.speed),
            [],
            data.weather[0].icon
        );

        // Add additional data
        weatherData.feels_like = Math.round(data.main.feels_like);
        weatherData.sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString();
        weatherData.sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString();

        // Update cache
        weatherCache.set(city, weatherData);

        return weatherData;
    } catch (error) {
        console.error('Error fetching weather data:', error);
        throw new Error('Failed to fetch weather data');
    }
}

// Error Handler Middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    const statusCode = err.statusCode || 500;
    const errorResponse = {
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    };
    res.status(statusCode).json(errorResponse);
};

app.use(errorHandler);

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cache: {
            size: weatherCache.size,
            keys: Array.from(weatherCache.keys())
        }
    });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Cleanup function for cache management
function cleanupExpiredCache() {
    for (const [city, data] of weatherCache.entries()) {
        if (data.isExpired()) {
            weatherCache.delete(city);
        }
    }
}

// Run cache cleanup every 30 minutes
setInterval(cleanupExpiredCache, 30 * 60 * 1000);