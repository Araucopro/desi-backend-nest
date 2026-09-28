import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/exceptions';
import { swaggerConfig } from './swagger';
import { FastifyReply, FastifyRequest } from 'fastify';

/** El filtro global de errores lee `requestId` para correlacionar respuesta y log. */
type RequestWithId = FastifyRequest & { requestId?: string };

const REQUEST_ID_HEADER = 'x-request-id';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      bufferLogs: true,
    },
  );
  app.useLogger(logger);

  const fastify = app.getHttpAdapter().getInstance();
  // Correlación request↔log: se acepta el id que envíe el cliente (proxy, app
  // móvil) o se genera uno. Queda en la respuesta para poder cruzar un error
  // reportado por el usuario con la línea exacta del backend.
  fastify.addHook(
    'onRequest',
    (request: RequestWithId, reply: FastifyReply, done) => {
      const incoming = request.headers[REQUEST_ID_HEADER];
      const requestId =
        (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() ||
        randomUUID();

      request.requestId = requestId;
      reply.header(REQUEST_ID_HEADER, requestId);
      done();
    },
  );
  fastify.addHook(
    'onRequest',
    (request: FastifyRequest, _reply: FastifyReply, done) => {
      logger.log(`${request.method} ${request.url}`);
      done();
    },
  );
  fastify.addHook(
    'onResponse',
    (request: FastifyRequest, reply: FastifyReply, done) => {
      logger.log(`${request.method} ${request.url} -> ${reply.statusCode}`);
      done();
    },
  );
  fastify.addHook(
    'onError',
    (request: FastifyRequest, _reply: FastifyReply, error, done) => {
      logger.error(`${request.method} ${request.url} -> ${error.message}`);
      done();
    },
  );

  logger.log('Initializing application...');
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const httpAdapter = app.get(HttpAdapterHost).httpAdapter;
  app.useGlobalInterceptors(new ResponseInterceptor(Reflector.prototype));
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina propiedades extra que no estén en el DTO
      forbidNonWhitelisted: true, // devuelve error si se envían campos no permitidos
      transform: true, // transforma payloads a los tipos definidos en cada DTOs
    }),
  );

  swaggerConfig(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`Application listening on http://0.0.0.0:${port}`);
}
void bootstrap();
