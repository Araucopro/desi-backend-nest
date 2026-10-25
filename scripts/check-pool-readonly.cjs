// Run after build: node --env-file=.env scripts/check-pool-readonly.cjs
// Uses its own one-connection pool. Every session is read-only, including any
// accidental query via a global repository. Never runs migrations or seeds.
const assert = require('node:assert/strict');
const path = require('node:path');
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { OfferService } = require('../dist/pricing/offer.service');
const {
  SpecialOffer,
  SpecialOfferProduct,
  SpecialOfferBundleItem,
} = require('../dist/pricing/entities/special-offer.entity');
const { Category } = require('../dist/categories/entities/category.entity');
const { runtimePoolOptions } = require('../dist/datasource/pool-options');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = runtimePoolOptions({
    PG_POOL_MAX: '1',
    PG_CONNECTION_TIMEOUT_MS: '2000',
    PG_STATEMENT_TIMEOUT_MS: '500',
    PG_LOCK_TIMEOUT_MS: '300',
    PG_IDLE_TRANSACTION_TIMEOUT_MS: '10000',
    PG_APP_NAME: 'araucopro-pool-readonly-test',
  });
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [
      path.resolve(__dirname, '../dist/**/*.entity.js').replaceAll('\\', '/'),
    ],
    synchronize: false,
    migrationsRun: false,
    ...pool,
    extra: { ...pool.extra, options: '-c default_transaction_read_only=on' },
  });
  try {
    await ds.initialize();
    const offers = new OfferService(
      ds.getRepository(SpecialOffer),
      ds.getRepository(SpecialOfferProduct),
      ds.getRepository(SpecialOfferBundleItem),
      ds.getRepository(Category),
    );
    const nil = '00000000-0000-0000-0000-000000000000';
    const context = {
      storeID: nil,
      pricingDate: new Date(),
      items: [
        {
          storeProductID: nil,
          storeID: nil,
          productID: nil,
          variationID: nil,
          quantity: 1,
          unitPrice: 100,
        },
      ],
    };
    const started = Date.now();
    await ds.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        nil,
      ]);
      const [settings] = await manager.query(
        "SELECT current_setting('transaction_read_only') AS read_only, current_setting('statement_timeout') AS statement_timeout",
      );
      assert.equal(settings.read_only, 'on');
      assert.equal(settings.statement_timeout, '500ms');
      const catalogOffers = await offers.getApplicableOffersForItems(manager, [
        context,
      ]);
      assert.deepEqual(catalogOffers.get(nil), []);
      assert.deepEqual(
        await offers.getApplicableOffers(context, context.pricingDate, manager),
        [],
      );
    });
    console.log(
      JSON.stringify({
        check: 'catalog_and_cart_share_one_connection',
        passed: true,
        ms: Date.now() - started,
      }),
    );
    await assert.rejects(
      ds.query('SELECT pg_sleep(1)'),
      (error) => (error.driverError?.code || error.code) === '57014',
    );
    const [recovered] = await ds.query('SELECT 1 AS alive');
    assert.equal(recovered.alive, 1);
    console.log(
      JSON.stringify({
        check: 'server_cancels_query_and_pool_recovers',
        passed: true,
      }),
    );
  } finally {
    if (ds.isInitialized) await ds.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
