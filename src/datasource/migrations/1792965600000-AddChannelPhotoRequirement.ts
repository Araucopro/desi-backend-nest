import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelPhotoRequirement1792965600000 implements MigrationInterface {
  name = 'AddChannelPhotoRequirement1792965600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "commerce_channels" ADD COLUMN "requireProductPhoto" boolean NOT NULL DEFAULT true',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "commerce_channels" DROP COLUMN "requireProductPhoto"',
    );
  }
}
