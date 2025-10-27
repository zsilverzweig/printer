/**
 * WebSocket Connection Diagnostics
 * 
 * Helper utilities to diagnose WebSocket connection issues
 */

export interface DiagnosticResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: unknown;
}

/**
 * Run comprehensive WebSocket diagnostics
 */
export async function runWebSocketDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Check 1: Environment variable
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  results.push({
    check: 'WebSocket URL Configuration',
    status: wsUrl ? 'pass' : 'fail',
    message: wsUrl 
      ? `Configured: ${wsUrl}` 
      : 'NEXT_PUBLIC_WS_URL not set, using default ws://localhost:8000',
    details: { wsUrl: wsUrl || 'ws://localhost:8000 (default)' }
  });
  
  // Check 2: Test HTTP connection to server
  const baseUrl = (wsUrl || 'ws://localhost:8000')
    .replace('ws://', 'http://')
    .replace('wss://', 'https://');
  
  try {
    const response = await fetch(`${baseUrl}/docs`, { method: 'HEAD' });
    results.push({
      check: 'Server HTTP Reachability',
      status: response.ok ? 'pass' : 'warn',
      message: response.ok 
        ? 'Server is reachable via HTTP' 
        : `Server returned ${response.status}`,
      details: { status: response.status, url: `${baseUrl}/docs` }
    });
  } catch (error) {
    results.push({
      check: 'Server HTTP Reachability',
      status: 'fail',
      message: 'Cannot reach server via HTTP',
      details: { 
        error: error instanceof Error ? error.message : String(error),
        url: `${baseUrl}/docs` 
      }
    });
  }
  
  // Check 3: Test WebSocket connection
  const wsTestUrl = `${wsUrl || 'ws://localhost:8000'}/realtime`;
  try {
    const ws = new WebSocket(wsTestUrl);
    
    const connectionTest = await new Promise<DiagnosticResult>((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve({
          check: 'WebSocket Connection Test',
          status: 'fail',
          message: 'Connection timeout after 5 seconds',
          details: { url: wsTestUrl }
        });
      }, 5000);
      
      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve({
          check: 'WebSocket Connection Test',
          status: 'pass',
          message: 'WebSocket connection successful',
          details: { url: wsTestUrl }
        });
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeout);
        resolve({
          check: 'WebSocket Connection Test',
          status: 'fail',
          message: 'WebSocket connection failed',
          details: { error, url: wsTestUrl }
        });
      };
    });
    
    results.push(connectionTest);
  } catch (error) {
    results.push({
      check: 'WebSocket Connection Test',
      status: 'fail',
      message: 'Failed to create WebSocket',
      details: { 
        error: error instanceof Error ? error.message : String(error),
        url: wsTestUrl 
      }
    });
  }
  
  // Check 4: Browser WebSocket support
  results.push({
    check: 'Browser WebSocket Support',
    status: typeof WebSocket !== 'undefined' ? 'pass' : 'fail',
    message: typeof WebSocket !== 'undefined'
      ? 'WebSocket API is available'
      : 'WebSocket API not supported in this browser',
    details: { 
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
    }
  });
  
  return results;
}

/**
 * Print diagnostic results to console
 */
export function printDiagnostics(results: DiagnosticResult[]): void {
  console.log('%c=== WebSocket Diagnostics ===', 'font-weight: bold; font-size: 16px');
  
  results.forEach((result) => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    const color = result.status === 'pass' ? 'green' : result.status === 'fail' ? 'red' : 'orange';
    
    console.log(
      `%c${icon} ${result.check}`,
      `color: ${color}; font-weight: bold`
    );
    console.log(`   ${result.message}`);
    
    if (result.details) {
      console.log('   Details:', result.details);
    }
  });
  
  console.log('%c=============================', 'font-weight: bold');
}

/**
 * Run diagnostics and print results
 */
export async function diagnoseWebSocketConnection(): Promise<void> {
  console.log('%cRunning WebSocket diagnostics...', 'color: blue; font-weight: bold');
  const results = await runWebSocketDiagnostics();
  printDiagnostics(results);
  
  const failedChecks = results.filter(r => r.status === 'fail');
  if (failedChecks.length > 0) {
    console.log(
      `%c⚠️ ${failedChecks.length} check(s) failed. See details above.`,
      'color: red; font-weight: bold; font-size: 14px'
    );
  } else {
    console.log(
      '%c✅ All checks passed!',
      'color: green; font-weight: bold; font-size: 14px'
    );
  }
}

/**
 * Expose diagnostics to browser console for easy access
 */
if (typeof window !== 'undefined') {
  (window as Window & { diagnoseWebSocket?: () => Promise<void> }).diagnoseWebSocket = diagnoseWebSocketConnection;
}

