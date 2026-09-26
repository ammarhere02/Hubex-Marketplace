-- AlterTable
ALTER TABLE `Order` ADD COLUMN `publicId` VARCHAR(36) NOT NULL,
    ADD COLUMN `shopifyOrderName` VARCHAR(32) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Order_publicId_key` ON `Order`(`publicId`);

