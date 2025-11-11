"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Play,
  Table as TableIcon,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Label } from "@/lib/components/ui/label";
import { Input } from "@/lib/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { Textarea } from "@/lib/components/ui/textarea";
import { ScrollArea } from "@/lib/components/ui/scroll-area";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "ON",
  "AND",
  "OR",
  "ORDER",
  "BY",
  "GROUP",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "AS",
  "DISTINCT",
  "COUNT",
  "SUM",
  "AVG",
  "MAX",
  "MIN",
  "IN",
  "NOT",
  "NULL",
  "IS",
  "LIKE",
  "BETWEEN",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "TABLE",
  "INDEX",
  "VIEW",
  "ASC",
  "DESC",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "UNION",
  "ALL",
  "EXISTS",
  "WITH",
  "DATE",
  "TIME",
  "TIMESTAMP",
];

interface TableInfo {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable?: boolean;
    default?: string | null;
  }[];
}

interface QueryResult {
  success: boolean;
  data?: Record<string, any>[];
  row_count?: number;
  error?: string;
  sql_query?: string;
  explanation?: string;
  execution_time_ms?: number;
}

interface QueryStatistics {
  slow_queries: Array<{
    query_preview: string;
    calls: number;
    total_exec_time_ms: number;
    mean_exec_time_ms: number;
    max_exec_time_ms: number;
    pct_total_time: number;
    cache_hit_ratio: number;
  }>;
  top_queries_by_time: Array<{
    query_preview: string;
    calls: number;
    total_exec_time_ms: number;
    mean_exec_time_ms: number;
    pct_total_time: number;
  }>;
  top_queries_by_calls: Array<{
    query_preview: string;
    calls: number;
    total_exec_time_ms: number;
    mean_exec_time_ms: number;
  }>;
  unused_indexes: Array<{
    table_name: string;
    index_name: string;
    scans: number;
    size: string;
    size_bytes: number;
  }>;
}

interface SavedQuery {
  id: number;
  name: string;
  sql_query: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

interface PerformanceMetrics {
  connections: {
    active: number;
    idle: number;
    idle_in_transaction: number;
    total: number;
    max_connections: number;
  };
  cache_stats: {
    heap_read: number;
    heap_hit: number;
    cache_hit_ratio: number;
  };
  table_stats: Array<{
    table_name: string;
    size: string;
    size_bytes: number;
    row_count: number;
    dead_rows: number;
    last_vacuum: string | null;
    last_autovacuum: string | null;
    seq_scans: number;
    index_scans: number;
  }>;
  query_performance: {
    total_queries: number;
    active_queries: number;
    avg_active_duration_seconds: number;
  };
  index_usage: Array<{
    table_name: string;
    index_name: string;
    scans: number;
    size: string;
  }>;
  active_queries: Array<{
    pid: number;
    user: string;
    application: string;
    client_address: string;
    state: string;
    duration_seconds: number;
    query_preview: string;
  }>;
  database_size: {
    size_bytes: number;
    size_pretty: string;
    max_wal_size: string;
    shared_buffers: string;
  };
  query_statistics?: QueryStatistics | null;
}

export default function DatabaseAdminPage() {
  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "sql" });
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [sqlQuery, setSqlQuery] = useState("");
  const [naturalLanguageQuery, setNaturalLanguageQuery] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [nlQueryResult, setNlQueryResult] = useState<QueryResult | null>(null);
  const [executingSql, setExecutingSql] = useState(false);
  const [executingNl, setExecutingNl] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [loadingSavedQueries, setLoadingSavedQueries] = useState(false);
  const [savedQueryForm, setSavedQueryForm] = useState({
    name: "",
    description: "",
  });
  const [selectedSavedQueryId, setSelectedSavedQueryId] =
    useState<number | null>(null);
  const [savedQueryError, setSavedQueryError] = useState<string | null>(null);
  const [savedQuerySubmitting, setSavedQuerySubmitting] = useState(false);
  const [deletingQueryId, setDeletingQueryId] = useState<number | null>(null);
  const [previousSqlContext, setPreviousSqlContext] =
    useState<string | null>(null);
  const [sqlSuggestions, setSqlSuggestions] = useState<string[]>([]);
  const [showSqlSuggestions, setShowSqlSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [sqlSuggestionRange, setSqlSuggestionRange] =
    useState<{ start: number; end: number } | null>(null);
  const sqlTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const schemaSuggestionTokens = useMemo(() => {
    const tokens = new Set<string>();

    tables.forEach((table) => {
      tokens.add(table.name);
      table.columns.forEach((column) => {
        tokens.add(column.name);
        tokens.add(`${table.name}.${column.name}`);
      });
    });

    return Array.from(tokens);
  }, [tables]);

  const autocompleteTokens = useMemo(() => {
    const tokens = new Set<string>(SQL_KEYWORDS);
    schemaSuggestionTokens.forEach((token) => tokens.add(token));
    return Array.from(tokens);
  }, [schemaSuggestionTokens]);

  const clearSqlSuggestions = useCallback(() => {
    setSqlSuggestions([]);
    setShowSqlSuggestions(false);
    setSqlSuggestionRange(null);
    setActiveSuggestionIndex(0);
  }, []);

  const updateSqlSuggestions = useCallback(
    (value: string, cursorPosition?: number | null) => {
      const text = value ?? "";
      if (!text) {
        clearSqlSuggestions();
        return;
      }

      const cursor = cursorPosition ?? text.length;
      const textBeforeCursor = text.slice(0, cursor);
      const match = textBeforeCursor.match(/([a-zA-Z_][\w]*)$/);

      if (!match) {
        clearSqlSuggestions();
        return;
      }

      const prefix = match[1];
      if (!prefix) {
        clearSqlSuggestions();
        return;
      }

      const prefixLower = prefix.toLowerCase();
      const matches = autocompleteTokens
        .filter((token) => {
          const normalized = token.toLowerCase();
          return (
            normalized.startsWith(prefixLower) && normalized !== prefixLower
          );
        })
        .slice(0, 8);

      if (matches.length === 0) {
        clearSqlSuggestions();
        return;
      }

      setSqlSuggestions(matches);
      setShowSqlSuggestions(true);
      setActiveSuggestionIndex(0);
      setSqlSuggestionRange({
        start: cursor - prefix.length,
        end: cursor,
      });
    },
    [autocompleteTokens, clearSqlSuggestions]
  );

  const applySqlSuggestion = useCallback(
    (suggestion: string) => {
      const range = sqlSuggestionRange;
      if (!range) {
        return;
      }

      setSqlQuery((prev) => {
        const before = prev.slice(0, range.start);
        const after = prev.slice(range.end);
        const newText = `${before}${suggestion}${after}`;
        const cursorPosition = range.start + suggestion.length;

        requestAnimationFrame(() => {
          if (sqlTextareaRef.current) {
            sqlTextareaRef.current.selectionStart = cursorPosition;
            sqlTextareaRef.current.selectionEnd = cursorPosition;
          }
          updateSqlSuggestions(newText, cursorPosition);
        });

        return newText;
      });

      clearSqlSuggestions();
    },
    [sqlSuggestionRange, clearSqlSuggestions, updateSqlSuggestions]
  );

  const handleSqlChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const { value, selectionStart } = event.target;
      setSqlQuery(value);
      updateSqlSuggestions(value, selectionStart);
    },
    [updateSqlSuggestions]
  );

  const handleSqlKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSqlSuggestions || sqlSuggestions.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSuggestionIndex((prev) =>
          prev + 1 >= sqlSuggestions.length ? 0 : prev + 1
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSuggestionIndex((prev) =>
          prev - 1 < 0 ? sqlSuggestions.length - 1 : prev - 1
        );
      } else if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        applySqlSuggestion(sqlSuggestions[activeSuggestionIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        clearSqlSuggestions();
      }
    },
    [
      activeSuggestionIndex,
      applySqlSuggestion,
      clearSqlSuggestions,
      showSqlSuggestions,
      sqlSuggestions,
    ]
  );

  const handleSqlCursorChange = useCallback(
    (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      updateSqlSuggestions(target.value, target.selectionStart);
    },
    [updateSqlSuggestions]
  );

  const handleSqlBlur = useCallback(() => {
    clearSqlSuggestions();
  }, [clearSqlSuggestions]);

  const fetchSavedQueries = useCallback(async () => {
    try {
      setLoadingSavedQueries(true);
      const response = await fetch(
        "http://localhost:8000/api/db-admin/saved-queries"
      );

      if (!response.ok) {
        throw new Error("Failed to load saved queries");
      }

      const data: SavedQuery[] = await response.json();
      setSavedQueries(data);
    } catch (error) {
      console.error("Failed to load saved queries:", error);
      setSavedQueries([]);
    } finally {
      setLoadingSavedQueries(false);
    }
  }, []);

  const handleSelectSavedQuery = useCallback(
    (query: SavedQuery) => {
      setSelectedSavedQueryId(query.id);
      setSavedQueryForm({
        name: query.name,
        description: query.description ?? "",
      });
      setSavedQueryError(null);
      clearSqlSuggestions();
      setSqlQuery(query.sql_query);
      requestAnimationFrame(() => {
        if (sqlTextareaRef.current) {
          const position = query.sql_query.length;
          sqlTextareaRef.current.selectionStart = position;
          sqlTextareaRef.current.selectionEnd = position;
        }
        updateSqlSuggestions(query.sql_query, query.sql_query.length);
      });
    },
    [clearSqlSuggestions, updateSqlSuggestions]
  );

  const clearSavedQuerySelection = useCallback(() => {
    setSelectedSavedQueryId(null);
    setSavedQueryForm({ name: "", description: "" });
    setSavedQueryError(null);
  }, []);

  const handleSaveCurrentQuery = useCallback(async () => {
    const trimmedName = savedQueryForm.name.trim();
    const trimmedQuery = sqlQuery.trim();

    if (!trimmedName || !trimmedQuery) {
      setSavedQueryError("Provide both a name and SQL before saving.");
      return;
    }

    const descriptionValue = savedQueryForm.description.trim();

    setSavedQueryError(null);
    setSavedQuerySubmitting(true);

    try {
      const response = await fetch(
        "http://localhost:8000/api/db-admin/saved-queries",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            sql_query: trimmedQuery,
            description: descriptionValue ? descriptionValue : null,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || "Failed to save query");
      }

      const created: SavedQuery = await response.json();
      setSavedQueries((prev) => {
        const remaining = prev.filter((item) => item.id !== created.id);
        return [created, ...remaining];
      });
      setSelectedSavedQueryId(created.id);
      setSavedQueryForm({
        name: created.name,
        description: created.description ?? "",
      });
    } catch (error) {
      console.error("Failed to save query:", error);
      setSavedQueryError(
        error instanceof Error ? error.message : "Failed to save query"
      );
    } finally {
      setSavedQuerySubmitting(false);
    }
  }, [savedQueryForm, sqlQuery]);

  const handleUpdateSavedQuery = useCallback(async () => {
    if (!selectedSavedQueryId) {
      setSavedQueryError("Select a saved query to update.");
      return;
    }

    const trimmedName = savedQueryForm.name.trim();
    const trimmedQuery = sqlQuery.trim();

    if (!trimmedName || !trimmedQuery) {
      setSavedQueryError("Provide both a name and SQL before updating.");
      return;
    }

    const descriptionValue = savedQueryForm.description.trim();

    setSavedQueryError(null);
    setSavedQuerySubmitting(true);

    try {
      const response = await fetch(
        `http://localhost:8000/api/db-admin/saved-queries/${selectedSavedQueryId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            sql_query: trimmedQuery,
            description: descriptionValue ? descriptionValue : null,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || "Failed to update query");
      }

      const updated: SavedQuery = await response.json();
      setSavedQueries((prev) => {
        const remaining = prev.filter((item) => item.id !== updated.id);
        return [updated, ...remaining];
      });
      setSavedQueryForm({
        name: updated.name,
        description: updated.description ?? "",
      });
    } catch (error) {
      console.error("Failed to update query:", error);
      setSavedQueryError(
        error instanceof Error ? error.message : "Failed to update query"
      );
    } finally {
      setSavedQuerySubmitting(false);
    }
  }, [savedQueryForm, selectedSavedQueryId, sqlQuery]);

  const handleDeleteSavedQuery = useCallback(
    async (queryId: number) => {
      setSavedQueryError(null);
      setDeletingQueryId(queryId);

      try {
        const response = await fetch(
          `http://localhost:8000/api/db-admin/saved-queries/${queryId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw new Error(errorBody?.detail || "Failed to delete query");
        }

        setSavedQueries((prev) =>
          prev.filter((savedQuery) => savedQuery.id !== queryId)
        );

        if (selectedSavedQueryId === queryId) {
          clearSavedQuerySelection();
        }
      } catch (error) {
        console.error("Failed to delete query:", error);
        setSavedQueryError(
          error instanceof Error ? error.message : "Failed to delete query"
        );
      } finally {
        setDeletingQueryId(null);
      }
    },
    [clearSavedQuerySelection, selectedSavedQueryId]
  );

  const clearPreviousSqlContext = useCallback(() => {
    setPreviousSqlContext(null);
  }, []);

  const formatTimestamp = useCallback((value: string) => {
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }, []);

  // Fetch database schema on mount
  useEffect(() => {
    fetchSchema();
  }, []);

  useEffect(() => {
    fetchSavedQueries();
  }, [fetchSavedQueries]);

  // Fetch performance metrics when on performance tab
  useEffect(() => {
    if (activeTab === "performance") {
      fetchPerformanceMetrics();
    }
  }, [activeTab]);

  const fetchSchema = async () => {
    try {
      setLoadingTables(true);
      const response = await fetch("http://localhost:8000/api/db-admin/schema");
      const data = await response.json();
      setTables(data.tables || []);
    } catch (error) {
      console.error("Failed to fetch schema:", error);
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchPerformanceMetrics = async () => {
    try {
      setLoadingPerformance(true);
      const response = await fetch(
        "http://localhost:8000/api/db-admin/performance"
      );
      const data = await response.json();
      setPerformanceMetrics(data);
    } catch (error) {
      console.error("Failed to fetch performance metrics:", error);
      setPerformanceMetrics(null);
    } finally {
      setLoadingPerformance(false);
    }
  };

  const executeSqlQuery = async () => {
    const trimmedQuery = sqlQuery.trim();
    if (!trimmedQuery) return;

    try {
      setExecutingSql(true);
      setQueryResult(null);

      const startTime = performance.now();
      const response = await fetch("http://localhost:8000/api/db-admin/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmedQuery }),
      });

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      const nextResult = {
        ...data,
        execution_time_ms: data.execution_time_ms || executionTime,
      } as QueryResult;

      if (data.success) {
        setPreviousSqlContext(trimmedQuery);
      }

      setQueryResult(nextResult);
    } catch (error) {
      setQueryResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setExecutingSql(false);
    }
  };

  const executeNaturalLanguageQuery = async () => {
    const trimmedNaturalLanguage = naturalLanguageQuery.trim();
    if (!trimmedNaturalLanguage) return;

    try {
      setExecutingNl(true);
      setNlQueryResult(null);

      const startTime = performance.now();
      const payload: Record<string, unknown> = {
        natural_language: trimmedNaturalLanguage,
      };

      if (previousSqlContext) {
        payload.previous_sql_query = previousSqlContext;
      }

      const response = await fetch(
        "http://localhost:8000/api/db-admin/nl-query",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      const nextResult = {
        ...data,
        execution_time_ms: data.execution_time_ms || executionTime,
      } as QueryResult;

      if (data.success && typeof data.sql_query === "string") {
        const normalizedSql = data.sql_query.trim();
        if (normalizedSql) {
          setPreviousSqlContext(normalizedSql);
          clearSqlSuggestions();
          setSqlQuery(normalizedSql);
          requestAnimationFrame(() => {
            if (sqlTextareaRef.current) {
              const position = normalizedSql.length;
              sqlTextareaRef.current.selectionStart = position;
              sqlTextareaRef.current.selectionEnd = position;
            }
            updateSqlSuggestions(normalizedSql, normalizedSql.length);
          });
        }
      }

      setNlQueryResult(nextResult);
    } catch (error) {
      setNlQueryResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setExecutingNl(false);
    }
  };

  const formatSqlWithIndentation = (sql: string) => {
    // Add line breaks and indentation for better readability
    const formatted = sql
      .replace(/\bSELECT\b/gi, "\nSELECT\n  ")
      .replace(/\bFROM\b/gi, "\nFROM\n  ")
      .replace(/\b(INNER|LEFT|RIGHT|OUTER)\s+JOIN\b/gi, "\n$1 JOIN\n  ")
      .replace(/\bJOIN\b/gi, "\nJOIN\n  ")
      .replace(/\bWHERE\b/gi, "\nWHERE\n  ")
      .replace(/\bAND\b/gi, "\n  AND ")
      .replace(/\bOR\b/gi, "\n  OR ")
      .replace(/\bGROUP\s+BY\b/gi, "\nGROUP BY\n  ")
      .replace(/\bORDER\s+BY\b/gi, "\nORDER BY\n  ")
      .replace(/\bHAVING\b/gi, "\nHAVING\n  ")
      .replace(/\bLIMIT\b/gi, "\nLIMIT ")
      .replace(/\bOFFSET\b/gi, "\nOFFSET ")
      .replace(/\bUNION\b/gi, "\n\nUNION\n\n")
      .replace(/,\s*/g, ",\n  ") // Commas with newlines
      .trim();

    return formatted;
  };

  const formatSqlWithColors = (sql: string) => {
    // First format with indentation
    let formatted = formatSqlWithIndentation(sql);

    // SQL syntax highlighting with colors
    const keywords = SQL_KEYWORDS;

    // Use placeholders to protect strings
    const stringPlaceholders: string[] = [];
    formatted = formatted.replace(/'([^']*)'/g, (match) => {
      const placeholder = `__STRING_${stringPlaceholders.length}__`;
      stringPlaceholders.push(match);
      return placeholder;
    });

    // Protect numbers with placeholders BEFORE creating any HTML
    const numberPlaceholders: string[] = [];
    formatted = formatted.replace(/\b(\d+)\b/g, (match) => {
      const placeholder = `__NUMBER_${numberPlaceholders.length}__`;
      numberPlaceholders.push(match);
      return placeholder;
    });

    // Protect operators with placeholders BEFORE creating any HTML
    const operatorPlaceholders: string[] = [];
    formatted = formatted.replace(/([=<>!]+|,|\*)/g, (match) => {
      const placeholder = `__OPERATOR_${operatorPlaceholders.length}__`;
      operatorPlaceholders.push(match);
      return placeholder;
    });

    // Now highlight SQL keywords (blue) - safe to add HTML now
    keywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      formatted = formatted.replace(
        regex,
        `<span class="text-blue-400 font-semibold">${keyword.toUpperCase()}</span>`
      );
    });

    // Restore numbers with orange highlighting
    numberPlaceholders.forEach((num, index) => {
      formatted = formatted.replace(
        `__NUMBER_${index}__`,
        `<span class="text-orange-400">${num}</span>`
      );
    });

    // Restore operators with cyan highlighting
    operatorPlaceholders.forEach((op, index) => {
      formatted = formatted.replace(
        `__OPERATOR_${index}__`,
        `<span class="text-cyan-400">${op}</span>`
      );
    });

    // Restore strings with green highlighting
    stringPlaceholders.forEach((str, index) => {
      formatted = formatted.replace(
        `__STRING_${index}__`,
        `<span class="text-green-400">${str}</span>`
      );
    });

    return formatted;
  };

  const renderTable = (data: Record<string, any>[]) => {
    if (!data || data.length === 0)
      return <p className="text-muted-foreground">No data returned</p>;

    const columns = Object.keys(data[0]);

    return (
      <div className="overflow-auto max-h-96 border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-4 py-2 text-left font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-t hover:bg-muted/50">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-2">
                    {row[col] === null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : typeof row[col] === "object" ? (
                      <pre className="text-xs">
                        {JSON.stringify(row[col], null, 2)}
                      </pre>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const hasSqlQuery = sqlQuery.trim().length > 0;
  const hasSavedQuerySelection = selectedSavedQueryId !== null;
  const hasPreviousSqlContext = Boolean(
    previousSqlContext && previousSqlContext.trim()
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">Database Admin</h1>
          <p className="text-muted-foreground">
            Query and explore your database
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Database Schema */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Database Schema
            </CardTitle>
            <CardDescription>Tables in your database</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTables ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : tables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No tables found</p>
                <p className="text-xs mt-2">Make sure the server is running</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tables.map((table) => (
                  <div key={table.name} className="border rounded-lg p-3">
                    <h3 className="font-semibold text-sm mb-2">{table.name}</h3>
                    <div className="space-y-1">
                      {table.columns.map((col) => (
                        <div
                          key={col.name}
                          className="text-xs text-muted-foreground flex items-center gap-1"
                        >
                          <span className="font-mono">{col.name}</span>
                          <span className="text-muted-foreground/60">:</span>
                          <span>{col.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Query Interface */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
              <TabsTrigger value="natural">Natural Language</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            {/* SQL Query Tab */}
            <TabsContent value="sql" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Execute SQL Query</CardTitle>
                  <CardDescription>
                    Write and execute SQL queries directly against the database
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    ref={sqlTextareaRef}
                    placeholder="SELECT * FROM table_name LIMIT 10"
                    value={sqlQuery}
                    onChange={handleSqlChange}
                    onKeyDown={handleSqlKeyDown}
                    onKeyUp={handleSqlCursorChange}
                    onClick={handleSqlCursorChange}
                    onBlur={handleSqlBlur}
                    spellCheck={false}
                    className="font-mono text-sm min-h-32"
                  />
                  {showSqlSuggestions && sqlSuggestions.length > 0 && (
                    <div className="border border-border rounded-md bg-background shadow-md text-sm font-mono overflow-hidden">
                      {sqlSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion}-${index}`}
                          type="button"
                          className={`flex w-full items-center justify-between px-3 py-1 text-left hover:bg-muted ${
                            index === activeSuggestionIndex ? "bg-muted" : ""
                          }`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySqlSuggestion(suggestion);
                          }}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                        >
                          <span>{suggestion}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            Tab
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      onClick={executeSqlQuery}
                      disabled={executingSql || !hasSqlQuery}
                      className="w-full"
                    >
                      {executingSql ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Execute Query
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!hasSqlQuery}
                      onClick={() => {
                        const trimmed = sqlQuery.trim();
                        if (trimmed) {
                          setPreviousSqlContext(trimmed);
                        }
                      }}
                      className="w-full"
                    >
                      {hasPreviousSqlContext ? "Update" : "Set"} NL Context
                    </Button>
                  </div>

                  {/* SQL Query Results */}
                  {queryResult && (
                    <div className="space-y-4">
                      {queryResult.success ? (
                        <Alert>
                          <CheckCircle2 className="h-4 w-4" />
                          <AlertTitle>Success</AlertTitle>
                          <AlertDescription>
                            Query executed successfully. Returned{" "}
                            {queryResult.row_count} row(s)
                            {queryResult.execution_time_ms && (
                              <span className="ml-2 text-xs font-mono text-muted-foreground">
                                ({queryResult.execution_time_ms}ms)
                              </span>
                            )}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription className="font-mono text-xs">
                            {queryResult.error}
                          </AlertDescription>
                        </Alert>
                      )}

                      {queryResult.data && queryResult.data.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2">Results:</h3>
                          {renderTable(queryResult.data)}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Saved Queries</CardTitle>
                  <CardDescription>
                    Store and reuse the SQL statements you reach for the most.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {savedQueryError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Saved Query Error</AlertTitle>
                      <AlertDescription>{savedQueryError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="saved-query-name">Query name</Label>
                        <Input
                          id="saved-query-name"
                          value={savedQueryForm.name}
                          onChange={(event) =>
                            setSavedQueryForm((prev) => ({
                              ...prev,
                              name: event.target.value,
                            }))
                          }
                          placeholder="Portfolio summary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="saved-query-description">
                          Description (optional)
                        </Label>
                        <Input
                          id="saved-query-description"
                          value={savedQueryForm.description}
                          onChange={(event) =>
                            setSavedQueryForm((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Aggregates balances by fund"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={handleSaveCurrentQuery}
                          disabled={savedQuerySubmitting}
                        >
                          {savedQuerySubmitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <HardDrive className="mr-2 h-4 w-4" />
                              Save New
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleUpdateSavedQuery}
                          disabled={
                            savedQuerySubmitting || !hasSavedQuerySelection
                          }
                        >
                          Update Selected
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={clearSavedQuerySelection}
                          disabled={
                            savedQuerySubmitting || !hasSavedQuerySelection
                          }
                        >
                          Clear Selection
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Saved queries ({savedQueries.length})
                          </h3>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={fetchSavedQueries}
                          disabled={loadingSavedQueries}
                        >
                          {loadingSavedQueries ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Activity className="h-4 w-4" />
                          )}
                          <span className="sr-only">Refresh saved queries</span>
                        </Button>
                      </div>
                      <ScrollArea className="h-64 border rounded-md">
                        <div className="space-y-2 p-2 pr-4">
                          {loadingSavedQueries ? (
                            <p className="px-2 py-4 text-sm text-muted-foreground">
                              Loading saved queries...
                            </p>
                          ) : savedQueries.length === 0 ? (
                            <p className="px-2 py-4 text-sm text-muted-foreground">
                              No saved queries yet. Save your current SQL to get
                              started.
                            </p>
                          ) : (
                            savedQueries.map((savedQuery) => {
                              const isSelected =
                                savedQuery.id === selectedSavedQueryId;

                              return (
                                <div
                                  key={savedQuery.id}
                                  className={`rounded-md border p-3 transition-colors ${
                                    isSelected
                                      ? "border-primary bg-primary/5"
                                      : "border-border"
                                  }`}
                                >
                                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-1">
                                      <p className="font-medium leading-tight">
                                        {savedQuery.name}
                                      </p>
                                      {savedQuery.description && (
                                        <p className="text-xs text-muted-foreground">
                                          {savedQuery.description}
                                        </p>
                                      )}
                                      <p className="text-[10px] uppercase text-muted-foreground">
                                        Updated {formatTimestamp(savedQuery.updated_at)}
                                      </p>
                                    </div>
                                    <div className="flex flex-col gap-1 md:items-end">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handleSelectSavedQuery(savedQuery)}
                                      >
                                        Load into Editor
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setPreviousSqlContext(savedQuery.sql_query)}
                                      >
                                        Use as NL Context
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDeleteSavedQuery(savedQuery.id)}
                                        disabled={deletingQueryId === savedQuery.id}
                                      >
                                        {deletingQueryId === savedQuery.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          "Delete"
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                  <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-xs font-mono text-muted-foreground">
                                    {savedQuery.sql_query}
                                  </pre>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Natural Language Query Tab */}
            <TabsContent value="natural" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Natural Language Query</CardTitle>
                  <CardDescription>
                    Ask questions in plain English and let AI convert them to
                    SQL
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hasPreviousSqlContext && previousSqlContext && (
                    <Alert>
                      <Database className="h-4 w-4" />
                      <AlertTitle>Using previous SQL context</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          We will include the prior SQL when interpreting your
                          next request.
                        </p>
                        <pre
                          className="max-h-48 overflow-auto rounded-md bg-slate-900 p-3 text-xs font-mono text-slate-100"
                          dangerouslySetInnerHTML={{
                            __html: formatSqlWithColors(previousSqlContext),
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSqlQuery(previousSqlContext);
                              clearSqlSuggestions();
                              requestAnimationFrame(() => {
                                if (sqlTextareaRef.current) {
                                  const position = previousSqlContext.length;
                                  sqlTextareaRef.current.selectionStart = position;
                                  sqlTextareaRef.current.selectionEnd = position;
                                }
                                updateSqlSuggestions(
                                  previousSqlContext,
                                  previousSqlContext.length
                                );
                              });
                            }}
                          >
                            Load into SQL editor
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearPreviousSqlContext}
                          >
                            Clear context
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  <Input
                    placeholder="Show me all funds with their current balances"
                    value={naturalLanguageQuery}
                    onChange={(e) => setNaturalLanguageQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        executeNaturalLanguageQuery();
                      }
                    }}
                  />
                  <Button
                    onClick={executeNaturalLanguageQuery}
                    disabled={executingNl || !naturalLanguageQuery.trim()}
                    className="w-full"
                  >
                    {executingNl ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Convert & Execute
                      </>
                    )}
                  </Button>

                  {/* Natural Language Query Results */}
                  {nlQueryResult && (
                    <div className="space-y-4">
                      {nlQueryResult.success ? (
                        <>
                          <Alert>
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertTitle>Success</AlertTitle>
                            <AlertDescription>
                              Query executed successfully. Returned{" "}
                              {nlQueryResult.row_count} row(s)
                              {nlQueryResult.execution_time_ms && (
                                <span className="ml-2 text-xs font-mono text-muted-foreground">
                                  ({nlQueryResult.execution_time_ms}ms)
                                </span>
                              )}
                            </AlertDescription>
                          </Alert>

                          {nlQueryResult.explanation && (
                            <div className="p-3 bg-muted rounded-lg">
                              <p className="text-sm font-medium mb-1">
                                Explanation:
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {nlQueryResult.explanation}
                              </p>
                            </div>
                          )}

                          {nlQueryResult.sql_query && (
                            <div className="p-3 bg-slate-900 rounded-lg">
                              <p className="text-sm font-medium mb-2 text-slate-300">
                                Generated SQL:
                              </p>
                              <pre
                                className="text-xs font-mono whitespace-pre-wrap break-words text-slate-200"
                                dangerouslySetInnerHTML={{
                                  __html: formatSqlWithColors(
                                    nlQueryResult.sql_query
                                  ),
                                }}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription className="font-mono text-xs">
                            {nlQueryResult.error}
                          </AlertDescription>
                        </Alert>
                      )}

                      {nlQueryResult.data && nlQueryResult.data.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2">Results:</h3>
                          {renderTable(nlQueryResult.data)}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="space-y-4">
              {loadingPerformance ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </CardContent>
                </Card>
              ) : !performanceMetrics ? (
                <Card>
                  <CardContent className="py-12">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        Failed to load performance metrics. Make sure the server
                        is running.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Connections
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {performanceMetrics.connections.active}
                          <span className="text-sm text-muted-foreground font-normal">
                            {" "}
                            / {performanceMetrics.connections.total}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {performanceMetrics.connections.idle} idle,{" "}
                          {performanceMetrics.connections.idle_in_transaction}{" "}
                          idle in txn
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Max: {performanceMetrics.connections.max_connections}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Cache Hit Ratio
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {performanceMetrics.cache_stats.cache_hit_ratio.toFixed(
                            1
                          )}
                          %
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {performanceMetrics.cache_stats.heap_hit.toLocaleString()}{" "}
                          hits
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {performanceMetrics.cache_stats.heap_read.toLocaleString()}{" "}
                          disk reads
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <HardDrive className="h-4 w-4" />
                          Database Size
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {performanceMetrics.database_size.size_pretty}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          WAL: {performanceMetrics.database_size.max_wal_size}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Buffers:{" "}
                          {performanceMetrics.database_size.shared_buffers}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Table Statistics */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Table Statistics</CardTitle>
                          <CardDescription>Top tables by size</CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchPerformanceMetrics}
                        >
                          <Activity className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-auto max-h-96 border rounded-md">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium">
                                Table
                              </th>
                              <th className="px-4 py-2 text-left font-medium">
                                Size
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                Rows
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                Dead Rows
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                Seq Scans
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                Index Scans
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceMetrics.table_stats.map(
                              (table, idx) => (
                                <tr
                                  key={idx}
                                  className="border-t hover:bg-muted/50"
                                >
                                  <td className="px-4 py-2 font-mono text-xs">
                                    {table.table_name}
                                  </td>
                                  <td className="px-4 py-2">{table.size}</td>
                                  <td className="px-4 py-2 text-right">
                                    {table.row_count.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span
                                      className={
                                        table.dead_rows > table.row_count * 0.1
                                          ? "text-orange-500"
                                          : ""
                                      }
                                    >
                                      {table.dead_rows.toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {table.seq_scans.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {table.index_scans.toLocaleString()}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Index Usage */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Index Usage</CardTitle>
                      <CardDescription>
                        Least used indexes (potential optimization targets)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-auto max-h-64 border rounded-md">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium">
                                Table
                              </th>
                              <th className="px-4 py-2 text-left font-medium">
                                Index
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                Scans
                              </th>
                              <th className="px-4 py-2 text-left font-medium">
                                Size
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceMetrics.index_usage.map(
                              (index, idx) => (
                                <tr
                                  key={idx}
                                  className="border-t hover:bg-muted/50"
                                >
                                  <td className="px-4 py-2 font-mono text-xs">
                                    {index.table_name}
                                  </td>
                                  <td className="px-4 py-2 font-mono text-xs">
                                    {index.index_name}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span
                                      className={
                                        index.scans === 0
                                          ? "text-red-500"
                                          : index.scans < 10
                                          ? "text-orange-500"
                                          : ""
                                      }
                                    >
                                      {index.scans}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">{index.size}</td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Active Queries */}
                  {performanceMetrics.active_queries.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Active Queries</CardTitle>
                        <CardDescription>
                          Currently running queries
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {performanceMetrics.active_queries.map(
                            (query, idx) => (
                              <div
                                key={idx}
                                className="border rounded-lg p-3 text-sm"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-4">
                                    <span className="font-mono text-xs text-muted-foreground">
                                      PID: {query.pid}
                                    </span>
                                    <span className="text-xs">
                                      {query.user}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {query.application}
                                    </span>
                                  </div>
                                  <span className="text-xs font-medium">
                                    {query.duration_seconds.toFixed(2)}s
                                  </span>
                                </div>
                                <pre className="font-mono text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
                                  {query.query_preview}
                                </pre>
                              </div>
                            )
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Query Statistics */}
                  {performanceMetrics.query_statistics && (
                    <>
                      {/* Slow Queries */}
                      {performanceMetrics.query_statistics.slow_queries.length >
                        0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Slow Queries</CardTitle>
                            <CardDescription>
                              Queries with mean execution time &gt; 100ms
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-auto max-h-96 border rounded-md">
                              <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">
                                      Query Preview
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Calls
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Mean (ms)
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Max (ms)
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Total (ms)
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      % Time
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Cache Hit %
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {performanceMetrics.query_statistics.slow_queries.map(
                                    (query, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-t hover:bg-muted/50"
                                      >
                                        <td className="px-4 py-2">
                                          <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                            {query.query_preview}
                                          </pre>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.calls.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <span
                                            className={
                                              query.mean_exec_time_ms > 1000
                                                ? "text-red-500 font-medium"
                                                : query.mean_exec_time_ms > 500
                                                ? "text-orange-500"
                                                : ""
                                            }
                                          >
                                            {query.mean_exec_time_ms.toFixed(2)}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.max_exec_time_ms.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.total_exec_time_ms.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.pct_total_time.toFixed(2)}%
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <span
                                            className={
                                              query.cache_hit_ratio < 90
                                                ? "text-orange-500"
                                                : ""
                                            }
                                          >
                                            {query.cache_hit_ratio.toFixed(1)}%
                                          </span>
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Top Queries by Time */}
                      {performanceMetrics.query_statistics.top_queries_by_time
                        .length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Top Queries by Total Time</CardTitle>
                            <CardDescription>
                              Queries consuming the most total execution time
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-auto max-h-96 border rounded-md">
                              <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">
                                      Query Preview
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Calls
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Mean (ms)
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Total (ms)
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      % Time
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {performanceMetrics.query_statistics.top_queries_by_time.map(
                                    (query, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-t hover:bg-muted/50"
                                      >
                                        <td className="px-4 py-2">
                                          <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                            {query.query_preview}
                                          </pre>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.calls.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.mean_exec_time_ms.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.total_exec_time_ms.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.pct_total_time.toFixed(2)}%
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Top Queries by Calls */}
                      {performanceMetrics.query_statistics.top_queries_by_calls
                        .length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Top Queries by Calls</CardTitle>
                            <CardDescription>
                              Most frequently executed queries
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-auto max-h-96 border rounded-md">
                              <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">
                                      Query Preview
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Calls
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Mean (ms)
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Total (ms)
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {performanceMetrics.query_statistics.top_queries_by_calls.map(
                                    (query, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-t hover:bg-muted/50"
                                      >
                                        <td className="px-4 py-2">
                                          <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                            {query.query_preview}
                                          </pre>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.calls.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.mean_exec_time_ms.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {query.total_exec_time_ms.toLocaleString()}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Unused Indexes */}
                      {performanceMetrics.query_statistics.unused_indexes
                        .length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Unused Indexes</CardTitle>
                            <CardDescription>
                              Indexes that have never been scanned (potential
                              candidates for removal)
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-auto max-h-64 border rounded-md">
                              <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">
                                      Table
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium">
                                      Index
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium">
                                      Scans
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium">
                                      Size
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {performanceMetrics.query_statistics.unused_indexes.map(
                                    (index, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-t hover:bg-muted/50"
                                      >
                                        <td className="px-4 py-2 font-mono text-xs">
                                          {index.table_name}
                                        </td>
                                        <td className="px-4 py-2 font-mono text-xs">
                                          {index.index_name}
                                        </td>
                                        <td className="px-4 py-2 text-right text-red-500">
                                          {index.scans}
                                        </td>
                                        <td className="px-4 py-2">
                                          {index.size}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}

                  {/* Query Statistics Not Available */}
                  {performanceMetrics.query_statistics === null && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Query Statistics</CardTitle>
                        <CardDescription>
                          Query statistics are not available
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>
                            pg_stat_statements Not Enabled
                          </AlertTitle>
                          <AlertDescription>
                            Query statistics require the pg_stat_statements
                            extension to be enabled. Run migration 040 to enable
                            it.
                          </AlertDescription>
                        </Alert>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
