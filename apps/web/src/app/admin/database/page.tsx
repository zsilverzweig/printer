"use client";

import {
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  Play,
  Table as TableIcon,
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
}

export default function DatabaseAdminPage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [sqlQuery, setSqlQuery] = useState("");
  const [naturalLanguageQuery, setNaturalLanguageQuery] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [nlQueryResult, setNlQueryResult] = useState<QueryResult | null>(null);
  const [executingSql, setExecutingSql] = useState(false);
  const [executingNl, setExecutingNl] = useState(false);

  // Fetch database schema on mount
  useEffect(() => {
    fetchSchema();
  }, []);

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

  const executeSqlQuery = async () => {
    if (!sqlQuery.trim()) return;

    try {
      setExecutingSql(true);
      setQueryResult(null);

      const response = await fetch("http://localhost:8000/api/db-admin/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sqlQuery }),
      });

      const data = await response.json();
      setQueryResult(data);
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
      setNlQueryResult(data);
    } catch (error) {
      setNlQueryResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setExecutingNl(false);
    }
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
          <Tabs defaultValue="sql" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
              <TabsTrigger value="natural">Natural Language</TabsTrigger>
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
                            {queryResult.row_count} row(s).
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
                              {nlQueryResult.row_count} row(s).
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
                            <div className="p-3 bg-muted rounded-lg">
                              <p className="text-sm font-medium mb-1">
                                Generated SQL:
                              </p>
                              <pre className="text-xs font-mono overflow-x-auto">
                                {nlQueryResult.sql_query}
                              </pre>
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
          </Tabs>
        </div>
      </div>
    </div>
  );
}
