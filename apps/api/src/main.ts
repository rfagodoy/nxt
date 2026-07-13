import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { assertJwtSecret } from './auth/secret'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Fail-fast: não sobe com segredo de auth ausente/fraco em produção.
  // (Depois do create() para o ConfigModule já ter carregado o .env.)
  assertJwtSecret()

  // Cabeçalhos de segurança (HSTS, no-sniff, sem framing, sem referrer vazando).
  // A API é JSON-only e serve o Swagger só fora de produção; a CSP restritiva do
  // helmet não atrapalha JSON e é afrouxada apenas quando os docs sobem (dev).
  const docsEnabled = process.env.NODE_ENV !== 'production'
  app.use(
    helmet({
      contentSecurityPolicy: docsEnabled ? false : undefined,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  )

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

  // Swagger só fora de produção: em produção o mapa da API não deve ficar exposto.
  if (docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Nxt API')
      .setDescription('API do Nxt — plataforma de processos BPMN com módulos dinâmicos')
      .setVersion('1.0')
      .addBearerAuth()
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api/docs', app, document)
  }

  const port = process.env.PORT || 3001
  await app.listen(port)
  console.log(`Nxt API rodando em http://localhost:${port}`)
  if (docsEnabled) console.log(`Swagger docs em http://localhost:${port}/api/docs`)
}

bootstrap()
