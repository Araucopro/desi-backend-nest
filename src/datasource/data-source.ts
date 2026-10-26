import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { migrationConnection } from './migration-connection';

export default new DataSource({
  type: 'postgres',
  ...migrationConnection(),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTransactionMode: 'each',
  synchronize: false,
});
