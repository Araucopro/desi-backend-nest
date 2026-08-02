import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { RawServerDefault } from 'fastify';

export const swaggerConfig = (
  app: NestFastifyApplication<RawServerDefault>,
) => {
  const config = new DocumentBuilder()
    .setTitle('D3SI API')
    .setDescription('Backend API para la aplicación D3SI')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Ingrese el token JWT',
        in: 'header',
      },
      'access-token', // Este es el nombre del esquema de seguridad
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Aplicar seguridad global para que aparezca el candado en todos los endpoints por defecto
  // Esto evita tener que poner @ApiBearerAuth() en cada controlador
  document.security = [{ 'access-token': [] }];

  // UI tradicional de Swagger UI en /swagger
  SwaggerModule.setup('swagger', app, document, {
    jsonDocumentUrl: 'docs-json',
  });

  // UI moderna con Scalar Reference en /reference
  app.use(
    '/docs',
    apiReference({
      theme: 'bluePlanet',
      withFastify: true,
      showDeveloperTools: 'never',
      spec: {
        content: document,
      },
      agent: {
        disabled: true,
      },
      mcp: {
        disabled: true,
      },
    }),
  );
};
