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
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { Textarea } from "@/lib/components/ui/textarea";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

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

  // Fetch database schema on mount
  useEffect(() => {
    fetchSchema();
  }, []);

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
    if (!sqlQuery.trim()) return;

    try {
      setExecutingSql(true);
      setQueryResult(null);

      const startTime = performance.now();
      const response = await fetch("http://localhost:8000/api/db-admin/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sqlQuery }),
      });

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      setQueryResult({
        ...data,
        execution_time_ms: data.execution_time_ms || executionTime,
      });
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
    if (!naturalLanguageQuery.trim()) return;

    try {
      setExecutingNl(true);
      setNlQueryResult(null);

      const startTime = performance.now();
      const response = await fetch(
        "http://localhost:8000/api/db-admin/nl-query",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ natural_language: naturalLanguageQuery }),
        }
      );

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      setNlQueryResult({
        ...data,
        execution_time_ms: data.execution_time_ms || executionTime,
      });
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
    const keywords = [
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
                    placeholder="SELECT * FROM table_name LIMIT 10"
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    className="font-mono text-sm min-h-32"
                  />
                  <Button
                    onClick={executeSqlQuery}
                    disabled={executingSql || !sqlQuery.trim()}
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
