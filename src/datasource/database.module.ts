import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: true, // desactivar en producción
        //dropSchema: true, // ELIMINA TODAS LAS TABLAS - Solo para desarrollo
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
