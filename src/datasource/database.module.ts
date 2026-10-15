import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantSubscriber } from '../multitenant/tenant-subscriber';
import { runtimePoolOptions } from './pool-options';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const databaseUrl = process.env.DATABASE_URL;
        const poolOptions = runtimePoolOptions();

        if (databaseUrl) {
          return {
            type: 'postgres',
            ...poolOptions,
            url: databaseUrl,
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            synchronize: false,
            migrationsRun: false,
            subscribers: [TenantSubscriber],
            migrations: [__dirname + '/migrations/*{.ts,.js}'],
            migrationsTransactionMode: 'each',
            //dropSchema: true, // ELIMINA TODAS LAS TABLAS - Solo para desarrollo
            autoLoadEntities: true,
          } as const;
        }

        return {
          type: 'postgres',
          ...poolOptions,
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          username:
            process.env.PG_RUNTIME_USER || process.env.PGUSER || 'postgres',
          password:
            process.env.PG_RUNTIME_PASSWORD ||
            process.env.PGPASSWORD ||
            'postgres',
          database: process.env.PGDATABASE || 'postgres',
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          synchronize: false,
          migrationsRun: false,
          subscribers: [TenantSubscriber],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsTransactionMode: 'each',
          //dropSchema: true, // ELIMINA TODAS LAS TABLAS - Solo para desarrollo
          autoLoadEntities: true,
        } as const;
      },
    }),
  ],
})
export class DatabaseModule {}
