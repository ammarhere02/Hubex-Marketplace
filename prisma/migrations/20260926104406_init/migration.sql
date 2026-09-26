-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopifyId` VARCHAR(64) NOT NULL,
    `handle` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `descriptionHtml` TEXT NOT NULL,
    `status` ENUM('ACTIVE', 'DRAFT', 'ARCHIVED') NOT NULL,
    `options` JSON NOT NULL,
    `isRemoved` BOOLEAN NOT NULL DEFAULT false,
    `lastSyncedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_shopifyId_key`(`shopifyId`),
    INDEX `Product_status_isRemoved_idx`(`status`, `isRemoved`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopifyId` VARCHAR(64) NOT NULL,
    `productId` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(255) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `compareAtPrice` DECIMAL(10, 2) NULL,
    `inventoryQuantity` INTEGER NOT NULL,
    `availableForSale` BOOLEAN NOT NULL,
    `selectedOptions` JSON NOT NULL,
    `isRemoved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductVariant_shopifyId_key`(`shopifyId`),
    INDEX `ProductVariant_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopifyId` VARCHAR(64) NOT NULL,
    `productId` INTEGER NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `altText` VARCHAR(512) NULL,
    `position` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductImage_shopifyId_key`(`shopifyId`),
    INDEX `ProductImage_productId_position_idx`(`productId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('PENDING_SYNC', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING_SYNC',
    `customerName` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `address1` VARCHAR(255) NOT NULL,
    `address2` VARCHAR(255) NULL,
    `city` VARCHAR(128) NOT NULL,
    `province` VARCHAR(128) NULL,
    `zip` VARCHAR(32) NOT NULL,
    `country` VARCHAR(64) NOT NULL,
    `email` VARCHAR(255) NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `paymentMethod` VARCHAR(16) NOT NULL DEFAULT 'COD',
    `shopifyOrderId` VARCHAR(64) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Order_shopifyOrderId_key`(`shopifyOrderId`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `variantId` INTEGER NOT NULL,
    `shopifyVariantId` VARCHAR(64) NOT NULL,
    `productTitle` VARCHAR(255) NOT NULL,
    `variantTitle` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(255) NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `lineTotal` DECIMAL(10, 2) NOT NULL,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_variantId_idx`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `queueName` VARCHAR(64) NOT NULL,
    `jobName` VARCHAR(64) NOT NULL,
    `jobId` VARCHAR(128) NOT NULL,
    `attempt` INTEGER NOT NULL,
    `status` ENUM('STARTED', 'COMPLETED', 'FAILED') NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `error` TEXT NULL,
    `willRetry` BOOLEAN NOT NULL DEFAULT false,

    INDEX `JobLog_jobName_startedAt_idx`(`jobName`, `startedAt`),
    INDEX `JobLog_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
