# Answer-sheet layout model

`answer_sheet_layout.pt` comes from the `Layout4Card` module of
[vkgo/OCRAutoScore](https://github.com/vkgo/OCRAutoScore). It detects answer-sheet
regions (`student_id`, `subjective_question`, `fillin_question`, and
`objective_question`); it does not detect grading marks.

The upstream repository is licensed under AGPL-3.0. Keep this attribution and
review the upstream license before redistributing or deploying the model.

`error_mark_yolo26n_hard_v2.pt` is the single-class YOLO26n Detect checkpoint
trained locally on 640x640 overlapping answer-sheet tiles. Runtime inference uses
SAHI with 20% overlap and emits only the `error_mark` class. Configure it with
`OCR_GRADING_MODEL_PATH`; use `OCR_GRADING_ENABLED=false` to disable it.
Predictions at or above `OCR_GRADING_AUTO_CONFIDENCE` (default 0.80) are treated
as confirmed cross evidence. Predictions between the final threshold (default
0.40) and the auto threshold are routed to manual review.
