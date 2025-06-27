/*
  Warnings:

  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `ChatPayment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ChatPayment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChatPayment_stripePaymentIntentId_key" ON "ChatPayment"("stripePaymentIntentId");
