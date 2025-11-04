#!/usr/bin/env python3
"""
Convert pytest output to problem matcher format for VS Code / IDE integration.

This script runs pytest and outputs results in a format that can be parsed
by IDE problem matchers to show test failures in the Problems panel.

Usage:
    python scripts/pytest_to_problems.py [pytest args]
    
    # Run all tests
    python scripts/pytest_to_problems.py
    
    # Run specific tests
    python scripts/pytest_to_problems.py tests/test_funds.py -k test_balance
"""

import sys
import subprocess
import re
import json
from pathlib import Path


def parse_pytest_output(output: str) -> list[dict]:
    """
    Parse pytest output and extract failures.
    
    Returns list of problem objects compatible with VS Code problem matcher.
    """
    problems = []
    
    # Pattern for pytest failure headers: FAILED tests/test_file.py::test_name - AssertionError: message
    failure_pattern = re.compile(
        r'^FAILED\s+(.+?)::(.+?)\s*-\s*(.+?)$',
        re.MULTILINE
    )
    
    # Pattern for file location: tests/test_file.py:123: in test_name
    location_pattern = re.compile(
        r'^\s*(.+?):(\d+):\s+in\s+(.+?)$',
        re.MULTILINE
    )
    
    # Pattern for assertion errors: E   AssertionError: message
    assertion_pattern = re.compile(
        r'^E\s+(.+?)$',
        re.MULTILINE
    )
    
    # Find all failures
    for match in failure_pattern.finditer(output):
        file_path = match.group(1)
        test_name = match.group(2)
        error_type = match.group(3)
        
        # Try to find line number from traceback
        line_num = 1
        message = error_type
        
        # Look for location info after this failure
        rest_of_output = output[match.end():]
        location_match = location_pattern.search(rest_of_output)
        if location_match:
            line_num = int(location_match.group(2))
        
        # Look for assertion message
        assertion_match = assertion_pattern.search(rest_of_output)
        if assertion_match:
            message = assertion_match.group(1).strip()
        
        problems.append({
            "file": file_path,
            "line": line_num,
            "column": 1,
            "severity": "error",
            "message": f"Test '{test_name}' failed: {message}",
            "source": "pytest"
        })
    
    return problems


def output_problems_json(problems: list[dict]):
    """Output problems in JSON format for easy parsing."""
    print(json.dumps(problems, indent=2))


def output_problems_text(problems: list[dict]):
    """Output problems in text format for console."""
    if not problems:
        print("✅ All tests passed!")
        return
    
    print(f"\n❌ {len(problems)} test(s) failed:\n")
    for p in problems:
        print(f"{p['file']}:{p['line']}: {p['message']}")


def output_problems_vscode(problems: list[dict]):
    """Output problems in VS Code problem matcher format."""
    for p in problems:
        # Format: file(line,col): severity: message
        print(f"{p['file']}({p['line']},{p['column']}): {p['severity']}: {p['message']}")


def main():
    """Run pytest and output problems."""
    # Get pytest args (everything after script name)
    pytest_args = sys.argv[1:] if len(sys.argv) > 1 else []
    
    # Add flags for better output parsing
    pytest_cmd = [
        "pytest",
        "-v",           # Verbose
        "--tb=short",   # Short traceback
        "--no-header",  # No header for cleaner output
        *pytest_args
    ]
    
    # Run pytest and capture output
    result = subprocess.run(
        pytest_cmd,
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent
    )
    
    # Combine stdout and stderr
    output = result.stdout + result.stderr
    
    # Parse problems
    problems = parse_pytest_output(output)
    
    # Determine output format from environment
    output_format = sys.env.get("PYTEST_PROBLEMS_FORMAT", "text")
    
    if output_format == "json":
        output_problems_json(problems)
    elif output_format == "vscode":
        output_problems_vscode(problems)
    else:
        output_problems_text(problems)
    
    # Exit with pytest's exit code
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()

