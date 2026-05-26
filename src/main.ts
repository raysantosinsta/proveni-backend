// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // HABILITAR CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Porta do frontend
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3001); // Mude para 3001 para não conflitar com frontend
}
bootstrap();
