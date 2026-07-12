from __future__ import annotations

import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests


class VLMError(RuntimeError):
    pass


class VLMRefiner:
    def __init__(self, api_key: str, base_url: str = "https://api.minimaxi.com/v1", model: str = "MiniMax-M3",
                 timeout: float = 90, retries: int = 3, max_workers: int = 3):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key, self.base_url, self.model = api_key, base_url.rstrip("/"), model
        self.timeout, self.retries, self.max_workers = timeout, max(1, retries), max(1, max_workers)
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})

    @staticmethod
    def _image_url(path: Path) -> str:
        if not path.is_file():
            raise FileNotFoundError(path)
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"

    @staticmethod
    def _validate(value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise VLMError("VLM result must be a JSON object")
        required = ("clean_title", "student_answer", "knowledge_points", "analysis", "solution_steps")
        missing = [key for key in required if not value.get(key)]
        if missing:
            raise VLMError(f"VLM result missing fields: {', '.join(missing)}")
        if not isinstance(value["knowledge_points"], list) or not isinstance(value["solution_steps"], list):
            raise VLMError("knowledge_points and solution_steps must be arrays")
        return value

    def refine(self, image_path: str | Path, question_id: str, sub_question_id: str | None = None) -> dict[str, Any]:
        image_path = Path(image_path)
        prompt = (
            f"你是初中试卷错题精修助手。本切片对应第{question_id}题"
            f"{f'第{sub_question_id}小题' if sub_question_id else ''}，错题身份已由检测器定位。"
            "请还原纯印刷题干，提取学生作答，给出知识点、错误原因和完整步骤。看不清就写不知道，不得猜测。"
            "只返回JSON：{\"clean_title\":\"\",\"student_answer\":\"\",\"knowledge_points\":[\"\"],"
            "\"analysis\":\"\",\"solution_steps\":[\"\"],\"confidence\":0.0,\"needs_review\":false}"
        )
        payload = {"model": self.model, "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": self._image_url(image_path)}}
        ]}], "thinking": {"type": "disabled"}, "response_format": {"type": "json_object"}, "temperature": 0.1,
                   "max_completion_tokens": 6000}
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                response = self.session.post(f"{self.base_url}/chat/completions", json=payload, timeout=self.timeout)
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                start, end = content.find("{"), content.rfind("}")
                if start < 0 or end <= start:
                    raise VLMError("VLM response contains no JSON object")
                return self._validate(json.loads(content[start:end + 1]))
            except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, VLMError) as exc:
                last_error = exc
                if attempt + 1 < self.retries:
                    time.sleep(min(8, 2 ** attempt))
        raise VLMError(f"VLM refinement failed after {self.retries} attempts: {last_error}")

    def refine_many(self, crops: list[Any]) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {executor.submit(self.refine, crop.image_path, crop.question_id, crop.sub_question_id): crop for crop in crops}
            for future in as_completed(futures):
                crop = futures[future]
                try:
                    result = future.result()
                except Exception as exc:
                    result = {"question_id": crop.question_id, "sub_question_id": crop.sub_question_id,
                              "needs_review": True, "error": str(exc)}
                else:
                    result.update({"question_id": crop.question_id, "sub_question_id": crop.sub_question_id,
                                   "crop_path": str(crop.image_path)})
                output.append(result)
        return output
