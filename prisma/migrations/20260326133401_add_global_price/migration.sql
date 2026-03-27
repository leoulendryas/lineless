/*
  Warnings:

  - Added the required column `fuelType` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "GlobalPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fuelType" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "reporter" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("createdAt", "id", "queue", "reporter", "stationId", "status") SELECT "createdAt", "id", "queue", "reporter", "stationId", "status" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPrice_fuelType_key" ON "GlobalPrice"("fuelType");
