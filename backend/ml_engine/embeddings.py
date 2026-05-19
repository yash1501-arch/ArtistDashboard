import json
import sys


MODEL_NAME = "all-MiniLM-L6-v2"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input payload provided"}))
        sys.exit(1)

    payload = json.loads(sys.argv[1])
    text = payload.get("text", "")
    if not isinstance(text, str) or not text.strip():
        print(json.dumps({"error": "Text is required"}))
        sys.exit(1)

    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer(MODEL_NAME)
        vector = model.encode(text, normalize_embeddings=True).tolist()
        print(json.dumps({"model": MODEL_NAME, "vector": vector}))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
