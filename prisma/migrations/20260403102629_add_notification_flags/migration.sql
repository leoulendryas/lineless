-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN     "notified20" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notified5" BOOLEAN NOT NULL DEFAULT false;
