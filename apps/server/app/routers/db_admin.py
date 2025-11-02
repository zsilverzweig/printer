"""
Database Admin API endpoints for querying and exploring the database.

Provides REST endpoints for:
- Executing raw SQL queries
- Fetching database schema and table information
- Converting natural language to SQL using AI
"""

import logging
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text, inspect
from sqlalchemy.exc import SQLAlchemyError

from app.services.core.database import get_async_session, get_async_engine
from app.services.ai.db_query_service import DBQueryService

logger = logging.getLogger("app.db_admin")

router = APIRouter()


class SQLQueryRequest(BaseModel):
    """Request model for SQL query execution."""
    query: str


class SQLQueryResponse(BaseModel):
    """Response model for SQL query execution."""
    success: bool
    data: List[Dict[str, Any]] | None = None
    row_count: int = 0
    error: str | None = None


class NaturalLanguageQueryRequest(BaseModel):
    """Request model for natural language to SQL conversion."""
    natural_language: str


class NaturalLanguageQueryResponse(BaseModel):
    """Response model for natural language to SQL conversion."""
    success: bool
    sql_query: str | None = None
    explanation: str | None = None
    data: List[Dict[str, Any]] | None = None
    row_count: int = 0
    error: str | None = None


class TableInfo(BaseModel):
    """Information about a database table."""
    name: str
    columns: List[Dict[str, Any]]


class SchemaResponse(BaseModel):
    """Response model for database schema."""
    tables: List[TableInfo]


@router.post("/query", response_model=SQLQueryResponse)
async def execute_sql_query(request: SQLQueryRequest) -> SQLQueryResponse:
    """
    Execute a raw SQL query against the database.
    
    This endpoint allows execution of any SQL query. Use with caution.
    Only SELECT queries are recommended for safety.
    
    Args:
        request: SQLQueryRequest containing the SQL query
        
    Returns:
        SQLQueryResponse with query results or error
    """
    try:
        # Validate that it's a SELECT query (for safety)
        query_lower = request.query.strip().lower()
        if not query_lower.startswith(('select', 'with')):
            logger.warning(f"Non-SELECT query attempted: {request.query[:100]}")
            # Allow it but log a warning - in production you might want to restrict this
        
        async with get_async_session() as session:
            result = await session.execute(text(request.query))
            
            # Check if this is a SELECT query with results
            if result.returns_rows:
                rows = result.fetchall()
                # Convert rows to dictionaries
                data = [dict(row._mapping) for row in rows]
                
                logger.info(f"Query executed successfully, returned {len(data)} rows")
                
                return SQLQueryResponse(
                    success=True,
                    data=data,
                    row_count=len(data)
                )
            else:
                # For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
                await session.commit()
                affected_rows = result.rowcount
                
                logger.info(f"Query executed successfully, affected {affected_rows} rows")
                
                return SQLQueryResponse(
                    success=True,
                    data=[],
                    row_count=affected_rows
                )
                
    except SQLAlchemyError as e:
        logger.error(f"SQL query failed: {e}")
        return SQLQueryResponse(
            success=False,
            error=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error executing query: {e}", exc_info=True)
        return SQLQueryResponse(
            success=False,
            error=f"Unexpected error: {str(e)}"
        )


@router.get("/schema", response_model=SchemaResponse)
async def get_database_schema() -> SchemaResponse:
    """
    Get the database schema including all tables and their columns.
    
    Returns:
        SchemaResponse with list of tables and their column information
    """
    try:
        engine = get_async_engine()
        
        async with engine.connect() as conn:
            # Use SQLAlchemy inspector to get schema info
            inspector = await conn.run_sync(lambda sync_conn: inspect(sync_conn))
            table_names = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
            
            tables = []
            for table_name in table_names:
                columns_info = await conn.run_sync(
                    lambda sync_conn: inspect(sync_conn).get_columns(table_name)
                )
                
                columns = []
                for col in columns_info:
                    columns.append({
                        "name": col["name"],
                        "type": str(col["type"]),
                        "nullable": col.get("nullable", True),
                        "default": str(col.get("default", "")) if col.get("default") else None
                    })
                
                tables.append(TableInfo(
                    name=table_name,
                    columns=columns
                ))
            
            logger.info(f"Retrieved schema for {len(tables)} tables")
            
            return SchemaResponse(tables=tables)
            
    except Exception as e:
        logger.error(f"Failed to get database schema: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve database schema: {str(e)}"
        )


@router.post("/nl-query", response_model=NaturalLanguageQueryResponse)
async def execute_natural_language_query(
    request: NaturalLanguageQueryRequest
) -> NaturalLanguageQueryResponse:
    """
    Convert natural language to SQL and execute the query.
    
    Uses AI to convert a natural language question into a SQL query,
    then executes it and returns the results.
    
    Args:
        request: NaturalLanguageQueryRequest containing the natural language query
        
    Returns:
        NaturalLanguageQueryResponse with SQL query, explanation, and results
    """
    try:
        # Get database schema for context
        schema_response = await get_database_schema()
        
        # Initialize AI service
        db_query_service = DBQueryService()
        
        # Convert natural language to SQL
        logger.info(f"Converting natural language to SQL: {request.natural_language}")
        sql_result = await db_query_service.natural_language_to_sql(
            request.natural_language,
            schema_response.tables
        )
        
        if not sql_result["success"]:
            return NaturalLanguageQueryResponse(
                success=False,
                error=sql_result.get("error", "Failed to convert to SQL")
            )
        
        sql_query = sql_result["sql_query"]
        explanation = sql_result.get("explanation", "")
        
        logger.info(f"Generated SQL: {sql_query}")
        
        # Execute the generated SQL
        async with get_async_session() as session:
            result = await session.execute(text(sql_query))
            
            if result.returns_rows:
                rows = result.fetchall()
                data = [dict(row._mapping) for row in rows]
                
                logger.info(f"Natural language query executed successfully, returned {len(data)} rows")
                
                return NaturalLanguageQueryResponse(
                    success=True,
                    sql_query=sql_query,
                    explanation=explanation,
                    data=data,
                    row_count=len(data)
                )
            else:
                return NaturalLanguageQueryResponse(
                    success=True,
                    sql_query=sql_query,
                    explanation=explanation,
                    data=[],
                    row_count=0
                )
                
    except SQLAlchemyError as e:
        logger.error(f"SQL execution failed: {e}")
        return NaturalLanguageQueryResponse(
            success=False,
            sql_query=sql_result.get("sql_query") if 'sql_result' in locals() else None,
            explanation=sql_result.get("explanation") if 'sql_result' in locals() else None,
            error=f"SQL execution error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error in natural language query: {e}", exc_info=True)
        return NaturalLanguageQueryResponse(
            success=False,
            error=f"Unexpected error: {str(e)}"
        )

