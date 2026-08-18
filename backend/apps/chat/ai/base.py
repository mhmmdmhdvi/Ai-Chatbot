from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator, Literal


@dataclass(frozen=True)
class AICompletion:
    provider_response_id: str
    request_id: str
    model: str
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class AIStreamEvent:
    type: Literal["delta", "completed"]
    delta: str = ""
    completion: AICompletion | None = None


class AIProviderError(RuntimeError):
    def __init__(self, *, category, user_message, retryable=False, request_id=""):
        super().__init__(category)
        self.category = category
        self.user_message = user_message
        self.retryable = retryable
        self.request_id = request_id


class AIProvider(ABC):
    name: str
    model: str

    @abstractmethod
    def stream_response(self, messages: list[dict[str, str]]) -> Iterator[AIStreamEvent]:
        raise NotImplementedError
