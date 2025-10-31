"""
Simple GPT helper service for structured outputs.

Provides a clean interface for calling GPT with typed responses.
Keeps prompting logic in the calling code while handling the GPT API
interaction and validation.
"""

import json
import logging
import os
from typing import Type, TypeVar

import openai
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


class GPTHelper:
    """Simple helper for GPT API calls with structured outputs."""
    
    def __init__(self, model: str = "gpt-4o-mini"):
        """
        Initialize GPT helper.
        
        Args:
            model: OpenAI model to use (default: gpt-4o-mini)
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model
    
    async def get_structured_response(
        self,
        prompt: str,
        response_model: Type[T],
        system_prompt: str = "You are a helpful assistant that responds in JSON format.",
        temperature: float = 0.1,
    ) -> T:
        """
        Get a structured response from GPT.
        
        Args:
            prompt: The user prompt
            response_model: Pydantic model class for the expected response
            system_prompt: System prompt to set context
            temperature: Sampling temperature (0-2)
            
        Returns:
            Instance of response_model with GPT's response
            
        Raises:
            ValueError: If GPT response doesn't match schema or API error occurs
        """
        try:
            logger.debug(f"Calling GPT with model={self.model}, prompt_length={len(prompt)}")
            
            response = await self.client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
            )
            
            # Parse JSON response
            content = response.choices[0].message.content
            if not content:
                raise ValueError("GPT returned empty response")
            
            logger.debug(f"GPT raw response: {content[:200]}...")
            
            json_data = json.loads(content)
            
            # Validate against Pydantic model
            try:
                validated_response = response_model(**json_data)
                logger.debug(f"Successfully validated GPT response as {response_model.__name__}")
                return validated_response
            except ValidationError as e:
                logger.error(f"GPT response validation failed: {e}")
                logger.error(f"Raw response: {json_data}")
                raise ValueError(f"GPT response doesn't match expected schema: {e}")
        
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse GPT response as JSON: {e}")
            raise ValueError(f"GPT returned invalid JSON: {e}")
        
        except Exception as e:
            logger.error(f"GPT API error: {e}", exc_info=True)
            raise ValueError(f"Failed to get GPT response: {e}")


# Global instance for convenience
_gpt_helper: GPTHelper | None = None


def get_gpt_helper(model: str = "gpt-4o-mini") -> GPTHelper:
    """
    Get or create global GPT helper instance.
    
    Args:
        model: OpenAI model to use
        
    Returns:
        GPTHelper instance
    """
    global _gpt_helper
    if _gpt_helper is None:
        _gpt_helper = GPTHelper(model=model)
    return _gpt_helper

