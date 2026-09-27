-- CreateTable
CREATE TABLE `WebhookReceipt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(128) NOT NULL,
    `topic` VARCHAR(64) NOT NULL,
    `shopifyProductId` VARCHAR(64) NOT NULL,
    `productId` INTEGER NULL,
    `status` ENUM('RECEIVED', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
    `triggeredAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,

    UNIQUE INDEX `WebhookReceipt_eventId_key`(`eventId`),
    INDEX `WebhookReceipt_shopifyProductId_receivedAt_idx`(`shopifyProductId`, `receivedAt`),
    INDEX `WebhookReceipt_status_receivedAt_idx`(`status`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WebhookReceipt` ADD CONSTRAINT `WebhookReceipt_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
