"""
Enhanced startup logger with color support and structured formatting.

Provides consistent, color-coded logging for the startup process.
"""

import os
import sys
from typing import Optional
from enum import Enum


class Status(Enum):
    """Startup status indicators."""
    OK = "OK"
    SKIP = "SKIP"
    FAIL = "FAIL"
    WARN = "WARN"


class Colors:
    """ANSI color codes for terminal output."""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    
    # Status colors
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"
    MAGENTA = "\033[35m"
    
    # Dim colors for less important text
    DIM = "\033[2m"
    GRAY = "\033[90m"


class StartupLogger:
    """Enhanced logger for startup process with color support."""
    
    def __init__(self, use_colors: bool = True):
        """
        Initialize startup logger.
        
        Args:
            use_colors: Whether to use ANSI color codes (default: True)
        """
        # Check environment variables for color control
        no_color_env = os.getenv("NO_COLOR", "").lower() in ("1", "true", "yes")
        force_color_env = os.getenv("FORCE_COLOR", "").lower() in ("1", "true", "yes")
        
        # Force colors if FORCE_COLOR is set, otherwise check TTY and NO_COLOR
        if force_color_env:
            self.use_colors = True
        elif no_color_env:
            self.use_colors = False
        else:
            self.use_colors = use_colors and sys.stderr.isatty()
        self.phase: Optional[str] = None
    
    def _colorize(self, text: str, color: str) -> str:
        """Apply color to text if colors are enabled."""
        if self.use_colors:
            return f"{color}{text}{Colors.RESET}"
        return text
    
    def _status_color(self, status: Status) -> str:
        """Get color code for status."""
        colors = {
            Status.OK: Colors.GREEN,
            Status.SKIP: Colors.YELLOW,
            Status.FAIL: Colors.RED,
            Status.WARN: Colors.YELLOW,
        }
        return colors.get(status, Colors.RESET)
    
    def print_banner(self) -> None:
        """Print ASCII art banner for PRINTER."""
        banner = """
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     ██████╗ ██████╗ ██╗███╗   ██╗████████╗███████╗██████╗    ║
║     ██╔══██╗██╔══██╗██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗   ║
║     ██████╔╝██████╔╝██║██╔██╗ ██║   ██║   █████╗  ██████╔╝   ║
║     ██╔═══╝ ██╔══██╗██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗   ║
║     ██║     ██║  ██║██║██║ ╚████║   ██║   ███████╗██║  ██║   ║
║     ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ║
║                                                               ║
║          AI-Powered Investment Research Engine                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
        """
        print(self._colorize(banner.strip(), Colors.CYAN), file=sys.stderr)
        print("", file=sys.stderr)
    
    def start_phase(self, phase_name: str) -> None:
        """Start a new startup phase."""
        self.phase = phase_name
        print(self._colorize(f"[STARTUP] Phase: {phase_name}", Colors.BOLD + Colors.CYAN), file=sys.stderr)
    
    def log_service(self, service_name: str, status: Status, details: Optional[str] = None) -> None:
        """
        Log a service initialization status.
        
        Args:
            service_name: Name of the service
            status: Status of the service
            details: Optional details to include
        """
        status_text = f"[{status.value}]"
        status_colored = self._colorize(status_text, self._status_color(status))
        
        message = f"[STARTUP]   {status_colored} {service_name}"
        if details:
            message += f" {self._colorize(f'({details})', Colors.DIM)}"
        
        print(message, file=sys.stderr)
    
    def log_error(self, service_name: str, error: Exception, details: Optional[str] = None) -> None:
        """
        Log a service initialization error (breaks out immediately).
        
        Args:
            service_name: Name of the service that failed
            error: The exception that occurred
            details: Optional additional details
        """
        error_msg = f"[STARTUP]   {self._colorize('[FAIL]', Colors.RED)} {service_name}"
        if details:
            error_msg += f" {self._colorize(f'({details})', Colors.DIM)}"
        
        print(error_msg, file=sys.stderr)
        print(self._colorize(f"[STARTUP]   ERROR: {str(error)}", Colors.RED), file=sys.stderr)
        
        # Print traceback if available
        import traceback
        traceback.print_exc()
    
    def log_summary(
        self,
        total_time: float,
        services_ok: int,
        services_skip: int,
        services_fail: int,
        health_status: str,
        active_funds: int,
        warnings: Optional[list] = None
    ) -> None:
        """
        Log startup summary.
        
        Args:
            total_time: Total startup time in seconds
            services_ok: Number of services that started successfully
            services_skip: Number of services skipped
            services_fail: Number of services that failed
            health_status: Health check status message
            active_funds: Number of active funds
            warnings: Optional list of warning messages
        """
        separator = "=" * 60
        print(self._colorize(f"[STARTUP] {separator}", Colors.BOLD + Colors.CYAN), file=sys.stderr)
        print(self._colorize(f"[STARTUP] Startup Complete ({total_time:.2f}s)", Colors.BOLD + Colors.GREEN), file=sys.stderr)
        
        # Build services status line - only show non-zero counts
        # If all OK (no skips, no failures), just say "All OK"
        if services_fail == 0 and services_skip == 0:
            print(f"[STARTUP] Services: {self._colorize('All OK', Colors.GREEN)}", file=sys.stderr)
        else:
            # Show only non-zero counts
            service_parts = []
            if services_ok > 0:
                service_parts.append(self._colorize(f"{services_ok} OK", Colors.GREEN))
            if services_skip > 0:
                service_parts.append(self._colorize(f"{services_skip} SKIP", Colors.YELLOW))
            if services_fail > 0:
                service_parts.append(self._colorize(f"{services_fail} FAIL", Colors.RED))
            print(f"[STARTUP] Services: {', '.join(service_parts)}", file=sys.stderr)
        
        print(f"[STARTUP] Health: {self._colorize(health_status, Colors.GREEN)}", file=sys.stderr)
        print(f"[STARTUP] Active Funds: {self._colorize(str(active_funds), Colors.CYAN)}", file=sys.stderr)
        
        if warnings:
            print(self._colorize(f"[STARTUP] Warnings: {len(warnings)}", Colors.YELLOW), file=sys.stderr)
            for warning in warnings:
                print(f"[STARTUP]   - {warning}", file=sys.stderr)
        
        print(self._colorize(f"[STARTUP] {separator}", Colors.BOLD + Colors.CYAN), file=sys.stderr)
        print("", file=sys.stderr)


# Global instance
_startup_logger: Optional[StartupLogger] = None


def get_startup_logger() -> StartupLogger:
    """Get the global startup logger instance."""
    global _startup_logger
    if _startup_logger is None:
        _startup_logger = StartupLogger()
    return _startup_logger


def reset_startup_logger() -> None:
    """Reset the startup logger (useful for testing)."""
    global _startup_logger
    _startup_logger = None

