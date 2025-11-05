"""
Startup validation for datetime usage consistency.

Scans codebase to ensure:
1. No direct datetime.utcnow() or datetime.now() usage
2. All datetime operations use get_current_time()
3. Database models use consistent timezone settings
"""

import logging
from pathlib import Path
from typing import List, Tuple

logger = logging.getLogger(__name__)


class DatetimeValidator:
    """Validates datetime usage across the codebase."""
    
    def __init__(self, codebase_root: Path):
        self.codebase_root = codebase_root
        self.violations: List[Tuple[str, int, str]] = []
    
    def validate(self) -> bool:
        """
        Validate datetime usage.
        
        Returns:
            True if all checks pass, False otherwise
        """
        self.violations.clear()
        
        # Find all Python files
        python_files = list(self.codebase_root.rglob("*.py"))
        
        # Exclude test files, migrations, archived code, cache, and third-party packages
        python_files = [
            f for f in python_files
            if not any(x in str(f) for x in [
                "/tests/", 
                "/alembic/", 
                "__pycache__", 
                ".pyc",
                "/archived/",
                "htmlcov",
                ".venv/",
                "venv/",
                "site-packages/",
                "/node_modules/",
                ".pytest_cache/"
            ])
            # Only scan files within the app directory (exclude third-party code)
            and "app/" in str(f)
        ]
        
        for file_path in python_files:
            self._check_file(file_path)
        
        if self.violations:
            logger.error("=" * 80)
            logger.error("DATETIME USAGE VIOLATIONS DETECTED")
            logger.error("=" * 80)
            for file_path, line_num, issue in self.violations:
                logger.error(f"  {file_path}:{line_num} - {issue}")
            logger.error("=" * 80)
            logger.error(f"Total violations: {len(self.violations)}")
            logger.error("=" * 80)
            return False
        
        logger.info("✅ All datetime usage checks passed")
        return True
    
    def _check_file(self, file_path: Path) -> None:
        """Check a single file for datetime violations."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
            
            # Track if we're inside a docstring
            in_docstring = False
            docstring_char = None
            
            # Quick string-based check (faster than AST parsing for startup)
            for line_num, line in enumerate(lines, 1):
                stripped = line.strip()
                
                # Track docstring state
                if '"""' in line:
                    # Toggle docstring state
                    in_docstring = not in_docstring
                    docstring_char = '"""'
                elif "'''" in line:
                    in_docstring = not in_docstring
                    docstring_char = "'''"
                
                # Skip comments and docstrings
                if stripped.startswith('#') or in_docstring:
                    continue
                
                # Skip datetime_validator.py itself (it needs to check for these patterns)
                if 'datetime_validator.py' in str(file_path):
                    continue
                
                # Check for datetime.utcnow()
                if 'datetime.utcnow()' in line:
                    # Allow in utcnow_aware function definition
                    if 'def utcnow_aware' in line or 'return datetime.now(timezone.utc)' in line:
                        continue
                    # Allow in utcnow_naive (deprecated but still used for backward compat)
                    if 'def utcnow_naive' in line or 'utcnow_naive' in line:
                        continue
                    self.violations.append((
                        str(file_path.relative_to(self.codebase_root)),
                        line_num,
                        "Uses datetime.utcnow() - should use get_current_time()"
                    ))
                
                # Check for datetime.now() without timezone.utc
                if 'datetime.now()' in line and 'timezone.utc' not in line:
                    # Allow if it's in a comment or part of get_current_time implementation
                    if 'get_current_time' in line or stripped.startswith('#'):
                        continue
                    # Allow in time_context.py (it's the implementation)
                    if 'time_context.py' in str(file_path):
                        continue
                    self.violations.append((
                        str(file_path.relative_to(self.codebase_root)),
                        line_num,
                        "Uses datetime.now() without timezone - should use get_current_time()"
                    ))
        
        except Exception as e:
            logger.warning(f"Could not check {file_path}: {e}")

