import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const databaseUrl = process.env.DATABASE_URL;

        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            synchronize: true, // desactivar en producción
            //dropSchema: true, // ELIMINA TODAS LAS TABLAS - Solo para desarrollo
            autoLoadEntities: true,
          } as const;
        }

        return {
          type: 'postgres',
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          username: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || 'postgres',
          database: process.env.PGDATABASE || 'postgres',
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          synchronize: true, // desactivar en producción
          //dropSchema: true, // ELIMINA TODAS LAS TABLAS - Solo para desarrollo
          autoLoadEntities: true,
        } as const;
      },
    }),
  ],
})
export class DatabaseModule {}
