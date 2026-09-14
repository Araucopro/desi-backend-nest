import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788876959883 implements MigrationInterface {
  name = 'InitialSchema1788876959883';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."Store_type_enum" AS ENUM('central', 'franchise', 'consignment', 'third_party')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Store" ("storeID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "location" character varying(255) NOT NULL, "rut" character varying(255) NOT NULL, "address" character varying(255) NOT NULL, "phone" character varying(255) NOT NULL, "city" character varying(255) NOT NULL, "storeImg" character varying(255), "email" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "type" "public"."Store_type_enum" NOT NULL, "isCentralStore" boolean NOT NULL DEFAULT false, "giro" character varying(255), "acteco" character varying(255), "cdgSIISucur" character varying(64), "businessName" character varying(255), "openfacturaKeyEncrypted" text, "hasOpenfacturaKey" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2d4b489e686ed3dd1ad2acb5f03" UNIQUE ("email"), CONSTRAINT "UQ_9eaca0d487c79c671de2e536066" UNIQUE ("name"), CONSTRAINT "PK_65eb5f1ca615d2f3d232424f468" PRIMARY KEY ("storeID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "UserStore" ("userStoreID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userID" uuid, "storeID" uuid, CONSTRAINT "PK_1ca2c92e4b5a2ff9ecd28a5fc6a" PRIMARY KEY ("userStoreID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("key" character varying(128) NOT NULL, "subject" character varying(64) NOT NULL, "action" character varying(64) NOT NULL, "supportsOwnScope" boolean NOT NULL DEFAULT false, "description" character varying(255) NOT NULL, CONSTRAINT "PK_017943867ed5ceef9c03edd9745" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."role_permissions_scope_enum" AS ENUM('OWN', 'ALL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "roleID" uuid NOT NULL, "permissionKey" character varying(128) NOT NULL, "scope" "public"."role_permissions_scope_enum" NOT NULL, CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_889434a7b92876d72da549856a" ON "role_permissions" ("tenantID", "roleID", "permissionKey") `,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "name" character varying(128) NOT NULL, "systemKey" character varying(32), "isSystem" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6e5a5ea2644a1ebcf8f90e4c93" ON "roles" ("tenantID", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f682684a3f375f5fde166e9f86" ON "roles" ("tenantID", "systemKey") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_487edbb2cabb97bab288d0cbea" ON "roles" ("tenantID", "name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Users_role_enum" AS ENUM('admin', 'store_manager', 'consignado', 'tercero', 'system')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Users" ("userID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "roleID" uuid NOT NULL, "email" character varying(128) NOT NULL, "name" character varying(128) NOT NULL, "role" "public"."Users_role_enum" NOT NULL, "isSystem" boolean NOT NULL DEFAULT false, "status" character varying(20) NOT NULL DEFAULT 'ACTIVE', "userImg" character varying(255), "password" character varying(255) NOT NULL, "sessionVersion" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3c3ab3f49a87e6ddb607f3c4945" UNIQUE ("email"), CONSTRAINT "PK_8868528e8a518a818a473f9af9d" PRIMARY KEY ("userID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("categoryID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "parentID" uuid, "name" character varying NOT NULL, CONSTRAINT "PK_13da6162629fdaeccef5b784271" PRIMARY KEY ("categoryID"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Products_genre_enum" AS ENUM('Hombre', 'Mujer', 'Unisex')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Products" ("productID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "image" character varying(255), "categoryID" uuid, "name" character varying(255) NOT NULL, "brand" character varying(255), "genre" "public"."Products_genre_enum", "description" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_26c9336d231c4e90419a5954bd7" UNIQUE ("name"), CONSTRAINT "PK_cee3090c5bf0e01a28338ed1ecc" PRIMARY KEY ("productID"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SpecialOffer_targetscope_enum" AS ENUM('VARIATION', 'STORE', 'PRODUCT', 'CATEGORY', 'BRAND', 'MODEL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SpecialOffer_discounttype_enum" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE', 'BUY_X_GET_Y', 'BUNDLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SpecialOffer_scope_enum" AS ENUM('UNIT', 'TOTAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "SpecialOffer" ("offerID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeProductID" uuid, "targetScope" "public"."SpecialOffer_targetscope_enum" NOT NULL DEFAULT 'VARIATION', "storeID" uuid, "productID" uuid, "categoryID" uuid, "includeSubcategories" boolean NOT NULL DEFAULT true, "brand" character varying(255), "model" character varying(255), "buyQuantity" integer, "payQuantity" integer, "priority" integer NOT NULL DEFAULT '0', "description" character varying(255), "discountType" "public"."SpecialOffer_discounttype_enum" NOT NULL, "value" numeric(10,2) NOT NULL, "scope" "public"."SpecialOffer_scope_enum" NOT NULL DEFAULT 'UNIT', "exclusive" boolean NOT NULL DEFAULT false, "allowBelowMargin" boolean NOT NULL DEFAULT false, "startDate" TIMESTAMP WITH TIME ZONE NOT NULL, "endDate" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9b8d9e3ba32d596330827f472d7" PRIMARY KEY ("offerID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "SpecialOfferProduct" ("specialOfferProductID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "offerID" uuid NOT NULL, "productID" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e89316c0bd090403cdf9403961f" PRIMARY KEY ("specialOfferProductID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "SpecialOfferBundleItem" ("specialOfferBundleItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "offerID" uuid NOT NULL, "productID" uuid, "storeProductID" uuid, "requiredQuantity" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_896707760c3018bba9b2b9a71e8" PRIMARY KEY ("specialOfferBundleItemID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "StoreProduct" ("storeProductID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "stock" integer NOT NULL DEFAULT '0', "stockDefective" integer NOT NULL DEFAULT '0', "priceCost" numeric(10,2) NOT NULL, "priceList" numeric(10,2), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "storeID" uuid, "variationID" uuid, CONSTRAINT "PK_fe5809a9b57c6630c704e7dca79" PRIMARY KEY ("storeProductID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ca1b99fd1bba175712306da302" ON "StoreProduct" ("variationID", "storeID") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ProductVariations" ("variationID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "sku" character varying(255) NOT NULL, "color" character varying(100), "size" character varying(100), "supplierSku" character varying(255), "barcode" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productID" uuid, CONSTRAINT "UQ_1b03beb7ee7f71b71ef1bbc792b" UNIQUE ("sku"), CONSTRAINT "PK_26db5891b7981775cc5a25092b0" PRIMARY KEY ("variationID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1b03beb7ee7f71b71ef1bbc792" ON "ProductVariations" ("sku") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1ebbb115a2fa61866f0985b9f" ON "ProductVariations" ("barcode") `,
    );
    await queryRunner.query(
      `CREATE TABLE "StoreTransferItems" ("transferItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "quantity" integer NOT NULL, "transferID" uuid, "variationID" uuid, CONSTRAINT "CHK_4edc41df8329de5c2b114137f8" CHECK ("quantity" > 0), CONSTRAINT "PK_2fefe95dead0f5b0c4f084d190c" PRIMARY KEY ("transferItemID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c583a59a7ea1476e04d8f56353" ON "StoreTransferItems" ("transferID", "variationID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."StoreTransfers_status_enum" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "StoreTransfers" ("transferID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "status" "public"."StoreTransfers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP, "originStoreID" uuid, "destinationStoreID" uuid, CONSTRAINT "CHK_187d5547d693d2e8ed4d403b30" CHECK ("originStoreID" <> "destinationStoreID"), CONSTRAINT "PK_97aa02d616787eb369258ffeb4b" PRIMARY KEY ("transferID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "StoreMonthlyTarget" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "period" date NOT NULL, "targetAmount" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "storeID" uuid, CONSTRAINT "PK_2c48470448cd3dd96356e7beaad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d659ab6d32731bc70aacf7bf65" ON "StoreMonthlyTarget" ("storeID", "period") `,
    );
    await queryRunner.query(
      `CREATE TABLE "PurchaseOrderItem" ("purchaseOrderItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "unitPrice" numeric(10,2) NOT NULL, "subtotal" numeric(12,2) NOT NULL, "quantityRequested" integer NOT NULL, "quantityReceived" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "purchaseOrderID" uuid, "variationID" uuid, CONSTRAINT "PK_6ed6f43a0c3b7452f66d9303380" PRIMARY KEY ("purchaseOrderItemID"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PurchaseOrder_paymentstatus_enum" AS ENUM('Pagado', 'Pendiente', 'Anulado')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PurchaseOrder_status_enum" AS ENUM('Pendiente', 'Enviado', 'Aceptado', 'Rechazado')`,
    );
    await queryRunner.query(
      `CREATE TABLE "PurchaseOrder" ("purchaseOrderID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "folio" character varying(50) NOT NULL, "paymentStatus" "public"."PurchaseOrder_paymentstatus_enum" NOT NULL DEFAULT 'Pendiente', "status" "public"."PurchaseOrder_status_enum" NOT NULL DEFAULT 'Pendiente', "isThirdParty" boolean NOT NULL DEFAULT false, "issueDate" date NOT NULL, "dueDate" date, "paidAt" TIMESTAMP WITH TIME ZONE, "totalProducts" integer NOT NULL DEFAULT '0', "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "discount" numeric(12,2) NOT NULL DEFAULT '0', "netTotal" numeric(12,2) NOT NULL DEFAULT '0', "tax" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "storeID" uuid, CONSTRAINT "UQ_2f5fcd204c1e6308df85b3e0013" UNIQUE ("folio"), CONSTRAINT "PK_801a93c96d87b4b688ba828b214" PRIMARY KEY ("purchaseOrderID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2f5fcd204c1e6308df85b3e001" ON "PurchaseOrder" ("folio") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."DteDocument_status_enum" AS ENUM('EMITIDO', 'PENDIENTE', 'ERROR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."DteDocument_paymenttype_enum" AS ENUM('Efectivo', 'Debito', 'Credito')`,
    );
    await queryRunner.query(
      `CREATE TABLE "DteDocument" ("dteDocumentID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "idempotencyKey" character varying(128), "apikey" character varying(255) NOT NULL, "token" character varying(64) NOT NULL, "folio" integer NOT NULL, "storeID" uuid NOT NULL, "purchaseOrderID" uuid, "saleID" uuid, "stockReserved" boolean NOT NULL DEFAULT true, "status" "public"."DteDocument_status_enum" NOT NULL DEFAULT 'PENDIENTE', "documentType" integer, "paymentType" "public"."DteDocument_paymenttype_enum" NOT NULL DEFAULT 'Efectivo', "total" numeric(10,2) NOT NULL, "netTotal" numeric(12,2) NOT NULL DEFAULT '0', "taxTotal" numeric(12,2) NOT NULL DEFAULT '0', "cogsTotal" numeric(12,2) NOT NULL DEFAULT '0', "errorDetail" text, "issueDate" date NOT NULL, "payloadRaw" jsonb NOT NULL, "payloadNormalized" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_77415330f10d08ce24df41ccc5" UNIQUE ("purchaseOrderID"), CONSTRAINT "PK_6420319df751f9a796290f62d22" PRIMARY KEY ("dteDocumentID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_587eecb1a8bf512f111c06a6dd" ON "DteDocument" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_77415330f10d08ce24df41ccc5" ON "DteDocument" ("purchaseOrderID") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7dc9d21753c05a87645e00e7a5" ON "DteDocument" ("saleID") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9cd0413a05671786f6d2044bec" ON "DteDocument" ("storeID", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "SaleItem" ("saleItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "saleID" uuid NOT NULL, "storeProductID" uuid NOT NULL, "variationID" uuid NOT NULL, "productName" character varying(255) NOT NULL, "sku" character varying(255) NOT NULL, "quantity" integer NOT NULL, "unitPrice" numeric(10,2) NOT NULL, "unitCost" numeric(10,2) NOT NULL DEFAULT '0', "lineTotal" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dc5ee0c4185568eada9d74a9ffb" PRIMARY KEY ("saleItemID"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0d8e0643f985e47adf9526d9b6" ON "SaleItem" ("tenantID", "saleID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Client_segment_enum" AS ENUM('RETAIL', 'WHOLESALE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Client" ("clientID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "rut" character varying(20) NOT NULL, "name" character varying(255) NOT NULL, "giro" character varying(255), "address" character varying(255), "city" character varying(255), "email" character varying(255), "phone" character varying(50), "segment" "public"."Client_segment_enum" NOT NULL DEFAULT 'RETAIL', "notes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_03c9a7b122ae76e8e05c8cc0858" PRIMARY KEY ("clientID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90099d6c85a3b87f46c3e08c8c" ON "Client" ("tenantID", "rut") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_99c9c147f1cf2314f2e2cab058" ON "Client" ("tenantID", "clientID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Sale_saletype_enum" AS ENUM('BOLETA', 'FACTURA', 'NOTA_VENTA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Sale_status_enum" AS ENUM('EMITIDA', 'CONVERTIDA', 'ANULADA', 'DEVUELTA', 'CORREGIDA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Sale_paymenttype_enum" AS ENUM('Efectivo', 'Debito', 'Credito')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Sale" ("saleID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "userID" uuid NOT NULL, "impersonatedBy" uuid, "saleType" "public"."Sale_saletype_enum" NOT NULL, "status" "public"."Sale_status_enum" NOT NULL DEFAULT 'EMITIDA', "paymentType" "public"."Sale_paymenttype_enum" NOT NULL, "folio" integer, "issueDate" date NOT NULL, "receiver" jsonb, "clientID" uuid, "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "discount" numeric(12,2) NOT NULL DEFAULT '0', "netTotal" numeric(12,2) NOT NULL DEFAULT '0', "taxTotal" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "cogsTotal" numeric(12,2) NOT NULL DEFAULT '0', "dteDocumentID" uuid, "idempotencyKey" character varying(128), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_ab06116220ebdd1f643e25b06a" UNIQUE ("dteDocumentID"), CONSTRAINT "PK_7350bc9b593d2624446971dfac0" PRIMARY KEY ("saleID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ab06116220ebdd1f643e25b06a" ON "Sale" ("dteDocumentID") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_14b43659f059c77870c1b0e475" ON "Sale" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f9ab3c4f2b47278dd20ee2d1ee" ON "Sale" ("tenantID", "clientID") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f29b4e50639a9ba5b5f2e4a164" ON "Sale" ("tenantID", "saleType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d76aab695cab641ad3a37a4aff" ON "Sale" ("tenantID", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_34ae23558ce4be8eb08e58ca1a" ON "Sale" ("tenantID", "storeID", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "SaleFolioCounter" ("saleFolioCounterID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "currentFolio" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ab97bcab98656b9455025a96f0f" PRIMARY KEY ("saleFolioCounterID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_81bbbc708708fd1d60326cae4f" ON "SaleFolioCounter" ("tenantID", "storeID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ReturnItem_condition_enum" AS ENUM('SELLABLE', 'DEFECTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ReturnItem" ("returnItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "returnID" uuid NOT NULL, "saleItemID" uuid NOT NULL, "storeProductID" uuid NOT NULL, "variationID" uuid NOT NULL, "productName" character varying(255) NOT NULL, "sku" character varying(255) NOT NULL, "quantity" integer NOT NULL, "unitPrice" numeric(10,2) NOT NULL, "unitCost" numeric(10,2) NOT NULL DEFAULT '0', "lineTotal" numeric(12,2) NOT NULL, "condition" "public"."ReturnItem_condition_enum" NOT NULL DEFAULT 'SELLABLE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5353ae05be8614920711d5d310a" PRIMARY KEY ("returnItemID"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bccc55ebb87d22b5e5cc38cb0e" ON "ReturnItem" ("tenantID", "returnID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Return_returntype_enum" AS ENUM('TOTAL', 'PARCIAL', 'DESCUENTO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Return_status_enum" AS ENUM('PENDIENTE', 'APROBADA', 'COMPLETADA', 'RECHAZADA', 'CANCELADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Return" ("returnID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "saleID" uuid NOT NULL, "returnType" "public"."Return_returntype_enum" NOT NULL, "status" "public"."Return_status_enum" NOT NULL DEFAULT 'PENDIENTE', "reason" text, "discountAmount" numeric(12,2) NOT NULL DEFAULT '0', "folio" integer, "dteDocumentID" uuid, "issueDate" date NOT NULL, "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "netTotal" numeric(12,2) NOT NULL DEFAULT '0', "taxTotal" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "cogsTotal" numeric(12,2) NOT NULL DEFAULT '0', "userID" uuid NOT NULL, "impersonatedBy" uuid, "approvedBy" uuid, "approvedAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "idempotencyKey" character varying(128), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_15a7f03b6851c82b25e5aad3ce" UNIQUE ("dteDocumentID"), CONSTRAINT "PK_168d1c3a9247428be7077a7a5c5" PRIMARY KEY ("returnID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_15a7f03b6851c82b25e5aad3ce" ON "Return" ("dteDocumentID") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4556f13f77ff1fce9d2be68071" ON "Return" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5dc4e5c7b2851e947d580adad2" ON "Return" ("tenantID", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b289e1d0ad2916e561b356ac6f" ON "Return" ("tenantID", "saleID") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1fc47672e2361a7b05c65b0ba" ON "Return" ("tenantID", "storeID", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ReturnFolioCounter" ("returnFolioCounterID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "currentFolio" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c1ebb0d1b81425081539a5bb5e2" PRIMARY KEY ("returnFolioCounterID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cc6afa5492cd876be6610b559f" ON "ReturnFolioCounter" ("tenantID", "storeID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PriceHistory_pricetype_enum" AS ENUM('cost', 'list')`,
    );
    await queryRunner.query(
      `CREATE TABLE "PriceHistory" ("historyID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "priceType" "public"."PriceHistory_pricetype_enum" NOT NULL, "oldPrice" numeric(10,2) NOT NULL, "newPrice" numeric(10,2) NOT NULL, "reason" character varying, "effectiveDate" TIMESTAMP NOT NULL DEFAULT now(), "changedBy" character varying, "storeProductID" uuid, CONSTRAINT "PK_85b9641669be1028faade4a3d32" PRIMARY KEY ("historyID"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tenants_status_enum" AS ENUM('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tenants_plantype_enum" AS ENUM('BASIC', 'STANDARD', 'ENTERPRISE', 'CUSTOM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenants" ("tenantID" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(160) NOT NULL, "slug" character varying(80) NOT NULL, "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'PROVISIONING', "maxStores" integer NOT NULL DEFAULT '5', "maxUsers" integer NOT NULL DEFAULT '5', "planType" "public"."tenants_plantype_enum" NOT NULL DEFAULT 'STANDARD', "subscriptionExpiresAt" TIMESTAMP WITH TIME ZONE, "autoRenew" boolean NOT NULL DEFAULT true, "timeZone" character varying(64) NOT NULL DEFAULT 'America/Santiago', "locale" character varying(8) NOT NULL DEFAULT 'es-CL', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_f9adcf2aab263d236a4d2d4d574" PRIMARY KEY ("tenantID"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."master_users_role_enum" AS ENUM('SUPER_ADMIN', 'SUPPORT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "master_users" ("masterUserID" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(128) NOT NULL, "password" character varying(255) NOT NULL, "role" "public"."master_users_role_enum" NOT NULL, "sessionVersion" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e54f163f206939ba0a65fd6920a" UNIQUE ("email"), CONSTRAINT "PK_98efd5aa9b7d6b5b3f320cf127b" PRIMARY KEY ("masterUserID"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_events" ("auditEventID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid, "masterUserID" uuid, "action" character varying(16) NOT NULL, "endpoint" character varying(255) NOT NULL, "reason" text, "result" character varying(32) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_04fe3506c071bd13e0804fa6b33" PRIMARY KEY ("auditEventID"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1bc6a5900cfe267e033ecb4651" ON "audit_events" ("tenantID", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."InventoryMovements_reason_enum" AS ENUM('SALE', 'PURCHASE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN', 'DISPATCH_GUIDE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."InventoryMovements_condition_enum" AS ENUM('SELLABLE', 'DEFECTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "InventoryMovements" ("movementID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "delta" integer NOT NULL, "reason" "public"."InventoryMovements_reason_enum" NOT NULL, "referenceID" character varying, "condition" "public"."InventoryMovements_condition_enum", "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "storeID" uuid, "variationID" uuid, CONSTRAINT "PK_90c6f23479377c2f091edd3aa29" PRIMARY KEY ("movementID"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."FinancialMovement_direction_enum" AS ENUM('INGRESO', 'EGRESO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."FinancialMovement_category_enum" AS ENUM('VENTA', 'COSTO_VENTA', 'COMPRA', 'GASTO_OPERACIONAL', 'GASTO_ADMINISTRATIVO', 'GASTO_FINANCIERO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."FinancialMovement_sourcetype_enum" AS ENUM('DTE_DOCUMENT', 'PURCHASE_ORDER', 'EXPENSE', 'SALE_NOTE', 'RETURN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "FinancialMovement" ("financialMovementID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "date" date NOT NULL, "direction" "public"."FinancialMovement_direction_enum" NOT NULL, "category" "public"."FinancialMovement_category_enum" NOT NULL, "amount" numeric(12,2) NOT NULL, "taxAmount" numeric(12,2) NOT NULL DEFAULT '0', "taxCredit" boolean NOT NULL DEFAULT false, "acceptedForTax" boolean NOT NULL DEFAULT true, "sourceType" "public"."FinancialMovement_sourcetype_enum" NOT NULL, "sourceID" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_306b3e80deac9f5b87ccd5e1433" PRIMARY KEY ("financialMovementID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cc4f99161d25e4e826bed9b5d0" ON "FinancialMovement" ("tenantID", "sourceType", "sourceID", "category") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2b073e594f4460a7f23485bc2f" ON "FinancialMovement" ("tenantID", "storeID", "date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ed1e03539886f13ad37247499" ON "FinancialMovement" ("tenantID", "date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Expense_type_enum" AS ENUM('financial', 'operational', 'administrative')`,
    );
    await queryRunner.query(
      `CREATE TABLE "Expense" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "name" character varying(255) NOT NULL, "deductibleDate" TIMESTAMP WITH TIME ZONE NOT NULL, "amount" numeric(10,2) NOT NULL, "netAmount" numeric(12,2) NOT NULL DEFAULT '0', "taxAmount" numeric(12,2) NOT NULL DEFAULT '0', "acceptedForTax" boolean NOT NULL DEFAULT true, "taxCredit" boolean NOT NULL DEFAULT true, "supportDocument" character varying(255), "type" "public"."Expense_type_enum" NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "storeID" uuid, CONSTRAINT "PK_fb42c5db1dfc3d1e57fd9118bf1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "DispatchGuideItem" ("dispatchGuideItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "dispatchGuideID" uuid NOT NULL, "storeProductID" uuid NOT NULL, "variationID" uuid NOT NULL, "productName" character varying(255) NOT NULL, "sku" character varying(255) NOT NULL, "quantity" integer NOT NULL, "unitPrice" numeric(10,2) NOT NULL, "unitCost" numeric(10,2) NOT NULL DEFAULT '0', "lineTotal" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6f5234917afde195e643c795f9f" PRIMARY KEY ("dispatchGuideItemID"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_28189940b910ec7a6d0e5a324c" ON "DispatchGuideItem" ("dispatchGuideID") `,
    );
    await queryRunner.query(
      `CREATE TABLE "DispatchGuideReferenceItem" ("dispatchGuideReferenceItemID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "dispatchGuideReferenceID" uuid NOT NULL, "dispatchGuideID" uuid NOT NULL, "variationID" uuid NOT NULL, "quantity" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dc5a88042cd3516307fd86b4e5a" PRIMARY KEY ("dispatchGuideReferenceItemID"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5ba4d8187b48e86fb240a4161d" ON "DispatchGuideReferenceItem" ("tenantID", "dispatchGuideID") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_72c390dfc610c31789b9596bc0" ON "DispatchGuideReferenceItem" ("tenantID", "dispatchGuideReferenceID") `,
    );
    await queryRunner.query(
      `CREATE TABLE "DispatchGuideReference" ("dispatchGuideReferenceID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "dispatchGuideID" uuid NOT NULL, "dteDocumentID" uuid NOT NULL, "saleID" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_eda24e7ea05afd1718052380cc1" PRIMARY KEY ("dispatchGuideReferenceID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_65ec9ac46d81229d6157e0bbe2" ON "DispatchGuideReference" ("dispatchGuideID", "dteDocumentID") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."DispatchGuide_status_enum" AS ENUM('PENDIENTE', 'EMITIDA', 'ANULACION_PENDIENTE', 'ANULADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "DispatchGuide" ("dispatchGuideID" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "userID" uuid NOT NULL, "impersonatedBy" uuid, "status" "public"."DispatchGuide_status_enum" NOT NULL DEFAULT 'PENDIENTE', "folio" integer, "dteDocumentID" uuid, "idempotencyKey" character varying(128), "issueDate" date NOT NULL, "indTraslado" character varying(1) NOT NULL DEFAULT '1', "includePrices" boolean NOT NULL DEFAULT true, "receiver" jsonb NOT NULL, "clientID" uuid, "destination" jsonb NOT NULL, "transport" jsonb, "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "discount" numeric(12,2) NOT NULL DEFAULT '0', "netTotal" numeric(12,2) NOT NULL DEFAULT '0', "taxTotal" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "cogsTotal" numeric(12,2) NOT NULL DEFAULT '0', "payloadRaw" jsonb, "errorDetail" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_ac57c40f468d269b1477617b02" UNIQUE ("dteDocumentID"), CONSTRAINT "PK_6022f0c7495446e7d588052ef58" PRIMARY KEY ("dispatchGuideID"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ac57c40f468d269b1477617b02" ON "DispatchGuide" ("dteDocumentID") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e16ed54b0ffda8866f3ecc3f3f" ON "DispatchGuide" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b5281cf1f144c7c05f3f39b9cb" ON "DispatchGuide" ("tenantID", "clientID") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f72eeefa541e4dea3ffae46a3a" ON "DispatchGuide" ("tenantID", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5b0afb18f954cd95fd59cf315a" ON "DispatchGuide" ("tenantID", "storeID", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" ADD CONSTRAINT "FK_d380e84e192a8eab49140873df1" FOREIGN KEY ("userID") REFERENCES "Users"("userID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" ADD CONSTRAINT "FK_4697b9ad809292e7759c12eb102" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_e4639f49c5ce9ea4812dc3910f3" FOREIGN KEY ("tenantID", "roleID") REFERENCES "roles"("tenantID","id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_098b15d566b7f8b9f74d8c67b86" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Users" ADD CONSTRAINT "FK_95a1667bfd07030a7ba94cfeda2" FOREIGN KEY ("tenantID", "roleID") REFERENCES "roles"("tenantID","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_d5e31feaf3ce60ee212a183e7b1" FOREIGN KEY ("parentID") REFERENCES "categories"("categoryID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Products" ADD CONSTRAINT "FK_f18556f4a389d8042ba98600aa5" FOREIGN KEY ("categoryID") REFERENCES "categories"("categoryID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" ADD CONSTRAINT "FK_b66cc8940bd189c6717fd573c72" FOREIGN KEY ("storeProductID") REFERENCES "StoreProduct"("storeProductID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" ADD CONSTRAINT "FK_67dfe3ae5dd63f425f4eada6410" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" ADD CONSTRAINT "FK_b0811d670f300a75cfbe7978f10" FOREIGN KEY ("productID") REFERENCES "Products"("productID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" ADD CONSTRAINT "FK_0f205ddadd9a8a0aacc604f05b5" FOREIGN KEY ("categoryID") REFERENCES "categories"("categoryID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferProduct" ADD CONSTRAINT "FK_c49572aea72a4aa886d7729331b" FOREIGN KEY ("offerID") REFERENCES "SpecialOffer"("offerID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferProduct" ADD CONSTRAINT "FK_a8770195702e8d69975614b4ddb" FOREIGN KEY ("productID") REFERENCES "Products"("productID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferBundleItem" ADD CONSTRAINT "FK_53c8762d42f4c40c6c9df6dd22c" FOREIGN KEY ("offerID") REFERENCES "SpecialOffer"("offerID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferBundleItem" ADD CONSTRAINT "FK_0298abb1a2821b83bb5e6d76f54" FOREIGN KEY ("productID") REFERENCES "Products"("productID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferBundleItem" ADD CONSTRAINT "FK_9f32486e3f2312019944a9d7af0" FOREIGN KEY ("storeProductID") REFERENCES "StoreProduct"("storeProductID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreProduct" ADD CONSTRAINT "FK_4a6d22ffec5fbb874467af52db1" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreProduct" ADD CONSTRAINT "FK_0cd49c6a2e2fee34a6d8b54af8d" FOREIGN KEY ("variationID") REFERENCES "ProductVariations"("variationID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" ADD CONSTRAINT "FK_7efcba0a1152431f333e39cd7e3" FOREIGN KEY ("productID") REFERENCES "Products"("productID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransferItems" ADD CONSTRAINT "FK_0113798c5789308f7fde976d888" FOREIGN KEY ("transferID") REFERENCES "StoreTransfers"("transferID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransferItems" ADD CONSTRAINT "FK_786fe05e6e5ef559323b6e1da17" FOREIGN KEY ("variationID") REFERENCES "ProductVariations"("variationID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransfers" ADD CONSTRAINT "FK_00f26edb487ed3f4e43933e1bf1" FOREIGN KEY ("originStoreID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransfers" ADD CONSTRAINT "FK_7764bd05844c8e32e18872f4e4a" FOREIGN KEY ("destinationStoreID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreMonthlyTarget" ADD CONSTRAINT "FK_c2547b254293de61d6a6e953e5b" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "FK_172416607c9683586dea0d05c1a" FOREIGN KEY ("purchaseOrderID") REFERENCES "PurchaseOrder"("purchaseOrderID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "FK_e944a0197a0da09e517efa76ab0" FOREIGN KEY ("variationID") REFERENCES "ProductVariations"("variationID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "FK_14f5ca3156cbc9e506605a64aab" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ADD CONSTRAINT "FK_ee5575a5147f46b1fec63b1fca2" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ADD CONSTRAINT "FK_77415330f10d08ce24df41ccc5a" FOREIGN KEY ("purchaseOrderID") REFERENCES "PurchaseOrder"("purchaseOrderID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "SaleItem" ADD CONSTRAINT "FK_11fe347196ba99deda97d34a18f" FOREIGN KEY ("saleID") REFERENCES "Sale"("saleID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" ADD CONSTRAINT "FK_780b2626f289a5ff46b45a97711" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" ADD CONSTRAINT "FK_bc66a4ad5e4cb0985ee88d17ef1" FOREIGN KEY ("clientID") REFERENCES "Client"("clientID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" ADD CONSTRAINT "FK_ab06116220ebdd1f643e25b06a8" FOREIGN KEY ("dteDocumentID") REFERENCES "DteDocument"("dteDocumentID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ReturnItem" ADD CONSTRAINT "FK_30808535576705a1bf72475b575" FOREIGN KEY ("returnID") REFERENCES "Return"("returnID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ReturnItem" ADD CONSTRAINT "FK_4d8a86c907b6f89aa7c371a3603" FOREIGN KEY ("saleItemID") REFERENCES "SaleItem"("saleItemID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" ADD CONSTRAINT "FK_beb18ee73186ece1123a18df997" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" ADD CONSTRAINT "FK_63f443dc1d1bffcc6353131b589" FOREIGN KEY ("saleID") REFERENCES "Sale"("saleID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" ADD CONSTRAINT "FK_15a7f03b6851c82b25e5aad3ce2" FOREIGN KEY ("dteDocumentID") REFERENCES "DteDocument"("dteDocumentID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "PriceHistory" ADD CONSTRAINT "FK_542de88deb17abf5a03d27986fa" FOREIGN KEY ("storeProductID") REFERENCES "StoreProduct"("storeProductID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "InventoryMovements" ADD CONSTRAINT "FK_8c6a7d9f51c3f3a7a4316720ef2" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "InventoryMovements" ADD CONSTRAINT "FK_38686e43d5b8ea1ac82f5423ef0" FOREIGN KEY ("variationID") REFERENCES "ProductVariations"("variationID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FK_0bfaf45de71a1aaa9e7d0f5d420" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Expense" ADD CONSTRAINT "FK_aef3abf45e2cd250a41883f1757" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideItem" ADD CONSTRAINT "FK_28189940b910ec7a6d0e5a324c2" FOREIGN KEY ("dispatchGuideID") REFERENCES "DispatchGuide"("dispatchGuideID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReferenceItem" ADD CONSTRAINT "FK_7459a4b4ed82fbe50da86f8e937" FOREIGN KEY ("dispatchGuideReferenceID") REFERENCES "DispatchGuideReference"("dispatchGuideReferenceID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReference" ADD CONSTRAINT "FK_d8620d7f03f7a3a20fca147f3c7" FOREIGN KEY ("dispatchGuideID") REFERENCES "DispatchGuide"("dispatchGuideID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReference" ADD CONSTRAINT "FK_84ef662bbdc32fe5fb561aaa74d" FOREIGN KEY ("dteDocumentID") REFERENCES "DteDocument"("dteDocumentID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ADD CONSTRAINT "FK_23441e418d041e27832ab2a4bf6" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ADD CONSTRAINT "FK_ac57c40f468d269b1477617b02e" FOREIGN KEY ("dteDocumentID") REFERENCES "DteDocument"("dteDocumentID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ADD CONSTRAINT "FK_9661be19e9789ca7df58f57d931" FOREIGN KEY ("clientID") REFERENCES "Client"("clientID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" DROP CONSTRAINT "FK_9661be19e9789ca7df58f57d931"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" DROP CONSTRAINT "FK_ac57c40f468d269b1477617b02e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" DROP CONSTRAINT "FK_23441e418d041e27832ab2a4bf6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReference" DROP CONSTRAINT "FK_84ef662bbdc32fe5fb561aaa74d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReference" DROP CONSTRAINT "FK_d8620d7f03f7a3a20fca147f3c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReferenceItem" DROP CONSTRAINT "FK_7459a4b4ed82fbe50da86f8e937"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideItem" DROP CONSTRAINT "FK_28189940b910ec7a6d0e5a324c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Expense" DROP CONSTRAINT "FK_aef3abf45e2cd250a41883f1757"`,
    );
    await queryRunner.query(
      `ALTER TABLE "FinancialMovement" DROP CONSTRAINT "FK_0bfaf45de71a1aaa9e7d0f5d420"`,
    );
    await queryRunner.query(
      `ALTER TABLE "InventoryMovements" DROP CONSTRAINT "FK_38686e43d5b8ea1ac82f5423ef0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "InventoryMovements" DROP CONSTRAINT "FK_8c6a7d9f51c3f3a7a4316720ef2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "PriceHistory" DROP CONSTRAINT "FK_542de88deb17abf5a03d27986fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" DROP CONSTRAINT "FK_15a7f03b6851c82b25e5aad3ce2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" DROP CONSTRAINT "FK_63f443dc1d1bffcc6353131b589"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" DROP CONSTRAINT "FK_beb18ee73186ece1123a18df997"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ReturnItem" DROP CONSTRAINT "FK_4d8a86c907b6f89aa7c371a3603"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ReturnItem" DROP CONSTRAINT "FK_30808535576705a1bf72475b575"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP CONSTRAINT "FK_ab06116220ebdd1f643e25b06a8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP CONSTRAINT "FK_bc66a4ad5e4cb0985ee88d17ef1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP CONSTRAINT "FK_780b2626f289a5ff46b45a97711"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SaleItem" DROP CONSTRAINT "FK_11fe347196ba99deda97d34a18f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" DROP CONSTRAINT "FK_77415330f10d08ce24df41ccc5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" DROP CONSTRAINT "FK_ee5575a5147f46b1fec63b1fca2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "FK_14f5ca3156cbc9e506605a64aab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "FK_e944a0197a0da09e517efa76ab0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "FK_172416607c9683586dea0d05c1a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreMonthlyTarget" DROP CONSTRAINT "FK_c2547b254293de61d6a6e953e5b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransfers" DROP CONSTRAINT "FK_7764bd05844c8e32e18872f4e4a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransfers" DROP CONSTRAINT "FK_00f26edb487ed3f4e43933e1bf1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransferItems" DROP CONSTRAINT "FK_786fe05e6e5ef559323b6e1da17"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreTransferItems" DROP CONSTRAINT "FK_0113798c5789308f7fde976d888"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" DROP CONSTRAINT "FK_7efcba0a1152431f333e39cd7e3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreProduct" DROP CONSTRAINT "FK_0cd49c6a2e2fee34a6d8b54af8d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "StoreProduct" DROP CONSTRAINT "FK_4a6d22ffec5fbb874467af52db1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferBundleItem" DROP CONSTRAINT "FK_9f32486e3f2312019944a9d7af0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferBundleItem" DROP CONSTRAINT "FK_0298abb1a2821b83bb5e6d76f54"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferBundleItem" DROP CONSTRAINT "FK_53c8762d42f4c40c6c9df6dd22c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferProduct" DROP CONSTRAINT "FK_a8770195702e8d69975614b4ddb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOfferProduct" DROP CONSTRAINT "FK_c49572aea72a4aa886d7729331b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" DROP CONSTRAINT "FK_0f205ddadd9a8a0aacc604f05b5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" DROP CONSTRAINT "FK_b0811d670f300a75cfbe7978f10"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" DROP CONSTRAINT "FK_67dfe3ae5dd63f425f4eada6410"`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" DROP CONSTRAINT "FK_b66cc8940bd189c6717fd573c72"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Products" DROP CONSTRAINT "FK_f18556f4a389d8042ba98600aa5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_d5e31feaf3ce60ee212a183e7b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Users" DROP CONSTRAINT "FK_95a1667bfd07030a7ba94cfeda2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_098b15d566b7f8b9f74d8c67b86"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_e4639f49c5ce9ea4812dc3910f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" DROP CONSTRAINT "FK_4697b9ad809292e7759c12eb102"`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" DROP CONSTRAINT "FK_d380e84e192a8eab49140873df1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5b0afb18f954cd95fd59cf315a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f72eeefa541e4dea3ffae46a3a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b5281cf1f144c7c05f3f39b9cb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e16ed54b0ffda8866f3ecc3f3f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ac57c40f468d269b1477617b02"`,
    );
    await queryRunner.query(`DROP TABLE "DispatchGuide"`);
    await queryRunner.query(`DROP TYPE "public"."DispatchGuide_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_65ec9ac46d81229d6157e0bbe2"`,
    );
    await queryRunner.query(`DROP TABLE "DispatchGuideReference"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_72c390dfc610c31789b9596bc0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5ba4d8187b48e86fb240a4161d"`,
    );
    await queryRunner.query(`DROP TABLE "DispatchGuideReferenceItem"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_28189940b910ec7a6d0e5a324c"`,
    );
    await queryRunner.query(`DROP TABLE "DispatchGuideItem"`);
    await queryRunner.query(`DROP TABLE "Expense"`);
    await queryRunner.query(`DROP TYPE "public"."Expense_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3ed1e03539886f13ad37247499"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2b073e594f4460a7f23485bc2f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cc4f99161d25e4e826bed9b5d0"`,
    );
    await queryRunner.query(`DROP TABLE "FinancialMovement"`);
    await queryRunner.query(
      `DROP TYPE "public"."FinancialMovement_sourcetype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."FinancialMovement_category_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."FinancialMovement_direction_enum"`,
    );
    await queryRunner.query(`DROP TABLE "InventoryMovements"`);
    await queryRunner.query(
      `DROP TYPE "public"."InventoryMovements_condition_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."InventoryMovements_reason_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1bc6a5900cfe267e033ecb4651"`,
    );
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP TABLE "master_users"`);
    await queryRunner.query(`DROP TYPE "public"."master_users_role_enum"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_plantype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
    await queryRunner.query(`DROP TABLE "PriceHistory"`);
    await queryRunner.query(`DROP TYPE "public"."PriceHistory_pricetype_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cc6afa5492cd876be6610b559f"`,
    );
    await queryRunner.query(`DROP TABLE "ReturnFolioCounter"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b1fc47672e2361a7b05c65b0ba"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b289e1d0ad2916e561b356ac6f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5dc4e5c7b2851e947d580adad2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4556f13f77ff1fce9d2be68071"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_15a7f03b6851c82b25e5aad3ce"`,
    );
    await queryRunner.query(`DROP TABLE "Return"`);
    await queryRunner.query(`DROP TYPE "public"."Return_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."Return_returntype_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bccc55ebb87d22b5e5cc38cb0e"`,
    );
    await queryRunner.query(`DROP TABLE "ReturnItem"`);
    await queryRunner.query(`DROP TYPE "public"."ReturnItem_condition_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_81bbbc708708fd1d60326cae4f"`,
    );
    await queryRunner.query(`DROP TABLE "SaleFolioCounter"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_34ae23558ce4be8eb08e58ca1a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d76aab695cab641ad3a37a4aff"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f29b4e50639a9ba5b5f2e4a164"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f9ab3c4f2b47278dd20ee2d1ee"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14b43659f059c77870c1b0e475"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ab06116220ebdd1f643e25b06a"`,
    );
    await queryRunner.query(`DROP TABLE "Sale"`);
    await queryRunner.query(`DROP TYPE "public"."Sale_paymenttype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."Sale_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."Sale_saletype_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_99c9c147f1cf2314f2e2cab058"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_90099d6c85a3b87f46c3e08c8c"`,
    );
    await queryRunner.query(`DROP TABLE "Client"`);
    await queryRunner.query(`DROP TYPE "public"."Client_segment_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0d8e0643f985e47adf9526d9b6"`,
    );
    await queryRunner.query(`DROP TABLE "SaleItem"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9cd0413a05671786f6d2044bec"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7dc9d21753c05a87645e00e7a5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_77415330f10d08ce24df41ccc5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_587eecb1a8bf512f111c06a6dd"`,
    );
    await queryRunner.query(`DROP TABLE "DteDocument"`);
    await queryRunner.query(
      `DROP TYPE "public"."DteDocument_paymenttype_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."DteDocument_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2f5fcd204c1e6308df85b3e001"`,
    );
    await queryRunner.query(`DROP TABLE "PurchaseOrder"`);
    await queryRunner.query(`DROP TYPE "public"."PurchaseOrder_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."PurchaseOrder_paymentstatus_enum"`,
    );
    await queryRunner.query(`DROP TABLE "PurchaseOrderItem"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d659ab6d32731bc70aacf7bf65"`,
    );
    await queryRunner.query(`DROP TABLE "StoreMonthlyTarget"`);
    await queryRunner.query(`DROP TABLE "StoreTransfers"`);
    await queryRunner.query(`DROP TYPE "public"."StoreTransfers_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c583a59a7ea1476e04d8f56353"`,
    );
    await queryRunner.query(`DROP TABLE "StoreTransferItems"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b1ebbb115a2fa61866f0985b9f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1b03beb7ee7f71b71ef1bbc792"`,
    );
    await queryRunner.query(`DROP TABLE "ProductVariations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ca1b99fd1bba175712306da302"`,
    );
    await queryRunner.query(`DROP TABLE "StoreProduct"`);
    await queryRunner.query(`DROP TABLE "SpecialOfferBundleItem"`);
    await queryRunner.query(`DROP TABLE "SpecialOfferProduct"`);
    await queryRunner.query(`DROP TABLE "SpecialOffer"`);
    await queryRunner.query(`DROP TYPE "public"."SpecialOffer_scope_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."SpecialOffer_discounttype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."SpecialOffer_targetscope_enum"`,
    );
    await queryRunner.query(`DROP TABLE "Products"`);
    await queryRunner.query(`DROP TYPE "public"."Products_genre_enum"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "Users"`);
    await queryRunner.query(`DROP TYPE "public"."Users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_487edbb2cabb97bab288d0cbea"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f682684a3f375f5fde166e9f86"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6e5a5ea2644a1ebcf8f90e4c93"`,
    );
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_889434a7b92876d72da549856a"`,
    );
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TYPE "public"."role_permissions_scope_enum"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TABLE "UserStore"`);
    await queryRunner.query(`DROP TABLE "Store"`);
    await queryRunner.query(`DROP TYPE "public"."Store_type_enum"`);
  }
}
