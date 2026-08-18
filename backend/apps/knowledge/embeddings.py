from django.conf import settings
from openai import OpenAI, OpenAIError


class EmbeddingError(RuntimeError):
    pass


def create_embeddings(texts):
    if not texts:
        return []
    if not settings.OPENAI_API_KEY:
        raise EmbeddingError("The embedding provider is not configured.")

    client = OpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=float(settings.OPENAI_TIMEOUT_SECONDS),
        max_retries=2,
    )
    try:
        response = client.embeddings.create(
            model=settings.OPENAI_EMBEDDING_MODEL,
            input=texts,
            dimensions=settings.OPENAI_EMBEDDING_DIMENSIONS,
            encoding_format="float",
        )
    except OpenAIError as exc:
        raise EmbeddingError("Embedding generation failed.") from exc

    ordered = sorted(response.data, key=lambda item: item.index)
    vectors = [item.embedding for item in ordered]
    if len(vectors) != len(texts):
        raise EmbeddingError("The embedding provider returned an incomplete batch.")
    if any(len(vector) != settings.OPENAI_EMBEDDING_DIMENSIONS for vector in vectors):
        raise EmbeddingError("The embedding provider returned an unexpected vector size.")
    return vectors
