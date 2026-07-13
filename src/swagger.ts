import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
  });
};
