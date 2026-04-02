import 'reflect-metadata'
import 'dotenv/config'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://rpl-front.vercel.app',
    'https://rpl-back.vercel.app',
  ]

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`), false)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })

  app.setGlobalPrefix('api')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  await app.listen(Number(process.env.PORT ?? 8000), '0.0.0.0')
}

bootstrap()