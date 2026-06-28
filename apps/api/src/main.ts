import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { assertJwtSecret } from './auth/secret'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Fail-fast: não sobe com segredo de auth ausente/fraco em produção.
  // (Depois do create() para o ConfigModule já ter carregado o .env.)
  assertJwtSecret()

  app.setGlobalPrefix('api')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  })

  const config = new DocumentBuilder()
    .setTitle('Nxt API')
    .setDescription('API do Nxt — plataforma de processos BPMN com módulos dinâmicos')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT || 3001
  await app.listen(port)
  console.log(`Nxt API rodando em http://localhost:${port}`)
  console.log(`Swagger docs em http://localhost:${port}/api/docs`)
}

bootstrap()
