"""A small stand-in for Python's sqlite3 module, for the browser version.

The Python that runs in the browser (Pyodide) ships sqlite3 as a separate download. This module
gives the app the part of the sqlite3 interface it uses, on top of SQLite's own WebAssembly build,
which the page loads as `lfzSql` (see api-worker.js). Each database lives in memory and is written
back to its file after every committed change; the file system the page mounts keeps it in the
browser's IndexedDB.

Transactions follow Python's default: a statement that changes data opens one, commit() or leaving
`with connection:` without an error ends it, and an error inside `with connection:` rolls it back.
"""

import json
import re

import js  # provided by Pyodide

sqlite_version = "3"
version = "shim"
PARSE_DECLTYPES = 1
PARSE_COLNAMES = 2


class Warning(Exception):  # noqa: A001 - the names sqlite3 uses
    pass


class Error(Exception):
    pass


class InterfaceError(Error):
    pass


class DatabaseError(Error):
    pass


class OperationalError(DatabaseError):
    pass


class IntegrityError(DatabaseError):
    pass


class ProgrammingError(DatabaseError):
    pass


class Row(tuple):
    """A result row that can be read by position or, ignoring case, by column name."""

    def __new__(cls, cursor, values):
        row = tuple.__new__(cls, values)
        row._names = cursor._names
        return row

    def keys(self):
        return list(self._names[0])

    def __getitem__(self, key):
        if isinstance(key, str):
            index = self._names[1].get(key.lower())
            if index is None:
                raise IndexError("No item with that key")
            return tuple.__getitem__(self, index)
        return tuple.__getitem__(self, key)


_CHANGES = re.compile(r"^\s*(?:--[^\n]*\n\s*)*(insert|update|delete|replace)\b", re.I)
_READS = re.compile(r"^\s*(?:--[^\n]*\n\s*)*(select|with|pragma|explain)\b", re.I)


def _error(e):
    text = str(e)
    m = re.search(r"SQLITE_(\w+)", text)
    cls = IntegrityError if m and m.group(1).startswith("CONSTRAINT") else OperationalError
    return cls(re.sub(r"^.*?Error:\s*", "", text))


class _Database:
    """One open database, shared by every connection to the same path."""

    def __init__(self, path):
        self.path = path
        self.handle = js.lfzSql.open(path)
        self.in_tx = False

    def run(self, sql, params):
        try:
            return json.loads(js.lfzSql.exec(self.handle, sql, json.dumps(list(params), default=str)))
        except Exception as e:  # a JavaScript exception from SQLite
            raise _error(e) from None

    def script(self, sql):
        try:
            js.lfzSql.script(self.handle, sql)
        except Exception as e:
            raise _error(e) from None

    def save(self):
        js.lfzSql.save(self.handle)


_OPEN = {}


def connect(database, timeout=5.0, detect_types=0, isolation_level="", check_same_thread=True, factory=None, cached_statements=128, uri=False):
    db = _OPEN.get(database)
    if db is None:
        db = _OPEN[database] = _Database(str(database))
    return Connection(db)


class Connection:
    def __init__(self, db):
        self._db = db
        self.row_factory = None
        self.isolation_level = ""
        self.total_changes = 0

    @property
    def in_transaction(self):
        return self._db.in_tx

    def cursor(self):
        return Cursor(self)

    def execute(self, sql, parameters=()):
        return Cursor(self).execute(sql, parameters)

    def executemany(self, sql, seq_of_parameters):
        return Cursor(self).executemany(sql, seq_of_parameters)

    def executescript(self, sql):
        self.commit()
        self._db.script(sql)
        self._db.save()
        return Cursor(self)

    def commit(self):
        if self._db.in_tx:
            self._db.run("COMMIT", ())
            self._db.in_tx = False
            self._db.save()

    def rollback(self):
        if self._db.in_tx:
            self._db.run("ROLLBACK", ())
            self._db.in_tx = False

    def close(self):
        self.commit()

    def __enter__(self):
        return self

    def __exit__(self, kind, value, tb):
        if kind is None:
            self.commit()
        else:
            self.rollback()
        return False


class Cursor:
    arraysize = 1

    def __init__(self, connection):
        self.connection = connection
        self._rows = []
        self._at = 0
        self._names = ([], {})
        self.lastrowid = None
        self.rowcount = -1
        self.description = None

    def execute(self, sql, parameters=()):
        db = self.connection._db
        if isinstance(parameters, dict):
            raise ProgrammingError("Named parameters are not supported here.")
        changes = bool(_CHANGES.match(sql))
        if changes and not db.in_tx:
            db.run("BEGIN", ())
            db.in_tx = True
        res = db.run(sql, parameters)
        cols = res.get("cols") or []
        self._names = (cols, {c.lower(): i for i, c in reversed(list(enumerate(cols)))})
        self.description = tuple((c, None, None, None, None, None, None) for c in cols) or None
        factory = self.connection.row_factory
        rows = [tuple(r) for r in res.get("rows") or []]
        self._rows = [factory(self, r) for r in rows] if factory else rows
        self._at = 0
        self.lastrowid = res.get("lastrowid")
        self.rowcount = res.get("changes", -1) if changes else -1
        if changes:
            self.connection.total_changes += max(0, self.rowcount)
        elif not db.in_tx and not _READS.match(sql):
            db.save()                                  # a schema change outside a transaction is already committed
        return self

    def executemany(self, sql, seq_of_parameters):
        total = 0
        for p in seq_of_parameters:
            self.execute(sql, p)
            total += max(0, self.rowcount)
        self.rowcount = total
        return self

    def fetchone(self):
        if self._at >= len(self._rows):
            return None
        row = self._rows[self._at]
        self._at += 1
        return row

    def fetchmany(self, size=None):
        size = size or self.arraysize
        out = self._rows[self._at:self._at + size]
        self._at += len(out)
        return out

    def fetchall(self):
        out = self._rows[self._at:]
        self._at = len(self._rows)
        return out

    def __iter__(self):
        return self

    def __next__(self):
        row = self.fetchone()
        if row is None:
            raise StopIteration
        return row

    def close(self):
        self._rows = []
