"""Database Admin API endpoints for querying and exploring the database."""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    previous_sql_query: Optional[str] = None


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


class QueryStatistics(BaseModel):
    """Query statistics from pg_stat_statements."""
    slow_queries: List[Dict[str, Any]]
    top_queries_by_time: List[Dict[str, Any]]
    top_queries_by_calls: List[Dict[str, Any]]
    unused_indexes: List[Dict[str, Any]]


class PerformanceMetrics(BaseModel):
    """Performance metrics for database monitoring."""
    connections: Dict[str, Any]
    cache_stats: Dict[str, Any]
    table_stats: List[Dict[str, Any]]
    query_performance: Dict[str, Any]
    index_usage: List[Dict[str, Any]]
    active_queries: List[Dict[str, Any]]
    database_size: Dict[str, Any]
    query_statistics: QueryStatistics | None = None


class SavedQuery(BaseModel):
    """Persisted SQL query used for quick access."""

    id: int
    name: str
    sql_query: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SavedQueryCreateRequest(BaseModel):
    """Request payload for creating a saved query."""

    name: str
    sql_query: str
    description: Optional[str] = None


class SavedQueryUpdateRequest(BaseModel):
    """Request payload for updating a saved query."""

    name: Optional[str] = None
    sql_query: Optional[str] = None
    description: Optional[str] = None


class SavedQueryDeleteResponse(BaseModel):
    """Response payload for delete operations."""

    success: bool


_saved_queries_table_initialized = False
_saved_queries_table_lock = asyncio.Lock()


async def ensure_saved_queries_table() -> None:
    """Create the saved queries table if it does not already exist."""

    global _saved_queries_table_initialized

    if _saved_queries_table_initialized:
        return

    async with _saved_queries_table_lock:
        if _saved_queries_table_initialized:
            return

        engine = get_async_engine()

        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS db_saved_queries (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL UNIQUE,
                        sql_query TEXT NOT NULL,
                        description TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )

        _saved_queries_table_initialized = True


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


@router.get("/saved-queries", response_model=List[SavedQuery])
async def list_saved_queries() -> List[SavedQuery]:
    """Return all saved SQL queries ordered by most recently updated."""

    await ensure_saved_queries_table()

    async with get_async_session() as session:
        result = await session.execute(
            text(
                """
                SELECT id, name, sql_query, description, created_at, updated_at
                FROM db_saved_queries
                ORDER BY updated_at DESC, id DESC
                """
            )
        )

        rows = result.fetchall()
        return [SavedQuery(**dict(row._mapping)) for row in rows]


@router.post("/saved-queries", response_model=SavedQuery, status_code=status.HTTP_201_CREATED)
async def create_saved_query(request: SavedQueryCreateRequest) -> SavedQuery:
    """Persist a new saved SQL query for quick reuse."""

    await ensure_saved_queries_table()

    async with get_async_session() as session:
        try:
            result = await session.execute(
                text(
                    """
                    INSERT INTO db_saved_queries (name, sql_query, description)
                    VALUES (:name, :sql_query, :description)
                    RETURNING id, name, sql_query, description, created_at, updated_at
                    """
                ),
                {
                    "name": request.name,
                    "sql_query": request.sql_query,
                    "description": request.description,
                },
            )
            row = result.fetchone()
            await session.commit()
        except SQLAlchemyError as exc:
            await session.rollback()
            logger.error("Failed to create saved query: %s", exc)
            detail = "Unable to save query"
            if "duplicate" in str(exc).lower():
                detail = "A saved query with this name already exists"
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create saved query")

    return SavedQuery(**dict(row._mapping))


@router.put("/saved-queries/{query_id}", response_model=SavedQuery)
async def update_saved_query(
    query_id: int, request: SavedQueryUpdateRequest
) -> SavedQuery:
    """Update an existing saved SQL query."""

    await ensure_saved_queries_table()

    if not any([request.name, request.sql_query, request.description is not None]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update")

    updates = []
    params: Dict[str, Any] = {"query_id": query_id}

    if request.name is not None:
        updates.append("name = :name")
        params["name"] = request.name

    if request.sql_query is not None:
        updates.append("sql_query = :sql_query")
        params["sql_query"] = request.sql_query

    if request.description is not None:
        updates.append("description = :description")
        params["description"] = request.description

    updates.append("updated_at = NOW()")

    update_sql = "UPDATE db_saved_queries SET " + ", ".join(updates) + " WHERE id = :query_id RETURNING id, name, sql_query, description, created_at, updated_at"

    async with get_async_session() as session:
        try:
            result = await session.execute(text(update_sql), params)
            row = result.fetchone()
            if not row:
                await session.rollback()
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved query not found")
            await session.commit()
        except SQLAlchemyError as exc:
            await session.rollback()
            logger.error("Failed to update saved query %s: %s", query_id, exc)
            detail = "Unable to update query"
            if "duplicate" in str(exc).lower():
                detail = "A saved query with this name already exists"
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc

    return SavedQuery(**dict(row._mapping))


@router.delete("/saved-queries/{query_id}", response_model=SavedQueryDeleteResponse)
async def delete_saved_query(query_id: int) -> SavedQueryDeleteResponse:
    """Delete a saved SQL query."""

    await ensure_saved_queries_table()

    async with get_async_session() as session:
        result = await session.execute(
            text("DELETE FROM db_saved_queries WHERE id = :query_id"),
            {"query_id": query_id},
        )
        await session.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved query not found")

    return SavedQueryDeleteResponse(success=True)


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


@router.get("/performance", response_model=PerformanceMetrics)
async def get_performance_metrics() -> PerformanceMetrics:
    """
    Get database performance metrics.
    
    Retrieves comprehensive performance statistics including:
    - Connection statistics
    - Cache hit ratios
    - Table and index usage
    - Active queries
    - Database size information
    
    Returns:
        PerformanceMetrics with all performance data
    """
    try:
        async with get_async_session() as session:
            # Connection stats
            connections_result = await session.execute(text("""
                SELECT 
                    count(*) FILTER (WHERE state = 'active') as active,
                    count(*) FILTER (WHERE state = 'idle') as idle,
                    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                    count(*) as total
                FROM pg_stat_activity
            """))
            conn_row = connections_result.fetchone()
            
            # Get max connections separately
            max_conn_result = await session.execute(text("""
                SELECT setting::int FROM pg_settings WHERE name = 'max_connections'
            """))
            max_conn_row = max_conn_result.fetchone()
            
            connections = {
                "active": conn_row[0] or 0,
                "idle": conn_row[1] or 0,
                "idle_in_transaction": conn_row[2] or 0,
                "total": conn_row[3] or 0,
                "max_connections": max_conn_row[0] if max_conn_row else 100
            }
            
            # Cache hit ratio
            cache_result = await session.execute(text("""
                SELECT 
                    sum(heap_blks_read) as heap_read,
                    sum(heap_blks_hit) as heap_hit,
                    sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 as cache_hit_ratio
                FROM pg_statio_user_tables
            """))
            cache_row = cache_result.fetchone()
            cache_stats = {
                "heap_read": int(cache_row[0] or 0),
                "heap_hit": int(cache_row[1] or 0),
                "cache_hit_ratio": round(float(cache_row[2] or 0), 2)
            }
            
            # Table statistics (top 10 by size)
            table_stats_result = await session.execute(text("""
                SELECT 
                    schemaname || '.' || relname as table_name,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as size,
                    pg_total_relation_size(schemaname||'.'||relname) as size_bytes,
                    n_live_tup as row_count,
                    n_dead_tup as dead_rows,
                    last_vacuum,
                    last_autovacuum,
                    seq_scan,
                    idx_scan
                FROM pg_stat_user_tables
                ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC
                LIMIT 10
            """))
            table_stats = []
            for row in table_stats_result:
                table_stats.append({
                    "table_name": row[0],
                    "size": row[1],
                    "size_bytes": int(row[2]),
                    "row_count": int(row[3] or 0),
                    "dead_rows": int(row[4] or 0),
                    "last_vacuum": str(row[5]) if row[5] else None,
                    "last_autovacuum": str(row[6]) if row[6] else None,
                    "seq_scans": int(row[7] or 0),
                    "index_scans": int(row[8] or 0)
                })
            
            # Query performance stats
            query_perf_result = await session.execute(text("""
                SELECT 
                    count(*) as total_queries,
                    count(*) FILTER (WHERE state = 'active') as active_queries,
                    avg(EXTRACT(EPOCH FROM (now() - query_start))) FILTER (WHERE state = 'active') as avg_active_duration
                FROM pg_stat_activity
                WHERE query != '<IDLE>'
            """))
            qp_row = query_perf_result.fetchone()
            query_performance = {
                "total_queries": int(qp_row[0] or 0),
                "active_queries": int(qp_row[1] or 0),
                "avg_active_duration_seconds": round(float(qp_row[2] or 0), 2)
            }
            
            # Index usage (unused indexes)
            index_usage_result = await session.execute(text("""
                SELECT 
                    schemaname || '.' || relname as table_name,
                    indexrelname,
                    idx_scan,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
                FROM pg_stat_user_indexes
                ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
                LIMIT 10
            """))
            index_usage = []
            for row in index_usage_result:
                index_usage.append({
                    "table_name": row[0],
                    "index_name": row[1],
                    "scans": int(row[2] or 0),
                    "size": row[3]
                })
            
            # Active queries (top 10 longest running)
            active_queries_result = await session.execute(text("""
                SELECT 
                    pid,
                    usename,
                    application_name,
                    client_addr::text,
                    state,
                    EXTRACT(EPOCH FROM (now() - query_start)) as duration_seconds,
                    LEFT(query, 100) as query_preview
                FROM pg_stat_activity
                WHERE state = 'active' 
                  AND pid != pg_backend_pid()
                  AND query NOT LIKE '%pg_stat_activity%'
                ORDER BY query_start ASC
                LIMIT 10
            """))
            active_queries = []
            for row in active_queries_result:
                active_queries.append({
                    "pid": int(row[0]),
                    "user": row[1],
                    "application": row[2],
                    "client_address": row[3],
                    "state": row[4],
                    "duration_seconds": round(float(row[5] or 0), 2),
                    "query_preview": row[6]
                })
            
            # Database size
            db_size_result = await session.execute(text("""
                SELECT 
                    pg_database_size(current_database()) as size_bytes,
                    pg_size_pretty(pg_database_size(current_database())) as size_pretty,
                    current_setting('max_wal_size') as max_wal_size,
                    current_setting('shared_buffers') as shared_buffers
            """))
            db_size_row = db_size_result.fetchone()
            database_size = {
                "size_bytes": int(db_size_row[0]),
                "size_pretty": db_size_row[1],
                "max_wal_size": db_size_row[2],
                "shared_buffers": db_size_row[3]
            }
            
            # Query statistics from pg_stat_statements (if available)
            query_statistics = None
            try:
                # Check if pg_stat_statements extension is available
                check_ext_result = await session.execute(text("""
                    SELECT EXISTS(
                        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
                    )
                """))
                ext_exists = check_ext_result.scalar()
                
                if ext_exists:
                    # Slow queries (mean execution time > 100ms)
                    slow_queries_result = await session.execute(text("""
                        SELECT 
                            LEFT(query, 200) as query_preview,
                            calls,
                            ROUND(total_exec_time::numeric, 2) as total_exec_time_ms,
                            ROUND(mean_exec_time::numeric, 2) as mean_exec_time_ms,
                            ROUND(max_exec_time::numeric, 2) as max_exec_time_ms,
                            ROUND((total_exec_time / NULLIF(sum(total_exec_time) OVER (), 0) * 100)::numeric, 2) as pct_total_time,
                            ROUND((shared_blks_hit::float / NULLIF(shared_blks_hit + shared_blks_read, 0) * 100)::numeric, 2) as cache_hit_ratio
                        FROM pg_stat_statements
                        WHERE mean_exec_time > 100
                        ORDER BY mean_exec_time DESC
                        LIMIT 20
                    """))
                    slow_queries = []
                    for row in slow_queries_result:
                        slow_queries.append({
                            "query_preview": row[0],
                            "calls": int(row[1] or 0),
                            "total_exec_time_ms": float(row[2] or 0),
                            "mean_exec_time_ms": float(row[3] or 0),
                            "max_exec_time_ms": float(row[4] or 0),
                            "pct_total_time": float(row[5] or 0),
                            "cache_hit_ratio": float(row[6] or 0)
                        })
                    
                    # Top queries by total execution time
                    top_by_time_result = await session.execute(text("""
                        SELECT 
                            LEFT(query, 200) as query_preview,
                            calls,
                            ROUND(total_exec_time::numeric, 2) as total_exec_time_ms,
                            ROUND(mean_exec_time::numeric, 2) as mean_exec_time_ms,
                            ROUND((total_exec_time / NULLIF(sum(total_exec_time) OVER (), 0) * 100)::numeric, 2) as pct_total_time
                        FROM pg_stat_statements
                        ORDER BY total_exec_time DESC
                        LIMIT 20
                    """))
                    top_queries_by_time = []
                    for row in top_by_time_result:
                        top_queries_by_time.append({
                            "query_preview": row[0],
                            "calls": int(row[1] or 0),
                            "total_exec_time_ms": float(row[2] or 0),
                            "mean_exec_time_ms": float(row[3] or 0),
                            "pct_total_time": float(row[4] or 0)
                        })
                    
                    # Top queries by number of calls
                    top_by_calls_result = await session.execute(text("""
                        SELECT 
                            LEFT(query, 200) as query_preview,
                            calls,
                            ROUND(total_exec_time::numeric, 2) as total_exec_time_ms,
                            ROUND(mean_exec_time::numeric, 2) as mean_exec_time_ms
                        FROM pg_stat_statements
                        ORDER BY calls DESC
                        LIMIT 20
                    """))
                    top_queries_by_calls = []
                    for row in top_by_calls_result:
                        top_queries_by_calls.append({
                            "query_preview": row[0],
                            "calls": int(row[1] or 0),
                            "total_exec_time_ms": float(row[2] or 0),
                            "mean_exec_time_ms": float(row[3] or 0)
                        })
                    
                    # Unused indexes (indexes with 0 scans)
                    unused_indexes_result = await session.execute(text("""
                        SELECT 
                            schemaname || '.' || relname as table_name,
                            indexrelname as index_name,
                            idx_scan,
                            pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
                            pg_relation_size(indexrelid) as size_bytes
                        FROM pg_stat_user_indexes
                        WHERE idx_scan = 0
                        AND schemaname = 'public'
                        ORDER BY pg_relation_size(indexrelid) DESC
                        LIMIT 20
                    """))
                    unused_indexes = []
                    for row in unused_indexes_result:
                        unused_indexes.append({
                            "table_name": row[0],
                            "index_name": row[1],
                            "scans": int(row[2] or 0),
                            "size": row[3],
                            "size_bytes": int(row[4] or 0)
                        })
                    
                    query_statistics = QueryStatistics(
                        slow_queries=slow_queries,
                        top_queries_by_time=top_queries_by_time,
                        top_queries_by_calls=top_queries_by_calls,
                        unused_indexes=unused_indexes
                    )
            except Exception as e:
                # pg_stat_statements might not be enabled or available
                logger.warning(f"Could not fetch query statistics: {e}")
                query_statistics = None
            
            return PerformanceMetrics(
                connections=connections,
                cache_stats=cache_stats,
                table_stats=table_stats,
                query_performance=query_performance,
                index_usage=index_usage,
                active_queries=active_queries,
                database_size=database_size,
                query_statistics=query_statistics
            )
            
    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve performance metrics: {str(e)}"
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
            schema_response.tables,
            previous_sql_query=request.previous_sql_query,
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

