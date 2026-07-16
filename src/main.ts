import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());

  // Validacao global de todos os DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Tratamento de erro consistente
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS para o frontend. CORS_ORIGIN e obrigatorio: sem ele, nao habilita
  // nenhuma origem (nunca reflete "*" quando credentials: true esta ligado).
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');

  // Documentacao Swagger em /api/docs — desabilitada em producao por padrao
  // (evita expor o mapa completo de rotas). Defina SWAGGER_ENABLED=true para
  // forcar a exposicao mesmo em producao, se necessario.
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED') === 'true' || !isProduction;

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Vistoow API')
      .setDescription(
        'Backend do Vistoow - aprovacao de videos entre profissionais e clientes.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`Vistoow backend rodando em http://localhost:${port}/api`);
  if (swaggerEnabled) {
    console.log(`Swagger: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
