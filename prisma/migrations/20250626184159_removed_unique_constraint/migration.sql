/*
  Warnings:

  - A unique constraint covering the columns `[matchId]` on the table `ChatParticipant` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ChatParticipant_matchId_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_matchId_key" ON "ChatParticipant"("matchId");
