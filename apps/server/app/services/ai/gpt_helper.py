"""
Simple GPT helper service for structured outputs.

Provides a clean interface for calling GPT with typed responses.
Keeps prompting logic in the calling code while handling the GPT API
interaction and validation.
"""

import json
import logging
import os
from typing import Type, TypeVar, Optional, Dict, Any

import openai
from pydantic import BaseModel, ValidationError

from app.services.ai.cost_tracker import record_ai_cost_async

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


class GPTHelper:
    """Simple helper for GPT API calls with structured outputs."""
    
    def __init__(self, model: str = "gpt-5-nano", fund_id: Optional[str] = None):
        """
        Initialize GPT helper.
        
        Args:
            model: OpenAI model to use (default: gpt-5-nano)
            fund_id: Optional fund ID for cost tracking
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model
        self.fund_id = fund_id
    
    def _uses_responses_endpoint(self) -> bool:
        """Check if model requires v1/responses endpoint instead of v1/chat/completions."""
        # GPT-5 models (including variants like gpt-5-pro, gpt-5-nano) use v1/responses endpoint
        # o3 and o4 models also use the responses endpoint
        responses_endpoint_models = ["gpt-5", "gpt-5-pro", "gpt-5-nano", "o3", "o4"]
        return any(self.model.lower().startswith(prefix) for prefix in responses_endpoint_models)
    
    def _get_json_schema(self, response_model: Type[BaseModel]) -> Dict[str, Any]:
        """Generate JSON schema from Pydantic model for Structured Outputs."""
        return response_model.model_json_schema()
    
    async def get_structured_response(
        self,
        prompt: str,
        response_model: Type[T],
        system_prompt: str = "You are a helpful assistant that responds in JSON format.",
        temperature: float = 0.1,
        operation: Optional[str] = None,
        symbol: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> T:
        """
        Get a structured response from GPT using Structured Outputs.
        
        Uses client.responses.parse() for Responses API models (GPT-5, o3, o4)
        and client.chat.completions.create() for traditional models.
        
        Args:
            prompt: The user prompt
            response_model: Pydantic model class for the expected response
            system_prompt: System prompt to set context
            temperature: Sampling temperature (0-2) - only used for chat completions
            operation: Optional operation name for cost tracking (e.g., "entry_analysis")
            symbol: Optional symbol for cost tracking
            metadata: Optional metadata for cost tracking
            
        Returns:
            Instance of response_model with GPT's response
            
        Raises:
            ValueError: If GPT response doesn't match schema or API error occurs
        """
        try:
            logger.debug(f"Calling GPT with model={self.model}, prompt_length={len(prompt)}")
            
            # Use Responses API for GPT-5 models with Structured Outputs
            if self._uses_responses_endpoint():
                # Use responses.parse() which automatically handles Pydantic models
                # See: https://platform.openai.com/docs/guides/structured-outputs
                response = await self.client.responses.parse(
                    model=self.model,
                    input=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    text_format=response_model,
                )
                
                # Check for refusals
                if hasattr(response, 'output') and response.output:
                    output_item = response.output[0]
                    if hasattr(output_item, 'content') and output_item.content:
                        content_item = output_item.content[0]
                        if hasattr(content_item, 'type') and content_item.type == "refusal":
                            refusal_msg = getattr(content_item, 'refusal', 'Model refused to respond')
                            logger.warning(f"Model refused request: {refusal_msg}")
                            raise ValueError(f"Model refused to respond: {refusal_msg}")
                
                # Check for incomplete responses
                if hasattr(response, 'status') and response.status == "incomplete":
                    reason = getattr(response.incomplete_details, 'reason', 'unknown') if hasattr(response, 'incomplete_details') else 'unknown'
                    logger.error(f"Incomplete response: {reason}")
                    raise ValueError(f"Incomplete response: {reason}")
                
                # Get parsed response directly (no manual JSON parsing needed)
                validated_response = response.output_parsed
                
                # Get usage for cost tracking
                usage = response.usage if hasattr(response, 'usage') else None
                
            else:
                # Use chat completions endpoint with Structured Outputs for traditional models
                json_schema = self._get_json_schema(response_model)
                response = await self.client.chat.completions.create(
                    model=self.model,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": response_model.__name__,
                            "schema": json_schema,
                            "strict": True,
                        }
                    },
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=temperature,
                )
                
                # Extract content from chat completions format
                content = response.choices[0].message.content
                if not content:
                    raise ValueError("GPT returned empty response")
                
                # Parse and validate JSON
                try:
                    json_data = json.loads(content)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON from response. Content: {content[:500]}")
                    raise ValueError(f"GPT returned invalid JSON: {e}")
                
                # Validate against Pydantic model
                try:
                    validated_response = response_model(**json_data)
                except ValidationError as e:
                    logger.error(f"GPT response validation failed: {e}")
                    logger.error(f"Raw response: {json_data}")
                    raise ValueError(f"GPT response doesn't match expected schema: {e}")
                
                # Get usage for cost tracking
                usage = response.usage
            
            # Record cost if tracking is enabled
            if self.fund_id and operation and usage:
                try:
                    await record_ai_cost_async(
                        fund_id=self.fund_id,
                        model=self.model,
                        prompt_tokens=usage.prompt_tokens,
                        completion_tokens=usage.completion_tokens,
                        operation=operation,
                        symbol=symbol,
                        metadata=metadata,
                    )
                except Exception as e:
                    logger.error(f"Failed to record AI cost: {e}", exc_info=True)
                    # Don't fail the request if cost tracking fails
            
            logger.debug(f"Successfully validated GPT response as {response_model.__name__}")
            return validated_response
        
        except Exception as e:
            logger.error(f"GPT API error: {e}", exc_info=True)
            raise ValueError(f"Failed to get GPT response: {e}")


# Global instance for convenience (without cost tracking)
_gpt_helper: GPTHelper | None = None


def get_gpt_helper(
    model: str = "gpt-5-nano",
    fund_id: Optional[str] = None,
) -> GPTHelper:
    """
    Get or create GPT helper instance.
    
    If fund_id is provided, creates a new instance with cost tracking enabled.
    Otherwise, returns global instance without cost tracking.
    
    Args:
        model: OpenAI model to use
        fund_id: Optional fund ID for cost tracking
        
    Returns:
        GPTHelper instance
    """
    # If cost tracking is needed, create new instance
    if fund_id:
        return GPTHelper(model=model, fund_id=fund_id)
    
    # Otherwise use global instance
    global _gpt_helper
    if _gpt_helper is None or _gpt_helper.model != model:
        _gpt_helper = GPTHelper(model=model)
    return _gpt_helper

