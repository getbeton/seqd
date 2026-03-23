ALTER TABLE "enrollments"
  ADD COLUMN "experiment_id" uuid REFERENCES "experiments"("id") ON DELETE SET NULL;

CREATE INDEX "enrollments_experiment_idx" ON "enrollments" USING btree ("experiment_id");
