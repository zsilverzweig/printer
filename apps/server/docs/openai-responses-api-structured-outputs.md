# OpenAI Responses API - Structured Outputs Documentation

This file contains the official OpenAI API documentation for Structured Outputs with the Responses API.

## Key Points

### Supported Models

- GPT-4o, GPT-4o-mini, GPT-4o-2024-08-06 and later
- GPT-5 models (gpt-5, gpt-5-pro, gpt-5-nano)
- o3, o4 models

### API Structure

**Python SDK with Pydantic:**

```python
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI()

class MyModel(BaseModel):
    field1: str
    field2: int

response = client.responses.parse(
    model="gpt-4o-2024-08-06",
    input=[
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."}
    ],
    text_format=MyModel,
)

# Access parsed response
result = response.output_parsed
```

**Manual JSON Schema:**

```python
response = client.responses.create(
    model="gpt-4o-2024-08-06",
    input=[...],
    text={
        "format": {
            "type": "json_schema",
            "name": "my_schema",
            "schema": {...},
            "strict": True
        }
    }
)

# Access text output
result = response.output_text
```

### Important Notes

1. **Use `input` not `messages`** - The Responses API uses `input` parameter
2. **No temperature parameter** - Not supported by Responses API
3. **Structured Outputs vs JSON Mode**:
   - Structured Outputs: Ensures schema adherence (recommended)
   - JSON Mode: Only ensures valid JSON (use `text: {"format": {"type": "json_object"}}`)
4. **Handle refusals**: Check `response.output[0].content[0].type == "refusal"`
5. **Handle incomplete responses**: Check `response.status == "incomplete"`

### Response Structure

When using `.parse()`:

- `response.output_parsed` - Parsed Pydantic model instance
- `response.output_text` - Raw JSON text
- `response.output` - Full output array
- `response.usage` - Token usage information

When using `.create()`:

- `response.output_text` - JSON text (needs manual parsing)
- `response.output[0].content[0].text` - Text content
- `response.status` - "completed" or "incomplete"

### Error Handling

```python
try:
    response = client.responses.parse(...)

    # Check for refusals
    if hasattr(response, 'output') and response.output:
        content = response.output[0].content[0]
        if content.type == "refusal":
            # Handle refusal
            print(content.refusal)

    # Check for incomplete
    if response.status == "incomplete":
        reason = response.incomplete_details.reason
        # Handle incomplete (max_output_tokens, content_filter, etc.)

    result = response.output_parsed
except Exception as e:
    # Handle errors
    pass
```

### Schema Requirements

- All fields must be `required`
- Use `type: ["string", "null"]` for optional fields
- Must set `additionalProperties: false`
- Root must be an object (not anyOf)
- Max 5000 properties, 10 levels nesting
- Max 1000 enum values
