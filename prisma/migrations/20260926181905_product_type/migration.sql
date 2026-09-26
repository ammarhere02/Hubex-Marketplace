-- AlterTable
ALTER TABLE `Product` ADD COLUMN `productType` VARCHAR(255) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX `Product_productType_idx` ON `Product`(`productType`);

