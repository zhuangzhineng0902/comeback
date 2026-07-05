UPDATE "Mistake"
SET
  "aiJudgement" = 'suspected',
  "needsManualReview" = true,
  "reviewStatus" = 'pending'
WHERE
  "questionType" LIKE '%复核%'
  OR "questionType" LIKE 'OCR候选%'
  OR "correctAnswer" LIKE '%人工复核%'
  OR "correctAnswer" LIKE '%重新推导%'
  OR "mistakeReason" LIKE '%复核%';
