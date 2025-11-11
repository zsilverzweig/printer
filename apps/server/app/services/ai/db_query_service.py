"""
AI Service for database query operations.

Provides natural language to SQL conversion using OpenAI.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import openai
from pydantic import BaseModel

logger = logging.getLogger("app.db_query_service")


class TableInfo(BaseModel):
    """Information about a database table."""
    name: str
    columns: List[Dict[str, Any]]


class DBQueryService:
    """AI service for database query operations."""
    
    def __init__(self):
        self.client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    async def natural_language_to_sql(
        self,
        natural_language: str,
        tables: List[TableInfo],
        previous_sql_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Convert natural language query to SQL.
        
        Args:
            natural_language: Natural language question
            tables: List of database tables with their schema
            previous_sql_query: Optional previously generated SQL query to use as context
            
        Returns:
            Dictionary with success status, SQL query, and explanation
        """
        # Format schema information for the AI
        schema_text = self._format_schema(tables)
        
        context_section = ""
        if previous_sql_query:
            logger.info(
                "Including previous SQL context: %s",
                previous_sql_query.strip().replace("\n", " ")[:200],
            )
            context_section = (
                "\nPREVIOUS SQL QUERY (adjust if helpful):\n"
                f"{previous_sql_query.strip()}\n"
            )

        prompt = f"""You are a SQL expert. Convert the following natural language query into a PostgreSQL SQL query.

DATABASE SCHEMA:
{schema_text}

{context_section}

NATURAL LANGUAGE QUERY:
{natural_language}

Generate a SQL query that answers this question. Consider:
- Use proper PostgreSQL syntax
- Include appropriate JOINs if multiple tables are needed
- Use meaningful column aliases
- Add appropriate WHERE clauses for filtering
- Use ORDER BY, LIMIT when appropriate
- Handle NULL values properly
- Use appropriate aggregate functions if needed

Return ONLY a JSON object with this exact structure:
{{
  "sql_query": "SELECT ... FROM ... WHERE ...",
  "explanation": "Brief explanation of what the query does and why"
}}

Important:
- The SQL query should be a single line or properly formatted
- Do NOT include markdown code blocks or backticks
- Do NOT include semicolons at the end
- Make sure the query is valid PostgreSQL syntax
"""
        
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": "You are a SQL expert who converts natural language to PostgreSQL queries. Always respond with valid JSON containing sql_query and explanation fields."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1
            )
            
            result = json.loads(response.choices[0].message.content)
            
            sql_query = result.get("sql_query", "")
            explanation = result.get("explanation", "")
            
            # Clean up the SQL query
            sql_query = sql_query.strip()
            if sql_query.endswith(";"):
                sql_query = sql_query[:-1]
            
            logger.info(f"Converted natural language to SQL: {sql_query[:100]}...")
            
            return {
                "success": True,
                "sql_query": sql_query,
                "explanation": explanation
            }
            
        except Exception as e:
            logger.error(f"Failed to convert natural language to SQL: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _format_schema(self, tables: List[TableInfo]) -> str:
        """
        Format database schema for AI consumption.
        
        Args:
            tables: List of table information
            
        Returns:
            Formatted schema text
        """
        schema_lines = []
        
        for table in tables:
            schema_lines.append(f"\nTable: {table.name}")
            schema_lines.append("Columns:")
            
            for col in table.columns:
                nullable = "NULL" if col.get("nullable", True) else "NOT NULL"
                default = f" DEFAULT {col.get('default')}" if col.get("default") else ""
                schema_lines.append(
                    f"  - {col['name']}: {col['type']} {nullable}{default}"
                )
        
        return "\n".join(schema_lines)

